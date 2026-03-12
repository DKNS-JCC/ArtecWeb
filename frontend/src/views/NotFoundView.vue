<script setup>
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-vue-next'
</script>

<template>
    <div class="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">

        <img src="/lost_roomba-404.png" alt="Roomba perdido" class="w-56 h-56 object-contain mb-6 select-none"
            draggable="false" />

        <p class="text-8xl font-black text-muted/50 tabular-nums select-none -mb-4">404</p>

        <h1 class="text-2xl font-extrabold text-foreground mb-3">
            Aquí no hay nada que explorar
        </h1>

        <p class="text-muted-foreground max-w-sm leading-relaxed mb-8">
            Nuestro robot ha estado buscando la página que pediste... pero tampoco él la ha encontrado.
            Quizá fue en otro universo.
        </p>

        <router-link to="/">
            <Button class="rounded-full gap-2">
                <ArrowLeft class="w-4 h-4" />
                Volver al inicio
            </Button>
        </router-link>

        <p class="mt-10 text-xs text-muted-foreground/60 font-mono">ERROR 404 · Artec Robotics</p>
    </div>
</template>
