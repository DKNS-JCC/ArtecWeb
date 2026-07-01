const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-artec-key';

module.exports.authMiddleware = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token, authorization denied' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token is not valid' });
    }
};

module.exports.adminMiddleware = (req, res, next) => {
    if (!req.user || (req.user.role !== 'museum_admin' && req.user.role !== 'platform_admin')) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports.superAdminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'platform_admin') {
        return res.status(403).json({ error: 'Platform admin access required' });
    }
    next();
};

// Permite técnicos además de administradores. Se usa en los endpoints de operación y
// monitorización del robot (control, teleop, mapa/scan), que los técnicos necesitan pero
// que quedan acotados a su propio museo mediante req.user.museum_id en cada consulta.
module.exports.staffMiddleware = (req, res, next) => {
    const allowed = ['technician', 'museum_admin', 'platform_admin'];
    if (!req.user || !allowed.includes(req.user.role)) {
        return res.status(403).json({ error: 'Staff access required' });
    }
    next();
};
