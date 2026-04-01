import { api } from './api'

export const authService = {
    login(identifier, password) {
        return api.post('/auth/login', { identifier, password })
    },

    createVisitor(robotId, name, expertiseLevel = 'general') {
        return api.post('/auth/visitor', { robotId, name, expertiseLevel })
    },

    pingVisitor() {
        return api.post('/auth/visitor/ping')
    },

    checkVisitorStatus() {
        return api.get('/auth/visitor/status')
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
    },

    forgotPassword(email) {
        return api.post('/auth/forgot-password', { email })
    },

    resetPassword(token, new_password) {
        return api.post('/auth/reset-password', { token, new_password })
    }
}
