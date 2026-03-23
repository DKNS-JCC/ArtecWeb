const db = require('../database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-artec-key';
const SALT_ROUNDS = 10;

// ──────── PUBLIC: Create Visitor Session ────────
exports.createVisitor = (req, res) => {
    const { robotId, name } = req.body;

    if (!robotId) {
        return res.status(400).json({ error: 'Se requiere el ID del robot leído del QR' });
    }
    
    const visitorName = name ? name.trim() : 'Visitante';

    db.get('SELECT id, name, museum_id, locked_until FROM robots WHERE id = ?', [robotId], (err, robot) => {
        if (err) return res.status(500).json({ error: 'Error verificando el robot' });
        if (!robot) return res.status(404).json({ error: 'Robot no válido o no encontrado' });

        const now = new Date();
        if (robot.locked_until && new Date(robot.locked_until) > now) {
            return res.status(403).json({ error: 'Este robot ya está siendo utilizado por otro visitante. Por favor, espera a que termine su visita.' });
        }

        const visitorId = crypto.randomUUID();
        const sessionId = crypto.randomUUID();
        
        // Bloquear robot por 10 minutos iniciales
        const newLockTime = new Date(now.getTime() + 10 * 60000).toISOString();

        db.run('UPDATE robots SET locked_until = ?, current_visitor_id = ? WHERE id = ?', [newLockTime, visitorId, robot.id], (updErr) => {
            if (updErr) return res.status(500).json({ error: 'Error reservando el robot' });
            
            db.run(
                `INSERT INTO visitors (id, session_id, robot_id, name) VALUES (?, ?, ?, ?)`,
                [visitorId, sessionId, robot.id, visitorName],
                function (err) {
                if (err) {
                    console.error('VISITOR ERROR:', err);
                    return res.status(500).json({ error: 'Error creating visitor session' });
                }

                const token = jwt.sign(
                    { 
                        id: visitorId, 
                        session_id: sessionId, 
                        role: 'visitor',
                        robot_id: robot.id,
                        robot_name: robot.name,
                        museum_id: robot.museum_id,
                        name: visitorName
                    },
                    JWT_SECRET,
                    { expiresIn: '12h' } // Visitors get temporary access
                );

                res.status(201).json({
                    message: 'Visitor session created',
                    token,
                    visitor: { id: visitorId, session_id: sessionId, role: 'visitor', robot_id: robot.id, robot_name: robot.name, name: visitorName }
                });
            }
        );
        });
    });
};

exports.pingVisitor = (req, res) => {
    const robotId = req.user.robot_id;
    if (!robotId) return res.status(400).json({ error: 'No robot assigned' });
    
    // Extiende el bloqueo por otros 10 minutos
    const newLockTime = new Date(new Date().getTime() + 10 * 60000).toISOString();
    db.run('UPDATE robots SET locked_until = ? WHERE id = ?', [newLockTime, robotId], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Session extended' });
    });
};

exports.endVisitor = (req, res) => {
    const robotId = req.user.robot_id;
    const visitorId = req.user.id;
    if (!robotId) return res.status(400).json({ error: 'No robot assigned' });

    // Libera el robot para otros
    db.run('UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?', [robotId], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        // Registrar fin de la sesión del visitante
        db.run('UPDATE visitors SET ended_at = CURRENT_TIMESTAMP WHERE id = ?', [visitorId], (err2) => {
            if (err2) console.error('Error updating visitor ended_at', err2);
            res.json({ message: 'Session ended' });
        });
    });
};

exports.login = (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Name/email and password are required' });
    }
    const query = `SELECT * FROM users WHERE name = ? OR email = ? LIMIT 1`;
    db.get(query, [identifier.trim(), identifier.trim().toLowerCase()], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

        if (!['platform_admin', 'museum_admin', 'technician'].includes(user.role)) {
            return res.status(403).json({ error: 'Access denied: Valid administrative role required' });
        }

        try {
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return res.status(401).json({ error: 'Credenciales incorrectas' });

            // Block manually deactivated accounts (active=0 but already activated once)
            if (user.active === 0 && user.must_change_password === 0) {
                return res.status(403).json({ error: 'Esta cuenta ha sido desactivada. Contacta con tu administrador.' });
            }

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
            `UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?`,
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
                `INSERT INTO users (id, name, email, password_hash, role, must_change_password, active, museum_id, created_by) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
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

exports.updateStaff = async (req, res) => {
    const { id } = req.params;
    const { name, email, role } = req.body;
    const reqUserRole = req.user.role;
    const reqMuseumId = req.user.museum_id;

    db.get('SELECT * FROM users WHERE id = ?', [id], (err, targetUser) => {
        if (err || !targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (reqUserRole === 'museum_admin' && targetUser.museum_id !== reqMuseumId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        if (targetUser.role === 'platform_admin' && reqUserRole !== 'platform_admin') {
            return res.status(403).json({ error: 'No autorizado' });
        }

        const updates = [];
        const params = [];
        if (name)  { updates.push('name = ?');  params.push(name.trim()); }
        if (email) { updates.push('email = ?'); params.push(email.trim().toLowerCase()); }
        if (role)  { updates.push('role = ?');  params.push(role); }
        if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

        params.push(id);
        db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'El nombre o email ya está en uso' });
                return res.status(500).json({ error: 'Error al actualizar usuario' });
            }
            res.json({ message: 'Usuario actualizado correctamente' });
        });
    });
};

exports.toggleStaffActive = (req, res) => {
    const { id } = req.params;
    const reqUserRole = req.user.role;
    const reqMuseumId = req.user.museum_id;

    db.get('SELECT * FROM users WHERE id = ?', [id], (err, targetUser) => {
        if (err || !targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (reqUserRole === 'museum_admin' && targetUser.museum_id !== reqMuseumId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        if (targetUser.role === 'platform_admin') {
            return res.status(403).json({ error: 'No se puede modificar una cuenta de super administrador' });
        }

        const newActive = targetUser.active === 1 ? 0 : 1;
        db.run('UPDATE users SET active = ? WHERE id = ?', [newActive, id], (err) => {
            if (err) return res.status(500).json({ error: 'Error al actualizar estado' });
            res.json({ message: 'Estado actualizado', active: newActive });
        });
    });
};

exports.deleteStaff = (req, res) => {
    const { id } = req.params;
    const reqUserRole = req.user.role;
    const reqMuseumId = req.user.museum_id;

    db.get('SELECT * FROM users WHERE id = ?', [id], (err, targetUser) => {
        if (err || !targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (reqUserRole === 'museum_admin' && targetUser.museum_id !== reqMuseumId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        // Only allow deleting accounts that have never been activated
        if (!(targetUser.active === 0 && targetUser.must_change_password === 1)) {
            return res.status(403).json({ error: 'Solo se pueden eliminar cuentas pendientes de activación' });
        }

        db.run('DELETE FROM users WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: 'Error al eliminar usuario' });
            res.json({ message: 'Usuario eliminado correctamente' });
        });
    });
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
