import { api } from './api'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export const mapService = {
    getMap(robotId) {
        return api.get(`/robots/${robotId}/map`)
    },

    async uploadMap(robotId, formData) {
        const token = localStorage.getItem('artec_token')
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const res = await fetch(`${API_BASE}/robots/${robotId}/map`, {
            method: 'POST',
            body: formData,
            headers
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
        return data
    },

    deleteMap(robotId) {
        return api.delete(`/robots/${robotId}/map`)
    },

    getPlaces(robotId) {
        return api.get(`/robots/${robotId}/places`)
    },

    createPlace(robotId, place) {
        return api.post(`/robots/${robotId}/places`, place)
    },

    updatePlace(robotId, placeId, data) {
        return api.put(`/robots/${robotId}/places/${placeId}`, data)
    },

    deletePlace(robotId, placeId) {
        return api.delete(`/robots/${robotId}/places/${placeId}`)
    }
}
