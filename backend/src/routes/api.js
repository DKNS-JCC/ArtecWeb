const express = require('express');
const router = express.Router();

const db = require('../database');
const authController = require('../controllers/authController');
const museumController = require('../controllers/museumController');
const { authMiddleware, adminMiddleware, superAdminMiddleware, staffMiddleware } = require('../middleware/authMiddleware');
const upload = require('../config/uploadConfig');
const sseService = require('../services/sseService');
const chatController        = require('../controllers/chatController');
const chatHistoryController = require('../controllers/chatHistoryController');
const passwordResetController = require('../controllers/passwordResetController');
const mapController         = require('../controllers/mapController');
const { visitorMiddleware } = require('../middleware/visitorMiddleware');
const mapUpload = require('../config/mapUploadConfig');
const rateLimit = require('express-rate-limit');
const statsService = require('../services/statsService');
const { verifySseToken } = require('../middleware/sseAuth');
const visitorController = require('../controllers/visitorController');
const robotController = require('../controllers/robotController');

// Limitador de tasa específico del chat (más estricto: 15 msgs/min)
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: { error: 'Demasiados mensajes. Espera un momento antes de enviar otro.' }
});

// Limitador de speech-to-text - la inferencia local de Whisper consume mucha CPU, así que
// se limita más que el chat de texto (20 clips/min por IP).
const sttLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Demasiadas grabaciones. Espera un momento antes de volver a hablar.' }
});

const audioUpload = require('../config/audioUploadConfig');

// Conexión persistente text/event-stream. Una conexión por pestaña de administración.
// EventSource no puede enviar cabeceras personalizadas, así que el JWT se pasa como ?token=...
// Lo validamos aquí en línea en vez de usar authMiddleware (que lee la cabecera).
router.get('/robots/stream', (req, res) => {
    const user = verifySseToken(req, res);
    if (!user) return;

    if (!['technician', 'museum_admin', 'platform_admin'].includes(user.role)) {
        return res.status(403).json({ error: 'Se requiere acceso de personal' });
    }

    sseService.addClient(req, res, user);
});

router.get('/robots/position-stream', (req, res) => {
    const user = verifySseToken(req, res);
    if (!user) return;

    if (user.role !== 'visitor' || !user.robot_id) {
        return res.status(403).json({ error: 'Se requiere acceso de visitante' });
    }

    // Confirma que el visitante aún es dueño de esta sesión del robot antes de emitir el stream.
    db.get(
        'SELECT id FROM robots WHERE id = ? AND current_visitor_id = ?',
        [user.robot_id, user.id],
        (err, robot) => {
            if (err)    return res.status(500).json({ error: 'Error de base de datos' });
            if (!robot) return res.status(403).json({ error: 'Sesión expirada o robot reasignado' });
            sseService.addPositionClient(req, res, user.robot_id);
        }
    );
});

// La comprueba la pantalla de escaneo ANTES de preguntar al visitante, de modo que un
// robot offline u ocupado se informa por adelantado. Bajo /robots → sin limitador global.
router.get('/robots/:id/availability', robotController.availability);

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

// Acepta un clip WAV mono de 16 kHz y devuelve el texto reconocido.
router.post('/chat/stt', sttLimiter, authMiddleware, visitorMiddleware, audioUpload.single('audio'), chatController.handleTranscribe);


router.post('/chat/confirm-nav', chatLimiter, authMiddleware, visitorMiddleware, visitorController.confirmNav);
router.patch('/visitor/expertise', authMiddleware, visitorMiddleware, visitorController.updateExpertise);
router.get('/visitor/map', authMiddleware, visitorMiddleware, visitorController.getVisitorMap);

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

router.post('/robots', authMiddleware, superAdminMiddleware, robotController.createRobot);
router.get('/robots', authMiddleware, staffMiddleware, robotController.listRobots);
router.get('/robots/:id', authMiddleware, staffMiddleware, robotController.getRobot);
router.put('/robots/:id', authMiddleware, staffMiddleware, robotController.updateRobot);

router.delete('/robots/:id', authMiddleware, superAdminMiddleware, robotController.deleteRobot);
router.post('/robots/:id/command', authMiddleware, staffMiddleware, robotController.sendCommand);
router.post('/robots/:id/nav-goal', authMiddleware, staffMiddleware, robotController.sendNavGoal);
router.post('/robots/:id/cancel-nav', authMiddleware, staffMiddleware, robotController.cancelNav);
router.post('/robots/:id/go-to-base', authMiddleware, staffMiddleware, robotController.goToBase);

router.post('/robots/:id/capture-map', authMiddleware, adminMiddleware, mapController.captureMapFromRobot);

router.get('/robots/:id/map', authMiddleware, staffMiddleware, robotController.getMap);
router.get('/robots/:id/scan', authMiddleware, staffMiddleware, robotController.getScan);
router.post('/robots/:id/force-end', authMiddleware, adminMiddleware, robotController.forceEnd);

router.get('/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const stats = await statsService.getDashboardStats({
            isSuperAdmin: req.user.role === 'platform_admin',
            museumId:     req.user.museum_id,
        });
        res.json(stats);
    } catch (err) {
        console.error('[Stats] Error:', err);
        res.status(500).json({ error: 'Error al obtener las estadísticas' });
    }
});

const incidentService = require('../services/incidentService');

// GET /api/admin/incidents - lista fallos de navegación, etc., acotado al museo.
router.get('/admin/incidents', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const incidents = await incidentService.list({
            isSuperAdmin: req.user.role === 'platform_admin',
            museumId:     req.user.museum_id,
        });
        res.json(incidents);
    } catch (err) {
        console.error('[Incidents] List error:', err);
        res.status(500).json({ error: 'Error al obtener las incidencias' });
    }
});

// PATCH /api/admin/incidents/:id/resolve - marca una incidencia como atendida.
router.patch('/admin/incidents/:id/resolve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await incidentService.resolve({
            id:           req.params.id,
            isSuperAdmin: req.user.role === 'platform_admin',
            museumId:     req.user.museum_id,
        });
        if (result.changes === 0) return res.status(404).json({ error: 'Incidencia no encontrada' });
        res.json({ message: 'Incidencia resuelta' });
    } catch (err) {
        console.error('[Incidents] Resolve error:', err);
        res.status(500).json({ error: 'Error al resolver la incidencia' });
    }
});

module.exports = router;
