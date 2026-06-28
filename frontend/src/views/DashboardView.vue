<script setup>
/**
 * @module views/DashboardView
 * @description
 * Panel del **personal** (técnicos y administradores). Lista los robots con su
 * estado en vivo (vía SSE), permite generar el QR de acceso y agrupa las
 * pestañas de gestión: mapas, historial de chats, estadísticas e incidencias
 * (un técnico solo ve Robots). Ruta `/dashboard` (requiere personal).
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** `vue-router`, {@link module:stores/auth},
 * {@link module:services/robotService}, {@link module:services/authService},
 * {@link module:services/museumService}, las pestañas
 * {@link module:components/MapTab}, {@link module:components/ChatHistoryTab},
 * {@link module:components/StatsTab}, {@link module:components/IncidentsTab},
 * `qrcode`, componentes de UI y `lucide-vue-next`.
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { robotService } from '@/services/robotService'
import { authService } from '@/services/authService'
import { museumService } from '@/services/museumService'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { RefreshCw, Zap, MapPin, Plus, X, Building2, Users, BarChart3, Clock, Settings, Wifi, Search, Pencil, Eye, EyeOff, Trash2, ShieldAlert, Map, Bot, History, Navigation, Loader2, AlertTriangle, Gamepad2 } from 'lucide-vue-next'
import MapTab             from '@/components/MapTab.vue'
import ChatHistoryTab     from '@/components/ChatHistoryTab.vue'
import StatsTab           from '@/components/StatsTab.vue'
import IncidentsTab       from '@/components/IncidentsTab.vue'
import QRCode             from 'qrcode'

const authStore = useAuthStore()
const router = useRouter()
const user = computed(() => authStore.user)
const isMuseumAdmin = computed(() => authStore.isMuseumAdmin)
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)
const isStaff = computed(() => authStore.isStaff)

const openRobotControl = (robotId) => router.push({ name: 'robot-control', params: { id: robotId } })

const activeTab = ref('robots')
const originUrl = window?.location?.origin || ''

// ---------------- ROBOTS (SSE) ----------------
const robots = ref([])
const loadingRobots = ref(true)
const errorRobots = ref(null)
let robotEventSource = null

/** Apply a single robot update pushed by the server. */
const applyRobotUpdate = (updated) => {
    const idx = robots.value.findIndex(r => r.id === updated.id)
    if (idx === -1) {
        robots.value.push(updated)
    } else {
        // A newer nav-failure timestamp means a fresh incident the admin hasn't seen.
        const prev = robots.value[idx]
        if (updated.last_nav_error_at && updated.last_nav_error_at !== prev.last_nav_error_at
            && activeTab.value !== 'incidents') {
            hasNewIncident.value = true
        }
        robots.value[idx] = updated
    }
}

/** Open the SSE stream. Reconnects automatically on error (browser built-in). */
const startRobotStream = () => {
    if (robotEventSource) robotEventSource.close()

    const token = localStorage.getItem('artec_token')
    if (!token) return

    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    const url = `${API_BASE}/robots/stream?token=${encodeURIComponent(token)}`

    robotEventSource = new EventSource(url)

    robotEventSource.addEventListener('robot', (e) => {
        try {
            const data = JSON.parse(e.data)
            applyRobotUpdate(data)
        } catch { /* ignore malformed event */ }
    })

    robotEventSource.addEventListener('ready', () => {
        loadingRobots.value = false
        errorRobots.value = null
    })

    robotEventSource.onerror = () => {
        // EventSource retries automatically - only show error if we never got data
        if (robots.value.length === 0) {
            loadingRobots.value = false
            errorRobots.value = 'No se pudo conectar con el servidor en tiempo real.'
        }
    }
}

// QR codes are generated LOCALLY (no internet) so the demo works on any network.
// Keyed by robot id → PNG data URL. Regenerated whenever the robot list changes.
const qrCodes = ref({})

const buildVisitUrl = (robotId) => `${originUrl}/r/${robotId}`

// Idempotent: the QR URL depends only on the stable robot id, so each one is
// generated once and reused (skipped if already present).
const generateQrCodes = async () => {
    for (const robot of robots.value) {
        if (qrCodes.value[robot.id]) continue
        try {
            qrCodes.value[robot.id] = await QRCode.toDataURL(buildVisitUrl(robot.id), { width: 300, margin: 1 })
        } catch { /* skip individual failures */ }
    }
}

// Robots arrive asynchronously over SSE (not just via fetchRobots), so generate
// QRs whenever the set of robot ids changes - otherwise the first paint after an
// SSE load is stuck on "Generando QR…" until a manual refresh.
watch(
    () => robots.value.map(r => r.id).join('|'),
    generateQrCodes,
    { immediate: true }
)

/** Manual refresh - still useful after mutations (connect/disconnect/update). */
const fetchRobots = async () => {
    try {
        const fresh = await robotService.fetchAll()
        robots.value = fresh
        errorRobots.value = null
        generateQrCodes()  // covers the case where fetch replaces the list with the same ids (watch wouldn't re-fire)
    } catch (err) {
        errorRobots.value = 'No se pudo obtener la lista de robots.'
    } finally {
        loadingRobots.value = false
    }
}

const showRobotModal = ref(false)
const showEditRobotModal = ref(false)
const robotError = ref(null)
const robotSuccess = ref(null)
const robotForm = ref({ id: '', name: '', museum_id: '', ip: '' })

