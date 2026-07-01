const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { dbGet, dbRun } = require('../utils/db');
const { sendPasswordResetEmail } = require('../utils/emailService');

const SALT_ROUNDS   = 10;
const TOKEN_TTL_MS  = 60 * 60 * 1000; // 1 hora


// Acepta una dirección de correo y - si coincide con una cuenta de personal - envía
// un enlace de recuperación de contraseña. Siempre devuelve 200 para evitar la enumeración de correos.

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    // Responde siempre con éxito independientemente de si el correo existe
    const successResponse = () =>
        res.json({ message: 'Si ese correo está registrado, recibirás un enlace en breve.' });

    if (!email || typeof email !== 'string') return successResponse();

    try {
        const user = await dbGet(
            `SELECT id, name, email FROM users WHERE email = ? AND active != 0`,
            [email.trim().toLowerCase()]
        );

        if (!user) return successResponse();

        // Invalida cualquier token existente sin usar de este usuario
        await dbRun(
            `UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0`,
            [user.id]
        );

        // Genera un token criptográficamente seguro
        const rawToken   = crypto.randomBytes(32).toString('hex');
        const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt  = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
        const tokenId    = crypto.randomUUID();

        await dbRun(
            `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
             VALUES (?, ?, ?, ?)`,
            [tokenId, user.id, tokenHash, expiresAt]
        );

        await sendPasswordResetEmail(user.email, user.name, rawToken);

        return successResponse();
    } catch (err) {
        console.error('[PasswordReset] forgotPassword error:', err);
        return successResponse(); // Nunca expone errores para evitar filtrar información
    }
};

// Valida el token y actualiza la contraseña del usuario.

exports.resetPassword = async (req, res) => {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
        return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const record = await dbGet(
            `SELECT prt.id, prt.user_id, prt.expires_at, prt.used
             FROM   password_reset_tokens prt
             WHERE  prt.token_hash = ?`,
            [tokenHash]
        );

        if (!record)        return res.status(400).json({ error: 'Enlace de recuperación inválido' });
        if (record.used)    return res.status(400).json({ error: 'Este enlace ya fue utilizado' });
        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' });
        }

        const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);

        // Actualiza la contraseña y marca el token como usado - ambos en la misma cadena de callbacks
        await dbRun(
            `UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?`,
            [newHash, record.user_id]
        );
        await dbRun(
            `UPDATE password_reset_tokens SET used = 1 WHERE id = ?`,
            [record.id]
        );

        res.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
    } catch (err) {
        console.error('[PasswordReset] resetPassword error:', err);
        res.status(500).json({ error: 'Error interno. Inténtalo de nuevo.' });
    }
};
