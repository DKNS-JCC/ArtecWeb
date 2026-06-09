import { api } from './api'

/**
 * Incident service — operational event log (e.g. navigation failures) for
 * museum admins and technicians to review.
 */
export const incidentService = {
    /** List incidents visible to the current admin (museum-scoped on the server). */
    fetchAll() {
        return api.get('/admin/incidents')
    },

    /** Mark an incident as handled. */
    resolve(id) {
        return api.patch(`/admin/incidents/${id}/resolve`)
    },
}
