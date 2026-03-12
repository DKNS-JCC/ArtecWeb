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
                    user: { id: this.lastID, username: username.trim(), email: email.trim().toLowerCase(), role: 'user' }
                });
            }
        );
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

// ──────── PUBLIC: Login (username OR email) ────────
exports.login = (req, res) => {
    const { identifier, password } = req.body; // 'identifier' = username or email

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Username/email and password are required' });
    }

    // Match either username or email
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
                user: { id: user.id, username: user.username, email: user.email, role: user.role }
            });
        } catch {
            res.status(500).json({ error: 'Server error during login' });
        }
    });
};

// ──────── PROTECTED: Change Password ────────
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

                // Issue a new token with must_change_password = false
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
