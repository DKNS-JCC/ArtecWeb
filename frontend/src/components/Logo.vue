<script setup>
/**
 * @module components/Logo
 * @description
 * Marca de Artec - una "A" editorial con slab-serif cuyo travesaño usa el
 * acento terracota, en sintonía con la línea fina del resto de la UI. Se adapta
 * al tema mediante tokens CSS (tinta + primario).
 *
 * **Props**
 * - `size` `{Number}` *(por defecto `80`)* - Tamaño del logotipo en píxeles.
 * - `wordmark` `{Boolean}` *(por defecto `false`)* - Añade el logotipo de texto
 *   "Artec" junto a la marca.
 *
 * **Eventos:** ninguno.
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
