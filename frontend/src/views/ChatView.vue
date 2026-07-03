<script setup>
/**
 * @module views/ChatView
 * @description
 * Vista principal del **visitante**: chat con la guía IA, con voz local y
 * gratuita (TTS para que el robot "hable" y STT para hablarle), mapa interactivo
 * y confirmación de navegación a zonas. Ruta `/chat` (requiere sesión de
 * visitante). El visitante queda retenido aquí hasta finalizar la sesión.
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** `vue-router`, {@link module:stores/auth},
 * {@link module:services/chatService}, {@link module:components/VisitorMap},
 * {@link module:composables/useTextToSpeech},
 * {@link module:composables/useSpeechToText}, `lucide-vue-next`.
 */
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { chatService } from '@/services/chatService';
import { LogOut, Bot, Clock, Navigation, Check, X, Loader2, MapPin, Settings, ChevronRight, Volume2, VolumeX, AlertTriangle, RotateCw } from 'lucide-vue-next';
import VisitorMap from '@/components/VisitorMap.vue';
import ChatTutorial from '@/components/ChatTutorial.vue';
import ChatComposer from '@/components/ChatComposer.vue';
import { useTextToSpeech } from '@/composables/useTextToSpeech';
import { useSpeechToText } from '@/composables/useSpeechToText';
import { useTutorial } from '@/composables/useTutorial';
import { STORAGE_KEYS } from '@/constants/storageKeys';

const router   = useRouter();
const authStore = useAuthStore();

// ── Voz: TTS (habla el robot) + STT (habla el visitante), ambos locales y gratuitos ────────
const tts = useTextToSpeech();
const stt = useSpeechToText();

// ── Tutorial de la primera vez (coachmarks) ──────────────────────────────────────────
// Ilumina cada control real y ancla junto a él una pequeña burbuja de diálogo, con
// una cola que apunta al elemento. Las posiciones se miden en vivo desde el DOM para que
// la burbuja siga al botón real independientemente del tamaño de pantalla.
const TUTORIAL_KEY = STORAGE_KEYS.CHAT_TUTORIAL_DONE;

/**
 * Cada paso apunta a un elemento real mediante su atributo `data-tour`. `place`
 * decide en qué lado del elemento se coloca la burbuja ('below' para los controles de
 * la cabecera, 'above' para los del pie). Los pasos cuyo objetivo no está en pantalla
 * (p. ej. voz no soportada) se omiten automáticamente.
 */
const TUTORIAL_STEPS = [
    {
        target: 'settings', place: 'below',
        title:  'Ajusta las explicaciones',
        desc:   'Toca el nombre del robot para elegir cuánto detalle quieres, desde niños hasta expertos.',
    },
    {
        target: 'volume', place: 'below',
        title:  'La voz del robot',
        desc:   'Enciende o silencia la voz. Cuando está activa, el robot lee sus respuestas en alto.',
    },
    {
        target: 'map', place: 'above',
        title:  'Abre el mapa del museo',
        desc:   'Mira el museo entero y toca cualquier sala para que el robot te lleve hasta ella.',
    },
    {
        target: 'mic', place: 'above',
        title:  'Háblale al robot',
        desc:   'Mantén pulsado este botón mientras hablas y suéltalo al terminar. El robot te responderá.',
    },
];

// Toda la mecánica del tutorial (medición de DOM, foco, burbuja y navegación de
// pasos) vive en useTutorial; aquí solo se aportan los pasos y la clave de guardado.
const {
    showTutorial, tutorialStep, visibleSteps, currentTutorialStep,
    spotlightStyle, bubbleStyle, tailStyle,
    startTutorial, nextTutorialStep, closeTutorial,
} = useTutorial(TUTORIAL_STEPS, TUTORIAL_KEY);

/** Pista de onboarding puntual para el gesto (poco obvio) de mantener pulsado para hablar. */
const showMicHint = ref(false);
let micHintTimer  = null;
const dismissMicHint = () => {
    showMicHint.value = false;
    if (micHintTimer) { clearTimeout(micHintTimer); micHintTimer = null; }
};

/** Mantener pulsado para hablar: graba mientras se pulsa, transcribe al soltar y envía. */
const handleMicDown = async () => {
    if (isSending.value || stt.isTranscribing.value) return;
    dismissMicHint();
    tts.cancel();                       // no captures la propia voz del robot
    await stt.start();
};

const handleMicUp = async () => {
    if (!stt.isRecording.value) return;
    const text = await stt.stopAndTranscribe();
    if (text) {
        messageText.value = text;
        sendMessage();
    }
};

const STORAGE_KEY          = STORAGE_KEYS.CHAT_MESSAGES;
const MAX_MESSAGE_LENGTH   = 500;
const EXCLUSIVITY_TIME_SEC = 600;

