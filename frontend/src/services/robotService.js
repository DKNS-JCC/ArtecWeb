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
}
