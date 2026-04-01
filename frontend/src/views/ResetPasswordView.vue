<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authService } from '@/services/authService'
import { Card, CardContent } from '@/components/ui/card'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert }  from '@/components/ui/alert'

const route  = useRoute()
const router = useRouter()

const token       = ref('')
const newPassword = ref('')
const confirm     = ref('')
const loading     = ref(false)
const success     = ref(false)
const error       = ref('')

onMounted(() => {
    token.value = route.query.token || ''
    if (!token.value) error.value = 'Enlace inválido o incompleto. Solicita uno nuevo.'
})

const handleSubmit = async () => {
    error.value = ''
    if (newPassword.value.length < 6) {
        error.value = 'La contraseña debe tener al menos 6 caracteres.'
        return
    }
    if (newPassword.value !== confirm.value) {
        error.value = 'Las contraseñas no coinciden.'
        return
    }
    loading.value = true
    try {
        await authService.resetPassword(token.value, newPassword.value)
        success.value = true
        setTimeout(() => router.push('/login'), 3000)
    } catch (err) {
        error.value = err.message || 'Enlace inválido o expirado. Solicita uno nuevo.'
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <div class="max-w-md w-full">

            <div class="text-center mb-10">
                <router-link to="/" class="inline-block mb-6 transition-transform hover:scale-105">
                    <img src="/icon.ico" alt="Artec" class="w-14 h-14 rounded-2xl shadow-[0_4px_20px_rgba(37,99,235,0.25)] object-contain" />
                </router-link>
                <h2 class="text-3xl font-extrabold text-foreground tracking-tight mb-2">Nueva contraseña</h2>
                <p class="text-muted-foreground">Elige una contraseña segura para tu cuenta</p>
            </div>

            <Card class="px-8 py-10 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <CardContent class="p-0">

                    <!-- Success -->
                    <div v-if="success" class="text-center space-y-4">
                        <div class="text-5xl">✅</div>
                        <p class="font-semibold text-foreground">¡Contraseña actualizada!</p>
                        <p class="text-sm text-muted-foreground">Redirigiendo al inicio de sesión…</p>
                    </div>

                    <!-- Invalid token (no token in URL) -->
                    <div v-else-if="!token" class="text-center space-y-4">
                        <div class="text-5xl">⛔</div>
                        <p class="font-semibold text-foreground">Enlace inválido</p>
                        <router-link to="/forgot-password">
                            <Button class="w-full rounded-full mt-2">Solicitar nuevo enlace</Button>
                        </router-link>
                    </div>

                    <!-- Form -->
                    <form v-else @submit.prevent="handleSubmit" class="space-y-6">
                        <Alert v-if="error" variant="destructive">{{ error }}</Alert>

                        <div>
                            <Label for="newpwd">Nueva contraseña</Label>
                            <Input id="newpwd" type="password" v-model="newPassword"
                                placeholder="Mínimo 6 caracteres" autocomplete="new-password" autofocus />
                        </div>

                        <div>
                            <Label for="confirmpwd">Confirmar contraseña</Label>
                            <Input id="confirmpwd" type="password" v-model="confirm"
                                placeholder="Repite la contraseña" autocomplete="new-password" />
                        </div>

                        <Button type="submit" :disabled="loading" class="w-full rounded-full">
                            {{ loading ? 'Guardando...' : 'Guardar contraseña' }}
                        </Button>
                    </form>

                </CardContent>
            </Card>
        </div>
    </div>
</template>
