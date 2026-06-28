<script setup>
/**
 * @module views/ResetPasswordView
 * @description
 * Formulario para **fijar una nueva contraseña** a partir del token recibido por
 * correo (leído de la query). Ruta `/reset-password`.
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** `vue-router`, {@link module:services/authService},
 * componentes de UI.
 */
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authService } from '@/services/authService'
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
    <div class="min-h-screen flex items-center justify-center bg-background px-6 py-12">
        <div class="w-full max-w-[26rem]">

            <!-- Masthead, like the head of a catalogue entry -->
            <header class="reveal" style="animation-delay: 40ms">
                <h1 class="font-display text-5xl font-medium tracking-tight leading-[0.95] mb-3">
                    Nueva contraseña
                </h1>
                <p class="text-muted-foreground text-[0.95rem] leading-relaxed">
                    Elige una contraseña segura para tu cuenta.
                </p>
            </header>

            <hr class="hairline my-8 reveal" style="animation-delay: 120ms" />

            <!-- Success -->
            <div v-if="success" class="space-y-3 reveal" style="animation-delay: 200ms">
                <p class="eyebrow text-primary">Listo</p>
                <p class="text-foreground font-medium">¡Contraseña actualizada!</p>
                <p class="text-sm text-muted-foreground">Redirigiendo al inicio de sesión…</p>
            </div>

            <!-- Invalid token (no token in URL) -->
            <div v-else-if="!token" class="space-y-7 reveal" style="animation-delay: 200ms">
                <div class="space-y-3">
                    <p class="eyebrow text-destructive">Enlace inválido</p>
                    <p class="text-foreground leading-relaxed">{{ error }}</p>
                </div>
                <router-link to="/forgot-password">
                    <Button size="lg" class="w-full">Solicitar nuevo enlace</Button>
                </router-link>
            </div>

            <!-- Form -->
            <form v-else @submit.prevent="handleSubmit" class="space-y-7 reveal" style="animation-delay: 200ms">
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

                <Button type="submit" :disabled="loading" size="lg" class="w-full group">
                    {{ loading ? 'Guardando…' : 'Guardar contraseña' }}
                    <span v-if="!loading" class="transition-transform group-hover:translate-x-1">&rarr;</span>
                </Button>
            </form>

        </div>
    </div>
</template>
