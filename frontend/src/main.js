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
