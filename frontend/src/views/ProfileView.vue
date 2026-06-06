<script setup>
import { useRouter } from 'vue-router'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'
import { Button } from '@/components/ui/button'
import { User, KeyRound, LogOut, Mails, Loader2, Camera, Trash2 } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()
const fileInput = ref(null)
const isUploading = ref(false)

const avatarUrl = computed(() => {
    const avatar = authStore.user?.avatar
    if (!avatar) return null
    // Same-origin relative path by default (Vite proxies /uploads to the backend).
    const baseUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : ''
    return `${baseUrl}${avatar}`
})

const handleLogout = () => {
    authStore.logout()
    router.push('/')
}

const triggerFileInput = () => {
    if (!isUploading.value) {
        fileInput.value.click()
    }
}

const handleFileChange = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    isUploading.value = true
    const formData = new FormData()
    formData.append('avatar', file)

    try {
        const res = await authService.uploadAvatar(formData)
        authStore.updateUserAvatar(res.avatar)
    } catch (err) {
        alert(err.message || 'Error al subir la imagen')
    } finally {
        isUploading.value = false
        // Reset input so the same file could be selected again if needed
        event.target.value = ''
    }
}

const handleDeleteAvatar = async (event) => {
    // Prevent triggering the file input click
    event.stopPropagation()

    if (confirm('¿Estás seguro de que quieres eliminar tu foto de perfil?')) {
        isUploading.value = true
        try {
            await authService.deleteAvatar()
            authStore.updateUserAvatar(null)
        } catch (err) {
            alert(err.message || 'Error al eliminar la imagen')
        } finally {
            isUploading.value = false
        }
    }
}
</script>

<template>
    <div class="min-h-screen flex items-center justify-center bg-background px-6 py-12">
        <div class="w-full max-w-[26rem]">

            <!-- Masthead, framed portrait like a gallery wall card -->
            <header class="text-center reveal" style="animation-delay: 40ms">
                <div class="relative w-28 h-28 mx-auto mb-6 group cursor-pointer" @click="triggerFileInput">
                    <div class="w-full h-full bg-muted border border-border rounded-sm flex items-center justify-center overflow-hidden relative">
                        <img v-if="avatarUrl && !isUploading" :src="avatarUrl" alt="Avatar"
                            class="w-full h-full object-cover" />
                        <User v-else-if="!isUploading" class="w-10 h-10 text-muted-foreground" />
                        <div v-if="isUploading" class="absolute inset-0 bg-background/80 flex items-center justify-center">
                            <Loader2 class="w-7 h-7 text-primary animate-spin" />
                        </div>
                    </div>

                    <!-- Hover edit overlay -->
                    <div v-if="!isUploading"
                        class="absolute inset-0 bg-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-background">
                        <Camera class="w-6 h-6" />
                    </div>

                    <!-- Delete button (only show if has avatar) -->
                    <button v-if="avatarUrl && !isUploading" @click="handleDeleteAvatar"
                        class="absolute -right-2 -bottom-2 w-9 h-9 rounded-sm bg-destructive text-destructive-foreground flex items-center justify-center transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        title="Eliminar foto" type="button">
                        <Trash2 class="w-4 h-4" />
                    </button>

                    <!-- Hidden file input -->
                    <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleFileChange" />
                </div>
                <h1 class="font-display text-5xl font-medium tracking-tight leading-[0.95] mb-3">
                    {{ authStore.user?.name }}
                </h1>
                <p class="text-muted-foreground text-[0.95rem] leading-relaxed">
                    Gestiona tu cuenta y credenciales
                </p>
            </header>

            <hr class="hairline my-8 reveal" style="animation-delay: 120ms" />

            <!-- Account details -->
            <div class="reveal" style="animation-delay: 200ms">
                <div class="flex items-center justify-between py-4 border-b border-border">
                    <div class="flex items-center gap-2.5 text-muted-foreground">
                        <User class="w-4 h-4" />
                        <span class="text-xs font-semibold uppercase tracking-[0.14em]">Usuario</span>
                    </div>
                    <span class="font-medium text-foreground">{{ authStore.user?.name }}</span>
                </div>
                <div class="flex items-center justify-between py-4 border-b border-border">
                    <div class="flex items-center gap-2.5 text-muted-foreground">
                        <Mails class="w-4 h-4" />
                        <span class="text-xs font-semibold uppercase tracking-[0.14em]">Correo</span>
                    </div>
                    <span class="font-medium text-foreground">{{ authStore.user?.email }}</span>
                </div>
                <div class="flex items-center justify-between py-4">
                    <div class="flex items-center gap-2.5 text-muted-foreground">
                        <KeyRound class="w-4 h-4" />
                        <span class="text-xs font-semibold uppercase tracking-[0.14em]">Contraseña</span>
                    </div>
                    <router-link to="/change-password">
                        <Button variant="outline" size="sm">Cambiar</Button>
                    </router-link>
                </div>
            </div>

            <hr class="hairline my-8 reveal" style="animation-delay: 280ms" />

            <Button @click="handleLogout" variant="destructive" size="lg" class="w-full reveal" style="animation-delay: 320ms">
                <LogOut class="w-4 h-4" />
                Cerrar sesión
            </Button>

        </div>
    </div>
</template>
