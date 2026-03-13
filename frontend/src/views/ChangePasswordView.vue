<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'

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
    <div class="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <div class="max-w-md w-full">

            <div class="text-center mb-10">
                <h2 class="text-3xl font-extrabold text-foreground tracking-tight mb-2">
                    {{ isForced ? 'Cambia tu contraseña' : 'Cambiar contraseña' }}
                </h2>
                <p v-if="isForced" class="text-amber-600 dark:text-amber-400 font-semibold text-sm">
                    Cambia tu contraseña.
                </p>
                <p v-else class="text-muted-foreground">Actualiza tu contraseña de acceso</p>
            </div>

            <Card class="px-8 py-10 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <CardContent class="p-0">
                    <form @submit.prevent="handleChange" class="space-y-6">

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

                        <Button type="submit" :disabled="loading" class="w-full rounded-full">
                            {{ loading ? 'Guardando...' : 'Guardar nueva contraseña' }}
                        </Button>
                    </form>
                </CardContent>
            </Card>

        </div>
    </div>
</template>
