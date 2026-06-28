/**
 * @file Servicio de autenticación y gestión de cuentas. Cubre el login de
 * personal/admin, el ciclo de vida de la sesión efímera del visitante, la
 * gestión de personal (admin), el avatar y la recuperación de contraseña.
 * Capa de acceso a las rutas `/auth` y `/admin` de la API REST.
 * @module services/authService
 */
import { api } from './api'

/**
 * Conjunto de operaciones de autenticación contra la API.
 * @namespace authService
 * @memberof module:services/authService
 */
export const authService = /** @lends module:services/authService.authService */ {
    /**
     * Inicia sesión de personal o administrador.
     * @param {string} identifier  Email o nombre de usuario.
     * @param {string} password  Contraseña en claro.
     * @returns {Promise<{token: string, user: Object}>}  Token JWT y datos del usuario.
     */
    login(identifier, password) {
        return api.post('/auth/login', { identifier, password })
    },

    /**
     * Crea una sesión efímera de visitante asociada a un robot.
     * @param {string} robotId  Identificador del robot escaneado por QR.
     * @param {string} name  Nombre que el visitante introduce.
     * @param {string} [expertiseLevel='general']  Nivel de conocimiento (adapta el lenguaje de la IA).
     * @param {string} [language='es']  Idioma preferido del visitante.
     * @returns {Promise<{token: string, visitor: Object}>}  Token JWT y datos del visitante.
     */
    createVisitor(robotId, name, expertiseLevel = 'general', language = 'es') {
        return api.post('/auth/visitor', { robotId, name, expertiseLevel, language })
    },

    /**
     * Comprobación previa al escanear el QR: indica si el robot puede aceptar
     * una sesión de visitante.
     * @param {string} robotId  Identificador del robot.
     * @returns {Promise<{available: boolean, online: boolean, occupied: boolean, robot_name: string}>}
     */
    checkRobotAvailability(robotId) {
        return api.get(`/robots/${robotId}/availability`)
    },

    /**
     * Mantiene viva la sesión del visitante (heartbeat).
     * @returns {Promise<Object>}
     */
    pingVisitor() {
        return api.post('/auth/visitor/ping')
    },

    /**
     * Consulta si la sesión del visitante sigue activa en el servidor.
     * @returns {Promise<{active: boolean}>}
     */
    checkVisitorStatus() {
        return api.get('/auth/visitor/status')
    },

    /**
     * Finaliza la sesión del visitante en el servidor.
     * @returns {Promise<Object>}
     */
    endVisitor() {
        return api.post('/auth/visitor/end')
    },

    /**
     * Cambia la contraseña del usuario autenticado.
     * @param {string} current_password  Contraseña actual.
     * @param {string} new_password  Nueva contraseña.
     * @returns {Promise<{token: string}>}  Nuevo token JWT.
     */
    changePassword(current_password, new_password) {
        return api.post('/auth/change-password', { current_password, new_password })
    },

    /**
     * Da de alta una cuenta de personal (técnico o administrador). Solo admin.
     * @param {string} name  Nombre del miembro del personal.
     * @param {string} email  Email de acceso.
     * @param {string} role  Rol a asignar (`technician`, `museum_admin`…).
     * @param {string} museum_id  Museo al que se asocia.
     * @returns {Promise<Object>}
     */
    createStaff(name, email, role, museum_id) {
        return api.post('/admin/create-staff', { name, email, role, museum_id })
    },

    /**
     * Lista los usuarios visibles para el administrador actual.
     * @returns {Promise<Object[]>}
     */
    listUsers() {
        return api.get('/admin/users')
    },

    /**
     * Actualiza los datos de un miembro del personal.
     * @param {string} id  Identificador del usuario.
     * @param {Object} data  Campos a modificar.
     * @returns {Promise<Object>}
     */
    updateStaff(id, data) {
        return api.patch(`/admin/users/${id}`, data)
    },

    /**
     * Activa o desactiva una cuenta de personal.
     * @param {string} id  Identificador del usuario.
     * @returns {Promise<Object>}
     */
    toggleStaffActive(id) {
        return api.patch(`/admin/users/${id}/active`)
    },

    /**
     * Elimina una cuenta de personal.
     * @param {string} id  Identificador del usuario.
     * @returns {Promise<Object>}
     */
    deleteStaff(id) {
        return api.delete(`/admin/users/${id}`)
    },

    /**
     * Sube/actualiza la imagen de perfil del usuario autenticado.
     * @param {FormData} formData  Formulario con el fichero de imagen.
     * @returns {Promise<{avatar: string}>}  URL del nuevo avatar.
     */
    uploadAvatar(formData) {
        return api.uploadFormData('/auth/avatar', formData)
    },

    /**
     * Elimina la imagen de perfil del usuario autenticado.
     * @returns {Promise<Object>}
     */
    deleteAvatar() {
        return api.delete('/auth/avatar')
    },

    /**
     * Solicita un correo de restablecimiento de contraseña.
     * @param {string} email  Email de la cuenta.
     * @returns {Promise<Object>}
     */
    forgotPassword(email) {
        return api.post('/auth/forgot-password', { email })
    },

    /**
     * Restablece la contraseña a partir del token recibido por correo.
     * @param {string} token  Token de restablecimiento.
     * @param {string} new_password  Nueva contraseña.
     * @returns {Promise<Object>}
     */
    resetPassword(token, new_password) {
        return api.post('/auth/reset-password', { token, new_password })
    }
}
