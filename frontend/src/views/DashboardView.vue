<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { api } from '@/services/api'
import { robotService } from '@/services/robotService'
import { authService } from '@/services/authService'
import { museumService } from '@/services/museumService'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { RefreshCw, Zap, MapPin, Plus, X, Building2, Users, BarChart3, Clock, Settings, Wifi, Search, Pencil, Eye, EyeOff, Trash2, ShieldAlert } from 'lucide-vue-next'

const authStore = useAuthStore()
const user = computed(() => authStore.user)
const isMuseumAdmin = computed(() => authStore.isMuseumAdmin)
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)

const activeTab = ref('robots')
const originUrl = window?.location?.origin || ''

// ---------------- ROBOTS ----------------
const robots = ref([])
const loadingRobots = ref(true)
const errorRobots = ref(null)
let intervalId = null

const fetchRobots = async () => {
    loadingRobots.value = true
    try {
        robots.value = await robotService.fetchAll()
        errorRobots.value = null
    } catch (err) {
        errorRobots.value = 'No se pudo conectar con el servidor para obtener los robots.'
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
            ip: robotForm.value.ip
        })
        robotSuccess.value = 'Robot actualizado correctamente.'
        await fetchRobots()
        setTimeout(() => showEditRobotModal.value = false, 1500)
    } catch (err) {
        robotError.value = err.message || 'Error al actualizar robot'
    }
}

