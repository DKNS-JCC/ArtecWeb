<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

const handleRegister = async () => {
    if (!username.value || !email.value || !password.value) {
        errorMsg.value = 'Todos los campos son obligatorios.'
        return
    }

    loading.value = true
    errorMsg.value = ''

    try {
        await authStore.register(username.value, email.value, password.value)
        router.push('/')
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
                        class="w-14 h-14 rounded-2xl shadow-[0_4px_20px_rgba(15,23,42,0.15)] object-contain" />
                </router-link>
                <h2 class="text-3xl font-extrabold text-foreground tracking-tight mb-2">Crear cuenta</h2>
                <p class="text-muted-foreground">Únete a la experiencia Artec</p>
            </div>

            <Card class="px-8 py-10 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <CardContent class="p-0">
                    <form @submit.prevent="handleRegister" class="space-y-6">

                        <Alert v-if="errorMsg" variant="destructive">
                            {{ errorMsg }}
                        </Alert>

                        <div>
                            <Label for="username">Nombre de usuario</Label>
                            <Input id="username" type="text" v-model="username" placeholder="Ej: joseantonio_99"
                                required autocomplete="username" />
                        </div>

                        <div>
                            <Label for="email">Correo electrónico</Label>
                            <Input id="email" type="email" v-model="email" placeholder="tu@correo.com" required
                                autocomplete="email" />
                        </div>

                        <div>
                            <Label for="password">Contraseña</Label>
                            <Input id="password" type="password" v-model="password" placeholder="Mínimo 6 caracteres"
                                required autocomplete="new-password" />
                        </div>

                        <Button type="submit" :disabled="loading" variant="secondary"
                            class="w-full rounded-full bg-foreground text-background hover:bg-foreground/90">
                            {{ loading ? 'Creando cuenta...' : 'Crear cuenta' }}
                        </Button>
                    </form>

                    <div class="mt-8 text-center text-sm">
                        <span class="text-muted-foreground">¿Ya tienes cuenta? </span>
                        <router-link to="/login" class="font-bold text-foreground hover:underline">
                            Inicia sesión
                        </router-link>
                    </div>
                </CardContent>
            </Card>

        </div>
    </div>
</template>
