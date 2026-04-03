const express = require('express');
const router = express.Router();

// Controllers & Middleware
const db = require('../database');
const authController = require('../controllers/authController');
const museumController = require('../controllers/museumController');
const { authMiddleware, adminMiddleware, superAdminMiddleware } = require('../middleware/authMiddleware');
const upload = require('../config/uploadConfig');
const rosService = require('../services/rosService');
const sseService = require('../services/sseService');
const chatController        = require('../controllers/chatController');
const chatHistoryController = require('../controllers/chatHistoryController');
const passwordResetController = require('../controllers/passwordResetController');
const mapController         = require('../controllers/mapController');
const { visitorMiddleware } = require('../middleware/visitorMiddleware');
const mapUpload = require('../config/mapUploadConfig');
const rateLimit = require('express-rate-limit');

// Chat-specific rate limiter (stricter: 15 msgs/min)
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: { error: 'Demasiados mensajes. Espera un momento antes de enviar otro.' }
});

// ─── SSE Robot Stream (must be declared BEFORE any rate limiter middleware) ───
// Long-lived text/event-stream connection. One connection per admin browser tab.
// EventSource cannot send custom headers, so the JWT is passed as ?token=...
// We validate it inline rather than using authMiddleware (which reads the header).
router.get('/robots/stream', (req, res) => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-artec-key';
    const token = req.query.token;

    if (!token) return res.status(401).json({ error: 'Token required' });

    let user;
    try {
        user = jwt.verify(token, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }

    if (user.role !== 'museum_admin' && user.role !== 'platform_admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    sseService.addClient(req, res, user);
});

// ─── PUBLIC Auth Routes ────────────────────────────────────────
router.post('/auth/visitor',         authController.createVisitor);
router.post('/auth/login',           authController.login);
router.post('/auth/forgot-password', passwordResetController.forgotPassword);
router.post('/auth/reset-password',  passwordResetController.resetPassword);

// ─── PROTECTED Auth Routes (any logged-in user or visitor) ───────────────
router.post('/auth/visitor/ping', authMiddleware, authController.pingVisitor);
router.get('/auth/visitor/status', authMiddleware, authController.checkVisitorStatus);
router.post('/auth/visitor/end', authMiddleware, authController.endVisitor);
router.post('/auth/change-password', authMiddleware, authController.changePassword);
router.post('/auth/avatar', authMiddleware, upload.single('avatar'), authController.uploadAvatar);
router.delete('/auth/avatar', authMiddleware, authController.deleteAvatar);

// ─── VISITOR CHAT Route ───────────────────────────────────────
router.post('/chat/message', chatLimiter, authMiddleware, visitorMiddleware, chatController.handleMessage);

// ─── CONFIRM NAVIGATION Route (visitor only) ─────────────────────────────────

/**
 * POST /api/chat/confirm-nav
 * Visitor explicitly confirms a navigate_to intent.
 * Fires the actual Nav2 goal via rosService and persists the confirmation in chat history.
 */
router.post('/chat/confirm-nav', chatLimiter, authMiddleware, async (req, res) => {
    // visitorMiddleware inline (avoids duplicating the import)
    const { visitorMiddleware } = require('../middleware/visitorMiddleware');
    visitorMiddleware(req, res, async () => {
        const crypto = require('crypto');
        const { place_id } = req.body;
        const { id: visitorId, session_id, robot_id } = req.user;

        if (!place_id) {
            return res.status(400).json({ error: 'place_id is required' });
        }

        // Load zone — coordinates are already stored as ROS world coords (meters)
        db.get(
            `SELECT z.id, z.name, z.map_x, z.map_y
             FROM zones z
             JOIN maps m   ON z.map_id = m.id
             JOIN robots r ON r.map_id = m.id
             WHERE z.id = ? AND r.id = ?`,
            [place_id, robot_id],
            (err, zone) => {
                if (err)   return res.status(500).json({ error: 'Database error' });
                if (!zone) return res.status(404).json({ error: 'Place not found or not accessible from this robot' });

                if (zone.map_x == null || zone.map_y == null) {
                    return res.status(422).json({
                        error: `"${zone.name}" no tiene coordenadas de navegación configuradas. Pide al administrador que las defina en el mapa.`
                    });
                }

                // Check ROS connection before firing the goal
                if (!rosService.getConnectionState(robot_id)) {
                    return res.status(503).json({
                        error: 'El robot no está conectado a ROS en este momento. Inténtalo de nuevo en un momento.'
                    });
                }

                try {
                    // Coordinates are stored in ROS world frame (meters) — send directly
                    rosService.sendNavGoal(robot_id, zone.map_x, zone.map_y, 0, 1);
                } catch (e) {
                    return res.status(503).json({ error: e.message });
                }

                // Update robot status in DB
                db.run(
                    `UPDATE robots SET status = 'navigating', last_update = CURRENT_TIMESTAMP WHERE id = ?`,
                    [robot_id]
                );

                // Persist robot confirmation message in chat history
                db.run(
                    `INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content, intent)
                     VALUES (?, ?, ?, ?, 'assistant', ?, 'navigate_to')`,
                    [
                        crypto.randomUUID(), visitorId, session_id, robot_id,
                        `¡En camino hacia ${zone.name}! Sígueme, por favor.`
                    ]
                );

                res.json({
                    message:    `Navigating to ${zone.name}`,
                    nav_message: `¡En camino hacia ${zone.name}! Sígueme, por favor.`,
                    place: { id: zone.id, name: zone.name, map_x: zone.map_x, map_y: zone.map_y }
                });
            }
        );
    });
});

// ─── VISITOR EXPERTISE Route ─────────────────────────────────────────────────
/**
 * PATCH /api/visitor/expertise
 * Update the expertise level of the current visitor (AI reads it from DB on each message).
 */
router.patch('/visitor/expertise', authMiddleware, (req, res) => {
    const { visitorMiddleware } = require('../middleware/visitorMiddleware');
    visitorMiddleware(req, res, () => {
        const { id: visitorId } = req.user;
        const { expertise_level } = req.body;
        const VALID = ['nino', 'general', 'estudiante', 'experto'];
        if (!VALID.includes(expertise_level)) {
            return res.status(400).json({ error: 'Nivel no válido' });
        }
        db.run(
            'UPDATE visitors SET expertise_level = ? WHERE id = ?',
            [expertise_level, visitorId],
            (err) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json({ expertise_level });
            }
        );
    });
});

