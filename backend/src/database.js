const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const dbDir = path.resolve(__dirname, '../../database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');

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

        // 2. Create users table (Only admins and technicians)
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT CHECK(role IN ('platform_admin', 'museum_admin', 'technician')),
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

        // 3. Create visitors table (Temporary access tied to a robot)
        db.run(`
            CREATE TABLE IF NOT EXISTS visitors (
                id TEXT PRIMARY KEY,
                session_id TEXT UNIQUE NOT NULL,
                robot_id TEXT,
                name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                FOREIGN KEY(robot_id) REFERENCES robots(id)
            )
        `);

        // 4. Create robots table
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
                locked_until TEXT,
                current_visitor_id TEXT,
                ip TEXT,
                FOREIGN KEY(museum_id) REFERENCES museums(id)
            )
        `);

        // 5. Create museum_maps table (SLAM-exported map per museum)
        db.run(`
            CREATE TABLE IF NOT EXISTS museum_maps (
                id TEXT PRIMARY KEY,
                museum_id TEXT NOT NULL UNIQUE,
                image_path TEXT NOT NULL,
                resolution REAL NOT NULL DEFAULT 0.05,
                origin_x REAL NOT NULL DEFAULT 0,
                origin_y REAL NOT NULL DEFAULT 0,
                origin_theta REAL NOT NULL DEFAULT 0,
                width INTEGER NOT NULL DEFAULT 0,
                height INTEGER NOT NULL DEFAULT 0,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(museum_id) REFERENCES museums(id)
            )
        `);

        // 6. Create museum_places table (zones placed on the map)
        db.run(`
            CREATE TABLE IF NOT EXISTS museum_places (
                id TEXT PRIMARY KEY,
                museum_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT DEFAULT 'exhibit',
                map_x REAL,
                map_y REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(museum_id) REFERENCES museums(id)
            )
        `);

        // 7. Create chat_messages table (conversation context + analytics)
        db.run(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                visitor_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                robot_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                intent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(visitor_id) REFERENCES visitors(id),
                FOREIGN KEY(robot_id) REFERENCES robots(id)
            )
        `);

        // Indexes for frequently queried columns
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_museum_id ON users(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_robots_museum_id ON robots(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_visitors_robot_id ON visitors(robot_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_visitors_session_id ON visitors(session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_museum_maps_museum ON museum_maps(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_museum_places_museum ON museum_places(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_visitor ON chat_messages(visitor_id)`);
    });
}

module.exports = db;
