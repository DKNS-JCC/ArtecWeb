const express = require('express');
const router = express.Router();

// Controllers & Middleware
const db = require('../database');
const authController = require('../controllers/authController');
const museumController = require('../controllers/museumController');
const { authMiddleware, adminMiddleware, superAdminMiddleware } = require('../middleware/authMiddleware');
const upload = require('../config/uploadConfig');
const rosService = require('../services/rosService'); // <-- RosService Service
const chatController = require('../controllers/chatController');
const mapController = require('../controllers/mapController');
const { visitorMiddleware } = require('../middleware/visitorMiddleware');
const mapUpload = require('../config/mapUploadConfig');
const rateLimit = require('express-rate-limit');

// Chat-specific rate limiter (stricter: 15 msgs/min)
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: { error: 'Demasiados mensajes. Espera un momento antes de enviar otro.' }
});

// ─── PUBLIC Auth Routes ────────────────────────────────────────
router.post('/auth/visitor', authController.createVisitor); // create visitor session
router.post('/auth/login', authController.login);         // username or email

// ─── PROTECTED Auth Routes (any logged-in user or visitor) ───────────────
router.post('/auth/visitor/ping', authMiddleware, authController.pingVisitor);
router.get('/auth/visitor/status', authMiddleware, authController.checkVisitorStatus);
router.post('/auth/visitor/end', authMiddleware, authController.endVisitor);
router.post('/auth/change-password', authMiddleware, authController.changePassword);
router.post('/auth/avatar', authMiddleware, upload.single('avatar'), authController.uploadAvatar);
router.delete('/auth/avatar', authMiddleware, authController.deleteAvatar);

// ─── VISITOR CHAT Route ───────────────────────────────────────
router.post('/chat/message', chatLimiter, authMiddleware, visitorMiddleware, chatController.handleMessage);

// ─── ADMIN-ONLY Routes ────────────────────────────────────────
// adminMiddleware allows both admin and superadmin
router.post('/admin/create-staff', authMiddleware, adminMiddleware, authController.createStaff);
router.get('/admin/users', authMiddleware, adminMiddleware, authController.listUsers);
router.patch('/admin/users/:id', authMiddleware, adminMiddleware, authController.updateStaff);
router.patch('/admin/users/:id/active', authMiddleware, adminMiddleware, authController.toggleStaffActive);
router.delete('/admin/users/:id', authMiddleware, adminMiddleware, authController.deleteStaff);

// ─── SUPERADMIN-ONLY Routes ───────────────────────────────────
router.post('/museums', authMiddleware, superAdminMiddleware, museumController.createMuseum);
router.get('/museums', authMiddleware, superAdminMiddleware, museumController.listMuseums);

// ─── MAP & PLACES Routes (admin only) ─────────────────────────
router.post('/robots/:robot_id/map', authMiddleware, adminMiddleware, mapUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'yaml', maxCount: 1 }]), mapController.uploadMap);
router.get('/robots/:robot_id/map', authMiddleware, adminMiddleware, mapController.getMap);
router.delete('/robots/:robot_id/map', authMiddleware, adminMiddleware, mapController.deleteMap);
router.get('/robots/:robot_id/places', authMiddleware, adminMiddleware, mapController.getPlaces);
router.post('/robots/:robot_id/places', authMiddleware, adminMiddleware, mapController.createPlace);
router.put('/robots/:robot_id/places/:id', authMiddleware, adminMiddleware, mapController.updatePlace);
router.delete('/robots/:robot_id/places/:id', authMiddleware, adminMiddleware, mapController.deletePlace);