// ─── VISITOR ROBOT POSITION Route ────────────────────────────────────────────
/**
 * GET /api/visitor/robot-position
 * Lightweight poll endpoint — returns only the robot's current position for the map overlay.
 */
router.get('/visitor/robot-position', authMiddleware, (req, res) => {
    const { visitorMiddleware } = require('../middleware/visitorMiddleware');
    visitorMiddleware(req, res, () => {
        const { robot_id } = req.user;
        db.get(
            'SELECT position_x, position_y, position_theta, last_update FROM robots WHERE id = ?',
            [robot_id],
            (err, row) => {
                if (err || !row) return res.status(500).json({ error: 'Database error' });
                res.json({
                    x:           row.position_x,
                    y:           row.position_y,
                    theta:       row.position_theta,
                    last_update: row.last_update,
                });
            }
        );
    });
});

// ─── VISITOR MAP Route ───────────────────────────────────────────────────────
/**
 * GET /api/visitor/map
 * Returns the map metadata and zones for the robot assigned to the current visitor.
 */
router.get('/visitor/map', authMiddleware, (req, res) => {
    const { visitorMiddleware } = require('../middleware/visitorMiddleware');
    visitorMiddleware(req, res, () => {
        const { robot_id } = req.user;
        db.get('SELECT map_id FROM robots WHERE id = ?', [robot_id], (err, robot) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!robot?.map_id) return res.status(404).json({ error: 'Este robot no tiene un mapa asignado.' });

            db.get('SELECT * FROM maps WHERE id = ?', [robot.map_id], (err, map) => {
                if (err || !map) return res.status(500).json({ error: 'Error al obtener el mapa' });

                db.all('SELECT * FROM zones WHERE map_id = ?', [robot.map_id], (err, zones) => {
                    if (err) return res.status(500).json({ error: 'Error al obtener las zonas' });
                    res.json({ map, zones: zones || [] });
                });
            });
        });
    });
});

