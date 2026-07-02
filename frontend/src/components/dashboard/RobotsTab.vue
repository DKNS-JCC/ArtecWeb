<script setup>
/**
 * @file Pestaña de gestión de robots del panel de administración.
 * @module components/dashboard/RobotsTab
 *
 * Componente presentacional. Recibe la lista de robots (que el padre mantiene
 * viva por SSE), los museos, los códigos QR y el estado de los comandos; emite
 * los eventos de acción. El CRUD, el streaming y los modales viven en
 * DashboardView. Los roles se leen del store y las URLs de visita se calculan
 * localmente (son derivadas puras).
 */
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Plus, Bot, Building2, Settings, Trash2, Zap, MapPin, Navigation, AlertTriangle, X, Wifi, Loader2, Gamepad2 } from 'lucide-vue-next'

const props = defineProps({
    robots:           { type: Array, default: () => [] },
    museums:          { type: Array, default: () => [] },
    loading:          { type: Boolean, default: false },
    error:            { type: [String, null], default: null },
    qrCodes:          { type: Object, default: () => ({}) },
    pendingCommandId: { type: [String, null], default: null },
    commandError:     { type: [Object, null], default: null },
})

defineEmits(['create', 'edit', 'delete', 'command', 'end-visit', 'open-control', 'show-incidents'])

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)
const isMuseumAdmin = computed(() => authStore.isMuseumAdmin)
const isStaff = computed(() => authStore.isStaff)

const originUrl = window?.location?.origin || ''
const buildVisitUrl = (robotId) => `${originUrl}/r/${robotId}`
const museumName = (id) => props.museums.find(m => m.id === id)?.name || 'Sin asignar'
</script>

