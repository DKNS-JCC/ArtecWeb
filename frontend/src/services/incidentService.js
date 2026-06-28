/**
 * @file Servicio de incidencias: registro de eventos operativos (p. ej. fallos
 * de navegación) que el personal del museo revisa. Capa de acceso a la ruta
 * `/admin/incidents`.
 * @module services/incidentService
 */
import { api } from './api'

/**
 * Operaciones sobre el registro de incidencias.
 * @namespace incidentService
 * @memberof module:services/incidentService
 */
export const incidentService = /** @lends module:services/incidentService.incidentService */ {
    /**
     * Lista las incidencias visibles para el administrador actual (acotadas por
     * museo en el servidor).
     * @returns {Promise<Object[]>}
     */
    fetchAll() {
        return api.get('/admin/incidents')
    },

    /**
     * Marca una incidencia como resuelta/atendida.
     * @param {string} id  Identificador de la incidencia.
     * @returns {Promise<Object>}
     */
    resolve(id) {
        return api.patch(`/admin/incidents/${id}/resolve`)
    },
}
