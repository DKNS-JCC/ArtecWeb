/**
 * @module config/main
 * @description
 * Punto de entrada de la aplicación. Crea la instancia de Vue, instala Pinia y
 * el Router, **rehidrata la sesión** desde `localStorage` antes de configurar el
 * router (para que los *guards* vean el estado ya cargado) y monta la app en
 * `#app`.
 *
 * **Dependencias:** `vue`, `pinia`, {@link module:config/router},
 * {@link module:stores/auth}.
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Hydrate auth state from localStorage before configuring the router
const authStore = useAuthStore()
authStore.initFromStorage()

app.use(router)

app.mount('#app')
