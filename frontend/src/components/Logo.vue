<script setup>
/**
 * Artec brand mark — editorial "A".
 * A slab-serif "A" whose crossbar is the terracotta accent, echoing the
 * hairline rule used across the UI. Themed via CSS tokens (ink + primary).
 *
 *   wordmark → append the "Artec" display wordmark beside the mark
 */
defineProps({
  size:     { type: Number,  default: 80 },
  wordmark: { type: Boolean, default: false },
})
</script>

<template>
  <span class="inline-flex items-center gap-3 text-foreground select-none">
    <img src="/logo.webp" alt="Artec Logo" :height="size" class="shrink-0 object-contain drop-shadow-sm mix-blend-multiply dark:mix-blend-normal" :style="{ maxHeight: size + 'px' }" />
    
    <!-- Muestra el texto solo si nos lo piden explícitamente y la prop wordmark es true -->
    <span v-if="wordmark"
      class="font-display font-semibold tracking-tight leading-none"
      :style="{ fontSize: size * 0.5 + 'px' }">
      Artec
    </span>
  </span>
</template>
