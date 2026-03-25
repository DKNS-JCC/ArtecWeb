import { api } from './api'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export const mapService = {
    getMap(museumId) {
        return api.get(`/museums/${museumId}/map`)
    },

    async uploadMap(museumId, formData) {
        const token = localStorage.getItem('artec_token')
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const res = await fetch(`${API_BASE}/museums/${museumId}/map`, {
            method: 'POST',
            body: formData,
            headers
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
        return data
    },

    deleteMap(museumId) {
        return api.delete(`/museums/${museumId}/map`)
    },

    getPlaces(museumId) {
        return api.get(`/museums/${museumId}/places`)
    },

    createPlace(museumId, place) {
        return api.post(`/museums/${museumId}/places`, place)
    },

    updatePlace(museumId, placeId, data) {
        return api.put(`/museums/${museumId}/places/${placeId}`, data)
    },

    deletePlace(museumId, placeId) {
        return api.delete(`/museums/${museumId}/places/${placeId}`)
    }
}