const robotName   = computed(() => authStore.user?.robot_name || 'Robot Guía');
const visitorName = computed(() => authStore.user?.name || 'Amigo');
const messageText = ref('');
const chatContainer = ref(null);
const isSending     = ref(false);
const showForcedEndModal = ref(false);
const showFarewellModal = ref(false);

const welcomeMessage = {
    id:     1,
    sender: 'robot',
    text:   `¡Hola ${visitorName.value}! Soy ${robotName.value}, tu guía robótico. Tienes ${EXCLUSIVITY_TIME_SEC / 60} minutos para preguntarme lo que quieras o pedirme que te lleve a cualquier rincón del museo.`,
    time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};

/** Sugerencias iniciales mostradas hasta que el visitante envía su primer mensaje - elimina la fricción de la página en blanco. */
const SUGGESTED_PROMPTS = [
    '¿Qué puedo ver por aquí?',
    'Llévame a la siguiente sala',
    'Cuéntame algo curioso sobre esta zona',
    '¿Cuánto dura la visita?',
];

// ── Message persistence ───────────────────────────────────────────────────────

function loadMessages() {
    try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch { /* ignore */ }
    return [welcomeMessage];
}

function saveMessages() {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value.filter(m => !m.isTyping)));
    } catch { /* ignore */ }
}

const messages  = ref(loadMessages());
const showMap   = ref(false);

/** Guía de la primera vez: las sugerencias desaparecen cuando la conversación arranca de verdad. */
const showSuggestions = computed(() => messages.value.length === 1 && !isSending.value);

// ── Nivel de conocimiento ───────────────────────────────────────────────────────────
const showExpertiseModal  = ref(false);
const isUpdatingExpertise = ref(false);

const EXPERTISE_OPTIONS = [
    { value: 'nino',       label: 'Niño/a',     desc: 'Explicaciones simples y divertidas' },
    { value: 'general',    label: 'General',     desc: 'Para todo tipo de visitantes' },
    { value: 'estudiante', label: 'Estudiante',  desc: 'Con más contexto y detalle' },
    { value: 'experto',    label: 'Experto',     desc: 'Información técnica y profunda' },
];

const currentExpertise = computed(() => authStore.user?.expertise_level || 'general');

const updateExpertise = async (level) => {
    if (isUpdatingExpertise.value || level === currentExpertise.value) {
        showExpertiseModal.value = false;
        return;
    }
    isUpdatingExpertise.value = true;
    try {
        await chatService.updateExpertise(level);
        if (authStore.user) {
            authStore.user.expertise_level = level;
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(authStore.user));
        }
    } catch { /* ignore - level update is best-effort */ }
    finally {
        isUpdatingExpertise.value = false;
        showExpertiseModal.value = false;
    }
};

