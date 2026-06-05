<script setup>
import { useRouter } from 'vue-router'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { User, Shield, AlertTriangle, KeyRound, LogOut, Mail, Mails, Loader2, Camera, Trash2 } from 'lucide-vue-next'

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
    <div class="px-4 py-8 max-w-3xl mx-auto min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center">
        <div class="w-full">
            <div class="text-center mb-10">
                <div class="relative w-28 h-28 mx-auto mb-4 group cursor-pointer" @click="triggerFileInput">
                    <!-- Base circle -->
                    <div
                        class="w-full h-full bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 overflow-hidden relative">
                        <!-- Image if present -->
                        <img v-if="avatarUrl && !isUploading" :src="avatarUrl" alt="Avatar"
                            class="w-full h-full object-cover" />

                        <!-- Fallback icon -->
                        <User v-else-if="!isUploading" class="w-12 h-12 text-primary" />

                        <!-- Loading spinner -->
                        <div v-if="isUploading"
                            class="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm">
                            <Loader2 class="w-8 h-8 text-primary animate-spin" />
                        </div>
                    </div>

                    <!-- Hover edit overlay -->
                    <div v-if="!isUploading"
                        class="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white backdrop-blur-sm">
                        <Camera class="w-6 h-6" />
                    </div>

                    <!-- Delete button (only show if has avatar) -->
                    <button v-if="avatarUrl && !isUploading" @click="handleDeleteAvatar"
                        class="absolute -right-2 -bottom-2 md:-right-4 md:-bottom-2 w-10 h-10 rounded-full bg-destructive text-destructive-foreground shadow-lg flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2 focus:ring-offset-background"
                        title="Eliminar foto" type="button">
                        <Trash2 class="w-4 h-4" />
                    </button>

                    <!-- Hidden file input -->
                    <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleFileChange" />
                </div>
                <h1 class="text-3xl font-bold tracking-tight text-foreground">
                    Hola, {{ authStore.user?.name }}
                </h1>
                <p class="text-muted-foreground mt-2">
                    Gestiona tu cuenta y credenciales
                </p>
            </div>

            <Card class="p-6 md:p-8 rounded-[2rem] shadow-sm">
                <CardContent class="p-0 space-y-8">

                    <!-- User Details -->
                    <div class="space-y-4">
                        <div
                            class="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border">
                            <div class="flex items-center gap-3 text-muted-foreground">
                                <User class="w-5 h-5" />
                                <span class="font-medium">Usuario</span>
                            </div>
                            <span class="font-bold text-foreground">{{ authStore.user?.name }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border">
                            <div class="flex items-center gap-3 text-muted-foreground">
                                <Mails class="w-5 h-5" />
                                <span class="font-medium">Correo</span>
                            </div>
                            <span class="font-bold text-foreground">{{ authStore.user?.email }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border">
                            <div class="flex items-center gap-3 text-muted-foreground">
                                <KeyRound class="w-5 h-5" />
                                <span class="font-medium">Contraseña</span>
                            </div>
                            <Button variant="outline"
                                class="flex justify-center items-center gap-2 h-12 rounded-xl border-border">
                                Cambiar contraseña
                            </Button>
                        </div>
                    </div>

                    <hr class="border-border" />

                    <!-- Actions -->
                    <div class="flex flex-col sm:flex-row gap-4">
                        <Button @click="handleLogout" variant="destructive"
                            class="flex-1 flex justify-center items-center gap-2 h-12 rounded-xl">
                            <LogOut class="w-4 h-4" />
                            Cerrar sesión
                        </Button>
                    </div>

                </CardContent>
            </Card>
        </div>
    </div>
</template>