const openRobotModal = () => {
    robotForm.value = { id: '', name: '', museum_id: '', ip: '' }
    robotError.value = null
    robotSuccess.value = null
    showRobotModal.value = true
}

const openEditRobotModal = (robot) => {
    robotForm.value = { id: robot.id, name: robot.name, museum_id: robot.museum_id, ip: robot.ip || '127.0.0.1' }
    robotError.value = null
    robotSuccess.value = null
    showEditRobotModal.value = true
}

const handleCreateRobot = async () => {
    robotError.value = null
    robotSuccess.value = null
    try {
        await robotService.create(robotForm.value.name, robotForm.value.museum_id)
        robotSuccess.value = 'Robot creado correctamente.'
        await fetchRobots()
        setTimeout(() => showRobotModal.value = false, 1500)
    } catch (err) {
        robotError.value = err.message || 'Error al crear robot'
    }
}

const handleEditRobot = async () => {
    robotError.value = null
    robotSuccess.value = null
    try {
        await robotService.update(robotForm.value.id, {
            name: robotForm.value.name,
            ip: robotForm.value.ip,
            museum_id: robotForm.value.museum_id || null
        })
        robotSuccess.value = 'Robot actualizado correctamente.'
        await fetchRobots()
        setTimeout(() => showEditRobotModal.value = false, 1500)
    } catch (err) {
        robotError.value = err.message || 'Error al actualizar robot'
    }
}

const showDeleteRobotModal = ref(false)
const deleteRobotTarget = ref(null)
const deleteRobotError = ref(null)

const openDeleteRobotModal = (robot) => {
    deleteRobotTarget.value = robot
    deleteRobotError.value = null
    showDeleteRobotModal.value = true
}

const handleDeleteRobot = async () => {
    deleteRobotError.value = null
    try {
        await robotService.remove(deleteRobotTarget.value.id)
        showDeleteRobotModal.value = false
        deleteRobotTarget.value = null
        await fetchRobots()
    } catch (err) {
        deleteRobotError.value = err.message || 'Error al eliminar robot'
    }
}

const pendingCommandId = ref(null)
const commandError = ref(null)   // { id, message } | null - scoped to the failing robot

const sendCommand = async (id, command) => {
    pendingCommandId.value = id
    commandError.value = null
    try {
        await robotService.sendCommand(id, command, null)
        await fetchRobots()
    } catch (err) {
        commandError.value = { id, message: err.message || 'No se pudo ejecutar el comando.' }
    } finally {
        pendingCommandId.value = null
    }
}

const handleEndVisit = async (id) => {
    if (!confirm('¿Seguro que quieres forzar la finalización de la visita actual de este robot?')) return
    try {
        await robotService.forceEndSession(id)
        await fetchRobots()
    } catch (err) {
        console.error("Error terminando la visita", err)
    }
}

// ---------------- STAFF ----------------
const staff = ref([])
const loadingStaff = ref(false)
const showStaffModal = ref(false)
const showEditStaffModal = ref(false)
const showDeleteStaffModal = ref(false)
const staffError = ref(null)
const staffSuccess = ref(null)
const staffForm = ref({ name: '', email: '', role: 'technician', museum_id: '' })
const editStaffForm = ref({ id: '', name: '', email: '', role: '' })
const deleteStaffTarget = ref(null)
const staffSearch = ref('')
const staffRoleFilter = ref('all')
const staffStatusFilter = ref('all')
const staffMuseumFilter = ref('all')

const getStaffStatus = (member) => {
    if (member.active === 0 && member.must_change_password === 1) return 'pending'
    if (member.active === 1) return 'active'
    return 'inactive'
}

const filteredStaff = computed(() => staff.value.filter(m => {
    const q = staffSearch.value.toLowerCase()
    const matchSearch = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    const matchRole = staffRoleFilter.value === 'all' || m.role === staffRoleFilter.value
    const matchStatus = staffStatusFilter.value === 'all' || getStaffStatus(m) === staffStatusFilter.value
    const matchMuseum = staffMuseumFilter.value === 'all' || m.museum_id === staffMuseumFilter.value
    return matchSearch && matchRole && matchStatus && matchMuseum
}))

const fetchStaff = async () => {
    loadingStaff.value = true
    try {
        staff.value = await authService.listUsers()
    } catch (err) {
        console.error(err)
    } finally {
        loadingStaff.value = false
    }
}

const openStaffModal = () => {
    staffForm.value = { name: '', email: '', role: 'technician', museum_id: user.value?.museum_id || '' }
    staffError.value = null
    staffSuccess.value = null
    showStaffModal.value = true
}

const handleCreateStaff = async () => {
    staffError.value = null
    staffSuccess.value = null
    try {
        await authService.createStaff(staffForm.value.name, staffForm.value.email, staffForm.value.role, staffForm.value.museum_id)
        staffSuccess.value = 'Invitación enviada. El usuario activará su cuenta en el primer inicio de sesión.'
        await fetchStaff()
        setTimeout(() => showStaffModal.value = false, 2000)
    } catch (err) {
        staffError.value = err.message || 'Error al crear personal'
    }
}

const openEditStaffModal = (member) => {
    editStaffForm.value = { id: member.id, name: member.name, email: member.email, role: member.role }
    staffError.value = null
    staffSuccess.value = null
    showEditStaffModal.value = true
}

