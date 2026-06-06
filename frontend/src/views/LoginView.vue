<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'

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
        } else if (data.user.role === 'museum_admin' || data.user.role === 'platform_admin') {
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
    <div class="min-h-screen flex items-center justify-center bg-background px-6 py-12">
        <div class="w-full max-w-[26rem]">

            <!-- Masthead, like the head of a catalogue entry -->
            <header class="reveal" style="animation-delay: 40ms">
                <h1 class="font-display text-5xl font-medium tracking-tight leading-[0.95] mb-3">
                    Inicio de sesión
                </h1>
                <p class="text-muted-foreground text-[0.95rem] leading-relaxed">
                    
                </p>
            </header>

            <hr class="hairline my-8 reveal" style="animation-delay: 120ms" />

            <form @submit.prevent="handleLogin" class="space-y-7 reveal" style="animation-delay: 200ms">

                <Alert v-if="errorMsg" variant="destructive">
                    {{ errorMsg }}
                </Alert>

                <div>
                    <Label for="identifier">
                        <span class="text-primary mr-1.5"></span> Usuario o correo electrónico
                    </Label>
                    <Input id="identifier" type="text" v-model="identifier"
                        placeholder="ejemplo@artec.es" required autocomplete="username" />
                </div>

                <div>
                    <Label for="password">
                        <span class="text-primary mr-1.5"></span> Contraseña
                    </Label>
                    <Input id="password" type="password" v-model="password" placeholder="••••••••••••" required
                        autocomplete="current-password" />
                </div>

                <Button type="submit" :disabled="loading" size="lg" class="w-full group">
                    {{ loading ? 'Entrando…' : 'Entrar' }}
                    <span v-if="!loading" class="transition-transform group-hover:translate-x-1">&rarr;</span>
                </Button>
            </form>

            <hr class="hairline my-8 reveal" style="animation-delay: 280ms" />

            <p class="text-sm text-muted-foreground reveal" style="animation-delay: 320ms">
                <router-link to="/forgot-password"
                    class="text-foreground underline decoration-border decoration-1 underline-offset-4 hover:decoration-primary transition-colors">
                    ¿Olvidaste tu contraseña?
                </router-link>
            </p>

        </div>
    </div>
</template>
