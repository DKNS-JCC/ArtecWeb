// Default to a SAME-ORIGIN relative path ('/api'), which Vite proxies to the
// backend. This means the app works on any network with no IP to configure:
// whatever host the phone used to load the page is the host the API calls go to.
// Set VITE_API_URL only to override (e.g. point at a remote backend).
const API_BASE = import.meta.env.VITE_API_URL || '/api'
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

    if (res.status === 401 && token) {
        localStorage.removeItem('artec_token')
        localStorage.removeItem('artec_user')
        window.location.href = '/login'
        throw new Error('Sesión expirada')
    }

    const data = await res.json()

    if (!res.ok) {
        const err = new Error(data.error || `Error ${res.status}`)
        err.status = res.status
        throw err
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
    patch: (endpoint, body) =>
        request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(body),
        }),
    delete: (endpoint) =>
        request(endpoint, { method: 'DELETE' }),
    uploadFormData: async (endpoint, formData) => {
        const token = localStorage.getItem('artec_token')
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            body: formData,
            headers
        })

        if (res.status === 401 && token) {
            localStorage.removeItem('artec_token')
            localStorage.removeItem('artec_user')
            window.location.href = '/login'
            throw new Error('Sesión expirada')
        }

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
        return data
    }
}
