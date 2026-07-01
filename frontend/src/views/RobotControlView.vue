<script setup>
/**
 * @module views/RobotControlView
 * @description
 * Página completa de **control de un robot**. Accesible desde el botón "Control"
 * de cada tarjeta de robot (técnicos y administradores). Reutiliza
 * {@link module:components/RobotControlPanel} para la UI de mapa/escaneo/teleop y
 * le suministra un objeto de robot en vivo desde el mismo flujo SSE del panel
 * (pose en tiempo real, sin *polling*). Ruta `/robots/:id/control`.
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** `vue-router`, {@link module:services/robotService},
 * {@link module:components/RobotControlPanel}, componentes de UI.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { robotService } from '@/services/robotService'
import RobotControlPanel from '@/components/RobotControlPanel.vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { ArrowLeft, Wifi, Loader2, Bot } from 'lucide-vue-next'

const route  = useRoute()
const router = useRouter()

const robotId = route.params.id

const robot   = ref(null)
const ready   = ref(false)   // primera instantánea SSE recibida
const error   = ref(null)

let robotEventSource = null

// ── SSE: estado del robot en vivo (refleja DashboardView.startRobotStream) ─────────────
const startRobotStream = () => {
    if (robotEventSource) robotEventSource.close()

    const token = localStorage.getItem('artec_token')
    if (!token) return

    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    const url = `${API_BASE}/robots/stream?token=${encodeURIComponent(token)}`

    robotEventSource = new EventSource(url)

    robotEventSource.addEventListener('robot', (e) => {
        try {
            const data = JSON.parse(e.data)
            if (data.id === robotId) robot.value = data
        } catch { /* ignora eventos malformados */ }
    })

    robotEventSource.addEventListener('ready', () => {
        ready.value = true
        error.value = null
    })

    robotEventSource.onerror = () => {
        if (!robot.value) error.value = 'No se pudo conectar con el servidor en tiempo real.'
    }
}

// ── Conectar / desconectar ──────────────────────────────────────────────────────
const pending = ref(false)
const commandError = ref(null)

const sendCommand = async (command) => {
    pending.value = true
    commandError.value = null
    try {
        await robotService.sendCommand(robotId, command)
    } catch (e) {
        commandError.value = e.message || 'No se pudo ejecutar el comando.'
    } finally {
        pending.value = false
    }
}

// RobotControlPanel emite 'refresh' tras cancel-nav / go-to-base; el stream SSE
// ya envía el estado fresco, así que aquí no hace falta un re-fetch manual.
const onPanelRefresh = () => {}

const goBack = () => router.push({ name: 'dashboard' })

// "Robot no encontrado" una vez que ha llegado la instantánea pero no apareció ningún robot que coincida.
const notFound = computed(() => ready.value && !robot.value)

onMounted(startRobotStream)
onUnmounted(() => { if (robotEventSource) robotEventSource.close() })
</script>

<template>
    <div class="px-4 py-8 max-w-6xl mx-auto min-h-[calc(100vh-4rem)]">
        <!-- Cabecera -->
        <div class="flex items-center justify-between gap-4 mb-6">
            <div class="flex items-center gap-3 min-w-0">
                <Button @click="goBack" variant="ghost" size="icon" class="rounded-full shrink-0" title="Volver al panel">
                    <ArrowLeft class="w-5 h-5" />
                </Button>
                <div class="min-w-0">
                    <h1 class="font-display text-2xl font-medium tracking-tight text-foreground truncate flex items-center gap-2">
                        <Bot class="w-6 h-6 text-primary shrink-0" />
                        {{ robot?.name || 'Control del robot' }}
                    </h1>
                    <p v-if="robot" class="text-muted-foreground mt-0.5 text-sm flex items-center gap-1.5">
                        <Wifi class="w-4 h-4" :class="robot.connected ? 'text-green-500' : 'text-red-500'" />
                        {{ robot.connected ? 'Conectado' : 'Desconectado' }}
                    </p>
                </div>
            </div>

            <div v-if="robot" class="shrink-0">
                <Button v-if="!robot.connected" @click="sendCommand('connect')" :disabled="pending"
                    size="sm" class="bg-green-600 hover:bg-green-700 text-white gap-1.5">
                    <Loader2 v-if="pending" class="w-4 h-4 animate-spin" />
                    {{ pending ? 'Conectando…' : 'Conectar' }}
                </Button>
                <Button v-else @click="sendCommand('disconnect')" :disabled="pending"
                    size="sm" variant="destructive" class="gap-1.5">
                    <Loader2 v-if="pending" class="w-4 h-4 animate-spin" />
                    {{ pending ? 'Desconectando…' : 'Desconectar' }}
                </Button>
            </div>
        </div>

        <p v-if="commandError" class="text-sm text-destructive mb-4">{{ commandError }}</p>

        <!-- Estados -->
        <div v-if="!ready && !robot" class="flex justify-center items-center h-64">
            <Loader2 class="w-8 h-8 animate-spin text-primary" />
        </div>

        <Alert v-else-if="error && !robot" variant="destructive" class="p-6">
            <p>{{ error }}</p>
        </Alert>

        <Alert v-else-if="notFound" variant="destructive" class="p-6">
            <p>Robot no encontrado o no tienes acceso a él.</p>
        </Alert>

        <!-- Panel de control -->
        <Card v-else-if="robot" class="p-6">
            <RobotControlPanel :robot="robot" @refresh="onPanelRefresh" />
        </Card>
    </div>
</template>
