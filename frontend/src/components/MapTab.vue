<script setup>
/**
 * @module components/MapTab
 * @description
 * Pestaña del panel para **gestionar mapas y zonas**: subir/capturar/eliminar
 * mapas, editar zonas, fijar el punto base y asignar/desasignar un mapa a un
 * robot. Actúa como **orquestador**: posee los datos (mapas, zonas, robots) y el
 * estado de interacción, y compone dos hijos: el lienzo editable
 * ({@link module:components/map/MapCanvasEditor}) y la barra lateral de zonas y
 * asignación ({@link module:components/map/MapZonesSidebar}).
 *
 * **Props**
 * - `robots` `{Array}` *(por defecto `[]`)* - Robots del museo, para asignarles un mapa.
 *
 * **Eventos:** ninguno.
 *
 * **Dependencias:** {@link module:stores/auth}, {@link module:services/mapService},
 * {@link module:services/robotService}, {@link module:constants/mapCategories},
 * componentes de {@link module:components/ui/Card} y `lucide-vue-next`.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { mapService } from '@/services/mapService'
import { robotService } from '@/services/robotService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { CATEGORIES, BASE_CATEGORY } from '@/lib/mapCategories'
import { Upload, Trash2, Plus, MapPin, X, Bot, Home, AlertTriangle } from 'lucide-vue-next'
import MapCanvasEditor from '@/components/map/MapCanvasEditor.vue'
import MapZonesSidebar from '@/components/map/MapZonesSidebar.vue'

const authStore = useAuthStore()

const props = defineProps({
    robots: {
        type: Array,
        default: () => []
    }
})

const loading = ref(true)
const error = ref(null)
const success = ref(null)

const robotsData = ref([])
const maps = ref([])
const selectedMuseumId = ref('')
const selectedMapId = ref('')

const mapData = ref(null)
const zones = ref([])

const uploading = ref(false)
const fileInput = ref(null)
const yamlInput = ref(null)
const uploadForm = ref({ name: '' })

const selectedRobotToAssign = ref('')

// Estado de interacción del editor, compartido con MapCanvasEditor por v-model.
const isPlacingMode = ref(false)
const placingBase = ref(false)        // colocando/moviendo el punto base interno
const hoveredZone = ref(null)
const pendingZone = ref(null)

const showZoneForm = ref(false)
const zoneForm = ref({ name: '', description: '', category: 'exhibit' })
const editingZone = ref(null)
const showEditForm = ref(false)
const editForm = ref({ name: '', description: '', category: 'exhibit' })

// El único punto base del mapa actual (o null si aún no está definido).
const baseZone = computed(() => zones.value.find(z => z.category === BASE_CATEGORY) || null)
// Zonas visibles para el visitante que se muestran en la lista normal (la base se gestiona aparte).
const regularZones = computed(() => zones.value.filter(z => z.category !== BASE_CATEGORY))

const showUploadPanel = ref(false)
const showCapturePanel = ref(false)
const capturing = ref(false)
const captureForm = ref({ name: '', robotId: '' })

const museumOptions = computed(() => {
    const unique = new Map()
    if (authStore.user?.museum_id) {
        unique.set(authStore.user.museum_id, {
            id: authStore.user.museum_id,
            label: authStore.user.museum_name || 'Mi museo'
        })
    }

    for (const robot of robotsData.value) {
        if (!robot.museum_id) continue
        if (!unique.has(robot.museum_id)) {
            unique.set(robot.museum_id, {
                id: robot.museum_id,
                label: robot.museum_name || `Museo ${robot.museum_id.slice(0, 8)}`
            })
        }
    }

    return Array.from(unique.values())
})

const robotsForMuseum = computed(() => {
    if (!selectedMuseumId.value) return []
    return robotsData.value.filter(r => r.museum_id === selectedMuseumId.value)
})

const robotsAssignedToMap = computed(() => {
    if (!selectedMapId.value) return []
    return robotsForMuseum.value.filter(r => r.map_id === selectedMapId.value)
})

const robotsAvailableForAssignment = computed(() => {
    if (!selectedMapId.value) return []
    return robotsForMuseum.value.filter(r => r.map_id !== selectedMapId.value)
})

watch(() => props.robots, (newVal) => {
    robotsData.value = Array.isArray(newVal) ? [...newVal] : []
}, { immediate: true, deep: true })

watch(museumOptions, (newMuseums) => {
    if (!selectedMuseumId.value && newMuseums.length > 0) {
        selectedMuseumId.value = newMuseums[0].id
    }
}, { immediate: true })

watch(selectedMuseumId, async (museumId) => {
    selectedMapId.value = ''
    mapData.value = null
    zones.value = []
    if (!museumId) {
        maps.value = []
        return
    }
    await fetchMaps(museumId)
})

watch(selectedMapId, async (mapId) => {
    if (!mapId) {
        mapData.value = null
        zones.value = []
        return
    }
    await fetchMapAndZones(mapId)
})

async function refreshRobots() {
    try {
        const list = await robotService.fetchAll()
        robotsData.value = Array.isArray(list) ? list : []
    } catch {
        robotsData.value = Array.isArray(props.robots) ? [...props.robots] : []
    }
}

async function fetchMaps(museumId) {
    loading.value = true
    error.value = null
    try {
        maps.value = await mapService.listMaps(museumId)
        if (maps.value.length > 0) {
            selectedMapId.value = maps.value[0].id
        }
    } catch (err) {
        maps.value = []
        error.value = err.message
    } finally {
        loading.value = false
    }
}

async function fetchMapAndZones(mapId) {
    loading.value = true
    error.value = null
    try {
        const [mapResult, zonesResult] = await Promise.all([
            mapService.getMap(mapId),
            mapService.getZones(mapId)
        ])
        mapData.value = mapResult
        zones.value = zonesResult
    } catch (err) {
        error.value = err.message
        mapData.value = null
        zones.value = []
    } finally {
        loading.value = false
    }
}

// ── Gestión del punto base ──────────────────────────────────────────────────────

function startPlacingBase() {
    isPlacingMode.value = false
    placingBase.value = true
}

async function handlePlaceBase(world) {
    if (!selectedMapId.value) return
    error.value = null
    try {
        if (baseZone.value) {
            await mapService.updateZone(selectedMapId.value, baseZone.value.id, { map_x: world.x, map_y: world.y })
        } else {
            await mapService.createZone(selectedMapId.value, {
                name: 'Base', category: BASE_CATEGORY, map_x: world.x, map_y: world.y,
            })
        }
        await refreshZones()
        success.value = 'Punto base actualizado'
        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    }
}

async function handleDeleteBase() {
    if (!selectedMapId.value || !baseZone.value) return
    if (!confirm('¿Eliminar el punto base? Sin base no podrás asignar este mapa a un robot.')) return
    try {
        await mapService.deleteZone(selectedMapId.value, baseZone.value.id)
        await refreshZones()
        success.value = 'Punto base eliminado'
        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    }
}

async function handleUpload() {
    const imageFile = fileInput.value?.files?.[0]
    if (!selectedMuseumId.value) {
        error.value = 'Selecciona un museo primero'
        return
    }
    if (!uploadForm.value.name.trim()) {
        error.value = 'El nombre del mapa es obligatorio'
        return
    }
    if (!imageFile) {
        error.value = 'Selecciona una imagen del mapa'
        return
    }

    uploading.value = true
    error.value = null

    try {
        const formData = new FormData()
        formData.append('name', uploadForm.value.name.trim())
        formData.append('image', imageFile)

        const yamlFile = yamlInput.value?.files?.[0]
        if (yamlFile) formData.append('yaml', yamlFile)

        const response = await mapService.uploadMap(selectedMuseumId.value, formData)
        success.value = 'Mapa subido correctamente'
        uploadForm.value.name = ''

        if (fileInput.value) fileInput.value.value = ''
        if (yamlInput.value) yamlInput.value.value = ''

        await fetchMaps(selectedMuseumId.value)
        if (response?.map?.id) {
            selectedMapId.value = response.map.id
        }

        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    } finally {
        uploading.value = false
    }
}

async function handleCapture() {
    if (!captureForm.value.robotId) {
        error.value = 'Selecciona un robot'
        return
    }
    if (!captureForm.value.name.trim()) {
        error.value = 'El nombre del mapa es obligatorio'
        return
    }

    capturing.value = true
    error.value = null

    try {
        const response = await mapService.captureFromRobot(captureForm.value.robotId, captureForm.value.name.trim())
        success.value = 'Mapa capturado correctamente'
        captureForm.value.name = ''
        showCapturePanel.value = false

        const robot = robotsData.value.find(r => r.id === captureForm.value.robotId)
        const museumId = robot?.museum_id || selectedMuseumId.value
        if (museumId) await fetchMaps(museumId)
        if (response?.map?.id) selectedMapId.value = response.map.id

        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    } finally {
        capturing.value = false
    }
}

async function handleDeleteMap() {
    if (!selectedMapId.value) return
    if (!confirm('Eliminar este mapa? Tambien se eliminaran sus zonas y se desasignara de los robots.')) return

    try {
        await mapService.deleteMap(selectedMapId.value)
        success.value = 'Mapa eliminado'
        selectedMapId.value = ''
        await fetchMaps(selectedMuseumId.value)
        await refreshRobots()
        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    }
}

async function refreshZones() {
    if (!selectedMapId.value) return
    zones.value = await mapService.getZones(selectedMapId.value)
}

// El lienzo emite la posición (mundo) al hacer clic en modo "colocar zona".
function onPlaceZone(world) {
    pendingZone.value = { map_x: world.map_x, map_y: world.map_y }
    zoneForm.value = { name: '', description: '', category: 'exhibit' }
    showZoneForm.value = true
}

// El lienzo (o la lista lateral) pide editar una zona existente.
function onEditZone(zone) {
    editingZone.value = zone
    editForm.value = {
        name: zone.name,
        description: zone.description || '',
        category: zone.category
    }
    showEditForm.value = true
}

async function handleCreateZone() {
    if (!selectedMapId.value || !pendingZone.value) return
    if (!zoneForm.value.name.trim()) {
        error.value = 'El nombre es obligatorio'
        return
    }

    error.value = null

    try {
        await mapService.createZone(selectedMapId.value, {
            name: zoneForm.value.name,
            description: zoneForm.value.description,
            category: zoneForm.value.category,
            map_x: pendingZone.value.map_x,
            map_y: pendingZone.value.map_y,
        })
        pendingZone.value = null
        showZoneForm.value = false
        await refreshZones()
        success.value = 'Zona creada correctamente'
        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    }
}

async function handleUpdateZone() {
    if (!selectedMapId.value || !editingZone.value || !editForm.value.name.trim()) return

    error.value = null

    try {
        await mapService.updateZone(selectedMapId.value, editingZone.value.id, {
            name: editForm.value.name,
            description: editForm.value.description,
            category: editForm.value.category,
        })
        showEditForm.value = false
        editingZone.value = null
        await refreshZones()
        success.value = 'Zona actualizada'
        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    }
}

async function handleDeleteZone(zoneId) {
    if (!selectedMapId.value) return
    if (!confirm('Eliminar esta zona?')) return

    try {
        await mapService.deleteZone(selectedMapId.value, zoneId)
        showEditForm.value = false
        editingZone.value = null
        await refreshZones()
    } catch (err) {
        error.value = err.message
    }
}

function cancelPlacement() {
    pendingZone.value = null
    showZoneForm.value = false
    isPlacingMode.value = false
    placingBase.value = false
}

async function assignRobotToMap() {
    if (!selectedRobotToAssign.value || !selectedMapId.value) return

    try {
        await mapService.assignMap(selectedRobotToAssign.value, selectedMapId.value)
        selectedRobotToAssign.value = ''
        await refreshRobots()
        success.value = 'Robot asignado al mapa'
        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    }
}

async function unassignRobotFromMap(robotId) {
    try {
        await mapService.unassignMap(robotId)
        await refreshRobots()
        success.value = 'Robot desasignado del mapa'
        setTimeout(() => { success.value = null }, 3000)
    } catch (err) {
        error.value = err.message
    }
}

onMounted(async () => {
    await refreshRobots()

    if (!selectedMuseumId.value && museumOptions.value.length > 0) {
        selectedMuseumId.value = museumOptions.value[0].id
    }

    // watch(selectedMuseumId) se pierde el valor inicial que fija watch(museumOptions, { immediate: true })
    // porque ese watch se dispara durante el setup, antes de registrar watch(selectedMuseumId).
    // Por eso cargamos aquí los mapas explícitamente si aún no se han obtenido.
    if (selectedMuseumId.value && maps.value.length === 0) {
        await fetchMaps(selectedMuseumId.value)
    }
})
</script>

<template>
    <div class="flex flex-col gap-4">
        <!-- Alertas -->
        <Alert v-if="error" variant="destructive">{{ error }}</Alert>
        <Alert v-if="success" variant="success">{{ success }}</Alert>

        <!-- Barra superior -->
        <Card>
            <CardContent class="p-3">
                <div class="flex flex-wrap items-center gap-3">
                    <!-- Selector de museo -->
                    <div class="flex items-center gap-2">
                        <Label class="text-xs text-muted-foreground whitespace-nowrap shrink-0">Museo</Label>
                        <select
                            v-model="selectedMuseumId"
                            class="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                            <option value="" disabled>Selecciona...</option>
                            <option v-for="museum in museumOptions" :key="museum.id" :value="museum.id">
                                {{ museum.label }}
                            </option>
                        </select>
                    </div>

                    <!-- Separador -->
                    <div class="h-5 w-px bg-border hidden sm:block"></div>

                    <!-- Selector de mapa -->
                    <div class="flex items-center gap-2">
                        <Label class="text-xs text-muted-foreground whitespace-nowrap shrink-0">Mapa</Label>
                        <select
                            v-model="selectedMapId"
                            :disabled="!selectedMuseumId || maps.length === 0"
                            class="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                        >
                            <option value="">{{ maps.length ? 'Selecciona un mapa...' : 'Sin mapas' }}</option>
                            <option v-for="map in maps" :key="map.id" :value="map.id">{{ map.name }}</option>
                        </select>
                    </div>

                    <!-- Espaciador -->
                    <div class="flex-1"></div>

                    <!-- Contador de robots -->
                    <div v-if="selectedMapId" class="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                        <Bot class="w-3.5 h-3.5" />
                        {{ robotsAssignedToMap.length }} robot{{ robotsAssignedToMap.length !== 1 ? 's' : '' }}
                    </div>

                    <!-- Acciones -->
                    <Button
                        @click="showCapturePanel = !showCapturePanel; showUploadPanel = false"
                        :variant="showCapturePanel ? 'default' : 'outline'"
                        size="sm"
                        class="gap-1.5"
                    >
                        <Bot class="w-4 h-4" />
                        {{ showCapturePanel ? 'Cerrar' : 'Capturar de robot' }}
                    </Button>

                    <Button
                        @click="showUploadPanel = !showUploadPanel; showCapturePanel = false"
                        :variant="showUploadPanel ? 'default' : 'outline'"
                        size="sm"
                        class="gap-1.5"
                    >
                        <Upload class="w-4 h-4" />
                        {{ showUploadPanel ? 'Cerrar' : 'Subir mapa' }}
                    </Button>

                    <Button
                        v-if="selectedMapId"
                        @click="handleDeleteMap"
                        variant="ghost"
                        size="sm"
                        class="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Eliminar mapa"
                    >
                        <Trash2 class="w-4 h-4" />
                        Eliminar
                    </Button>
                </div>
            </CardContent>
        </Card>

        <!-- Panel de captura desde el robot -->
        <Card v-if="showCapturePanel">
            <CardContent class="p-4">
                <p class="text-xs text-muted-foreground mb-4">
                    El backend se suscribe al topic <code class="font-mono">/map</code> del robot y persiste el OccupancyGrid como PNG. El robot debe estar conectado y con el map_server o SLAM activo.
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label>Nombre del mapa *</Label>
                        <Input v-model="captureForm.name" placeholder="Ej: Planta baja" class="mt-1" />
                    </div>
                    <div>
                        <Label>Robot *</Label>
                        <select
                            v-model="captureForm.robotId"
                            class="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <option value="" disabled>Selecciona un robot</option>
                            <option v-for="r in robotsForMuseum" :key="r.id" :value="r.id">
                                {{ r.name }}
                            </option>
                        </select>
                    </div>
                </div>
                <div class="flex justify-end mt-4">
                    <Button @click="handleCapture" :disabled="capturing || !selectedMuseumId" class="gap-2">
                        <Bot class="w-4 h-4" />
                        {{ capturing ? 'Capturando…' : 'Capturar mapa' }}
                    </Button>
                </div>
            </CardContent>
        </Card>

        <!-- Panel de subida (plegable) -->
        <Card v-if="showUploadPanel">
            <CardContent class="p-4">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <Label>Nombre del mapa *</Label>
                        <Input v-model="uploadForm.name" placeholder="Ej: Planta principal" class="mt-1" />
                    </div>
                    <div>
                        <Label>Imagen del mapa *</Label>
                        <input
                            ref="fileInput"
                            type="file"
                            accept=".png,.jpg,.jpeg,.pgm"
                            class="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                        />
                    </div>
                    <div>
                        <Label>YAML (opcional)</Label>
                        <input
                            ref="yamlInput"
                            type="file"
                            accept=".yaml,.yml"
                            class="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
                        />
                    </div>
                </div>
                <div class="flex justify-end mt-4">
                    <Button @click="handleUpload" :disabled="uploading || !selectedMuseumId" class="gap-2">
                        <Upload class="w-4 h-4" />
                        {{ uploading ? 'Subiendo...' : 'Guardar mapa' }}
                    </Button>
                </div>
            </CardContent>
        </Card>

        <!-- Cargando -->
        <div v-if="loading" class="flex items-center justify-center py-20">
            <div class="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
        </div>

        <!-- Estado vacío -->
        <div v-else-if="!selectedMapId" class="flex flex-col items-center justify-center py-20 text-center">
            <MapPin class="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
            <p class="text-base font-medium text-muted-foreground">
                {{ maps.length === 0 && selectedMuseumId ? 'No hay mapas para este museo' : 'Selecciona un mapa para comenzar' }}
            </p>
            <p v-if="maps.length === 0 && selectedMuseumId" class="text-sm text-muted-foreground mt-1">
                Haz clic en <span class="font-medium text-foreground">Nuevo mapa</span> para subir uno.
            </p>
        </div>

        <!-- Mapa seleccionado: aviso de base opcional + área de trabajo -->
        <div v-else class="flex flex-col gap-4">
            <!-- Aviso de base obligatoria -->
            <div v-if="!baseZone"
                class="flex items-start gap-3 rounded-sm border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                <AlertTriangle class="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">Este mapa no tiene punto base</p>
                    <p class="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                        El punto base es a donde vuelve el robot al terminar. Es obligatorio para poder asignar este mapa a un robot.
                    </p>
                </div>
                <Button @click="startPlacingBase" size="sm" class="gap-1.5 shrink-0 bg-sky-600 hover:bg-sky-700 text-white">
                    <Home class="w-4 h-4" /> Colocar base
                </Button>
            </div>

            <!-- Área de trabajo principal del mapa: lienzo + barra lateral -->
            <div class="flex gap-4 flex-col xl:flex-row">
                <MapCanvasEditor
                    :map-data="mapData"
                    :zones="zones"
                    :selected-map-id="selectedMapId"
                    :pending-zone="pendingZone"
                    v-model:hovered-zone="hoveredZone"
                    v-model:is-placing-mode="isPlacingMode"
                    v-model:placing-base="placingBase"
                    @place-zone="onPlaceZone"
                    @place-base="handlePlaceBase"
                    @edit-zone="onEditZone"
                    @cancel-placement="cancelPlacement"
                    @image-error="error = $event"
                />

                <MapZonesSidebar
                    :regular-zones="regularZones"
                    :base-zone="baseZone"
                    :placing-base="placingBase"
                    :robots-assigned-to-map="robotsAssignedToMap"
                    :robots-available-for-assignment="robotsAvailableForAssignment"
                    v-model:selected-robot-to-assign="selectedRobotToAssign"
                    @hover="hoveredZone = $event"
                    @edit-zone="onEditZone"
                    @start-placing-base="startPlacingBase"
                    @delete-base="handleDeleteBase"
                    @assign="assignRobotToMap"
                    @unassign="unassignRobotFromMap"
                />
            </div>
        </div>

        <!-- Modal de nueva zona -->
        <Teleport to="body">
            <div
                v-if="showZoneForm"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                @click.self="cancelPlacement"
            >
                <div class="bg-card border border-border rounded-md w-full max-w-md mx-4 p-6 space-y-4">
                    <div class="flex justify-between items-center">
                        <h3 class="font-display text-lg font-medium tracking-tight">Nueva zona</h3>
                        <button @click="cancelPlacement" class="text-muted-foreground hover:text-foreground">
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <div class="text-xs text-muted-foreground bg-muted rounded-sm px-3 py-2">
                        Posición en mapa: ({{ pendingZone?.map_x }}, {{ pendingZone?.map_y }})
                    </div>

                    <div class="space-y-3">
                        <div>
                            <Label>Nombre *</Label>
                            <Input v-model="zoneForm.name" placeholder="Ej: Sala principal" class="mt-1" autofocus />
                        </div>
                        <div>
                            <Label>Descripción</Label>
                            <Input v-model="zoneForm.description" placeholder="Breve descripción" class="mt-1" />
                        </div>
                        <div>
                            <Label>Categoría</Label>
                            <select
                                v-model="zoneForm.category"
                                class="mt-1 w-full h-10 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                            >
                                <option v-for="cat in CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
                            </select>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-1">
                        <Button @click="cancelPlacement" variant="outline">Cancelar</Button>
                        <Button @click="handleCreateZone" :disabled="!zoneForm.name.trim()" class="gap-1.5">
                            <Plus class="w-4 h-4" /> Crear zona
                        </Button>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Modal de editar zona -->
        <Teleport to="body">
            <div
                v-if="showEditForm"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                @click.self="showEditForm = false"
            >
                <div class="bg-card border border-border rounded-md w-full max-w-md mx-4 p-6 space-y-4">
                    <div class="flex justify-between items-center">
                        <h3 class="font-display text-lg font-medium tracking-tight">Editar zona</h3>
                        <button @click="showEditForm = false" class="text-muted-foreground hover:text-foreground">
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <div class="space-y-3">
                        <div>
                            <Label>Nombre</Label>
                            <Input v-model="editForm.name" class="mt-1" />
                        </div>
                        <div>
                            <Label>Descripción</Label>
                            <Input v-model="editForm.description" class="mt-1" />
                        </div>
                        <div>
                            <Label>Categoría</Label>
                            <select
                                v-model="editForm.category"
                                class="mt-1 w-full h-10 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                            >
                                <option v-for="cat in CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
                            </select>
                        </div>
                    </div>

                    <div class="flex justify-between pt-1">
                        <Button @click="handleDeleteZone(editingZone.id)" variant="destructive" size="sm" class="gap-1.5">
                            <Trash2 class="w-4 h-4" /> Eliminar
                        </Button>
                        <div class="flex gap-2">
                            <Button @click="showEditForm = false" variant="outline">Cancelar</Button>
                            <Button @click="handleUpdateZone" :disabled="!editForm.name.trim()">Guardar</Button>
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
