import { api } from './api'

export const museumService = {
    // List all museums (Superadmin only)
    fetchAll() {
        return api.get('/museums')
    },

    // Create a new museum (Superadmin only)
    create(data) {
        return api.post('/museums', data)
    }
}
