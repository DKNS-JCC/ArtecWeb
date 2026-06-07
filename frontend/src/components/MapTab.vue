<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { mapService } from '@/services/mapService'
import { robotService } from '@/services/robotService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CATEGORIES, BASE_CATEGORY, categoryColor, categoryLabel } from '@/lib/mapCategories'
import {
    Upload,
    Trash2,
    Plus,
    MapPin,
    X,
    Move,
    ZoomIn,
    ZoomOut,
    Crosshair,
    Pencil,
    Bot,
    Link,
    Link2Off,
    Home,
    AlertTriangle,
} from 'lucide-vue-next'

const authStore = useAuthStore()

const props = defineProps({
    robots: {
        type: Array,
        default: () => []
    }
})

const API_ROOT = (import.meta.env.VITE_API_URL || '').replace('/api', '')

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

const canvasRef = ref(null)
const containerRef = ref(null)
const mapImage = ref(null)
const scale = ref(1)
const panOffset = ref({ x: 0, y: 0 })
let isPanning = false
let panStart = { x: 0, y: 0 }

const isPlacingMode = ref(false)
const placingBase = ref(false)        // placing/moving the internal base point
const pendingZone = ref(null)
const showZoneForm = ref(false)
const zoneForm = ref({ name: '', description: '', category: 'exhibit' })

// The single base point of the current map (or null if not defined yet).
const baseZone = computed(() => zones.value.find(z => z.category === BASE_CATEGORY) || null)
// Visitor-facing zones shown in the regular list (base is managed separately).
const regularZones = computed(() => zones.value.filter(z => z.category !== BASE_CATEGORY))

const editingZone = ref(null)
const showEditForm = ref(false)
const editForm = ref({ name: '', description: '', category: 'exhibit' })

const hoveredZone = ref(null)
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
    mapImage.value = null
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
        mapImage.value = null
        zones.value = []
        draw()
        return
    }
    await fetchMapAndZones(mapId)
})

watch(zones, () => draw(), { deep: true })

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
        await nextTick()
        loadMapImage()
    } catch (err) {
        error.value = err.message
        mapData.value = null
        mapImage.value = null
        zones.value = []
    } finally {
        loading.value = false
    }
}

function loadMapImage() {
    if (!mapData.value?.image_path) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
        mapImage.value = img
        fitMapToCanvas()
        draw()
    }
    img.onerror = () => {
        error.value = 'Error al cargar la imagen del mapa'
    }
    img.src = `${API_ROOT}${mapData.value.image_path}`
}

function fitMapToCanvas() {
    if (!mapImage.value || !containerRef.value) return
    const container = containerRef.value
    const cw = container.clientWidth
    const ch = container.clientHeight
    const iw = mapImage.value.width
    const ih = mapImage.value.height

    scale.value = Math.min(cw / iw, ch / ih) * 0.9
    panOffset.value = {
        x: (cw - iw * scale.value) / 2,
        y: (ch - ih * scale.value) / 2
    }
}

function draw() {
    const canvas = canvasRef.value
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const container = containerRef.value
    if (!ctx || !container) return

    canvas.width = container.clientWidth
    canvas.height = container.clientHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!mapImage.value) return

    ctx.save()
    ctx.translate(panOffset.value.x, panOffset.value.y)
    ctx.scale(scale.value, scale.value)

    ctx.drawImage(mapImage.value, 0, 0)

    for (const zone of zones.value) {
        if (zone.map_x == null || zone.map_y == null) continue
        drawMarker(ctx, zone, zone.id === hoveredZone.value)
    }

    if (pendingZone.value && mapData.value) {
        const { x: px, y: py } = worldToPixel(pendingZone.value.map_x, pendingZone.value.map_y)
        drawPendingMarker(ctx, px, py)
    }

    ctx.restore()
}

function drawMarker(ctx, zone, isHovered) {
    if (!mapData.value) return
    const { x, y } = worldToPixel(zone.map_x, zone.map_y)
    const color = categoryColor(zone.category)
    const radius = isHovered ? 10 : 7

    ctx.beginPath()
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2)
    ctx.fillStyle = color + '33'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()

    if (isHovered) {
        const label = zone.name
        ctx.font = 'bold 12px -apple-system, sans-serif'
        const metrics = ctx.measureText(label)
        const labelWidth = metrics.width + 12
        const labelHeight = 22
        const labelX = x - labelWidth / 2
        const labelY = y - radius - labelHeight - 6

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.beginPath()
        ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 4)
        ctx.fill()

        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, x, labelY + labelHeight / 2)
    }
}

