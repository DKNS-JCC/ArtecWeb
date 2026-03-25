<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { mapService } from '@/services/mapService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Upload, Trash2, Plus, MapPin, X, Move, ZoomIn, ZoomOut, Crosshair, Pencil } from 'lucide-vue-next'

const authStore = useAuthStore()

const props = defineProps({
    robots: {
        type: Array,
        default: () => []
    }
})

const selectedRobotId = ref('')

watch(() => props.robots, (newVal) => {
    if (newVal.length > 0 && !selectedRobotId.value) {
        selectedRobotId.value = newVal[0].id
    }
}, { immediate: true })

watch(selectedRobotId, (newVal) => {
    if (newVal) {
        fetchData()
    } else {
        mapData.value = null
        places.value = []
    }
})

const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace('/api', '')

// ─── STATE ───────────────────────────────────────────────────
const mapData = ref(null)
const places = ref([])
const loading = ref(true)
const error = ref(null)
const success = ref(null)

// Map viewer state
const canvasRef = ref(null)
const containerRef = ref(null)
const mapImage = ref(null)
const scale = ref(1)
const panOffset = ref({ x: 0, y: 0 })
let isPanning = false
let panStart = { x: 0, y: 0 }

// Zone delimiter mode
const isPlacingMode = ref(false)
const pendingPlace = ref(null) // { map_x, map_y } — waiting for name input
const showPlaceForm = ref(false)
const placeForm = ref({ name: '', description: '', category: 'exhibit' })

// Edit state
const editingPlace = ref(null)
const showEditForm = ref(false)
const editForm = ref({ name: '', description: '', category: 'exhibit' })

// Hover state for markers
const hoveredPlace = ref(null)

const CATEGORIES = [
    { value: 'exhibit', label: 'Exhibición' },
    { value: 'service', label: 'Servicio' },
    { value: 'entrance', label: 'Entrada' },
    { value: 'exit', label: 'Salida' },
    { value: 'restroom', label: 'Baños' },
    { value: 'other', label: 'Otro' },
]

const CATEGORY_COLORS = {
    exhibit: '#3b82f6',
    service: '#f59e0b',
    entrance: '#22c55e',
    exit: '#ef4444',
    restroom: '#8b5cf6',
    other: '#6b7280',
}

// ─── DATA FETCHING ───────────────────────────────────────────
async function fetchData() {
    if (!selectedRobotId.value) return
    loading.value = true
    error.value = null
    try {
        const [mapResult, placesResult] = await Promise.allSettled([
            mapService.getMap(selectedRobotId.value),
            mapService.getPlaces(selectedRobotId.value)
        ])
        if (mapResult.status === 'fulfilled') {
            mapData.value = mapResult.value
        } else {
             mapData.value = null
        }
        if (placesResult.status === 'fulfilled') {
            places.value = placesResult.value
        } else {
             places.value = []
        }
    } catch (err) {
        error.value = err.message
    } finally {
        loading.value = false
        await nextTick()
        if (mapData.value) loadMapImage()
    }
}

// ─── MAP IMAGE LOADING ──────────────────────────────────────
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

// ─── CANVAS RENDERING ───────────────────────────────────────
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
    if (!canvas || !mapImage.value) return
    const ctx = canvas.getContext('2d')
    const container = containerRef.value
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw checkerboard background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(panOffset.value.x, panOffset.value.y)
    ctx.scale(scale.value, scale.value)

    // Draw map image
    ctx.drawImage(mapImage.value, 0, 0)

    // Draw place markers
    for (const place of places.value) {
        if (place.map_x == null || place.map_y == null) continue
        drawMarker(ctx, place, place.id === hoveredPlace.value)
    }

    // Draw pending placement marker
    if (pendingPlace.value) {
        drawPendingMarker(ctx, pendingPlace.value.map_x, pendingPlace.value.map_y)
    }

    ctx.restore()
}

