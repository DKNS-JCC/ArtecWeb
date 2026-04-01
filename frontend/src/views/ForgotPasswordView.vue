<script setup>
import { ref } from 'vue'
import { authService } from '@/services/authService'
import { Card, CardContent } from '@/components/ui/card'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert }  from '@/components/ui/alert'

const email   = ref('')
const loading = ref(false)
const sent    = ref(false)
const error   = ref('')

const handleSubmit = async () => {
    if (!email.value.trim()) {
        error.value = 'Introduce tu correo electrónico.'
        return
    }
    loading.value = true
    error.value   = ''
    try {
        await authService.forgotPassword(email.value.trim())
        sent.value = true
    } catch {
        // API always returns 200 — only network errors reach here
        error.value = 'No se pudo conectar con el servidor. Inténtalo más tarde.'
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
                <h2 class="text-3xl font-extrabold text-foreground tracking-tight mb-2">Recuperar contraseña</h2>
                <p class="text-muted-foreground">Te enviaremos un enlace para restablecerla</p>
            </div>

            <Card class="px-8 py-10 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <CardContent class="p-0">

                    <!-- Success state -->
                    <div v-if="sent" class="text-center space-y-4">
                        <div class="text-5xl">📬</div>
                        <p class="font-semibold text-foreground">¡Correo enviado!</p>
                        <p class="text-sm text-muted-foreground">
                            Si <strong>{{ email }}</strong> está registrado, recibirás un enlace en los próximos minutos.<br>
                            Revisa también tu carpeta de spam.
                        </p>
                        <router-link to="/login">
                            <Button variant="outline" class="w-full mt-4 rounded-full">Volver al inicio de sesión</Button>
                        </router-link>
                    </div>

                    <!-- Form state -->
                    <form v-else @submit.prevent="handleSubmit" class="space-y-6">
                        <Alert v-if="error" variant="destructive">{{ error }}</Alert>

                        <div>
                            <Label for="email">Correo electrónico</Label>
                            <Input id="email" type="email" v-model="email"
                                placeholder="tu@correo.com" autocomplete="email" autofocus />
                        </div>

                        <Button type="submit" :disabled="loading" class="w-full rounded-full">
                            {{ loading ? 'Enviando...' : 'Enviar enlace' }}
                        </Button>

                        <p class="text-center text-sm text-muted-foreground">
                            <router-link to="/login" class="text-primary hover:underline">← Volver al inicio de sesión</router-link>
                        </p>
                    </form>

                </CardContent>
            </Card>
        </div>
    </div>
</template>
