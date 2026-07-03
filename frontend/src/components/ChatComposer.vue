<script setup>
/**
 * @file Pie de entrada del chat del visitante (composer).
 * @module components/ChatComposer
 *
 * Reúne el conmutador de mapa, el área de texto, el botón de mantener-pulsado
 * para hablar (STT) y el de enviar, más los avisos de estado de voz. El estado
 * de negocio (envío, grabación, transcripción) vive en ChatView: aquí `messageText`
 * y `showMap` son v-model, el objeto `stt` llega por prop y las acciones se emiten.
 */
import { Map as MapIcon, Loader2, AlertTriangle, Mic, Send } from 'lucide-vue-next'

const messageText = defineModel('messageText', { type: String, default: '' })
const showMap     = defineModel('showMap', { type: Boolean, default: false })

defineProps({
    stt:         { type: Object, required: true },
    showMicHint: { type: Boolean, default: false },
    maxLength:   { type: Number, default: 500 },
    isSending:   { type: Boolean, default: false },
})

defineEmits(['send', 'mic-down', 'mic-up'])
</script>

<template>
    <!-- PIE DE ENTRADA: absoluto solo en modo chat (el modo mapa usa flujo normal para no ocultar el panel) -->
    <footer class="glass-footer p-3 sm:pb-3 pb-safe border-t border-foreground/5 flex-shrink-0"
        :class="showMap ? 'relative' : 'absolute bottom-0 left-0 right-0'">

        <!-- Pista puntual: mantener pulsado para hablar no es un gesto obvio en el móvil -->
        <Transition name="banner">
            <p v-if="showMicHint && !stt.isRecording.value && !stt.isTranscribing.value && !messageText.trim()"
                class="text-center text-[0.7rem] text-muted-foreground pb-1.5">
                Consejo: mantén pulsado el micrófono para hablar con tu guía
            </p>
        </Transition>

        <!-- Banner de estado de voz (grabando / transcribiendo / error de micro) -->
        <Transition name="banner">
            <div v-if="stt.isRecording.value || stt.isTranscribing.value || stt.error.value"
                class="flex items-center justify-center gap-2 pb-2.5 text-sm font-medium"
                :class="stt.isRecording.value ? 'text-red-500' : (stt.error.value ? 'text-red-600 dark:text-red-400' : 'text-primary')">
                <template v-if="stt.isRecording.value">
                    <span class="relative flex h-2.5 w-2.5">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                    Escuchando… suelta para enviar
                </template>
                <template v-else-if="stt.isTranscribing.value">
                    <Loader2 class="w-4 h-4 animate-spin" />
                    Transcribiendo…
                </template>
                <template v-else>
                    <AlertTriangle class="w-4 h-4 flex-shrink-0" />
                    {{ stt.error.value }}
                </template>
            </div>
        </Transition>

        <form @submit.prevent="$emit('send')"
            class="flex items-end gap-2 p-1 bg-card border border-foreground/10 rounded-3xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <button type="button" data-tour="map" @click="showMap = !showMap"
                class="w-9 h-9 m-1 rounded-full flex flex-shrink-0 items-center justify-center transition-all"
                :class="showMap ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
                title="Ver mapa">
                <MapIcon class="w-4 h-4" />
            </button>
            <textarea
                v-model="messageText"
                rows="1"
                :maxlength="maxLength"
                :disabled="isSending"
                placeholder="Pregunta a tu guía..."
                class="flex-1 bg-transparent border-0 focus:ring-0 resize-none px-4 py-2.5 max-h-32 min-h-[44px] text-base placeholder:text-muted-foreground self-center outline-none scrollbar-hide text-foreground disabled:opacity-50"
                @keydown.enter.prevent="$emit('send')"
            ></textarea>

            <!-- Micrófono de mantener pulsado para hablar (speech-to-text con Whisper local) -->
            <button v-if="stt.supported && !messageText.trim()"
                type="button"
                data-tour="mic"
                @pointerdown.prevent="$emit('mic-down')"
                @pointerup.prevent="$emit('mic-up')"
                @pointerleave="stt.isRecording.value && $emit('mic-up')"
                @contextmenu.prevent
                :disabled="isSending || stt.isTranscribing.value"
                class="w-9 h-9 m-1 rounded-full flex flex-shrink-0 items-center justify-center transition-all select-none touch-none disabled:opacity-50"
                :class="stt.isRecording.value
                    ? 'bg-red-500 text-white scale-110 ring-4 ring-red-500/20'
                    : 'bg-muted text-muted-foreground hover:text-primary active:scale-95'"
                title="Mantén pulsado para hablar">
                <Loader2 v-if="stt.isTranscribing.value" class="w-4 h-4 animate-spin" />
                <Mic v-else class="w-4 h-4" />
            </button>

            <button
                v-else
                type="submit"
                :disabled="!messageText.trim() || isSending"
                class="w-9 h-9 m-1 rounded-full flex flex-shrink-0 items-center justify-center transition-all"
                :class="messageText.trim() && !isSending ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95' : 'bg-muted text-muted-foreground/50 cursor-not-allowed'">
                <Send class="w-4 h-4 ml-0.5" />
            </button>
        </form>
    </footer>
</template>

<style scoped>
.glass-footer {
    background: color-mix(in srgb, var(--color-background) 85%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    padding-bottom: env(safe-area-inset-bottom, 12px);
}

.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

/* Transición de los banners de aviso/estado de voz */
.banner-enter-active, .banner-leave-active { transition: all 0.3s ease; }
.banner-enter-from, .banner-leave-to { opacity: 0; transform: translateY(-8px); max-height: 0; }
.banner-enter-to, .banner-leave-from { max-height: 60px; }
</style>
