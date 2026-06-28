<script setup>
/**
 * @module views/ChangePasswordView
 * @description
 * Pantalla de **cambio de contraseña obligatorio**. Los *guards* del router
 * llevan aquí a las cuentas con `must_change_password` hasta que la actualizan.
 * Ruta `/change-password` (requiere sesión).
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** `vue-router`, {@link module:stores/auth}, componentes de UI.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'

const router = useRouter()
const authStore = useAuthStore()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMsg = ref('')

const isForced = computed(() => authStore.mustChangePassword)

const handleChange = async () => {
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
        errorMsg.value = 'Todos los campos son obligatorios.'
        return
    }
    if (newPassword.value !== confirmPassword.value) {
        errorMsg.value = 'Las contraseñas no coinciden.'
        return
    }
    if (newPassword.value.length < 6) {
        errorMsg.value = 'La contraseña debe tener al menos 6 caracteres.'
        return
    }

    loading.value = true
    errorMsg.value = ''

    try {
        await authStore.changePassword(currentPassword.value, newPassword.value)
        router.push(authStore.isMuseumAdmin || authStore.isPlatformAdmin ? '/dashboard' : '/')
    } catch (err) {
        errorMsg.value = err.message
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
                    {{ isForced ? 'Cambia tu contraseña' : 'Cambiar contraseña' }}
                </h1>
                <p v-if="isForced" class="text-destructive font-semibold text-[0.95rem] leading-relaxed">
                    Por seguridad, debes establecer una contraseña nueva antes de continuar.
                </p>
                <p v-else class="text-muted-foreground text-[0.95rem] leading-relaxed">
                    Actualiza tu contraseña de acceso.
                </p>
            </header>

            <hr class="hairline my-8 reveal" style="animation-delay: 120ms" />

            <form @submit.prevent="handleChange" class="space-y-7 reveal" style="animation-delay: 200ms">

                <Alert v-if="errorMsg" variant="destructive">
                    {{ errorMsg }}
                </Alert>

                <div>
                    <Label for="current-password">
                        {{ isForced ? 'Contraseña temporal actual' : 'Contraseña actual' }}
                    </Label>
                    <Input id="current-password" type="password" v-model="currentPassword"
                        placeholder="••••••••" required autocomplete="current-password" />
                </div>

                <div>
                    <Label for="new-password">Nueva contraseña</Label>
                    <Input id="new-password" type="password" v-model="newPassword"
                        placeholder="Mínimo 6 caracteres" required autocomplete="new-password" />
                </div>

                <div>
                    <Label for="confirm-password">Confirmar contraseña</Label>
                    <Input id="confirm-password" type="password" v-model="confirmPassword"
                        placeholder="Repite la nueva contraseña" required autocomplete="new-password" />
                </div>

                <Button type="submit" :disabled="loading" size="lg" class="w-full group">
                    {{ loading ? 'Guardando…' : 'Guardar nueva contraseña' }}
                    <span v-if="!loading" class="transition-transform group-hover:translate-x-1">&rarr;</span>
                </Button>
            </form>

        </div>
    </div>
</template>
