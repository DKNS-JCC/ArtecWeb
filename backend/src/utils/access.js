/**
 * @file Helpers de control de acceso por museo.
 *
 * Toda la API multi-museo comparte la misma regla: un `platform_admin` ve todos
 * los museos, mientras que el resto de roles quedan acotados al suyo. Antes esa
 * regla se repetía en cada consulta como un `isSuperAdmin ? sqlGlobal : sqlAcotado`,
 * duplicando decenas de sentencias SQL casi idénticas. Estos helpers la centralizan.
 * @module utils/access
 */
const { dbGet } = require('./db');

/**
 * Construye el fragmento WHERE que acota una consulta al museo del usuario.
 * Para un superadministrador devuelve un fragmento vacío (sin filtro).
 *
 * Pensado para consultas tipo listado que arman su WHERE dinámicamente:
 * el llamador decide dónde inyectar `clause` y concatena `params`.
 *
 * @param {boolean} isSuperAdmin  `true` si el usuario es platform_admin.
 * @param {string|null} museumId  Museo al que acotar (ignorado si es superadmin).
 * @param {string} [column='museum_id']  Columna museum_id ya cualificada (p.ej. 'r.museum_id').
 * @returns {{ clause: string, params: Array }}  `clause` vacío si es superadmin.
 */
function museumScope(isSuperAdmin, museumId, column = 'museum_id') {
    if (isSuperAdmin) return { clause: '', params: [] };
    return { clause: `${column} = ?`, params: [museumId] };
}

/**
 * Carga un robot aplicando el control de acceso por museo en la propia consulta.
 * Sustituye al patrón repetido `SELECT ... FROM robots WHERE id = ? [AND museum_id = ?]`
 * que aparecía en casi todas las rutas de robots.
 *
 * @param {string} robotId
 * @param {{ role: string, museum_id?: string }} user  `req.user`.
 * @param {string} [columns='*']  Columnas a seleccionar (literal del propio código, nunca entrada del usuario).
 * @returns {Promise<Object|undefined>}  El robot, o `undefined` si no existe o el usuario no tiene acceso.
 */
function loadRobotForUser(robotId, user, columns = '*') {
    const isSuperAdmin = user.role === 'platform_admin';
    return isSuperAdmin
        ? dbGet(`SELECT ${columns} FROM robots WHERE id = ?`, [robotId])
        : dbGet(`SELECT ${columns} FROM robots WHERE id = ? AND museum_id = ?`, [robotId, user.museum_id]);
}

module.exports = { museumScope, loadRobotForUser };
