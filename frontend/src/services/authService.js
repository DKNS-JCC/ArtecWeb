import { api } from './api'

export const authService = {
    login(identifier, password) {
        return api.post('/auth/login', { identifier, password })
    },

    createVisitor(robotId, name) {
        return api.post('/auth/visitor', { robotId, name })
    },

    pingVisitor() {
        return api.post('/auth/visitor/ping')
    },

    endVisitor() {
        return api.post('/auth/visitor/end')
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

    updateStaff(id, data) {
        return api.patch(`/admin/users/${id}`, data)
    },

    toggleStaffActive(id) {
        return api.patch(`/admin/users/${id}/active`)
    },

    deleteStaff(id) {
        return api.delete(`/admin/users/${id}`)
    },

    uploadAvatar(formData) {
        return api.uploadFormData('/auth/avatar', formData)
    },

    deleteAvatar() {
        return api.delete('/auth/avatar')
    }
}
