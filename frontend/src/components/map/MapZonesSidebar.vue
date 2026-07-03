<script setup>
/**
 * @module components/map/MapZonesSidebar
 * @description
 * Barra lateral del editor de mapas. Presenta tres tarjetas: la lista de zonas
 * del visitante, la gestión del punto base (interno) y la asignación de robots
 * al mapa. Es un componente **presentacional**: recibe los datos por props y
 * delega todas las acciones en el padre mediante eventos.
 */
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { categoryColor, categoryLabel } from '@/lib/mapCategories'
import { MapPin, Pencil, Home, Trash2, AlertTriangle, Bot, Link, Link2Off } from 'lucide-vue-next'

defineProps({
    regularZones: { type: Array, default: () => [] },
    baseZone: { type: Object, default: null },
    placingBase: { type: Boolean, default: false },
    robotsAssignedToMap: { type: Array, default: () => [] },
    robotsAvailableForAssignment: { type: Array, default: () => [] },
    selectedRobotToAssign: { type: [String, Number], default: '' },
})

const emit = defineEmits([
    'update:selectedRobotToAssign', 'hover', 'edit-zone',
    'start-placing-base', 'delete-base', 'assign', 'unassign',
])
</script>

<template>
    <div class="xl:w-72 shrink-0 flex flex-col gap-4">
        <!-- Lista de zonas -->
        <Card class="flex-1">
            <CardHeader class="pb-2 pt-4 px-4">
                <h4 class="text-sm font-semibold text-foreground">Zonas</h4>
            </CardHeader>
            <CardContent class="p-0">
                <div v-if="regularZones.length === 0" class="px-4 pb-6 pt-2 text-center">
                    <MapPin class="w-7 h-7 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p class="text-sm text-muted-foreground">Sin zonas. Usa <span class="font-medium text-foreground">Añadir zona</span> para marcar puntos en el mapa.</p>
                </div>
                <div v-else class="max-h-64 overflow-y-auto divide-y divide-border">
                    <div
                        v-for="zone in regularZones"
                        :key="zone.id"
                        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer group"
                        @mouseenter="emit('hover', zone.id)"
                        @mouseleave="emit('hover', null)"
                        @click="emit('edit-zone', zone)"
                    >
                        <div
                            class="w-2.5 h-2.5 rounded-full shrink-0"
                            :style="{ backgroundColor: categoryColor(zone.category) }"
                        ></div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-foreground truncate">{{ zone.name }}</p>
                            <p class="text-xs text-muted-foreground">{{ categoryLabel(zone.category) }}</p>
                        </div>
                        <Pencil class="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- Punto base (interno) -->
        <Card>
            <CardHeader class="pb-2 pt-4 px-4">
                <h4 class="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Home class="w-4 h-4 text-sky-500" /> Punto base
                </h4>
            </CardHeader>
            <CardContent class="px-4 pb-4 space-y-2">
                <p class="text-xs text-muted-foreground">
                    Punto interno (no visible para visitantes) al que vuelve el robot al terminar.
                </p>
                <div v-if="baseZone" class="flex items-center gap-2 rounded-sm border border-sky-500/30 bg-sky-500/5 px-3 py-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0"></span>
                    <span class="text-sm font-medium flex-1">Definido</span>
                    <span class="text-[0.7rem] font-mono text-muted-foreground">({{ baseZone.map_x }}, {{ baseZone.map_y }})</span>
                </div>
                <div v-else class="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle class="w-3.5 h-3.5 shrink-0" /> Sin definir
                </div>
                <div class="flex gap-2">
                    <Button @click="emit('start-placing-base')" :variant="placingBase ? 'default' : 'outline'" size="sm" class="gap-1.5 flex-1">
                        <Home class="w-3.5 h-3.5" /> {{ baseZone ? 'Mover base' : 'Colocar base' }}
                    </Button>
                    <Button v-if="baseZone" @click="emit('delete-base')" variant="ghost" size="sm"
                        class="h-9 px-2 text-muted-foreground hover:text-destructive shrink-0" title="Eliminar base">
                        <Trash2 class="w-3.5 h-3.5" />
                    </Button>
                </div>
            </CardContent>
        </Card>

        <!-- Asignación de robots -->
        <Card>
            <CardHeader class="pb-2 pt-4 px-4">
                <h4 class="text-sm font-semibold text-foreground">Robots asignados</h4>
            </CardHeader>
            <CardContent class="px-4 pb-4 space-y-3">
                <!-- Asignar -->
                <div class="flex gap-2">
                    <select
                        :value="selectedRobotToAssign"
                        @change="emit('update:selectedRobotToAssign', $event.target.value)"
                        :disabled="!baseZone"
                        class="flex h-9 flex-1 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                    >
                        <option value="">Selecciona un robot...</option>
                        <option v-for="robot in robotsAvailableForAssignment" :key="robot.id" :value="robot.id">
                            {{ robot.name }}
                        </option>
                    </select>
                    <Button @click="emit('assign')" :disabled="!selectedRobotToAssign || !baseZone" size="sm" class="gap-1 shrink-0">
                        <Link class="w-4 h-4" />
                        Asignar
                    </Button>
                </div>
                <p v-if="!baseZone" class="text-xs text-amber-700 dark:text-amber-400">
                    Define el punto base para poder asignar robots.
                </p>

                <!-- Lista de robots asignados -->
                <div v-if="robotsAssignedToMap.length === 0" class="text-sm text-muted-foreground text-center py-2">
                    Ningún robot asignado.
                </div>
                <div v-else class="space-y-1.5 max-h-40 overflow-y-auto">
                    <div
                        v-for="robot in robotsAssignedToMap"
                        :key="robot.id"
                        class="flex items-center justify-between gap-2 rounded-sm border border-border px-3 py-2"
                    >
                        <div class="min-w-0 flex items-center gap-2">
                            <Bot class="w-4 h-4 text-muted-foreground shrink-0" />
                            <span class="text-sm font-medium truncate">{{ robot.name }}</span>
                        </div>
                        <Button
                            @click="emit('unassign', robot.id)"
                            variant="ghost"
                            size="sm"
                            class="h-7 px-2 text-muted-foreground hover:text-destructive shrink-0"
                            title="Desasignar"
                        >
                            <Link2Off class="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
</template>
