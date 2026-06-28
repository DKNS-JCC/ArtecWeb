<script setup>
/**
 * @module views/NotFoundView
 * @description
 * Página de error **404 (No encontrado)**. Destino del *catch-all* del router
 * para rutas inexistentes. Ruta `/404`.
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** {@link module:components/ui/Button}, `lucide-vue-next`.
 */
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-vue-next'
</script>

<template>
    <div class="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">

        <img src="/lost_roomba-404.png" alt="Roomba perdido" class="w-56 h-56 object-contain mb-6 select-none reveal"
            draggable="false" style="animation-delay: 40ms" />

        <p class="eyebrow mb-3 reveal" style="animation-delay: 120ms">Error 404</p>

        <h1 class="font-display text-4xl font-medium tracking-tight leading-[0.95] mb-3 reveal" style="animation-delay: 160ms">
            Aquí no hay nada que explorar
        </h1>

        <p class="text-muted-foreground text-[0.95rem] max-w-sm leading-relaxed mb-8 reveal" style="animation-delay: 200ms">
            Nuestro robot ha estado buscando la página que pediste... pero tampoco él la ha encontrado.
            Quizá fue en otro universo.
        </p>

        <router-link to="/" class="reveal" style="animation-delay: 240ms">
            <Button size="lg" class="group">
                <ArrowLeft class="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                Volver al inicio
            </Button>
        </router-link>

        <p class="mt-10 text-xs text-muted-foreground/60 font-mono reveal" style="animation-delay: 280ms">ERROR 404 · Artec Robotics</p>
    </div>
</template>
