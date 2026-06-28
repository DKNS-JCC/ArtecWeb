<script setup>
/**
 * @module components/ui/Label
 * @description
 * Etiqueta de formulario asociable a un control mediante `for`.
 *
 * **Props**
 * - `class` `{String}` - Clases adicionales (se fusionan con `cn`).
 * - `for` `{String}` - `id` del control asociado.
 *
 * **Slots:** por defecto (texto de la etiqueta). · **Eventos:** ninguno.
 *
 * **Dependencias:** {@link module:utils/cn}.
 */
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps({
    class: { type: String, default: '' },
    for: { type: String, default: '' },
})

const classes = computed(() =>
    cn(
        'block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        props.class
    )
)
</script>

<template>
    <label :for="props.for" :class="classes">
        <slot />
    </label>
</template>