const handleEditStaff = async () => {
    staffError.value = null
    staffSuccess.value = null
    try {
        await authService.updateStaff(editStaffForm.value.id, {
            name: editStaffForm.value.name,
            email: editStaffForm.value.email,
            role: editStaffForm.value.role
        })
        staffSuccess.value = 'Usuario actualizado correctamente.'
        await fetchStaff()
        setTimeout(() => showEditStaffModal.value = false, 1500)
    } catch (err) {
        staffError.value = err.message || 'Error al actualizar usuario'
    }
}

const handleToggleActive = async (member) => {
    try {
        await authService.toggleStaffActive(member.id)
        await fetchStaff()
    } catch (err) {
        console.error(err)
    }
}

const openDeleteStaffModal = (member) => {
    deleteStaffTarget.value = member
    showDeleteStaffModal.value = true
}

const handleDeleteStaff = async () => {
    try {
        await authService.deleteStaff(deleteStaffTarget.value.id)
        showDeleteStaffModal.value = false
        deleteStaffTarget.value = null
        await fetchStaff()
    } catch (err) {
        console.error(err)
    }
}

// ---------------- MUSEUMS ----------------
const museums = ref([])
const loadingMuseums = ref(false)
const museumName = (id) => museums.value.find(m => m.id === id)?.name || 'Sin asignar'
const showMuseumModal = ref(false)
const museumError = ref(null)
const museumSuccess = ref(null)
const museumForm = ref({ name: '', company: '' })

const fetchMuseums = async () => {
    if (!isPlatformAdmin.value) return;
    loadingMuseums.value = true
    try {
        museums.value = await museumService.fetchAll()
    } catch (err) {
        console.error(err)
    } finally {
        loadingMuseums.value = false
    }
}

const openMuseumModal = () => {
    museumForm.value = { name: '', company: '' }
    museumError.value = null
    museumSuccess.value = null
    showMuseumModal.value = true
}

const handleCreateMuseum = async () => {
    museumError.value = null
    museumSuccess.value = null
    try {
        await museumService.create(museumForm.value)
        museumSuccess.value = 'Museo creado correctamente.'
        await fetchMuseums()
        setTimeout(() => showMuseumModal.value = false, 1500)
    } catch (err) {
        museumError.value = err.message || 'Error al crear museo'
    }
}

const showEditMuseumModal = ref(false)
const editMuseumForm = ref({ id: '', name: '', company: '' })

const openEditMuseumModal = (museum) => {
    editMuseumForm.value = { id: museum.id, name: museum.name, company: museum.company }
    museumError.value = null
    museumSuccess.value = null
    showEditMuseumModal.value = true
}

const handleUpdateMuseum = async () => {
    museumError.value = null
    museumSuccess.value = null
    try {
        await museumService.update(editMuseumForm.value.id, {
            name: editMuseumForm.value.name,
            company: editMuseumForm.value.company,
        })
        museumSuccess.value = 'Museo actualizado correctamente.'
        await fetchMuseums()
        setTimeout(() => showEditMuseumModal.value = false, 1500)
    } catch (err) {
        museumError.value = err.message || 'Error al actualizar museo'
    }
}

const showDeleteMuseumModal = ref(false)
const deleteMuseumTarget = ref(null)
const deleteMuseumError = ref(null)

const openDeleteMuseumModal = (museum) => {
    deleteMuseumTarget.value = museum
    deleteMuseumError.value = null
    showDeleteMuseumModal.value = true
}

const handleDeleteMuseum = async () => {
    deleteMuseumError.value = null
    try {
        await museumService.remove(deleteMuseumTarget.value.id)
        showDeleteMuseumModal.value = false
        deleteMuseumTarget.value = null
        await fetchMuseums()
    } catch (err) {
        deleteMuseumError.value = err.message || 'Error al eliminar museo'
    }
}

// ---------------- STATS ----------------
const statsTabRef = ref(null)

// ---------------- INCIDENTS ----------------
const incidentsTabRef = ref(null)
const hasNewIncident  = ref(false)   // unseen nav-failure notification dot

const openIncidentsTab = () => {
    activeTab.value = 'incidents'
    hasNewIncident.value = false
    incidentsTabRef.value?.refresh()
}

// ---------------- GLOBAL TAB REFRESH ----------------
const refreshCurrentTab = () => {
    if (activeTab.value === 'robots')    fetchRobots()
    if (activeTab.value === 'staff')     fetchStaff()
    if (activeTab.value === 'museums')   fetchMuseums()
    if (activeTab.value === 'stats')     statsTabRef.value?.refresh()
    if (activeTab.value === 'incidents') incidentsTabRef.value?.refresh()
}

onMounted(() => {
    startRobotStream()
    if (isMuseumAdmin.value || isPlatformAdmin.value) fetchStaff()
    if (isPlatformAdmin.value) fetchMuseums()
})

onUnmounted(() => {
    if (robotEventSource) robotEventSource.close()
})
</script>

