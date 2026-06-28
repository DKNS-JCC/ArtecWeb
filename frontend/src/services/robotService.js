/**
 * @file Servicio de robots: listado con estado, comandos, CRUD, navegación
 * Nav2 y lectura de sensores ROS (mapa de ocupación y escaneo láser). Capa de
 * acceso a la ruta `/robots`.
 * @module services/robotService
 */
import { api } from './api'

/**
 * Operaciones sobre robots: estado, control y navegación.
 * @namespace robotService
 * @memberof module:services/robotService
 */
export const robotService = /** @lends module:services/robotService.robotService */ {
    /**
     * Lista todos los robots visibles con su estado en tiempo real.
     * @returns {Promise<Object[]>}
     */
    fetchAll() {
        return api.get('/robots')
    },

    /**
     * Envía un comando genérico al robot.
     * @param {string} id  Identificador del robot.
     * @param {string} command  Nombre del comando.
     * @param {Object|null} [payload=null]  Datos asociados al comando.
     * @returns {Promise<Object>}
     */
    sendCommand(id, command, payload = null) {
        return api.post(`/robots/${id}/command`, { command, payload })
    },

    /**
     * Da de alta un robot.
     * @param {string} name  Nombre del robot.
     * @param {string} museum_id  Museo al que pertenece.
     * @returns {Promise<Object>}
     */
    create(name, museum_id) {
        return api.post('/robots', { name, museum_id })
    },

    /**
     * Actualiza los datos de un robot.
     * @param {string} id  Identificador del robot.
     * @param {Object} data  Campos a modificar.
     * @returns {Promise<Object>}
     */
    update(id, data) {
        return api.put(`/robots/${id}`, data)
    },

    /**
     * Elimina un robot (solo superadmin; los robots los gestiona el proveedor).
     * @param {string} id  Identificador del robot.
     * @returns {Promise<Object>}
     */
    remove(id) {
        return api.delete(`/robots/${id}`)
    },

    /**
     * Fuerza el fin de la sesión del visitante activo en un robot.
     * @param {string} id  Identificador del robot.
     * @returns {Promise<Object>}
     */
    forceEndSession(id) {
        return api.post(`/robots/${id}/force-end`)
    },

    // ── ROS navigation ────────────────────────────────────────────────────────

    /**
     * Send a Nav2 goal pose.
     * @param {string} id  Robot ID
     * @param {number} x
     * @param {number} y
     * @param {number} qz  Quaternion z (default 0 = facing +X)
     * @param {number} qw  Quaternion w (default 1)
     */
    sendNavGoal(id, x, y, qz = 0, qw = 1) {
        return api.post(`/robots/${id}/nav-goal`, { x, y, qz, qw })
    },

    /**
     * Cancela todos los objetivos de navegación activos.
     * @param {string} id  Identificador del robot.
     * @returns {Promise<Object>}
     */
    cancelNavigation(id) {
        return api.post(`/robots/${id}/cancel-nav`, {})
    },

    /**
     * Envía el robot al punto base de su mapa (vuelta a casa / carga).
     * @param {string} id  Identificador del robot.
     * @returns {Promise<Object>}
     */
    goToBase(id) {
        return api.post(`/robots/${id}/go-to-base`, {})
    },

    // ── ROS sensor data ───────────────────────────────────────────────────────

    /**
     * Obtiene el último mapa de ocupación (`/map`, OccupancyGrid).
     * @param {string} id  Identificador del robot.
     * @returns {Promise<{info: Object, data: number[]}>}
     */
    getMap(id) {
        return api.get(`/robots/${id}/map`)
    },

    /**
     * Obtiene el último escaneo láser (`/scan`).
     * @param {string} id  Identificador del robot.
     * @returns {Promise<Object>}
     */
    getScan(id) {
        return api.get(`/robots/${id}/scan`)
    },
}
