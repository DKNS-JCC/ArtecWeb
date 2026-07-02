const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secrets');

/**
 * Valida el JWT que EventSource envía como `?token=...`.
 *
 * EventSource no puede enviar cabeceras personalizadas, así que los streams SSE
 * no pueden usar `authMiddleware` (que lee la cabecera Authorization). Este helper
 * centraliza esa validación: verifica el token y devuelve el usuario, o responde
 * 401 y devuelve `null` si falta o no es válido. El chequeo de rol lo hace cada ruta.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Object|null}  Payload del usuario, o `null` si ya se respondió 401.
 */
function verifySseToken(req, res) {
    const token = req.query.token;
    if (!token) {
        res.status(401).json({ error: 'Se requiere token' });
        return null;
    }
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        res.status(401).json({ error: 'Token no válido' });
        return null;
    }
}

module.exports = { verifySseToken };
