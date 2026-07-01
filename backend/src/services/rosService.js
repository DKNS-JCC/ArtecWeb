const { EventEmitter } = require('events');
const db = require('../database');
let ROSLIB = null;

/**
 * Servicio para gestionar las conexiones con robots basados en ROS mediante roslibjs / rosbridge_websocket.
 *
 * Extiende EventEmitter para que otras partes del backend (p. ej. el servicio SSE) puedan
 * suscribirse a los cambios de estado del robot en tiempo real sin sondear la base de datos.
 *
 * Eventos emitidos:
 *   'robot:update'     { robotId, fields, timestamp }
 *   'robot:connect'    { robotId }
 *   'robot:disconnect' { robotId }
 *   'robot:nav_result' { robotId, outcome: 'succeeded'|'canceled'|'aborted', goal }
 */
class RosService extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // permite muchos clientes SSE
        this.robots = new Map();
    }


    async _ensureRoslib() {
        if (!ROSLIB) {
            const module = await import('roslib');
            ROSLIB = module.default || module;
        }
        return ROSLIB;
    }

    /** Persiste un campo en la BD y emite un evento robot:update. */
    _update(robotId, fields) {
        const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
        const values     = [...Object.values(fields), robotId];
        db.run(`UPDATE robots SET ${setClauses} WHERE id = ?`, values);
        this.emit('robot:update', { robotId, fields, timestamp: Date.now() });
    }


    async connect(robotId, ip, port = 9090) {
        await this._ensureRoslib();

        if (this.robots.has(robotId)) {
            const existing = this.robots.get(robotId);
            if (existing.isConnected) return existing;
        }

        const url = `ws://${ip}:${port}`;
        const ros = new ROSLIB.Ros({ url });

        const robotState = {
            ros,
            url,
            isConnected: false,
            topics:      {},
            latestPose:  null,
            latestScan:  null,
            latestMap:   null,
        };

        ros.on('connection', () => {
            console.log(`[ROS] Conectado al robot ${robotId} en ${url}`);
            robotState.isConnected = true;
            this.emit('robot:connect', { robotId });
            this._initTopics(robotId, robotState);
        });

        ros.on('error', (error) => {
            console.error(`[ROS] Error en robot ${robotId} (${url}):`, error);
        });

        ros.on('close', () => {
            console.log(`[ROS] Conexión cerrada para el robot ${robotId}`);
            robotState.isConnected = false;
            this.emit('robot:disconnect', { robotId });

            // Finaliza todas las sesiones de visitante activas de este robot
            db.run(
                `UPDATE visitors SET ended_at = CURRENT_TIMESTAMP WHERE robot_id = ? AND ended_at IS NULL`,
                [robotId],
                (err) => { if (err) console.error(`[ROS] Error al finalizar las sesiones de visitante del robot ${robotId}:`, err); }
            );
            db.run(
                `UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?`,
                [robotId]
            );
        });

        this.robots.set(robotId, robotState);
        return robotState;
    }

    disconnect(robotId) {
        if (this.robots.has(robotId)) {
            this.robots.get(robotId).ros.close();
            this.robots.delete(robotId);
        }
    }

    getConnectionState(robotId) {
        return this.robots.get(robotId)?.isConnected ?? false;
    }

    /**
     * Se resuelve cuando el WebSocket del robot conecta de verdad, o a false en caso
     * de error/cierre/timeout. Permite que el comando HTTP "connect" informe de un
     * resultado real en vez de devolver antes de que la conexión esté establecida.
     */
    waitForConnection(robotId, timeoutMs = 6000) {
        const robot = this.robots.get(robotId);
        if (!robot) return Promise.resolve(false);
        if (robot.isConnected) return Promise.resolve(true);

        return new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try {
                    robot.ros.removeListener('connection', onConnect);
                    robot.ros.removeListener('error', onFail);
                    robot.ros.removeListener('close', onFail);
                } catch (_) { /* ignorar */ }
                resolve(result);
            };
            const onConnect = () => finish(true);
            const onFail = () => finish(false);
            const timer = setTimeout(() => finish(false), timeoutMs);

            robot.ros.on('connection', onConnect);
            robot.ros.on('error', onFail);
            robot.ros.on('close', onFail);
        });
    }


    _initTopics(robotId, robotState) {
        // ── Teleoperación (/cmd_vel_smoothed)
        robotState.topics.cmdVel = new ROSLIB.Topic({
            ros:         robotState.ros,
            name:        '/cmd_vel_smoothed',
            messageType: 'geometry_msgs/Twist',
        });

        robotState.topics.battery = new ROSLIB.Topic({
            ros:         robotState.ros,
            name:        '/sensors/battery_state',
            messageType: 'sensor_msgs/BatteryState',
        });

        const BATTERY_FULL_V  = 16.5;   // Kobuki: batería llena
        const BATTERY_EMPTY_V = 13.2;   // Kobuki: nivel peligroso (≈ vacío)
        let lastBatteryUpdate = 0;
        robotState.topics.battery.subscribe((message) => {
            const now = Date.now();
            if (now - lastBatteryUpdate < 5000) return;

            let pct = null;
            if (typeof message.percentage === 'number' && message.percentage > 0) {
                pct = message.percentage * 100;                       // viene 0..1
            } else if (typeof message.voltage === 'number' && message.voltage > 0) {
                pct = ((message.voltage - BATTERY_EMPTY_V) /
                       (BATTERY_FULL_V - BATTERY_EMPTY_V)) * 100;     // derivado de la tensión
            }
            if (pct === null) return;

            lastBatteryUpdate = now;
            this._update(robotId, { battery: Math.round(Math.max(0, Math.min(100, pct))) });
        });

        // ── AMCL pose (/amcl_pose)
        robotState.topics.amclPose = new ROSLIB.Topic({
            ros:         robotState.ros,
            name:        '/amcl_pose',
            messageType: 'geometry_msgs/PoseWithCovarianceStamped',
        });

        let lastPoseUpdate = 0;
        robotState.topics.amclPose.subscribe((message) => {
            robotState.latestPose = message;
            const now = Date.now();
            if (now - lastPoseUpdate < 2000) return;
            lastPoseUpdate = now;
            const px    = message.pose.pose.position.x    || 0;
            const py    = message.pose.pose.position.y    || 0;
            const qz    = message.pose.pose.orientation.z || 0;
            const qw    = message.pose.pose.orientation.w || 1;
            const theta = 2 * Math.atan2(qz, qw);
            this._update(robotId, { position_x: px, position_y: py, position_theta: theta });
        });

        // ── Estado del goal de Nav2 (/navigate_to_pose/_action/status)
        //    Cierra el ciclo abierto por sendNavGoal()/sendRobotToBase(): cuando el
        //    goal más reciente alcanza un estado terminal, devuelve el status a 'idle'
        //    para que no se quede atascado en 'navigating' para siempre.
        robotState.topics.navStatus = new ROSLIB.Topic({
            ros:         robotState.ros,
            name:        '/navigate_to_pose/_action/status',
            messageType: 'action_msgs/GoalStatusArray',
        });
        const GOAL_OUTCOMES = { 4: 'succeeded', 5: 'canceled', 6: 'aborted' };
        robotState.topics.navStatus.subscribe((message) => {
            const list = message.status_list || [];
            const last = list[list.length - 1];
            const outcome = last && GOAL_OUTCOMES[last.status];
            if (!outcome) return;

            // Atribuye el resultado al goal que despachamos. Si no hay goal activo es que
            // ya lo procesamos (la lista de estados se republica continuamente) o se lanzó
            // fuera de este backend; en cualquier caso, no hay nada que reportar.
            const goal = robotState.activeGoal;
            if (!goal) return;
            // Evita leer el estado terminal del goal *anterior* en la breve ventana
            // antes de que el nuevo goal aparezca en la lista.
            if (Date.now() - goal.ts < 1500) return;
            robotState.activeGoal = null;

            db.run(
                `UPDATE robots SET status = 'idle', last_update = CURRENT_TIMESTAMP WHERE id = ? AND status = 'navigating'`,
                [robotId]
            );
            this.emit('robot:update',     { robotId, fields: { status: 'idle' }, timestamp: Date.now() });
            this.emit('robot:nav_result', { robotId, outcome, goal });
        });

        // El scan y el mapa son pesados: se obtienen bajo demanda mediante endpoints HTTP
        // (GET /robots/:id/scan y /robots/:id/map) solo cuando el panel de control está
        // abierto. Aquí no hay suscripciones persistentes.
    }

    _subscribeMap(robotState) {
        if (robotState.topics.map) {
            try { robotState.topics.map.unsubscribe(); } catch (_) { /* ignorar */ }
        }
        robotState.topics.map = new ROSLIB.Topic({
            ros:         robotState.ros,
            name:        '/map',
            messageType: 'nav_msgs/OccupancyGrid',
        });
        robotState.topics.map.subscribe((message) => {
            robotState.latestMap = {
                info: {
                    resolution: message.info.resolution,
                    width:      message.info.width,
                    height:     message.info.height,
                    origin:     message.info.origin,
                },
                data: message.data,
            };
            robotState.topics.map.unsubscribe();
        });
    }


    /**
     * Lanza un goal de Nav2. `meta` (opcional) describe el goal para que el manejador de
     * navStatus pueda reportar un resultado con sentido cuando termine o falle:
     *   { kind: 'visit'|'base'|'admin', placeName, placeId, visitorId, sessionId, museumId }
     */
    sendNavGoal(robotId, x, y, qz, qw, meta = null) {
        const robot = this._requireConnected(robotId);
        if (!robot.topics.goalPose) {
            robot.topics.goalPose = new ROSLIB.Topic({
                ros:         robot.ros,
                name:        '/goal_pose',
                messageType: 'geometry_msgs/PoseStamped',
            });
        }
        robot.topics.goalPose.publish({
            header: { frame_id: 'map', stamp: { sec: 0, nanosec: 0 } },
            pose: {
                position:    { x, y, z: 0.0 },
                orientation: { x: 0.0, y: 0.0, z: qz, w: qw },
            },
        });
        // Recuerda para qué es este goal, para poder atribuirle el resultado terminal.
        // `ts` permite al manejador de estados ignorar un estado terminal obsoleto del
        // goal *anterior* que puede seguir siendo por un instante la última entrada de la lista.
        robot.activeGoal = { ...meta, x, y, ts: Date.now() };
        // Un goal nuevo limpia el marcador de fallo anterior mostrado en el panel.
        db.run(`UPDATE robots SET last_nav_error_at = NULL, last_nav_error_place = NULL WHERE id = ?`, [robotId]);
    }

    cancelNavigation(robotId) {
        const robot = this._requireConnected(robotId);
        const cancelSvc = new ROSLIB.Service({
            ros:         robot.ros,
            name:        '/navigate_to_pose/_action/cancel_goal',
            serviceType: 'action_msgs/CancelGoal',
        });
        // roslib v2 eliminó ROSLIB.ServiceRequest: callService recibe un objeto plano.
        // Un goal_id todo a ceros cancela cualquier goal activo de este servidor de acciones.
        const request = {
            goal_info: {
                goal_id: { uuid: Array.from({ length: 16 }, () => 0) },
                stamp:   { sec: 0, nanosec: 0 },
            },
        };
        return new Promise((resolve, reject) => {
            cancelSvc.callService(request, resolve, reject);
        });
    }

    move(robotId, linearX, angularZ) {
        const robot = this._requireConnected(robotId);
        robot.topics.cmdVel.publish({
            linear:  { x: linearX, y: 0.0, z: 0.0 },
            angular: { x: 0.0,    y: 0.0, z: angularZ },
        });
    }


    getMap(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot) return null;
        if (!robot.latestMap && robot.isConnected) this._subscribeMap(robot);
        return robot.latestMap || null;
    }

    /**
     * Se suscribe a /map una vez, se resuelve con el mensaje OccupancyGrid completo,
     * o se rechaza tras timeoutMs si no llega ningún mensaje.
     */
    captureMap(robotId, timeoutMs = 20000) {
        const robot = this._requireConnected(robotId);
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (result, err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { topic.unsubscribe(); } catch (_) { /* ignorar */ }
                if (err) reject(err);
                else resolve(result);
            };

            const timer = setTimeout(
                () => finish(null, new Error('Timeout: el robot no publicó el mapa en el tiempo esperado. ¿Está activo el map_server o SLAM?')),
                timeoutMs
            );

            const topic = new ROSLIB.Topic({
                ros:         robot.ros,
                name:        '/map',
                messageType: 'nav_msgs/OccupancyGrid',
            });
            topic.subscribe((message) => {
                finish({
                    info: {
                        resolution: message.info.resolution,
                        width:      message.info.width,
                        height:     message.info.height,
                        origin:     message.info.origin,
                    },
                    data: message.data,
                });
            });
        });
    }

    getLatestScan(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot) return null;
        // Se suscribe en la primera petición si no está ya activo
        if (!robot.topics.scan && robot.isConnected) {
            robot.topics.scan = new ROSLIB.Topic({
                ros:         robot.ros,
                name:        '/scan',
                messageType: 'sensor_msgs/LaserScan',
            });
            let lastScanUpdate = 0;
            robot.topics.scan.subscribe((message) => {
                const now = Date.now();
                if (now - lastScanUpdate < 200) return;
                lastScanUpdate = now;
                robot.latestScan = {
                    angle_min:       message.angle_min,
                    angle_max:       message.angle_max,
                    angle_increment: message.angle_increment,
                    range_min:       message.range_min,
                    range_max:       message.range_max,
                    ranges:          message.ranges,
                };
            });
        }
        return robot.latestScan ?? null;
    }


    /**
     * Publica std_msgs/Bool en /session_active del robot.
     * true  → ha comenzado una sesión de visitante (despierta los LEDs).
     * false → la sesión terminó o expiró (los LEDs pasan a standby).
     */
    publishSessionActive(robotId, isActive) {
        const robot = this.robots.get(robotId);
        if (!robot || !robot.isConnected) return;
        if (!robot.topics.sessionActive) {
            robot.topics.sessionActive = new ROSLIB.Topic({
                ros:         robot.ros,
                name:        '/session_active',
                messageType: 'std_msgs/Bool',
            });
        }
        robot.topics.sessionActive.publish({ data: isActive });
        console.log(`[ROS] /session_active → ${isActive} (robot ${robotId})`);
    }


    /**
     * Se ejecuta cada 60 s. Si el bloqueo de visitante de un robot ha expirado pero la BD
     * sigue mostrando un visitante activo (el ping se detuvo: el usuario se fue sin cerrar
     * la sesión), publica session_active=false y limpia la fila de la BD.
     */
    _startSessionMonitor() {
        setInterval(() => {
            db.all(
                `SELECT id FROM robots
                 WHERE current_visitor_id IS NOT NULL
                   AND (locked_until IS NULL OR locked_until < datetime('now'))`,
                [],
                (err, rows) => {
                    if (err || !rows || !rows.length) return;
                    rows.forEach(row => {
                        console.log(`[ROS] Sesión expirada para el robot ${row.id} - standby`);
                        this.publishSessionActive(row.id, false);
                        db.run(
                            `UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?`,
                            [row.id]
                        );
                        db.run(
                            `UPDATE visitors SET ended_at = CURRENT_TIMESTAMP WHERE robot_id = ? AND ended_at IS NULL`,
                            [row.id]
                        );
                    });
                }
            );
        }, 60_000);
    }

    _requireConnected(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot || !robot.isConnected) {
            throw new Error(`El robot ${robotId} no está conectado.`);
        }
        return robot;
    }
}

const service = new RosService();
service._startSessionMonitor();
module.exports = service;
