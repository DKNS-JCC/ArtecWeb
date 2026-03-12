import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'home',
            component: HomeView
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('../views/LoginView.vue')
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('../views/RegisterView.vue')
        },
        {
            path: '/change-password',
            name: 'change-password',
            component: () => import('../views/ChangePasswordView.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/dashboard',
            name: 'dashboard',
            component: () => import('../views/DashboardView.vue'),
            meta: { requiresAuth: true, requiresAdmin: true }
        },
        {
            path: '/403',
            name: 'forbidden',
            component: () => import('../views/ForbiddenView.vue')
        },
        {
            path: '/404',
            name: 'not-found',
            component: () => import('../views/NotFoundView.vue')
        },
        // Catch-all — must be last
        {
            path: '/:pathMatch(.*)*',
            redirect: '/404'
        }
    ]
})

// Navigation Guard — uses Pinia auth store (single source of truth)
router.beforeEach((to, from, next) => {
    const authStore = useAuthStore()

    // 1. Protect any route requiring auth
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        return next({ name: 'login' })
    }

    // 2. Protect dashboard — admin only
    if (to.meta.requiresAdmin && !authStore.isAdmin) {
        return next({ name: 'forbidden' })
    }

    // 3. If authenticated admin with must_change_password, force them to change it
    if (authStore.isAuthenticated && authStore.mustChangePassword && to.name !== 'change-password') {
        return next({ name: 'change-password' })
    }

    // 4. Already logged in → skip login/register pages
    if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated && !authStore.mustChangePassword) {
        return next(authStore.isAdmin ? { name: 'dashboard' } : { name: 'home' })
    }

    next()
})

export default router
