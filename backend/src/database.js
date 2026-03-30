const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

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
        // 1. Museums
        db.run(`
            CREATE TABLE IF NOT EXISTS museums (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                company TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Users (staff/admins)
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

        // 3. Maps — belong to a museum (not a robot)
        //    A museum can have many maps (floors, sections, etc.)
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
                FOREIGN KEY(museum_id) REFERENCES museums(id)
            )
        `);

        // 4. Robots — belong to a museum, optionally assigned one map
        //    Multiple robots can share the same map
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
                FOREIGN KEY(museum_id) REFERENCES museums(id),
                FOREIGN KEY(map_id) REFERENCES maps(id)
            )
        `);

        // 5. Visitors (temporary QR sessions tied to a robot)
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

        // 6. Zones — belong to a map (not a robot)
        //    Zones are unique per map; different maps have independent zones
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
                FOREIGN KEY(map_id) REFERENCES maps(id)
            )
        `);

        // 7. Chat messages (conversation history + analytics)
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

        // Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_museum_id ON users(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_maps_museum_id ON maps(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_robots_museum_id ON robots(museum_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_robots_map_id ON robots(map_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_zones_map_id ON zones(map_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_visitors_robot_id ON visitors(robot_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_visitors_session_id ON visitors(session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_visitor ON chat_messages(visitor_id)`);
    });
}

module.exports = db;
