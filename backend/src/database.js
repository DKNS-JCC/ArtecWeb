const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../../database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        return;
    }
    db.run('PRAGMA foreign_keys = ON');
    initializeDatabase();
});

function initializeDatabase() {
    db.serialize(() => {
        // 1. Museums
        db.run(`
            CREATE TABLE IF NOT EXISTS museums (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                company TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Users
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT CHECK(role IN ('platform_admin', 'museum_admin', 'technician')) NOT NULL,
                active INTEGER DEFAULT 1,
                must_change_password INTEGER DEFAULT 0,
                avatar TEXT,
                museum_id TEXT,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(museum_id) REFERENCES museums(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // 3. Maps — belong to a museum
        db.run(`
            CREATE TABLE IF NOT EXISTS maps (
                id TEXT PRIMARY KEY,
                museum_id TEXT NOT NULL,
                name TEXT NOT NULL,
                image_path TEXT NOT NULL,
                resolution REAL NOT NULL DEFAULT 0.05,
                origin_x REAL NOT NULL DEFAULT 0,
                origin_y REAL NOT NULL DEFAULT 0,
                origin_theta REAL NOT NULL DEFAULT 0,
                width INTEGER NOT NULL DEFAULT 0,
                height INTEGER NOT NULL DEFAULT 0,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(museum_id) REFERENCES museums(id) ON DELETE CASCADE
            )
        `);

        // 4. Robots — belong to a museum, assigned one map
        db.run(`
            CREATE TABLE IF NOT EXISTS robots (
                id TEXT PRIMARY KEY,
                museum_id TEXT,
                map_id TEXT,
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
                last_nav_error_at DATETIME,
                last_nav_error_place TEXT,
                FOREIGN KEY(museum_id) REFERENCES museums(id) ON DELETE CASCADE,
                FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE SET NULL
            )
        `);

        // 5. Visitors
        db.run(`
            CREATE TABLE IF NOT EXISTS visitors (
                id TEXT PRIMARY KEY,
                session_id TEXT UNIQUE NOT NULL,
                robot_id TEXT,
                name TEXT,
                expertise_level TEXT DEFAULT 'general',
                language TEXT DEFAULT 'es',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                deleted_at DATETIME,
                FOREIGN KEY(robot_id) REFERENCES robots(id) ON DELETE CASCADE
            )
        `);

        // 6. Zones — belong to a map
        db.run(`
            CREATE TABLE IF NOT EXISTS zones (
                id TEXT PRIMARY KEY,
                map_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT DEFAULT 'exhibit',
                map_x REAL,
                map_y REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
            )
        `);

        // 7. Chat messages
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
                FOREIGN KEY(visitor_id) REFERENCES visitors(id) ON DELETE CASCADE,
                FOREIGN KEY(robot_id) REFERENCES robots(id) ON DELETE CASCADE
            )
        `);

        // 8. Incidents
        db.run(`
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                museum_id TEXT,
                robot_id TEXT,
                visitor_id TEXT,
                type TEXT NOT NULL,
                place_name TEXT,
                detail TEXT,
                resolved INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(museum_id) REFERENCES museums(id) ON DELETE CASCADE,
                FOREIGN KEY(robot_id)  REFERENCES robots(id) ON DELETE CASCADE,
                FOREIGN KEY(visitor_id) REFERENCES visitors(id) ON DELETE SET NULL
            )
        `);

        // 9. Password reset tokens
        db.run(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL,
                expires_at DATETIME NOT NULL,
                used INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 10.Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_museum_id ON users(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_maps_museum_id ON maps(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_robots_museum_id ON robots(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_robots_map_id ON robots(map_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_zones_map_id ON zones(map_id)`);
        
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_zones_one_base_per_map ON zones(map_id) WHERE category = 'base'`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_visitors_robot_id ON visitors(robot_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_visitors_ended_at ON visitors(ended_at)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time ON chat_messages(session_id, created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_visitor ON chat_messages(visitor_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_incidents_museum ON incidents(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at)`);
    });
}

module.exports = db;
