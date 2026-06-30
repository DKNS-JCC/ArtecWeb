const express = require('express');
const router = express.Router();

const db = require('../database');
const authController = require('../controllers/authController');
const museumController = require('../controllers/museumController');
const { authMiddleware, adminMiddleware, superAdminMiddleware, staffMiddleware } = require('../middleware/authMiddleware');
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
const navService = require('../services/navService');
const { findNearestZone, BASE_CATEGORY } = require('../utils/geo');

// Chat-specific rate limiter (stricter: 15 msgs/min)
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: { error: 'Demasiados mensajes. Espera un momento antes de enviar otro.' }
});

// Speech-to-text limiter - local Whisper inference is CPU-heavy, so cap it
// tighter than text chat (20 clips/min per IP).
const sttLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Demasiadas grabaciones. Espera un momento antes de volver a hablar.' }
});

const audioUpload = require('../config/audioUploadConfig');

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

    if (!['technician', 'museum_admin', 'platform_admin'].includes(user.role)) {
        return res.status(403).json({ error: 'Staff access required' });
    }

    sseService.addClient(req, res, user);
});

router.get('/robots/position-stream', (req, res) => {
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

    if (user.role !== 'visitor' || !user.robot_id) {
        return res.status(403).json({ error: 'Visitor access required' });
    }

    // Confirm the visitor still owns this robot session before streaming.
    db.get(
        'SELECT id FROM robots WHERE id = ? AND current_visitor_id = ?',
        [user.robot_id, user.id],
        (err, robot) => {
            if (err)    return res.status(500).json({ error: 'Database error' });
            if (!robot) return res.status(403).json({ error: 'Session expired or robot reassigned' });
            sseService.addPositionClient(req, res, user.robot_id);
        }
    );
});

/**
 * GET /api/robots/:id/availability
 * Checked by the scan screen BEFORE prompting the visitor, so an offline or
 * occupied robot is reported up-front instead of failing later on navigation.
 * Path is under /robots → skipped by the global rate limiter.
 */
router.get('/robots/:id/availability', (req, res) => {
    db.get('SELECT id, name, ip, locked_until FROM robots WHERE id = ?', [req.params.id], async (err, robot) => {
        if (err)    return res.status(500).json({ error: 'Error verificando el robot' });
        if (!robot) return res.status(404).json({ available: false, error: 'Robot no válido o no encontrado' });

        const occupied = !!(robot.locked_until && new Date(robot.locked_until) > new Date());

        let online = rosService.getConnectionState(robot.id);
        if (!online && robot.ip) {
            await rosService.connect(robot.id, robot.ip);
            online = await rosService.waitForConnection(robot.id);
        }

        res.json({
            available:  online && !occupied,
            online,
            occupied,
            robot_name: robot.name,
        });
    });
});

router.post('/auth/visitor',         authController.createVisitor);
router.post('/auth/login',           authController.login);
router.post('/auth/forgot-password', passwordResetController.forgotPassword);
router.post('/auth/reset-password',  passwordResetController.resetPassword);

router.post('/auth/visitor/ping', authMiddleware, authController.pingVisitor);
router.get('/auth/visitor/status', authMiddleware, authController.checkVisitorStatus);
router.post('/auth/visitor/end', authMiddleware, authController.endVisitor);
router.post('/auth/change-password', authMiddleware, authController.changePassword);
router.post('/auth/avatar', authMiddleware, upload.single('avatar'), authController.uploadAvatar);
router.delete('/auth/avatar', authMiddleware, authController.deleteAvatar);

router.post('/chat/message', chatLimiter, authMiddleware, visitorMiddleware, chatController.handleMessage);

// Accepts a 16 kHz mono WAV clip, returns the recognised text.
router.post('/chat/stt', sttLimiter, authMiddleware, visitorMiddleware, audioUpload.single('audio'), chatController.handleTranscribe);


/**
 * POST /api/chat/confirm-nav
 * Visitor explicitly confirms a navigate_to intent.
 * Fires the actual Nav2 goal via rosService and persists the confirmation in chat history.
 */
