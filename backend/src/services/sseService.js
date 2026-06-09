const db      = require('../database');
const rosService = require('./rosService');
const incidentService = require('./incidentService');
const zoneCache = require('../utils/zoneCache');
const { findNearestZone } = require('../utils/geo');

/**
 * Server-Sent Events broadcast hub for the robot fleet.
 *
 * Architecture:
 *  • Each admin tab opens one long-lived GET /api/robots/stream connection.
 *  • The hub holds all active SSE response objects, grouped by museum.
 *  • rosService emits robot:update / robot:connect / robot:disconnect events
 *    → the hub fetches the freshest robot row from the DB and pushes it to
 *    every client that has visibility over that robot.
 *  • A heartbeat is sent every 25 s to prevent proxy/load-balancer timeouts.
 *
 * This replaces N×HTTP-poll requests with a single persistent connection per
 * browser tab, completely bypassing the rate limiter.
 */

// clients: Map<res, { museumId: string|null, isSuperAdmin: boolean }>
const clients = new Map();

// positionClients: Map<res, { robotId: string }> — visitor map overlays that
// only need their assigned robot's live pose (replaces the 3 s HTTP poll).
const positionClients = new Map();

const HEARTBEAT_MS = 25_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(res, event, data) {
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) { /* client already gone */ }
}

function writeSseHeaders(res) {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();
}

function dbGetRobot(robotId) {
    return new Promise((resolve) => {
        db.get(
            `SELECT r.*, v.name AS visitor_name
             FROM robots r
             LEFT JOIN visitors v ON r.current_visitor_id = v.id
             WHERE r.id = ?`,
            [robotId],
            (err, row) => resolve(err ? null : row)
        );
    });
}

function formatRobot(row) {
    if (!row) return null;
    const now      = new Date();
    const isLocked = row.locked_until && new Date(row.locked_until) > now;
    // Nearest waypoint to the live pose (zones cached so this stays cheap on
    // the high-frequency odometry broadcast path).
    const nearest = findNearestZone(row.position_x, row.position_y, zoneCache.get(row.map_id));
    return {
        id:           row.id,
        name:         row.name,
        ip:           row.ip,
        connected:    rosService.getConnectionState(row.id),
        status:       row.status,
        battery:      row.battery,
        position:     { x: row.position_x, y: row.position_y, theta: row.position_theta },
        last_update:  row.last_update,
        museum_id:    row.museum_id,
        map_id:       row.map_id,
        current_location: nearest ? { name: nearest.name, category: nearest.category, distance: Math.round(nearest.distance * 100) / 100 } : null,
        is_occupied:  isLocked,
        locked_until: row.locked_until,
        visitor_name: isLocked ? (row.visitor_name || 'Visitante Anónimo') : null,
        last_nav_error_at:    row.last_nav_error_at    || null,
        last_nav_error_place: row.last_nav_error_place || null,
    };
}

/** Push a single robot update to all clients that can see it. */
async function broadcastRobot(robotId) {
    if (clients.size === 0) return;
    const row = await dbGetRobot(robotId);
    if (!row) return;
    const payload = formatRobot(row);

    for (const [res, meta] of clients) {
        if (meta.isSuperAdmin || meta.museumId === row.museum_id) {
            send(res, 'robot', payload);
        }
    }
}

// ── Visitor position stream ─────────────────────────────────────────────────

function dbGetPosition(robotId) {
    return new Promise((resolve) => {
        db.get(
            'SELECT position_x, position_y, position_theta, last_update FROM robots WHERE id = ?',
            [robotId],
            (err, row) => resolve(err ? null : row)
        );
    });
}

function formatPosition(row) {
    if (!row) return null;
    return {
        x:           row.position_x,
        y:           row.position_y,
        theta:       row.position_theta,
        last_update: row.last_update,
    };
}

/** Push the live pose to every visitor watching this specific robot. */
async function broadcastPosition(robotId) {
    if (positionClients.size === 0) return;
    const payload = formatPosition(await dbGetPosition(robotId));
    if (!payload) return;
    for (const [res, meta] of positionClients) {
        if (meta.robotId === robotId) send(res, 'position', payload);
    }
}

/** Push a navigation outcome (arrived / failed) to the visitor watching this robot. */
function broadcastNav(robotId, payload) {
    if (positionClients.size === 0) return;
    for (const [res, meta] of positionClients) {
        if (meta.robotId === robotId) send(res, 'nav', payload);
    }
}

// ── rosService event listeners ────────────────────────────────────────────────

rosService.on('robot:update', ({ robotId }) => {
    broadcastRobot(robotId);
    broadcastPosition(robotId);
});

rosService.on('robot:connect', ({ robotId }) => {
    broadcastRobot(robotId);
});

rosService.on('robot:disconnect', ({ robotId }) => {
    broadcastRobot(robotId);
});

// A navigation goal reached a terminal state. On failure: log an incident and
// refresh the admin dashboard (red state). For visitor-initiated goals, tell the
// visitor's chat the outcome so it can confirm arrival or offer a retry.
rosService.on('robot:nav_result', async ({ robotId, outcome, goal }) => {
    if (outcome === 'aborted') {
        await incidentService.recordNavFailure(robotId, goal);
        broadcastRobot(robotId);
    }
    if (goal?.kind === 'visit' && outcome !== 'canceled') {
        broadcastNav(robotId, {
            outcome,                              // 'succeeded' | 'aborted'
            place_name: goal.placeName || null,
            place_id:   goal.placeId   || null,
        });
    }
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a new SSE client.
 * Sends an initial snapshot of all robots visible to this client,
 * then registers heartbeat and cleanup handlers.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {{ id: string, role: string, museum_id: string|null }} user  JWT payload
 */
function addClient(req, res, user) {
    writeSseHeaders(res);

    const isSuperAdmin = user.role === 'platform_admin';
    const museumId     = user.museum_id ?? null;

    clients.set(res, { museumId, isSuperAdmin });

    // Send initial snapshot
    let query  = `SELECT r.*, v.name AS visitor_name FROM robots r LEFT JOIN visitors v ON r.current_visitor_id = v.id`;
    let params = [];
    if (!isSuperAdmin) { query += ` WHERE r.museum_id = ?`; params = [museumId]; }

    db.all(query, params, (err, rows) => {
        if (err || !rows) return;
        rows.forEach(row => send(res, 'robot', formatRobot(row)));
        send(res, 'ready', { ts: Date.now() });
    });

    // Heartbeat to keep the connection alive through proxies
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch (_) { cleanup(); }
    }, HEARTBEAT_MS);

    function cleanup() {
        clearInterval(heartbeat);
        clients.delete(res);
    }

    req.on('close',   cleanup);
    req.on('aborted', cleanup);
}

/**
 * Register a visitor position-stream client.
 * Sends the robot's current pose immediately, then pushes every subsequent
 * pose update broadcast by rosService. One connection per visitor map view.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {string} robotId  the robot assigned to the visitor's session
 */
function addPositionClient(req, res, robotId) {
    writeSseHeaders(res);

    positionClients.set(res, { robotId });

    // Send initial snapshot so the overlay appears without waiting for an update
    dbGetPosition(robotId).then((row) => {
        const payload = formatPosition(row);
        if (payload) send(res, 'position', payload);
        send(res, 'ready', { ts: Date.now() });
    });

    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch (_) { cleanup(); }
    }, HEARTBEAT_MS);

    function cleanup() {
        clearInterval(heartbeat);
        positionClients.delete(res);
    }

    req.on('close',   cleanup);
    req.on('aborted', cleanup);
}

module.exports = { addClient, broadcastRobot, addPositionClient };