function drawPendingMarker(ctx, x, y) {
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.strokeStyle = '#22c55e88'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#22c55e'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 4, y)
    ctx.lineTo(x + 4, y)
    ctx.moveTo(x, y - 4)
    ctx.lineTo(x, y + 4)
    ctx.stroke()
}

function screenToImage(clientX, clientY) {
    const rect = canvasRef.value.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return {
        x: (sx - panOffset.value.x) / scale.value,
        y: (sy - panOffset.value.y) / scale.value
    }
}

// Convert image-pixel coords → ROS world coords (meters), matching RViz frame
function pixelToWorld(px, py) {
    const { resolution, origin_x, origin_y, height } = mapData.value
    return {
        x: parseFloat((origin_x + px * resolution).toFixed(4)),
        y: parseFloat((origin_y + (height - py) * resolution).toFixed(4))
    }
}

// Convert ROS world coords (meters) → image-pixel coords for canvas rendering
function worldToPixel(wx, wy) {
    const { resolution, origin_x, origin_y, height } = mapData.value
    return {
        x: (wx - origin_x) / resolution,
        y: height - (wy - origin_y) / resolution
    }
}

function findZoneAtPosition(imgX, imgY) {
    const threshold = 12 / scale.value
    for (const zone of zones.value) {
        if (zone.map_x == null || zone.map_y == null) continue
        const { x, y } = worldToPixel(zone.map_x, zone.map_y)
        const dx = x - imgX
        const dy = y - imgY
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return zone
    }
    return null
}

function handleCanvasClick(e) {
    if (isPanning || !selectedMapId.value || !mapImage.value) return

    const { x, y } = screenToImage(e.clientX, e.clientY)

    if (placingBase.value) {
        const world = pixelToWorld(x, y)
        placingBase.value = false
        handlePlaceBase(world)
        return
    }

    if (isPlacingMode.value) {
        const world = pixelToWorld(x, y)
        pendingZone.value = { map_x: world.x, map_y: world.y }
        zoneForm.value = { name: '', description: '', category: 'exhibit' }
        showZoneForm.value = true
        isPlacingMode.value = false
        draw()
        return
    }

    const clicked = findZoneAtPosition(x, y)
    if (clicked) {
        // The base point is edited via its dedicated controls, not the zone form.
        if (clicked.category === BASE_CATEGORY) return
        editingZone.value = clicked
        editForm.value = {
            name: clicked.name,
            description: clicked.description || '',
            category: clicked.category
        }
        showEditForm.value = true
    }
}

// ── Base point management ──────────────────────────────────────────────────────

