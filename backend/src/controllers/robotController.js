const crypto = require('crypto');
const db = require('../database');
const rosService = require('../services/rosService');
const sseService = require('../services/sseService');
const navService = require('../services/navService');
const { loadRobotForUser, museumScope } = require('../utils/access');
const { findNearestZone, BASE_CATEGORY } = require('../utils/geo');

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * GET /api/robots/:id/availability
 * La comprueba la pantalla de escaneo ANTES de preguntar al visitante, de modo que un
 * robot offline u ocupado se informa por adelantado en vez de fallar luego en la navegación.
 * La ruta está bajo /robots → el limitador de tasa global la omite.
 */
exports.availability = (req, res) => {
    db.get('SELECT id, name, ip, locked_until FROM robots WHERE id = ?', [req.params.id], async (err, robot) => {
        if (err)    return res.status(500).json({ error: 'Error verificando el robot' });
        if (!robot) return res.status(404).json({ available: false, error: 'Robot no válido o no encontrado' });

        const occupied = !!(robot.locked_until && new Date(robot.locked_until) > new Date());

        let online = rosService.getConnectionState(robot.id);
        if (!online && robot.ip) {
            await rosService.connect(robot.id, robot.ip);
            online = await rosService.waitForConnection(robot.id);
        }

        res.json({
            available:  online && !occupied,
            online,
            occupied,
            robot_name: robot.name,
        });
    });
};

exports.createRobot = (req, res) => {
    const { name, museum_id } = req.body;
    if (!name || !museum_id) {
        return res.status(400).json({ error: 'El nombre y museum_id son obligatorios' });
    }
    const robotId = crypto.randomUUID();
    db.run(
        `INSERT INTO robots (id, name, museum_id) VALUES (?, ?, ?)`,
        [robotId, name, museum_id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Error al crear el robot' });
            res.status(201).json({ message: 'Robot creado', id: robotId, name, museum_id, status: 'idle', battery: 100, position: {x:0, y:0, theta:0} });
        }
    );
};

exports.listRobots = (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';

    const { clause, params } = museumScope(isSuperAdmin, req.user.museum_id, 'r.museum_id');
    const query = `
        SELECT r.*, v.name as visitor_name
        FROM robots r
        LEFT JOIN visitors v ON r.current_visitor_id = v.id
        ${clause ? `WHERE ${clause}` : ''}
    `;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error de base de datos al obtener los robots' });

        const now = new Date();

        // Carga en lote las zonas de cada mapa implicado y luego deriva la ubicación
        // actual de cada robot como el waypoint más cercano a su posición en vivo.
        const mapIds = [...new Set(rows.map(r => r.map_id).filter(Boolean))];

        const buildResponse = (zonesByMap) => rows.map(r => {
            const isLocked = r.locked_until && new Date(r.locked_until) > now;
            const nearest = findNearestZone(r.position_x, r.position_y, zonesByMap[r.map_id] || []);
            return {
                id: r.id,
                name: r.name,
                ip: r.ip,
                connected: rosService.getConnectionState(r.id),
                status: r.status,
                battery: r.battery,
                position: { x: r.position_x, y: r.position_y, theta: r.position_theta },
                last_update: r.last_update,
                museum_id: r.museum_id,
                map_id: r.map_id,
                current_location: nearest ? { name: nearest.name, category: nearest.category, distance: Math.round(nearest.distance * 100) / 100 } : null,
                is_occupied: isLocked,
                locked_until: r.locked_until,
                visitor_name: isLocked ? (r.visitor_name || 'Visitante Anónimo') : null
            };
        });

        if (mapIds.length === 0) return res.json(buildResponse({}));

        const placeholders = mapIds.map(() => '?').join(',');
        db.all(`SELECT id, name, category, map_x, map_y, map_id FROM zones WHERE map_id IN (${placeholders})`, mapIds, (zErr, zoneRows) => {
            const zonesByMap = {};
            if (!zErr && zoneRows) {
                for (const z of zoneRows) (zonesByMap[z.map_id] ||= []).push(z);
            }
            res.json(buildResponse(zonesByMap));
        });
    });
};

