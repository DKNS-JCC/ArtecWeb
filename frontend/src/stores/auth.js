import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/authService'

function decodeToken(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]))
    } catch {
        return null
    }
}

export const useAuthStore = defineStore('auth', () => {
    const token = ref(null)
    const user = ref(null)

    const isAuthenticated = computed(() => !!token.value)
    const isAdmin = computed(() => user.value?.role === 'admin')
    const mustChangePassword = computed(() => {
        if (!token.value) return false
        const payload = decodeToken(token.value)
        return payload?.must_change_password === true
    })


    function initFromStorage() {
        const savedToken = localStorage.getItem('artec_token')
        const savedUser = localStorage.getItem('artec_user')
        if (savedToken) {
            token.value = savedToken
            user.value = savedUser ? JSON.parse(savedUser) : decodeToken(savedToken)
        }
    }

    function persist(newToken, newUser) {
        token.value = newToken
        user.value = newUser
        localStorage.setItem('artec_token', newToken)
        localStorage.setItem('artec_user', JSON.stringify(newUser))
    }

    async function login(identifier, password) {
        const data = await authService.login(identifier, password)
        persist(data.token, data.user)
        return data
    }

    async function register(username, email, password) {
        const data = await authService.register(username, email, password)
        persist(data.token, data.user)
        return data
    }

    async function changePassword(currentPassword, newPassword) {
        const data = await authService.changePassword(currentPassword, newPassword)
        token.value = data.token
        localStorage.setItem('artec_token', data.token)
        return data
    }

    function updateUserAvatar(avatarUrl) {
        if (user.value) {
            user.value.avatar = avatarUrl
            localStorage.setItem('artec_user', JSON.stringify(user.value))
        }
    }

    function logout() {
        token.value = null
        user.value = null
        localStorage.removeItem('artec_token')
        localStorage.removeItem('artec_user')
    }

    return {
        token,
        user,
        isAuthenticated,
        isAdmin,
        mustChangePassword,
        initFromStorage,
        login,
        register,
        changePassword,
        updateUserAvatar,
        logout,
    }
})
