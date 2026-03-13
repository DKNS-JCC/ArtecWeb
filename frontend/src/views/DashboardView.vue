<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { robotService } from '@/services/robotService'
import { authService } from '@/services/authService'
import { museumService } from '@/services/museumService'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { RefreshCw, Zap, MapPin, Plus, X, Building2, Users } from 'lucide-vue-next'

const authStore = useAuthStore()
const user = computed(() => authStore.user)
const isMuseumAdmin = computed(() => authStore.isMuseumAdmin)
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)

const activeTab = ref('robots')

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

const sendCommand = async (id, command) => {
    try {
        const payload = command === 'move' ? { x: Math.random() * 10, y: Math.random() * 10 } : null
        await robotService.sendCommand(id, command, payload)
        await fetchRobots()
    } catch (err) { }
}

// ---------------- STAFF ----------------
const staff = ref([])
const loadingStaff = ref(false)
const showStaffModal = ref(false)
const staffError = ref(null)
const staffSuccess = ref(null)
const staffForm = ref({ name: '', email: '', role: 'technician', museum_id: '' })

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
        staffSuccess.value = 'Personal creado. Se ha enviado un email con sus credenciales.'
        await fetchStaff()
        setTimeout(() => showStaffModal.value = false, 2000)
    } catch (err) {
        staffError.value = err.message || 'Error al crear personal'
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

// ---------------- GLOBAL TAB REFRESH ----------------
const refreshCurrentTab = () => {
    if (activeTab.value === 'robots') fetchRobots()
    if (activeTab.value === 'staff') fetchStaff()
    if (activeTab.value === 'museums') fetchMuseums()
}

onMounted(() => {
    fetchRobots()
    if (isMuseumAdmin.value || isPlatformAdmin.value) fetchStaff()
    if (isPlatformAdmin.value) fetchMuseums()
    intervalId = setInterval(() => { if (activeTab.value === 'robots') fetchRobots() }, 3000)
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
        </div>

        <!-- TAB: ROBOTS -->
        <div v-show="activeTab === 'robots'">
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
                                <span v-if="robot.status === 'moving'"
                                    class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-3 w-3" :class="{
                                    'bg-green-500': robot.status === 'idle',
                                    'bg-blue-500': robot.status === 'moving',
                                    'bg-yellow-500': robot.status === 'charging',
                                    'bg-red-500': robot.status === 'error',
                                }"></span>
                            </span>
                            <span class="text-sm font-medium capitalize text-foreground">{{ robot.status }}</span>
                        </div>
                    </div>
                    <div class="space-y-3 mb-6">
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-muted-foreground flex items-center gap-1">
                                <Zap class="w-4 h-4" /> Batería
                            </span>
                            <div class="flex items-center gap-2">
                                <div class="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                                    <div class="h-full rounded-full"
                                        :class="robot.battery > 20 ? 'bg-green-500' : 'bg-red-500'"
                                        :style="{ width: `${robot.battery}%` }"></div>
                                </div>
                                <span class="font-medium w-8 text-right text-foreground">{{ robot.battery }}%</span>
                            </div>
                        </div>
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-muted-foreground flex items-center gap-1">
                                <MapPin class="w-4 h-4" /> Posición
                            </span>
                            <span class="font-mono bg-secondary px-2 py-0.5 rounded text-xs text-secondary-foreground">
                                x:{{ robot.position.x.toFixed(1) }}, y:{{ robot.position.y.toFixed(1) }}
                            </span>
                        </div>
                    </div>
                    <div class="border-t border-border pt-4 flex gap-2">
                        <Button @click="sendCommand(robot.id, 'move')" :disabled="robot.status === 'moving'" size="sm"
                            class="flex-1">Mover</Button>
                        <Button @click="sendCommand(robot.id, 'stop')" :disabled="robot.status === 'idle'"
                            variant="secondary" size="sm" class="flex-1">Detener</Button>
                        <Button @click="sendCommand(robot.id, 'charge')" :disabled="robot.status === 'charging'"
                            variant="outline" size="sm" class="flex-1">Cargar</Button>
                    </div>
                </Card>
            </div>
        </div>

        <!-- TAB: STAFF -->
        <div v-show="activeTab === 'staff'">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold text-foreground">Gestión de Personal</h2>
                <Button @click="openStaffModal" class="gap-2">
                    <Plus class="w-4 h-4" /> Añadir Personal
                </Button>
            </div>

            <div class="border border-border rounded-xl overflow-hidden bg-card">
                <table class="w-full text-sm text-left">
                    <thead class="bg-secondary/50 text-muted-foreground uppercase text-xs">
                        <tr>
                            <th class="px-6 py-4 font-medium">Usuario</th>
                            <th class="px-6 py-4 font-medium">Email</th>
                            <th class="px-6 py-4 font-medium">Rol</th>
                            <th v-if="isPlatformAdmin" class="px-6 py-4 font-medium">Museo</th>
                            <th class="px-6 py-4 font-medium">Fecha de alta</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        <tr v-if="staff.length === 0">
                            <td :colspan="isPlatformAdmin ? 5 : 4" class="px-6 py-8 text-center text-muted-foreground">
                                No
                                hay personal registrado</td>
                        </tr>
                        <tr v-for="member in staff" :key="member.id" class="hover:bg-muted/50 transition-colors">
                            <td class="px-6 py-4 font-medium text-foreground">{{ member.name }}</td>
                            <td class="px-6 py-4 text-muted-foreground">{{ member.email }}</td>
                            <td class="px-6 py-4">
                                <span class="px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
                                    :class="{ 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400': member.role === 'platform_admin', 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400': member.role === 'museum_admin', 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400': member.role === 'technician', 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400': member.role === 'user' }">
                                    {{ member.role }}
                                </span>
                            </td>
                            <td v-if="isPlatformAdmin" class="px-6 py-4 text-muted-foreground">{{ member.museum_name ||
                                'Global' }}</td>
                            <td class="px-6 py-4 text-muted-foreground">{{ new
                                Date(member.created_at).toLocaleDateString() }}</td>
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

        <!-- MODALS (Rendered outside normal flow) -->

        <!-- STAFF MODAL -->
        <div v-if="showStaffModal"
            class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card class="w-full max-w-md shadow-2xl relative border-border animate-in fade-in zoom-in duration-200">
                <button @click="showStaffModal = false"
                    class="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                    <X class="w-5 h-5" />
                </button>
                <div class="p-6">
                    <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Users class="w-6 h-6 text-primary" /> Crear Personal
                    </h2>
                    <form @submit.prevent="handleCreateStaff" class="space-y-4">
                        <div class="space-y-2">
                            <Label for="name">Nombre</Label>
                            <Input id="name" v-model="staffForm.name" required placeholder="ej: Juan Pérez" />
                        </div>
                        <div class="space-y-2">
                            <Label for="email">Correo Electrónico</Label>
                            <Input id="email" type="email" v-model="staffForm.email" required
                                placeholder="correo@ejemplo.com" />
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <Label for="role">Rol</Label>
                                <select id="role" v-model="staffForm.role"
                                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                    <option v-if="isPlatformAdmin" value="museum_admin">Administrador</option>
                                    <option value="technician">Técnico</option>
                                </select>
                            </div>
                            <div class="space-y-2" v-if="isPlatformAdmin">
                                <Label for="museum_id">Asignar Museo</Label>
                                <select id="museum_id" v-model="staffForm.museum_id" required
                                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                    <option value="" disabled>Seleccionar...</option>
                                    <option v-for="m in museums" :key="m.id" :value="m.id">{{ m.name }}</option>
                                </select>
                            </div>
                        </div>

                        <div
                            class="bg-secondary/50 p-3 rounded-lg text-sm text-muted-foreground mt-4 mb-4 border border-border">
                            Se enviará un correo a <strong>{{ staffForm.email || '...' }}</strong> con una contraseña
                            segura temporal obligando su cambio en el próximo inicio de sesión.
                        </div>

                        <Alert v-if="staffError" variant="destructive" class="mb-4">
                            <p>{{ staffError }}</p>
                        </Alert>
                        <Alert v-if="staffSuccess" variant="success"
                            class="mb-4 bg-green-500/10 text-green-600 border-green-500/20">
                            <p>{{ staffSuccess }}</p>
                        </Alert>

                        <Button type="submit" class="w-full"
                            :disabled="!staffForm.name || !staffForm.email || !staffForm.role || (isPlatformAdmin && !staffForm.museum_id)">Crear
                            Cuenta</Button>
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
