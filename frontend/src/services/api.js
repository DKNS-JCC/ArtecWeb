/**
 * @file Cliente HTTP base del frontend. Envuelve `fetch`, inyecta la cabecera
 * `Authorization: Bearer <token>` cuando hay sesión y centraliza el manejo de
 * errores (un 401 cierra la sesión y redirige al login).
 * @module services/api
 */
// Default to a SAME-ORIGIN relative path ('/api'), which Vite proxies to the
// backend. This means the app works on any network with no IP to configure:
// whatever host the phone used to load the page is the host the API calls go to.
// Set VITE_API_URL only to override (e.g. point at a remote backend).
const API_BASE = import.meta.env.VITE_API_URL || '/api'

/**
 * Realiza una petición HTTP contra la API e implementa la lógica transversal:
 * inyección del token JWT, cabeceras JSON, parseo de la respuesta y manejo de
 * errores (un `401` con sesión activa la cierra y redirige a `/login`).
 *
 * @private
 * @param {string} endpoint  Ruta relativa a la API (p. ej. `/auth/login`).
 * @param {RequestInit} [options]  Opciones de `fetch` (método, body, headers…).
 * @returns {Promise<Object>}  Cuerpo de la respuesta ya parseado como JSON.
 * @throws {Error} Si la respuesta no es `ok`; el error lleva `status` con el código HTTP.
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

/**
 * Cliente HTTP del frontend. Todos los servicios de `services/` construyen sus
 * llamadas sobre estos métodos, que envuelven {@link request}.
 *
 * @namespace api
 * @memberof module:services/api
 */
export const api = /** @lends module:services/api.api */ {
    /**
     * Petición `GET`.
     * @param {string} endpoint  Ruta relativa a la API.
     * @returns {Promise<Object>}
     */
    get: (endpoint) => request(endpoint),
    /**
     * Petición `POST` con cuerpo JSON.
     * @param {string} endpoint  Ruta relativa a la API.
     * @param {Object} body  Datos a enviar (se serializan a JSON).
     * @returns {Promise<Object>}
     */
    post: (endpoint, body) =>
        request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    /**
     * Petición `PUT` con cuerpo JSON.
     * @param {string} endpoint  Ruta relativa a la API.
     * @param {Object} body  Datos a enviar (se serializan a JSON).
     * @returns {Promise<Object>}
     */
    put: (endpoint, body) =>
        request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        }),
    /**
     * Petición `PATCH` con cuerpo JSON.
     * @param {string} endpoint  Ruta relativa a la API.
     * @param {Object} [body]  Datos a enviar (se serializan a JSON).
     * @returns {Promise<Object>}
     */
    patch: (endpoint, body) =>
        request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(body),
        }),
    /**
     * Petición `DELETE`.
     * @param {string} endpoint  Ruta relativa a la API.
     * @returns {Promise<Object>}
     */
    delete: (endpoint) =>
        request(endpoint, { method: 'DELETE' }),
    /**
     * Sube un `multipart/form-data` (p. ej. avatar o audio) mediante `POST`.
     * No fija `Content-Type` para que el navegador añada el `boundary`.
     * @param {string} endpoint  Ruta relativa a la API.
     * @param {FormData} formData  Datos del formulario a subir.
     * @returns {Promise<Object>}
     * @throws {Error} Si la respuesta no es `ok` (un `401` cierra sesión).
     */
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
