/**
 * @file Servicio de museos: CRUD reservado al superadministrador. Capa de
 * acceso a la ruta `/museums`.
 * @module services/museumService
 */
import { api } from './api'

/**
 * Operaciones de gestión de museos (solo superadmin).
 * @namespace museumService
 * @memberof module:services/museumService
 */
export const museumService = /** @lends module:services/museumService.museumService */ {
    /**
     * Lista todos los museos.
     * @returns {Promise<Object[]>}
     */
    fetchAll() {
        return api.get('/museums')
    },

    /**
     * Crea un nuevo museo.
     * @param {Object} data  Datos del museo (nombre, empresa…).
     * @returns {Promise<Object>}
     */
    create(data) {
        return api.post('/museums', data)
    },

    /**
     * Actualiza el nombre/empresa de un museo.
     * @param {string} id  Identificador del museo.
     * @param {Object} data  Campos a modificar.
     * @returns {Promise<Object>}
     */
    update(id, data) {
        return api.put(`/museums/${id}`, data)
    },

    /**
     * Elimina un museo y todo lo que cuelga de él.
     * @param {string} id  Identificador del museo.
     * @returns {Promise<Object>}
     */
    remove(id) {
        return api.delete(`/museums/${id}`)
    }
}
