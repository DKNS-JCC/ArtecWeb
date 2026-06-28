<script setup>
/**
 * @module components/ui/CardContent
 * @description
 * Cuerpo/contenido de una {@link module:components/ui/Card} (relleno estándar).
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

const classes = computed(() => cn('p-6 pt-0', props.class))
</script>

<template>
    <div :class="classes">
        <slot />
    </div>
</template>
