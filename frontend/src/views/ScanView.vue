<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const error = ref('')
const loading = ref(false)
const robotId = ref('')
const visitorName = ref('')
const showNamePrompt = ref(true)

onMounted(() => {
    robotId.value = route.params.id
    if (!robotId.value) {
        error.value = 'Código QR no válido'
        showNamePrompt.value = false
    }
})

const startChat = async () => {
    if (!visitorName.value.trim()) {
        alert("Por favor, ingresa tu nombre")
        return
    }
    
    showNamePrompt.value = false
    loading.value = true
    error.value = ''
    try {
        await authStore.createVisitor(robotId.value, visitorName.value.trim())
        router.push('/chat')
    } catch (err) {
        error.value = err.response?.data?.error || err.message || 'Error al conectar con el robot'
        loading.value = false
        showNamePrompt.value = true
    }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 text-center bg-background">
      <div v-if="error" class="text-destructive font-semibold bg-destructive/10 p-6 rounded-2xl w-full max-w-sm">
          <p>{{ error }}</p>
          <router-link to="/" class="mt-4 block text-primary underline">Volver al inicio</router-link>
      </div>

      <div v-else-if="showNamePrompt" class="w-full max-w-sm bg-card p-8 rounded-3xl shadow-lg border">
          <h1 class="text-2xl font-bold mb-2 text-foreground">¡Hola!</h1>
          <p class="text-muted-foreground mb-6">¿Cómo te llamas? El robot te llamará por tu nombre.</p>
          
          <input 
              v-model="visitorName" 
              type="text" 
              placeholder="Tu nombre (ej. María)"
              class="w-full p-4 rounded-xl border bg-background mb-6 outline-none focus:ring-2 focus:ring-primary text-foreground"
              @keyup.enter="startChat"
              autofocus
          />
          
          <button 
              @click="startChat"
              class="w-full p-4 bg-primary text-primary-foreground rounded-xl font-semibold shadow-md active:scale-95 transition-transform"
          >
              Empezar la visita
          </button>
      </div>

      <div v-else-if="loading" class="flex flex-col items-center">
          <p class="text-lg animate-pulse mb-4 text-muted-foreground">Estableciendo conexión...</p>
          <div class="h-8 w-8 rounded-full border-4 border-t-primary animate-spin"></div>
      </div>
  </div>
</template>
