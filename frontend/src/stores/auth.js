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
    const language = ref('es')

    const isAuthenticated = computed(() => !!token.value)
    const isMuseumAdmin = computed(() => user.value?.role === 'museum_admin' || user.value?.role === 'platform_admin')
    const isPlatformAdmin = computed(() => user.value?.role === 'platform_admin')
    const isVisitor = computed(() => user.value?.role === 'visitor')
    const mustChangePassword = computed(() => {
        if (!token.value) return false
        const payload = decodeToken(token.value)
        return payload?.must_change_password === true
    })


    function initFromStorage() {
        const savedToken = localStorage.getItem('artec_token')
        const savedUser = localStorage.getItem('artec_user')
        const savedLanguage = localStorage.getItem('artec_language')
        if (savedToken) {
            token.value = savedToken
            user.value = savedUser ? JSON.parse(savedUser) : decodeToken(savedToken)
        }
        if (savedLanguage) {
            language.value = savedLanguage
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

    async function createVisitor(robotId, name, expertiseLevel = 'general') {
        const data = await authService.createVisitor(robotId, name, expertiseLevel, language.value)
        persist(data.token, data.visitor)
        return data
    }

    async function pingVisitor() {
        if (!isAuthenticated.value) return;
        return await authService.pingVisitor()
    }

    async function checkVisitorStatus() {
        if (!isAuthenticated.value) return { active: false };
        try {
            return await authService.checkVisitorStatus()
        } catch {
            return { active: false }
        }
    }

    async function endVisitor() {
        if (!isAuthenticated.value) return;
        try {
            await authService.endVisitor()
        } catch (e) {
            console.error('Error ending visitor session', e)
        }
        logout()
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

    function setLanguage(lang) {
        language.value = lang
        localStorage.setItem('artec_language', lang)
    }

    return {
        token,
        user,
        language,
        isAuthenticated,
        isMuseumAdmin,
        isPlatformAdmin,
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
