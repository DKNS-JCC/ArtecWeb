<script setup>
/**
 * @module components/ui/Input
 * @description
 * Campo de entrada de texto con enlace `v-model`. Estilo coherente con el
 * sistema de UI.
 *
 * **Props**
 * - `class` `{String}` - Clases adicionales (se fusionan con `cn`).
 * - `type` `{String}` *(`text`)* - Tipo del `<input>`.
 * - `modelValue` `{String|Number}` - Valor enlazado (`v-model`).
 *
 * **Eventos**
 * - `update:modelValue` - Emitido al cambiar el valor (soporte de `v-model`).
 *
 * **Dependencias:** {@link module:utils/cn}.
 */
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps({
    class: { type: String, default: '' },
    type: { type: String, default: 'text' },
    modelValue: { type: [String, Number], default: '' },
})

const emit = defineEmits(['update:modelValue'])

const classes = computed(() =>
    cn(
        'flex h-11 w-full rounded-sm border border-input bg-background px-4 py-3 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:cursor-not-allowed disabled:opacity-50',
        props.class
    )
)
</script>

<template>
    <input :type="type" :class="classes" :value="modelValue" @input="emit('update:modelValue', $event.target.value)"
        v-bind="$attrs" />
</template>
