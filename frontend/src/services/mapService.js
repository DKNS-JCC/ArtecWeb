/**
 * @file Servicio de mapas y zonas: subida y gestión de mapas de museo, CRUD de
 * zonas navegables y asignación de un mapa a un robot. Capa de acceso a las
 * rutas `/museums/:id/maps`, `/maps` y `/robots/:id`.
 * @module services/mapService
 */
import { api } from './api'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

/**
 * Operaciones sobre mapas y zonas.
 * @namespace mapService
 * @memberof module:services/mapService
 */
export const mapService = /** @lends module:services/mapService.mapService */ {
    // ─── Maps ────────────────────────────────────────────────
    /**
     * Lista los mapas de un museo.
     * @param {string} museumId  Identificador del museo.
     * @returns {Promise<Object[]>}
     */
    listMaps(museumId) {
        return api.get(`/museums/${museumId}/maps`)
    },

    /**
     * Sube un mapa (imagen + metadatos) a un museo. Usa `fetch` directo para
     * enviar `multipart/form-data`.
     * @param {string} museumId  Identificador del museo.
     * @param {FormData} formData  Formulario con la imagen del mapa y sus datos.
     * @returns {Promise<Object>}  Mapa creado.
     * @throws {Error} Si la respuesta no es `ok`.
     */
    async uploadMap(museumId, formData) {
        const token = localStorage.getItem('artec_token')
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const res = await fetch(`${API_BASE}/museums/${museumId}/maps`, {
            method: 'POST',
            body: formData,
            headers
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
        return data
    },

    /**
     * Obtiene un mapa por su identificador.
     * @param {string} mapId  Identificador del mapa.
     * @returns {Promise<Object>}
     */
    getMap(mapId) {
        return api.get(`/maps/${mapId}`)
    },

    /**
     * Elimina un mapa.
     * @param {string} mapId  Identificador del mapa.
     * @returns {Promise<Object>}
     */
    deleteMap(mapId) {
        return api.delete(`/maps/${mapId}`)
    },

    // ─── Zones ───────────────────────────────────────────────
    /**
     * Lista las zonas de un mapa.
     * @param {string} mapId  Identificador del mapa.
     * @returns {Promise<Object[]>}
     */
    getZones(mapId) {
        return api.get(`/maps/${mapId}/zones`)
    },

    /**
     * Crea una zona dentro de un mapa.
     * @param {string} mapId  Identificador del mapa.
     * @param {Object} zone  Datos de la zona (nombre, categoría, coordenadas…).
     * @returns {Promise<Object>}
     */
    createZone(mapId, zone) {
        return api.post(`/maps/${mapId}/zones`, zone)
    },

    /**
     * Actualiza una zona existente.
     * @param {string} mapId  Identificador del mapa.
     * @param {string} zoneId  Identificador de la zona.
     * @param {Object} data  Campos a modificar.
     * @returns {Promise<Object>}
     */
    updateZone(mapId, zoneId, data) {
        return api.put(`/maps/${mapId}/zones/${zoneId}`, data)
    },

    /**
     * Elimina una zona.
     * @param {string} mapId  Identificador del mapa.
     * @param {string} zoneId  Identificador de la zona.
     * @returns {Promise<Object>}
     */
    deleteZone(mapId, zoneId) {
        return api.delete(`/maps/${mapId}/zones/${zoneId}`)
    },

    /**
     * Captura un mapa nuevo directamente desde el robot (SLAM) y lo guarda.
     * @param {string} robotId  Identificador del robot.
     * @param {string} name  Nombre del mapa a crear.
     * @returns {Promise<Object>}
     */
    captureFromRobot(robotId, name) {
        return api.post(`/robots/${robotId}/capture-map`, { name })
    },

    // ─── Robot map assignment ─────────────────────────────────
    /**
     * Asigna un mapa a un robot.
     * @param {string} robotId  Identificador del robot.
     * @param {string} mapId  Identificador del mapa.
     * @returns {Promise<Object>}
     */
    assignMap(robotId, mapId) {
        return api.put(`/robots/${robotId}`, { map_id: mapId })
    },

    /**
     * Desasigna el mapa actual de un robot.
     * @param {string} robotId  Identificador del robot.
     * @returns {Promise<Object>}
     */
    unassignMap(robotId) {
        return api.put(`/robots/${robotId}`, { map_id: null })
    }
}