<template>
    <div class="px-4 py-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)] relative">
        <div class="flex justify-between items-center mb-6">
            <div>
                <h1 class="font-display text-3xl font-medium tracking-tight text-foreground">Panel de Control</h1>
                <p class="text-muted-foreground mt-1">Gestión administrativa de Artec Robotics.</p>
            </div>
            <Button @click="refreshCurrentTab" variant="secondary" size="icon" class="rounded-full"
                title="Actualizar datos">
                <RefreshCw class="w-5 h-5" />
            </Button>
        </div>

        <!-- Custom Tabs Navigation -->
        <div class="flex gap-2 border-b border-border mb-8 overflow-x-auto">
            <button @click="activeTab = 'robots'" class="px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
                :class="activeTab === 'robots' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                <Bot class="w-4 h-4" /> Flota de Robots
            </button>
            <button v-if="isMuseumAdmin || isPlatformAdmin" @click="activeTab = 'staff'"
                class="px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
                :class="activeTab === 'staff' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                <Users class="w-4 h-4" /> Personal
            </button>
            <button v-if="isPlatformAdmin" @click="activeTab = 'museums'"
                class="px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
                :class="activeTab === 'museums' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                <Building2 class="w-4 h-4" /> Gestión de Museos
            </button>
            <button v-if="isMuseumAdmin || isPlatformAdmin" @click="activeTab = 'map'"
                class="px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
                :class="activeTab === 'map' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                <Map class="w-4 h-4" /> Mapa
            </button>
            <button v-if="isMuseumAdmin" @click="activeTab = 'stats'"
                class="px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
                :class="activeTab === 'stats' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                <BarChart3 class="w-4 h-4" /> Estadísticas
            </button>
            <button v-if="isMuseumAdmin || isPlatformAdmin" @click="activeTab = 'history'"
                class="px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
                :class="activeTab === 'history' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                <History class="w-4 h-4" /> Historial
            </button>
            <button v-if="isMuseumAdmin || isPlatformAdmin" @click="openIncidentsTab"
                class="relative px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
                :class="activeTab === 'incidents' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                <AlertTriangle class="w-4 h-4" /> Incidencias
                <span v-if="hasNewIncident"
                    class="absolute top-1.5 right-1 flex h-2.5 w-2.5">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
            </button>
        </div>

        <!-- TAB: ROBOTS -->
        <div v-show="activeTab === 'robots'">
            <div class="flex justify-between items-center mb-6">
                <h2 class="font-display text-xl font-medium tracking-tight">Gestión de Robots</h2>
                <Button v-if="isPlatformAdmin" @click="openRobotModal" class="flex gap-2 items-center">
                    <Plus class="w-4 h-4" /> Crear Robot
                </Button>
            </div>
            <div v-if="loadingRobots" class="flex justify-center items-center h-64">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
            <Alert v-else-if="errorRobots" variant="destructive" class="p-6 mb-6">
                <h3 class="font-semibold">Error de Conexión</h3>
                <p>{{ errorRobots }}</p>
            </Alert>
            <div v-else-if="robots.length === 0"
                class="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed border-border rounded-md">
                <p>No se encontraron robots asignados a tu perfil.</p>
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Robots Card Loop -->
                <Card v-for="robot in robots" :key="robot.id"
                    class="p-6 hover:border-primary/40 transition-colors relative overflow-hidden group">

                    <!-- SUPERADMIN (provider): assignment-only view -->
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
                            <Button variant="outline" size="sm" class="flex-1 gap-1.5" @click="openEditRobotModal(robot)">
                                <Settings class="w-3.5 h-3.5" /> Editar / Mover
                            </Button>
                            <Button variant="ghost" size="sm" class="gap-1.5 text-destructive hover:text-destructive" @click="openDeleteRobotModal(robot)">
                                <Trash2 class="w-3.5 h-3.5" /> Eliminar
                            </Button>
                        </div>
                    </template>

                    <!-- OPERATORS (museum_admin / technician): full operational panel -->
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
                        <!-- Last navigation failure (cleared when a new goal is dispatched) -->
                        <div v-if="robot.last_nav_error_at" class="flex items-start gap-2 text-sm rounded-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 px-2.5 py-2">
                            <AlertTriangle class="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <span class="text-xs text-red-700 dark:text-red-300 leading-snug">
                                No pudo llegar<template v-if="robot.last_nav_error_place"> a <strong>{{ robot.last_nav_error_place }}</strong></template>.
                                <button @click="openIncidentsTab" class="underline font-semibold whitespace-nowrap">Ver incidencias</button>
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
                                <Button v-if="isMuseumAdmin" @click="handleEndVisit(robot.id)" variant="destructive" size="icon" class="h-6 w-6 scale-90" title="Finalizar Visita Forzosamente">
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
                            <Button v-if="!robot.connected" @click="sendCommand(robot.id, 'connect')" :disabled="pendingCommandId === robot.id" size="sm" class="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5">
                                <Loader2 v-if="pendingCommandId === robot.id" class="w-4 h-4 animate-spin" />
                                {{ pendingCommandId === robot.id ? 'Conectando…' : 'Conectar' }}
                            </Button>
                            <Button v-else @click="sendCommand(robot.id, 'disconnect')" :disabled="pendingCommandId === robot.id" size="sm" variant="destructive" class="flex-1 gap-1.5">
                                <Loader2 v-if="pendingCommandId === robot.id" class="w-4 h-4 animate-spin" />
                                {{ pendingCommandId === robot.id ? 'Desconectando…' : 'Desconectar' }}
                            </Button>
                        </div>
                        <Button v-if="isStaff" @click="openRobotControl(robot.id)" variant="outline" size="sm" class="gap-1.5">
                            <Gamepad2 class="w-4 h-4" /> Control
                        </Button>
                        <Button v-if="isStaff" @click="openEditRobotModal(robot)" variant="outline" size="sm" class="gap-1.5">
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
                            -
                            <Button as="a" :href="buildVisitUrl(robot.id)" target="_blank" variant="outline" size="sm" class="mt-2"
                            >Chat</Button>
                        </div>
                      </div>
                    </template>
                </Card>
            </div>
        </div>

        <!-- TAB: STAFF -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'staff'">
            <!-- Header -->
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2 class="font-display text-xl font-medium tracking-tight text-foreground">Gestión de Personal</h2>
                    <p class="text-sm text-muted-foreground mt-0.5">
                        {{ staff.length }} miembro{{ staff.length !== 1 ? 's' : '' }} registrado{{ staff.length !== 1 ? 's' : '' }}
                    </p>
                </div>
                <Button @click="openStaffModal" class="gap-2">
                    <Plus class="w-4 h-4" /> Añadir Personal
                </Button>
            </div>

            <!-- Toolbar -->
            <div class="flex flex-col sm:flex-row gap-3 mb-4">
                <div class="relative flex-1">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input v-model="staffSearch" placeholder="Buscar por nombre o email…" class="pl-9" />
                </div>
                <select v-model="staffRoleFilter"
                    class="h-10 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                    <option value="all">Todos los roles</option>
                    <option value="museum_admin">Administrador</option>
                    <option value="technician">Técnico</option>
                </select>
                <select v-model="staffStatusFilter"
                    class="h-10 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                    <option value="all">Todos los estados</option>
                    <option value="active">Activo</option>
                    <option value="pending">Pendiente</option>
                    <option value="inactive">Inactivo</option>
                </select>
                <select v-if="isPlatformAdmin" v-model="staffMuseumFilter"
                    class="h-10 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                    <option value="all">Todos los museos</option>
                    <option v-for="m in museums" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
            </div>

            <!-- Table -->
            <div class="border border-border rounded-md overflow-hidden bg-card">
                <div v-if="loadingStaff" class="flex justify-center items-center h-32">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
                <table v-else class="w-full text-sm text-left">
                    <thead class="bg-muted/50 text-muted-foreground uppercase text-xs border-b border-border">
                        <tr>
                            <th class="px-6 py-3 font-medium">Usuario</th>
                            <th class="px-6 py-3 font-medium">Rol</th>
                            <th class="px-6 py-3 font-medium">Estado</th>
                            <th v-if="isPlatformAdmin" class="px-6 py-3 font-medium">Museo</th>
                            <th class="px-6 py-3 font-medium">Alta</th>
                            <th class="px-6 py-3 font-medium text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        <tr v-if="filteredStaff.length === 0">
                            <td :colspan="isPlatformAdmin ? 6 : 5" class="px-6 py-12 text-center text-muted-foreground">
                                <Users class="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p>No se encontraron resultados</p>
                            </td>
                        </tr>
                        <tr v-for="member in filteredStaff" :key="member.id"
                            class="hover:bg-muted/30 transition-colors"
                            :class="{ 'opacity-50': getStaffStatus(member) === 'inactive' }">

                            <!-- Avatar + name + email -->
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 uppercase">
                                        {{ member.name.charAt(0) }}
                                    </div>
                                    <div>
                                        <p class="font-medium text-foreground leading-tight">{{ member.name }}</p>
                                        <p class="text-xs text-muted-foreground">{{ member.email }}</p>
                                    </div>
                                </div>
                            </td>

                            <!-- Role badge -->
                            <td class="px-6 py-4">
                                <span class="px-2.5 py-1 rounded-full text-xs font-semibold"
                                    :class="{
                                        'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400': member.role === 'platform_admin',
                                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': member.role === 'museum_admin',
                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400': member.role === 'technician',
                                    }">
                                    {{ member.role === 'platform_admin' ? 'Super Admin' : member.role === 'museum_admin' ? 'Administrador' : 'Técnico' }}
                                </span>
                            </td>

                            <!-- Status badge -->
                            <td class="px-6 py-4">
                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                                    :class="{
                                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': getStaffStatus(member) === 'pending',
                                        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': getStaffStatus(member) === 'active',
                                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400': getStaffStatus(member) === 'inactive',
                                    }">
                                    <span class="w-1.5 h-1.5 rounded-full"
                                        :class="{
                                            'bg-amber-500': getStaffStatus(member) === 'pending',
                                            'bg-green-500': getStaffStatus(member) === 'active',
                                            'bg-slate-400': getStaffStatus(member) === 'inactive',
                                        }"></span>
                                    {{ getStaffStatus(member) === 'pending' ? 'Pendiente' : getStaffStatus(member) === 'active' ? 'Activo' : 'Inactivo' }}
                                </span>
                            </td>

                            <!-- Museum -->
                            <td v-if="isPlatformAdmin" class="px-6 py-4 text-xs text-muted-foreground">
                                {{ member.museum_name || '-' }}
                            </td>

                            <!-- Date -->
                            <td class="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                                {{ new Date(member.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) }}
                            </td>

                            <!-- Actions -->
                            <td class="px-6 py-4">
                                <div class="flex items-center justify-end gap-1">
                                    <Button @click="openEditStaffModal(member)" variant="ghost" size="icon" class="h-8 w-8" title="Editar">
                                        <Pencil class="w-3.5 h-3.5" />
                                    </Button>
                                    <Button v-if="getStaffStatus(member) !== 'pending'"
                                        @click="handleToggleActive(member)"
                                        variant="ghost" size="icon" class="h-8 w-8"
                                        :title="member.active ? 'Desactivar cuenta' : 'Activar cuenta'">
                                        <EyeOff v-if="member.active" class="w-3.5 h-3.5 text-muted-foreground" />
                                        <Eye v-else class="w-3.5 h-3.5 text-primary" />
                                    </Button>
                                    <Button v-if="getStaffStatus(member) === 'pending'"
                                        @click="openDeleteStaffModal(member)"
                                        variant="ghost" size="icon" class="h-8 w-8 hover:text-destructive"
                                        title="Eliminar cuenta pendiente">
                                        <Trash2 class="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- TAB: MUSEUMS -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'museums'">
            <div class="flex justify-between items-center mb-6">
                <h2 class="font-display text-xl font-medium tracking-tight text-foreground">Museos Integrados</h2>
                <Button @click="openMuseumModal" class="gap-2">
                    <Plus class="w-4 h-4" /> Añadir Museo
                </Button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div v-if="museums.length === 0"
                    class="col-span-full p-12 text-center border border-dashed border-border rounded-md text-muted-foreground">
                    No hay museos registrados actualmente en el sistema.
                </div>
                <Card v-for="museum in museums" :key="museum.id" class="p-6">
                    <div class="flex items-center gap-4 mb-4">
                        <div class="w-12 h-12 bg-primary/10 rounded-sm flex items-center justify-center text-primary">
                            <Building2 class="w-6 h-6" />
                        </div>
                        <div>
                            <h3 class="font-display text-lg font-medium tracking-tight text-foreground leading-tight">{{ museum.name }}</h3>
                            <p class="text-sm text-muted-foreground">{{ museum.company }}</p>
                        </div>
                    </div>
                    <div class="flex gap-2 pt-4 border-t border-border/50">
                        <Button variant="outline" size="sm" class="flex-1 gap-1.5" @click="openEditMuseumModal(museum)">
                            <Pencil class="w-3.5 h-3.5" /> Editar
                        </Button>
                        <Button variant="ghost" size="sm" class="gap-1.5 text-destructive hover:text-destructive" @click="openDeleteMuseumModal(museum)">
                            <Trash2 class="w-3.5 h-3.5" /> Eliminar
                        </Button>
                    </div>
                </Card>
            </div>
        </div>

        <!-- TAB: HISTORY -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'history'">
            <ChatHistoryTab />
        </div>

        <!-- TAB: MAP -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'map'">
            <MapTab :robots="robots" />
        </div>

        <!-- TAB: STATS -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'stats'">
            <StatsTab ref="statsTabRef" />
        </div>

        <!-- TAB: INCIDENTS -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'incidents'">
            <IncidentsTab ref="incidentsTabRef" />
        </div>


        <!-- EDIT ROBOT MODAL -->
        <div v-if="showEditRobotModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-md relative">
                <button @click="showEditRobotModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="font-display text-2xl font-medium tracking-tight mb-6 flex items-center gap-2">
                        <Settings class="w-6 h-6 text-primary" /> Editar Robot
                    </h2>
                    <form @submit.prevent="handleEditRobot" class="space-y-4">
                        <div class="space-y-2">
                            <Label for="edit_robot_name">Nombre / Identificador</Label>
                            <Input id="edit_robot_name" v-model="robotForm.name" required placeholder="Ej: Robot Entrada Principal" />
                        </div>
                        <div class="space-y-2">
                            <Label for="edit_robot_ip">IP / WebSockets</Label>
                            <Input id="edit_robot_ip" v-model="robotForm.ip" required placeholder="Ej: 192.168.1.100" />
                        </div>
                        <div v-if="isPlatformAdmin" class="space-y-2">
                            <Label for="edit_robot_museum">Museo Asignado</Label>
                            <select id="edit_robot_museum" v-model="robotForm.museum_id"
                                class="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                                <option :value="null">Sin asignar</option>
                                <option v-for="m in museums" :key="m.id" :value="m.id">{{ m.name }}</option>
                            </select>
                            <p class="text-xs text-muted-foreground">Al cambiar de museo se desasigna su mapa actual.</p>
                        </div>
                        <Alert v-if="robotError" variant="destructive">
                            {{ robotError }}
                        </Alert>
                        <Alert v-if="robotSuccess" variant="success">
                            {{ robotSuccess }}
                        </Alert>
                        <Button type="submit" class="w-full" :disabled="!robotForm.name || !robotForm.ip">Guardar Cambios</Button>
                    </form>
                </div>
            </Card>
        </div>

        <!-- STAFF CREATE MODAL -->
        <div v-if="showStaffModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-md relative">
                <button @click="showStaffModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="font-display text-xl font-medium tracking-tight mb-1 flex items-center gap-2">
                        <Users class="w-5 h-5 text-primary" /> Añadir Personal
                    </h2>
                    <p class="text-sm text-muted-foreground mb-6">La cuenta quedará pendiente hasta el primer inicio de sesión.</p>
                    <form @submit.prevent="handleCreateStaff" class="space-y-4">
                        <div class="space-y-2">
                            <Label for="staff_name">Nombre</Label>
                            <Input id="staff_name" v-model="staffForm.name" required placeholder="ej: Juan Pérez" />
                        </div>
                        <div class="space-y-2">
                            <Label for="staff_email">Correo Electrónico</Label>
                            <Input id="staff_email" type="email" v-model="staffForm.email" required placeholder="correo@ejemplo.com" />
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <Label for="staff_role">Rol</Label>
                                <select id="staff_role" v-model="staffForm.role"
                                    class="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                                    <option v-if="isPlatformAdmin" value="museum_admin">Administrador</option>
                                    <option value="technician">Técnico</option>
                                </select>
                            </div>
                            <div class="space-y-2" v-if="isPlatformAdmin">
                                <Label for="staff_museum">Museo</Label>
                                <select id="staff_museum" v-model="staffForm.museum_id" required
                                    class="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                                    <option value="" disabled>Seleccionar…</option>
                                    <option v-for="m in museums" :key="m.id" :value="m.id">{{ m.name }}</option>
                                </select>
                            </div>
                        </div>
                        <div class="bg-secondary/50 p-3 rounded-sm text-sm text-muted-foreground border border-border">
                            Se enviará un correo a <strong>{{ staffForm.email || '…' }}</strong> con credenciales temporales.
                        </div>
                        <Alert v-if="staffError" variant="destructive"><p>{{ staffError }}</p></Alert>
                        <Alert v-if="staffSuccess" variant="success"><p>{{ staffSuccess }}</p></Alert>
                        <Button type="submit" class="w-full"
                            :disabled="!staffForm.name || !staffForm.email || !staffForm.role || (isPlatformAdmin && !staffForm.museum_id)">
                            Enviar Invitación
                        </Button>
                    </form>
                </div>
            </Card>
        </div>

        <!-- STAFF EDIT MODAL -->
        <div v-if="showEditStaffModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-md relative">
                <button @click="showEditStaffModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="font-display text-xl font-medium tracking-tight mb-6 flex items-center gap-2">
                        <Pencil class="w-5 h-5 text-primary" /> Editar Usuario
                    </h2>
                    <form @submit.prevent="handleEditStaff" class="space-y-4">
                        <div class="space-y-2">
                            <Label for="edit_staff_name">Nombre</Label>
                            <Input id="edit_staff_name" v-model="editStaffForm.name" required placeholder="ej: Juan Pérez" />
                        </div>
                        <div class="space-y-2">
                            <Label for="edit_staff_email">Correo Electrónico</Label>
                            <Input id="edit_staff_email" type="email" v-model="editStaffForm.email" required placeholder="correo@ejemplo.com" />
                        </div>
                        <div class="space-y-2">
                            <Label for="edit_staff_role">Rol</Label>
                            <select id="edit_staff_role" v-model="editStaffForm.role"
                                class="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                                <option v-if="isPlatformAdmin" value="museum_admin">Administrador</option>
                                <option value="technician">Técnico</option>
                            </select>
                        </div>
                        <Alert v-if="staffError" variant="destructive"><p>{{ staffError }}</p></Alert>
                        <Alert v-if="staffSuccess" variant="success"><p>{{ staffSuccess }}</p></Alert>
                        <Button type="submit" class="w-full" :disabled="!editStaffForm.name || !editStaffForm.email">Guardar Cambios</Button>
                    </form>
                </div>
            </Card>
        </div>

        <!-- STAFF DELETE CONFIRM MODAL -->
        <div v-if="showDeleteStaffModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-sm">
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                            <ShieldAlert class="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                            <h2 class="font-display font-medium tracking-tight text-foreground">Eliminar cuenta</h2>
                            <p class="text-sm text-muted-foreground">Esta acción no se puede deshacer</p>
                        </div>
                    </div>
                    <p class="text-sm text-muted-foreground mb-6">
                        Se eliminará la cuenta de <strong class="text-foreground">{{ deleteStaffTarget?.name }}</strong>.
                        Solo es posible eliminar cuentas que aún no han sido activadas.
                    </p>
                    <div class="flex gap-3">
                        <Button variant="outline" class="flex-1" @click="showDeleteStaffModal = false">Cancelar</Button>
                        <Button variant="destructive" class="flex-1" @click="handleDeleteStaff">Eliminar</Button>
                    </div>
                </div>
            </Card>
        </div>

        <!-- ROBOT MODAL -->
        <div v-if="showRobotModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-md relative">
                <button @click="showRobotModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="font-display text-2xl font-medium tracking-tight mb-6 flex items-center gap-2">
                        <Plus class="w-6 h-6 text-primary" /> Crear Robot
                    </h2>
                    <form @submit.prevent="handleCreateRobot" class="space-y-4">
                        <div class="space-y-2">
                            <Label for="robot_name">Nombre / Identificador</Label>
                            <Input id="robot_name" v-model="robotForm.name" required
                                placeholder="Ej: Robot Entrada Principal" />
                        </div>
                        <div class="space-y-2">
                            <Label for="robot_museum">Museo Asignado</Label>
                            <select id="robot_museum" v-model="robotForm.museum_id" required
                                class="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
                                <option value="" disabled selected>Selecciona un museo</option>
                                <option v-for="m in museums" :key="m.id" :value="m.id">
                                    {{ m.name }}
                                </option>
                            </select>
                        </div>
                        <Alert v-if="robotError" variant="destructive">
                            {{ robotError }}
                        </Alert>
                        <Alert v-if="robotSuccess" variant="success">
                            {{ robotSuccess }}
                        </Alert>
                        <Button type="submit" class="w-full" :disabled="!robotForm.name || !robotForm.museum_id">Registrar Robot</Button>
                    </form>
                </div>
            </Card>
        </div>

        <!-- MUSEUM MODAL -->
        <div v-if="showMuseumModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-md relative">
                <button @click="showMuseumModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="font-display text-2xl font-medium tracking-tight mb-6 flex items-center gap-2">
                        <Building2 class="w-6 h-6 text-primary" /> Registrar Museo
                    </h2>
                    <form @submit.prevent="handleCreateMuseum" class="space-y-4">
                        <div class="space-y-2">
                            <Label for="museum_name">Nombre del Museo / Instalación</Label>
                            <Input id="museum_name" v-model="museumForm.name" required
                                placeholder="Ej: Museo Ciencias Naturales" />
                        </div>
                        <div class="space-y-2">
                            <Label for="company">Empresa Titular/Gestora</Label>
                            <Input id="company" v-model="museumForm.company" required placeholder="Ej: Artec Co." />
                        </div>

                        <Alert v-if="museumError" variant="destructive" class="mb-4">
                            <p>{{ museumError }}</p>
                        </Alert>
                        <Alert v-if="museumSuccess" variant="success" class="mb-4">
                            <p>{{ museumSuccess }}</p>
                        </Alert>

                        <Button type="submit" class="w-full mt-2"
                            :disabled="!museumForm.name || !museumForm.company">Registrar Museo</Button>
                    </form>
                </div>
            </Card>
        </div>

        <!-- EDIT MUSEUM MODAL -->
        <div v-if="showEditMuseumModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-md relative">
                <button @click="showEditMuseumModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="font-display text-2xl font-medium tracking-tight mb-6 flex items-center gap-2">
                        <Pencil class="w-6 h-6 text-primary" /> Editar Museo
                    </h2>
                    <form @submit.prevent="handleUpdateMuseum" class="space-y-4">
                        <div class="space-y-2">
                            <Label for="edit_museum_name">Nombre del Museo / Instalación</Label>
                            <Input id="edit_museum_name" v-model="editMuseumForm.name" required
                                placeholder="Ej: Museo Ciencias Naturales" />
                        </div>
                        <div class="space-y-2">
                            <Label for="edit_company">Empresa Titular/Gestora</Label>
                            <Input id="edit_company" v-model="editMuseumForm.company" required placeholder="Ej: Artec Co." />
                        </div>

                        <Alert v-if="museumError" variant="destructive" class="mb-4">
                            <p>{{ museumError }}</p>
                        </Alert>
                        <Alert v-if="museumSuccess" variant="success" class="mb-4">
                            <p>{{ museumSuccess }}</p>
                        </Alert>

                        <Button type="submit" class="w-full mt-2"
                            :disabled="!editMuseumForm.name || !editMuseumForm.company">Guardar Cambios</Button>
                    </form>
                </div>
            </Card>
        </div>

        <!-- MUSEUM DELETE CONFIRM MODAL -->
        <div v-if="showDeleteMuseumModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-sm">
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                            <ShieldAlert class="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                            <h2 class="font-display font-medium tracking-tight text-foreground">Eliminar museo</h2>
                            <p class="text-sm text-muted-foreground">Esta acción no se puede deshacer</p>
                        </div>
                    </div>
                    <p class="text-sm text-muted-foreground mb-6">
                        Se eliminará <strong class="text-foreground">{{ deleteMuseumTarget?.name }}</strong> y, en cascada,
                        <strong class="text-foreground">todos sus usuarios, robots, mapas, zonas e historial de visitas</strong>.
                    </p>
                    <Alert v-if="deleteMuseumError" variant="destructive" class="mb-4">
                        <p>{{ deleteMuseumError }}</p>
                    </Alert>
                    <div class="flex gap-3">
                        <Button variant="outline" class="flex-1" @click="showDeleteMuseumModal = false">Cancelar</Button>
                        <Button variant="destructive" class="flex-1" @click="handleDeleteMuseum">Eliminar</Button>
                    </div>
                </div>
            </Card>
        </div>

        <!-- ROBOT DELETE CONFIRM MODAL -->
        <div v-if="showDeleteRobotModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-sm">
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                            <ShieldAlert class="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                            <h2 class="font-display font-medium tracking-tight text-foreground">Eliminar robot</h2>
                            <p class="text-sm text-muted-foreground">Esta acción no se puede deshacer</p>
                        </div>
                    </div>
                    <p class="text-sm text-muted-foreground mb-6">
                        Se eliminará el robot <strong class="text-foreground">{{ deleteRobotTarget?.name }}</strong> junto con
                        <strong class="text-foreground">su historial de visitas, chat e incidencias</strong>.
                    </p>
                    <Alert v-if="deleteRobotError" variant="destructive" class="mb-4">
                        <p>{{ deleteRobotError }}</p>
                    </Alert>
                    <div class="flex gap-3">
                        <Button variant="outline" class="flex-1" @click="showDeleteRobotModal = false">Cancelar</Button>
                        <Button variant="destructive" class="flex-1" @click="handleDeleteRobot">Eliminar</Button>
                    </div>
                </div>
            </Card>
        </div>
    </div>
</template>
