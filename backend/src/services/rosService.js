const db = require('../database');
let ROSLIB = null;

/**
 * Service to manage connections to ROS-based robots via roslibjs
 * Can support multiple robots by their IDs
 */
class RosService {
    constructor() {
        // Almacena las conexiones a los robots, mapeadas por su ID de base de datos o IP
        this.robots = new Map();
    }

    /**
     * Asegura la carga dinámica del módulo ESM 'roslib' de forma segura
     */
    async _ensureRoslib() {
        if (!ROSLIB) {
            const module = await import('roslib');
            ROSLIB = module.default || module;
        }
        return ROSLIB;
    }

    /**
     * Conecta a un robot específico si no está conectado
     */
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
            topics: {}
        };

        ros.on('connection', () => {
            console.log(`[ROS] Conectado al robot ${robotId} en ${url}`);
            robotState.isConnected = true;
            this.initTurtlebotTopics(robotId, robotState);
        });

        ros.on('error', (error) => {
            console.error(`[ROS] Error en robot ${robotId} (${url}):`, error);
        });

        ros.on('close', () => {
            console.log(`[ROS] Conexión cerrada para el robot ${robotId}`);
            robotState.isConnected = false;
        });

        this.robots.set(robotId, robotState);
        return robotState;
    }

    /**
     * Desconecta a un robot
     */
    disconnect(robotId) {
        if (this.robots.has(robotId)) {
            this.robots.get(robotId).ros.close();
            this.robots.delete(robotId);
        }
    }

    /**
     * Devuelve el estado de conexión del robot
     */
    getConnectionState(robotId) {
        if (this.robots.has(robotId)) {
            return this.robots.get(robotId).isConnected;
        }
        return false;
    }

    /**
     * Inicializa los tópicos comunes de la plataforma (tipo TurtleBot con lidar)
     */
    initTurtlebotTopics(robotId, robotState) {
        robotState.topics.cmdVel = new ROSLIB.Topic({
            ros: robotState.ros,
            name: '/commands/velocity',
            messageType: 'geometry_msgs/Twist'
        });

        // Estos podrían retransmitirse vía WebSocket/Socket.io a los clientes en el futuro
        robotState.topics.battery = new ROSLIB.Topic({
            ros: robotState.ros,
            name: '/diagnostics',
            messageType: 'diagnostic_msgs/DiagnosticArray'
        });

        let lastBatteryUpdate = 0;
        robotState.topics.battery.subscribe((message) => {
            const now = Date.now();
            if (now - lastBatteryUpdate < 5000) return; // Limitar actualizaciones a 5 segundos

            if (message.status && Array.isArray(message.status)) {
                const batteryStatus = message.status.find(s => s.name === 'kobuki: Battery' || (s.name && s.name.includes('Battery')));
                if (batteryStatus && batteryStatus.values) {
                    const percentKV = batteryStatus.values.find(v => v.key === 'Percent');
                    if (percentKV) {
                        lastBatteryUpdate = now;
                        const batteryPercentage = Math.round(parseFloat(percentKV.value));
                        db.run(`UPDATE robots SET battery = ? WHERE id = ?`, [batteryPercentage, robotId]);
                    }
                }
            }
        });

        robotState.topics.odom = new ROSLIB.Topic({
            ros: robotState.ros,
            name: '/odom',
            messageType: 'nav_msgs/Odometry'
        });

        let lastUpdate = 0;
        robotState.topics.odom.subscribe((message) => {
            const now = Date.now();
            if (now - lastUpdate > 2000) { 
                lastUpdate = now;
                const px = message.pose.pose.position.x || 0;
                const py = message.pose.pose.position.y || 0;
                const qz = message.pose.pose.orientation.z || 0;
                const qw = message.pose.pose.orientation.w || 1;
                const theta = 2 * Math.atan2(qz, qw);

                db.run(`UPDATE robots SET position_x = ?, position_y = ?, position_theta = ? WHERE id = ?`, [px, py, theta, robotId]);
            }
        });

        robotState.topics.scan = new ROSLIB.Topic({
            ros: robotState.ros,
            name: '/scan',
            messageType: 'sensor_msgs/LaserScan'
        });
    }

    /**
     * Envía comandos de movimiento al robot
     */
    move(robotId, linearX, angularZ) {
        const robot = this.robots.get(robotId);
        if (!robot || !robot.isConnected || !robot.topics.cmdVel) {
            throw new Error(`El robot ${robotId} no está conectado o no admite movimiento.`);
        }

        // roslib >= 2.0 uses plain objects directly, ROSLIB.Message was deprecated
        const twist = {
            linear: { x: linearX, y: 0.0, z: 0.0 },
            angular: { x: 0.0, y: 0.0, z: angularZ }
        };

        robot.topics.cmdVel.publish(twist);
    }
}

// Exportamos una instancia en forma de Singleton
module.exports = new RosService();

