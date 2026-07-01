const db = require('../database');
const rosService = require('./rosService');
const { BASE_CATEGORY } = require('../utils/geo');

function dbGet(sql, params) {
    return new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row)));
}

/**
 * Envía un robot al punto base de su mapa (su ubicación de origen / de retorno).
 *
 * Es "best-effort" por diseño: quien lo invoca al finalizar la sesión ignora el
 * resultado, de modo que un robot desconectado o un mapa sin base nunca bloqueen
 * el fin de una visita. El endpoint manual de administración inspecciona el `reason`
 * devuelto para dar feedback.
 *
 * @returns {Promise<Object>} Resultado con la forma: { ok: boolean, reason?: string, base?: object, error?: string }
 */
async function sendRobotToBase(robotId) {
    const robot = await dbGet('SELECT map_id, museum_id FROM robots WHERE id = ?', [robotId]);
    if (!robot?.map_id) return { ok: false, reason: 'no_map' };

    const base = await dbGet(
        'SELECT name, map_x, map_y FROM zones WHERE map_id = ? AND category = ? LIMIT 1',
        [robot.map_id, BASE_CATEGORY]
    );
    if (!base || base.map_x == null || base.map_y == null) return { ok: false, reason: 'no_base' };

    if (!rosService.getConnectionState(robotId)) return { ok: false, reason: 'not_connected' };

    try {
        // qz=0, qw=1 → orientación identidad (mira hacia +X del mapa). La base solo necesita la posición.
        rosService.sendNavGoal(robotId, base.map_x, base.map_y, 0, 1, {
            kind:      'base',
            placeName: base.name,
            museumId:  robot.museum_id,
        });
        db.run(`UPDATE robots SET status = 'navigating', last_update = CURRENT_TIMESTAMP WHERE id = ?`, [robotId]);
        return { ok: true, base: { name: base.name, x: base.map_x, y: base.map_y } };
    } catch (e) {
        return { ok: false, reason: 'ros_error', error: e.message };
    }
}

module.exports = { sendRobotToBase };
