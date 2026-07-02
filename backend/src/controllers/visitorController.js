const crypto = require('crypto');
const db = require('../database');
const rosService = require('../services/rosService');
const { BASE_CATEGORY } = require('../utils/geo');

/**
 * POST /api/chat/confirm-nav
 * El visitante confirma explícitamente un intent navigate_to.
 * Lanza el goal real de Nav2 vía rosService y persiste la confirmación en el historial de chat.
 */
exports.confirmNav = async (req, res) => {
    const { place_id } = req.body;
    const { id: visitorId, session_id, robot_id } = req.user;

    if (!place_id) {
        return res.status(400).json({ error: 'Se requiere place_id' });
    }

    // Carga la zona - las coordenadas ya están almacenadas como coords del mundo de ROS (metros)
    db.get(
        `SELECT z.id, z.name, z.map_x, z.map_y
         FROM zones z
         JOIN maps m   ON z.map_id = m.id
         JOIN robots r ON r.map_id = m.id
         WHERE z.id = ? AND r.id = ?`,
        [place_id, robot_id],
        (err, zone) => {
            if (err)   return res.status(500).json({ error: 'Error de base de datos' });
            if (!zone) return res.status(404).json({ error: 'Lugar no encontrado o no accesible desde este robot' });

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

            // Persiste el mensaje de confirmación del robot en el historial de chat
            db.run(
                `INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content, intent)
                 VALUES (?, ?, ?, ?, 'assistant', ?, 'navigate_to')`,
                [
                    crypto.randomUUID(), visitorId, session_id, robot_id,
                    `¡En camino hacia ${zone.name}! Sígueme, por favor.`
                ]
            );

            res.json({
                message:    `Navegando a ${zone.name}`,
                nav_message: `¡En camino hacia ${zone.name}! Sígueme, por favor.`,
                place: { id: zone.id, name: zone.name, map_x: zone.map_x, map_y: zone.map_y }
            });
        }
    );
};

/**
 * PATCH /api/visitor/expertise
 * Actualiza el nivel de conocimiento del visitante actual (la IA lo lee de la BD en cada mensaje).
 */
exports.updateExpertise = (req, res) => {
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
            if (err) return res.status(500).json({ error: 'Error de base de datos' });
            res.json({ expertise_level });
        }
    );
};

/**
 * GET /api/visitor/map
 * Devuelve los metadatos del mapa y las zonas del robot asignado al visitante actual.
 */
exports.getVisitorMap = (req, res) => {
    const { robot_id } = req.user;
    db.get('SELECT map_id FROM robots WHERE id = ?', [robot_id], (err, robot) => {
        if (err) return res.status(500).json({ error: 'Error de base de datos' });
        if (!robot?.map_id) return res.status(404).json({ error: 'Este robot no tiene un mapa asignado.' });

        db.get('SELECT * FROM maps WHERE id = ?', [robot.map_id], (err, map) => {
            if (err || !map) return res.status(500).json({ error: 'Error al obtener el mapa' });

            // Excluye el punto base interno - es opaco para los visitantes.
            db.all('SELECT * FROM zones WHERE map_id = ? AND category != ?', [robot.map_id, BASE_CATEGORY], (err, zones) => {
                if (err) return res.status(500).json({ error: 'Error al obtener las zonas' });
                res.json({ map, zones: zones || [] });
            });
        });
    });
};