const sendCommand = async (id, command) => {
    try {
        const payload = command === 'move' ? { linearX: 0.5, angularZ: 0.0 } : null
        await robotService.sendCommand(id, command, payload)
        await fetchRobots()
    } catch (err) { }
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

// ---------------- STATS ----------------
const stats = ref({
    totalRobots: 0,
    activeRobots: 0,
    totalVisitors: 0,
    avgSessionTime: 0,
    totalMuseums: 0
})

const fetchStats = async () => {
    try {
        const data = await api.get('/admin/stats')
        stats.value = data
    } catch (e) {
        console.error("Error fetching stats:", e)
    }
}

// ---------------- GLOBAL TAB REFRESH ----------------
const refreshCurrentTab = () => {
    if (activeTab.value === 'robots') fetchRobots()
    if (activeTab.value === 'staff') fetchStaff()
    if (activeTab.value === 'museums') fetchMuseums()
    if (activeTab.value === 'stats') fetchStats()
}

onMounted(() => {
    fetchRobots()
    if (isMuseumAdmin.value || isPlatformAdmin.value) fetchStaff()
    if (isPlatformAdmin.value) fetchMuseums()
    fetchStats()
    intervalId = setInterval(() => { 
        if (activeTab.value === 'robots') fetchRobots() 
        if (activeTab.value === 'stats') fetchStats()
    }, 3000)
})

onUnmounted(() => {
    if (intervalId) clearInterval(intervalId)
})
</script>

<template>
    <div class="px-4 py-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)] relative">
        <div class="flex justify-between items-center mb-6">
            <div>
                <h1 class="text-3xl font-bold tracking-tight text-foreground">Panel de Control</h1>
                <p class="text-muted-foreground mt-1">Gestión administrativa de Artec Robotics.</p>
            </div>
            <Button @click="refreshCurrentTab" variant="secondary" size="icon" class="rounded-full"
                title="Actualizar datos">
                <RefreshCw class="w-5 h-5" />
            </Button>
        </div>

        <!-- Custom Tabs Navigation -->
        <div class="flex gap-2 border-b border-border mb-8 overflow-x-auto">
            <button @click="activeTab = 'robots'" class="px-4 py-2 text-sm font-medium transition-colors border-b-2"
                :class="activeTab === 'robots' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                Flota de Robots
            </button>
            <button v-if="isMuseumAdmin || isPlatformAdmin" @click="activeTab = 'staff'"
                class="px-4 py-2 text-sm font-medium transition-colors border-b-2"
                :class="activeTab === 'staff' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                Personal
            </button>
            <button v-if="isPlatformAdmin" @click="activeTab = 'museums'"
                class="px-4 py-2 text-sm font-medium transition-colors border-b-2"
                :class="activeTab === 'museums' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                Gestión de Museos
            </button>
            <button @click="activeTab = 'stats'"
                class="px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
                :class="activeTab === 'stats' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'">
                <BarChart3 class="w-4 h-4" /> Estadísticas
            </button>
        </div>

        <!-- TAB: ROBOTS -->
        <div v-show="activeTab === 'robots'">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-bold">Gestión de Robots</h2>
                <Button v-if="isPlatformAdmin" @click="openRobotModal" class="flex gap-2 items-center">
                    <Plus class="w-4 h-4" /> Crear Robot
                </Button>
            </div>
            <div v-if="loadingRobots" class="flex justify-center items-center h-64">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
            <Alert v-else-if="errorRobots" variant="destructive" class="p-6 mb-6">
                <h3 class="font-bold">Error de Conexión</h3>
                <p>{{ errorRobots }}</p>
            </Alert>
            <div v-else-if="robots.length === 0"
                class="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed border-border rounded-xl">
                <p>No se encontraron robots asignados a tu perfil.</p>
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Robots Card Loop -->
                <Card v-for="robot in robots" :key="robot.id"
                    class="p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h2 class="text-xl font-bold text-foreground">{{ robot.name }}</h2>
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
                            <span v-if="robot.connected" class="font-mono bg-secondary px-2 py-0.5 rounded text-xs text-secondary-foreground">
                                x:{{ (robot.position?.x || 0).toFixed(1) }}, y:{{ (robot.position?.y || 0).toFixed(1) }}
                            </span>
                            <span v-else class="text-xs text-muted-foreground italic">Sin Telemetría</span>
                        </div>
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-muted-foreground flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Ocupación
                            </span>
                            <span v-if="robot.is_occupied" class="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-semibold">
                                Ocupado por: {{ robot.visitor_name }}
                            </span>
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
                                <span :class="robot.connected ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'" class="px-2 py-0.5 rounded text-xs font-semibold">
                                    {{ robot.connected ? 'Conectado' : 'Desconectado' }}
                                </span>
                                <Button v-if="isPlatformAdmin" @click="openEditRobotModal(robot)" variant="ghost" size="icon" class="h-6 w-6 ml-1">
                                    <Settings class="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div class="border-t border-border pt-4 flex flex-col gap-2">
                        <div class="flex gap-2">
                            <Button v-if="!robot.connected" @click="sendCommand(robot.id, 'connect')" size="sm" class="flex-1 bg-green-600 hover:bg-green-700 text-white">
                                Conectar
                            </Button>
                            <Button v-else @click="sendCommand(robot.id, 'disconnect')" size="sm" variant="destructive" class="flex-1">
                                Desconectar
                            </Button>
                        </div>
                        <div class="flex gap-2">
                            <Button @click="sendCommand(robot.id, 'move')" :disabled="!robot.connected" size="sm" class="flex-1">Mover</Button>
                            <Button @click="sendCommand(robot.id, 'stop')" :disabled="!robot.connected" variant="secondary" size="sm" class="flex-1">Detener</Button>
                            <Button @click="sendCommand(robot.id, 'charge')" :disabled="!robot.connected" variant="outline" size="sm" class="flex-1">Cargar</Button>
                        </div>
                    </div>                      <div class="mt-4 pt-4 border-t border-border flex flex-col gap-2">
                        <div class="mt-2 text-center">
                            <img :src="'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(originUrl + '/r/' + robot.id)" alt="QR Code" class="w-24 h-24 mx-auto" />
                            <Button as="a" :href="'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(originUrl + '/r/' + robot.id)" target="_blank" size="sm" class="mt-2"
                            >Descargar</Button>
                            <Button @click="window.open(originUrl + '/r/' + robot.id, '_blank')" variant="outline" size="sm" class="mt-2"
                            >Test</Button>
                        </div>
                      </div>                </Card>
            </div>
        </div>

        <!-- TAB: STAFF -->
        <div v-show="activeTab === 'staff'">
            <!-- Header -->
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2 class="text-xl font-bold text-foreground">Gestión de Personal</h2>
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
                    class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="all">Todos los roles</option>
                    <option value="museum_admin">Administrador</option>
                    <option value="technician">Técnico</option>
                </select>
                <select v-model="staffStatusFilter"
                    class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="all">Todos los estados</option>
                    <option value="active">Activo</option>
                    <option value="pending">Pendiente</option>
                    <option value="inactive">Inactivo</option>
                </select>
                <select v-if="isPlatformAdmin" v-model="staffMuseumFilter"
                    class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="all">Todos los museos</option>
                    <option v-for="m in museums" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
            </div>

            <!-- Table -->
            <div class="border border-border rounded-xl overflow-hidden bg-card">
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
                                {{ member.museum_name || '—' }}
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
        <div v-show="activeTab === 'museums'">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold text-foreground">Museos Integrados</h2>
                <Button @click="openMuseumModal" class="gap-2">
                    <Plus class="w-4 h-4" /> Añadir Museo
                </Button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div v-if="museums.length === 0"
                    class="col-span-full p-12 text-center border dashed border-border rounded-xl text-muted-foreground">
                    No hay museos registrados actualmente en el sistema.
                </div>
                <Card v-for="museum in museums" :key="museum.id" class="p-6">
                    <div class="flex items-center gap-4 mb-4">
                        <div class="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                            <Building2 class="w-6 h-6" />
                        </div>
                        <div>
                            <h3 class="font-bold text-lg text-foreground leading-tight">{{ museum.name }}</h3>
                            <p class="text-sm text-muted-foreground">{{ museum.company }}</p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>

        <!-- TAB: STATS -->
        <div v-show="activeTab === 'stats'">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold text-foreground">Estadísticas del Sistema</h2>
                <Button @click="fetchStats" variant="outline" size="sm" class="gap-2">
                    <RefreshCw class="w-4 h-4" /> Recargar
                </Button>
            </div>
            
            <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card v-if="isPlatformAdmin">
                    <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
                        <div class="text-sm font-medium">Museos Registrados</div>
                        <Building2 class="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div class="text-2xl font-bold">{{ stats.totalMuseums || 0 }}</div>
                        <p class="text-xs text-muted-foreground mt-1">Activos en la plataforma</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
                        <div class="text-sm font-medium">Total de Robots</div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted-foreground"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                    </CardHeader>
                    <CardContent>
                        <div class="text-2xl font-bold">{{ stats.totalRobots || 0 }}</div>
                        <p class="text-xs text-muted-foreground mt-1">
                            <span class="text-green-500 font-medium">{{ stats.activeRobots || 0 }} en operación</span>
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
                        <div class="text-sm font-medium">Total Visitantes</div>
                        <Users class="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div class="text-2xl font-bold">{{ stats.totalVisitors || 0 }}</div>
                        <p class="text-xs text-muted-foreground mt-1">Interacciones registradas</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
                        <div class="text-sm font-medium">Tiempo Promedio</div>
                        <Clock class="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div class="text-2xl font-bold">{{ stats.avgSessionTime > 0 ? stats.avgSessionTime + ' min' : '0 min' }}</div>
                        <p class="text-xs text-muted-foreground mt-1">Duración de visita x interacción</p>
                    </CardContent>
                </Card>
            </div>
            
            <div class="mt-8">
                <Card class="border shadow-none">
                    <CardHeader>
                        <h3 class="text-lg font-semibold">Resumen Rápido</h3>
                    </CardHeader>
                    <CardContent>
                        <p class="text-muted-foreground text-sm">
                            Este panel te permite monitorizar el estado general. Los datos provienen en tiempo real de las bases de datos de sesión.
                            <template v-if="isPlatformAdmin">Como Super Administrador, ves las métricas globales para mejorar la escalabilidad del sistema y entender el retorno de inversión.</template>
                            <template v-else>Como Administrador de Museo, puedes ver las métricas relativas a la interacción de los robots dentro de tu propio emplazamiento.</template>
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>

        <!-- MODALS (Rendered outside normal flow) -->

        <!-- EDIT ROBOT MODAL -->
        <div v-if="showEditRobotModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-md shadow-2xl relative border-border animate-in fade-in zoom-in duration-200">
                <button @click="showEditRobotModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">
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
                        <Alert v-if="robotError" variant="destructive">
                            {{ robotError }}
                        </Alert>
                        <Alert v-if="robotSuccess" class="border-green-500/50 text-green-600 bg-green-500/10">
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
            <Card class="w-full max-w-md shadow-2xl relative border-border animate-in fade-in zoom-in duration-200">
                <button @click="showStaffModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="text-xl font-bold mb-1 flex items-center gap-2">
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
                                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <option v-if="isPlatformAdmin" value="museum_admin">Administrador</option>
                                    <option value="technician">Técnico</option>
                                </select>
                            </div>
                            <div class="space-y-2" v-if="isPlatformAdmin">
                                <Label for="staff_museum">Museo</Label>
                                <select id="staff_museum" v-model="staffForm.museum_id" required
                                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <option value="" disabled>Seleccionar…</option>
                                    <option v-for="m in museums" :key="m.id" :value="m.id">{{ m.name }}</option>
                                </select>
                            </div>
                        </div>
                        <div class="bg-secondary/50 p-3 rounded-lg text-sm text-muted-foreground border border-border">
                            Se enviará un correo a <strong>{{ staffForm.email || '…' }}</strong> con credenciales temporales.
                        </div>
                        <Alert v-if="staffError" variant="destructive"><p>{{ staffError }}</p></Alert>
                        <Alert v-if="staffSuccess" class="bg-green-500/10 text-green-600 border-green-500/20"><p>{{ staffSuccess }}</p></Alert>
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
            <Card class="w-full max-w-md shadow-2xl relative border-border animate-in fade-in zoom-in duration-200">
                <button @click="showEditStaffModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
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
                                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <option v-if="isPlatformAdmin" value="museum_admin">Administrador</option>
                                <option value="technician">Técnico</option>
                            </select>
                        </div>
                        <Alert v-if="staffError" variant="destructive"><p>{{ staffError }}</p></Alert>
                        <Alert v-if="staffSuccess" class="bg-green-500/10 text-green-600 border-green-500/20"><p>{{ staffSuccess }}</p></Alert>
                        <Button type="submit" class="w-full" :disabled="!editStaffForm.name || !editStaffForm.email">Guardar Cambios</Button>
                    </form>
                </div>
            </Card>
        </div>

        <!-- STAFF DELETE CONFIRM MODAL -->
        <div v-if="showDeleteStaffModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-sm shadow-2xl border-border animate-in fade-in zoom-in duration-200">
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                            <ShieldAlert class="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                            <h2 class="font-bold text-foreground">Eliminar cuenta</h2>
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
            <Card class="w-full max-w-md shadow-2xl relative border-border animate-in fade-in zoom-in duration-200">
                <button @click="showRobotModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">
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
                                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                                <option value="" disabled selected>Selecciona un museo</option>
                                <option v-for="m in museums" :key="m.id" :value="m.id">
                                    {{ m.name }}
                                </option>
                            </select>
                        </div>
                        <Alert v-if="robotError" variant="destructive">
                            {{ robotError }}
                        </Alert>
                        <Alert v-if="robotSuccess"
                            class="border-green-500/50 text-green-600 bg-green-500/10">
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
            <Card class="w-full max-w-md shadow-2xl relative border-border animate-in fade-in zoom-in duration-200">
                <button @click="showMuseumModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">
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
                        <Alert v-if="museumSuccess" variant="success"
                            class="mb-4 bg-green-500/10 text-green-600 border-green-500/20">
                            <p>{{ museumSuccess }}</p>
                        </Alert>

                        <Button type="submit" class="w-full mt-2"
                            :disabled="!museumForm.name || !museumForm.company">Registrar Museo</Button>
                    </form>
                </div>
            </Card>
        </div>
    </div>
</template>
