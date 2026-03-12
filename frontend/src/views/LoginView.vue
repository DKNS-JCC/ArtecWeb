<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader, CardContent } from '@/components/ui/card'

const router = useRouter()
const authStore = useAuthStore()

const identifier = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

const handleLogin = async () => {
    if (!identifier.value || !password.value) {
        errorMsg.value = 'Por favor, rellena todos los campos.'
        return
    }

    loading.value = true
    errorMsg.value = ''

    try {
        const data = await authStore.login(identifier.value, password.value)

        if (data.must_change_password) {
            router.push('/change-password')
        } else if (data.user.role === 'admin') {
            router.push('/dashboard')
        } else {
            router.push('/')
        }
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
                <router-link to="/" class="inline-block mb-6 transition-transform hover:scale-105">
                    <img src="/icon.ico" alt="Artec"
                        class="w-14 h-14 rounded-2xl shadow-[0_4px_20px_rgba(37,99,235,0.25)] object-contain" />
                </router-link>
                <h2 class="text-3xl font-extrabold text-foreground tracking-tight mb-2">Acceder</h2>
                <p class="text-muted-foreground">Inicia sesión en tu cuenta de Artec</p>
            </div>

            <Card class="px-8 py-10 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <CardContent class="p-0">
                    <form @submit.prevent="handleLogin" class="space-y-6">

                        <Alert v-if="errorMsg" variant="destructive">
                            {{ errorMsg }}
                        </Alert>

                        <div>
                            <Label for="identifier">Usuario o correo electrónico</Label>
                            <Input id="identifier" type="text" v-model="identifier"
                                placeholder="username o email@ejemplo.com" required autocomplete="username" />
                        </div>

                        <div>
                            <Label for="password">Contraseña</Label>
                            <Input id="password" type="password" v-model="password" placeholder="••••••••" required
                                autocomplete="current-password" />
                        </div>

                        <Button type="submit" :disabled="loading" class="w-full rounded-full">
                            {{ loading ? 'Entrando...' : 'Entrar' }}
                        </Button>
                    </form>

                    <div class="mt-8 text-center text-sm">
                        <span class="text-muted-foreground">¿No tienes cuenta? </span>
                        <router-link to="/register" class="font-bold text-primary hover:underline">
                            Regístrate gratis
                        </router-link>
                    </div>
                </CardContent>
            </Card>

        </div>
    </div>
</template>
