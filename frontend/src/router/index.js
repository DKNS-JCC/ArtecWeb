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
            // Personal = técnicos + administradores. La propia vista limita qué pestañas ve
            // un técnico (solo Robots).
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
        // Catch-all - debe ir el último
        {
            path: '/:pathMatch(.*)*',
            redirect: '/404'
        }
    ]
})

// Guard de navegación - usa el store de auth de Pinia (fuente única de verdad)
router.beforeEach((to, from, next) => {
    const authStore = useAuthStore()

    // 1. Obliga a los visitantes activos a permanecer en el chat hasta que terminen la sesión
    if (authStore.isAuthenticated && authStore.isVisitor && to.name !== 'chat') {
        return next({ name: 'chat' })
    }

    // 2. Protege cualquier ruta que requiera autenticación
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        return next({ name: 'login' })
    }

    // 3. Protege las rutas de personal (como el perfil) frente a los visitantes
    if (to.meta.requiresStaff && authStore.user?.role === 'visitor') {
        return next({ name: 'home' })
    }

    // 4. Si un admin autenticado tiene must_change_password, le obliga a cambiarla
    if (authStore.isAuthenticated && authStore.mustChangePassword && to.name !== 'change-password') {
        return next({ name: 'change-password' })
    }

    // 5. Ya con sesión iniciada → salta las páginas de login
    if (to.name === 'login' && authStore.isAuthenticated && !authStore.mustChangePassword) {
        return next(authStore.isStaff ? { name: 'dashboard' } : { name: 'home' })
    }

    next()
})

export default router
