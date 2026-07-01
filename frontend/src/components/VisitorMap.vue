<script setup>
/**
 * @module components/VisitorMap
 * @description
 * Mapa interactivo que se muestra al **visitante** en el chat: dibuja el plano
 * del museo, las zonas navegables y la posición en vivo del robot, y permite
 * pedir que el robot le lleve a una zona (confirma la navegación con el
 * backend).
 *
 * **Props:** ninguna.
 *
 * **Eventos**
 * - `navigated` - Emitido cuando el visitante lanza una navegación a una zona.
 *
 * **Dependencias:** {@link module:services/chatService},
 * {@link module:constants/mapCategories}, `lucide-vue-next`.
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { chatService } from '@/services/chatService'
import { Navigation, Loader2, X } from 'lucide-vue-next'
import { categoryColor, categoryLabel } from '@/lib/mapCategories'

const emit = defineEmits(['navigated'])

const API_ROOT = (import.meta.env.VITE_API_URL || '').replace('/api', '')

// Acento terracota de marca para el marcador del robot en vivo - refleja el valor de
// --color-primary del tema oscuro. fillStyle/shadowColor del canvas necesitan un color
// literal (las custom properties de CSS no se resuelven en el contexto 2D), y el lienzo
// del mapa es siempre una superficie oscura independientemente del tema del sitio.
const ROBOT_COLOR = '#D9743E'

const canvasRef    = ref(null)
const containerRef = ref(null)
const loading      = ref(true)
const error        = ref(null)
const navigating   = ref(false)
const navError     = ref(null)

const mapData      = ref(null)
const zones        = ref([])
const mapImage     = ref(null)
const scale        = ref(1)
const panOffset    = ref({ x: 0, y: 0 })
const selectedZone = ref(null)

// Robot position in ROS world frame (meters). null = not yet received.
const robotPos     = ref(null)

// ── Pan / tap tracking ────────────────────────────────────────────────────────
let hasMoved       = false
let mouseDown      = false
let panStartX      = 0
let panStartY      = 0
let touchMoved     = false
let touchStartDist = null

// ── Coordinate helpers ────────────────────────────────────────────────────────
function worldToPixel(wx, wy) {
    const { resolution, origin_x, origin_y, height } = mapData.value
    return {
        x: (wx - origin_x) / resolution,
        y: height - (wy - origin_y) / resolution,
    }
}

function screenToImage(clientX, clientY) {
    const rect = canvasRef.value.getBoundingClientRect()
    return {
        x: ((clientX - rect.left) - panOffset.value.x) / scale.value,
        y: ((clientY - rect.top)  - panOffset.value.y) / scale.value,
    }
}

function findZoneAt(imgX, imgY) {
    const threshold = 14 / scale.value
    for (const z of zones.value) {
        if (z.map_x == null || z.map_y == null) continue
        const { x, y } = worldToPixel(z.map_x, z.map_y)
        if (Math.hypot(x - imgX, y - imgY) < threshold) return z
    }
    return null
}

// ── Canvas rendering ──────────────────────────────────────────────────────────
function draw() {
    const canvas    = canvasRef.value
    const container = containerRef.value
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')

    canvas.width  = container.clientWidth
    canvas.height = container.clientHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0f0f1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (!mapImage.value) return

    ctx.save()
    ctx.translate(panOffset.value.x, panOffset.value.y)
    ctx.scale(scale.value, scale.value)
    ctx.drawImage(mapImage.value, 0, 0)

    for (const zone of zones.value) {
        if (zone.map_x == null || zone.map_y == null) continue
        const { x, y }  = worldToPixel(zone.map_x, zone.map_y)
        const isSelected = selectedZone.value?.id === zone.id
        const color      = categoryColor(zone.category)
        const r          = isSelected ? 12 : 9

        // Glow ring
        ctx.beginPath()
        ctx.arc(x, y, r + 5, 0, Math.PI * 2)
        ctx.fillStyle = color + (isSelected ? '66' : '33')
        ctx.fill()

        // Main dot
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth   = 2 / scale.value
        ctx.stroke()

        // Burbuja de etiqueta (siempre visible)
        const label    = zone.name.length > 14 ? zone.name.slice(0, 14) + '…' : zone.name
        const fontSize = Math.max(8, 11 / scale.value)
        ctx.font       = `600 ${fontSize}px -apple-system, sans-serif`
        const tw  = ctx.measureText(label).width
        const bw  = tw + 8 / scale.value
        const bh  = (fontSize + 6) / scale.value
        const bx  = x - bw / 2
        const by  = y - r - bh - 4 / scale.value
        const br  = 4 / scale.value

        ctx.fillStyle = 'rgba(0,0,0,0.72)'
        ctx.beginPath()
        ctx.roundRect(bx, by, bw, bh, br)
        ctx.fill()

        ctx.fillStyle    = '#fff'
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, x, by + bh / 2)
    }

    // Posición del robot - flecha de navegación (distinta de los círculos de zona)
    if (robotPos.value && mapData.value) {
        const { x, y } = worldToPixel(robotPos.value.x, robotPos.value.y)
        // Negate theta: image Y is flipped relative to ROS frame
        const angle = -robotPos.value.theta
        const s     = 14 / scale.value   // arrow half-size

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle)

        // Shadow/glow
        ctx.shadowColor   = ROBOT_COLOR + '99'
        ctx.shadowBlur    = 8 / scale.value

        // Teardrop navigation arrow pointing up (rotated to match angle)
        // tip at (0, -s*1.4), base at ±(s*0.7, s*0.5), notch at (0, s*0.1)
        const tip   =  s * 1.4
        const bx    =  s * 0.7
        const by    =  s * 0.5
        const notch =  s * 0.15

        ctx.beginPath()
        ctx.moveTo(0, -tip)             // tip (front)
        ctx.lineTo( bx,  by)            // bottom-right
        ctx.lineTo( 0,   notch)         // centre notch
        ctx.lineTo(-bx,  by)            // bottom-left
        ctx.closePath()

        ctx.fillStyle = ROBOT_COLOR
        ctx.fill()

        ctx.shadowBlur  = 0
        ctx.strokeStyle = '#fff'
        ctx.lineWidth   = 2 / scale.value
        ctx.lineJoin    = 'round'
        ctx.stroke()

        ctx.restore()
    }

    ctx.restore()
}

function fitMapToCanvas() {
    if (!mapImage.value || !containerRef.value) return
    const cw = containerRef.value.clientWidth
    const ch = containerRef.value.clientHeight
    scale.value = Math.min(cw / mapImage.value.width, ch / mapImage.value.height) * 0.9
    panOffset.value = {
        x: (cw - mapImage.value.width  * scale.value) / 2,
        y: (ch - mapImage.value.height * scale.value) / 2,
    }
}

// ── Mouse events (desktop) ────────────────────────────────────────────────────
function onMouseDown(e) {
    hasMoved  = false
    mouseDown = true
    panStartX = e.clientX - panOffset.value.x
    panStartY = e.clientY - panOffset.value.y
}

function onMouseMove(e) {
    if (!mouseDown) return
    hasMoved = true
    panOffset.value = { x: e.clientX - panStartX, y: e.clientY - panStartY }
    draw()
}

function onMouseUp() {
    mouseDown = false
}

function onCanvasClick(e) {
    if (hasMoved) { hasMoved = false; return }
    const { x, y } = screenToImage(e.clientX, e.clientY)
    selectedZone.value = findZoneAt(x, y) || null
    navError.value = null
    draw()
}

function onWheel(e) {
    const factor = e.deltaY < 0 ? 1.12 : 0.9
    scale.value = Math.max(0.3, Math.min(10, scale.value * factor))
    draw()
}

// ── Touch events (mobile) ─────────────────────────────────────────────────────
function onTouchStart(e) {
    touchMoved = false
    if (e.touches.length === 1) {
        panStartX      = e.touches[0].clientX - panOffset.value.x
        panStartY      = e.touches[0].clientY - panOffset.value.y
        touchStartDist = null
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        touchStartDist = Math.hypot(dx, dy)
    }
}

function onTouchMove(e) {
    touchMoved = true
    if (e.touches.length === 1) {
        panOffset.value = {
            x: e.touches[0].clientX - panStartX,
            y: e.touches[0].clientY - panStartY,
        }
        draw()
    } else if (e.touches.length === 2 && touchStartDist) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX
        const dy   = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.hypot(dx, dy)
        scale.value    = Math.max(0.3, Math.min(10, scale.value * (dist / touchStartDist)))
        touchStartDist = dist
        draw()
    }
}

function onTouchEnd(e) {
    if (!touchMoved && e.changedTouches.length === 1) {
        const { x, y } = screenToImage(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
        selectedZone.value = findZoneAt(x, y) || null
        navError.value = null
        draw()
    }
    touchMoved = false
}

// ── Navigate to selected zone ─────────────────────────────────────────────────
async function navigateToZone() {
    if (!selectedZone.value || navigating.value) return
    navigating.value = true
    navError.value   = null
    const zone = selectedZone.value
    try {
        const data = await chatService.confirmNav(zone.id)
        selectedZone.value = null
        draw()
        emit('navigated', data.nav_message, zone.name, null, { place_id: zone.id, map_x: zone.map_x, map_y: zone.map_y })
    } catch (err) {
        navError.value = err.message || 'No pude iniciar la navegación.'
    } finally {
        navigating.value = false
    }
}

function dismissZone() {
    selectedZone.value = null
    navError.value     = null
    draw()
}

// ── Stream de posición del robot (SSE) ───────────────────────────────────────────────
// Sustituye el sondeo HTTP: el servidor envía la pose en vivo por una única conexión,
// así el overlay se mantiene en tiempo real sin golpear el limitador de tasa.
let positionSource = null

function startPositionStream() {
    if (positionSource) positionSource.close()

    const token = localStorage.getItem('artec_token')
    if (!token) return

    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    const url      = `${API_BASE}/robots/position-stream?token=${encodeURIComponent(token)}`

    positionSource = new EventSource(url)
    positionSource.addEventListener('position', (e) => {
        try {
            robotPos.value = JSON.parse(e.data)
            draw()
        } catch { /* ignore malformed event */ }
    })
    // EventSource se reconecta automáticamente ante errores - el overlay no es crítico.
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────────
let resizeObserver = null

