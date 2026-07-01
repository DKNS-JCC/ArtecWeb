<script setup>
/**
 * @module components/RobotControlPanel
 * @description
 * Panel de control con **paridad RViz** para un robot. Funciones:
 *  - Visor de mapa (OccupancyGrid renderizado en `<canvas>`, recargable).
 *  - Superposición del escaneo láser sobre el lienzo del mapa.
 *  - Pose AMCL en vivo (flecha de orientación en el lienzo).
 *  - Envío de objetivo Nav2 haciendo clic en el mapa.
 *  - Teleoperación (D-pad + teclado WASD / flechas).
 *  - Cancelación de la navegación activa.
 *
 * **Props**
 * - `robot` `{Object}` *(requerido)* - Robot a controlar; su `position` se
 *   actualiza en tiempo real vía SSE.
 *
 * **Eventos**
 * - `refresh` - Solicita al contenedor refrescar el estado del robot.
 *
 * **Dependencias:** {@link module:services/robotService}, `lucide-vue-next`,
 * {@link module:components/ui/Button}.
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { robotService } from '@/services/robotService'
import { Button } from '@/components/ui/button'
import {
    Navigation, X, RotateCcw, ArrowUp, ArrowDown,
    ArrowLeft, ArrowRight, RotateCw, Wifi, Loader2, Home, MapPin, Radar
} from 'lucide-vue-next'

const props = defineProps({
    robot: { type: Object, required: true }
})

const emit = defineEmits(['refresh'])

// ── Mapa ──────────────────────────────────────────────────────────────────────

// Acento terracota de marca para la flecha de pose en vivo - refleja el valor de
// --color-primary del tema claro. fillStyle/strokeStyle del canvas necesitan un color
// literal (las custom properties de CSS no se resuelven en el contexto 2D), y el tono
// más oscuro se lee mejor sobre la paleta blanco/gris/negro del mapa de ocupación.
const ROBOT_COLOR = '#B0461E'

const mapCanvas  = ref(null)
const mapLoading = ref(false)
const mapError   = ref(null)
const mapData    = ref(null)   // { info: {...}, data: [...] } - se obtiene una vez, bajo demanda
const scanData   = ref(null)   // se obtiene una vez al abrir el panel, sin polling

// La pose llega gratis desde props.robot (actualizada en tiempo real vía SSE).
// No hace falta ninguna petición HTTP.
const pose = computed(() => props.robot.position ?? null)

// Modo de interacción: 'none' | 'nav-goal'
const mapMode    = ref('none')
const pendingClick = ref(null) // { x, y } en coordenadas del mapa

const loadMap = async () => {
    mapLoading.value = true
    mapError.value   = null
    try {
        mapData.value = await robotService.getMap(props.robot.id)
    } catch (e) {
        mapError.value = e.message || 'No se pudo obtener el mapa'
    } finally {
        mapLoading.value = false
    }
}

const loadScan = async () => {
    try { scanData.value = await robotService.getScan(props.robot.id) } catch (_) {}
}

// Refresca de una sola vez el mapa de ocupación y el escaneo láser (y con ello la
// lectura del obstáculo más cercano).
const refreshSensors = () => { loadMap(); loadScan(); }

// Redibuja cuando cambian los datos del mapa o la pose en vivo de SSE.
// El escaneo se superpone una sola vez (estático tras obtenerlo).
watch([mapData, pose, scanData], () => { nextTick(drawCanvas) })

const drawCanvas = () => {
    const canvas = mapCanvas.value
    if (!canvas || !mapData.value) return

    const { info, data } = mapData.value
    const { width, height, resolution, origin } = info

    canvas.width  = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(width, height)

    for (let i = 0; i < data.length; i++) {
        const v = data[i]
        // -1 = desconocido (gris), 0 = libre (blanco), 100 = ocupado (negro)
        let r, g, b
        if (v === -1)      { r = 127; g = 127; b = 127 }
        else if (v === 0)  { r = 255; g = 255; b = 255 }
        else               { r = 0;   g = 0;   b = 0   }

        const px = (height - 1 - Math.floor(i / width)) * width + (i % width)
        img.data[px * 4 + 0] = r
        img.data[px * 4 + 1] = g
        img.data[px * 4 + 2] = b
        img.data[px * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)

    // ── Superposición del escaneo láser (instantánea estática, sin polling) ─────────────────────
    if (scanData.value && pose.value) {
        const scan       = scanData.value
        const robotTheta = pose.value.theta ?? 0

        const toCanvas = (wx, wy) => ({
            cx: (wx - origin.position.x) / resolution,
            cy: height - (wy - origin.position.y) / resolution,
        })

        const robot2d = toCanvas(pose.value.x, pose.value.y)

        ctx.save()
        ctx.strokeStyle = 'rgba(255,80,80,0.5)'
        ctx.lineWidth   = 0.8

        const { angle_min, angle_increment, ranges, range_max } = scan
        ranges.forEach((r, idx) => {
            if (!isFinite(r) || r <= 0 || r > range_max) return
            const angle  = robotTheta + angle_min + idx * angle_increment
            const wx     = pose.value.x + r * Math.cos(angle)
            const wy     = pose.value.y + r * Math.sin(angle)
            const target = toCanvas(wx, wy)
            ctx.beginPath()
            ctx.moveTo(robot2d.cx, robot2d.cy)
            ctx.lineTo(target.cx, target.cy)
            ctx.stroke()
        })
        ctx.restore()
    }

    // ── Flecha de pose del robot (en vivo desde SSE vía props.robot.position) ─────────────
    if (pose.value) {
        const theta = pose.value.theta ?? 0
        const { info } = mapData.value
        const cx = (pose.value.x - info.origin.position.x) / info.resolution
        const cy = info.height - (pose.value.y - info.origin.position.y) / info.resolution

        const arrowLen = 12
        ctx.save()
        ctx.fillStyle   = ROBOT_COLOR
        ctx.strokeStyle = ROBOT_COLOR
        ctx.lineWidth   = 2
        ctx.beginPath()
        ctx.arc(cx, cy, 5, 0, 2 * Math.PI)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + arrowLen * Math.cos(theta), cy - arrowLen * Math.sin(theta))
        ctx.stroke()
        ctx.restore()
    }

    // ── Marcador de clic pendiente ──────────────────────────────────────────────────
    if (pendingClick.value) {
        const { info } = mapData.value
        const cx = (pendingClick.value.x - info.origin.position.x) / info.resolution
        const cy = info.height - (pendingClick.value.y - info.origin.position.y) / info.resolution
        ctx.save()
        ctx.strokeStyle = '#16a34a'
        ctx.lineWidth   = 2
        ctx.beginPath()
        ctx.arc(cx, cy, 8, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.restore()
    }
}

// ── Interacción con el mapa (nav-goal) ────────────────────────────────────────────────

const canvasToWorld = (e) => {
    const canvas  = mapCanvas.value
    const rect    = canvas.getBoundingClientRect()
    const scaleX  = canvas.width  / rect.width
    const scaleY  = canvas.height / rect.height
    const cx = (e.clientX - rect.left)  * scaleX
    const cy = (e.clientY - rect.top)   * scaleY
    const { info } = mapData.value
    const wx = cx * info.resolution + info.origin.position.x
    const wy = (info.height - cy) * info.resolution + info.origin.position.y
    return { wx, wy }
}

// Estado para el arrastre de orientación
const dragging     = ref(false)
const dragStart    = ref(null)  // { wx, wy }

const onCanvasMousedown = (e) => {
    if (!mapData.value || mapMode.value === 'none') return
    const { wx, wy } = canvasToWorld(e)
    pendingClick.value = { x: wx, y: wy }
    dragging.value     = true
    dragStart.value    = { wx, wy }
    nextTick(drawCanvas)
}

const onCanvasMouseup = async (e) => {
    if (!dragging.value || !pendingClick.value) return
    dragging.value = false

    const { wx, wy } = canvasToWorld(e)
    const dx = wx - dragStart.value.wx
    const dy = wy - dragStart.value.wy
    const theta = Math.atan2(dy, dx)
    const qz = Math.sin(theta / 2)
    const qw = Math.cos(theta / 2)

    try {
        if (mapMode.value === 'nav-goal') {
            await robotService.sendNavGoal(
                props.robot.id,
                pendingClick.value.x, pendingClick.value.y,
                qz, qw
            )
            navStatus.value = `Goal: (${pendingClick.value.x.toFixed(2)}, ${pendingClick.value.y.toFixed(2)})`
        }
    } catch (err) {
        navStatus.value = `Error: ${err.message}`
    } finally {
        pendingClick.value = null
        mapMode.value      = 'none'
        nextTick(drawCanvas)
    }
}

// ── Controles de navegación ───────────────────────────────────────────────────────

const navStatus   = ref(null)
const navLoading  = ref(false)

const cancelNav = async () => {
    navLoading.value = true
    navStatus.value  = null
    try {
        await robotService.cancelNavigation(props.robot.id)
        navStatus.value = 'Navegación cancelada'
        emit('refresh')
    } catch (e) {
        navStatus.value = `Error: ${e.message}`
    } finally {
        navLoading.value = false
    }
}

const baseLoading = ref(false)

const goToBase = async () => {
    baseLoading.value = true
    navStatus.value   = null
    try {
        const res = await robotService.goToBase(props.robot.id)
        navStatus.value = res.message || 'Enviando el robot a la base'
        emit('refresh')
    } catch (e) {
        navStatus.value = `Error: ${e.message}`
    } finally {
        baseLoading.value = false
    }
}

// ── Teleoperación ─────────────────────────────────────────────────────────────

const LINEAR_SPEED  = 0.3  // m/s
const ANGULAR_SPEED = 0.8  // rad/s

const pressedKeys = new Set()
let teleopInterval = null

const keyToVelocity = () => {
    let lx = 0, az = 0
    if (pressedKeys.has('ArrowUp')    || pressedKeys.has('w') || pressedKeys.has('W')) lx += LINEAR_SPEED
    if (pressedKeys.has('ArrowDown')  || pressedKeys.has('s') || pressedKeys.has('S')) lx -= LINEAR_SPEED
    if (pressedKeys.has('ArrowLeft')  || pressedKeys.has('a') || pressedKeys.has('A')) az += ANGULAR_SPEED
    if (pressedKeys.has('ArrowRight') || pressedKeys.has('d') || pressedKeys.has('D')) az -= ANGULAR_SPEED
    return { lx, az }
}

const sendTeleop = async (lx, az) => {
    if (!props.robot.connected) return
    try {
        await robotService.sendCommand(props.robot.id, 'move', { linearX: lx, angularZ: az })
    } catch (_) {}
}

const stopRobot = () => sendTeleop(0, 0)

const onKeydown = (e) => {
    const tracked = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','s','a','d','W','S','A','D']
    if (!tracked.includes(e.key)) return
    e.preventDefault()
    pressedKeys.add(e.key)

    if (!teleopInterval) {
        teleopInterval = setInterval(() => {
            const { lx, az } = keyToVelocity()
            sendTeleop(lx, az)
        }, 100)
    }
}

const onKeyup = (e) => {
    pressedKeys.delete(e.key)
    if (pressedKeys.size === 0 && teleopInterval) {
        clearInterval(teleopInterval)
        teleopInterval = null
        stopRobot()
    }
}

// Botones del D-pad
const dpadDown  = ref(null)  // { lx, az }
let dpadTimer   = null

const startDpad = (lx, az) => {
    dpadDown.value = { lx, az }
    sendTeleop(lx, az)
    dpadTimer = setInterval(() => sendTeleop(lx, az), 100)
}

const endDpad = () => {
    dpadDown.value = null
    if (dpadTimer) { clearInterval(dpadTimer); dpadTimer = null }
    stopRobot()
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────────
// Sin polling. La pose llega en vivo por SSE (props.robot). El mapa y el escaneo son HTTP de una sola vez.

onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('keyup',   onKeyup)
    if (props.robot.connected) {
        loadMap()
        loadScan()
    }
})

onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('keyup',   onKeyup)
    if (teleopInterval) clearInterval(teleopInterval)
    if (dpadTimer)      clearInterval(dpadTimer)
})

watch(() => props.robot.connected, (connected) => {
    if (connected) {
        loadMap()
        loadScan()
    } else {
        mapData.value  = null
        scanData.value = null
    }
})

// ── Helpers computados ──────────────────────────────────────────────────────────

const poseText = computed(() => {
    if (!pose.value) return null
    const theta = ((pose.value.theta ?? 0) * 180 / Math.PI).toFixed(1)
    return `x:${(pose.value.x ?? 0).toFixed(2)}  y:${(pose.value.y ?? 0).toFixed(2)}  θ:${theta}°`
})

const mapModeLabel = computed(() => ({
    'none':         'Modo: Observar',
    'nav-goal':     'Modo: Clic → Arrastrar para establecer objetivo',
}[mapMode.value]))

// Ubicación actual = waypoint más cercano a la pose en vivo (desde API/SSE).
const currentLocation = computed(() => props.robot.current_location?.name || null)

// Distancia al obstáculo más cercano del último escaneo LIDAR - la forma legible
// de "consultar el escaneo LIDAR". Toma la menor lectura de rango válida.
const nearestObstacle = computed(() => {
    const s = scanData.value
    if (!s || !Array.isArray(s.ranges)) return null
    const min = s.range_min ?? 0
    const max = s.range_max ?? Infinity
    let nearest = Infinity
    for (const r of s.ranges) {
        if (typeof r === 'number' && isFinite(r) && r >= min && r <= max && r < nearest) {
            nearest = r
        }
    }
    return isFinite(nearest) ? nearest : null
})
</script>

<template>
    <div class="grid gap-6 lg:grid-cols-3">

        <!-- ── Sección del mapa ─────────────────────────────────────────────────── -->
        <div class="lg:col-span-2 space-y-2">
            <div class="flex flex-wrap gap-2 items-center justify-between">
                <span class="text-sm font-semibold text-foreground">Mapa en Vivo</span>
                <div class="flex gap-1.5 flex-wrap">
                    <!-- Conmutadores de modo -->
                    <Button size="sm" variant="outline" @click="refreshSensors" :disabled="!robot.connected || mapLoading" class="h-7 px-2 text-xs gap-1">
                        <Loader2 v-if="mapLoading" class="w-3 h-3 animate-spin" />
                        <RotateCcw v-else class="w-3 h-3" />
                        Refrescar
                    </Button>
                    <Button size="sm"
                        :variant="mapMode === 'nav-goal' ? 'default' : 'outline'"
                        @click="mapMode = mapMode === 'nav-goal' ? 'none' : 'nav-goal'"
                        :disabled="!robot.connected || !mapData"
                        class="h-7 px-2 text-xs gap-1">
                        <Navigation class="w-3 h-3" /> Ir a Objetivo
                    </Button>
                    <Button size="sm" variant="destructive"
                        @click="cancelNav"
                        :disabled="!robot.connected || navLoading"
                        class="h-7 px-2 text-xs gap-1">
                        <X class="w-3 h-3" /> Cancelar Nav
                    </Button>
                    <Button size="sm" variant="outline"
                        @click="goToBase"
                        :disabled="!robot.connected || baseLoading"
                        class="h-7 px-2 text-xs gap-1">
                        <Loader2 v-if="baseLoading" class="w-3 h-3 animate-spin" />
                        <Home v-else class="w-3 h-3" /> Ir a Base
                    </Button>
                </div>
            </div>

            <!-- Ubicación actual (waypoint más cercano) -->
            <p v-if="currentLocation" class="text-xs flex items-center gap-1 text-muted-foreground">
                <MapPin class="w-3 h-3 text-primary shrink-0" />
                Ubicación actual: <span class="font-medium text-foreground">{{ currentLocation }}</span>
            </p>

            <!-- Pista del modo -->
            <p v-if="mapMode !== 'none'" class="text-xs px-2 py-1 rounded-sm bg-green-500/10 text-green-700 dark:text-green-400">
                {{ mapModeLabel }}
            </p>

            <!-- Barra de estado / error -->
            <p v-if="navStatus" class="text-xs text-muted-foreground font-mono">{{ navStatus }}</p>
            <p v-if="mapError"  class="text-xs text-destructive">{{ mapError }}</p>

            <!-- Lectura de la pose AMCL -->
            <p v-if="poseText" class="text-xs font-mono text-muted-foreground">
                AMCL → {{ poseText }}
            </p>

            <!-- Obstáculo más cercano del escaneo LIDAR -->
            <p v-if="nearestObstacle !== null" class="text-xs flex items-center gap-1 text-muted-foreground">
                <Radar class="w-3 h-3 text-primary shrink-0" />
                Obstáculo más próximo (LIDAR): <span class="font-medium text-foreground">{{ nearestObstacle.toFixed(2) }} m</span>
            </p>

            <!-- Lienzo -->
            <div class="relative border border-border rounded-md overflow-hidden bg-muted/30"
                :class="mapMode === 'nav-goal' ? 'cursor-crosshair ring-2 ring-green-500' : 'cursor-default'">

                <div v-if="mapLoading" class="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                    <Loader2 class="w-6 h-6 animate-spin text-primary" />
                </div>

                <div v-if="!mapData && !mapLoading" class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                    <Wifi class="w-5 h-5" />
                    <span>{{ robot.connected ? 'Cargando mapa…' : 'Conecta el robot para ver el mapa' }}</span>
                </div>

                <!-- block + w-full + h-auto mantiene la imagen renderizada exactamente
                     proporcional a los píxeles del canvas, así el mapeo clic→mundo de
                     canvasToWorld() es preciso. (object-contain/max-h la dejaba con bandas
                     y rompía la colocación del objetivo.) pixelated mantiene la rejilla
                     nítida al ampliarla. -->
                <canvas
                    v-show="mapData"
                    ref="mapCanvas"
                    class="block w-full h-auto [image-rendering:pixelated]"
                    @mousedown="onCanvasMousedown"
                    @mouseup="onCanvasMouseup"
                />
            </div>
        </div>

        <!-- ── Teleoperación ───────────────────────────────────────────────── -->
        <div class="lg:col-span-1 space-y-2">
            <span class="text-sm font-semibold text-foreground">Teleoperación</span>
            <p class="text-xs text-muted-foreground">Usa las teclas WASD / ↑↓←→ o el D-pad.</p>

            <div class="flex justify-center">
                <div class="grid grid-cols-3 gap-1.5 w-36">
                    <!-- Fila 1 -->
                    <div></div>
                    <Button size="icon"
                        class="w-10 h-10 select-none"
                        :variant="dpadDown?.lx > 0 ? 'default' : 'outline'"
                        :disabled="!robot.connected"
                        @mousedown="startDpad(LINEAR_SPEED, 0)"
                        @mouseup="endDpad"
                        @mouseleave="endDpad"
                        @touchstart.prevent="startDpad(LINEAR_SPEED, 0)"
                        @touchend.prevent="endDpad">
                        <ArrowUp class="w-4 h-4" />
                    </Button>
                    <div></div>

                    <!-- Fila 2 -->
                    <Button size="icon"
                        class="w-10 h-10 select-none"
                        :variant="dpadDown?.az > 0 ? 'default' : 'outline'"
                        :disabled="!robot.connected"
                        @mousedown="startDpad(0, ANGULAR_SPEED)"
                        @mouseup="endDpad"
                        @mouseleave="endDpad"
                        @touchstart.prevent="startDpad(0, ANGULAR_SPEED)"
                        @touchend.prevent="endDpad">
                        <RotateCcw class="w-4 h-4" />
                    </Button>
                    <Button size="icon"
                        class="w-10 h-10 select-none"
                        variant="destructive"
                        :disabled="!robot.connected"
                        @click="stopRobot">
                        <X class="w-4 h-4" />
                    </Button>
                    <Button size="icon"
                        class="w-10 h-10 select-none"
                        :variant="dpadDown?.az < 0 ? 'default' : 'outline'"
                        :disabled="!robot.connected"
                        @mousedown="startDpad(0, -ANGULAR_SPEED)"
                        @mouseup="endDpad"
                        @mouseleave="endDpad"
                        @touchstart.prevent="startDpad(0, -ANGULAR_SPEED)"
                        @touchend.prevent="endDpad">
                        <RotateCw class="w-4 h-4" />
                    </Button>

                    <!-- Fila 3 -->
                    <div></div>
                    <Button size="icon"
                        class="w-10 h-10 select-none"
                        :variant="dpadDown?.lx < 0 ? 'default' : 'outline'"
                        :disabled="!robot.connected"
                        @mousedown="startDpad(-LINEAR_SPEED, 0)"
                        @mouseup="endDpad"
                        @mouseleave="endDpad"
                        @touchstart.prevent="startDpad(-LINEAR_SPEED, 0)"
                        @touchend.prevent="endDpad">
                        <ArrowDown class="w-4 h-4" />
                    </Button>
                    <div></div>
                </div>
            </div>
        </div>
    </div>
</template>
