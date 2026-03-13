const express = require('express');
const router = express.Router();

// Controllers & Middleware
const db = require('../database');
const authController = require('../controllers/authController');
const museumController = require('../controllers/museumController');
const { authMiddleware, adminMiddleware, superAdminMiddleware } = require('../middleware/authMiddleware');
const upload = require('../config/uploadConfig');

// ─── PUBLIC Auth Routes ────────────────────────────────────────
router.post('/auth/register', authController.register);   // only creates 'user' accounts
router.post('/auth/login', authController.login);         // username or email

// ─── PROTECTED Auth Routes (any logged-in user) ───────────────
router.post('/auth/change-password', authMiddleware, authController.changePassword);
router.post('/auth/avatar', authMiddleware, upload.single('avatar'), authController.uploadAvatar);
router.delete('/auth/avatar', authMiddleware, authController.deleteAvatar);

// ─── ADMIN-ONLY Routes ────────────────────────────────────────
// adminMiddleware allows both admin and superadmin
router.post('/admin/create-staff', authMiddleware, adminMiddleware, authController.createStaff);
router.get('/admin/users', authMiddleware, adminMiddleware, authController.listUsers);

// ─── SUPERADMIN-ONLY Routes ───────────────────────────────────
router.post('/museums', authMiddleware, superAdminMiddleware, museumController.createMuseum);
router.get('/museums', authMiddleware, superAdminMiddleware, museumController.listMuseums);

// ─── API Info ─────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.json({
        message: 'Artec API',
        version: '2.0.0',
        endpoints: [
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/auth/change-password (auth)',
            'POST /api/admin/create-staff (admin)',
            'GET  /api/admin/users (admin)',
            'GET  /api/robots (admin)',
            'POST /api/robots/:id/command (admin)',
        ]
    });
});

// ─── Robot Routes (admin only) ────────────────────────────────
router.get('/robots', authMiddleware, adminMiddleware, (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `SELECT * FROM robots`;
    let params = [];

    if (!isSuperAdmin) {
        query += ` WHERE museum_id = ?`;
        params.push(museumId);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error fetching robots' });

        // Parse position (storing as flat fields but returning as object for frontend compatibility)
        const formattedRobots = rows.map(r => ({
            id: r.id,
            names: r.name, // Keep property mapping consistent with old frontend if needed, wait old frontend used 'name'
            name: r.name,
            status: r.status,
            battery: r.battery,
            position: { x: r.position_x, y: r.position_y, theta: r.position_theta },
            last_update: r.last_update,
            museum_id: r.museum_id
        }));

        res.json(formattedRobots);
    });
});

router.get('/robots/:id', authMiddleware, adminMiddleware, (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;
    const robotId = req.params.id;

    let query = `SELECT * FROM robots WHERE id = ?`;
    let params = [robotId];

    if (!isSuperAdmin) {
        query += ` AND museum_id = ?`;
        params.push(museumId);
    }

    db.get(query, params, (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error fetching robot' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        const formattedRobot = {
            id: robot.id,
            name: robot.name,
            status: robot.status,
            battery: robot.battery,
            position: { x: robot.position_x, y: robot.position_y, theta: robot.position_theta },
            last_update: robot.last_update,
            museum_id: robot.museum_id
        };
        res.json(formattedRobot);
    });
});

router.post('/robots/:id/command', authMiddleware, adminMiddleware, (req, res) => {
    const { command, payload } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;
    const robotId = req.params.id;

    // Verify ownership first
    let verifyQuery = `SELECT * FROM robots WHERE id = ?`;
    let verifyParams = [robotId];
    if (!isSuperAdmin) {
        verifyQuery += ` AND museum_id = ?`;
        verifyParams.push(museumId);
    }

    db.get(verifyQuery, verifyParams, (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        let status = robot.status;
        let px = robot.position_x;
        let py = robot.position_y;
        let pt = robot.position_theta;

        if (command === 'move' && payload) {
            status = 'moving';
            if (payload.x !== undefined) px = payload.x;
            if (payload.y !== undefined) py = payload.y;
            if (payload.theta !== undefined) pt = payload.theta;
        } else if (command === 'stop') {
            status = 'idle';
        } else if (command === 'charge') {
            status = 'charging';
        } else {
            return res.status(400).json({ error: 'Unknown command' });
        }

        const updateQuery = `
            UPDATE robots 
            SET status = ?, position_x = ?, position_y = ?, position_theta = ?, last_update = CURRENT_TIMESTAMP 
            WHERE id = ?
        `;
        db.run(updateQuery, [status, px, py, pt, robotId], function (err) {
            if (err) return res.status(500).json({ error: 'Database error updating robot' });
            res.json({ message: `Command ${command} sent successfully` });
        });
    });
});

module.exports = router;
