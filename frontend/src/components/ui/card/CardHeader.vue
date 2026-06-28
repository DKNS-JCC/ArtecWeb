<script setup>
/**
 * @module components/ui/CardHeader
 * @description
 * Cabecera de una {@link module:components/ui/Card} (espaciado vertical y
 * relleno estándar).
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

const classes = computed(() => cn('flex flex-col space-y-1.5 p-6', props.class))
</script>

<template>
    <div :class="classes">
        <slot />
    </div>
</template>
