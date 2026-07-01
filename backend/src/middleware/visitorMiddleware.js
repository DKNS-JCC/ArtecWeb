const db = require('../database');

/**
 * Middleware que valida que el visitante tiene una sesión activa
 * y está asignado a un robot. Se usa en los endpoints del chat.
 */
module.exports.visitorMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'visitor') {
        return res.status(403).json({ error: 'Solo acceso de visitante' });
    }

    if (!req.user.robot_id) {
        return res.status(400).json({ error: 'No hay ningún robot asignado a la sesión' });
    }

    db.get(
        'SELECT locked_until FROM robots WHERE id = ? AND current_visitor_id = ?',
        [req.user.robot_id, req.user.id],
        (err, robot) => {
            if (err) return res.status(500).json({ error: 'Error de base de datos' });
            if (!robot) return res.status(403).json({ error: 'Sesión expirada o robot reasignado' });

            if (robot.locked_until && new Date(robot.locked_until) < new Date()) {
                return res.status(403).json({ error: 'Sesión expirada' });
            }

            next();
        }
    );
};
