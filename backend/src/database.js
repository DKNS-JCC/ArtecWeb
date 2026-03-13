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
        // 1. Create museums table
        db.run(`
            CREATE TABLE IF NOT EXISTS museums (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                company TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Create users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user' CHECK(role IN ('platform_admin', 'museum_admin', 'technician', 'user')),
                active INTEGER DEFAULT 1,
                must_change_password INTEGER DEFAULT 0,
                avatar TEXT,
                museum_id TEXT,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(museum_id) REFERENCES museums(id),
                FOREIGN KEY(created_by) REFERENCES users(id)
            )
        `);

        // 3. Create robots table
        db.run(`
            CREATE TABLE IF NOT EXISTS robots (
                id TEXT PRIMARY KEY,
                museum_id TEXT,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'idle',
                battery INTEGER DEFAULT 100,
                position_x REAL DEFAULT 0,
                position_y REAL DEFAULT 0,
                position_theta REAL DEFAULT 0,
                last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(museum_id) REFERENCES museums(id)
            )
        `);
    });
}

module.exports = db;
