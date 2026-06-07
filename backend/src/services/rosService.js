const { EventEmitter } = require('events');
const db = require('../database');
let ROSLIB = null;

/**
 * Service to manage connections to ROS-based robots via roslibjs / rosbridge_websocket.
 *
 * Extends EventEmitter so other parts of the backend (e.g. the SSE service) can
 * subscribe to real-time robot state changes without polling the database.
 *
 * Emitted events:
 *   'robot:update'  { robotId, field, value, timestamp }
 *   'robot:connect' { robotId }
 *   'robot:disconnect' { robotId }
 */
class RosService extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // allow many SSE clients
        this.robots = new Map();
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    async _ensureRoslib() {
        if (!ROSLIB) {
            const module = await import('roslib');
            ROSLIB = module.default || module;
        }
        return ROSLIB;
    }

    /** Persist a field to the DB and emit a robot:update event. */
    _update(robotId, fields) {
        const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
        const values     = [...Object.values(fields), robotId];
        db.run(`UPDATE robots SET ${setClauses} WHERE id = ?`, values);
        this.emit('robot:update', { robotId, fields, timestamp: Date.now() });
    }

    // ── Connection management ─────────────────────────────────────────────────

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

            // End all active visitor sessions for this robot
            db.run(
                `UPDATE visitors SET ended_at = CURRENT_TIMESTAMP WHERE robot_id = ? AND ended_at IS NULL`,
                [robotId],
                (err) => { if (err) console.error(`[ROS] Error ending visitor sessions for robot ${robotId}:`, err); }
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
     * Resolves once the robot's WebSocket actually connects, or false on
     * error/close/timeout. Lets the HTTP "connect" command report a real result
     * instead of returning before the connection is established.
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
                } catch (_) { /* ignore */ }
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

    // ── Topic initialisation ──────────────────────────────────────────────────

    _initTopics(robotId, robotState) {
        // ── Teleoperation (/cmd_vel_smoothed)
        robotState.topics.cmdVel = new ROSLIB.Topic({
            ros:         robotState.ros,
            name:        '/cmd_vel_smoothed',
            messageType: 'geometry_msgs/Twist',
        });

        // ── Battery / core sensor (/mobile_base/sensors/core)
        robotState.topics.coreSensor = new ROSLIB.Topic({
            ros:         robotState.ros,
            name:        '/mobile_base/sensors/core',
            messageType: 'kobuki_msgs/SensorState',
        });

        let lastBatteryUpdate = 0;
        robotState.topics.coreSensor.subscribe((message) => {
            const now = Date.now();
            if (now - lastBatteryUpdate < 5000) return;
            if (message.battery !== undefined) {
                lastBatteryUpdate = now;
                const BATTERY_MAX_MV = 16700;
                const BATTERY_MIN_MV = 13200;
                const pct = Math.round(
                    Math.max(0, Math.min(100,
                        ((message.battery - BATTERY_MIN_MV) / (BATTERY_MAX_MV - BATTERY_MIN_MV)) * 100
                    ))
                );
                this._update(robotId, { battery: pct });
            }
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

        // ── Nav2 goal status (/navigate_to_pose/_action/status)
        //    Closes the loop opened by sendNavGoal()/sendRobotToBase(): once the
        //    most recent goal reaches a terminal state, drop status back to 'idle'
        //    so it doesn't stay stuck on 'navigating' forever.
        robotState.topics.navStatus = new ROSLIB.Topic({
            ros:         robotState.ros,
            name:        '/navigate_to_pose/_action/status',
            messageType: 'action_msgs/GoalStatusArray',
        });
        const TERMINAL_GOAL_STATUSES = [4, 5, 6]; // SUCCEEDED, CANCELED, ABORTED
        robotState.topics.navStatus.subscribe((message) => {
            const list = message.status_list || [];
            const last = list[list.length - 1];
            if (!last || !TERMINAL_GOAL_STATUSES.includes(last.status)) return;

            const emitIdle = () => this.emit('robot:update', { robotId, fields: { status: 'idle' }, timestamp: Date.now() });
            db.run(
                `UPDATE robots SET status = 'idle', last_update = CURRENT_TIMESTAMP WHERE id = ? AND status = 'navigating'`,
                [robotId],
                function (err) {
                    if (!err && this.changes > 0) emitIdle();
                }
            );
        });

        // Scan and map are heavy — they are fetched on-demand via HTTP endpoints
        // (GET /robots/:id/scan and /robots/:id/map) only when the control panel
        // is open. No persistent subscriptions here.
    }

    _subscribeMap(robotState) {
        if (robotState.topics.map) {
            try { robotState.topics.map.unsubscribe(); } catch (_) {}
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

    // ── Navigation ────────────────────────────────────────────────────────────

    sendNavGoal(robotId, x, y, qz, qw) {
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
    }

    cancelNavigation(robotId) {
        const robot = this._requireConnected(robotId);
        const cancelSvc = new ROSLIB.Service({
            ros:         robot.ros,
            name:        '/navigate_to_pose/_action/cancel_goal',
            serviceType: 'action_msgs/CancelGoal',
        });
        const request = new ROSLIB.ServiceRequest({
            goal_info: {
                goal_id: { uuid: new Array(16).fill(0) },
                stamp:   { sec: 0, nanosec: 0 },
            },
        });
        return new Promise((resolve, reject) => {
            cancelSvc.callService(request, resolve, reject);
        });
    }

    setInitialPose(robotId, x, y, qz, qw, covariance = null) {
        const robot = this._requireConnected(robotId);
        if (!robot.topics.initialPose) {
            robot.topics.initialPose = new ROSLIB.Topic({
                ros:         robot.ros,
                name:        '/initialpose',
                messageType: 'geometry_msgs/PoseWithCovarianceStamped',
            });
        }
        const cov = covariance || [
            0.25, 0, 0, 0, 0, 0,
            0, 0.25, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0.06853892326654787,
        ];
        robot.topics.initialPose.publish({
            header: { frame_id: 'map', stamp: { sec: 0, nanosec: 0 } },
            pose: {
                pose: {
                    position:    { x, y, z: 0.0 },
                    orientation: { x: 0.0, y: 0.0, z: qz, w: qw },
                },
                covariance: cov,
            },
        });
    }

    move(robotId, linearX, angularZ) {
        const robot = this._requireConnected(robotId);
        robot.topics.cmdVel.publish({
            linear:  { x: linearX, y: 0.0, z: 0.0 },
            angular: { x: 0.0,    y: 0.0, z: angularZ },
        });
    }

    // ── Data accessors ────────────────────────────────────────────────────────

    getMap(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot) return null;
        if (!robot.latestMap && robot.isConnected) this._subscribeMap(robot);
        return robot.latestMap || null;
    }

    /**
     * Subscribes to /map once, resolves with the full OccupancyGrid message,
     * or rejects after timeoutMs if no message arrives.
     */
    captureMap(robotId, timeoutMs = 20000) {
        const robot = this._requireConnected(robotId);
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (result, err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { topic.unsubscribe(); } catch (_) {}
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

    getPose(robotId) {
        return this.robots.get(robotId)?.latestPose ?? null;
    }

    getLatestScan(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot) return null;
        // Subscribe on first request if not already active
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

    _requireConnected(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot || !robot.isConnected) {
            throw new Error(`El robot ${robotId} no está conectado.`);
        }
        return robot;
    }
}

module.exports = new RosService();
