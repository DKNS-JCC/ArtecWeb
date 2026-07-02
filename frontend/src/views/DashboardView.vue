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
import { RefreshCw, Plus, X, Building2, Users, BarChart3, Settings, Pencil, Map, Bot, History, AlertTriangle } from 'lucide-vue-next'
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal.vue'
import { useCrud } from '@/composables/useCrud'
import RobotsTab         from '@/components/dashboard/RobotsTab.vue'
import MuseumsTab        from '@/components/dashboard/MuseumsTab.vue'
import StaffTab          from '@/components/dashboard/StaffTab.vue'
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

const openRobotControl = (robotId) => router.push({ name: 'robot-control', params: { id: robotId } })

const activeTab = ref('robots')
const originUrl = window?.location?.origin || ''

// ---------------- ROBOTS (SSE) ----------------
const robots = ref([])
const loadingRobots = ref(true)
const errorRobots = ref(null)
let robotEventSource = null

/** Aplica una actualización de un robot enviada por el servidor. */
const applyRobotUpdate = (updated) => {
    const idx = robots.value.findIndex(r => r.id === updated.id)
    if (idx === -1) {
        robots.value.push(updated)
    } else {
        // Una marca de tiempo de fallo de navegación más reciente significa una incidencia nueva que el admin no ha visto.
        const prev = robots.value[idx]
        if (updated.last_nav_error_at && updated.last_nav_error_at !== prev.last_nav_error_at
            && activeTab.value !== 'incidents') {
            hasNewIncident.value = true
        }
        robots.value[idx] = updated
    }
}

/** Abre el stream SSE. Se reconecta automáticamente ante errores (nativo del navegador). */
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
        } catch { /* ignora eventos malformados */ }
    })

    robotEventSource.addEventListener('ready', () => {
        loadingRobots.value = false
        errorRobots.value = null
    })

    robotEventSource.onerror = () => {
        // EventSource reintenta automáticamente - solo muestra error si nunca llegaron datos
        if (robots.value.length === 0) {
            loadingRobots.value = false
            errorRobots.value = 'No se pudo conectar con el servidor en tiempo real.'
        }
    }
}

// Los códigos QR se generan LOCALMENTE (sin internet) para que la demo funcione en cualquier red.
// Indexados por id de robot → data URL PNG. Se regeneran cuando cambia la lista de robots.
const qrCodes = ref({})

const buildVisitUrl = (robotId) => `${originUrl}/r/${robotId}`

// Idempotente: la URL del QR depende solo del id estable del robot, así que cada uno se
// genera una vez y se reutiliza (se omite si ya existe).
const generateQrCodes = async () => {
    for (const robot of robots.value) {
        if (qrCodes.value[robot.id]) continue
        try {
            qrCodes.value[robot.id] = await QRCode.toDataURL(buildVisitUrl(robot.id), { width: 300, margin: 1 })
        } catch { /* omite fallos individuales */ }
    }
}

// Los robots llegan de forma asíncrona por SSE (no solo vía fetchRobots), así que se
// generan los QR cuando cambia el conjunto de ids de robot - de lo contrario el primer
// render tras una carga por SSE se queda en "Generando QR…" hasta un refresco manual.
watch(
    () => robots.value.map(r => r.id).join('|'),
    generateQrCodes,
    { immediate: true }
)

/** Refresco manual - sigue siendo útil tras mutaciones (conectar/desconectar/actualizar). */
const fetchRobots = async () => {
    try {
        const fresh = await robotService.fetchAll()
        robots.value = fresh
        errorRobots.value = null
        generateQrCodes()  // cubre el caso en que fetch reemplaza la lista con los mismos ids (el watch no se re-dispararía)
    } catch (err) {
        errorRobots.value = 'No se pudo obtener la lista de robots.'
    } finally {
        loadingRobots.value = false
    }
}