router.post('/chat/confirm-nav', chatLimiter, authMiddleware, async (req, res) => {
    const { visitorMiddleware } = require('../middleware/visitorMiddleware');
    visitorMiddleware(req, res, async () => {
        const crypto = require('crypto');
        const { place_id } = req.body;
        const { id: visitorId, session_id, robot_id } = req.user;

        if (!place_id) {
            return res.status(400).json({ error: 'place_id is required' });
        }

        // Load zone - coordinates are already stored as ROS world coords (meters)
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

                if (!rosService.getConnectionState(robot_id)) {
                    return res.status(503).json({
                        error: 'El robot no está conectado a ROS en este momento. Inténtalo de nuevo en un momento.'
                    });
                }

                try {
                    rosService.sendNavGoal(robot_id, zone.map_x, zone.map_y, 0, 1, {
                        kind:      'visit',
                        placeName: zone.name,
                        placeId:   zone.id,
                        visitorId,
                        sessionId: session_id,
                        museumId:  req.user.museum_id,
                    });
                } catch (e) {
                    return res.status(503).json({ error: e.message });
                }

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

                // Exclude the internal base point - it's opaque to visitors.
                db.all('SELECT * FROM zones WHERE map_id = ? AND category != ?', [robot.map_id, BASE_CATEGORY], (err, zones) => {
                    if (err) return res.status(500).json({ error: 'Error al obtener las zonas' });
                    res.json({ map, zones: zones || [] });
                });
            });
        });
    });
});

router.get   ('/chat-history/robots',                        authMiddleware, adminMiddleware, chatHistoryController.listRobotsForFilter);
router.get   ('/chat-history/sessions',                      authMiddleware, adminMiddleware, chatHistoryController.listSessions);
router.get   ('/chat-history/sessions/:session_id/messages', authMiddleware, adminMiddleware, chatHistoryController.getSessionMessages);
router.delete('/chat-history/sessions/:session_id',          authMiddleware, adminMiddleware, chatHistoryController.deleteSession);

router.post('/admin/create-staff', authMiddleware, adminMiddleware, authController.createStaff);
router.get('/admin/users', authMiddleware, adminMiddleware, authController.listUsers);
router.patch('/admin/users/:id', authMiddleware, adminMiddleware, authController.updateStaff);
router.patch('/admin/users/:id/active', authMiddleware, adminMiddleware, authController.toggleStaffActive);
router.delete('/admin/users/:id', authMiddleware, adminMiddleware, authController.deleteStaff);

router.post('/museums', authMiddleware, superAdminMiddleware, museumController.createMuseum);
router.get('/museums', authMiddleware, superAdminMiddleware, museumController.listMuseums);
router.put('/museums/:id', authMiddleware, superAdminMiddleware, museumController.updateMuseum);
router.delete('/museums/:id', authMiddleware, superAdminMiddleware, museumController.deleteMuseum);

router.post('/museums/:museum_id/maps', authMiddleware, adminMiddleware, mapUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'yaml', maxCount: 1 }]), mapController.uploadMap);
router.get('/museums/:museum_id/maps', authMiddleware, adminMiddleware, mapController.listMaps);
router.get('/maps/:map_id', authMiddleware, adminMiddleware, mapController.getMap);
router.delete('/maps/:map_id', authMiddleware, adminMiddleware, mapController.deleteMap);

router.get('/maps/:map_id/zones', authMiddleware, adminMiddleware, mapController.getZones);
router.post('/maps/:map_id/zones', authMiddleware, adminMiddleware, mapController.createZone);
router.put('/maps/:map_id/zones/:id', authMiddleware, adminMiddleware, mapController.updateZone);
router.delete('/maps/:map_id/zones/:id', authMiddleware, adminMiddleware, mapController.deleteZone);

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

router.get('/robots', authMiddleware, staffMiddleware, (req, res) => {
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

        // Batch-load zones for every map involved, then derive each robot's
        // current location as the nearest waypoint to its live position.
        const mapIds = [...new Set(rows.map(r => r.map_id).filter(Boolean))];

        const buildResponse = (zonesByMap) => rows.map(r => {
            const isLocked = r.locked_until && new Date(r.locked_until) > now;
            const nearest = findNearestZone(r.position_x, r.position_y, zonesByMap[r.map_id] || []);
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
                current_location: nearest ? { name: nearest.name, category: nearest.category, distance: Math.round(nearest.distance * 100) / 100 } : null,
                is_occupied: isLocked,
                locked_until: r.locked_until,
                visitor_name: isLocked ? (r.visitor_name || 'Visitante Anónimo') : null
            };
        });

        if (mapIds.length === 0) return res.json(buildResponse({}));

        const placeholders = mapIds.map(() => '?').join(',');
        db.all(`SELECT id, name, category, map_x, map_y, map_id FROM zones WHERE map_id IN (${placeholders})`, mapIds, (zErr, zoneRows) => {
            const zonesByMap = {};
            if (!zErr && zoneRows) {
                for (const z of zoneRows) (zonesByMap[z.map_id] ||= []).push(z);
            }
            res.json(buildResponse(zonesByMap));
        });
    });
});