// ─── CHAT HISTORY Routes (admin only) ────────────────────────
router.get('/chat-history/robots',                       authMiddleware, adminMiddleware, chatHistoryController.listRobotsForFilter);
router.get('/chat-history/sessions',                     authMiddleware, adminMiddleware, chatHistoryController.listSessions);
router.get('/chat-history/sessions/:session_id/messages', authMiddleware, adminMiddleware, chatHistoryController.getSessionMessages);

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

// ─── MAP Routes (admin only) ──────────────────────────────────
// Maps belong to museums; multiple robots can share a map
router.post('/museums/:museum_id/maps', authMiddleware, adminMiddleware, mapUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'yaml', maxCount: 1 }]), mapController.uploadMap);
router.get('/museums/:museum_id/maps', authMiddleware, adminMiddleware, mapController.listMaps);
router.get('/maps/:map_id', authMiddleware, adminMiddleware, mapController.getMap);
router.delete('/maps/:map_id', authMiddleware, adminMiddleware, mapController.deleteMap);

// ─── ZONE Routes (admin only) ─────────────────────────────────
// Zones belong to maps, not robots
router.get('/maps/:map_id/zones', authMiddleware, adminMiddleware, mapController.getZones);
router.post('/maps/:map_id/zones', authMiddleware, adminMiddleware, mapController.createZone);
router.put('/maps/:map_id/zones/:id', authMiddleware, adminMiddleware, mapController.updateZone);
router.delete('/maps/:map_id/zones/:id', authMiddleware, adminMiddleware, mapController.deleteZone);

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
                name: r.name,
                ip: r.ip,
                connected: rosService.getConnectionState(r.id),
                status: r.status,
                battery: r.battery,
                position: { x: r.position_x, y: r.position_y, theta: r.position_theta },
                last_update: r.last_update,
                museum_id: r.museum_id,
                map_id: r.map_id,
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
            museum_id: robot.museum_id,
            map_id: robot.map_id
        };
        res.json(formattedRobot);
    });
});

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

router.put('/robots/:id', authMiddleware, adminMiddleware, (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;
    const robotId = req.params.id;
    const { ip, name, map_id } = req.body;

    if (ip !== undefined && ip !== '' && !IP_RE.test(ip)) {
        return res.status(400).json({ error: 'Invalid IP address format' });
    }

    let verifyQuery = `SELECT * FROM robots WHERE id = ?`;
    let verifyParams = [robotId];
    if (!isSuperAdmin) {
        verifyQuery += ` AND museum_id = ?`;
        verifyParams.push(museumId);
    }

    db.get(verifyQuery, verifyParams, async (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        // If assigning a map, verify it belongs to the same museum
        if (map_id !== undefined && map_id !== null) {
            const mapRow = await new Promise(resolve => {
                db.get('SELECT museum_id FROM maps WHERE id = ?', [map_id], (e, row) => resolve(row || null));
            });
            if (!mapRow) return res.status(404).json({ error: 'Mapa no encontrado' });
            if (!isSuperAdmin && mapRow.museum_id !== museumId) {
                return res.status(403).json({ error: 'El mapa no pertenece a tu museo' });
            }
        }

        const updatedIp = ip !== undefined ? ip : robot.ip;
        const updatedName = name !== undefined ? name : robot.name;
        const updatedMapId = map_id !== undefined ? map_id : robot.map_id;

        db.run(`UPDATE robots SET ip = ?, name = ?, map_id = ? WHERE id = ?`, [updatedIp, updatedName, updatedMapId, robotId], (err) => {
            if (err) return res.status(500).json({ error: 'Error updating robot' });

            if (ip && ip !== robot.ip && rosService.getConnectionState(robotId)) {
                rosService.disconnect(robotId);
                rosService.connect(robotId, ip);
            }

            sseService.broadcastRobot(robotId);
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
            sseService.broadcastRobot(robotId);
            res.json({ message: `Command ${command} sent successfully` });
        });
    });
});

// ─── ROS Navigation / Sensor Routes ──────────────────────────────────────────