function drawMarker(ctx, place, isHovered) {
    const x = place.map_x
    const y = place.map_y
    const color = CATEGORY_COLORS[place.category] || CATEGORY_COLORS.other
    const r = isHovered ? 10 : 7

    // Outer glow
    ctx.beginPath()
    ctx.arc(x, y, r + 4, 0, Math.PI * 2)
    ctx.fillStyle = color + '33'
    ctx.fill()

    // Main circle
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    // Inner dot
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()

    // Label
    if (isHovered) {
        const label = place.name
        ctx.font = 'bold 12px -apple-system, sans-serif'
        const metrics = ctx.measureText(label)
        const lw = metrics.width + 12
        const lh = 22
        const lx = x - lw / 2
        const ly = y - r - lh - 6

        // Label background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.beginPath()
        ctx.roundRect(lx, ly, lw, lh, 4)
        ctx.fill()

        // Label text
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, x, ly + lh / 2)
    }
}

function drawPendingMarker(ctx, x, y) {
    // Pulsing ring
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.strokeStyle = '#22c55e88'
    ctx.lineWidth = 3
    ctx.stroke()

    // Main marker
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#22c55e'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    // Cross
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 4, y)
    ctx.lineTo(x + 4, y)
    ctx.moveTo(x, y - 4)
    ctx.lineTo(x, y + 4)
    ctx.stroke()
}

// ─── CANVAS INTERACTION ─────────────────────────────────────
function screenToImage(clientX, clientY) {
    const rect = canvasRef.value.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return {
        x: (sx - panOffset.value.x) / scale.value,
        y: (sy - panOffset.value.y) / scale.value
    }
}

function findPlaceAtPosition(imgX, imgY) {
    const threshold = 12 / scale.value
    for (const place of places.value) {
        if (place.map_x == null || place.map_y == null) continue
        const dx = place.map_x - imgX
        const dy = place.map_y - imgY
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return place
    }
    return null
}

function handleCanvasClick(e) {
    if (isPanning) return
    const { x, y } = screenToImage(e.clientX, e.clientY)

    if (isPlacingMode.value) {
        // Place a new marker
        pendingPlace.value = { map_x: Math.round(x), map_y: Math.round(y) }
        placeForm.value = { name: '', description: '', category: 'exhibit' }
        showPlaceForm.value = true
        isPlacingMode.value = false
        draw()
        return
    }

    // Check if clicking on existing marker
    const clicked = findPlaceAtPosition(x, y)
    if (clicked) {
        editingPlace.value = clicked
        editForm.value = { name: clicked.name, description: clicked.description || '', category: clicked.category }
        showEditForm.value = true
    }
}

function handleCanvasMouseMove(e) {
    if (isPanning) {
        panOffset.value = {
            x: panOffset.value.x + (e.clientX - panStart.x),
            y: panOffset.value.y + (e.clientY - panStart.y)
        }
        panStart = { x: e.clientX, y: e.clientY }
        draw()
        return
    }

    const { x, y } = screenToImage(e.clientX, e.clientY)
    const hovered = findPlaceAtPosition(x, y)
    const newHovered = hovered?.id || null
    if (newHovered !== hoveredPlace.value) {
        hoveredPlace.value = newHovered
        draw()
    }

    // Cursor feedback
    if (isPlacingMode.value) {
        canvasRef.value.style.cursor = 'crosshair'
    } else if (hovered) {
        canvasRef.value.style.cursor = 'pointer'
    } else {
        canvasRef.value.style.cursor = 'grab'
    }
}

function handleCanvasMouseDown(e) {
    if (isPlacingMode.value) return
    isPanning = true
    panStart = { x: e.clientX, y: e.clientY }
    canvasRef.value.style.cursor = 'grabbing'
}

function handleCanvasMouseUp() {
    isPanning = false
    if (!isPlacingMode.value) {
        canvasRef.value.style.cursor = 'grab'
    }
}

function handleWheel(e) {
    e.preventDefault()
    const rect = canvasRef.value.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    const newScale = Math.max(0.1, Math.min(10, scale.value * zoomFactor))

    // Zoom towards mouse position
    panOffset.value = {
        x: mx - (mx - panOffset.value.x) * (newScale / scale.value),
        y: my - (my - panOffset.value.y) * (newScale / scale.value)
    }
    scale.value = newScale
    draw()
}

function zoomIn() {
    scale.value = Math.min(10, scale.value * 1.25)
    draw()
}

