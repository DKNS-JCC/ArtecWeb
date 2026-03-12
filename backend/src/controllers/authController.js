const db = require('../database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-artec-key';
const SALT_ROUNDS = 10;

// ──────── PUBLIC: Register (creates 'user' role only) ────────
exports.register = async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email and password are required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        db.run(
            `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'user')`,
            [username.trim(), email.trim().toLowerCase(), passwordHash],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        const field = err.message.includes('username') ? 'username' : 'email';
                        return res.status(409).json({ error: `That ${field} is already taken` });
                    }
                    return res.status(500).json({ error: 'Error registering user' });
                }

                const token = jwt.sign(
                    { id: this.lastID, username: username.trim(), role: 'user', must_change_password: false },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(201).json({
                    message: 'Account created successfully',
                    token,
                    user: { id: this.lastID, username: username.trim(), email: email.trim().toLowerCase(), role: 'user', avatar: null }
                });
            }
        );
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.login = (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Username/email and password are required' });
    }
    const query = `SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1`;
    db.get(query, [identifier.trim(), identifier.trim().toLowerCase()], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        try {
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            const mustChange = user.must_change_password === 1;

            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role, must_change_password: mustChange },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                message: 'Login successful',
                token,
                must_change_password: mustChange,
                user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar }
            });
        } catch {
            res.status(500).json({ error: 'Server error during login' });
        }
    });
};

exports.changePassword = async (req, res) => {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Both current and new password are required' });
    }
    if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });

        const match = await bcrypt.compare(current_password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

        const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);

        db.run(
            `UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`,
            [newHash, userId],
            (err) => {
                if (err) return res.status(500).json({ error: 'Error updating password' });

                const token = jwt.sign(
                    { id: user.id, username: user.username, role: user.role, must_change_password: false },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.json({ message: 'Password changed successfully', token });
            }
        );
    });
};

exports.createStaff = async (req, res) => {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
        return res.status(400).json({ error: 'username, email, password and role are required' });
    }
    if (!['admin', 'tecnico'].includes(role)) {
        return res.status(400).json({ error: 'Role must be admin or tecnico' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        db.run(
            `INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)`,
            [username.trim(), email.trim().toLowerCase(), passwordHash, role],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        const field = err.message.includes('username') ? 'username' : 'email';
                        return res.status(409).json({ error: `That ${field} is already taken` });
                    }
                    return res.status(500).json({ error: 'Error creating staff account' });
                }

                res.status(201).json({
                    message: `${role} account created. They must change their password on first login.`,
                    user: { id: this.lastID, username: username.trim(), email: email.trim().toLowerCase(), role }
                });
            }
        );
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.listUsers = (req, res) => {
    db.all(
        `SELECT id, username, email, role, must_change_password, created_at FROM users ORDER BY created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        }
    );
};

const fs = require('fs');
const path = require('path');

exports.uploadAvatar = (req, res) => {
    const userId = req.user.id;

    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ninguna imagen' });
    }

    // Ruta relativa para servir la imagen (ej: /uploads/avatars/nombre.jpg)
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const db = require('../database');

    // Primero obtenemos el avatar anterior para borrarlo
    db.get('SELECT avatar FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) {
            console.error('Error obteniendo avatar actual:', err);
            return res.status(500).json({ error: 'Error accediendo a la base de datos' });
        }

        const oldAvatar = row ? row.avatar : null;

        const query = `UPDATE users SET avatar = ? WHERE id = ?`;
        db.run(query, [avatarUrl, userId], function (err) {
            if (err) {
                console.error('Error actualizando avatar:', err);
                return res.status(500).json({ error: 'Error interno guardando la imagen' });
            }

            // Si había un avatar antiguo, borrar el archivo
            if (oldAvatar) {
                const oldFileName = oldAvatar.split('/').pop();
                const oldFilePath = path.join(__dirname, '../../uploads/avatars', oldFileName);
                // Sanitize to only delete from the exact directory
                const resolvedDir = path.resolve(path.join(__dirname, '../../uploads/avatars'));
                const resolvedFile = path.resolve(oldFilePath);
                if (resolvedFile.startsWith(resolvedDir)) {
                    fs.unlink(resolvedFile, (unlinkErr) => {
                        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                            console.error('Error borrando avatar antiguo:', unlinkErr);
                        }
                    });
                }
            }

            res.json({
                message: 'Avatar actualizado con éxito',
                avatar: avatarUrl
            });
        });
    });
};

exports.deleteAvatar = (req, res) => {
    const userId = req.user.id;
    const db = require('../database');

    db.get('SELECT avatar FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) {
            console.error('Error obteniendo avatar actual:', err);
            return res.status(500).json({ error: 'Error accediendo a la base de datos' });
        }

        const oldAvatar = row ? row.avatar : null;
        if (!oldAvatar) {
            return res.json({ message: 'No hay avatar que eliminar' });
        }

        const query = `UPDATE users SET avatar = NULL WHERE id = ?`;
        db.run(query, [userId], function (err) {
            if (err) {
                console.error('Error eliminando avatar de base de datos:', err);
                return res.status(500).json({ error: 'Error actualizando base de datos' });
            }

            const oldFileName = oldAvatar.split('/').pop();
            const oldFilePath = path.join(__dirname, '../../uploads/avatars', oldFileName);
            const resolvedDir = path.resolve(path.join(__dirname, '../../uploads/avatars'));
            const resolvedFile = path.resolve(oldFilePath);

            if (resolvedFile.startsWith(resolvedDir)) {
                fs.unlink(resolvedFile, (unlinkErr) => {
                    if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                        console.error('Error borrando archivo de avatar:', unlinkErr);
                    }
                });
            }

            res.json({
                message: 'Avatar eliminado con éxito',
                avatar: null
            });
        });
    });
};
