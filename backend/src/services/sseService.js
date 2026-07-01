const db      = require('../database');
const rosService = require('./rosService');
const incidentService = require('./incidentService');
const zoneCache = require('../utils/zoneCache');
const { findNearestZone } = require('../utils/geo');

/**
 * Hub de difusión por Server-Sent Events para la flota de robots.
 *
 * Arquitectura:
 *  • Cada pestaña de administración abre una conexión persistente GET /api/robots/stream.
 *  • El hub guarda todos los objetos de respuesta SSE activos, agrupados por museo.
 *  • rosService emite eventos robot:update / robot:connect / robot:disconnect
 *    → el hub obtiene de la BD la fila más reciente del robot y la envía a
 *    cada cliente que tenga visibilidad sobre ese robot.
 *  • Se envía un heartbeat cada 25 s para evitar timeouts de proxy/balanceador de carga.
 *
 * Esto sustituye N peticiones de sondeo HTTP por una única conexión persistente por
 * pestaña del navegador, saltándose por completo el limitador de tasa.
 */

// clients: Map<res, { museumId: string|null, isSuperAdmin: boolean }>
const clients = new Map();

const positionClients = new Map();

const HEARTBEAT_MS = 25_000;


function send(res, event, data) {
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) { /* el cliente ya se ha ido */ }
}

function writeSseHeaders(res) {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desactiva el buffering de nginx
    res.flushHeaders();
}

function dbGetRobot(robotId) {
    return new Promise((resolve) => {
        db.get(
            `SELECT r.*, v.name AS visitor_name
             FROM robots r
             LEFT JOIN visitors v ON r.current_visitor_id = v.id
             WHERE r.id = ?`,
            [robotId],
            (err, row) => resolve(err ? null : row)
        );
    });
}

function formatRobot(row) {
    if (!row) return null;
    const now      = new Date();
    const isLocked = row.locked_until && new Date(row.locked_until) > now;
    // Waypoint más cercano a la pose en vivo (las zonas se cachean para que esto
    // siga siendo barato en la ruta de difusión de odometría de alta frecuencia).
    const nearest = findNearestZone(row.position_x, row.position_y, zoneCache.get(row.map_id));
    return {
        id:           row.id,
        name:         row.name,
        ip:           row.ip,
        connected:    rosService.getConnectionState(row.id),
        status:       row.status,
        battery:      row.battery,
        position:     { x: row.position_x, y: row.position_y, theta: row.position_theta },
        last_update:  row.last_update,
        museum_id:    row.museum_id,
        map_id:       row.map_id,
        current_location: nearest ? { name: nearest.name, category: nearest.category, distance: Math.round(nearest.distance * 100) / 100 } : null,
        is_occupied:  isLocked,
        locked_until: row.locked_until,
        visitor_name: isLocked ? (row.visitor_name || 'Visitante Anónimo') : null,
        last_nav_error_at:    row.last_nav_error_at    || null,
        last_nav_error_place: row.last_nav_error_place || null,
    };
}

/** Envía la actualización de un robot a todos los clientes que pueden verlo. */
async function broadcastRobot(robotId) {
    if (clients.size === 0) return;
    const row = await dbGetRobot(robotId);
    if (!row) return;
    const payload = formatRobot(row);

    for (const [res, meta] of clients) {
        if (meta.isSuperAdmin || meta.museumId === row.museum_id) {
            send(res, 'robot', payload);
        }
    }
}


function dbGetPosition(robotId) {
    return new Promise((resolve) => {
        db.get(
            'SELECT position_x, position_y, position_theta, last_update FROM robots WHERE id = ?',
            [robotId],
            (err, row) => resolve(err ? null : row)
        );
    });
}

function formatPosition(row) {
    if (!row) return null;
    return {
        x:           row.position_x,
        y:           row.position_y,
        theta:       row.position_theta,
        last_update: row.last_update,
    };
}

