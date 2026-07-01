/**
 * Helpers de geometría para la localización del robot en un mapa.
 *
 * Las zonas guardan su posición en coordenadas del mundo de ROS (metros). La pose
 * del robot (position_x/position_y) está en el mismo marco, así que podemos encontrar
 * el waypoint más cercano con una simple búsqueda del vecino más próximo (euclídea).
 */

const BASE_CATEGORY = 'base';

/**
 * Encuentra la zona más cercana a una posición del mundo dada.
 * @param {number} x  X del robot en el mundo (metros)
 * @param {number} y  Y del robot en el mundo (metros)
 * @param {Array}  zones  [{ id, name, category, map_x, map_y }]
 * @param {object} [opts]
 * @param {string} [opts.excludeCategory]  omite las zonas de esta categoría (p. ej. 'base')
 * @param {number} [opts.maxDistance]      ignora coincidencias más lejanas que esto (metros)
 * @returns {{ id, name, category, distance }|null}
 */
function findNearestZone(x, y, zones, opts = {}) {
    if (x == null || y == null || !Array.isArray(zones) || zones.length === 0) return null;

    const { excludeCategory, maxDistance } = opts;
    let best = null;
    let bestSq = Infinity;

    for (const z of zones) {
        if (z.map_x == null || z.map_y == null) continue;
        if (excludeCategory && z.category === excludeCategory) continue;
        const dx = x - z.map_x;
        const dy = y - z.map_y;
        const sq = dx * dx + dy * dy;
        if (sq < bestSq) { bestSq = sq; best = z; }
    }

    if (!best) return null;
    const distance = Math.sqrt(bestSq);
    if (maxDistance != null && distance > maxDistance) return null;

    return { id: best.id, name: best.name, category: best.category, distance };
}

module.exports = { findNearestZone, BASE_CATEGORY };
