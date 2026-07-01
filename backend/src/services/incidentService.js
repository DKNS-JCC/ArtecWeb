const crypto = require('crypto');
const db = require('../database');

/**
 * Registro de incidencias operativas. Ahora mismo registra fallos de navegación (un
 * goal de Nav2 que terminó ABORTED) para que los técnicos puedan revisarlos a posteriori,
 * aunque ningún administrador estuviera mirando el panel en vivo cuando ocurrió.
 */

function dbGet(sql, params) {
    return new Promise((resolve) => {
        db.get(sql, params, (err, row) => {
            resolve(err ? null : row);
        });
    });
}

function dbAll(sql, params) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function dbRun(sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

/**
 * Registra un fallo de navegación y marca el robot para que el panel pueda mostrarlo
 * en línea. Best-effort: nunca lanza excepciones dentro del flujo de eventos de ROS.
 * @param {string} robotId
 * @param {object} goal  el activeGoal que transporta rosService { placeName, visitorId, museumId, kind }
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

        // Marca el robot para que el panel en vivo muestre un estado en rojo junto a él.
        await dbRun(
            `UPDATE robots SET last_nav_error_at = CURRENT_TIMESTAMP, last_nav_error_place = ? WHERE id = ?`,
            [place, robotId]
        );
    } catch (err) {
        console.error('[Incidents] Failed to record nav failure:', err.message);
    }
}

/**
 * Lista las incidencias visibles para quien las solicita. Los administradores de la
 * plataforma lo ven todo; los administradores/técnicos de museo se limitan a su museo.
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

/** Marca una incidencia como resuelta, limitada al museo del solicitante salvo que sea superadmin. */
function resolve({ id, isSuperAdmin, museumId }) {
    if (isSuperAdmin) {
        return dbRun(`UPDATE incidents SET resolved = 1 WHERE id = ?`, [id]);
    }
    return dbRun(`UPDATE incidents SET resolved = 1 WHERE id = ? AND museum_id = ?`, [id, museumId]);
}

module.exports = { recordNavFailure, list, resolve };
