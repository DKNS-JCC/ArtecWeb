<script setup>
/**
 * @file Pestaña de gestión de personal del panel de administración.
 * @module components/dashboard/StaffTab
 *
 * Recibe la lista de personal y de museos por props; los filtros de búsqueda
 * (texto, rol, estado, museo) son estado local de la pestaña. Emite los eventos
 * de crear/editar/activar/borrar; el CRUD y los modales viven en DashboardView.
 */
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Users, Pencil, EyeOff, Eye, Trash2 } from 'lucide-vue-next'

const props = defineProps({
    staff:   { type: Array, default: () => [] },
    museums: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
})

defineEmits(['create', 'edit', 'toggle-active', 'delete'])

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)

const staffSearch = ref('')
const staffRoleFilter = ref('all')
const staffStatusFilter = ref('all')
const staffMuseumFilter = ref('all')

const getStaffStatus = (member) => {
    if (member.active === 0 && member.must_change_password === 1) return 'pending'
    if (member.active === 1) return 'active'
    return 'inactive'
}

const filteredStaff = computed(() => props.staff.filter(m => {
    const q = staffSearch.value.toLowerCase()
    const matchSearch = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    const matchRole = staffRoleFilter.value === 'all' || m.role === staffRoleFilter.value
    const matchStatus = staffStatusFilter.value === 'all' || getStaffStatus(m) === staffStatusFilter.value
    const matchMuseum = staffMuseumFilter.value === 'all' || m.museum_id === staffMuseumFilter.value
    return matchSearch && matchRole && matchStatus && matchMuseum
}))
</script>

<template>
    <div>
        <!-- Cabecera -->
        <div class="flex justify-between items-center mb-6">
            <div>
                <h2 class="font-display text-xl font-medium tracking-tight text-foreground">Gestión de Personal</h2>
                <p class="text-sm text-muted-foreground mt-0.5">
                    {{ staff.length }} miembro{{ staff.length !== 1 ? 's' : '' }} registrado{{ staff.length !== 1 ? 's' : '' }}
                </p>
            </div>
            <Button @click="$emit('create')" class="gap-2">
                <Plus class="w-4 h-4" /> Añadir Personal
            </Button>
        </div>

        <!-- Barra de herramientas -->
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

        <!-- Tabla -->
        <div class="border border-border rounded-md overflow-hidden bg-card">
            <div v-if="loading" class="flex justify-center items-center h-32">
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

                        <!-- Avatar + nombre + email -->
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

                        <!-- Insignia de rol -->
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

                        <!-- Insignia de estado -->
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

                        <!-- Museo -->
                        <td v-if="isPlatformAdmin" class="px-6 py-4 text-xs text-muted-foreground">
                            {{ member.museum_name || '-' }}
                        </td>

                        <!-- Fecha -->
                        <td class="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                            {{ new Date(member.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) }}
                        </td>

                        <!-- Acciones -->
                        <td class="px-6 py-4">
                            <div class="flex items-center justify-end gap-1">
                                <Button @click="$emit('edit', member)" variant="ghost" size="icon" class="h-8 w-8" title="Editar">
                                    <Pencil class="w-3.5 h-3.5" />
                                </Button>
                                <Button v-if="getStaffStatus(member) !== 'pending'"
                                    @click="$emit('toggle-active', member)"
                                    variant="ghost" size="icon" class="h-8 w-8"
                                    :title="member.active ? 'Desactivar cuenta' : 'Activar cuenta'">
                                    <EyeOff v-if="member.active" class="w-3.5 h-3.5 text-muted-foreground" />
                                    <Eye v-else class="w-3.5 h-3.5 text-primary" />
                                </Button>
                                <Button v-if="getStaffStatus(member) === 'pending'"
                                    @click="$emit('delete', member)"
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
</template>
