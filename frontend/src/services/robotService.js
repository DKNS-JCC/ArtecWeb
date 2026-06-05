import { api } from './api'

/**
 * Robot service — encapsulates all robot-related API calls.
 */
export const robotService = {
    fetchAll() {
        return api.get('/robots')
    },

    fetchOne(id) {
        return api.get(`/robots/${id}`)
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

    /**
     * Set the AMCL initial pose estimate (equivalent to RViz "2D Pose Estimate").
     * @param {string} id
     * @param {number} x
     * @param {number} y
     * @param {number} qz
     * @param {number} qw
     * @param {number[]|null} covariance  Optional 36-element covariance matrix
     */
    setInitialPose(id, x, y, qz = 0, qw = 1, covariance = null) {
        return api.post(`/robots/${id}/initial-pose`, { x, y, qz, qw, covariance })
    },

    // ── ROS sensor data ───────────────────────────────────────────────────────

    /** Fetch the latest OccupancyGrid (/map). */
    getMap(id) {
        return api.get(`/robots/${id}/map`)
    },

    /** Fetch the latest AMCL pose (/amcl_pose). */
    getPose(id) {
        return api.get(`/robots/${id}/pose`)
    },

    /** Fetch the latest laser scan (/scan). */
    getScan(id) {
        return api.get(`/robots/${id}/scan`)
    },
}
