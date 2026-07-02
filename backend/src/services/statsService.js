/**
 * @file Métricas del panel de administración.
 *
 * Antes vivía en línea dentro del fichero de rutas: 9 métricas escritas cada una
 * dos veces (variante global y variante acotada al museo), ~18 sentencias SQL.
 * Aquí se colapsa cada par en una sola consulta con el patrón `(? OR r.museum_id = ?)`:
 * el primer parámetro vale 1 para un superadministrador, cortocircuita el OR y
 * desactiva el filtro; para el resto vale 0 y aplica el `museum_id`.
 *
 * Nota: ese OR impide que SQLite use el índice de `museum_id`, pero el panel no es
 * una ruta caliente y el volumen de datos de una guía de museo es pequeño, así que
 * el coste es irrelevante frente a la reducción de duplicación.
 * @module services/statsService
 */
const { dbGet, dbAll } = require('../utils/db');

/**
 * Calcula las métricas del panel para el museo del solicitante (o globales si es superadmin).
 * @param {{ isSuperAdmin: boolean, museumId: string|null }} opts
 * @returns {Promise<Object>}  Cuerpo de respuesta listo para `res.json`.
 */
async function getDashboardStats({ isSuperAdmin, museumId }) {
    // p[0] cortocircuita el filtro por museo para un superadministrador.
    const p = [isSuperAdmin ? 1 : 0, museumId];

    const [
        totVisitors, avgSession, totRobots, activeRobots, totMuseums,
        visitorsByDay, expertiseDist, intentDist, robotActivity
    ] = await Promise.all([
        dbGet(
            `SELECT COUNT(v.id) AS count
             FROM   visitors v LEFT JOIN robots r ON r.id = v.robot_id
             WHERE  (? OR r.museum_id = ?)`, p),
        dbGet(
            `SELECT AVG((julianday(v.ended_at) - julianday(v.created_at)) * 1440) AS avg
             FROM   visitors v LEFT JOIN robots r ON r.id = v.robot_id
             WHERE  v.ended_at IS NOT NULL AND (? OR r.museum_id = ?)`, p),
        dbGet(
            `SELECT COUNT(*) AS count FROM robots WHERE (? OR museum_id = ?)`, p),
        dbGet(
            `SELECT COUNT(*) AS count FROM robots WHERE (? OR museum_id = ?) AND status != 'idle'`, p),
        isSuperAdmin
            ? dbGet(`SELECT COUNT(*) AS count FROM museums`)
            : Promise.resolve({ count: null }),
        dbAll(
            `SELECT date(v.created_at) AS day, COUNT(*) AS count
             FROM   visitors v LEFT JOIN robots r ON r.id = v.robot_id
             WHERE  (? OR r.museum_id = ?) AND v.created_at >= date('now', '-6 days')
             GROUP  BY date(v.created_at)
             ORDER  BY day`, p),
        dbAll(
            `SELECT v.expertise_level AS level, COUNT(*) AS count
             FROM   visitors v LEFT JOIN robots r ON r.id = v.robot_id
             WHERE  (? OR r.museum_id = ?)
             GROUP  BY v.expertise_level
             ORDER  BY count DESC`, p),
        dbAll(
            `SELECT cm.intent, COUNT(*) AS count
             FROM   chat_messages cm
                    LEFT JOIN visitors v ON v.session_id = cm.session_id
                    LEFT JOIN robots   r ON r.id = v.robot_id
             WHERE  (? OR r.museum_id = ?)
               AND  cm.role = 'assistant'
               AND  cm.intent IS NOT NULL
               AND  cm.intent NOT IN ('none', 'greet', 'farewell')
             GROUP  BY cm.intent
             ORDER  BY count DESC
             LIMIT  5`, p),
        dbAll(
            `SELECT r.name AS robot_name, COUNT(v.id) AS count
             FROM   robots r LEFT JOIN visitors v ON v.robot_id = r.id
             WHERE  (? OR r.museum_id = ?)
             GROUP  BY r.id
             ORDER  BY count DESC
             LIMIT  6`, p),
    ]);

    return {
        totalRobots:    totRobots?.count    || 0,
        activeRobots:   activeRobots?.count || 0,
        totalVisitors:  totVisitors?.count  || 0,
        avgSessionTime: Math.round((avgSession?.avg || 0) * 10) / 10,
        // El recuento de museos solo tiene sentido a nivel de plataforma.
        ...(isSuperAdmin && { totalMuseums: totMuseums?.count || 0 }),
        visitorsByDay,
        expertiseDist,
        intentDist,
        robotActivity,
    };
}

module.exports = { getDashboardStats };
