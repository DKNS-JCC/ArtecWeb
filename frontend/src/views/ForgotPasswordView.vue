<script setup>
/**
 * @module views/ForgotPasswordView
 * @description
 * Formulario para **solicitar el restablecimiento de contraseña**: el usuario
 * introduce su email y recibe un enlace con token. Ruta `/forgot-password`.
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** {@link module:services/authService}, componentes de UI.
 */
import { ref } from 'vue'
import { authService } from '@/services/authService'
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
        // La API siempre devuelve 200 - aquí solo llegan errores de red
        error.value = 'No se pudo conectar con el servidor. Inténtalo más tarde.'
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="min-h-screen flex items-center justify-center bg-background px-6 py-12">
        <div class="w-full max-w-[26rem]">

            <!-- Cabecera, como el encabezado de una entrada de catálogo -->
            <header class="reveal" style="animation-delay: 40ms">
                <h1 class="font-display text-5xl font-medium tracking-tight leading-[0.95] mb-3">
                    Recuperar contraseña
                </h1>
                <p class="text-muted-foreground text-[0.95rem] leading-relaxed">
                    Te enviaremos un enlace para restablecerla por correo electrónico.
                </p>
            </header>

            <hr class="hairline my-8 reveal" style="animation-delay: 120ms" />

            <!-- Estado de éxito -->
            <div v-if="sent" class="space-y-7 reveal" style="animation-delay: 200ms">
                <p class="text-foreground leading-relaxed">
                    Si <strong>{{ email }}</strong> está registrado, recibirás un enlace en los próximos minutos.
                    Revisa también tu carpeta de spam.
                </p>
                <router-link to="/login">
                    <Button variant="outline" size="lg" class="w-full">Volver al inicio de sesión</Button>
                </router-link>
            </div>

            <!-- Estado del formulario -->
            <form v-else @submit.prevent="handleSubmit" class="space-y-7 reveal" style="animation-delay: 200ms">
                <Alert v-if="error" variant="destructive">{{ error }}</Alert>

                <div>
                    <Label for="email">Correo electrónico</Label>
                    <Input id="email" type="email" v-model="email"
                        placeholder="tu@correo.com" autocomplete="email" autofocus />
                </div>

                <Button type="submit" :disabled="loading" size="lg" class="w-full group">
                    {{ loading ? 'Enviando…' : 'Enviar enlace' }}
                    <span v-if="!loading" class="transition-transform group-hover:translate-x-1">&rarr;</span>
                </Button>
            </form>

            <hr class="hairline my-8 reveal" style="animation-delay: 280ms" />

            <p class="text-sm text-muted-foreground reveal" style="animation-delay: 320ms">
                <router-link to="/login"
                    class="text-foreground underline decoration-border decoration-1 underline-offset-4 hover:decoration-primary transition-colors">
                    ← Volver al inicio de sesión
                </router-link>
            </p>

        </div>
    </div>
</template>
