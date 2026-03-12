const express = require('express');
const router = express.Router();

// Mock Data for ROS2 Robots
let robots = [
    {
        id: 'rob_001',
        name: 'Wally',
        status: 'idle',
        battery: 89,
        position: { x: 0.5, y: -1.2, theta: 0.0 },
        last_update: new Date().toISOString()
    },
    {
        id: 'rob_002',
        name: 'Eve',
        status: 'moving',
        battery: 45,
        position: { x: 5.2, y: 3.4, theta: 1.57 },
        last_update: new Date().toISOString()
    }
];

// Controllers & Middleware
const authController = require('../controllers/authController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const upload = require('../config/uploadConfig');

// ─── PUBLIC Auth Routes ────────────────────────────────────────
router.post('/auth/register', authController.register);   // only creates 'user' accounts
router.post('/auth/login', authController.login);         // username or email

// ─── PROTECTED Auth Routes (any logged-in user) ───────────────
router.post('/auth/change-password', authMiddleware, authController.changePassword);
router.post('/auth/avatar', authMiddleware, upload.single('avatar'), authController.uploadAvatar);
router.delete('/auth/avatar', authMiddleware, authController.deleteAvatar);

// ─── ADMIN-ONLY Routes ────────────────────────────────────────
router.post('/admin/create-staff', authMiddleware, adminMiddleware, authController.createStaff);
router.get('/admin/users', authMiddleware, adminMiddleware, authController.listUsers);

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
    res.json(robots);
});

router.get('/robots/:id', authMiddleware, adminMiddleware, (req, res) => {
    const robot = robots.find(r => r.id === req.params.id);
    if (!robot) return res.status(404).json({ error: 'Robot not found' });
    res.json(robot);
});

router.post('/robots/:id/command', authMiddleware, adminMiddleware, (req, res) => {
    const { command, payload } = req.body;
    const robotIndex = robots.findIndex(r => r.id === req.params.id);

    if (robotIndex === -1) return res.status(404).json({ error: 'Robot not found' });

    if (command === 'move' && payload) {
        robots[robotIndex].status = 'moving';
        robots[robotIndex].position = { ...robots[robotIndex].position, ...payload };
        robots[robotIndex].last_update = new Date().toISOString();
        return res.json({ message: 'Command move sent', robot: robots[robotIndex] });
    }
    if (command === 'stop') {
        robots[robotIndex].status = 'idle';
        robots[robotIndex].last_update = new Date().toISOString();
        return res.json({ message: 'Command stop sent', robot: robots[robotIndex] });
    }
    if (command === 'charge') {
        robots[robotIndex].status = 'charging';
        robots[robotIndex].last_update = new Date().toISOString();
        return res.json({ message: 'Command charge sent', robot: robots[robotIndex] });
    }

    res.status(400).json({ error: 'Unknown command' });
});

module.exports = router;