function startPlacingBase() {
    isPlacingMode.value = false
    placingBase.value = true
    if (canvasRef.value) canvasRef.value.style.cursor = 'crosshair'
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

function handleCanvasMouseMove(e) {
    if (!canvasRef.value) return

    if (isPanning) {
        panOffset.value = {
            x: panOffset.value.x + (e.clientX - panStart.x),
            y: panOffset.value.y + (e.clientY - panStart.y)
        }
        panStart = { x: e.clientX, y: e.clientY }
        draw()
        return
    }

    if (!selectedMapId.value || !mapImage.value) return

    const { x, y } = screenToImage(e.clientX, e.clientY)
    const hovered = findZoneAtPosition(x, y)
    const nextHovered = hovered?.id || null

    if (nextHovered !== hoveredZone.value) {
        hoveredZone.value = nextHovered
        draw()
    }

    if (isPlacingMode.value || placingBase.value) {
        canvasRef.value.style.cursor = 'crosshair'
    } else if (hovered) {
        canvasRef.value.style.cursor = 'pointer'
    } else {
        canvasRef.value.style.cursor = 'grab'
    }
}

function handleCanvasMouseDown(e) {
    if (isPlacingMode.value || placingBase.value || !selectedMapId.value || !mapImage.value) return
    isPanning = true
    panStart = { x: e.clientX, y: e.clientY }
    if (canvasRef.value) canvasRef.value.style.cursor = 'grabbing'
}

function handleCanvasMouseUp() {
    isPanning = false
    if (!isPlacingMode.value && canvasRef.value) {
        canvasRef.value.style.cursor = 'grab'
    }
}

function handleWheel(e) {
    if (!selectedMapId.value || !mapImage.value || !canvasRef.value) return

    e.preventDefault()
    const rect = canvasRef.value.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    const newScale = Math.max(0.1, Math.min(10, scale.value * zoomFactor))

    panOffset.value = {
        x: mx - (mx - panOffset.value.x) * (newScale / scale.value),
        y: my - (my - panOffset.value.y) * (newScale / scale.value)
    }
    scale.value = newScale
    draw()
}

function zoomIn() {
    if (!mapImage.value) return
    scale.value = Math.min(10, scale.value * 1.25)
    draw()
}

function zoomOut() {
    if (!mapImage.value) return
    scale.value = Math.max(0.1, scale.value * 0.8)
    draw()
}

function resetView() {
    if (!mapImage.value) return
    fitMapToCanvas()
    draw()
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
    draw()
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
    draw()
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

let resizeObserver = null

onMounted(async () => {
    await refreshRobots()

    if (!selectedMuseumId.value && museumOptions.value.length > 0) {
        selectedMuseumId.value = museumOptions.value[0].id
    }

    // watch(selectedMuseumId) misses the initial value set by watch(museumOptions, { immediate: true })
    // because that watch fires during setup before watch(selectedMuseumId) is registered.
    // Explicitly load maps here if they haven't been fetched yet.
    if (selectedMuseumId.value && maps.value.length === 0) {
        await fetchMaps(selectedMuseumId.value)
    }

    resizeObserver = new ResizeObserver(() => {
        if (mapImage.value) {
            fitMapToCanvas()
            draw()
        }
    })

    if (containerRef.value) resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
    if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
    <div class="flex flex-col gap-4">
        <!-- Alerts -->
        <Alert v-if="error" variant="destructive">{{ error }}</Alert>
        <Alert v-if="success" variant="success">{{ success }}</Alert>

        <!-- Top Bar -->
        <Card>
            <CardContent class="p-3">
                <div class="flex flex-wrap items-center gap-3">
                    <!-- Museum selector -->
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

                    <!-- Divider -->
                    <div class="h-5 w-px bg-border hidden sm:block"></div>

                    <!-- Map selector -->
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

                    <!-- Spacer -->
                    <div class="flex-1"></div>

                    <!-- Robot count badge -->
                    <div v-if="selectedMapId" class="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                        <Bot class="w-3.5 h-3.5" />
                        {{ robotsAssignedToMap.length }} robot{{ robotsAssignedToMap.length !== 1 ? 's' : '' }}
                    </div>

                    <!-- Actions -->
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

        <!-- Capture from Robot Panel -->
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

        <!-- Upload Panel (collapsible) -->
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

        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-20">
            <div class="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!selectedMapId" class="flex flex-col items-center justify-center py-20 text-center">
            <MapPin class="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
            <p class="text-base font-medium text-muted-foreground">
                {{ maps.length === 0 && selectedMuseumId ? 'No hay mapas para este museo' : 'Selecciona un mapa para comenzar' }}
            </p>
            <p v-if="maps.length === 0 && selectedMuseumId" class="text-sm text-muted-foreground mt-1">
                Haz clic en <span class="font-medium text-foreground">Nuevo mapa</span> para subir uno.
            </p>
        </div>

        <!-- Map selected: optional base warning + workspace -->
        <div v-else class="flex flex-col gap-4">
        <!-- Mandatory base warning -->
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

        <!-- Main map workspace -->
        <div class="flex gap-4 flex-col xl:flex-row">
            <!-- Canvas card with floating controls -->
            <Card class="flex-1 overflow-hidden relative">
                <!-- Top-left: map name + zone count + add-zone button -->
                <div class="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-semibold bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-sm border border-border shadow-sm">
                        {{ mapData?.name }}
                    </span>
                    <span class="text-xs text-muted-foreground bg-background/90 backdrop-blur-sm px-2.5 py-1.5 rounded-sm border border-border shadow-sm">
                        {{ regularZones.length }} zona{{ regularZones.length !== 1 ? 's' : '' }}
                    </span>
                    <Button
                        @click="isPlacingMode = !isPlacingMode"
                        :variant="isPlacingMode ? 'default' : 'secondary'"
                        size="sm"
                        class="gap-1.5 h-8 shadow-sm backdrop-blur-sm"
                    >
                        <Crosshair class="w-3.5 h-3.5" />
                        {{ isPlacingMode ? 'Colocando...' : 'Añadir zona' }}
                    </Button>
                </div>

                <!-- Top-right: zoom controls -->
                <div class="absolute top-3 right-3 z-10 flex flex-col gap-1">
                    <Button @click="zoomIn" variant="secondary" size="icon" class="h-8 w-8 shadow-sm bg-background/90 backdrop-blur-sm">
                        <ZoomIn class="w-3.5 h-3.5" />
                    </Button>
                    <Button @click="zoomOut" variant="secondary" size="icon" class="h-8 w-8 shadow-sm bg-background/90 backdrop-blur-sm">
                        <ZoomOut class="w-3.5 h-3.5" />
                    </Button>
                    <Button @click="resetView" variant="secondary" size="icon" class="h-8 w-8 shadow-sm bg-background/90 backdrop-blur-sm" title="Centrar mapa">
                        <Move class="w-3.5 h-3.5" />
                    </Button>
                </div>

                <!-- Placing mode banner (centered top overlay) -->
                <div
                    v-if="isPlacingMode || placingBase"
                    class="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-sm shadow-sm text-sm font-medium whitespace-nowrap"
                    :class="placingBase ? 'bg-sky-500 text-white' : 'bg-primary text-primary-foreground'"
                >
                    <Crosshair class="w-4 h-4 animate-pulse shrink-0" />
                    {{ placingBase ? 'Haz clic para fijar el punto base' : 'Haz clic en el mapa para colocar una zona' }}
                    <button @click="cancelPlacement" class="ml-1 hover:opacity-70 shrink-0">
                        <X class="w-4 h-4" />
                    </button>
                </div>

                <!-- Canvas -->
                <div ref="containerRef" class="relative w-full" style="height: 560px;">
                    <canvas
                        ref="canvasRef"
                        class="absolute inset-0 w-full h-full"
                        @click="handleCanvasClick"
                        @mousemove="handleCanvasMouseMove"
                        @mousedown="handleCanvasMouseDown"
                        @mouseup="handleCanvasMouseUp"
                        @mouseleave="handleCanvasMouseUp"
                        @wheel="handleWheel"
                    ></canvas>
                </div>
            </Card>

            <!-- Right sidebar -->
            <div class="xl:w-72 shrink-0 flex flex-col gap-4">
                <!-- Zones list -->
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
                                @mouseenter="hoveredZone = zone.id; draw()"
                                @mouseleave="hoveredZone = null; draw()"
                                @click="editingZone = zone; editForm = { name: zone.name, description: zone.description || '', category: zone.category }; showEditForm = true"
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

                <!-- Base point (internal) -->
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
                            <Button @click="startPlacingBase" :variant="placingBase ? 'default' : 'outline'" size="sm" class="gap-1.5 flex-1">
                                <Home class="w-3.5 h-3.5" /> {{ baseZone ? 'Mover base' : 'Colocar base' }}
                            </Button>
                            <Button v-if="baseZone" @click="handleDeleteBase" variant="ghost" size="sm"
                                class="h-9 px-2 text-muted-foreground hover:text-destructive shrink-0" title="Eliminar base">
                                <Trash2 class="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <!-- Robot assignment -->
                <Card>
                    <CardHeader class="pb-2 pt-4 px-4">
                        <h4 class="text-sm font-semibold text-foreground">Robots asignados</h4>
                    </CardHeader>
                    <CardContent class="px-4 pb-4 space-y-3">
                        <!-- Assign -->
                        <div class="flex gap-2">
                            <select
                                v-model="selectedRobotToAssign"
                                :disabled="!baseZone"
                                class="flex h-9 flex-1 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                            >
                                <option value="">Selecciona un robot...</option>
                                <option v-for="robot in robotsAvailableForAssignment" :key="robot.id" :value="robot.id">
                                    {{ robot.name }}
                                </option>
                            </select>
                            <Button @click="assignRobotToMap" :disabled="!selectedRobotToAssign || !baseZone" size="sm" class="gap-1 shrink-0">
                                <Link class="w-4 h-4" />
                                Asignar
                            </Button>
                        </div>
                        <p v-if="!baseZone" class="text-xs text-amber-700 dark:text-amber-400">
                            Define el punto base para poder asignar robots.
                        </p>

                        <!-- Assigned robots list -->
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
                                    @click="unassignRobotFromMap(robot.id)"
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
        </div>
        </div>

        <!-- New zone modal -->
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

        <!-- Edit zone modal -->
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
