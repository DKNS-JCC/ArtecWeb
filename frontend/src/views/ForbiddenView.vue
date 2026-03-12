<script setup>
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-vue-next'
</script>

<template>
    <div class="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">

        <img src="/lost_roomba-404.png" alt="Roomba cabreado" class="w-56 h-56 object-contain mb-6 select-none"
            draggable="false" />

        <p class="text-8xl font-black text-muted/50 tabular-nums select-none -mb-4">403</p>

        <h1 class="text-2xl font-extrabold text-foreground mb-3">
            ¡Fuera de mi zona!
        </h1>

        <p class="text-muted-foreground max-w-sm leading-relaxed mb-8">
            Nuestro robot de seguridad vigila esa área y no tienes acceso.
        </p>

        <div class="flex items-center gap-3">
            <router-link to="/">
                <Button class="rounded-full gap-2 bg-foreground text-background hover:bg-foreground/90">
                    <ArrowLeft class="w-4 h-4" />
                    Volver al inicio
                </Button>
            </router-link>

            <router-link to="/login">
                <Button variant="outline" class="rounded-full">
                    Iniciar sesión
                </Button>
            </router-link>
        </div>

        <p class="mt-10 text-xs text-muted-foreground/60 font-mono">ERROR 403 · Artec Robotics</p>
    </div>
</template>
