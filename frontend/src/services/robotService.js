import { api } from './api'

/**
 * Robot service — encapsulates all robot-related API calls.
 */
export const robotService = {
    fetchAll() {
        return api.get('/robots')
    },

    sendCommand(id, command, payload = null) {
        return api.post(`/robots/${id}/command`, { command, payload })
    },

    create(name, museum_id) {
        return api.post('/robots', { name, museum_id })
    },

    update(id, data) {
        return api.put(`/robots/${id}`, data)
    },

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
     * Cancel all active navigation goals.
     */
    cancelNavigation(id) {
        return api.post(`/robots/${id}/cancel-nav`, {})
    },

    /**
     * Send the robot to its map's base point (home / return location).
     */
    goToBase(id) {
        return api.post(`/robots/${id}/go-to-base`, {})
    },

    // ── ROS sensor data ───────────────────────────────────────────────────────

    /** Fetch the latest OccupancyGrid (/map). */
    getMap(id) {
        return api.get(`/robots/${id}/map`)
    },

    /** Fetch the latest laser scan (/scan). */
    getScan(id) {
        return api.get(`/robots/${id}/scan`)
    },
}