<template>
    <div>
        <div class="flex justify-between items-center mb-6">
            <h2 class="font-display text-xl font-medium tracking-tight">Gestión de Robots</h2>
            <Button v-if="isPlatformAdmin" @click="$emit('create')" class="flex gap-2 items-center">
                <Plus class="w-4 h-4" /> Crear Robot
            </Button>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
        <Alert v-else-if="error" variant="destructive" class="p-6 mb-6">
            <h3 class="font-semibold">Error de Conexión</h3>
            <p>{{ error }}</p>
        </Alert>
        <div v-else-if="robots.length === 0"
            class="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed border-border rounded-md">
            <p>No se encontraron robots asignados a tu perfil.</p>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Bucle de tarjetas de robots -->
            <Card v-for="robot in robots" :key="robot.id"
                class="p-6 hover:border-primary/40 transition-colors relative overflow-hidden group">

                <!-- SUPERADMIN (proveedor): vista solo de asignación -->
                <template v-if="isPlatformAdmin">
                    <div class="flex items-center gap-4 mb-6">
                        <div class="w-12 h-12 bg-primary/10 rounded-sm flex items-center justify-center text-primary flex-shrink-0">
                            <Bot class="w-6 h-6" />
                        </div>
                        <div class="min-w-0">
                            <h2 class="font-display text-xl font-medium tracking-tight text-foreground truncate">{{ robot.name }}</h2>
                            <span class="text-xs text-muted-foreground uppercase tracking-wider">{{ robot.id }}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 mb-6 text-sm">
                        <Building2 class="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span v-if="robot.museum_id" class="font-medium text-foreground">{{ museumName(robot.museum_id) }}</span>
                        <span v-else class="text-muted-foreground italic">Sin asignar</span>
                    </div>
                    <div class="flex gap-2 pt-4 border-t border-border">
                        <Button variant="outline" size="sm" class="flex-1 gap-1.5" @click="$emit('edit', robot)">
                            <Settings class="w-3.5 h-3.5" /> Editar / Mover
                        </Button>
                        <Button variant="ghost" size="sm" class="gap-1.5 text-destructive hover:text-destructive" @click="$emit('delete', robot)">
                            <Trash2 class="w-3.5 h-3.5" /> Eliminar
                        </Button>
                    </div>
                </template>

                <!-- OPERADORES (museum_admin / technician): panel operativo completo -->
                <template v-else>
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h2 class="font-display text-xl font-medium tracking-tight text-foreground">{{ robot.name }}</h2>
                        <span class="text-xs text-muted-foreground uppercase tracking-wider">{{ robot.id }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="relative flex h-3 w-3">
                            <span v-if="robot.connected" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3" :class="robot.connected ? 'bg-green-500' : 'bg-red-500'"></span>
                        </span>
                        <span class="text-sm font-medium capitalize text-foreground">
                            {{ robot.connected ? 'Conectado' : 'Desconectado' }}
                        </span>
                    </div>
                </div>
                <div class="space-y-3 mb-6">
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-muted-foreground flex items-center gap-1">
                            <Zap class="w-4 h-4" /> Batería
                        </span>
                        <div class="flex items-center gap-2" v-if="robot.connected">
                            <div class="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                                <div class="h-full rounded-full"
                                    :class="robot.battery > 20 ? 'bg-green-500' : 'bg-red-500'"
                                    :style="{ width: `${robot.battery}%` }"></div>
                            </div>
                            <span class="font-medium w-8 text-right text-foreground">{{ robot.battery }}%</span>
                        </div>
                        <div v-else class="text-xs text-muted-foreground italic">Sin Telemetría</div>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-muted-foreground flex items-center gap-1">
                            <MapPin class="w-4 h-4" /> Posición
                        </span>
                        <span v-if="robot.connected" class="font-mono bg-secondary px-2 py-0.5 rounded-sm text-xs text-secondary-foreground">
                            x:{{ (robot.position?.x || 0).toFixed(1) }}, y:{{ (robot.position?.y || 0).toFixed(1) }}
                        </span>
                        <span v-else class="text-xs text-muted-foreground italic">Sin Telemetría</span>
                    </div>
                    <div v-if="robot.connected && robot.current_location" class="flex justify-between items-center text-sm">
                        <span class="text-muted-foreground flex items-center gap-1">
                            <Navigation class="w-4 h-4" /> Ubicación
                        </span>
                        <span class="bg-primary/10 text-primary px-2 py-0.5 rounded-sm text-xs font-semibold">
                            {{ robot.current_location.name }}
                        </span>
                    </div>
                    <!-- Último fallo de navegación (se limpia al despachar un nuevo goal) -->
                    <div v-if="robot.last_nav_error_at" class="flex items-start gap-2 text-sm rounded-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 px-2.5 py-2">
                        <AlertTriangle class="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <span class="text-xs text-red-700 dark:text-red-300 leading-snug">
                            No pudo llegar<template v-if="robot.last_nav_error_place"> a <strong>{{ robot.last_nav_error_place }}</strong></template>.
                            <button @click="$emit('show-incidents')" class="underline font-semibold whitespace-nowrap">Ver incidencias</button>
                        </span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-muted-foreground flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Ocupación
                        </span>
                        <div v-if="robot.is_occupied" class="flex items-center gap-2">
                            <span class="bg-primary/10 text-primary px-2 py-0.5 rounded-sm text-xs font-semibold">
                                Por: {{ robot.visitor_name }}
                            </span>
                            <Button v-if="isMuseumAdmin" @click="$emit('end-visit', robot.id)" variant="destructive" size="icon" class="h-6 w-6 scale-90" title="Finalizar Visita Forzosamente">
                                <X class="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        <span v-else class="text-muted-foreground text-xs">
                            Libre
                        </span>
                    </div>
                    <div class="flex justify-between items-center text-sm pt-2 border-t border-border/50">
                        <span class="text-muted-foreground flex items-center gap-1">
                            <Wifi class="w-4 h-4" :class="robot.connected ? 'text-green-500' : 'text-red-500'" />
                            WS: {{ robot.ip || '127.0.0.1' }}
                        </span>
                        <div class="flex items-center gap-1">
                            <span :class="robot.connected ? 'text-green-700 dark:text-green-400 bg-green-500/10' : 'text-red-700 dark:text-red-400 bg-red-500/10'" class="px-2 py-0.5 rounded-sm text-xs font-semibold">
                                {{ robot.connected ? 'Conectado' : 'Desconectado' }}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="border-t border-border pt-4 flex flex-col gap-2">
                    <div class="flex gap-2">
                        <Button v-if="!robot.connected" @click="$emit('command', robot.id, 'connect')" :disabled="pendingCommandId === robot.id" size="sm" class="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5">
                            <Loader2 v-if="pendingCommandId === robot.id" class="w-4 h-4 animate-spin" />
                            {{ pendingCommandId === robot.id ? 'Conectando…' : 'Conectar' }}
                        </Button>
                        <Button v-else @click="$emit('command', robot.id, 'disconnect')" :disabled="pendingCommandId === robot.id" size="sm" variant="destructive" class="flex-1 gap-1.5">
                            <Loader2 v-if="pendingCommandId === robot.id" class="w-4 h-4 animate-spin" />
                            {{ pendingCommandId === robot.id ? 'Desconectando…' : 'Desconectar' }}
                        </Button>
                    </div>
                    <Button v-if="isStaff" @click="$emit('open-control', robot.id)" variant="outline" size="sm" class="gap-1.5">
                        <Gamepad2 class="w-4 h-4" /> Control
                    </Button>
                    <Button v-if="isStaff" @click="$emit('edit', robot)" variant="outline" size="sm" class="gap-1.5">
                        <Settings class="w-4 h-4" /> Editar nombre / IP
                    </Button>
                    <p v-if="commandError && commandError.id === robot.id" class="text-xs text-destructive">
                        {{ commandError.message }}
                    </p>
                </div>
                <div class="mt-4 pt-4 border-t border-border flex flex-col gap-2">
                    <div class="mt-2 text-center">
                        <img v-if="qrCodes[robot.id]" :src="qrCodes[robot.id]" alt="QR Code" class="w-24 h-24 mx-auto" />
                        <div v-else class="w-24 h-24 mx-auto flex items-center justify-center text-xs text-muted-foreground">Generando QR…</div>
                        <Button v-if="qrCodes[robot.id]" as="a" :href="qrCodes[robot.id]" :download="`qr-${robot.name || robot.id}.png`" size="sm" class="mt-2"
                        >Descargar</Button>
                        <Button as="a" :href="buildVisitUrl(robot.id)" target="_blank" variant="outline" size="sm" class="mt-2"
                        >Chat</Button>
                    </div>
                  </div>
                </template>
            </Card>
        </div>
    </div>
</template>
