const db = require('../database');

/**
 * Middleware that validates the visitor has an active session
 * and is assigned to a robot. Used for chat endpoints.
 */
module.exports.visitorMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'visitor') {
        return res.status(403).json({ error: 'Visitor access only' });
    }

    if (!req.user.robot_id) {
        return res.status(400).json({ error: 'No robot assigned to session' });
    }

    db.get(
        'SELECT locked_until FROM robots WHERE id = ? AND current_visitor_id = ?',
        [req.user.robot_id, req.user.id],
        (err, robot) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!robot) return res.status(403).json({ error: 'Session expired or robot reassigned' });

            if (robot.locked_until && new Date(robot.locked_until) < new Date()) {
                return res.status(403).json({ error: 'Session expired' });
            }

            next();
        }
    );
};
