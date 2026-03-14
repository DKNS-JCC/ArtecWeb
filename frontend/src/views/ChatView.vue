<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Send, LogOut, Bot, Clock } from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();

const robotName = computed(() => authStore.user?.robot_name || 'Robot Guía');
const visitorName = computed(() => authStore.user?.name || 'Amigo');
const messageText = ref('');
const chatContainer = ref(null);

const messages = ref([
    {
        id: 1,
        sender: 'robot',
        text: `¡Hola ${visitorName.value}! Soy ${robotName.value}, tu guía robótico. ¿En qué te puedo ayudar?`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
]);

// --- SESSION TIMER LOGIC (10 Minutes) ---
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
    timerInterval = setInterval(() => {
        if (timeLeft.value > 0) {
            timeLeft.value--;
        } else {
            handleEndSession();
        }
    }, 1000);
};

const resetTimer = () => {
    timeLeft.value = EXCLUSIVITY_TIME_SEC;
    authStore.pingVisitor();
    startTimer();
};

const handleEndSession = async () => {
    if (timerInterval) clearInterval(timerInterval);
    await authStore.endVisitor();
    router.push('/');
};

// --- CHAT LOGIC ---
const scrollToBottom = async () => {
    await nextTick();
    if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
};

const sendMessage = () => {
    if (!messageText.value.trim()) return;

    // Reset the exclusivity timer
    resetTimer();

    // Add user message
    messages.value.push({
        id: Date.now(),
        sender: 'user',
        text: messageText.value.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    const userQ = messageText.value.trim();
    messageText.value = '';
    scrollToBottom();

    // Fake robot reply
    setTimeout(() => {
        messages.value.push({
            id: Date.now() + 1,
            sender: 'robot',
            text: `Interesante. Todavía estoy en modo simulación, pero pronto podré llevarte a donde pidas. (Has dicho: "${userQ}")`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        scrollToBottom();
    }, 1000);
};

onMounted(() => {
    // If not a visitor, send them back (or allow standard testing)
    startTimer();
    scrollToBottom();
});

onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval);
});
</script>

<template>
    <div class="chat-layout bg-[#f2f2f7] dark:bg-black font-sans min-h-[100dvh] flex flex-col fixed inset-0 z-[100] sm:relative sm:z-auto sm:max-w-md sm:mx-auto sm:border-x sm:shadow-2xl">
        
        <!-- HEADER (iOS Style) -->
        <header class="glass-header z-10 flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <!-- End Session Button -->
            <button @click="handleEndSession" class="flex flex-col items-center justify-center text-[#ff3b30] hover:opacity-80 active:scale-95 transition-all">
                <LogOut class="w-5 h-5 mb-0.5" />
                <span class="text-[0.65rem] font-medium leading-none uppercase tracking-wider">Finalizar</span>
            </button>

            <!-- Robot Info -->
            <div class="flex flex-col items-center justify-center -translate-x-1">
                <div class="w-10 h-10 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-1 ring-2 ring-primary/20">
                    <Bot class="w-6 h-6" />
                </div>
                <h1 class="text-sm font-semibold text-black dark:text-white">{{ robotName }}</h1>
            </div>

            <!-- Timer -->
            <div class="flex flex-col items-center justify-center bg-black/5 dark:bg-white/10 px-2 py-1.5 rounded-lg border border-transparent transition-colors"
                :class="{'animate-pulse border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400': isTimeExpiring}">
                <Clock class="w-4 h-4 mb-0.5" :class="isTimeExpiring ? 'text-red-500' : 'text-muted-foreground'" />
                <span class="font-mono text-xs font-bold font-variant-numeric-tabular tabular-nums tracking-tighter"
                      :class="isTimeExpiring ? 'text-red-500' : 'text-foreground'">
                    {{ formattedTime }}
                </span>
            </div>
        </header>

        <!-- CHAT MESSAGES -->
        <main ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth overscroll-y-contain pb-[120px]">
            
            <div class="text-center text-xs text-muted-foreground mb-6 font-medium uppercase tracking-wider bg-black/5 dark:bg-white/5 mx-auto rounded-full py-1.5 px-4 w-fit">
                Conectado
            </div>

            <div v-for="msg in messages" :key="msg.id" class="flex flex-col w-full"
                 :class="msg.sender === 'user' ? 'items-end' : 'items-start'">
                
                <div class="relative max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm text-[0.95rem] leading-snug break-words"
                    :class="[
                        msg.sender === 'user' 
                            ? 'bg-[#007aff] text-white rounded-br-sm' 
                            : 'bg-white dark:bg-[#262628] text-black dark:text-white rounded-bl-sm border border-black/5 dark:border-white/5'
                    ]">
                    {{ msg.text }}
                </div>
                <span class="text-[0.65rem] text-muted-foreground mt-1 mx-1">{{ msg.time }}</span>
            </div>

        </main>

        <!-- INPUT FOOTER -->
        <footer class="glass-footer absolute bottom-0 left-0 right-0 p-3 sm:pb-3 pb-safe border-t border-black/5 dark:border-white/10">
            <form @submit.prevent="sendMessage" class="flex items-end gap-2 p-1 bg-white dark:bg-[#1c1c1e] border border-black/10 dark:border-white/10 rounded-3xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <textarea
                    v-model="messageText"
                    rows="1"
                    placeholder="Pregunta a tu guía..."
                    class="flex-1 bg-transparent border-0 focus:ring-0 resize-none px-4 py-2.5 max-h-32 min-h-[44px] text-base placeholder:text-muted-foreground self-center outline-none scrollbar-hide text-black dark:text-white"
                    @keydown.enter.prevent="sendMessage"
                ></textarea>
                
                <button 
                    type="submit" 
                    :disabled="!messageText.trim()"
                    class="w-9 h-9 m-1 rounded-full flex flex-shrink-0 items-center justify-center transition-all"
                    :class="messageText.trim() ? 'bg-[#007aff] text-white hover:scale-105 active:scale-95' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'">
                    <Send class="w-4 h-4 ml-0.5" />
                </button>
            </form>
        </footer>
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

.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

/* Animations */
@keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
.flex-col > .relative {
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) ease-out forwards;
}
</style>
