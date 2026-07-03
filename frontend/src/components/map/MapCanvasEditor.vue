<script setup>
/**
 * @module components/map/MapCanvasEditor
 * @description
 * Lienzo editable del mapa. Dibuja la imagen y los marcadores de zona, gestiona
 * el desplazamiento (pan) y el zoom, y traduce los clics del ratón a coordenadas
 * del mundo (ROS/metros).
 *
 * Es un **componente controlado**: el padre posee los datos (`mapData`, `zones`)
 * y el estado de interacción (`isPlacingMode`, `placingBase`, `hoveredZone`,
 * `pendingZone`); aquí solo vive el estado de vista (escala, desplazamiento e
 * imagen cargada). Las acciones sobre datos se comunican por eventos.
 *
 * **Eventos:** `place-zone` (coords mundo al colocar una zona nueva),
 * `place-base` (coords mundo al fijar la base), `edit-zone` (zona pulsada),
 * `cancel-placement`, y los `update:*` de los v-model.
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BASE_CATEGORY, categoryColor } from '@/lib/mapCategories'
import { X, Move, ZoomIn, ZoomOut, Crosshair } from 'lucide-vue-next'

const props = defineProps({
    mapData: { type: Object, default: null },
    zones: { type: Array, default: () => [] },
    selectedMapId: { type: [String, Number], default: '' },
    pendingZone: { type: Object, default: null },
    hoveredZone: { type: [String, Number], default: null },
    isPlacingMode: { type: Boolean, default: false },
    placingBase: { type: Boolean, default: false },
})

const emit = defineEmits([
    'update:hoveredZone', 'update:isPlacingMode', 'update:placingBase',
    'place-zone', 'place-base', 'edit-zone', 'cancel-placement', 'image-error',
])

const API_ROOT = (import.meta.env.VITE_API_URL || '').replace('/api', '')

const canvasRef = ref(null)
const containerRef = ref(null)
const mapImage = ref(null)
const scale = ref(1)
const panOffset = ref({ x: 0, y: 0 })
let isPanning = false
let panStart = { x: 0, y: 0 }

// Zonas visibles en la lista (la base se gestiona aparte); solo para el contador.
const regularZonesCount = computed(() => props.zones.filter(z => z.category !== BASE_CATEGORY).length)

function loadMapImage() {
    if (!props.mapData?.image_path) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
        mapImage.value = img
        fitMapToCanvas()
        draw()
    }
    img.onerror = () => {
        emit('image-error', 'Error al cargar la imagen del mapa')
    }
    img.src = `${API_ROOT}${props.mapData.image_path}`
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

    for (const zone of props.zones) {
        if (zone.map_x == null || zone.map_y == null) continue
        drawMarker(ctx, zone, zone.id === props.hoveredZone)
    }

    if (props.pendingZone && props.mapData) {
        const { x: px, y: py } = worldToPixel(props.pendingZone.map_x, props.pendingZone.map_y)
        drawPendingMarker(ctx, px, py)
    }

    ctx.restore()
}

function drawMarker(ctx, zone, isHovered) {
    if (!props.mapData) return
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

// Convierte coords de píxel de imagen → coords del mundo de ROS (metros), acordes al marco de RViz
function pixelToWorld(px, py) {
    const { resolution, origin_x, origin_y, height } = props.mapData
    return {
        x: parseFloat((origin_x + px * resolution).toFixed(4)),
        y: parseFloat((origin_y + (height - py) * resolution).toFixed(4))
    }
}

// Convierte coords del mundo de ROS (metros) → coords de píxel de imagen para dibujar en el lienzo
function worldToPixel(wx, wy) {
    const { resolution, origin_x, origin_y, height } = props.mapData
    return {
        x: (wx - origin_x) / resolution,
        y: height - (wy - origin_y) / resolution
    }
}

function findZoneAtPosition(imgX, imgY) {
    const threshold = 12 / scale.value
    for (const zone of props.zones) {
        if (zone.map_x == null || zone.map_y == null) continue
        const { x, y } = worldToPixel(zone.map_x, zone.map_y)
        const dx = x - imgX
        const dy = y - imgY
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return zone
    }
    return null
}

function handleCanvasClick(e) {
    if (isPanning || !props.selectedMapId || !mapImage.value) return

    const { x, y } = screenToImage(e.clientX, e.clientY)

    if (props.placingBase) {
        const world = pixelToWorld(x, y)
        emit('update:placingBase', false)
        emit('place-base', world)
        return
    }

    if (props.isPlacingMode) {
        const world = pixelToWorld(x, y)
        emit('place-zone', { map_x: world.x, map_y: world.y })
        emit('update:isPlacingMode', false)
        return
    }

    const clicked = findZoneAtPosition(x, y)
    if (clicked) {
        // El punto base se edita con sus controles dedicados, no con el formulario de zona.
        if (clicked.category === BASE_CATEGORY) return
        emit('edit-zone', clicked)
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

    if (!props.selectedMapId || !mapImage.value) return

    const { x, y } = screenToImage(e.clientX, e.clientY)
    const hovered = findZoneAtPosition(x, y)
    const nextHovered = hovered?.id || null

    if (nextHovered !== props.hoveredZone) {
        emit('update:hoveredZone', nextHovered)
    }

    if (props.isPlacingMode || props.placingBase) {
        canvasRef.value.style.cursor = 'crosshair'
    } else if (hovered) {
        canvasRef.value.style.cursor = 'pointer'
    } else {
        canvasRef.value.style.cursor = 'grab'
    }
}

function handleCanvasMouseDown(e) {
    if (props.isPlacingMode || props.placingBase || !props.selectedMapId || !mapImage.value) return
    isPanning = true
    panStart = { x: e.clientX, y: e.clientY }
    if (canvasRef.value) canvasRef.value.style.cursor = 'grabbing'
}

function handleCanvasMouseUp() {
    isPanning = false
    if (!props.isPlacingMode && canvasRef.value) {
        canvasRef.value.style.cursor = 'grab'
    }
}

function handleWheel(e) {
    if (!props.selectedMapId || !mapImage.value || !canvasRef.value) return

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

// El padre cambia los datos/estado de interacción; aquí solo redibujamos.
watch(() => props.zones, () => draw(), { deep: true })
watch(() => props.hoveredZone, () => draw())
watch(() => props.pendingZone, () => draw(), { deep: true })
watch(() => props.mapData, (newVal) => {
    if (!newVal?.image_path) {
        mapImage.value = null
        draw()
        return
    }
    nextTick(() => loadMapImage())
})

let resizeObserver = null

onMounted(() => {
    resizeObserver = new ResizeObserver(() => {
        if (mapImage.value) {
            fitMapToCanvas()
            draw()
        }
    })
    if (containerRef.value) resizeObserver.observe(containerRef.value)

    if (props.mapData?.image_path) {
        loadMapImage()
    } else {
        draw()
    }
})

onUnmounted(() => {
    if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
    <!-- Tarjeta del lienzo con controles flotantes -->
    <Card class="flex-1 overflow-hidden relative">
        <!-- Arriba a la izquierda: nombre del mapa + nº de zonas + botón de añadir zona -->
        <div class="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-sm border border-border shadow-sm">
                {{ mapData?.name }}
            </span>
            <span class="text-xs text-muted-foreground bg-background/90 backdrop-blur-sm px-2.5 py-1.5 rounded-sm border border-border shadow-sm">
                {{ regularZonesCount }} zona{{ regularZonesCount !== 1 ? 's' : '' }}
            </span>
            <Button
                @click="emit('update:isPlacingMode', !isPlacingMode)"
                :variant="isPlacingMode ? 'default' : 'secondary'"
                size="sm"
                class="gap-1.5 h-8 shadow-sm backdrop-blur-sm"
            >
                <Crosshair class="w-3.5 h-3.5" />
                {{ isPlacingMode ? 'Colocando...' : 'Añadir zona' }}
            </Button>
        </div>

        <!-- Arriba a la derecha: controles de zoom -->
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

        <!-- Banner del modo de colocación (superpuesto arriba y centrado) -->
        <div
            v-if="isPlacingMode || placingBase"
            class="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-sm shadow-sm text-sm font-medium whitespace-nowrap"
            :class="placingBase ? 'bg-sky-500 text-white' : 'bg-primary text-primary-foreground'"
        >
            <Crosshair class="w-4 h-4 animate-pulse shrink-0" />
            {{ placingBase ? 'Haz clic para fijar el punto base' : 'Haz clic en el mapa para colocar una zona' }}
            <button @click="emit('cancel-placement')" class="ml-1 hover:opacity-70 shrink-0">
                <X class="w-4 h-4" />
            </button>
        </div>

        <!-- Lienzo -->
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
</template>
