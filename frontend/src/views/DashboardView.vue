<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { robotService } from '@/services/robotService'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { RefreshCw, Zap, MapPin } from 'lucide-vue-next'

const robots = ref([])
const loading = ref(true)
const error = ref(null)
let intervalId = null

const fetchRobots = async () => {
    try {
        robots.value = await robotService.fetchAll()
        error.value = null
    } catch (err) {
        console.error('Fetch error:', err)
        error.value = 'No se pudo conectar con el servidor ROS2.'
    } finally {
        loading.value = false
    }
}

const sendCommand = async (id, command) => {
    try {
        const payload = command === 'move' ? { x: Math.random() * 10, y: Math.random() * 10 } : null
        await robotService.sendCommand(id, command, payload)
        await fetchRobots()
    } catch (err) {
        console.error('Command error:', err)
    }
}

onMounted(() => {
    fetchRobots()
    intervalId = setInterval(fetchRobots, 3000)
})

onUnmounted(() => {
    if (intervalId) clearInterval(intervalId)
})
</script>

<template>
    <div class="px-4 py-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
        <div class="flex justify-between items-center mb-8">
            <div>
                <h1 class="text-3xl font-bold tracking-tight text-foreground">Panel de Control ROS2</h1>
                <p class="text-muted-foreground mt-1">Gestión y monitorización de flota de robots en tiempo real.</p>
            </div>
            <Button @click="fetchRobots" variant="secondary" size="icon" class="rounded-full" title="Actualizar datos">
                <RefreshCw class="w-5 h-5" />
            </Button>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>

        <!-- Error State -->
        <Alert v-else-if="error" variant="destructive" class="p-6">
            <div>
                <h3 class="font-bold">Error de Conexión</h3>
                <p>{{ error }}</p>
            </div>
        </Alert>

        <!-- Data Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card v-for="robot in robots" :key="robot.id"
                class="p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                <!-- Top row: Name & Status indicator -->
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h2 class="text-xl font-bold text-foreground">{{ robot.name }}</h2>
                        <span class="text-xs text-muted-foreground uppercase tracking-wider">{{ robot.id }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="relative flex h-3 w-3">
                            <span v-if="robot.status === 'moving'"
                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3" :class="{
                                'bg-green-500': robot.status === 'idle',
                                'bg-blue-500': robot.status === 'moving',
                                'bg-yellow-500': robot.status === 'charging',
                                'bg-red-500': robot.status === 'error',
                            }"></span>
                        </span>
                        <span class="text-sm font-medium capitalize text-foreground">{{ robot.status }}</span>
                    </div>
                </div>

                <!-- Details -->
                <div class="space-y-3 mb-6">
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-muted-foreground flex items-center gap-1">
                            <Zap class="w-4 h-4" />
                            Batería
                        </span>
                        <div class="flex items-center gap-2">
                            <div class="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                                <div class="h-full rounded-full"
                                    :class="robot.battery > 20 ? 'bg-green-500' : 'bg-red-500'"
                                    :style="{ width: `${robot.battery}%` }"></div>
                            </div>
                            <span class="font-medium w-8 text-right text-foreground">{{ robot.battery }}%</span>
                        </div>
                    </div>

                    <div class="flex justify-between items-center text-sm">
                        <span class="text-muted-foreground flex items-center gap-1">
                            <MapPin class="w-4 h-4" />
                            Posición
                        </span>
                        <span class="font-mono bg-secondary px-2 py-0.5 rounded text-xs text-secondary-foreground">
                            x:{{ robot.position.x.toFixed(1) }}, y:{{ robot.position.y.toFixed(1) }}
                        </span>
                    </div>
                </div>

                <!-- Actions -->
                <div class="border-t border-border pt-4 flex gap-2">
                    <Button @click="sendCommand(robot.id, 'move')" :disabled="robot.status === 'moving'" size="sm"
                        class="flex-1">
                        Mover
                    </Button>
                    <Button @click="sendCommand(robot.id, 'stop')" :disabled="robot.status === 'idle'"
                        variant="secondary" size="sm" class="flex-1">
                        Detener
                    </Button>
                    <Button @click="sendCommand(robot.id, 'charge')"
                        :disabled="robot.status === 'charging' || robot.status === 'moving'" variant="outline" size="sm"
                        class="flex-1">
                        Cargar
                    </Button>
                </div>
            </Card>
        </div>
    </div>
</template>
