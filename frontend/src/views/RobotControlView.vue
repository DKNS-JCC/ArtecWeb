<script setup>
/**
 * RobotControlView — dedicated full-page control panel for a single robot.
 *
 * Reachable from the "Control" button on each robot card (technicians + admins).
 * Reuses RobotControlPanel for the actual map / scan / teleop UI and feeds it a
 * live robot object from the same SSE stream the dashboard uses (live pose, no
 * polling).
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
const ready   = ref(false)   // first SSE snapshot received
const error   = ref(null)

let robotEventSource = null

// ── SSE: live robot state (mirrors DashboardView.startRobotStream) ─────────────
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
        } catch { /* ignore malformed event */ }
    })

    robotEventSource.addEventListener('ready', () => {
        ready.value = true
        error.value = null
    })

    robotEventSource.onerror = () => {
        if (!robot.value) error.value = 'No se pudo conectar con el servidor en tiempo real.'
    }
}

// ── Connect / disconnect ──────────────────────────────────────────────────────
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

// RobotControlPanel emits 'refresh' after cancel-nav / go-to-base; the SSE stream
// already pushes the fresh state, so no manual refetch is needed here.
const onPanelRefresh = () => {}

const goBack = () => router.push({ name: 'dashboard' })

// "Robot not found" once the snapshot has arrived but no matching robot appeared.
const notFound = computed(() => ready.value && !robot.value)

onMounted(startRobotStream)
onUnmounted(() => { if (robotEventSource) robotEventSource.close() })
</script>

<template>
    <div class="px-4 py-8 max-w-6xl mx-auto min-h-[calc(100vh-4rem)]">
        <!-- Header -->
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

        <!-- States -->
        <div v-if="!ready && !robot" class="flex justify-center items-center h-64">
            <Loader2 class="w-8 h-8 animate-spin text-primary" />
        </div>

        <Alert v-else-if="error && !robot" variant="destructive" class="p-6">
            <p>{{ error }}</p>
        </Alert>

        <Alert v-else-if="notFound" variant="destructive" class="p-6">
            <p>Robot no encontrado o no tienes acceso a él.</p>
        </Alert>

        <!-- Control panel -->
        <Card v-else-if="robot" class="p-6">
            <RobotControlPanel :robot="robot" @refresh="onPanelRefresh" />
        </Card>
    </div>
</template>
