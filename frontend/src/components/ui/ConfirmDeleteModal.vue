<script setup>
/**
 * @file Modal de confirmación de borrado reutilizable.
 * @module components/ui/ConfirmDeleteModal
 *
 * Unifica los diálogos de "Eliminar X" (robot / cuenta / museo), que eran
 * idénticos salvo el título y el texto de advertencia. El mensaje se pasa por
 * el slot por defecto para conservar el HTML propio de cada caso (negritas, etc.).
 */
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { ShieldAlert } from 'lucide-vue-next'

defineProps({
    show:     { type: Boolean, default: false },
    title:    { type: String, required: true },
    subtitle: { type: String, default: 'Esta acción no se puede deshacer' },
    error:    { type: String, default: null },
})

defineEmits(['confirm', 'cancel'])
</script>

<template>
    <div v-if="show"
        class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <Card class="w-full max-w-sm">
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <ShieldAlert class="w-5 h-5 text-destructive" />
                    </div>
                    <div>
                        <h2 class="font-display font-medium tracking-tight text-foreground">{{ title }}</h2>
                        <p class="text-sm text-muted-foreground">{{ subtitle }}</p>
                    </div>
                </div>
                <p class="text-sm text-muted-foreground mb-6">
                    <slot />
                </p>
                <Alert v-if="error" variant="destructive" class="mb-4">
                    <p>{{ error }}</p>
                </Alert>
                <div class="flex gap-3">
                    <Button variant="outline" class="flex-1" @click="$emit('cancel')">Cancelar</Button>
                    <Button variant="destructive" class="flex-1" @click="$emit('confirm')">Eliminar</Button>
                </div>
            </div>
        </Card>
    </div>
</template>
