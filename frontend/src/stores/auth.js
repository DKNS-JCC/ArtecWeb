import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/authService'

/**
 * Decode a JWT payload without a library.
 */
function decodeToken(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]))
    } catch {
        return null
    }
}

export const useAuthStore = defineStore('auth', () => {
    // ── State ──
    const token = ref(null)
    const user = ref(null)

    // ── Getters ──
    const isAuthenticated = computed(() => !!token.value)
    const isAdmin = computed(() => user.value?.role === 'admin')
    const mustChangePassword = computed(() => {
        if (!token.value) return false
        const payload = decodeToken(token.value)
        return payload?.must_change_password === true
    })

    // ── Actions ──

    /** Hydrate state from localStorage (call on app init) */
    function initFromStorage() {
        const savedToken = localStorage.getItem('artec_token')
        const savedUser = localStorage.getItem('artec_user')
        if (savedToken) {
            token.value = savedToken
            user.value = savedUser ? JSON.parse(savedUser) : decodeToken(savedToken)
        }
    }

    /** Persist token + user to localStorage */
    function persist(newToken, newUser) {
        token.value = newToken
        user.value = newUser
        localStorage.setItem('artec_token', newToken)
        localStorage.setItem('artec_user', JSON.stringify(newUser))
    }

    /** Login and store session */
    async function login(identifier, password) {
        const data = await authService.login(identifier, password)
        persist(data.token, data.user)
        return data
    }

    /** Register and store session */
    async function register(username, email, password) {
        const data = await authService.register(username, email, password)
        persist(data.token, data.user)
        return data
    }

    /** Change password and update token */
    async function changePassword(currentPassword, newPassword) {
        const data = await authService.changePassword(currentPassword, newPassword)
        // Update token (must_change_password is now false)
        token.value = data.token
        localStorage.setItem('artec_token', data.token)
        return data
    }

    /** Clear session and remove from localStorage */
    function logout() {
        token.value = null
        user.value = null
        localStorage.removeItem('artec_token')
        localStorage.removeItem('artec_user')
    }

    return {
        // state
        token,
        user,
        // getters
        isAuthenticated,
        isAdmin,
        mustChangePassword,
        // actions
        initFromStorage,
        login,
        register,
        changePassword,
        logout,
    }
})
