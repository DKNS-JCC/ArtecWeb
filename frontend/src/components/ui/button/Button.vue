<script setup>
/**
 * @module components/ui/Button
 * @description
 * Botón base del sistema de UI (estilo *shadcn*), con variantes y tamaños vía
 * `class-variance-authority`. Puede renderizarse como otra etiqueta con `as`.
 *
 * **Props**
 * - `variant` `{String}` *(`default`)* - `default` | `destructive` | `outline` |
 *   `secondary` | `ghost` | `link`.
 * - `size` `{String}` *(`default`)* - `default` | `sm` | `lg` | `icon`.
 * - `as` `{String}` *(`button`)* - Etiqueta/elemento a renderizar.
 * - `class` `{String}` - Clases adicionales (se fusionan con `cn`).
 * - `disabled` `{Boolean}` *(`false`)* - Deshabilita el botón.
 *
 * **Slots:** por defecto (contenido del botón). · **Eventos:** ninguno propio.
 *
 * **Dependencias:** `class-variance-authority`, {@link module:utils/cn}.
 */
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground hover:bg-primary/90',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                outline: 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                ghost: 'hover:bg-accent hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-11 px-5 py-2',
                sm: 'h-9 rounded-sm px-3 text-xs',
                lg: 'h-12 rounded-sm px-8 text-base',
                icon: 'h-10 w-10',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
)

const props = defineProps({
    variant: { type: String, default: 'default' },
    size: { type: String, default: 'default' },
    as: { type: String, default: 'button' },
    class: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
})

const classes = computed(() =>
    cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)
)
</script>

<template>
    <component :is="as" :class="classes" :disabled="disabled">
        <slot />
    </component>
</template>
