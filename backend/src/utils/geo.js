/**
 * Geometry helpers for robot localization on a map.
 *
 * Zones store their position in ROS world coordinates (meters). The robot's
 * pose (position_x/position_y) is in the same frame, so we can find the closest
 * waypoint with a plain Euclidean nearest-neighbour search.
 */

const BASE_CATEGORY = 'base';

/**
 * Finds the zone closest to a given world position.
 * @param {number} x  robot world X (meters)
 * @param {number} y  robot world Y (meters)
 * @param {Array}  zones  [{ id, name, category, map_x, map_y }]
 * @param {object} [opts]
 * @param {string} [opts.excludeCategory]  skip zones of this category (e.g. 'base')
 * @param {number} [opts.maxDistance]      ignore matches farther than this (meters)
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
