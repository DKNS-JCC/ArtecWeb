/**
 * @module config/router
 * @description
 * Configuración del router (Vue Router). Declara las rutas de la SPA con
 * *lazy loading* y un *navigation guard* global que aplica las reglas de acceso
 * por rol, apoyándose en {@link module:stores/auth}.
 *
 * **Rutas principales:** `/` (home), `/chat` (visitante), `/login`,
 * `/change-password`, `/profile`, `/dashboard`, `/robots/:id/control`,
 * `/r/:id` (escaneo QR), `/forgot-password`, `/reset-password`, `/403`, `/404`
 * y un *catch-all* que redirige a `/404`. Las rutas con
 * `meta.requiresAuth` exigen sesión y las de `meta.requiresStaff` exigen
 * personal (técnico/admin).
 *
 * **Guard de navegación** (`beforeEach`): mantiene al visitante activo en el
 * chat, protege rutas autenticadas y de personal, fuerza el cambio de
 * contraseña obligatorio y evita volver a `login` con sesión iniciada.
 *
 * **Dependencias:** `vue-router`, {@link module:stores/auth}.
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '../views/HomeView.vue'

/**
 * Instancia del router de la aplicación (objeto `Router` de Vue Router).
 * @type {Object}
 * @memberof module:config/router
 */
const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'home',
            component: HomeView
        },
        {
            path: '/chat',
            name: 'chat',
            component: () => import('../views/ChatView.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('../views/LoginView.vue')
        },
        {
            path: '/change-password',
            name: 'change-password',
            component: () => import('../views/ChangePasswordView.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/profile',
            name: 'profile',
            component: () => import('../views/ProfileView.vue'),
            meta: { requiresAuth: true, requiresStaff: true }
        },
        {
            path: '/dashboard',
            name: 'dashboard',
            component: () => import('../views/DashboardView.vue'),
            // Staff = technicians + admins. The view itself limits which tabs a
            // technician sees (Robots only).
            meta: { requiresAuth: true, requiresStaff: true }
        },
        {
            path: '/robots/:id/control',
            name: 'robot-control',
            component: () => import('../views/RobotControlView.vue'),
            meta: { requiresAuth: true, requiresStaff: true }
        },
        {
            path: '/r/:id',
            name: 'scan',
            component: () => import('../views/ScanView.vue')
        },
        {
            path: '/forgot-password',
            name: 'forgot-password',
            component: () => import('../views/ForgotPasswordView.vue')
        },
        {
            path: '/reset-password',
            name: 'reset-password',
            component: () => import('../views/ResetPasswordView.vue')
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
        // Catch-all - must be last
        {
            path: '/:pathMatch(.*)*',
            redirect: '/404'
        }
    ]
})

// Navigation Guard - uses Pinia auth store (single source of truth)
router.beforeEach((to, from, next) => {
    const authStore = useAuthStore()

    // 0. Force active visitors to stay in the chat until they end the session
    if (authStore.isAuthenticated && authStore.isVisitor && to.name !== 'chat') {
        return next({ name: 'chat' })
    }

    // 1. Protect any route requiring auth
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        return next({ name: 'login' })
    }

    // 1.5 Protect staff routes (like profile) from visitors
    if (to.meta.requiresStaff && authStore.user?.role === 'visitor') {
        return next({ name: 'home' })
    }

    // 3. If authenticated admin with must_change_password, force them to change it
    if (authStore.isAuthenticated && authStore.mustChangePassword && to.name !== 'change-password') {
        return next({ name: 'change-password' })
    }

    // 4. Already logged in → skip login pages
    if (to.name === 'login' && authStore.isAuthenticated && !authStore.mustChangePassword) {
        return next(authStore.isStaff ? { name: 'dashboard' } : { name: 'home' })
    }

    next()
})

export default router