// ─── API Info ─────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.json({
        message: 'Artec API',
        version: '2.0.0',
        endpoints: [
            'POST /api/auth/visitor',
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
router.post('/robots', authMiddleware, superAdminMiddleware, (req, res) => {
    const { name, museum_id } = req.body;
    if (!name || !museum_id) {
        return res.status(400).json({ error: 'Name and museum_id are required' });
    }
    const robotId = require('crypto').randomUUID();
    db.run(
        `INSERT INTO robots (id, name, museum_id) VALUES (?, ?, ?)`,
        [robotId, name, museum_id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Error creating robot' });
            res.status(201).json({ message: 'Robot created', id: robotId, name, museum_id, status: 'idle', battery: 100, position: {x:0, y:0, theta:0} });
        }
    );
});

router.get('/robots', authMiddleware, adminMiddleware, (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `
        SELECT r.*, v.name as visitor_name
        FROM robots r
        LEFT JOIN visitors v ON r.current_visitor_id = v.id
    `;
    let params = [];

    if (!isSuperAdmin) {
        query += ` WHERE r.museum_id = ?`;
        params.push(museumId);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error fetching robots' });

        const now = new Date();

        // Parse position (storing as flat fields but returning as object for frontend compatibility)
        const formattedRobots = rows.map(r => {
            const isLocked = r.locked_until && new Date(r.locked_until) > now;
            return {
                id: r.id,
                names: r.name, // Keep property mapping consistent with old frontend if needed, wait old frontend used 'name'
                name: r.name,
                ip: r.ip,
                connected: rosService.getConnectionState(r.id),
                status: r.status,
                battery: r.battery,
                position: { x: r.position_x, y: r.position_y, theta: r.position_theta },
                last_update: r.last_update,
                museum_id: r.museum_id,
                is_occupied: isLocked,
                locked_until: r.locked_until,
                visitor_name: isLocked ? (r.visitor_name || 'Visitante Anónimo') : null
            };
        });

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
            ip: robot.ip,
            connected: rosService.getConnectionState(robot.id),
            status: robot.status,
            battery: robot.battery,
            position: { x: robot.position_x, y: robot.position_y, theta: robot.position_theta },
            last_update: robot.last_update,
            museum_id: robot.museum_id
        };
        res.json(formattedRobot);
    });
});

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

