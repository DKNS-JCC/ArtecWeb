<script setup>
/**
 * @module components/IncidentsTab
 * @description
 * Pestaña del panel que lista las **incidencias operativas** (p. ej. fallos de
 * navegación). Permite filtrar entre abiertas y todas, y marcar una incidencia
 * como resuelta.
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** {@link module:services/incidentService},
 * {@link module:stores/auth}, {@link module:components/ui/Button},
 * `lucide-vue-next`.
 */
import { ref, computed, onMounted } from 'vue'
import { incidentService } from '@/services/incidentService'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Check, Bot, MapPin, Navigation, CheckCircle2, Loader2 } from 'lucide-vue-next'

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)

const incidents = ref([])
const loading   = ref(false)
const filter    = ref('open')      // 'open' | 'all'
const resolvingId = ref(null)

async function fetchIncidents() {
    loading.value = true
    try {
        incidents.value = await incidentService.fetchAll()
    } catch (e) {
        console.error('[Incidents]', e)
    } finally {
        loading.value = false
    }
}

const visibleIncidents = computed(() =>
    filter.value === 'open' ? incidents.value.filter(i => !i.resolved) : incidents.value
)

const openCount = computed(() => incidents.value.filter(i => !i.resolved).length)

async function resolveIncident(id) {
    resolvingId.value = id
    try {
        await incidentService.resolve(id)
        const inc = incidents.value.find(i => i.id === id)
        if (inc) inc.resolved = 1
    } catch (e) {
        console.error('[Incidents] resolve', e)
    } finally {
        resolvingId.value = null
    }
}

const TYPE_LABELS = { nav_failed: 'Fallo de navegación' }
const typeLabel = (t) => TYPE_LABELS[t] || t

function formatWhen(ts) {
    if (!ts) return '-'
    // SQLite guarda UTC sin marca de zona; se normaliza para que se muestre en hora local.
    const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z')
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

onMounted(fetchIncidents)
defineExpose({ refresh: fetchIncidents })
</script>

<template>
    <div>
        <!-- Cabecera -->
        <div class="flex flex-wrap justify-between items-center gap-3 mb-6">
            <div>
                <h2 class="font-display text-xl font-medium tracking-tight text-foreground flex items-center gap-2">
                    Incidencias
                    <span v-if="openCount > 0"
                        class="text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
                        {{ openCount }} sin resolver
                    </span>
                </h2>
                <p class="text-sm text-muted-foreground mt-0.5">Fallos operativos de la flota que requieren revisión.</p>
            </div>
            <div class="flex items-center gap-2">
                <select v-model="filter"
                    class="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                    <option value="open">Sin resolver</option>
                    <option value="all">Todas</option>
                </select>
            </div>
        </div>

        <!-- Cargando -->
        <div v-if="loading" class="flex justify-center items-center h-40">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>

        <!-- Vacío -->
        <div v-else-if="visibleIncidents.length === 0"
            class="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed border-border rounded-md">
            <CheckCircle2 class="w-10 h-10 mb-3 opacity-40 text-green-500" />
            <p class="font-medium text-foreground">Sin incidencias{{ filter === 'open' ? ' pendientes' : '' }}</p>
            <p class="text-sm">Todo funciona correctamente.</p>
        </div>

        <!-- Lista -->
        <div v-else class="space-y-3">
            <div v-for="inc in visibleIncidents" :key="inc.id"
                class="flex items-start gap-4 p-4 rounded-lg border bg-card transition-colors"
                :class="inc.resolved ? 'border-border opacity-60' : 'border-red-200 dark:border-red-700/40'">

                <!-- Icon -->
                <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    :class="inc.resolved ? 'bg-muted text-muted-foreground' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'">
                    <AlertTriangle class="w-5 h-5" />
                </div>

                <!-- Body -->
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                        <span class="text-sm font-semibold text-foreground">{{ typeLabel(inc.type) }}</span>
                        <span v-if="inc.resolved"
                            class="text-[0.65rem] uppercase tracking-wider font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                            Resuelta
                        </span>
                    </div>
                    <p class="text-sm text-muted-foreground leading-snug">{{ inc.detail }}</p>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span class="flex items-center gap-1"><Bot class="w-3.5 h-3.5" /> {{ inc.robot_name || inc.robot_id }}</span>
                        <span v-if="inc.place_name" class="flex items-center gap-1"><MapPin class="w-3.5 h-3.5" /> {{ inc.place_name }}</span>
                        <span v-if="isPlatformAdmin && inc.museum_name" class="flex items-center gap-1"><Navigation class="w-3.5 h-3.5" /> {{ inc.museum_name }}</span>
                        <span>{{ formatWhen(inc.created_at) }}</span>
                    </div>
                </div>

                <!-- Action -->
                <Button v-if="!inc.resolved" @click="resolveIncident(inc.id)" :disabled="resolvingId === inc.id"
                    size="sm" variant="outline" class="flex-shrink-0 gap-1.5">
                    <Loader2 v-if="resolvingId === inc.id" class="w-4 h-4 animate-spin" />
                    <Check v-else class="w-4 h-4" />
                    Resolver
                </Button>
            </div>
        </div>
    </div>
</template>