onMounted(async () => {
    try {
        const data    = await chatService.getVisitorMap()
        mapData.value = data.map
        zones.value   = data.zones || []
        await nextTick()

        if (data.map?.image_path) {
            const img        = new Image()
            img.crossOrigin  = 'anonymous'
            img.onload       = () => { mapImage.value = img; fitMapToCanvas(); draw() }
            img.onerror      = () => { error.value = 'No se pudo cargar la imagen del mapa.' }
            img.src          = `${API_ROOT}${data.map.image_path}`
        }
    } catch (err) {
        error.value = err.message || 'No se pudo cargar el mapa.'
    } finally {
        loading.value = false
    }

    // Abre el stream de posición en vivo (el servidor envía la pose, sin polling)
    startPositionStream()

    resizeObserver = new ResizeObserver(() => { if (mapImage.value) { fitMapToCanvas(); draw() } })
    if (containerRef.value) resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
    if (positionSource)  positionSource.close()
    if (resizeObserver)  resizeObserver.disconnect()
})
</script>

<template>
    <div class="flex flex-col h-full bg-[#0f0f1a]">

        <!-- Cargando -->
        <div v-if="loading" class="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 class="w-8 h-8 animate-spin text-primary" />
            <p class="text-sm text-white/50">Cargando mapa...</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div class="w-14 h-14 rounded-full bg-red-900/30 flex items-center justify-center">
                <X class="w-7 h-7 text-red-400" />
            </div>
            <p class="text-white font-semibold">Sin mapa disponible</p>
            <p class="text-sm text-white/50">{{ error }}</p>
        </div>

        <!-- Map canvas -->
        <div v-else ref="containerRef" class="flex-1 relative overflow-hidden select-none" style="cursor: grab">
            <canvas
                ref="canvasRef"
                class="absolute inset-0 touch-none"
                @mousedown="onMouseDown"
                @mousemove="onMouseMove"
                @mouseup="onMouseUp"
                @mouseleave="onMouseUp"
                @click="onCanvasClick"
                @wheel.prevent="onWheel"
                @touchstart.passive="onTouchStart"
                @touchmove.prevent="onTouchMove"
                @touchend="onTouchEnd"
            />

            <!-- Pista cuando no hay ninguna zona seleccionada -->
            <div v-if="zones.length > 0 && !selectedZone"
                class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full pointer-events-none whitespace-nowrap">
                Toca una zona para navegar
            </div>

            <!-- No zones message -->
            <div v-if="zones.length === 0"
                class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p class="text-white/40 text-sm">Este mapa no tiene zonas configuradas.</p>
            </div>
        </div>

        <!-- Zone bottom sheet -->
        <Transition name="sheet">
            <div v-if="selectedZone"
                class="flex-shrink-0 bg-card rounded-t-3xl px-5 pt-4 pb-6 shadow-2xl border-t border-foreground/10">

                <!-- Tirador -->
                <div class="w-10 h-1 bg-foreground/20 rounded-full mx-auto mb-4" />

                <!-- Zone info -->
                <div class="flex items-start justify-between mb-2">
                    <h3 class="font-display text-lg font-medium tracking-tight text-foreground leading-tight pr-3">
                        {{ selectedZone.name }}
                    </h3>
                    <span class="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                        :style="{ backgroundColor: categoryColor(selectedZone.category) }">
                        {{ categoryLabel(selectedZone.category) }}
                    </span>
                </div>

                <p class="text-sm text-muted-foreground mb-4 leading-relaxed min-h-[1.25rem]">
                    {{ selectedZone.description || 'Sin descripción.' }}
                </p>

                <!-- Error de navegación -->
                <p v-if="navError" class="text-xs text-destructive mb-3 text-center">{{ navError }}</p>

                <!-- Actions -->
                <div class="flex gap-2.5">
                    <button
                        @click="navigateToZone"
                        :disabled="navigating"
                        class="flex-1 flex items-center justify-center gap-2 bg-primary active:bg-primary/80 text-primary-foreground text-[15px] font-semibold rounded-2xl py-3 transition-all active:scale-[0.97] disabled:opacity-60">
                        <Loader2 v-if="navigating" class="w-4 h-4 animate-spin" />
                        <Navigation v-else class="w-4 h-4" />
                        Ir aquí
                    </button>
                    <button
                        @click="dismissZone"
                        :disabled="navigating"
                        class="px-5 bg-muted text-foreground text-[15px] font-semibold rounded-2xl py-3 transition-all active:scale-[0.97] disabled:opacity-60">
                        Cancelar
                    </button>
                </div>
            </div>
        </Transition>

    </div>
</template>

<style scoped>
.sheet-enter-active {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}
.sheet-leave-active {
    transition: transform 0.2s ease, opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
    transform: translateY(100%);
    opacity: 0;
}
</style>
