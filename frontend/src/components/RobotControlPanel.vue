<script setup>
/**
 * RobotControlPanel — full RViz-parity control panel for a single robot.
 *
 * Features:
 *  • Map viewer (OccupancyGrid rendered on <canvas>, refreshable)
 *  • Laser-scan overlay on the map canvas
 *  • Live AMCL pose (heading arrow on canvas)
 *  • Send Nav2 goal by clicking on the map
 *  • Set AMCL initial pose with a dedicated mode
 *  • Teleoperation (D-pad + keyboard WASD / arrow keys)
 *  • Cancel active navigation
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { robotService } from '@/services/robotService'
import { Button } from '@/components/ui/button'
import {
    Navigation, Crosshair, X, RotateCcw, ArrowUp, ArrowDown,
    ArrowLeft, ArrowRight, RotateCw, Wifi, Loader2
} from 'lucide-vue-next'

const props = defineProps({
    robot: { type: Object, required: true }
})

const emit = defineEmits(['refresh'])

// ── Map ──────────────────────────────────────────────────────────────────────

const mapCanvas  = ref(null)
const mapLoading = ref(false)
const mapError   = ref(null)
const mapData    = ref(null)   // { info: {...}, data: [...] } — fetched once, on demand
const scanData   = ref(null)   // fetched once when panel opens, not polled

// Pose comes for free from props.robot (updated in real-time via SSE).
// No HTTP request needed.
const pose = computed(() => props.robot.position ?? null)

// Interaction mode: 'none' | 'nav-goal' | 'initial-pose'
const mapMode    = ref('none')
const pendingClick = ref(null) // { x, y } in map coords

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

// Redraw when map data or the live pose from SSE changes.
// Scan is overlaid only once (static after fetch).
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
        // -1 = unknown (grey), 0 = free (white), 100 = occupied (black)
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

    // ── Laser scan overlay (static snapshot, no polling) ─────────────────────
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

    // ── Robot pose arrow (live from SSE via props.robot.position) ─────────────
    if (pose.value) {
        const theta = pose.value.theta ?? 0
        const { info } = mapData.value
        const cx = (pose.value.x - info.origin.position.x) / info.resolution
        const cy = info.height - (pose.value.y - info.origin.position.y) / info.resolution

        const arrowLen = 12
        ctx.save()
        ctx.fillStyle   = '#2563eb'
        ctx.strokeStyle = '#1d4ed8'
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

    // ── Pending click marker ──────────────────────────────────────────────────
    if (pendingClick.value) {
        const { info } = mapData.value
        const cx = (pendingClick.value.x - info.origin.position.x) / info.resolution
        const cy = info.height - (pendingClick.value.y - info.origin.position.y) / info.resolution
        ctx.save()
        ctx.strokeStyle = mapMode.value === 'initial-pose' ? '#f59e0b' : '#16a34a'
        ctx.lineWidth   = 2
        ctx.beginPath()
        ctx.arc(cx, cy, 8, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.restore()
    }
}

// ── Map interaction (nav-goal / initial-pose) ─────────────────────────────────

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

// State for orientation drag
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
        } else if (mapMode.value === 'initial-pose') {
            await robotService.setInitialPose(
                props.robot.id,
                pendingClick.value.x, pendingClick.value.y,
                qz, qw
            )
            navStatus.value = `Pose inicial establecida: (${pendingClick.value.x.toFixed(2)}, ${pendingClick.value.y.toFixed(2)})`
        }
    } catch (err) {
        navStatus.value = `Error: ${err.message}`
    } finally {
        pendingClick.value = null
        mapMode.value      = 'none'
        nextTick(drawCanvas)
    }
}

// ── Navigation controls ───────────────────────────────────────────────────────

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

// ── Teleoperation ─────────────────────────────────────────────────────────────

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

// Dpad buttons
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────
// No polling. Pose is live via SSE (props.robot). Map and scan are one-shot HTTP.

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

// ── Computed helpers ──────────────────────────────────────────────────────────

const poseText = computed(() => {
    if (!pose.value) return null
    const theta = ((pose.value.theta ?? 0) * 180 / Math.PI).toFixed(1)
    return `x:${(pose.value.x ?? 0).toFixed(2)}  y:${(pose.value.y ?? 0).toFixed(2)}  θ:${theta}°`
})

const mapModeLabel = computed(() => ({
    'none':         'Modo: Observar',
    'nav-goal':     'Modo: Clic → Arrastrar para establecer objetivo',
    'initial-pose': 'Modo: Clic → Arrastrar para establecer pose inicial',
}[mapMode.value]))
</script>

<template>
    <div class="space-y-5">

        <!-- ── Map section ─────────────────────────────────────────────────── -->
        <div class="space-y-2">
            <div class="flex flex-wrap gap-2 items-center justify-between">
                <span class="text-sm font-semibold text-foreground">Mapa en Vivo</span>
                <div class="flex gap-1.5 flex-wrap">
                    <!-- Mode toggles -->
                    <Button size="sm" variant="outline" @click="loadMap" :disabled="!robot.connected || mapLoading" class="h-7 px-2 text-xs gap-1">
                        <Loader2 v-if="mapLoading" class="w-3 h-3 animate-spin" />
                        <RotateCcw v-else class="w-3 h-3" />
                        Refrescar Mapa
                    </Button>
                    <Button size="sm"
                        :variant="mapMode === 'nav-goal' ? 'default' : 'outline'"
                        @click="mapMode = mapMode === 'nav-goal' ? 'none' : 'nav-goal'"
                        :disabled="!robot.connected || !mapData"
                        class="h-7 px-2 text-xs gap-1">
                        <Navigation class="w-3 h-3" /> Nav Goal
                    </Button>
                    <Button size="sm"
                        :variant="mapMode === 'initial-pose' ? 'default' : 'outline'"
                        @click="mapMode = mapMode === 'initial-pose' ? 'none' : 'initial-pose'"
                        :disabled="!robot.connected || !mapData"
                        class="h-7 px-2 text-xs gap-1">
                        <Crosshair class="w-3 h-3" /> Pose Inicial
                    </Button>
                    <Button size="sm" variant="destructive"
                        @click="cancelNav"
                        :disabled="!robot.connected || navLoading"
                        class="h-7 px-2 text-xs gap-1">
                        <X class="w-3 h-3" /> Cancelar Nav
                    </Button>
                </div>
            </div>

            <!-- Mode hint -->
            <p v-if="mapMode !== 'none'" class="text-xs px-2 py-1 rounded"
                :class="mapMode === 'nav-goal' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'">
                {{ mapModeLabel }}
            </p>

            <!-- Status / error bar -->
            <p v-if="navStatus" class="text-xs text-muted-foreground font-mono">{{ navStatus }}</p>
            <p v-if="mapError"  class="text-xs text-destructive">{{ mapError }}</p>

            <!-- AMCL pose readout -->
            <p v-if="poseText" class="text-xs font-mono text-muted-foreground">
                AMCL → {{ poseText }}
            </p>

            <!-- Canvas -->
            <div class="relative border border-border rounded-md overflow-hidden bg-muted/30"
                :class="mapMode !== 'none' ? (mapMode === 'nav-goal' ? 'cursor-crosshair ring-2 ring-green-500' : 'cursor-crosshair ring-2 ring-amber-500') : 'cursor-default'">

                <div v-if="mapLoading" class="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                    <Loader2 class="w-6 h-6 animate-spin text-primary" />
                </div>

                <div v-if="!mapData && !mapLoading" class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                    <Wifi class="w-5 h-5" />
                    <span>{{ robot.connected ? 'Cargando mapa…' : 'Conecta el robot para ver el mapa' }}</span>
                </div>

                <canvas
                    v-show="mapData"
                    ref="mapCanvas"
                    class="w-full h-auto max-h-72 object-contain"
                    @mousedown="onCanvasMousedown"
                    @mouseup="onCanvasMouseup"
                />
            </div>
        </div>

        <!-- ── Teleoperation ───────────────────────────────────────────────── -->
        <div class="space-y-2">
            <span class="text-sm font-semibold text-foreground">Teleoperación</span>
            <p class="text-xs text-muted-foreground">Usa las teclas WASD / ↑↓←→ o el D-pad.</p>

            <div class="flex justify-center">
                <div class="grid grid-cols-3 gap-1.5 w-36">
                    <!-- Row 1 -->
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

                    <!-- Row 2 -->
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

                    <!-- Row 3 -->
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
