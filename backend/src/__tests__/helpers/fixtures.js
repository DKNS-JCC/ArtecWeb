/**
 * Test fixture helpers.
 * All functions return the inserted rows / generated tokens so tests can reference them.
 */
const crypto = require('crypto');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');

const JWT_SECRET   = process.env.JWT_SECRET;
const SALT_ROUNDS  = 1; // Minimal rounds for test speed

// ─── DB Promise Helpers ───────────────────────────────────────────────────────

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
    });
}

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

// ─── Truncate helpers ─────────────────────────────────────────────────────────

/**
 * Waits for the DB schema to be ready (sqlite3 initialises asynchronously).
 * Retries every 150 ms for up to ~3 s.
 */
async function waitForDb(db, maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await dbGet(db, 'SELECT 1 FROM museums LIMIT 1');
            return;
        } catch {
            await new Promise(r => setTimeout(r, 150));
        }
    }
    throw new Error('Test DB not ready after timeout');
}

async function clearAllTables(db) {
    await waitForDb(db);
    const tables = ['chat_messages', 'visitors', 'zones', 'robots', 'maps', 'users', 'museums'];
    for (const t of tables) {
        await dbRun(db, `DELETE FROM ${t}`);
    }
}

// ─── Entity creators ──────────────────────────────────────────────────────────

async function createMuseum(db, overrides = {}) {
    const id   = overrides.id   || crypto.randomUUID();
    const name = overrides.name || 'Museo de Prueba';
    const company = overrides.company || 'Empresa Demo';
    await dbRun(db, `INSERT INTO museums (id, name, company) VALUES (?, ?, ?)`, [id, name, company]);
    return { id, name, company };
}

async function createUser(db, overrides = {}) {
    const id       = overrides.id    || crypto.randomUUID();
    const name     = overrides.name  || 'testuser';
    const email    = overrides.email || 'test@example.com';
    const password = overrides.password || 'TestPass1!';
    const role     = overrides.role  || 'museum_admin';
    const museumId = overrides.museum_id || null;
    const mustChange = overrides.must_change_password !== undefined ? overrides.must_change_password : 0;
    const active   = overrides.active !== undefined ? overrides.active : 1;

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await dbRun(db,
        `INSERT INTO users (id, name, email, password_hash, role, museum_id, must_change_password, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, email, hash, role, museumId, mustChange, active]
    );
    return { id, name, email, password, role, museum_id: museumId };
}

async function createRobot(db, overrides = {}) {
    const id       = overrides.id        || crypto.randomUUID();
    const name     = overrides.name      || 'Robot Test';
    const museumId = overrides.museum_id || null;
    const mapId    = overrides.map_id    || null;
    const status   = overrides.status    || 'idle';
    const ip       = overrides.ip        || null;

    await dbRun(db,
        `INSERT INTO robots (id, name, museum_id, map_id, status, ip) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, museumId, mapId, status, ip]
    );
    return { id, name, museum_id: museumId, map_id: mapId, status };
}

async function lockRobot(db, robotId, visitorId, minutesFromNow = 10) {
    const lockUntil = new Date(Date.now() + minutesFromNow * 60000).toISOString();
    await dbRun(db,
        `UPDATE robots SET locked_until = ?, current_visitor_id = ? WHERE id = ?`,
        [lockUntil, visitorId, robotId]
    );
    return lockUntil;
}

async function createVisitor(db, overrides = {}) {
    const id             = overrides.id             || crypto.randomUUID();
    const sessionId      = overrides.session_id     || crypto.randomUUID();
    const robotId        = overrides.robot_id       || null;
    const name           = overrides.name           || 'Visitante Test';
    const expertiseLevel = overrides.expertise_level || 'general';

    await dbRun(db,
        `INSERT INTO visitors (id, session_id, robot_id, name, expertise_level) VALUES (?, ?, ?, ?, ?)`,
        [id, sessionId, robotId, name, expertiseLevel]
    );
    return { id, session_id: sessionId, robot_id: robotId, name, expertise_level: expertiseLevel };
}

async function createZone(db, overrides = {}) {
    const id          = overrides.id       || crypto.randomUUID();
    const mapId       = overrides.map_id;
    const name        = overrides.name     || 'Sala de Prueba';
    const description = overrides.description || 'Zona de prueba';
    const category    = overrides.category || 'exhibit';
    const mapX        = overrides.map_x    !== undefined ? overrides.map_x : 1.5;
    const mapY        = overrides.map_y    !== undefined ? overrides.map_y : 2.0;

    await dbRun(db,
        `INSERT INTO zones (id, map_id, name, description, category, map_x, map_y) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, mapId, name, description, category, mapX, mapY]
    );
    return { id, map_id: mapId, name, description, map_x: mapX, map_y: mapY };
}

// ─── Token generators ─────────────────────────────────────────────────────────

function makeAdminToken(user) {
    return jwt.sign(
        { id: user.id, name: user.name, role: user.role, museum_id: user.museum_id },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

function makeSuperAdminToken(user) {
    return jwt.sign(
        { id: user.id, name: user.name, role: 'platform_admin', museum_id: null },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

function makeVisitorToken(visitor, robot) {
    return jwt.sign(
        {
            id:         visitor.id,
            session_id: visitor.session_id,
            role:       'visitor',
            robot_id:   robot.id,
            robot_name: robot.name,
            museum_id:  robot.museum_id,
            name:       visitor.name
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

module.exports = {
    clearAllTables,
    createMuseum,
    createUser,
    createRobot,
    lockRobot,
    createVisitor,
    createZone,
    makeAdminToken,
    makeSuperAdminToken,
    makeVisitorToken,
    dbRun,
    dbGet
};
