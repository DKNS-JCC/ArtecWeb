const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

/**
 * Base HTTP client for the Artec API.
 * Automatically injects the auth token and handles 401 redirects.
 */
async function request(endpoint, options = {}) {
    const token = localStorage.getItem('artec_token')

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    })

    // Global 401 handler — clear session & redirect
    if (res.status === 401 && token) {
        localStorage.removeItem('artec_token')
        localStorage.removeItem('artec_user')
        window.location.href = '/login'
        throw new Error('Sesión expirada')
    }

    const data = await res.json()

    if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`)
    }

    return data
}

export const api = {
    get: (endpoint) => request(endpoint),
    post: (endpoint, body) =>
        request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    put: (endpoint, body) =>
        request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        }),
    delete: (endpoint) =>
        request(endpoint, { method: 'DELETE' }),
}
