<script setup>
/**
 * @module components/ui/Card
 * @description
 * Contenedor tipo tarjeta (borde, fondo y radio). Suele combinarse con
 * {@link module:components/ui/CardHeader} y {@link module:components/ui/CardContent}.
 *
 * **Props**
 * - `class` `{String}` - Clases adicionales (se fusionan con `cn`).
 *
 * **Slots:** por defecto. · **Eventos:** ninguno.
 *
 * **Dependencias:** {@link module:utils/cn}.
 */
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps({
    class: { type: String, default: '' },
})

const classes = computed(() =>
    cn('rounded-md border border-border bg-card text-card-foreground', props.class)
)
</script>

<template>
    <div :class="classes">
        <slot />
    </div>
</template>
