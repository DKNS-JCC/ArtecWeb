const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, '../../database/database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        return;
    }
    initializeDatabase();
});

function initializeDatabase() {
    db.serialize(() => {
        db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin', 'tecnico')),
        must_change_password INTEGER DEFAULT 0,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
            if (err) {
                console.error('Error creating users table:', err.message);
                return;
            }

            // Try to add avatar column to existing db (fails silently if already exists)
            db.run(`ALTER TABLE users ADD COLUMN avatar TEXT;`, (alterErr) => {
                // Ignore error, it means the column already exists
                seedAdminUser();
            });
        });
    });
}

function seedAdminUser() {
    // Check if any admin exists
    db.get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`, async (err, row) => {
        if (err) {
            console.error('Error checking for admin:', err.message);
            return;
        }

        if (!row) {
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash('admin1234', saltRounds);

            db.run(
                `INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)`,
                ['admin', 'admin@artec.local', passwordHash, 'admin', 1],
                (err) => {
                    if (err) {
                        console.error('Error creating default admin:', err.message);
                    } else {
                        console.log('======================================================');
                        console.log(' Default admin account created:');
                        console.log('   Username: admin');
                        console.log('   Password: admin1234');
                        console.log('Change this password after first login!');
                        console.log('======================================================');
                    }
                }
            );
        }
    });
}

module.exports = db;
