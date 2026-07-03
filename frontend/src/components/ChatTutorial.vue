<script setup>
/**
 * @file Overlay visual del tutorial de coachmarks del chat.
 * @module components/ChatTutorial
 *
 * Componente presentacional puro: pinta el oscurecimiento con foco recortado y
 * la burbuja de diálogo anclada al control resaltado. Toda la lógica (medición
 * de DOM, cálculo de posiciones, navegación de pasos) vive en el composable
 * {@link module:composables/useTutorial}; aquí solo se reciben los estilos ya
 * calculados y el paso actual, y se emiten los eventos de avanzar/cerrar.
 */
import { X, ChevronRight, Check } from 'lucide-vue-next'

defineProps({
    show:           { type: Boolean, default: false },
    step:           { type: Number, default: 0 },
    stepCount:      { type: Number, default: 0 },
    current:        { type: [Object, null], default: null },
    spotlightStyle: { type: Object, default: () => ({}) },
    bubbleStyle:    { type: Object, default: () => ({}) },
    tailStyle:      { type: Object, default: () => ({}) },
})

defineEmits(['next', 'close'])
</script>

<template>
    <Transition name="fade">
        <div v-if="show && current" class="fixed inset-0 z-[400]">

            <!-- Capa de oscurecimiento + recorte de foco sobre el control resaltado.
                 Hacer clic en cualquier parte de la capa avanza al siguiente paso. -->
            <div class="absolute inset-0" @click="$emit('next')" />
            <div class="tour-spotlight absolute rounded-2xl pointer-events-none" :style="spotlightStyle" />

            <!-- Burbuja de diálogo anclada junto al elemento -->
            <Transition name="step" mode="out-in">
                <div :key="step" class="tour-bubble absolute bg-card rounded-2xl shadow-2xl px-4 pt-3.5 pb-3"
                    :style="bubbleStyle">

                    <!-- Cola: un cuadrado rotado apoyado en el borde que mira al elemento -->
                    <div class="tour-tail absolute w-3.5 h-3.5 bg-card rotate-45"
                        :class="current.place === 'below' ? '-top-1.5' : '-bottom-1.5'"
                        :style="tailStyle" />

                    <!-- Contador de pasos -->
                    <div class="flex items-center justify-between mb-1.5">
                        <span class="text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
                            Paso {{ step + 1 }} de {{ stepCount }}
                        </span>
                        <button @click="$emit('close')"
                            class="text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                            <X class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- Text -->
                    <h3 class="font-semibold text-[0.95rem] text-foreground mb-1 leading-tight">
                        {{ current.title }}
                    </h3>
                    <p class="text-[0.8rem] text-muted-foreground leading-snug mb-3">
                        {{ current.desc }}
                    </p>

                    <!-- Actions -->
                    <div class="flex items-center justify-between gap-3">
                        <button @click="$emit('close')"
                            class="text-xs font-medium text-muted-foreground active:scale-95 transition-all">
                            Saltar
                        </button>
                        <button @click="$emit('next')"
                            class="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full px-4 py-2 active:scale-95 transition-all">
                            {{ step === stepCount - 1 ? 'Entendido' : 'Siguiente' }}
                            <ChevronRight v-if="step < stepCount - 1" class="w-3.5 h-3.5" />
                            <Check v-else class="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </Transition>
        </div>
    </Transition>
</template>

<style scoped>
/* Foco del tutorial: oscurece todo excepto un anillo alrededor del objetivo */
.tour-spotlight {
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 0 2px var(--color-primary);
    transition: top 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                left 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                width 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                height 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.tour-bubble { max-width: calc(100vw - 24px); }
.tour-tail { box-shadow: -2px -2px 4px rgba(0, 0, 0, 0.04); }

/* Aparición/desaparición del overlay completo (equivale a la transición 'modal') */
.fade-enter-active { transition: opacity 0.25s ease; }
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Transición del paso del tutorial (contenido de la burbuja) */
.step-enter-active { transition: opacity 0.2s ease; }
.step-leave-active { transition: opacity 0.12s ease; }
.step-enter-from, .step-leave-to { opacity: 0; }
</style>
