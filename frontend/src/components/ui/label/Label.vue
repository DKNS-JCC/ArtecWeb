<script setup>
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps({
    class: { type: String, default: '' },
    for: { type: String, default: '' },
})

const classes = computed(() =>
    cn(
        'block text-sm font-semibold text-foreground mb-2 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        props.class
    )
)
</script>

<template>
    <label :for="props.for" :class="classes">
        <slot />
    </label>
</template>
