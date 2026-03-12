import { api } from './api'

/**
 * Auth service — encapsulates all auth-related API calls.
 */
export const authService = {
    login(identifier, password) {
        return api.post('/auth/login', { identifier, password })
    },

    register(username, email, password) {
        return api.post('/auth/register', { username, email, password })
    },

    changePassword(current_password, new_password) {
        return api.post('/auth/change-password', { current_password, new_password })
    },

    createStaff(username, email, password, role) {
        return api.post('/admin/create-staff', { username, email, password, role })
    },

    listUsers() {
        return api.get('/admin/users')
    },
}
