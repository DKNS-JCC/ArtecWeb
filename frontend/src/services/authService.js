import { api } from './api'

export const authService = {
    login(identifier, password) {
        return api.post('/auth/login', { identifier, password })
    },

    register(name, email, password) {
        return api.post('/auth/register', { name, email, password })
    },

    changePassword(current_password, new_password) {
        return api.post('/auth/change-password', { current_password, new_password })
    },

    createStaff(name, email, role, museum_id) {
        return api.post('/admin/create-staff', { name, email, role, museum_id })
    },

    listUsers() {
        return api.get('/admin/users')
    },

    uploadAvatar(formData) {
        return api.uploadFormData('/auth/avatar', formData)
    },

    deleteAvatar() {
        return api.delete('/auth/avatar')
    }
}
