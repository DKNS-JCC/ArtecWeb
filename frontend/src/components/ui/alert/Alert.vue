<script setup>
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { CircleAlert, TriangleAlert, Info } from 'lucide-vue-next'

const alertVariants = cva(
    'relative w-full rounded-sm border p-4 text-sm font-medium flex items-center gap-3',
    {
        variants: {
            variant: {
                default: 'bg-background text-foreground border-border',
                destructive: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
                warning: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                success: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
)

const props = defineProps({
    variant: { type: String, default: 'default' },
    class: { type: String, default: '' },
})

const classes = computed(() =>
    cn(alertVariants({ variant: props.variant }), props.class)
)

const iconMap = {
    default: Info,
    destructive: CircleAlert,
    warning: TriangleAlert,
    success: Info,
}
</script>

<template>
    <div :class="classes" role="alert">
        <component :is="iconMap[variant]" class="h-4 w-4 shrink-0" />
        <div>
            <slot />
        </div>
    </div>
</template>
