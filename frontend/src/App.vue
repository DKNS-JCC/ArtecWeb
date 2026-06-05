<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDark, useToggle } from '@vueuse/core'
import { Sun, Moon, User } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'

const isDark = useDark()
const toggleDark = useToggle(isDark)

const menuOpen = ref(false)
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const isMuseumAdmin = computed(() => authStore.isMuseumAdmin)
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)
const isVisitor = computed(() => authStore.isVisitor)

const avatarUrl = computed(() => {
  const avatar = authStore.user?.avatar
  if (!avatar) return null
  const baseUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : ''
  return `${baseUrl}${avatar}`
})

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
}

const logout = () => {
  authStore.logout()
  menuOpen.value = false
  router.push('/')
}

// Close menu on route change
router.afterEach(() => {
  menuOpen.value = false
})
</script>

<template>
  <div
    class="min-h-screen flex flex-col font-sans antialiased bg-background text-foreground transition-colors duration-300 relative">

    <!-- Minimal Logo (Fixed Top Left) -->
    <div v-show="route.name !== 'chat'" class="fixed top-6 left-6 z-40">
      <router-link to="/" class="flex items-center gap-3 group">
        <img src="/icon.ico" alt="Artec"
          class="w-10 h-10 rounded-xl shadow-[0_4px_14px_rgba(37,99,235,0.3)] transition-transform group-hover:scale-105 object-contain" />
        <span class="font-bold text-xl tracking-tight text-foreground drop-shadow-sm">Artec</span>
      </router-link>
    </div>

    <!-- Top Right Actions -->
    <div v-show="route.name !== 'chat'" class="fixed top-6 right-6 z-50 flex items-center gap-3">
      <!-- User profile/login button (Hidden for Visitors) -->
      <router-link v-if="!isVisitor" :to="isAuthenticated ? '/profile' : '/login'"
        class="w-12 h-12 rounded-full bg-card/80 backdrop-blur-md border border-border shadow-sm flex items-center justify-center transition-all hover:scale-105 hover:shadow-md cursor-pointer pointer-events-auto overflow-hidden"
        :title="isAuthenticated ? 'Mi Perfil' : 'Iniciar Sesión'">

        <img v-if="isAuthenticated && avatarUrl" :src="avatarUrl" alt="Avatar" class="w-full h-full object-cover" />
        <User v-else class="w-5 h-5" :class="isAuthenticated ? 'text-primary' : 'text-muted-foreground'" />
      </router-link>

      <!-- Theme Toggle -->
      <button @click="toggleDark()"
        class="w-12 h-12 rounded-full bg-card/80 backdrop-blur-md border border-border shadow-sm flex items-center justify-center transition-all hover:scale-105 hover:shadow-md focus:outline-none pointer-events-auto"
        aria-label="Alternar modo oscuro">
        <Sun v-if="isDark" class="w-5 h-5 text-yellow-500" />
        <Moon v-else class="w-5 h-5 text-muted-foreground" />
      </button>

      <!-- Hidden Navigation Trigger -->
      <button @click="toggleMenu"
        class="w-12 h-12 rounded-full bg-card/80 backdrop-blur-md border border-border shadow-sm flex flex-col items-center justify-center gap-[4px] transition-all hover:scale-105 hover:shadow-md focus:outline-none pointer-events-auto"
        aria-label="Abrir menú">
        <span class="block w-5 h-[2px] bg-foreground transition-all duration-300 rounded-full"
          :class="{ 'rotate-45 translate-y-[6px]': menuOpen }"></span>
        <span class="block w-5 h-[2px] bg-foreground transition-all duration-300 rounded-full"
          :class="{ 'opacity-0': menuOpen }"></span>
        <span class="block w-5 h-[2px] bg-foreground transition-all duration-300 rounded-full"
          :class="{ '-rotate-45 -translate-y-[6px]': menuOpen }"></span>
      </button>
    </div>

    <!-- Fullscreen Overlay Navigation -->
    <transition name="menu-fade">
      <div v-show="menuOpen"
        class="fixed inset-0 z-40 bg-background/95 backdrop-blur-3xl flex flex-col items-center justify-center">
        <nav class="flex flex-col items-center gap-10 text-center">
          <router-link to="/"
            class="text-4xl md:text-6xl font-black text-foreground hover:text-primary transition-colors drop-shadow-sm"
            active-class="!text-primary">
            Inicio
          </router-link>

          <router-link v-if="isMuseumAdmin || isPlatformAdmin" to="/dashboard"
            class="text-4xl md:text-6xl font-black text-foreground hover:text-primary transition-colors drop-shadow-sm"
            active-class="!text-primary">
            Panel de control
          </router-link>

        </nav>

        <div class="absolute bottom-12 text-muted-foreground font-semibold tracking-wider text-sm uppercase">
          &copy; 2026 Artec Robotics
        </div>
      </div>
    </transition>

    <!-- Main Content -->
    <main class="flex-1 relative w-full">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

  </div>
</template>

<style>
/* Route Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Fullscreen Menu Overlay Transition */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
}

.menu-fade-enter-active nav,
.menu-fade-leave-active nav {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.menu-fade-enter-from nav {
  transform: translateY(20px);
}

.menu-fade-leave-to nav {
  transform: translateY(20px);
}
</style>
