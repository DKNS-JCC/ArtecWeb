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
    } catch (err) {
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