// ── Manejador de navegación del mapa ────────────────────────────────────────────────────
const handleMapNavigated = (navMessage, zoneName, errMsg, coords) => {
    showMap.value = false;
    const mapMsgId = Date.now();
    const text = navMessage || errMsg || 'No pude iniciar la navegación.';
    messages.value.push({
        id:             mapMsgId,
        sender:         'robot',
        text,
        isNavExecuting: !!navMessage,
        isError:        !!errMsg,
        placeName:      zoneName,
        time:           new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    tts.speakIfAuto(text, mapMsgId);
    // En una navegación lanzada desde el mapa con éxito, vigila también el resultado.
    if (navMessage && coords) {
        trackArrival({ place_id: coords.place_id, place_name: zoneName, map_x: coords.map_x, map_y: coords.map_y });
    }
    saveMessages();
    nextTick(() => scrollToBottom());
};

// ── Estado de confirmación de navegación ─────────────────────────────────────────────

/**
 * Se fija cuando la IA devuelve intent=navigate_to con un resolved_place válido.
 * Se limpia al confirmar, cancelar o con un nuevo navigate_to.
 * Forma: { place_id, place_name, map_x, map_y } | null
 */
const pendingNav    = ref(null);
const isConfirming  = ref(false);

const handleConfirmNav = async () => {
    if (!pendingNav.value || isConfirming.value) return;
    isConfirming.value = true;
    const nav = { ...pendingNav.value };
    pendingNav.value = null;

    try {
        const data = await chatService.confirmNav(nav.place_id);
        const navMsgId = Date.now();
        messages.value.push({
            id:              navMsgId,
            sender:          'robot',
            text:            data.nav_message,
            isNavExecuting:  true,
            placeName:       nav.place_name,
            time:            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        tts.speakIfAuto(data.nav_message, navMsgId);
        // Vigila el resultado para poder avisar al visitante cuando llegue - o falle.
        trackArrival({ place_id: nav.place_id, place_name: nav.place_name, map_x: nav.map_x, map_y: nav.map_y });
    } catch (err) {
        messages.value.push({
            id:      Date.now(),
            sender:  'robot',
            text:    err.message || 'No pude iniciar la navegación. ¿El robot está conectado?',
            isError: true,
            time:    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    } finally {
        isConfirming.value = false;
        saveMessages();
        scrollToBottom();
    }
};

const handleCancelNav = () => {
    pendingNav.value = null;
};

// ── Seguimiento del resultado de navegación ───────────────────────────────────────────────

/**
 * Cuando arranca una navegación el visitante no sabe qué ha pasado. Abrimos el
 * stream en vivo (el mismo que usa el overlay del mapa) y reaccionamos al resultado:
 *   • El robot informa SUCCEEDED  → "He llegado" + ofrecer hablar del lugar.
 *   • El robot informa ABORTED    → "No pude llegar" + un botón de reintentar.
 * La señal autoritativa es el evento `nav` del servidor; la proximidad en la pose
 * en vivo se mantiene como fallback por si se pierde ese evento.
 */
const ARRIVAL_RADIUS_M   = 1.2;      // cómo de cerca (metros) cuenta como "llegado" (fallback)
const ARRIVAL_TIMEOUT_MS = 240_000;  // stop listening after 4 min as a safety net

const arrivalTarget = ref(null);     // { place_id, place_name, map_x, map_y } | null
let arrivalSource   = null;          // EventSource para el stream de pose/navegación
let arrivalTimeout  = null;

const stopArrivalTracking = () => {
    if (arrivalSource)  { arrivalSource.close(); arrivalSource = null; }
    if (arrivalTimeout) { clearTimeout(arrivalTimeout); arrivalTimeout = null; }
    arrivalTarget.value = null;
};

const announceArrival = () => {
    const target = arrivalTarget.value;
    stopArrivalTracking();
    if (!target) return;

    const msgId = Date.now();
    const text  = `¡He llegado a ${target.place_name}! ¿Quieres que te cuente algo sobre este lugar?`;
    messages.value.push({
        id:        msgId,
        sender:    'robot',
        text,
        isArrival: true,
        placeName: target.place_name,
        time:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    tts.speakIfAuto(text, msgId);
    saveMessages();
    nextTick(() => scrollToBottom());
};

const announceNavFailure = () => {
    const target = arrivalTarget.value;
    stopArrivalTracking();
    if (!target) return;

    const msgId = Date.now();
    const text  = `No he podido llegar a ${target.place_name}. Puede que haya un obstáculo en el camino. ¿Quieres que lo intente de nuevo o prefieres avisar al personal del museo?`;
    messages.value.push({
        id:         msgId,
        sender:     'robot',
        text,
        isNavError: true,
        placeId:    target.place_id,
        placeName:  target.place_name,
        time:       new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    tts.speakIfAuto(text, msgId);
    saveMessages();
    nextTick(() => scrollToBottom());
};

const trackArrival = (target) => {
    // Un destino nuevo reemplaza cualquier seguimiento en curso.
    stopArrivalTracking();
    if (!target || target.map_x == null || target.map_y == null) return;
    arrivalTarget.value = target;

    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) return;
    const API_BASE = import.meta.env.VITE_API_URL || '/api';
    const url      = `${API_BASE}/robots/position-stream?token=${encodeURIComponent(token)}`;

    arrivalSource = new EventSource(url);

    // Resultado autoritativo del Nav2 del robot.
    arrivalSource.addEventListener('nav', (e) => {
        if (!arrivalTarget.value) return;
        let data;
        try { data = JSON.parse(e.data); } catch { return; }
        if (data.outcome === 'succeeded') announceArrival();
        else if (data.outcome === 'aborted') announceNavFailure();
    });

    // Fallback: si nos acercamos lo suficiente según la pose en vivo, se trata como llegada.
    arrivalSource.addEventListener('position', (e) => {
        if (!arrivalTarget.value) return;
        let pose;
        try { pose = JSON.parse(e.data); } catch { return; }
        if (pose.x == null || pose.y == null) return;
        const dist = Math.hypot(pose.x - arrivalTarget.value.map_x, pose.y - arrivalTarget.value.map_y);
        if (dist <= ARRIVAL_RADIUS_M) announceArrival();
    });
    // EventSource se reconecta solo ante errores; este feedback es best-effort.

    arrivalTimeout = setTimeout(stopArrivalTracking, ARRIVAL_TIMEOUT_MS);
};

/** Reenvía una navegación al mismo lugar tras un fallo (botón de reintentar). */
const retryNav = async (msg) => {
    if (!msg?.placeId || isConfirming.value) return;
    isConfirming.value = true;
    try {
        const data = await chatService.confirmNav(msg.placeId);
        const navMsgId = Date.now();
        const place = data.place || { id: msg.placeId, name: msg.placeName };
        messages.value.push({
            id:             navMsgId,
            sender:         'robot',
            text:           data.nav_message,
            isNavExecuting: true,
            placeName:      place.name,
            time:           new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        tts.speakIfAuto(data.nav_message, navMsgId);
        trackArrival({ place_id: place.id, place_name: place.name, map_x: place.map_x, map_y: place.map_y });
    } catch (err) {
        messages.value.push({
            id:      Date.now(),
            sender:  'robot',
            text:    err.message || 'No pude iniciar la navegación. ¿El robot está conectado?',
            isError: true,
            time:    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    } finally {
        isConfirming.value = false;
        saveMessages();
        scrollToBottom();
    }
};

// ── Estado de confirmación de despedida ───────────────────────────────────────────────

/**
 * Se fija cuando la IA detecta una intención de despedida. Ofrece finalizar la visita
 * mediante un modal de confirmación (mismo patrón que navigate_to) en vez de cerrar de golpe.
 */
const pendingFarewell = ref(false);

const handleConfirmFarewell = () => {
    pendingFarewell.value = false;
    handleEndSession();
};

const handleCancelFarewell = () => {
    pendingFarewell.value = false;
};

// ── Temporizador de sesión (10 min) ────────────────────────────────────────────────────

const timeLeft = ref(EXCLUSIVITY_TIME_SEC);
let timerInterval = null;

const formattedTime = computed(() => {
    const m = Math.floor(timeLeft.value / 60).toString().padStart(2, '0');
    const s = (timeLeft.value % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
});

const isTimeWarning  = computed(() => timeLeft.value > 60 && timeLeft.value <= 120);
const isTimeExpiring = computed(() => timeLeft.value <= 60);

const startTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (timeLeft.value > 0) {
            timeLeft.value--;
        } else {
            handleEndSession();
        }
    }, 1000);
};

const handleForcedEndSession = () => {
    if (timerInterval) clearInterval(timerInterval);
    stopArrivalTracking();
    showForcedEndModal.value = true;
    sessionStorage.removeItem(STORAGE_KEY);
    authStore.logout();
    setTimeout(() => router.push('/'), 4000);
};

const resetTimer = () => {
    timeLeft.value = EXCLUSIVITY_TIME_SEC;
    authStore.pingVisitor();
    startTimer();
};

const handleEndSession = async () => {
    if (timerInterval) clearInterval(timerInterval);
    stopArrivalTracking();
    sessionStorage.removeItem(STORAGE_KEY);
    await authStore.endVisitor();
    showFarewellModal.value = true;
};

const goToMenu = () => {
    showFarewellModal.value = false;
    router.push('/');
};

// ── Chat ──────────────────────────────────────────────────────────────────────

const scrollToBottom = async () => {
    await nextTick();
    if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
};

const sendMessage = async () => {
    const text = messageText.value.trim();
    if (!text || isSending.value) return;
    if (text.length > MAX_MESSAGE_LENGTH) return;

    resetTimer();

    messages.value.push({
        id:     Date.now(),
        sender: 'user',
        text,
        time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    messageText.value = '';
    scrollToBottom();

    // Indicador de "escribiendo"
    isSending.value = true;
    const typingId = Date.now() + 1;
    messages.value.push({ id: typingId, sender: 'robot', text: null, isTyping: true, time: '' });
    scrollToBottom();

    try {
        const data = await chatService.sendMessage(text);

        // Quita el indicador de "escribiendo"
        const idx = messages.value.findIndex(m => m.id === typingId);
        if (idx !== -1) messages.value.splice(idx, 1);

        // Añade la respuesta del robot
        const robotMsgId = Date.now() + 2;
        messages.value.push({
            id:     robotMsgId,
            sender: 'robot',
            text:   data.response,
            intent: data.intent,
            time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        tts.speakIfAuto(data.response, robotMsgId);

        // ── Puerta de confirmación de navegación ──────────────────────────────────
        if (data.intent === 'navigate_to' && data.resolved_place?.map_x != null) {
            // Replace any previous pending nav
            pendingNav.value = {
                place_id:   data.resolved_place.id,
                place_name: data.resolved_place.name,
                map_x:      data.resolved_place.map_x,
                map_y:      data.resolved_place.map_y,
            };
        } else if (data.intent === 'navigate_to' && !data.resolved_place?.map_x) {
            // El lugar existe pero no tiene coordenadas - informa al visitante
            pendingNav.value = null;
        }

        // ── Puerta de despedida: ofrece finalizar la visita (mismo patrón de modal que nav) ─
        if (data.intent === 'farewell') {
            pendingFarewell.value = true;
        }

    } catch (err) {
        const idx = messages.value.findIndex(m => m.id === typingId);
        if (idx !== -1) messages.value.splice(idx, 1);

        // Un admin finalizó/reasignó la sesión (o expiró) → expulsa.
        if (err.status === 403) {
            handleForcedEndSession();
            return;
        }

        messages.value.push({
            id:      Date.now() + 2,
            sender:  'robot',
            text:    'Lo siento, tuve un problema procesando tu mensaje. ¿Puedes intentarlo de nuevo?',
            isError: true,
            time:    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    } finally {
        isSending.value = false;
        saveMessages();
        scrollToBottom();
    }
};

/** Lanza una sugerencia inicial como si el visitante la hubiera escrito y enviado él mismo. */
const sendSuggestion = (prompt) => {
    if (isSending.value) return;
    messageText.value = prompt;
    sendMessage();
};

onMounted(() => {
    startTimer();
    scrollToBottom();
    if (!localStorage.getItem(TUTORIAL_KEY)) {
        // Espera al primer render para que todos los controles sean medibles.
        nextTick(() => startTutorial());
    } else if (stt.supported) {
        showMicHint.value = true;
        micHintTimer = setTimeout(dismissMicHint, 7000);
    }
});

onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval);
    if (micHintTimer) clearTimeout(micHintTimer);
    stopArrivalTracking();
});
</script>

<template>
    <div class="bg-background font-sans min-h-[100dvh] flex flex-col fixed inset-0 z-[100] sm:relative sm:z-auto sm:max-w-md sm:mx-auto sm:border-x">

        <!-- CABECERA -->
        <header class="glass-header z-10 flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-foreground/5">
            <button @click="handleEndSession" class="flex flex-col items-center justify-center text-destructive hover:opacity-80 active:scale-95 transition-all">
                <LogOut class="w-5 h-5 mb-0.5" />
                <span class="text-[0.65rem] font-medium leading-none uppercase tracking-wider">Finalizar</span>
            </button>

            <div class="flex flex-col items-center justify-center -translate-x-1">
                <div class="w-10 h-10 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-1 ring-2 ring-primary/20">
                    <Bot class="w-6 h-6" />
                </div>
                <button data-tour="settings" @click="showExpertiseModal = true" class="flex items-center gap-1 group">
                    <h1 class="text-sm font-semibold text-foreground">{{ robotName }}</h1>
                    <Settings class="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
            </div>

            <div class="flex items-center gap-2">
                <!-- Conmutador de voz automática (el robot lee sus respuestas en voz alta) -->
                <button v-if="tts.supported" data-tour="volume" @click="tts.toggleAutoSpeak()"
                    class="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
                    :class="tts.autoSpeak.value
                        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                        : 'bg-foreground/5 text-muted-foreground'"
                    :title="tts.autoSpeak.value ? 'Voz activada - el robot lee sus respuestas' : 'Voz silenciada'">
                    <Volume2 v-if="tts.autoSpeak.value" class="w-4 h-4" :class="{ 'animate-pulse': tts.isSpeaking.value }" />
                    <VolumeX v-else class="w-4 h-4" />
                </button>

                <div class="flex flex-col items-center justify-center bg-foreground/5 px-2 py-1.5 rounded-sm border border-transparent transition-colors"
                    :class="{'animate-pulse border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400': isTimeExpiring}">
                    <Clock class="w-4 h-4 mb-0.5" :class="isTimeExpiring ? 'text-red-500' : 'text-muted-foreground'" />
                    <span class="font-mono text-xs font-bold tabular-nums tracking-tighter"
                          :class="isTimeExpiring ? 'text-red-500' : 'text-foreground'">
                        {{ formattedTime }}
                    </span>
                </div>
            </div>
        </header>

        <!-- BANNER DE AVISO DE TIEMPO (quedan 2 min) -->
        <Transition name="banner">
            <div v-if="isTimeWarning"
                class="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/30">
                <div class="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <Clock class="w-4 h-4 flex-shrink-0" />
                    <span class="text-sm font-medium">Tu visita termina en 2 minutos</span>
                </div>
                <button @click="resetTimer()"
                    class="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/40 px-3 py-1.5 rounded-full active:scale-95 transition-all whitespace-nowrap">
                    Seguir 10 min más
                </button>
            </div>
        </Transition>

        <!-- VISTA DE MAPA -->
        <VisitorMap v-if="showMap" class="flex-1 min-h-0" @navigated="handleMapNavigated" />

        <!-- CHAT MESSAGES -->
        <main v-else ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth overscroll-y-contain pb-[140px]">

            <div class="flex flex-col items-center gap-2 mb-6">
                <div class="text-center text-xs text-muted-foreground font-medium uppercase tracking-wider bg-foreground/5 rounded-full py-1.5 px-4 w-fit">
                    Conectado
                </div>
                <!-- Prepara al usuario antes de que el robot hable en voz alta por primera vez -->
                <div v-if="tts.supported && tts.autoSpeak.value"
                    class="flex items-center gap-1.5 text-center text-xs text-muted-foreground font-medium bg-foreground/5 rounded-full py-1.5 px-4 w-fit">
                    <Volume2 class="w-3.5 h-3.5 flex-shrink-0" />
                    El robot lee sus respuestas en voz alta - toca el altavoz para silenciar
                </div>
            </div>

            <div v-for="msg in messages" :key="msg.id" class="flex flex-col w-full"
                 :class="msg.sender === 'user' ? 'items-end' : 'items-start'">

                <!-- Insignia de confirmación de navegación en curso -->
                <div v-if="msg.isNavExecuting" class="max-w-[85%] mb-1">
                    <div class="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Navigation class="w-3.5 h-3.5 flex-shrink-0" />
                        Navegando → {{ msg.placeName }}
                    </div>
                </div>

                <!-- Insignia de llegada -->
                <div v-if="msg.isArrival" class="max-w-[85%] mb-1">
                    <div class="flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
                        <MapPin class="w-3.5 h-3.5 flex-shrink-0" />
                        Has llegado → {{ msg.placeName }}
                    </div>
                </div>

                <!-- Insignia de fallo de navegación -->
                <div v-if="msg.isNavError" class="max-w-[85%] mb-1">
                    <div class="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <AlertTriangle class="w-3.5 h-3.5 flex-shrink-0" />
                        No se pudo llegar → {{ msg.placeName }}
                    </div>
                </div>

                <!-- Burbuja -->
                <div class="relative max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm text-[0.95rem] leading-snug break-words"
                    :class="[
                        msg.sender === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-card text-foreground rounded-bl-sm border border-foreground/5',
                        (msg.isError || msg.isNavError) ? 'border-red-300 dark:border-red-500/30' : ''
                    ]">
                    <div v-if="msg.isTyping" class="flex space-x-1.5 px-1 py-1">
                        <span class="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                        <span class="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                        <span class="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style="animation-delay:300ms"></span>
                    </div>
                    <template v-else>{{ msg.text }}</template>
                </div>

                <!-- Acción de reintentar tras un fallo de navegación -->
                <button v-if="msg.isNavError && msg.placeId"
                    @click="retryNav(msg)"
                    :disabled="isConfirming"
                    class="mt-2 flex items-center gap-1.5 bg-primary hover:bg-primary/90 active:scale-[0.97] text-primary-foreground text-sm font-semibold rounded-full px-4 py-2 transition-all disabled:opacity-60">
                    <Loader2 v-if="isConfirming" class="w-4 h-4 animate-spin" />
                    <RotateCw v-else class="w-4 h-4" />
                    Intentar de nuevo
                </button>

                <div v-if="!msg.isTyping" class="flex items-center gap-1.5 mt-1 mx-1">
                    <span class="text-[0.65rem] text-muted-foreground">{{ msg.time }}</span>
                    <!-- Reproducción por mensaje (text-to-speech) en las burbujas del robot -->
                    <button v-if="tts.supported && msg.sender === 'robot' && msg.text"
                        @click="tts.speakingId.value === msg.id ? tts.cancel() : tts.speak(msg.text, msg.id)"
                        class="text-muted-foreground hover:text-primary transition-colors active:scale-90"
                        :title="tts.speakingId.value === msg.id ? 'Detener' : 'Escuchar'">
                        <VolumeX v-if="tts.speakingId.value === msg.id" class="w-3.5 h-3.5" />
                        <Volume2 v-else class="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <!-- Sugerencias iniciales: eliminan la fricción de la página en blanco en el primer contacto -->
            <div v-if="showSuggestions" class="flex flex-wrap gap-2 pl-1">
                <button v-for="prompt in SUGGESTED_PROMPTS" :key="prompt"
                    type="button" @click="sendSuggestion(prompt)"
                    class="text-sm text-foreground bg-card border border-foreground/10 rounded-full px-3.5 py-2 shadow-sm hover:border-primary/40 hover:text-primary active:scale-95 transition-all">
                    {{ prompt }}
                </button>
            </div>

        </main>

        <!-- PIE DE ENTRADA (composer): mapa / texto / voz / enviar -->
        <ChatComposer
            v-model:message-text="messageText"
            v-model:show-map="showMap"
            :stt="stt"
            :show-mic-hint="showMicHint"
            :max-length="MAX_MESSAGE_LENGTH"
            :is-sending="isSending"
            @send="sendMessage"
            @mic-down="handleMicDown"
            @mic-up="handleMicUp" />

        <!-- MODAL DE FIN FORZADO -->
        <div v-if="showForcedEndModal" class="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div class="bg-card w-full max-w-sm rounded-[32px] p-8 text-center shadow-2xl">
                <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <LogOut class="w-8 h-8" />
                </div>
                <h2 class="font-display text-xl font-medium tracking-tight mb-2 text-foreground">Visita Finalizada</h2>
                <p class="text-sm text-muted-foreground mb-6">Tu sesión ha sido terminada por un administrador del museo.</p>
                <div class="text-[0.65rem] uppercase tracking-widest text-muted-foreground font-semibold">Redirigiendo al inicio...</div>
            </div>
        </div>

        <!-- ── MODAL DE CONFIRMACIÓN DE NAVEGACIÓN ──────────────────────────────── -->
        <Transition name="modal">
            <div v-if="pendingNav" class="fixed inset-0 z-[300] flex items-center justify-center p-4" @click.self="handleCancelNav">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

                <!-- Tarjeta del modal -->
                <div class="nav-modal relative w-full max-w-xs rounded-[28px] overflow-hidden shadow-2xl">
                    <!-- Accent bar -->
                    <div class="h-1.5 bg-primary"></div>

                    <div class="bg-card px-6 pt-6 pb-5">
                        <!-- Icon -->
                        <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <Navigation class="w-7 h-7 text-primary" />
                        </div>

                        <!-- Title -->
                        <h2 class="font-display text-lg font-medium tracking-tight text-center text-foreground mb-1">Confirmar destino</h2>

                        <!-- Place name -->
                        <p class="text-center text-primary font-semibold text-base mb-3">
                            {{ pendingNav.place_name }}
                        </p>

                        <!-- Description -->
                        <p class="text-center text-sm text-muted-foreground mb-5 leading-relaxed">
                            ¿Quieres que el robot te lleve a este lugar?
                        </p>

                        <!-- Actions -->
                        <div class="flex flex-col gap-2.5">
                            <button
                                @click="handleConfirmNav"
                                :disabled="isConfirming"
                                class="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 active:scale-[0.97] text-primary-foreground text-[15px] font-semibold rounded-2xl py-3 transition-all disabled:opacity-60">
                                <Loader2 v-if="isConfirming" class="w-4.5 h-4.5 animate-spin" />
                                <Check v-else class="w-4.5 h-4.5" />
                                Sí, llevarme
                            </button>
                            <button
                                @click="handleCancelNav"
                                :disabled="isConfirming"
                                class="w-full flex items-center justify-center gap-2 bg-muted hover:bg-muted/70 active:scale-[0.97] text-foreground text-[15px] font-semibold rounded-2xl py-3 transition-all disabled:opacity-60">
                                <X class="w-4.5 h-4.5" />
                                No, cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
        <!-- ── FIN MODAL DE CONFIRMACIÓN DE NAVEGACIÓN ─────────────────────────── -->

        <!-- ── MODAL DE CONFIRMACIÓN DE DESPEDIDA (FIN DE VISITA) ────────────────────── -->
        <Transition name="modal">
            <div v-if="pendingFarewell" class="fixed inset-0 z-[300] flex items-center justify-center p-4" @click.self="handleCancelFarewell">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

                <!-- Tarjeta del modal -->
                <div class="nav-modal relative w-full max-w-xs rounded-[28px] overflow-hidden shadow-2xl">
                    <!-- Accent bar -->
                    <div class="h-1.5 bg-destructive"></div>

                    <div class="bg-card px-6 pt-6 pb-5">
                        <!-- Icon -->
                        <div class="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                            <LogOut class="w-7 h-7 text-destructive" />
                        </div>

                        <!-- Title -->
                        <h2 class="font-display text-lg font-medium tracking-tight text-center text-foreground mb-3">¿Terminar la visita?</h2>

                        <!-- Description -->
                        <p class="text-center text-sm text-muted-foreground mb-5 leading-relaxed">
                            Parece que te estás despidiendo. ¿Quieres finalizar tu visita y cerrar el chat?
                        </p>

                        <!-- Actions -->
                        <div class="flex flex-col gap-2.5">
                            <button
                                @click="handleConfirmFarewell"
                                class="w-full flex items-center justify-center gap-2 bg-destructive hover:bg-destructive/90 active:scale-[0.97] text-white text-[15px] font-semibold rounded-2xl py-3 transition-all">
                                <LogOut class="w-4.5 h-4.5" />
                                Sí, finalizar
                            </button>
                            <button
                                @click="handleCancelFarewell"
                                class="w-full flex items-center justify-center gap-2 bg-muted hover:bg-muted/70 active:scale-[0.97] text-foreground text-[15px] font-semibold rounded-2xl py-3 transition-all">
                                <X class="w-4.5 h-4.5" />
                                No, seguir aquí
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
        <!-- ── FIN MODAL DE CONFIRMACIÓN DE DESPEDIDA ────────────────────────────── -->

        <!-- ── MODAL DE AGRADECIMIENTO DE DESPEDIDA ───────────────────────────────────── -->
        <Transition name="modal">
            <div v-if="showFarewellModal" class="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

                <!-- Tarjeta del modal -->
                <div class="nav-modal relative w-full max-w-xs rounded-[28px] overflow-hidden shadow-2xl">
                    <!-- Accent bar -->
                    <div class="h-1.5 bg-primary"></div>

                    <div class="bg-card px-6 pt-6 pb-5">
                        <!-- Icon -->
                        <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <Bot class="w-7 h-7 text-primary" />
                        </div>

                        <!-- Title -->
                        <h2 class="font-display text-lg font-medium tracking-tight text-center text-foreground mb-3">Gracias por su visita</h2>

                        <!-- Description -->
                        <p class="text-center text-sm text-muted-foreground mb-5 leading-relaxed">
                            Su sesión de guía ha concluido.
                        </p>

                        <!-- Actions -->
                        <div class="flex flex-col gap-2.5">
                            <button
                                @click="goToMenu"
                                class="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 active:scale-[0.97] text-primary-foreground text-[15px] font-semibold rounded-2xl py-3 transition-all">
                                <Check class="w-4.5 h-4.5" />
                                Ir al menú
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
        <!-- ── FIN MODAL DE AGRADECIMIENTO DE DESPEDIDA ───────────────────────────────── -->

        <!-- ── MODAL DE NIVEL DE CONOCIMIENTO ──────────────────────────────────────── -->
        <Transition name="modal">
            <div v-if="showExpertiseModal"
                class="fixed inset-0 z-[300] flex items-end justify-center sm:items-center"
                @click.self="showExpertiseModal = false">
                <div class="absolute inset-0 bg-foreground/40 backdrop-blur-sm" @click="showExpertiseModal = false" />
                <div class="relative w-full max-w-md bg-card rounded-t-[32px] sm:rounded-[28px] px-5 pt-4 pb-8 shadow-2xl">
                    <div class="w-10 h-1 bg-foreground/20 rounded-full mx-auto mb-5 sm:hidden" />
                    <h2 class="font-display text-lg font-medium tracking-tight text-foreground mb-0.5">Nivel de visita</h2>
                    <p class="text-sm text-muted-foreground mb-4">El robot adapta sus explicaciones a tu nivel.</p>
                    <div class="space-y-2">
                        <button v-for="opt in EXPERTISE_OPTIONS" :key="opt.value"
                            @click="updateExpertise(opt.value)"
                            :disabled="isUpdatingExpertise"
                            class="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all active:scale-[0.98] disabled:opacity-60"
                            :class="currentExpertise === opt.value
                                ? 'bg-primary/10 border-primary/40 text-primary'
                                : 'bg-muted border-transparent text-foreground'">
                            <div class="text-left">
                                <div class="font-semibold text-[15px]">{{ opt.label }}</div>
                                <div class="text-xs text-muted-foreground mt-0.5">{{ opt.desc }}</div>
                            </div>
                            <Check v-if="currentExpertise === opt.value" class="w-5 h-5 flex-shrink-0" />
                            <ChevronRight v-else class="w-4 h-4 flex-shrink-0 opacity-30" />
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
        <!-- ── FIN MODAL DE NIVEL DE CONOCIMIENTO ──────────────────────────────────── -->

        <!-- Tutorial de la primera vez (coachmarks). La lógica está en useTutorial. -->
        <ChatTutorial
            :show="showTutorial"
            :step="tutorialStep"
            :step-count="visibleSteps.length"
            :current="currentTutorialStep"
            :spotlight-style="spotlightStyle"
            :bubble-style="bubbleStyle"
            :tail-style="tailStyle"
            @next="nextTutorialStep"
            @close="closeTutorial" />
    </div>
</template>

<style scoped>
.glass-header {
    background: color-mix(in srgb, var(--color-background) 75%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
}
.flex-col > .relative,
.flex-col > .w-full {
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Transición del banner de aviso de tiempo */
.banner-enter-active, .banner-leave-active { transition: all 0.3s ease; }
.banner-enter-from, .banner-leave-to { opacity: 0; transform: translateY(-8px); max-height: 0; }
.banner-enter-to, .banner-leave-from { max-height: 60px; }

/* Navigation Modal transitions */
.modal-enter-active {
    transition: opacity 0.25s ease;
}
.modal-enter-active .nav-modal {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}
.modal-leave-active {
    transition: opacity 0.2s ease;
}
.modal-leave-active .nav-modal {
    transition: transform 0.2s ease, opacity 0.2s ease;
}
.modal-enter-from {
    opacity: 0;
}
.modal-enter-from .nav-modal {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
}
.modal-leave-to {
    opacity: 0;
}
.modal-leave-to .nav-modal {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
}
</style>