/** Envía la pose en vivo a cada visitante que está observando este robot concreto. */
async function broadcastPosition(robotId) {
    if (positionClients.size === 0) return;
    const payload = formatPosition(await dbGetPosition(robotId));
    if (!payload) return;
    for (const [res, meta] of positionClients) {
        if (meta.robotId === robotId) send(res, 'position', payload);
    }
}

/** Envía el resultado de navegación (llegó / falló) al visitante que observa este robot. */
function broadcastNav(robotId, payload) {
    if (positionClients.size === 0) return;
    for (const [res, meta] of positionClients) {
        if (meta.robotId === robotId) send(res, 'nav', payload);
    }
}


rosService.on('robot:update', ({ robotId }) => {
    broadcastRobot(robotId);
    broadcastPosition(robotId);
});

rosService.on('robot:connect', ({ robotId }) => {
    broadcastRobot(robotId);
});

rosService.on('robot:disconnect', ({ robotId }) => {
    broadcastRobot(robotId);
});

// Un goal de navegación alcanzó un estado terminal. Si falla: registra una incidencia y
// refresca el panel de administración (estado en rojo). Para goals iniciados por un visitante,
// informa al chat del visitante del resultado para confirmar la llegada u ofrecer un reintento.
rosService.on('robot:nav_result', async ({ robotId, outcome, goal }) => {
    if (outcome === 'aborted') {
        await incidentService.recordNavFailure(robotId, goal);
        broadcastRobot(robotId);
    }
    if (goal?.kind === 'visit' && outcome !== 'canceled') {
        broadcastNav(robotId, {
            outcome,                              // 'succeeded' | 'aborted'
            place_name: goal.placeName || null,
            place_id:   goal.placeId   || null,
        });
    }
});


/**
 * Registra un nuevo cliente SSE.
 * Envía una instantánea inicial de todos los robots visibles para este cliente
 * y luego registra los manejadores de heartbeat y de limpieza.
 *
 * @param {express.Request}  req
 * @param {express.Response} res
 * @param {{ id: string, role: string, museum_id: string|null }} user  payload del JWT
 */
function addClient(req, res, user) {
    writeSseHeaders(res);

    const isSuperAdmin = user.role === 'platform_admin';
    const museumId     = user.museum_id ?? null;

    clients.set(res, { museumId, isSuperAdmin });

    // Envía la instantánea inicial
    let query  = `SELECT r.*, v.name AS visitor_name FROM robots r LEFT JOIN visitors v ON r.current_visitor_id = v.id`;
    let params = [];
    if (!isSuperAdmin) { query += ` WHERE r.museum_id = ?`; params = [museumId]; }

    db.all(query, params, (err, rows) => {
        if (err || !rows) return;
        rows.forEach(row => send(res, 'robot', formatRobot(row)));
        send(res, 'ready', { ts: Date.now() });
    });

    // Heartbeat para mantener viva la conexión a través de proxies
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch (_) { cleanup(); }
    }, HEARTBEAT_MS);

    function cleanup() {
        clearInterval(heartbeat);
        clients.delete(res);
    }

    req.on('close',   cleanup);
    req.on('aborted', cleanup);
}

/**
 * Registra un cliente del stream de posición de un visitante.
 * Envía la pose actual del robot de inmediato y después envía cada actualización
 * de pose que difunde rosService. Una conexión por cada vista de mapa del visitante.
 *
 * @param {express.Request}  req
 * @param {express.Response} res
 * @param {string} robotId  el robot asignado a la sesión del visitante
 */
function addPositionClient(req, res, robotId) {
    writeSseHeaders(res);

    positionClients.set(res, { robotId });

    // Envía la instantánea inicial para que el overlay aparezca sin esperar a una actualización
    dbGetPosition(robotId).then((row) => {
        const payload = formatPosition(row);
        if (payload) send(res, 'position', payload);
        send(res, 'ready', { ts: Date.now() });
    });

    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch (_) { cleanup(); }
    }, HEARTBEAT_MS);

    function cleanup() {
        clearInterval(heartbeat);
        positionClients.delete(res);
    }

    req.on('close',   cleanup);
    req.on('aborted', cleanup);
}

module.exports = { addClient, broadcastRobot, addPositionClient };
