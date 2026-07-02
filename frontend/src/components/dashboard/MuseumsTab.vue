<script setup>
/**
 * @file Pestaña de gestión de museos del panel de administración.
 * @module components/dashboard/MuseumsTab
 *
 * Componente presentacional: recibe la lista de museos por prop y emite los
 * eventos de crear/editar/borrar. El estado y el CRUD viven en la vista padre
 * (DashboardView), que también aloja los modales.
 */
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2, Plus, Pencil, Trash2 } from 'lucide-vue-next'

defineProps({
    museums: { type: Array, default: () => [] },
})

defineEmits(['create', 'edit', 'delete'])
</script>

<template>
    <div>
        <div class="flex justify-between items-center mb-6">
            <h2 class="font-display text-xl font-medium tracking-tight text-foreground">Museos Integrados</h2>
            <Button @click="$emit('create')" class="gap-2">
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
                    <Button variant="outline" size="sm" class="flex-1 gap-1.5" @click="$emit('edit', museum)">
                        <Pencil class="w-3.5 h-3.5" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" class="gap-1.5 text-destructive hover:text-destructive" @click="$emit('delete', museum)">
                        <Trash2 class="w-3.5 h-3.5" /> Eliminar
                    </Button>
                </div>
            </Card>
        </div>
    </div>
</template>
