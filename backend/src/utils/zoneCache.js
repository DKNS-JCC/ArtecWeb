/**
 * Caché ligera en memoria de las zonas por mapa.
 *
 * El hub SSE difunde actualizaciones del robot en cada tick de odometría (varios Hz), y
 * cada difusión necesita la "ubicación actual" del robot (la zona más cercana). Consultar
 * la tabla de zonas en cada tick sería un derroche, así que las cacheamos por mapa y solo
 * recargamos cuando las zonas cambian (crear/actualizar/borrar) o se elimina un mapa.
 *
 * `get()` es síncrona y devuelve el array cacheado (posiblemente un array vacío en la
 * primerísima llamada mientras la carga asíncrona está en curso - es aceptable, el
 * siguiente tick ya tendrá los datos). Los endpoints HTTP que necesiten frescura fuerte
 * deben consultar la BD directamente en vez de usar esta caché.
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

/** Devuelve las zonas cacheadas de un mapa (dispara una carga en segundo plano en el primer fallo). */
function get(mapId) {
    if (!mapId) return [];
    if (!cache.has(mapId)) {
        cache.set(mapId, []);   // marcador para evitar cargas repetidas
        load(mapId);
    }
    return cache.get(mapId);
}

/** Recarga las zonas de un mapa tras una mutación (o cuando cambian sus zonas). */
function invalidate(mapId) {
    if (mapId) load(mapId);
}

module.exports = { get, invalidate };
