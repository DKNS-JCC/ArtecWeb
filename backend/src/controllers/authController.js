const db = require('../database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-artec-key';
const SALT_ROUNDS = 10;

// ──────── PUBLIC: Register (creates 'user' role only) ────────
exports.register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const newUserId = crypto.randomUUID();

        db.run(
            `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'user')`,
            [newUserId, name.trim(), email.trim().toLowerCase(), passwordHash],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        const field = err.message.includes('name') ? 'name' : 'email';
                        return res.status(409).json({ error: `That ${field} is already taken` });
                    }
                    return res.status(500).json({ error: 'Error registering user' });
                }

                const token = jwt.sign(
                    { id: newUserId, name: name.trim(), role: 'user', must_change_password: false },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(201).json({
                    message: 'Account created successfully',
                    token,
                    user: { id: newUserId, name: name.trim(), email: email.trim().toLowerCase(), role: 'user', avatar: null }
                });
            }
        );
    } catch (err) {
        console.error('REGISTER ERROR:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.login = (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Name/email and password are required' });
    }
    const query = `SELECT * FROM users WHERE name = ? OR email = ? LIMIT 1`;
    db.get(query, [identifier.trim(), identifier.trim().toLowerCase()], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        try {
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            const mustChange = user.must_change_password === 1;

            const token = jwt.sign(
                {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    must_change_password: mustChange,
                    museum_id: user.museum_id
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                message: 'Login successful',
                token,
                must_change_password: mustChange,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar,
                    museum_id: user.museum_id
                }
            });
        } catch (err) {
            console.error('LOGIN ERROR:', err);
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
                    { id: user.id, name: user.name, role: user.role, must_change_password: false },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.json({ message: 'Password changed successfully', token });
            }
        );
    });
};

const { sendWelcomeEmail } = require('../utils/emailService');

exports.createStaff = async (req, res) => {
    // Note: password is no longer received from the client
    const { name, email, role, museum_id } = req.body;
    const created_by = req.user.id;
    const reqUserRole = req.user.role;

    if (!name || !email || !role) {
        return res.status(400).json({ error: 'Name, email and role are required' });
    }

    // Role validation based on who is creating the user
    if (reqUserRole === 'platform_admin') {
        if (!['museum_admin', 'technician'].includes(role)) {
            return res.status(400).json({ error: 'Platform admin can only create museum admin or technician' });
        }
        if (!museum_id) {
            return res.status(400).json({ error: 'museum_id is required to assign staff to a museum' });
        }
    } else if (reqUserRole === 'museum_admin') {
        if (role !== 'technician') {
            return res.status(403).json({ error: 'Museum admins can only create technicians' });
        }
        // Force the museum_id to be the admin's museum_id
        if (req.user.museum_id && museum_id !== req.user.museum_id) {
            return res.status(403).json({ error: 'You can only create staff for your own museum' });
        }
    }

    const assignedMuseumId = reqUserRole === 'museum_admin' ? req.user.museum_id : museum_id;

    // Generate a secure temporary password (e.g. 8 chars, alphanumeric)
    const tempPassword = Math.random().toString(36).slice(-8) + 'Aa1!';

    try {
        const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

        // Fetch museum name for the email
        db.get('SELECT name FROM museums WHERE id = ?', [assignedMuseumId], (err, museumRow) => {
            if (err) return res.status(500).json({ error: 'Error checking museum' });
            if (!museumRow) return res.status(404).json({ error: 'Museum not found' });

            const museumName = museumRow.name;

            const userId = crypto.randomUUID();

            db.run(
                `INSERT INTO users (id, name, email, password_hash, role, must_change_password, museum_id, created_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
                [userId, name.trim(), email.trim().toLowerCase(), passwordHash, role, assignedMuseumId, created_by],
                async function (err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            const field = err.message.includes('name') ? 'name' : 'email';
                            return res.status(409).json({ error: `That ${field} is already taken` });
                        }
                        return res.status(500).json({ error: 'Error creating staff account' });
                    }

                    // Send the automated welcome email
                    await sendWelcomeEmail(email.trim(), name.trim(), tempPassword, role, museumName);

                    res.status(201).json({
                        message: `${role} account created and welcome email sent.`,
                        user: { id: userId, name: name.trim(), email: email.trim().toLowerCase(), role, museum_id: assignedMuseumId }
                    });
                }
            );
        });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.listUsers = (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const userMuseumId = req.user.museum_id;

    let query = `
        SELECT u.id, u.name, u.email, u.role, u.must_change_password, u.created_at, u.museum_id, u.active, m.name as museum_name 
        FROM users u
        LEFT JOIN museums m ON u.museum_id = m.id
    `;
    const params = [];

    if (!isSuperAdmin) {
        query += ` WHERE u.museum_id = ? AND u.role IN ('museum_admin', 'technician')`;
        params.push(userMuseumId);
    }

    query += ` ORDER BY u.created_at DESC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
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
