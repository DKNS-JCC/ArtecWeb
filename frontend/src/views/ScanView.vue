<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'

const route     = useRoute()
const router    = useRouter()
const authStore = useAuthStore()

const error          = ref('')
const loading        = ref(false)
const checking       = ref(true)   // verifying robot availability on entry
const robotId        = ref('')
const visitorName    = ref('')
const expertiseLevel = ref('general')
const showNamePrompt = ref(false)

const LEVELS = [
    {
        id:    'nino',
        label: 'Niño / Joven',
        desc:  'Explicaciones sencillas y accesibles'
    },
    {
        id:    'general',
        label: 'Público general',
        desc:  'Lenguaje claro, sin tecnicismos'
    },
    {
        id:    'estudiante',
        label: 'Estudiante / Aficionado',
        desc:  'Contexto técnico e histórico'
    },
    {
        id:    'experto',
        label: 'Experto / Licenciado',
        desc:  'Terminología especializada, análisis profundo'
    }
]

onMounted(async () => {
    robotId.value = route.params.id
    if (!robotId.value) {
        error.value    = 'Código QR no válido'
        checking.value = false
        return
    }

    // Verify the robot is reachable BEFORE prompting — an offline or occupied
    // robot is reported here instead of failing later during navigation.
    try {
        const status = await authService.checkRobotAvailability(robotId.value)
        if (status.occupied) {
            error.value = 'Este robot ya está siendo utilizado por otro visitante. Por favor, espera a que termine su visita.'
        } else if (!status.online) {
            error.value = 'El robot no está disponible en este momento. Puede estar apagado o sin conexión. Inténtalo de nuevo en unos minutos.'
        } else {
            showNamePrompt.value = true
        }
    } catch (err) {
        error.value = err.message || 'No se pudo verificar el robot. Inténtalo de nuevo.'
    } finally {
        checking.value = false
    }
})

const startChat = async () => {
    if (!visitorName.value.trim()) {
        alert('Por favor, ingresa tu nombre')
        return
    }

    showNamePrompt.value = false
    loading.value        = true
    error.value          = ''

    try {
        await authStore.createVisitor(robotId.value, visitorName.value.trim(), expertiseLevel.value)
        router.push('/chat')
    } catch (err) {
        error.value          = err.response?.data?.error || err.message || 'Error al conectar con el robot'
        loading.value        = false
        showNamePrompt.value = true
    }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background px-6 py-12">
    <div class="w-full max-w-[26rem]">

      <!-- Checking robot availability -->
      <div v-if="checking" class="flex flex-col items-center gap-4 text-center reveal">
        <div class="h-9 w-9 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
        <p class="text-muted-foreground text-[0.95rem]">Comprobando el robot…</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="reveal" style="animation-delay: 40ms">
        <header class="mb-8">
          <p class="eyebrow text-destructive mb-3">Acceso no disponible</p>
          <h1 class="font-display text-4xl font-medium tracking-tight leading-[0.95]">Inténtalo de nuevo</h1>
        </header>
        <Alert variant="destructive">{{ error }}</Alert>
        <p class="mt-6 text-sm text-muted-foreground">
          <router-link to="/" class="text-foreground underline decoration-border decoration-1 underline-offset-4 hover:decoration-primary transition-colors">&larr; Volver al inicio</router-link>
        </p>
      </div>

      <!-- Form -->
      <div v-else-if="showNamePrompt">
        <header class="reveal" style="animation-delay: 40ms">
          <h1 class="font-display text-5xl font-medium tracking-tight leading-[0.95] mb-3">¡Hola!</h1>
          <p class="text-muted-foreground text-[0.95rem] leading-relaxed">¿Cómo te llamas? El robot te llamará por tu nombre.</p>
        </header>

        <hr class="hairline my-8 reveal" style="animation-delay: 120ms" />

        <div class="space-y-7 reveal" style="animation-delay: 200ms">
          <div>
            <Label for="visitor-name">Tu nombre</Label>
            <Input id="visitor-name" v-model="visitorName" type="text" placeholder="Ej. María"
              autofocus @keyup.enter="startChat" />
          </div>

          <div>
            <p class="eyebrow mb-3">¿Cuánto sabes sobre arte?</p>
            <div class="space-y-2">
              <button v-for="lvl in LEVELS" :key="lvl.id" type="button" @click="expertiseLevel = lvl.id"
                class="w-full flex items-center px-4 py-3 text-left border rounded-sm transition-colors"
                :class="expertiseLevel === lvl.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'">
                <span class="flex flex-col flex-1 min-w-0">
                  <span class="text-sm font-medium text-foreground">{{ lvl.label }}</span>
                  <span class="text-xs text-muted-foreground">{{ lvl.desc }}</span>
                </span>
                <span v-if="expertiseLevel === lvl.id" class="text-primary text-sm">&check;</span>
              </button>
            </div>
          </div>

          <Button @click="startChat" size="lg" class="w-full group">
            Empezar la visita
            <span class="transition-transform group-hover:translate-x-1">&rarr;</span>
          </Button>
        </div>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="flex flex-col items-center gap-4 text-center reveal">
        <div class="h-9 w-9 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
        <p class="text-muted-foreground text-[0.95rem]">Estableciendo conexión…</p>
      </div>

    </div>
  </div>
</template>
