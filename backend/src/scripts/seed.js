const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../../database/database.sqlite');
const uploadsPath = path.resolve(__dirname, '../../../uploads/avatars');

// Remove existing database if exists to ensure a clean slate
if (fs.existsSync(dbPath)) {
    console.log('Removing old database...');
    fs.unlinkSync(dbPath);
}
// Also clean avatars to avoid orphans
if (fs.existsSync(uploadsPath)) {
    fs.readdirSync(uploadsPath).forEach(f => fs.unlinkSync(path.join(uploadsPath, f)));
}

const db = new sqlite3.Database(dbPath, async (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        process.exit(1);
    }

    console.log('Database connected. Initializing schema...');

    db.serialize(() => {
        // Create tables
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
        `, async () => {
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
        const passPlatform = '123456';
        const passMuseum = '123456';
        const passTech = '123456';

        const hashPlatform = await bcrypt.hash(passPlatform, saltRounds);
        const hashMuseum = await bcrypt.hash(passMuseum, saltRounds);
        const hashTech = await bcrypt.hash(passTech, saltRounds);

        // 1. Create Museum
        const museumId = crypto.randomUUID();
        await runCommand(
            `INSERT INTO museums (id, name, company) VALUES (?, ?, ?)`,
            [museumId, 'Museo del Prado Demo', 'Demo Client']
        );

        // 2. Create Platform Admin
        const platformAdminId = crypto.randomUUID();
        const platformEmail = 'platform@demo.com';
        await runCommand(
            `INSERT INTO users (id, name, email, password_hash, role, active, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [platformAdminId, 'Admin Plataforma', platformEmail, hashPlatform, 'platform_admin', 1, 0]
        );

        // 3. Create Museum Admin
        const museumAdminId = crypto.randomUUID();
        const museumEmail = 'admin@prado-demo.com';
        await runCommand(
            `INSERT INTO users (id, name, email, password_hash, role, active, museum_id, created_by, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [museumAdminId, 'Admin Museo', museumEmail, hashMuseum, 'museum_admin', 1, museumId, platformAdminId, 0]
        );

        // 4. Create Technician
        const techId = crypto.randomUUID();
        const techEmail = 'tech@prado-demo.com';
        await runCommand(
            `INSERT INTO users (id, name, email, password_hash, role, active, museum_id, created_by, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [techId, 'Técnico Museo', techEmail, hashTech, 'technician', 1, museumId, museumAdminId, 0]
        );

        console.log('\n=============================================');
        console.log('✅ Seed completed successfully!');
        console.log('=============================================\n');

        console.log('Platform Admin:');
        console.log('email: ' + platformEmail);
        console.log('password: ' + passPlatform + '\n');

        console.log('Museum Admin:');
        console.log('email: ' + museumEmail);
        console.log('password: ' + passMuseum + '\n');

        console.log('Technician:');
        console.log('email: ' + techEmail);
        console.log('password: ' + passTech + '\n');

    } catch (err) {
        console.error('Error during seeding:', err);
    } finally {
        db.close();
    }
}