router.get('/robots/:id', authMiddleware, staffMiddleware, (req, res) => {
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

router.put('/robots/:id', authMiddleware, staffMiddleware, (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    // Técnicos y museum_admin pueden editar nombre e IP de los robots de su museo.
    // Asignar mapa queda para admins; mover de museo, solo para el proveedor (super-admin).
    const isAdmin = isSuperAdmin || req.user.role === 'museum_admin';
    const museumId = req.user.museum_id;
    const robotId = req.params.id;
    const { ip, name, map_id, museum_id } = req.body;

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

        // Reassigning a robot to another museum (or unassigning it) is provider-only.
        const reassign = isSuperAdmin && museum_id !== undefined;
        const newMuseumId = reassign ? (museum_id || null) : robot.museum_id;
        const museumChanged = newMuseumId !== robot.museum_id;

        if (reassign && newMuseumId) {
            const museum = await new Promise(resolve => {
                db.get('SELECT id FROM museums WHERE id = ?', [newMuseumId], (e, row) => resolve(row || null));
            });
            if (!museum) return res.status(404).json({ error: 'Museo no encontrado' });
        }

        // If assigning a map, verify it belongs to the same museum AND has a base point.
        // (Skipped on a museum change: the old map belongs to the previous museum.)
        if (isAdmin && !museumChanged && map_id !== undefined && map_id !== null) {
            const mapRow = await new Promise(resolve => {
                db.get('SELECT museum_id FROM maps WHERE id = ?', [map_id], (e, row) => resolve(row || null));
            });
            if (!mapRow) return res.status(404).json({ error: 'Mapa no encontrado' });
            if (!isSuperAdmin && mapRow.museum_id !== museumId) {
                return res.status(403).json({ error: 'El mapa no pertenece a tu museo' });
            }
            // Mandatory base: a map without a base point cannot drive a robot.
            const base = await new Promise(resolve => {
                db.get('SELECT id FROM zones WHERE map_id = ? AND category = ? LIMIT 1', [map_id, BASE_CATEGORY], (e, row) => resolve(row || null));
            });
            if (!base) {
                return res.status(422).json({ error: 'Este mapa no tiene un punto base definido. Defínelo en el editor de mapas antes de asignarlo a un robot.' });
            }
        }

        const updatedIp = ip !== undefined ? ip : robot.ip;
        const updatedName = name !== undefined ? name : robot.name;
        // Maps are museum-scoped, so moving the robot to another museum drops its map.
        const updatedMapId = museumChanged ? null : (isAdmin && map_id !== undefined ? map_id : robot.map_id);

        // On a museum change, also clear any stale visitor session from the old museum.
        const updateSql = museumChanged
            ? `UPDATE robots SET ip = ?, name = ?, map_id = ?, museum_id = ?, current_visitor_id = NULL, locked_until = NULL WHERE id = ?`
            : `UPDATE robots SET ip = ?, name = ?, map_id = ?, museum_id = ? WHERE id = ?`;

        db.run(updateSql, [updatedIp, updatedName, updatedMapId, newMuseumId, robotId], (err) => {
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

router.delete('/robots/:id', authMiddleware, superAdminMiddleware, (req, res) => {
    const robotId = req.params.id;
    db.get('SELECT id FROM robots WHERE id = ?', [robotId], (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found' });

        db.run('DELETE FROM robots WHERE id = ?', [robotId], (delErr) => {
            if (delErr) return res.status(500).json({ error: 'Error deleting robot' });
            rosService.disconnect(robotId); // tear down any live ROS connection
            res.json({ message: 'Robot deleted' });
        });
    });
});

router.post('/robots/:id/command', authMiddleware, staffMiddleware, (req, res) => {
    const { command, payload } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;
    const robotId = req.params.id;

    let verifyQuery = `SELECT * FROM robots WHERE id = ?`;
    let verifyParams = [robotId];
    if (!isSuperAdmin) {
        verifyQuery += ` AND museum_id = ?`;
        verifyParams.push(museumId);
    }

    db.get(verifyQuery, verifyParams, async (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        let status = robot.status;
        let px = robot.position_x;
        let py = robot.position_y;
        let pt = robot.position_theta;

        if (command === 'connect') {
            const ip = payload?.ip || robot.ip || '127.0.0.1';
            try {
                await rosService.connect(robotId, ip);
            } catch (e) {
                return res.status(503).json({ error: `Error iniciando la conexión: ${e.message}` });
            }
            // Wait for the actual WebSocket to come up so we report a real result.
            const ok = await rosService.waitForConnection(robotId, 6000);
            if (ok) {
                sseService.broadcastRobot(robotId);
                return res.json({ message: `Conectado a ${robot.name}`, connected: true });
            }
            return res.status(504).json({
                error: `No se pudo conectar con "${robot.name}" en ${ip}:9090. Comprueba que el robot está encendido, en la misma red y con rosbridge_server activo.`
            });
        }

        if (command === 'disconnect') {
            rosService.disconnect(robotId);
            return res.json({ message: `ROS Connection closed for ${robot.name}` });
        }

        if (command === 'move' && payload) {
            status = 'moving';
            
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


router.post('/robots/:id/nav-goal', authMiddleware, staffMiddleware, async (req, res) => {
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
            rosService.sendNavGoal(robotId, Number(x), Number(y), Number(qz), Number(qw), {
                kind:     'admin',
                museumId: req.user.museum_id,
            });
            res.json({ message: 'Navigation goal sent', x, y, qz, qw });
        } catch (e) {
            res.status(503).json({ error: e.message });
        }
    });
});

router.post('/robots/:id/cancel-nav', authMiddleware, staffMiddleware, async (req, res) => {
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

router.post('/robots/:id/go-to-base', authMiddleware, staffMiddleware, async (req, res) => {
    const robotId = req.params.id;
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;

    let query = `SELECT id FROM robots WHERE id = ?`;
    let params = [robotId];
    if (!isSuperAdmin) { query += ` AND museum_id = ?`; params.push(museumId); }

    db.get(query, params, async (err, robot) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!robot) return res.status(404).json({ error: 'Robot not found or unauthorized' });

        const result = await navService.sendRobotToBase(robotId);
        if (result.ok) {
            sseService.broadcastRobot(robotId);
            return res.json({ message: `Enviando el robot a la base "${result.base.name}".`, base: result.base });
        }

        const messages = {
            no_map:        'El robot no tiene un mapa asignado.',
            no_base:       'El mapa del robot no tiene un punto base definido.',
            not_connected: 'El robot no está conectado a ROS en este momento.',
            ros_error:     result.error || 'Error al enviar el objetivo de navegación.',
        };
        return res.status(409).json({ error: messages[result.reason] || 'No se pudo enviar el robot a la base.' });
    });
});

router.post('/robots/:id/capture-map', authMiddleware, adminMiddleware, mapController.captureMapFromRobot);

router.get('/robots/:id/map', authMiddleware, staffMiddleware, (req, res) => {
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

router.get('/robots/:id/scan', authMiddleware, staffMiddleware, (req, res) => {
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

        db.run('BEGIN IMMEDIATE', (beginErr) => {
            if (beginErr) return res.status(500).json({ error: 'Server error' });

            db.run('UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?', [robotId], (updErr) => {
                if (updErr) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Database error handling robot' }));

                db.run('UPDATE visitors SET ended_at = CURRENT_TIMESTAMP WHERE id = ?', [visitorId], (visErr) => {
                    if (visErr) console.error('Error updating visitor ended_at', visErr);

                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Server error' }));
                        navService.sendRobotToBase(robotId).catch(() => {});
                        sseService.broadcastRobot(robotId);
                        res.json({ message: 'Visita finalizada exitosamente' });
                    });
                });
            });
        });
    });
});

router.get('/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId = req.user.museum_id;
    const p = isSuperAdmin ? [] : [museumId];

    const qGet = (sql, params) => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
        });
    });
    const qAll = (sql, params) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });

    try {
        const [
            totVisitors, avgSession, totRobots, activeRobots, totMuseums,
            visitorsByDay, expertiseDist, intentDist, robotActivity
        ] = await Promise.all([
            qGet(isSuperAdmin
                ? `SELECT COUNT(*) AS count FROM visitors`
                : `SELECT COUNT(v.id) AS count FROM visitors v JOIN robots r ON r.id=v.robot_id WHERE r.museum_id=?`, p),
            qGet(isSuperAdmin
                ? `SELECT AVG((julianday(ended_at)-julianday(created_at))*1440) AS avg FROM visitors WHERE ended_at IS NOT NULL`
                : `SELECT AVG((julianday(v.ended_at)-julianday(v.created_at))*1440) AS avg FROM visitors v JOIN robots r ON r.id=v.robot_id WHERE v.ended_at IS NOT NULL AND r.museum_id=?`, p),
            qGet(isSuperAdmin
                ? `SELECT COUNT(*) AS count FROM robots`
                : `SELECT COUNT(*) AS count FROM robots WHERE museum_id=?`, p),
            qGet(isSuperAdmin
                ? `SELECT COUNT(*) AS count FROM robots WHERE status!='idle'`
                : `SELECT COUNT(*) AS count FROM robots WHERE museum_id=? AND status!='idle'`, p),
            isSuperAdmin
                ? qGet(`SELECT COUNT(*) AS count FROM museums`, [])
                : Promise.resolve({ count: null }),
            qAll(isSuperAdmin
                ? `SELECT date(created_at) AS day, COUNT(*) AS count FROM visitors WHERE created_at >= date('now','-6 days') GROUP BY date(created_at) ORDER BY day`
                : `SELECT date(v.created_at) AS day, COUNT(*) AS count FROM visitors v JOIN robots r ON r.id=v.robot_id WHERE r.museum_id=? AND v.created_at >= date('now','-6 days') GROUP BY date(v.created_at) ORDER BY day`, p),
            qAll(isSuperAdmin
                ? `SELECT expertise_level AS level, COUNT(*) AS count FROM visitors GROUP BY expertise_level ORDER BY count DESC`
                : `SELECT v.expertise_level AS level, COUNT(*) AS count FROM visitors v JOIN robots r ON r.id=v.robot_id WHERE r.museum_id=? GROUP BY v.expertise_level ORDER BY count DESC`, p),
            qAll(isSuperAdmin
                ? `SELECT intent, COUNT(*) AS count FROM chat_messages WHERE role='assistant' AND intent IS NOT NULL AND intent NOT IN ('none','greet','farewell') GROUP BY intent ORDER BY count DESC LIMIT 5`
                : `SELECT cm.intent, COUNT(*) AS count FROM chat_messages cm JOIN visitors v ON v.session_id=cm.session_id JOIN robots r ON r.id=v.robot_id WHERE r.museum_id=? AND cm.role='assistant' AND cm.intent IS NOT NULL AND cm.intent NOT IN ('none','greet','farewell') GROUP BY cm.intent ORDER BY count DESC LIMIT 5`, p),
            qAll(isSuperAdmin
                ? `SELECT r.name AS robot_name, COUNT(v.id) AS count FROM robots r LEFT JOIN visitors v ON v.robot_id=r.id GROUP BY r.id ORDER BY count DESC LIMIT 6`
                : `SELECT r.name AS robot_name, COUNT(v.id) AS count FROM robots r LEFT JOIN visitors v ON v.robot_id=r.id WHERE r.museum_id=? GROUP BY r.id ORDER BY count DESC LIMIT 6`, p),
        ]);

        res.json({
            totalRobots:    totRobots.count    || 0,
            activeRobots:   activeRobots.count || 0,
            totalVisitors:  totVisitors.count  || 0,
            avgSessionTime: Math.round((avgSession.avg || 0) * 10) / 10,
            // Museum count is only meaningful platform-wide, so expose it to superadmins only.
            ...(isSuperAdmin && { totalMuseums: totMuseums.count || 0 }),
            visitorsByDay,
            expertiseDist,
            intentDist,
            robotActivity,
        });
    } catch (err) {
        console.error('[Stats] Error:', err);
        res.status(500).json({ error: 'Error fetching stats' });
    }
});

const incidentService = require('../services/incidentService');

// GET /api/admin/incidents - list nav failures etc., scoped to the museum.
router.get('/admin/incidents', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const incidents = await incidentService.list({
            isSuperAdmin: req.user.role === 'platform_admin',
            museumId:     req.user.museum_id,
        });
        res.json(incidents);
    } catch (err) {
        console.error('[Incidents] List error:', err);
        res.status(500).json({ error: 'Error fetching incidents' });
    }
});

// PATCH /api/admin/incidents/:id/resolve - mark an incident as handled.
router.patch('/admin/incidents/:id/resolve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await incidentService.resolve({
            id:           req.params.id,
            isSuperAdmin: req.user.role === 'platform_admin',
            museumId:     req.user.museum_id,
        });
        if (result.changes === 0) return res.status(404).json({ error: 'Incident not found' });
        res.json({ message: 'Incident resolved' });
    } catch (err) {
        console.error('[Incidents] Resolve error:', err);
        res.status(500).json({ error: 'Error resolving incident' });
    }
});

module.exports = router;
