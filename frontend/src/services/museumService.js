import { api } from './api'

export const museumService = {
    // List all museums (Superadmin only)
    fetchAll() {
        return api.get('/museums')
    },

    // Create a new museum (Superadmin only)
    create(data) {
        return api.post('/museums', data)
    },

    // Update a museum's name/company (Superadmin only)
    update(id, data) {
        return api.put(`/museums/${id}`, data)
    },

    // Delete a museum and everything under it (Superadmin only)
    remove(id) {
        return api.delete(`/museums/${id}`)
    }
}
