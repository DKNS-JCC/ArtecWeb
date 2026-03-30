const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../../database/database.sqlite');
const uploadsAvatarsPath = path.resolve(__dirname, '../../../uploads/avatars');

// Remove existing database to start clean
if (fs.existsSync(dbPath)) {
    console.log('Removing old database...');
    fs.unlinkSync(dbPath);
}
if (fs.existsSync(uploadsAvatarsPath)) {
    fs.readdirSync(uploadsAvatarsPath).forEach(f => fs.unlinkSync(path.join(uploadsAvatarsPath, f)));
}

const db = new sqlite3.Database(dbPath, async (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        process.exit(1);
    }

    console.log('Database connected. Initializing schema...');

    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS museums (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                company TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

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
        db.run(`CREATE INDEX IF NOT EXISTS idx_visitors_session_id ON visitors(session_id)`, async () => {
            console.log('Schema ready. Seeding data...');
            await seedData();
        });
    });
});

async function runCommand(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function seedData() {
    try {
        const saltRounds = 10;
        const pass = '123456';
        const hashPlatform = await bcrypt.hash(pass, saltRounds);
        const hashMuseum = await bcrypt.hash(pass, saltRounds);
        const hashTech = await bcrypt.hash(pass, saltRounds);

        // 1. Museum
        const museumId = crypto.randomUUID();
        await runCommand(
            `INSERT INTO museums (id, name, company) VALUES (?, ?, ?)`,
            [museumId, 'Museo del Prado Demo', 'Demo Client']
        );

        // 2. Platform Admin
        const platformAdminId = crypto.randomUUID();
        const platformEmail = 'platform@demo.com';
        await runCommand(
            `INSERT INTO users (id, name, email, password_hash, role, active, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [platformAdminId, 'Admin Plataforma', platformEmail, hashPlatform, 'platform_admin', 1, 0]
        );

        // 3. Museum Admin
        const museumAdminId = crypto.randomUUID();
        const museumEmail = 'admin@prado-demo.com';
        await runCommand(
            `INSERT INTO users (id, name, email, password_hash, role, active, museum_id, created_by, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [museumAdminId, 'Admin Museo', museumEmail, hashMuseum, 'museum_admin', 1, museumId, platformAdminId, 0]
        );

        // 4. Technician
        const techId = crypto.randomUUID();
        const techEmail = 'tech@prado-demo.com';
        await runCommand(
            `INSERT INTO users (id, name, email, password_hash, role, active, museum_id, created_by, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [techId, 'Técnico Museo', techEmail, hashTech, 'technician', 1, museumId, museumAdminId, 0]
        );

        // 5. Demo robot (no map assigned yet)
        const robotId = crypto.randomUUID();
        await runCommand(
            `INSERT INTO robots (id, museum_id, name, status) VALUES (?, ?, ?, ?)`,
            [robotId, museumId, 'Robot Guía Demo', 'idle']
        );

        console.log('\n=============================================');
        console.log('Seed completed successfully!');
        console.log('=============================================\n');
        console.log('Museum ID:', museumId);
        console.log('\nPlatform Admin:');
        console.log('  email:', platformEmail, '  password:', pass);
        console.log('\nMuseum Admin:');
        console.log('  email:', museumEmail, '  password:', pass);
        console.log('\nTechnician:');
        console.log('  email:', techEmail, '  password:', pass);
        console.log('\nDemo Robot ID:', robotId, '(no map assigned)\n');

    } catch (err) {
        console.error('Error during seeding:', err);
    } finally {
        db.close();
    }
}
