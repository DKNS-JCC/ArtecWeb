const crypto = require('crypto');
const db = require('../database');

/**
 * Operational incident log. Right now it records navigation failures (a Nav2
 * goal that ended ABORTED) so technicians can review them after the fact, even
 * if no admin was watching the live dashboard when it happened.
 */

function dbGet(sql, params) {
    return new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row)));
}

function dbAll(sql, params) {
    return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}

function dbRun(sql, params) {
    return new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}

/**
 * Record a navigation failure and flag the robot so the dashboard can show it
 * inline. Best-effort: never throws into the ROS event path.
 * @param {string} robotId
 * @param {object} goal  the activeGoal carried by rosService { placeName, visitorId, museumId, kind }
 */
async function recordNavFailure(robotId, goal = {}) {
    try {
        let museumId = goal.museumId;
        if (!museumId) {
            const robot = await dbGet('SELECT museum_id FROM robots WHERE id = ?', [robotId]);
            museumId = robot?.museum_id || null;
        }

        const place  = goal.placeName || null;
        const detail = place
            ? `El robot no pudo llegar a "${place}". Posible obstáculo o ruta bloqueada.`
            : 'El robot no pudo completar la navegación. Posible obstáculo o ruta bloqueada.';

        await dbRun(
            `INSERT INTO incidents (id, museum_id, robot_id, visitor_id, type, place_name, detail)
             VALUES (?, ?, ?, ?, 'nav_failed', ?, ?)`,
            [crypto.randomUUID(), museumId, robotId, goal.visitorId || null, place, detail]
        );

        // Mark the robot so the live dashboard shows a red state next to it.
        await dbRun(
            `UPDATE robots SET last_nav_error_at = CURRENT_TIMESTAMP, last_nav_error_place = ? WHERE id = ?`,
            [place, robotId]
        );
    } catch (err) {
        console.error('[Incidents] Failed to record nav failure:', err.message);
    }
}

/**
 * List incidents visible to the requester. Platform admins see everything;
 * museum admins/technicians are scoped to their museum.
 */
function list({ isSuperAdmin, museumId, limit = 100 }) {
    const base = `
        SELECT i.id, i.type, i.place_name, i.detail, i.resolved, i.created_at,
               i.robot_id, r.name AS robot_name, i.museum_id, m.name AS museum_name,
               i.visitor_id, v.name AS visitor_name
        FROM incidents i
        LEFT JOIN robots   r ON r.id = i.robot_id
        LEFT JOIN museums  m ON m.id = i.museum_id
        LEFT JOIN visitors v ON v.id = i.visitor_id`;
    if (isSuperAdmin) {
        return dbAll(`${base} ORDER BY i.created_at DESC LIMIT ?`, [limit]);
    }
    return dbAll(`${base} WHERE i.museum_id = ? ORDER BY i.created_at DESC LIMIT ?`, [museumId, limit]);
}

/** Mark an incident resolved, scoped to the requester's museum unless superadmin. */
function resolve({ id, isSuperAdmin, museumId }) {
    if (isSuperAdmin) {
        return dbRun(`UPDATE incidents SET resolved = 1 WHERE id = ?`, [id]);
    }
    return dbRun(`UPDATE incidents SET resolved = 1 WHERE id = ? AND museum_id = ?`, [id, museumId]);
}

module.exports = { recordNavFailure, list, resolve };