// POST /api/robots/:id/nav-goal  — send Nav2 goal pose
router.post('/robots/:id/nav-goal', authMiddleware, adminMiddleware, async (req, res) => {
    const { x, y, qz = 0, qw = 1 } = req.body;
    if (x === undefined || y === undefined) {
        return res.status(400).json({ error: 'x and y are required' });
    }

    const robotId = req.params.id;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `SELECT id FROM robots WHERE id = ?`;
    let params = [robotId];
    if (!isSuperAdmin) { query += ` AND museum_id = ?`; params.push(museumId); }

    db.get(query, params, (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        try {
            rosService.sendNavGoal(robotId, Number(x), Number(y), Number(qz), Number(qw));
            res.json({ message: 'Navigation goal sent', x, y, qz, qw });
        } catch (e) {
            res.status(503).json({ error: e.message });
        }
    });
});

// POST /api/robots/:id/cancel-nav  — cancel active navigation
router.post('/robots/:id/cancel-nav', authMiddleware, adminMiddleware, async (req, res) => {
    const robotId = req.params.id;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `SELECT id FROM robots WHERE id = ?`;
    let params = [robotId];
    if (!isSuperAdmin) { query += ` AND museum_id = ?`; params.push(museumId); }

    db.get(query, params, async (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        try {
            const result = await rosService.cancelNavigation(robotId);
            res.json({ message: 'Navigation cancelled', result });
        } catch (e) {
            res.status(503).json({ error: e.message });
        }
    });
});

// POST /api/robots/:id/initial-pose  — set AMCL initial pose
router.post('/robots/:id/initial-pose', authMiddleware, adminMiddleware, (req, res) => {
    const { x, y, qz = 0, qw = 1, covariance = null } = req.body;
    if (x === undefined || y === undefined) {
        return res.status(400).json({ error: 'x and y are required' });
    }

    const robotId = req.params.id;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `SELECT id FROM robots WHERE id = ?`;
    let params = [robotId];
    if (!isSuperAdmin) { query += ` AND museum_id = ?`; params.push(museumId); }

    db.get(query, params, (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        try {
            rosService.setInitialPose(robotId, Number(x), Number(y), Number(qz), Number(qw), covariance);
            res.json({ message: 'Initial pose set', x, y, qz, qw });
        } catch (e) {
            res.status(503).json({ error: e.message });
        }
    });
});

// GET /api/robots/:id/map  — get latest occupancy grid
router.get('/robots/:id/map', authMiddleware, adminMiddleware, (req, res) => {
    const robotId = req.params.id;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `SELECT id FROM robots WHERE id = ?`;
    let params = [robotId];
    if (!isSuperAdmin) { query += ` AND museum_id = ?`; params.push(museumId); }

    db.get(query, params, (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        const map = rosService.getMap(robotId);
        if (!map) return res.status(503).json({ error: 'Map not yet available. Is the robot connected?' });
        res.json(map);
    });
});

// GET /api/robots/:id/pose  — get latest AMCL pose
router.get('/robots/:id/pose', authMiddleware, adminMiddleware, (req, res) => {
    const robotId = req.params.id;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `SELECT id FROM robots WHERE id = ?`;
    let params = [robotId];
    if (!isSuperAdmin) { query += ` AND museum_id = ?`; params.push(museumId); }

    db.get(query, params, (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        const pose = rosService.getPose(robotId);
        if (!pose) return res.status(503).json({ error: 'Pose not yet available. Is the robot connected?' });
        res.json(pose);
    });
});

// GET /api/robots/:id/scan  — get latest laser scan
router.get('/robots/:id/scan', authMiddleware, adminMiddleware, (req, res) => {
    const robotId = req.params.id;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `SELECT id FROM robots WHERE id = ?`;
    let params = [robotId];
    if (!isSuperAdmin) { query += ` AND museum_id = ?`; params.push(museumId); }

    db.get(query, params, (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        const scan = rosService.getLatestScan(robotId);
        if (!scan) return res.status(503).json({ error: 'Scan not yet available. Is the robot connected?' });
        res.json(scan);
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
                        sseService.broadcastRobot(robotId);
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