exports.getRobot = async (req, res) => {
    try {
        const robot = await loadRobotForUser(req.params.id, req.user);
        if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

        res.json({
            id: robot.id,
            name: robot.name,
            ip: robot.ip,
            connected: rosService.getConnectionState(robot.id),
            status: robot.status,
            battery: robot.battery,
            position: { x: robot.position_x, y: robot.position_y, theta: robot.position_theta },
            last_update: robot.last_update,
            museum_id: robot.museum_id,
            map_id: robot.map_id
        });
    } catch {
        res.status(500).json({ error: 'Error de base de datos al obtener el robot' });
    }
};

exports.updateRobot = async (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    // Técnicos y museum_admin pueden editar nombre e IP de los robots de su museo.
    // Asignar mapa queda para admins; mover de museo, solo para el proveedor (super-admin).
    const isAdmin = isSuperAdmin || req.user.role === 'museum_admin';
    const museumId = req.user.museum_id;
    const robotId = req.params.id;
    const { ip, name, map_id, museum_id } = req.body;

    if (ip !== undefined && ip !== '' && !IP_RE.test(ip)) {
        return res.status(400).json({ error: 'Formato de dirección IP no válido' });
    }

    try {
        const robot = await loadRobotForUser(robotId, req.user);
        if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

        // Reasignar un robot a otro museo (o desasignarlo) es exclusivo del proveedor.
        const reassign = isSuperAdmin && museum_id !== undefined;
        const newMuseumId = reassign ? (museum_id || null) : robot.museum_id;
        const museumChanged = newMuseumId !== robot.museum_id;

        if (reassign && newMuseumId) {
            const museum = await new Promise(resolve => {
                db.get('SELECT id FROM museums WHERE id = ?', [newMuseumId], (e, row) => resolve(row || null));
            });
            if (!museum) return res.status(404).json({ error: 'Museo no encontrado' });
        }

        // Si se asigna un mapa, verifica que pertenece al mismo museo Y tiene un punto base.
        // (Se omite en un cambio de museo: el mapa antiguo pertenece al museo anterior.)
        if (isAdmin && !museumChanged && map_id !== undefined && map_id !== null) {
            const mapRow = await new Promise(resolve => {
                db.get('SELECT museum_id FROM maps WHERE id = ?', [map_id], (e, row) => resolve(row || null));
            });
            if (!mapRow) return res.status(404).json({ error: 'Mapa no encontrado' });
            if (!isSuperAdmin && mapRow.museum_id !== museumId) {
                return res.status(403).json({ error: 'El mapa no pertenece a tu museo' });
            }
            // Base obligatoria: un mapa sin punto base no puede guiar a un robot.
            const base = await new Promise(resolve => {
                db.get('SELECT id FROM zones WHERE map_id = ? AND category = ? LIMIT 1', [map_id, BASE_CATEGORY], (e, row) => resolve(row || null));
            });
            if (!base) {
                return res.status(422).json({ error: 'Este mapa no tiene un punto base definido. Defínelo en el editor de mapas antes de asignarlo a un robot.' });
            }
        }

        const updatedIp = ip !== undefined ? ip : robot.ip;
        const updatedName = name !== undefined ? name : robot.name;
        // Los mapas están acotados a un museo, así que mover el robot a otro museo descarta su mapa.
        const updatedMapId = museumChanged ? null : (isAdmin && map_id !== undefined ? map_id : robot.map_id);

        // En un cambio de museo, limpia también cualquier sesión de visitante obsoleta del museo anterior.
        const updateSql = museumChanged
            ? `UPDATE robots SET ip = ?, name = ?, map_id = ?, museum_id = ?, current_visitor_id = NULL, locked_until = NULL WHERE id = ?`
            : `UPDATE robots SET ip = ?, name = ?, map_id = ?, museum_id = ? WHERE id = ?`;

        db.run(updateSql, [updatedIp, updatedName, updatedMapId, newMuseumId, robotId], (err) => {
            if (err) return res.status(500).json({ error: 'Error al actualizar el robot' });

            if (ip && ip !== robot.ip && rosService.getConnectionState(robotId)) {
                rosService.disconnect(robotId);
                rosService.connect(robotId, ip);
            }

            sseService.broadcastRobot(robotId);
            res.json({ message: 'Robot actualizado correctamente' });
        });
    } catch {
        res.status(500).json({ error: 'Error de base de datos' });
    }
};