router.put('/robots/:id', authMiddleware, adminMiddleware, (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;
    const robotId = req.params.id;
    const { ip, name } = req.body;

    if (ip !== undefined && ip !== '' && !IP_RE.test(ip)) {
        return res.status(400).json({ error: 'Invalid IP address format' });
    }

    let verifyQuery = `SELECT * FROM robots WHERE id = ?`;
    let verifyParams = [robotId];
    if (!isSuperAdmin) {
        verifyQuery += ` AND museum_id = ?`;
        verifyParams.push(museumId);
    }

    db.get(verifyQuery, verifyParams, (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        const updatedIp = ip !== undefined ? ip : robot.ip;
        const updatedName = name !== undefined ? name : robot.name;

        db.run(`UPDATE robots SET ip = ?, name = ? WHERE id = ?`, [updatedIp, updatedName, robotId], (err) => {
            if (err) return res.status(500).json({ error: 'Error updating robot' });
            
            // Reconnect if IP changed and it was already connected? Could disconnect it first.
            if (ip && ip !== robot.ip && rosService.getConnectionState(robotId)) {
                rosService.disconnect(robotId);
                rosService.connect(robotId, ip);
            }
            
            res.json({ message: 'Robot updated successfully' });
        });
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

        if (command === 'connect') {
            const ip = payload?.ip || robot.ip || '127.0.0.1';
            rosService.connect(robotId, ip);
            return res.json({ message: `ROS Connection initiated for ${robot.name} at ${ip}` });
        }

        if (command === 'disconnect') {
            rosService.disconnect(robotId);
            return res.json({ message: `ROS Connection closed for ${robot.name}` });
        }

        if (command === 'move' && payload) {
            status = 'moving';
            
            // Envío del comando ROS si el servicio está conectado
            try {
                const linearX = payload.linearX || 0.0;
                const angularZ = payload.angularZ || 0.0;
                rosService.move(robotId, linearX, angularZ);
            } catch (error) {
                console.error(`ROS Move error on robot ${robotId}:`, error.message);
            }

            if (payload.x !== undefined) px = payload.x;
            if (payload.y !== undefined) py = payload.y;
            if (payload.theta !== undefined) pt = payload.theta;
        } else if (command === 'stop') {
            status = 'idle';
            try {
                rosService.move(robotId, 0.0, 0.0);
            } catch (error) {
                 console.error(`ROS Stop error on robot ${robotId}:`, error.message);
            }
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

router.post('/robots/:id/force-end', authMiddleware, adminMiddleware, (req, res) => {
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

        if (!robot.current_visitor_id) {
            return res.json({ message: 'No active session to end' });
        }

        const visitorId = robot.current_visitor_id;

        // Libera el robot y marca el fin de la sesión del visitante en transaccional
        db.run('BEGIN IMMEDIATE', (beginErr) => {
            if (beginErr) return res.status(500).json({ error: 'Server error' });

            db.run('UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?', [robotId], (updErr) => {
                if (updErr) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Database error handling robot' }));

                db.run('UPDATE visitors SET ended_at = CURRENT_TIMESTAMP WHERE id = ?', [visitorId], (visErr) => {
                    if (visErr) console.error('Error updating visitor ended_at', visErr);

                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Server error' }));
                        res.json({ message: 'Visita finalizada exitosamente' });
                    });
                });
            });
        });
    });
});

// --- STATS ENDPOINT ---
router.get('/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    // We'll run a few queries in parallel
    const queries = {};
    const params = [];

    if (isSuperAdmin) {
        // Platform Admin stats
        queries.totalMuseums = `SELECT COUNT(*) as count FROM museums`;
        queries.totalRobots = `SELECT COUNT(*) as count FROM robots`;
        queries.totalVisitors = `SELECT COUNT(*) as count FROM visitors`;
        // Average session time for completed sessions
        queries.avgSessionTime = `
            SELECT AVG(
                (julianday(ended_at) - julianday(created_at)) * 24 * 60
            ) as avgMinutes 
            FROM visitors 
            WHERE ended_at IS NOT NULL
        `;
        queries.activeRobots = `SELECT COUNT(*) as count FROM robots WHERE status != 'idle'`;
    } else {
        // Museum Admin stats
        params.push(museumId);
        queries.totalRobots = `SELECT COUNT(*) as count FROM robots WHERE museum_id = ?`;
        queries.activeRobots = `SELECT COUNT(*) as count FROM robots WHERE museum_id = ? AND status != 'idle'`;
        
        // Visitors for robots in this museum
        queries.totalVisitors = `
            SELECT COUNT(v.id) as count 
            FROM visitors v
            JOIN robots r ON v.robot_id = r.id
            WHERE r.museum_id = ?
        `;
        
        queries.avgSessionTime = `
            SELECT AVG(
                (julianday(v.ended_at) - julianday(v.created_at)) * 24 * 60
            ) as avgMinutes 
            FROM visitors v
            JOIN robots r ON v.robot_id = r.id
            WHERE v.ended_at IS NOT NULL AND r.museum_id = ?
        `;
    }

    const results = {};
    let pending = Object.keys(queries).length;

    if (pending === 0) return res.json(results);

    Object.keys(queries).forEach(key => {
        // The first argument to db.get for each query needs an array of parameters.
        // For isSuperAdmin, no params are needed so we pass []. 
        // For museum admin, the query usually needs 'museumId'.
        const queryParams = isSuperAdmin ? [] : queries[key].includes('?') ? [museumId] : [];

        db.get(queries[key], queryParams, (err, row) => {
            if (err) {
                console.error(`Error querying ${key}:`, err);
                results[key] = 0;
            } else {
                // If it's a count query or single value
                results[key] = row.count !== undefined ? row.count : 
                               row.avgMinutes !== undefined ? Math.round(row.avgMinutes * 10) / 10 : 0;
            }

            pending--;
            if (pending === 0) {
                res.json(results);
            }
        });
    });
});

module.exports = router;