function zoomOut() {
    scale.value = Math.max(0.1, scale.value * 0.8)
    draw()
}

function resetView() {
    fitMapToCanvas()
    draw()
}

// ─── MAP UPLOAD ─────────────────────────────────────────────
const fileInput = ref(null)
const yamlInput = ref(null)
const uploading = ref(false)

async function handleUpload() {
    const imageFile = fileInput.value?.files?.[0]
    if (!imageFile) {
        error.value = 'Selecciona una imagen del mapa'
        return
    }

    uploading.value = true
    error.value = null
    try {
        const formData = new FormData()
        formData.append('image', imageFile)

        const yamlFile = yamlInput.value?.files?.[0]
        if (yamlFile) formData.append('yaml', yamlFile)

        await mapService.uploadMap(selectedRobotId.value, formData)
        success.value = 'Mapa subido correctamente'
        fileInput.value.value = ''
        if (yamlInput.value) yamlInput.value.value = ''
        await fetchData()
        setTimeout(() => success.value = null, 3000)
    } catch (err) {
        error.value = err.message
    } finally {
        uploading.value = false
    }
}

async function handleDeleteMap() {
    if (!confirm('¿Eliminar el mapa? Los lugares no se eliminarán.')) return
    try {
        await mapService.deleteMap(selectedRobotId.value)
        mapData.value = null
        mapImage.value = null
        success.value = 'Mapa eliminado'
        setTimeout(() => success.value = null, 3000)
    } catch (err) {
        error.value = err.message
    }
}

// ─── PLACE CRUD ─────────────────────────────────────────────
async function handleCreatePlace() {
    if (!placeForm.value.name.trim()) {
        error.value = 'El nombre es obligatorio'
        return
    }
    error.value = null
    try {
        await mapService.createPlace(selectedRobotId.value, {
            name: placeForm.value.name,
            description: placeForm.value.description,
            category: placeForm.value.category,
            map_x: pendingPlace.value.map_x,
            map_y: pendingPlace.value.map_y,
        })
        pendingPlace.value = null
        showPlaceForm.value = false
        await refreshPlaces()
        success.value = 'Zona creada correctamente'
        setTimeout(() => success.value = null, 3000)
    } catch (err) {
        error.value = err.message
    }
}

async function handleUpdatePlace() {
    if (!editForm.value.name.trim()) return
    error.value = null
    try {
        await mapService.updatePlace(selectedRobotId.value, editingPlace.value.id, {
            name: editForm.value.name,
            description: editForm.value.description,
            category: editForm.value.category,
        })
        showEditForm.value = false
        editingPlace.value = null
        await refreshPlaces()
        success.value = 'Zona actualizada'
        setTimeout(() => success.value = null, 3000)
    } catch (err) {
        error.value = err.message
    }
}

async function handleDeletePlace(id) {
    if (!confirm('¿Eliminar esta zona?')) return
    try {
        await mapService.deletePlace(selectedRobotId.value, id)
        showEditForm.value = false
        editingPlace.value = null
        await refreshPlaces()
    } catch (err) {
        error.value = err.message
    }
}

async function refreshPlaces() {
    places.value = await mapService.getPlaces(selectedRobotId.value)
    draw()
}

function cancelPlacement() {
    pendingPlace.value = null
    showPlaceForm.value = false
    isPlacingMode.value = false
    draw()
}

// ─── RESIZE HANDLING ────────────────────────────────────────
let resizeObserver = null

