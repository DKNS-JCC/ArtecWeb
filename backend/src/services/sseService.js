const db      = require('../database');
const rosService = require('./rosService');

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

const HEARTBEAT_MS = 25_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(res, event, data) {
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) { /* client already gone */ }
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
        is_occupied:  isLocked,
        locked_until: row.locked_until,
        visitor_name: isLocked ? (row.visitor_name || 'Visitante Anónimo') : null,
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

// ── rosService event listeners ────────────────────────────────────────────────

rosService.on('robot:update', ({ robotId }) => {
    broadcastRobot(robotId);
});

rosService.on('robot:connect', ({ robotId }) => {
    broadcastRobot(robotId);
});

rosService.on('robot:disconnect', ({ robotId }) => {
    broadcastRobot(robotId);
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
    // SSE headers
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

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

module.exports = { addClient, broadcastRobot };
