/**
 * Lightweight in-memory cache of zones per map.
 *
 * The SSE hub broadcasts robot updates on every odometry tick (several Hz), and
 * each broadcast wants the robot's "current location" (nearest zone). Querying
 * the zones table on every tick would be wasteful, so we cache them per map and
 * only reload when zones are mutated (create/update/delete) or a map is removed.
 *
 * `get()` is synchronous and returns the cached array (possibly an empty array
 * on the very first call while the async load is in flight - acceptable, the
 * next tick will have the data). HTTP endpoints that need strong freshness
 * should query the DB directly instead of using this cache.
 */
const db = require('../database');

const cache = new Map();   // map_id -> zones[]

function load(mapId) {
    db.all(
        'SELECT id, name, category, map_x, map_y FROM zones WHERE map_id = ?',
        [mapId],
        (err, rows) => { if (!err) cache.set(mapId, rows || []); }
    );
}

/** Returns cached zones for a map (triggers a background load on first miss). */
function get(mapId) {
    if (!mapId) return [];
    if (!cache.has(mapId)) {
        cache.set(mapId, []);   // placeholder to avoid repeated loads
        load(mapId);
    }
    return cache.get(mapId);
}

/** Reload a map's zones after a mutation (or after the map's zones change). */
function invalidate(mapId) {
    if (mapId) load(mapId);
}

module.exports = { get, invalidate };