onMounted(() => {
    fetchData()
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

watch(places, () => draw(), { deep: true })
</script>

<template>
    <div class="space-y-6">
        <!-- Alerts -->
        <Alert v-if="error" variant="destructive" class="mb-4">{{ error }}</Alert>
        <Alert v-if="success" variant="success" class="mb-4">{{ success }}</Alert>

        <Card>
            <CardContent class="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h3 class="font-semibold text-foreground">Seleccionar Robot</h3>
                    <p class="text-sm text-muted-foreground mr-2">Elige el robot para gestionar su mapa</p>
                </div>
                <div class="w-full md:w-64 shrink-0">
                    <select v-model="selectedRobotId" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <option value="" disabled>Selecciona un robot...</option>
                        <option v-for="robot in robots" :key="robot.id" :value="robot.id">
                            {{ robot.name }}
                        </option>
                    </select>
                </div>
            </CardContent>
        </Card>

        <!-- No map uploaded yet -->
        <Card v-if="!loading && !mapData && selectedRobotId">
            <CardHeader>
                <h3 class="text-lg font-semibold text-foreground">Subir mapa del museo</h3>
                <p class="text-sm text-muted-foreground mt-1">
                    Sube la imagen del mapa generado por SLAM (PNG/JPG/PGM) y opcionalmente el archivo YAML con los metadatos de calibración.
                </p>
            </CardHeader>
            <CardContent>
                <div class="space-y-4">
                    <div>
                        <Label>Imagen del mapa *</Label>
                        <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.pgm"
                            class="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer" />
                    </div>
                    <div>
                        <Label>Archivo YAML de calibración (opcional)</Label>
                        <input ref="yamlInput" type="file" accept=".yaml,.yml"
                            class="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer" />
                        <p class="text-xs text-muted-foreground mt-1">
                            Generado por <code class="bg-muted px-1 rounded">map_saver</code>. Contiene resolución y origen del mapa.
                        </p>
                    </div>
                    <Button @click="handleUpload" :disabled="uploading" class="gap-2">
                        <Upload class="w-4 h-4" />
                        {{ uploading ? 'Subiendo...' : 'Subir mapa' }}
                    </Button>
                </div>
            </CardContent>
        </Card>

        <!-- Map viewer + zone tool -->
        <div v-if="!loading && mapData" class="space-y-4">
            <!-- Toolbar -->
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <h3 class="text-lg font-semibold text-foreground">Mapa y Zonas</h3>
                    <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {{ places.length }} zona{{ places.length !== 1 ? 's' : '' }}
                    </span>
                </div>
                <div class="flex items-center gap-2">
                    <Button @click="isPlacingMode = !isPlacingMode" :variant="isPlacingMode ? 'default' : 'outline'" size="sm" class="gap-1.5">
                        <Crosshair class="w-4 h-4" />
                        {{ isPlacingMode ? 'Colocando...' : 'Añadir zona' }}
                    </Button>
                    <Button @click="zoomIn" variant="outline" size="icon" class="h-9 w-9">
                        <ZoomIn class="w-4 h-4" />
                    </Button>
                    <Button @click="zoomOut" variant="outline" size="icon" class="h-9 w-9">
                        <ZoomOut class="w-4 h-4" />
                    </Button>
                    <Button @click="resetView" variant="outline" size="icon" class="h-9 w-9" title="Centrar mapa">
                        <Move class="w-4 h-4" />
                    </Button>
                    <Button @click="handleDeleteMap" variant="ghost" size="icon" class="h-9 w-9 text-destructive hover:text-destructive" title="Eliminar mapa">
                        <Trash2 class="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <!-- Placement mode banner -->
            <div v-if="isPlacingMode"
                class="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary">
                <Crosshair class="w-5 h-5 flex-shrink-0 animate-pulse" />
                <span class="font-medium">Haz clic en el mapa para colocar una nueva zona</span>
                <button @click="cancelPlacement" class="ml-auto hover:opacity-70">
                    <X class="w-4 h-4" />
                </button>
            </div>

            <!-- Map canvas + side panel -->
            <div class="flex gap-4 flex-col lg:flex-row">
                <!-- Canvas -->
                <Card class="flex-1 overflow-hidden">
                    <div ref="containerRef" class="relative w-full" style="height: 500px;">
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

                <!-- Side panel: zone list -->
                <Card class="lg:w-72 flex-shrink-0">
                    <CardHeader class="pb-3">
                        <h4 class="text-sm font-semibold text-foreground">Zonas registradas</h4>
                    </CardHeader>
                    <CardContent class="p-0">
                        <div v-if="places.length === 0" class="px-6 pb-6 text-center">
                            <MapPin class="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                            <p class="text-sm text-muted-foreground">No hay zonas aún. Usa el botón "Añadir zona" para crear una.</p>
                        </div>
                        <div v-else class="max-h-[400px] overflow-y-auto divide-y divide-border">
                            <div v-for="place in places" :key="place.id"
                                class="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer group"
                                @mouseenter="hoveredPlace = place.id; draw()"
                                @mouseleave="hoveredPlace = null; draw()"
                                @click="editingPlace = place; editForm = { name: place.name, description: place.description || '', category: place.category }; showEditForm = true">
                                <div class="w-3 h-3 rounded-full flex-shrink-0"
                                    :style="{ backgroundColor: CATEGORY_COLORS[place.category] || CATEGORY_COLORS.other }">
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm font-medium text-foreground truncate">{{ place.name }}</p>
                                    <p class="text-xs text-muted-foreground capitalize">{{ CATEGORIES.find(c => c.value === place.category)?.label || place.category }}</p>
                                </div>
                                <Pencil class="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <!-- Upload replacement -->
            <details class="text-sm">
                <summary class="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">Reemplazar mapa</summary>
                <div class="mt-3 flex items-end gap-3">
                    <div class="flex-1">
                        <Label>Nueva imagen</Label>
                        <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.pgm"
                            class="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer" />
                    </div>
                    <div class="flex-1">
                        <Label>YAML (opcional)</Label>
                        <input ref="yamlInput" type="file" accept=".yaml,.yml"
                            class="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer" />
                    </div>
                    <Button @click="handleUpload" :disabled="uploading" size="sm" class="gap-1.5 flex-shrink-0">
                        <Upload class="w-4 h-4" />
                        {{ uploading ? 'Subiendo...' : 'Subir' }}
                    </Button>
                </div>
            </details>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-16">
            <div class="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
        </div>

        <!-- ─── CREATE PLACE MODAL ─────────────────────────── -->
        <Teleport to="body">
            <div v-if="showPlaceForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="cancelPlacement">
                <div class="bg-background border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">Nueva zona</h3>
                        <button @click="cancelPlacement" class="text-muted-foreground hover:text-foreground">
                            <X class="w-5 h-5" />
                        </button>
                    </div>

                    <div class="text-xs text-muted-foreground bg-muted rounded-lg p-2">
                        Posición en mapa: ({{ pendingPlace?.map_x }}, {{ pendingPlace?.map_y }})
                    </div>

                    <div class="space-y-3">
                        <div>
                            <Label>Nombre *</Label>
                            <Input v-model="placeForm.name" placeholder="Ej: Sala de Dinosaurios" class="mt-1" autofocus />
                        </div>
                        <div>
                            <Label>Descripción</Label>
                            <Input v-model="placeForm.description" placeholder="Breve descripción" class="mt-1" />
                        </div>
                        <div>
                            <Label>Categoría</Label>
                            <select v-model="placeForm.category"
                                class="mt-1 w-full h-11 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                                <option v-for="cat in CATEGORIES" :key="cat.value" :value="cat.value">
                                    {{ cat.label }}
                                </option>
                            </select>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-2">
                        <Button @click="cancelPlacement" variant="outline">Cancelar</Button>
                        <Button @click="handleCreatePlace" :disabled="!placeForm.name.trim()" class="gap-1.5">
                            <Plus class="w-4 h-4" /> Crear zona
                        </Button>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- ─── EDIT PLACE MODAL ───────────────────────────── -->
        <Teleport to="body">
            <div v-if="showEditForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showEditForm = false">
                <div class="bg-background border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">Editar zona</h3>
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
                            <select v-model="editForm.category"
                                class="mt-1 w-full h-11 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                                <option v-for="cat in CATEGORIES" :key="cat.value" :value="cat.value">
                                    {{ cat.label }}
                                </option>
                            </select>
                        </div>
                    </div>

                    <div class="flex justify-between pt-2">
                        <Button @click="handleDeletePlace(editingPlace.id)" variant="destructive" size="sm" class="gap-1.5">
                            <Trash2 class="w-4 h-4" /> Eliminar
                        </Button>
                        <div class="flex gap-2">
                            <Button @click="showEditForm = false" variant="outline">Cancelar</Button>
                            <Button @click="handleUpdatePlace" :disabled="!editForm.name.trim()">Guardar</Button>
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
