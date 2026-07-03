/**
 * @module stores/auth
 * @description
 * Almacén de Pinia para la autenticación. Mantiene el token JWT y los datos del
 * usuario, expone propiedades calculadas de rol y persiste la sesión en
 * `localStorage`. Actúa como VistaModelo (MVVM) del flujo de acceso.
 *
 * Store *setup* de Pinia. Es la **fuente única de verdad** de la sesión y se
 * usa también en los *navigation guards* del {@link module:config/router}.
 *
 * **Estado**
 * - `token` `{Ref<string|null>}` - Token JWT en curso.
 * - `user` `{Ref<Object|null>}` - Datos del usuario/visitante autenticado.
 * - `language` `{Ref<string>}` - Idioma preferido (persistido).
 *
 * **Getters (computed)**
 * - `isAuthenticated`, `isMuseumAdmin`, `isPlatformAdmin`, `isTechnician`,
 *   `isStaff` (técnicos + admins), `isVisitor`, `mustChangePassword`.
 *
 * **Acciones**
 * - `initFromStorage`, `login`, `createVisitor`, `pingVisitor`,
 *   `checkVisitorStatus`, `endVisitor`, `changePassword`, `updateUserAvatar`,
 *   `setLanguage`, `logout`.
 *
 * **Dependencias:** `pinia`, `vue` (`ref`/`computed`),
 * {@link module:services/authService}.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/authService'
import { STORAGE_KEYS } from '@/constants/storageKeys'

/**
 * Decodifica el *payload* de un JWT sin verificar la firma.
 * @private
 * @param {string} token  Token JWT.
 * @returns {Object|null}  Payload decodificado o `null` si es inválido.
 */
function decodeToken(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]))
    } catch {
        return null
    }
}

/**
 * Define y devuelve el store de autenticación.
 * @function useAuthStore
 * @memberof module:stores/auth
 * @returns {Object}  API reactiva del store (estado, getters y acciones).
 */
export const useAuthStore = defineStore('auth', () => {
    const token = ref(null)
    const user = ref(null)
    const language = ref('es')

    const isAuthenticated = computed(() => !!token.value)
    const isMuseumAdmin = computed(() => user.value?.role === 'museum_admin' || user.value?.role === 'platform_admin')
    const isPlatformAdmin = computed(() => user.value?.role === 'platform_admin')
    const isTechnician = computed(() => user.value?.role === 'technician')
    // Personal = cualquiera que pueda operar robots (técnicos + administradores).
    const isStaff = computed(() => isTechnician.value || isMuseumAdmin.value)
    const isVisitor = computed(() => user.value?.role === 'visitor')
    const mustChangePassword = computed(() => {
        if (!token.value) return false
        const payload = decodeToken(token.value)
        return payload?.must_change_password === true
    })


    /** Rehidrata la sesión (token, usuario e idioma) desde `localStorage`. */
    function initFromStorage() {
        const savedToken = localStorage.getItem(STORAGE_KEYS.TOKEN)
        const savedUser = localStorage.getItem(STORAGE_KEYS.USER)
        const savedLanguage = localStorage.getItem(STORAGE_KEYS.LANGUAGE)
        if (savedToken) {
            token.value = savedToken
            user.value = savedUser ? JSON.parse(savedUser) : decodeToken(savedToken)
        }
        if (savedLanguage) {
            language.value = savedLanguage
        }
    }

    /**
     * Guarda el token y el usuario en el estado y en `localStorage`.
     * @private
     * @param {string} newToken  Token JWT.
     * @param {Object} newUser  Datos del usuario/visitante.
     */
    function persist(newToken, newUser) {
        token.value = newToken
        user.value = newUser
        localStorage.setItem(STORAGE_KEYS.TOKEN, newToken)
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser))
    }

    /**
     * Inicia sesión de personal/admin y persiste la sesión.
     * @param {string} identifier  Email o nombre de usuario.
     * @param {string} password  Contraseña.
     * @returns {Promise<Object>}  Respuesta del servicio (token + usuario).
     */
    async function login(identifier, password) {
        const data = await authService.login(identifier, password)
        persist(data.token, data.user)
        return data
    }

    /**
     * Crea una sesión de visitante (tras escanear el QR) y la persiste.
     * @param {string} robotId  Robot escaneado.
     * @param {string} name  Nombre del visitante.
     * @param {string} [expertiseLevel='general']  Nivel de conocimiento.
     * @returns {Promise<Object>}  Respuesta del servicio (token + visitante).
     */
    async function createVisitor(robotId, name, expertiseLevel = 'general') {
        const data = await authService.createVisitor(robotId, name, expertiseLevel, language.value)
        persist(data.token, data.visitor)
        return data
    }

    /**
     * Envía un *heartbeat* para mantener viva la sesión del visitante.
     * @returns {Promise<Object|undefined>}
     */
    async function pingVisitor() {
        if (!isAuthenticated.value) return;
        return await authService.pingVisitor()
    }

    /**
     * Comprueba si la sesión del visitante sigue activa en el servidor.
     * @returns {Promise<{active: boolean}>}
     */
    async function checkVisitorStatus() {
        if (!isAuthenticated.value) return { active: false };
        try {
            return await authService.checkVisitorStatus()
        } catch {
            return { active: false }
        }
    }

    /** Finaliza la sesión del visitante en el servidor y hace `logout()` local. */
    async function endVisitor() {
        if (!isAuthenticated.value) return;
        try {
            await authService.endVisitor()
        } catch (e) {
            console.error('Error ending visitor session', e)
        }
        logout()
    }

    /**
     * Cambia la contraseña y actualiza el token resultante.
     * @param {string} currentPassword  Contraseña actual.
     * @param {string} newPassword  Nueva contraseña.
     * @returns {Promise<{token: string}>}
     */
    async function changePassword(currentPassword, newPassword) {
        const data = await authService.changePassword(currentPassword, newPassword)
        token.value = data.token
        localStorage.setItem(STORAGE_KEYS.TOKEN, data.token)
        return data
    }

    /**
     * Actualiza la URL del avatar del usuario en el estado y en `localStorage`.
     * @param {string} avatarUrl  Nueva URL del avatar.
     */
    function updateUserAvatar(avatarUrl) {
        if (user.value) {
            user.value.avatar = avatarUrl
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user.value))
        }
    }

    /** Cierra la sesión: limpia el estado y `localStorage`. */
    function logout() {
        token.value = null
        user.value = null
        localStorage.removeItem(STORAGE_KEYS.TOKEN)
        localStorage.removeItem(STORAGE_KEYS.USER)
    }

    /**
     * Fija el idioma preferido y lo persiste.
     * @param {string} lang  Código de idioma (p. ej. `es`, `en`).
     */
    function setLanguage(lang) {
        language.value = lang
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang)
    }

    return {
        token,
        user,
        language,
        isAuthenticated,
        isMuseumAdmin,
        isPlatformAdmin,
        isTechnician,
        isStaff,
        isVisitor,
        mustChangePassword,
        initFromStorage,
        login,
        createVisitor,
        pingVisitor,
        checkVisitorStatus,
        endVisitor,
        changePassword,
        updateUserAvatar,
        setLanguage,
        logout,
    }
})
