import { api } from './api'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export const mapService = {
    // ─── Maps ────────────────────────────────────────────────
    listMaps(museumId) {
        return api.get(`/museums/${museumId}/maps`)
    },

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

    getMap(mapId) {
        return api.get(`/maps/${mapId}`)
    },

    deleteMap(mapId) {
        return api.delete(`/maps/${mapId}`)
    },

    // ─── Zones ───────────────────────────────────────────────
    getZones(mapId) {
        return api.get(`/maps/${mapId}/zones`)
    },

    createZone(mapId, zone) {
        return api.post(`/maps/${mapId}/zones`, zone)
    },

    updateZone(mapId, zoneId, data) {
        return api.put(`/maps/${mapId}/zones/${zoneId}`, data)
    },

    deleteZone(mapId, zoneId) {
        return api.delete(`/maps/${mapId}/zones/${zoneId}`)
    },

    captureFromRobot(robotId, name) {
        return api.post(`/robots/${robotId}/capture-map`, { name })
    },

    // ─── Robot map assignment ─────────────────────────────────
    assignMap(robotId, mapId) {
        return api.put(`/robots/${robotId}`, { map_id: mapId })
    },

    unassignMap(robotId) {
        return api.put(`/robots/${robotId}`, { map_id: null })
    }
}