exports.deleteRobot = (req, res) => {
    const robotId = req.params.id;
    db.get('SELECT id FROM robots WHERE id = ?', [robotId], (err, robot) => {
        if (err) return res.status(500).json({ error: 'Error de base de datos' });
        if (!robot) return res.status(404).json({ error: 'Robot no encontrado' });

        db.run('DELETE FROM robots WHERE id = ?', [robotId], (delErr) => {
            if (delErr) return res.status(500).json({ error: 'Error al eliminar el robot' });
            rosService.disconnect(robotId); // cierra cualquier conexión ROS activa
            res.json({ message: 'Robot eliminado' });
        });
    });
};

exports.sendCommand = async (req, res) => {
    const { command, payload } = req.body;
    const robotId = req.params.id;

    try {
        const robot = await loadRobotForUser(robotId, req.user);
        if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

        let status = robot.status;
        let px = robot.position_x;
        let py = robot.position_y;
        let pt = robot.position_theta;

        if (command === 'connect') {
            const ip = payload?.ip || robot.ip || '127.0.0.1';
            try {
                await rosService.connect(robotId, ip);
            } catch (e) {
                return res.status(503).json({ error: `Error iniciando la conexión: ${e.message}` });
            }
            // Espera a que el WebSocket real se levante para reportar un resultado real.
            const ok = await rosService.waitForConnection(robotId, 6000);
            if (ok) {
                sseService.broadcastRobot(robotId);
                return res.json({ message: `Conectado a ${robot.name}`, connected: true });
            }
            return res.status(504).json({
                error: `No se pudo conectar con "${robot.name}" en ${ip}:9090. Comprueba que el robot está encendido, en la misma red y con rosbridge_server activo.`
            });
        }

        if (command === 'disconnect') {
            rosService.disconnect(robotId);
            return res.json({ message: `Conexión ROS cerrada para ${robot.name}` });
        }

        if (command === 'move' && payload) {
            status = 'moving';

            try {
                const linearX = payload.linearX || 0.0;
                const angularZ = payload.angularZ || 0.0;
                rosService.move(robotId, linearX, angularZ);
            } catch (error) {
                console.error(`ROS Move error on robot ${robotId}:`, error.message);
            }

            if (payload.x !== undefined) px = payload.x;
            if (payload.y !== undefined) py = payload.y;
            if (payload.theta !== undefined) pt = payload.theta;
        } else if (command === 'stop') {
            status = 'idle';
            try {
                rosService.move(robotId, 0.0, 0.0);
            } catch (error) {
                 console.error(`ROS Stop error on robot ${robotId}:`, error.message);
            }
        } else {
            return res.status(400).json({ error: 'Comando desconocido' });
        }

        const updateQuery = `
            UPDATE robots
            SET status = ?, position_x = ?, position_y = ?, position_theta = ?, last_update = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        db.run(updateQuery, [status, px, py, pt, robotId], function (err) {
            if (err) return res.status(500).json({ error: 'Error de base de datos al actualizar el robot' });
            sseService.broadcastRobot(robotId);
            res.json({ message: `Comando ${command} enviado correctamente` });
        });
    } catch {
        res.status(500).json({ error: 'Error de base de datos' });
    }
};

exports.sendNavGoal = async (req, res) => {
    const { x, y, qz = 0, qw = 1 } = req.body;
    if (x === undefined || y === undefined) {
        return res.status(400).json({ error: 'Se requieren x e y' });
    }

    const robotId = req.params.id;

    let robot;
    try {
        robot = await loadRobotForUser(robotId, req.user, 'id');
    } catch {
        return res.status(500).json({ error: 'Error de base de datos' });
    }
    if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

    try {
        rosService.sendNavGoal(robotId, Number(x), Number(y), Number(qz), Number(qw), {
            kind:     'admin',
            museumId: req.user.museum_id,
        });
        res.json({ message: 'Objetivo de navegación enviado', x, y, qz, qw });
    } catch (e) {
        res.status(503).json({ error: e.message });
    }
};

exports.cancelNav = async (req, res) => {
    const robotId = req.params.id;

    let robot;
    try {
        robot = await loadRobotForUser(robotId, req.user, 'id');
    } catch {
        return res.status(500).json({ error: 'Error de base de datos' });
    }
    if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

    try {
        const result = await rosService.cancelNavigation(robotId);
        res.json({ message: 'Navegación cancelada', result });
    } catch (e) {
        res.status(503).json({ error: e.message });
    }
};

exports.goToBase = async (req, res) => {
    const robotId = req.params.id;

    try {
        const robot = await loadRobotForUser(robotId, req.user, 'id');
        if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

        const result = await navService.sendRobotToBase(robotId);
        if (result.ok) {
            sseService.broadcastRobot(robotId);
            return res.json({ message: `Enviando el robot a la base "${result.base.name}".`, base: result.base });
        }

        const messages = {
            no_map:        'El robot no tiene un mapa asignado.',
            no_base:       'El mapa del robot no tiene un punto base definido.',
            not_connected: 'El robot no está conectado a ROS en este momento.',
            ros_error:     result.error || 'Error al enviar el objetivo de navegación.',
        };
        return res.status(409).json({ error: messages[result.reason] || 'No se pudo enviar el robot a la base.' });
    } catch {
        res.status(500).json({ error: 'Error de base de datos' });
    }
};

exports.getMap = async (req, res) => {
    const robotId = req.params.id;
    try {
        const robot = await loadRobotForUser(robotId, req.user, 'id');
        if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

        const map = rosService.getMap(robotId);
        if (!map) return res.status(503).json({ error: 'El mapa aún no está disponible. ¿Está el robot conectado?' });
        res.json(map);
    } catch {
        res.status(500).json({ error: 'Error de base de datos' });
    }
};

exports.getScan = async (req, res) => {
    const robotId = req.params.id;
    try {
        const robot = await loadRobotForUser(robotId, req.user, 'id');
        if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

        const scan = rosService.getLatestScan(robotId);
        if (!scan) return res.status(503).json({ error: 'El escaneo aún no está disponible. ¿Está el robot conectado?' });
        res.json(scan);
    } catch {
        res.status(500).json({ error: 'Error de base de datos' });
    }
};

exports.forceEnd = async (req, res) => {
    const robotId = req.params.id;

    let robot;
    try {
        robot = await loadRobotForUser(robotId, req.user);
    } catch {
        return res.status(500).json({ error: 'Error de base de datos' });
    }
    if (!robot) return res.status(404).json({ error: 'Robot no encontrado o no autorizado' });

    if (!robot.current_visitor_id) {
        return res.json({ message: 'No hay ninguna sesión activa que finalizar' });
    }

    const visitorId = robot.current_visitor_id;

    db.run('BEGIN IMMEDIATE', (beginErr) => {
        if (beginErr) return res.status(500).json({ error: 'Error del servidor' });

        db.run('UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?', [robotId], (updErr) => {
            if (updErr) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Error de base de datos al gestionar el robot' }));

            db.run('UPDATE visitors SET ended_at = CURRENT_TIMESTAMP WHERE id = ?', [visitorId], (visErr) => {
                if (visErr) console.error('Error updating visitor ended_at', visErr);

                db.run('COMMIT', (commitErr) => {
                    if (commitErr) return db.run('ROLLBACK', () => res.status(500).json({ error: 'Error del servidor' }));
                    navService.sendRobotToBase(robotId).catch(() => {});
                    sseService.broadcastRobot(robotId);
                    res.json({ message: 'Visita finalizada exitosamente' });
                });
            });
        });
    });
};
