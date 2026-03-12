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
}
