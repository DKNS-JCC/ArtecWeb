<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDark, useToggle } from '@vueuse/core'
import { Sun, Moon } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'

const isDark = useDark()
const toggleDark = useToggle(isDark)

const menuOpen = ref(false)
const router = useRouter()
const authStore = useAuthStore()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)

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
    <div class="fixed top-6 left-6 z-40">
      <router-link to="/" class="flex items-center gap-3 group">
        <img src="/icon.ico" alt="Artec"
          class="w-10 h-10 rounded-xl shadow-[0_4px_14px_rgba(37,99,235,0.3)] transition-transform group-hover:scale-105 object-contain" />
        <span class="font-bold text-xl tracking-tight text-foreground drop-shadow-sm">Artec</span>
      </router-link>
    </div>

    <!-- Theme Toggle (Fixed Top Right, next to menu) -->
    <button @click="toggleDark()"
      class="fixed top-6 right-20 z-50 w-12 h-12 rounded-full bg-card/80 backdrop-blur-md border border-border shadow-sm flex items-center justify-center transition-all hover:scale-105 hover:shadow-md focus:outline-none"
      aria-label="Alternar modo oscuro">
      <Sun v-if="isDark" class="w-5 h-5 text-yellow-500" />
      <Moon v-else class="w-5 h-5 text-muted-foreground" />
    </button>

    <!-- Hidden Navigation Trigger (Fixed Top Right) -->
    <button @click="toggleMenu"
      class="fixed top-6 right-6 z-50 w-12 h-12 rounded-full bg-card/80 backdrop-blur-md border border-border shadow-sm flex flex-col items-center justify-center gap-[4px] transition-all hover:scale-105 hover:shadow-md focus:outline-none"
      aria-label="Abrir menú">
      <span class="block w-5 h-[2px] bg-foreground transition-all duration-300 rounded-full"
        :class="{ 'rotate-45 translate-y-[6px]': menuOpen }"></span>
      <span class="block w-5 h-[2px] bg-foreground transition-all duration-300 rounded-full"
        :class="{ 'opacity-0': menuOpen }"></span>
      <span class="block w-5 h-[2px] bg-foreground transition-all duration-300 rounded-full"
        :class="{ '-rotate-45 -translate-y-[6px]': menuOpen }"></span>
    </button>

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

          <router-link to="/empresas"
            class="text-4xl md:text-6xl font-black text-foreground hover:text-primary transition-colors drop-shadow-sm"
            active-class="!text-primary">
            Soluciones
          </router-link>

          <!-- Admin-only: Panel link -->
          <router-link v-if="isAdmin" to="/dashboard"
            class="text-4xl md:text-6xl font-black text-foreground hover:text-primary transition-colors drop-shadow-sm"
            active-class="!text-primary">
            Panel
          </router-link>

          <!-- Auth Actions -->
          <div class="mt-8 flex flex-col items-center gap-4">
            <button v-if="isAuthenticated" @click="logout"
              class="text-xl font-bold text-destructive hover:text-destructive/80 transition-colors">
              Cerrar Sesión
            </button>
            <router-link v-else to="/login"
              class="text-xl md:text-2xl font-semibold text-muted-foreground hover:text-foreground transition-colors">
              Acceder
            </router-link>
          </div>
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
