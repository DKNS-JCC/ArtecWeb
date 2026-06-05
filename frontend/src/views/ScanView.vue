<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'

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
        emoji: '🧒',
        label: 'Soy un chaval',
        desc:  'Explicaciones sencillas y divertidas'
    },
    {
        id:    'general',
        emoji: '😊',
        label: 'Público general',
        desc:  'Lenguaje claro, sin tecnicismos'
    },
    {
        id:    'estudiante',
        emoji: '🎨',
        label: 'Estudiante / Aficionado',
        desc:  'Algo de contexto técnico e histórico'
    },
    {
        id:    'experto',
        emoji: '🎓',
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
  <div class="min-h-screen flex items-center justify-center p-6 bg-background">

    <!-- Checking robot availability -->
    <div v-if="checking" class="flex flex-col items-center gap-4">
      <div class="h-10 w-10 rounded-full border-4 border-t-primary animate-spin"></div>
      <p class="text-lg animate-pulse text-muted-foreground">Comprobando el robot...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-destructive font-semibold bg-destructive/10 p-6 rounded-2xl w-full max-w-sm text-center">
      <p>{{ error }}</p>
      <router-link to="/" class="mt-4 block text-primary underline">Volver al inicio</router-link>
    </div>

    <!-- Form -->
    <div v-else-if="showNamePrompt" class="w-full max-w-sm flex flex-col gap-6">

      <!-- Name card -->
      <div class="bg-card p-8 rounded-3xl shadow-lg border">
        <h1 class="text-2xl font-bold mb-1 text-foreground">¡Hola!</h1>
        <p class="text-muted-foreground mb-5 text-sm">¿Cómo te llamas? El robot te llamará por tu nombre.</p>
        <input
          v-model="visitorName"
          type="text"
          placeholder="Tu nombre (ej. María)"
          class="w-full p-4 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary text-foreground"
          @keyup.enter="startChat"
          autofocus
        />
      </div>

      <!-- Expertise card -->
      <div class="bg-card p-6 rounded-3xl shadow-lg border">
        <p class="text-sm font-semibold text-foreground mb-1">¿Cuánto sabes sobre arte?</p>
        <p class="text-xs text-muted-foreground mb-4">El robot adaptará sus explicaciones a tu nivel.</p>

        <div class="flex flex-col gap-2">
          <button
            v-for="lvl in LEVELS"
            :key="lvl.id"
            @click="expertiseLevel = lvl.id"
            :class="[
              'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
              expertiseLevel === lvl.id
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50 hover:bg-muted'
            ]"
          >
            <span class="text-2xl leading-none">{{ lvl.emoji }}</span>
            <span class="flex flex-col">
              <span class="text-sm font-semibold text-foreground">{{ lvl.label }}</span>
              <span class="text-xs text-muted-foreground">{{ lvl.desc }}</span>
            </span>
            <span v-if="expertiseLevel === lvl.id" class="ml-auto text-primary text-lg">✓</span>
          </button>
        </div>
      </div>

      <!-- CTA -->
      <button
        @click="startChat"
        class="w-full p-4 bg-primary text-primary-foreground rounded-xl font-semibold shadow-md active:scale-95 transition-transform"
      >
        Empezar la visita
      </button>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="flex flex-col items-center gap-4">
      <div class="h-10 w-10 rounded-full border-4 border-t-primary animate-spin"></div>
      <p class="text-lg animate-pulse text-muted-foreground">Estableciendo conexión...</p>
    </div>

  </div>
</template>