// CRUD de robots (crear / editar / borrar) centralizado en useCrud.
// Robots comparten un único formulario para crear y editar (sharedForm).
const {
    form:         robotForm,
    error:        robotError,
    success:      robotSuccess,
    showCreate:   showRobotModal,
    showEdit:     showEditRobotModal,
    showDelete:   showDeleteRobotModal,
    deleteTarget: deleteRobotTarget,
    deleteError:  deleteRobotError,
    openCreate:   openRobotModal,
    openEdit:     openEditRobotModal,
    openDelete:   openDeleteRobotModal,
    create:       handleCreateRobot,
    update:       handleEditRobot,
    remove:       handleDeleteRobot,
} = useCrud({
    refetch:    fetchRobots,
    sharedForm: true,
    blankForm:  () => ({ id: '', name: '', museum_id: '', ip: '' }),
    toEditForm: (robot) => ({ id: robot.id, name: robot.name, museum_id: robot.museum_id, ip: robot.ip || '127.0.0.1' }),
    createFn:   (f) => robotService.create(f.name, f.museum_id),
    updateFn:   (f) => robotService.update(f.id, { name: f.name, ip: f.ip, museum_id: f.museum_id || null }),
    removeFn:   (t) => robotService.remove(t.id),
    messages: {
        created:     'Robot creado correctamente.',
        updated:     'Robot actualizado correctamente.',
        createError: 'Error al crear robot',
        updateError: 'Error al actualizar robot',
        deleteError: 'Error al eliminar robot',
    },
})

const pendingCommandId = ref(null)
const commandError = ref(null)   // { id, message } | null - acotado al robot que falla

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

// ---------------- PERSONAL ----------------
// Los filtros y el helper de estado viven en StaffTab (solo se usan allí).
const staff = ref([])
const loadingStaff = ref(false)

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

// CRUD de personal centralizado en useCrud. Crear y editar usan formularios
// distintos (staffForm / editStaffForm); el borrado no muestra error en la UI.
const {
    form:         staffForm,
    editForm:     editStaffForm,
    error:        staffError,
    success:      staffSuccess,
    showCreate:   showStaffModal,
    showEdit:     showEditStaffModal,
    showDelete:   showDeleteStaffModal,
    deleteTarget: deleteStaffTarget,
    openCreate:   openStaffModal,
    openEdit:     openEditStaffModal,
    openDelete:   openDeleteStaffModal,
    create:       handleCreateStaff,
    update:       handleEditStaff,
    remove:       handleDeleteStaff,
} = useCrud({
    refetch:         fetchStaff,
    showDeleteError: false,
    delays:          { create: 2000 },
    blankForm:       () => ({ name: '', email: '', role: 'technician', museum_id: user.value?.museum_id || '' }),
    blankEditForm:   () => ({ id: '', name: '', email: '', role: '' }),
    toEditForm:      (member) => ({ id: member.id, name: member.name, email: member.email, role: member.role }),
    createFn:        (f) => authService.createStaff(f.name, f.email, f.role, f.museum_id),
    updateFn:        (f) => authService.updateStaff(f.id, { name: f.name, email: f.email, role: f.role }),
    removeFn:        (t) => authService.deleteStaff(t.id),
    messages: {
        created:     'Invitación enviada. El usuario activará su cuenta en el primer inicio de sesión.',
        updated:     'Usuario actualizado correctamente.',
        createError: 'Error al crear personal',
        updateError: 'Error al actualizar usuario',
    },
})

const handleToggleActive = async (member) => {
    try {
        await authService.toggleStaffActive(member.id)
        await fetchStaff()
    } catch (err) {
        console.error(err)
    }
}

// ---------------- MUSEOS ----------------
const museums = ref([])
const loadingMuseums = ref(false)

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

// CRUD de museos centralizado en useCrud (formularios crear/editar separados).
const {
    form:         museumForm,
    editForm:     editMuseumForm,
    error:        museumError,
    success:      museumSuccess,
    showCreate:   showMuseumModal,
    showEdit:     showEditMuseumModal,
    showDelete:   showDeleteMuseumModal,
    deleteTarget: deleteMuseumTarget,
    deleteError:  deleteMuseumError,
    openCreate:   openMuseumModal,
    openEdit:     openEditMuseumModal,
    openDelete:   openDeleteMuseumModal,
    create:       handleCreateMuseum,
    update:       handleUpdateMuseum,
    remove:       handleDeleteMuseum,
} = useCrud({
    refetch:       fetchMuseums,
    blankForm:     () => ({ name: '', company: '' }),
    blankEditForm: () => ({ id: '', name: '', company: '' }),
    toEditForm:    (museum) => ({ id: museum.id, name: museum.name, company: museum.company }),
    createFn:      (f) => museumService.create(f),
    updateFn:      (f) => museumService.update(f.id, { name: f.name, company: f.company }),
    removeFn:      (t) => museumService.remove(t.id),
    messages: {
        created:     'Museo creado correctamente.',
        updated:     'Museo actualizado correctamente.',
        createError: 'Error al crear museo',
        updateError: 'Error al actualizar museo',
        deleteError: 'Error al eliminar museo',
    },
})

