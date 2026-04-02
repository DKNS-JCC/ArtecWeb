<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { chatService } from '@/services/chatService';
import { Send, LogOut, Bot, Clock, Navigation, Check, X, Loader2, MapPin } from 'lucide-vue-next';

const router   = useRouter();
const authStore = useAuthStore();

const STORAGE_KEY       = 'artec_chat_messages';
const MAX_MESSAGE_LENGTH = 500;

const robotName   = computed(() => authStore.user?.robot_name || 'Robot Guía');
const visitorName = computed(() => authStore.user?.name || 'Amigo');
const messageText = ref('');
const chatContainer = ref(null);
const isSending     = ref(false);
const showForcedEndModal = ref(false);

const welcomeMessage = {
    id:     1,
    sender: 'robot',
    text:   `¡Hola ${visitorName.value}! Soy ${robotName.value}, tu guía robótico. ¿En qué te puedo ayudar?`,
    time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};

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

const messages = ref(loadMessages());

// ── Navigation confirmation state ─────────────────────────────────────────────

/**
 * Set when the AI returns intent=navigate_to with a valid resolved_place.
 * Cleared on confirm, cancel, or new navigate_to.
 * Shape: { place_id, place_name, map_x, map_y } | null
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
        messages.value.push({
            id:              Date.now(),
            sender:          'robot',
            text:            data.nav_message,
            isNavExecuting:  true,
            placeName:       nav.place_name,
            time:            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
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

// ── Session timer (10 min) ────────────────────────────────────────────────────

const EXCLUSIVITY_TIME_SEC = 600;
const timeLeft = ref(EXCLUSIVITY_TIME_SEC);
let timerInterval = null;

const formattedTime = computed(() => {
    const m = Math.floor(timeLeft.value / 60).toString().padStart(2, '0');
    const s = (timeLeft.value % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
});

const isTimeExpiring = computed(() => timeLeft.value < 60);

const startTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(async () => {
        if (timeLeft.value > 0) {
            timeLeft.value--;
            if (timeLeft.value % 3 === 0) {
                const status = await authStore.checkVisitorStatus();
                if (!status.active) handleForcedEndSession();
            }
        } else {
            handleEndSession();
        }
    }, 1000);
};

const handleForcedEndSession = () => {
    if (timerInterval) clearInterval(timerInterval);
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
    sessionStorage.removeItem(STORAGE_KEY);
    await authStore.endVisitor();
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

    // Typing indicator
    isSending.value = true;
    const typingId = Date.now() + 1;
    messages.value.push({ id: typingId, sender: 'robot', text: null, isTyping: true, time: '' });
    scrollToBottom();

    try {
        const data = await chatService.sendMessage(text);

        // Remove typing indicator
        const idx = messages.value.findIndex(m => m.id === typingId);
        if (idx !== -1) messages.value.splice(idx, 1);

        // Add robot response
        messages.value.push({
            id:     Date.now() + 2,
            sender: 'robot',
            text:   data.response,
            intent: data.intent,
            time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        // ── Navigation confirmation gate ──────────────────────────────────
        if (data.intent === 'navigate_to' && data.resolved_place?.map_x != null) {
            // Replace any previous pending nav
            pendingNav.value = {
                place_id:   data.resolved_place.id,
                place_name: data.resolved_place.name,
                map_x:      data.resolved_place.map_x,
                map_y:      data.resolved_place.map_y,
            };
        } else if (data.intent === 'navigate_to' && !data.resolved_place?.map_x) {
            // Place exists but has no coordinates — inform visitor
            pendingNav.value = null;
        }

    } catch (err) {
        const idx = messages.value.findIndex(m => m.id === typingId);
        if (idx !== -1) messages.value.splice(idx, 1);
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

onMounted(() => {
    startTimer();
    scrollToBottom();
});

onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval);
});
</script>

<template>
    <div class="chat-layout bg-[#f2f2f7] dark:bg-black font-sans min-h-[100dvh] flex flex-col fixed inset-0 z-[100] sm:relative sm:z-auto sm:max-w-md sm:mx-auto sm:border-x sm:shadow-2xl">

        <!-- HEADER -->
        <header class="glass-header z-10 flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <button @click="handleEndSession" class="flex flex-col items-center justify-center text-[#ff3b30] hover:opacity-80 active:scale-95 transition-all">
                <LogOut class="w-5 h-5 mb-0.5" />
                <span class="text-[0.65rem] font-medium leading-none uppercase tracking-wider">Finalizar</span>
            </button>

            <div class="flex flex-col items-center justify-center -translate-x-1">
                <div class="w-10 h-10 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-1 ring-2 ring-primary/20">
                    <Bot class="w-6 h-6" />
                </div>
                <h1 class="text-sm font-semibold text-black dark:text-white">{{ robotName }}</h1>
            </div>

            <div class="flex flex-col items-center justify-center bg-black/5 dark:bg-white/10 px-2 py-1.5 rounded-lg border border-transparent transition-colors"
                :class="{'animate-pulse border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400': isTimeExpiring}">
                <Clock class="w-4 h-4 mb-0.5" :class="isTimeExpiring ? 'text-red-500' : 'text-muted-foreground'" />
                <span class="font-mono text-xs font-bold tabular-nums tracking-tighter"
                      :class="isTimeExpiring ? 'text-red-500' : 'text-foreground'">
                    {{ formattedTime }}
                </span>
            </div>
        </header>

        <!-- CHAT MESSAGES -->
        <main ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth overscroll-y-contain pb-[140px]">

            <div class="text-center text-xs text-muted-foreground mb-6 font-medium uppercase tracking-wider bg-black/5 dark:bg-white/5 mx-auto rounded-full py-1.5 px-4 w-fit">
                Conectado
            </div>

            <div v-for="msg in messages" :key="msg.id" class="flex flex-col w-full"
                 :class="msg.sender === 'user' ? 'items-end' : 'items-start'">

                <!-- Nav-executing confirmation badge -->
                <div v-if="msg.isNavExecuting" class="max-w-[85%] mb-1">
                    <div class="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Navigation class="w-3.5 h-3.5 flex-shrink-0" />
                        Navegando → {{ msg.placeName }}
                    </div>
                </div>

                <!-- Bubble -->
                <div class="relative max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm text-[0.95rem] leading-snug break-words"
                    :class="[
                        msg.sender === 'user'
                            ? 'bg-[#007aff] text-white rounded-br-sm'
                            : 'bg-white dark:bg-[#262628] text-black dark:text-white rounded-bl-sm border border-black/5 dark:border-white/5',
                        msg.isError ? 'border-red-300 dark:border-red-500/30' : ''
                    ]">
                    <div v-if="msg.isTyping" class="flex space-x-1.5 px-1 py-1">
                        <span class="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                        <span class="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                        <span class="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style="animation-delay:300ms"></span>
                    </div>
                    <template v-else>{{ msg.text }}</template>
                </div>

                <span v-if="!msg.isTyping" class="text-[0.65rem] text-muted-foreground mt-1 mx-1">{{ msg.time }}</span>
            </div>



        </main>

        <!-- INPUT FOOTER -->
        <footer class="glass-footer absolute bottom-0 left-0 right-0 p-3 sm:pb-3 pb-safe border-t border-black/5 dark:border-white/10">
            <form @submit.prevent="sendMessage"
                class="flex items-end gap-2 p-1 bg-white dark:bg-[#1c1c1e] border border-black/10 dark:border-white/10 rounded-3xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <textarea
                    v-model="messageText"
                    rows="1"
                    :maxlength="MAX_MESSAGE_LENGTH"
                    :disabled="isSending"
                    placeholder="Pregunta a tu guía..."
                    class="flex-1 bg-transparent border-0 focus:ring-0 resize-none px-4 py-2.5 max-h-32 min-h-[44px] text-base placeholder:text-muted-foreground self-center outline-none scrollbar-hide text-black dark:text-white disabled:opacity-50"
                    @keydown.enter.prevent="sendMessage"
                ></textarea>

                <button
                    type="submit"
                    :disabled="!messageText.trim() || isSending"
                    class="w-9 h-9 m-1 rounded-full flex flex-shrink-0 items-center justify-center transition-all"
                    :class="messageText.trim() && !isSending ? 'bg-[#007aff] text-white hover:scale-105 active:scale-95' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'">
                    <Send class="w-4 h-4 ml-0.5" />
                </button>
            </form>
        </footer>

        <!-- FORCED END MODAL -->
        <div v-if="showForcedEndModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div class="bg-white dark:bg-[#1c1c1e] w-full max-w-sm rounded-[32px] p-8 text-center shadow-2xl">
                <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <LogOut class="w-8 h-8" />
                </div>
                <h2 class="text-xl font-bold mb-2 text-foreground">Visita Finalizada</h2>
                <p class="text-sm text-muted-foreground mb-6">Tu sesión ha sido terminada por un administrador del museo.</p>
                <div class="text-[0.65rem] uppercase tracking-widest text-muted-foreground font-semibold">Redirigiendo al inicio...</div>
            </div>
        </div>

        <!-- ── NAVIGATION CONFIRMATION MODAL ──────────────────────────────── -->
        <Transition name="modal">
            <div v-if="pendingNav" class="fixed inset-0 z-[300] flex items-center justify-center p-4" @click.self="handleCancelNav">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

                <!-- Modal Card -->
                <div class="nav-modal relative w-full max-w-xs rounded-[28px] overflow-hidden shadow-2xl">
                    <!-- Gradient top accent -->
                    <div class="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

                    <div class="bg-white dark:bg-[#1c1c1e] px-6 pt-6 pb-5">
                        <!-- Icon -->
                        <div class="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                            <Navigation class="w-7 h-7 text-blue-600 dark:text-blue-400" />
                        </div>

                        <!-- Title -->
                        <h2 class="text-lg font-bold text-center text-black dark:text-white mb-1">Confirmar destino</h2>

                        <!-- Place name -->
                        <p class="text-center text-blue-600 dark:text-blue-400 font-semibold text-base mb-3">
                            {{ pendingNav.place_name }}
                        </p>

                        <!-- Description -->
                        <p class="text-center text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
                            ¿Quieres que el robot te lleve a este lugar?
                        </p>

                        <!-- Actions -->
                        <div class="flex flex-col gap-2.5">
                            <button
                                @click="handleConfirmNav"
                                :disabled="isConfirming"
                                class="w-full flex items-center justify-center gap-2 bg-[#007aff] hover:bg-[#0066d6] active:scale-[0.97] text-white text-[15px] font-semibold rounded-2xl py-3 transition-all disabled:opacity-60">
                                <Loader2 v-if="isConfirming" class="w-4.5 h-4.5 animate-spin" />
                                <Check v-else class="w-4.5 h-4.5" />
                                Sí, llevarme
                            </button>
                            <button
                                @click="handleCancelNav"
                                :disabled="isConfirming"
                                class="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-[#2c2c2e] hover:bg-gray-200 dark:hover:bg-[#3a3a3c] active:scale-[0.97] text-gray-700 dark:text-gray-300 text-[15px] font-semibold rounded-2xl py-3 transition-all disabled:opacity-60">
                                <X class="w-4.5 h-4.5" />
                                No, cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
        <!-- ── END NAVIGATION CONFIRMATION MODAL ─────────────────────────── -->
    </div>
</template>

<style scoped>
.chat-layout {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.glass-header {
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
}
.dark .glass-header {
    background: rgba(0, 0, 0, 0.75);
}

.glass-footer {
    background: rgba(242, 242, 247, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    padding-bottom: env(safe-area-inset-bottom, 12px);
}
.dark .glass-footer {
    background: rgba(0, 0, 0, 0.85);
}

.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

@keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
}
.flex-col > .relative,
.flex-col > .w-full {
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

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
