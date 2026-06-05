const db = require('../database');
const rosService = require('./rosService');
const { BASE_CATEGORY } = require('../utils/geo');

function dbGet(sql, params) {
    return new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row)));
}

/**
 * Sends a robot to its map's base point (its home / return location).
 *
 * Best-effort by design: callers on the session-end path ignore the result so a
 * disconnected robot or a map without a base never blocks ending a visit. The
 * manual admin endpoint inspects the returned `reason` to give feedback.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, base?: object, error?: string }>}
 */
async function sendRobotToBase(robotId) {
    const robot = await dbGet('SELECT map_id FROM robots WHERE id = ?', [robotId]);
    if (!robot?.map_id) return { ok: false, reason: 'no_map' };

    const base = await dbGet(
        'SELECT name, map_x, map_y FROM zones WHERE map_id = ? AND category = ? LIMIT 1',
        [robot.map_id, BASE_CATEGORY]
    );
    if (!base || base.map_x == null || base.map_y == null) return { ok: false, reason: 'no_base' };

    if (!rosService.getConnectionState(robotId)) return { ok: false, reason: 'not_connected' };

    try {
        // qz=0, qw=1 → identity orientation (face map +X). Base only needs position.
        rosService.sendNavGoal(robotId, base.map_x, base.map_y, 0, 1);
        db.run(`UPDATE robots SET status = 'navigating', last_update = CURRENT_TIMESTAMP WHERE id = ?`, [robotId]);
        return { ok: true, base: { name: base.name, x: base.map_x, y: base.map_y } };
    } catch (e) {
        return { ok: false, reason: 'ros_error', error: e.message };
    }
}

module.exports = { sendRobotToBase };