// ---------------- ESTADÍSTICAS ----------------
const statsTabRef = ref(null)

// ---------------- INCIDENCIAS ----------------
const incidentsTabRef = ref(null)
const hasNewIncident  = ref(false)   // punto de notificación de fallo de navegación sin ver

const openIncidentsTab = () => {
    activeTab.value = 'incidents'
    hasNewIncident.value = false
    incidentsTabRef.value?.refresh()
}

// ---------------- REFRESCO GLOBAL DE PESTAÑAS ----------------
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

        <!-- Navegación de pestañas personalizada -->
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

        <!-- PESTAÑA: ROBOTS -->
        <RobotsTab
            v-show="activeTab === 'robots'"
            :robots="robots"
            :museums="museums"
            :loading="loadingRobots"
            :error="errorRobots"
            :qr-codes="qrCodes"
            :pending-command-id="pendingCommandId"
            :command-error="commandError"
            @create="openRobotModal"
            @edit="openEditRobotModal"
            @delete="openDeleteRobotModal"
            @command="sendCommand"
            @end-visit="handleEndVisit"
            @open-control="openRobotControl"
            @show-incidents="openIncidentsTab" />

        <!-- PESTAÑA: PERSONAL -->
        <StaffTab
            v-if="isMuseumAdmin" v-show="activeTab === 'staff'"
            :staff="staff"
            :museums="museums"
            :loading="loadingStaff"
            @create="openStaffModal"
            @edit="openEditStaffModal"
            @toggle-active="handleToggleActive"
            @delete="openDeleteStaffModal" />

        <!-- PESTAÑA: MUSEOS -->
        <MuseumsTab
            v-if="isMuseumAdmin" v-show="activeTab === 'museums'"
            :museums="museums"
            @create="openMuseumModal"
            @edit="openEditMuseumModal"
            @delete="openDeleteMuseumModal" />

        <!-- PESTAÑA: HISTORIAL -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'history'">
            <ChatHistoryTab />
        </div>

        <!-- PESTAÑA: MAPA -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'map'">
            <MapTab :robots="robots" />
        </div>

        <!-- PESTAÑA: ESTADÍSTICAS -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'stats'">
            <StatsTab ref="statsTabRef" />
        </div>

        <!-- PESTAÑA: INCIDENCIAS -->
        <div v-if="isMuseumAdmin" v-show="activeTab === 'incidents'">
            <IncidentsTab ref="incidentsTabRef" />
        </div>


        <!-- MODAL DE EDITAR ROBOT -->
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

        <!-- MODAL DE CREAR PERSONAL -->
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

        <!-- MODAL DE EDITAR PERSONAL -->
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

        <!-- MODAL DE CONFIRMAR ELIMINACIÓN DE PERSONAL -->
        <ConfirmDeleteModal
            :show="showDeleteStaffModal"
            title="Eliminar cuenta"
            @cancel="showDeleteStaffModal = false"
            @confirm="handleDeleteStaff">
            Se eliminará la cuenta de <strong class="text-foreground">{{ deleteStaffTarget?.name }}</strong>.
            Solo es posible eliminar cuentas que aún no han sido activadas.
        </ConfirmDeleteModal>

        <!-- MODAL DE ROBOT -->
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

        <!-- MODAL DE MUSEO -->
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

        <!-- MODAL DE EDITAR MUSEO -->
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

        <!-- MODAL DE CONFIRMAR ELIMINACIÓN DE MUSEO -->
        <ConfirmDeleteModal
            :show="showDeleteMuseumModal"
            title="Eliminar museo"
            :error="deleteMuseumError"
            @cancel="showDeleteMuseumModal = false"
            @confirm="handleDeleteMuseum">
            Se eliminará <strong class="text-foreground">{{ deleteMuseumTarget?.name }}</strong> y, en cascada,
            <strong class="text-foreground">todos sus usuarios, robots, mapas, zonas e historial de visitas</strong>.
        </ConfirmDeleteModal>

        <!-- MODAL DE CONFIRMAR ELIMINACIÓN DE ROBOT -->
        <ConfirmDeleteModal
            :show="showDeleteRobotModal"
            title="Eliminar robot"
            :error="deleteRobotError"
            @cancel="showDeleteRobotModal = false"
            @confirm="handleDeleteRobot">
            Se eliminará el robot <strong class="text-foreground">{{ deleteRobotTarget?.name }}</strong> junto con
            <strong class="text-foreground">su historial de visitas, chat e incidencias</strong>.
        </ConfirmDeleteModal>
    </div>
</template>
