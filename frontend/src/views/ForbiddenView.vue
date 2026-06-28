<script setup>
/**
 * @module views/ForbiddenView
 * @description
 * Página de error **403 (Acceso prohibido)**. Se muestra cuando el usuario no
 * tiene permisos para la ruta solicitada. Ruta `/403`.
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

        <img src="/lost_roomba-404.png" alt="Roomba cabreado" class="w-56 h-56 object-contain mb-6 select-none reveal"
            draggable="false" style="animation-delay: 40ms" />

        <p class="eyebrow text-destructive mb-3 reveal" style="animation-delay: 120ms">Error 403</p>

        <h1 class="font-display text-4xl font-medium tracking-tight leading-[0.95] mb-3 reveal" style="animation-delay: 160ms">
            ¡Fuera de mi zona!
        </h1>

        <p class="text-muted-foreground text-[0.95rem] max-w-sm leading-relaxed mb-8 reveal" style="animation-delay: 200ms">
            Nuestro robot de seguridad vigila esa área y no tienes acceso.
        </p>

        <div class="flex items-center gap-3 reveal" style="animation-delay: 240ms">
            <router-link to="/">
                <Button size="lg" class="group">
                    <ArrowLeft class="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    Volver al inicio
                </Button>
            </router-link>

            <router-link to="/login">
                <Button variant="outline" size="lg">
                    Iniciar sesión
                </Button>
            </router-link>
        </div>

        <p class="mt-10 text-xs text-muted-foreground/60 font-mono reveal" style="animation-delay: 280ms">ERROR 403 · Artec Robotics</p>
    </div>
</template>
