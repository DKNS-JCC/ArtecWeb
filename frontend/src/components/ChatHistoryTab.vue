<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '@/services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessagesSquare, Bot, Clock, MessageSquare, History, RefreshCw, Calendar, Tag } from 'lucide-vue-next'

// ─── Data ─────────────────────────────────────────────────────────────────────

const robots       = ref([])
const sessions     = ref([])
const total        = ref(0)
const offset       = ref(0)
const LIMIT        = 20

const robotFilter  = ref('')
const loading      = ref(false)
const loadingMsgs  = ref(false)

const selectedSession = ref(null)   // session metadata
const messages        = ref([])     // messages for selected session

// ─── Expertise label map ───────────────────────────────────────────────────────

const EXPERTISE = {
    nino:       { label: 'Niño',       color: 'bg-yellow-100 text-yellow-800' },
    general:    { label: 'General',    color: 'bg-blue-100   text-blue-800'   },
    estudiante: { label: 'Estudiante', color: 'bg-purple-100 text-purple-800' },
    experto:    { label: 'Experto',    color: 'bg-green-100  text-green-800'  },
}

const INTENT_LABEL = {
    navigate_to: 'Navegación',
    explain:     'Explicación',
    greet:       'Saludo',
    farewell:    'Despedida',
    none:        '',
}

// ─── Computed ──────────────────────────────────────────────────────────────────

const hasMore = computed(() => offset.value + LIMIT < total.value)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })
}

function formatDuration(mins) {
    if (!mins || mins < 0) return '< 1 min'
    if (mins < 60) return `${Math.round(mins)} min`
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
}

function expertiseBadge(level) {
    return EXPERTISE[level] || { label: level || 'General', color: 'bg-gray-100 text-gray-700' }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchRobots() {
    try {
        robots.value = await api.get('/chat-history/robots')
    } catch { /* non-critical */ }
}

async function fetchSessions(reset = false) {
    if (reset) { offset.value = 0; sessions.value = []; selectedSession.value = null; messages.value = [] }
    loading.value = true
    try {
        const qs     = robotFilter.value ? `&robot_id=${robotFilter.value}` : ''
        const data   = await api.get(`/chat-history/sessions?limit=${LIMIT}&offset=${offset.value}${qs}`)
        sessions.value = reset ? data.sessions : [...sessions.value, ...data.sessions]
        total.value  = data.total
    } finally {
        loading.value = false
    }
}

async function loadMore() {
    offset.value += LIMIT
    await fetchSessions()
}

async function selectSession(s) {
    selectedSession.value = s
    messages.value        = []
    loadingMsgs.value     = true
    try {
        const data    = await api.get(`/chat-history/sessions/${s.session_id}/messages`)
        messages.value = data.messages
    } finally {
        loadingMsgs.value = false
    }
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

watch(robotFilter, () => fetchSessions(true))

onMounted(async () => {
    await fetchRobots()
    await fetchSessions(true)
})
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-semibold text-foreground">Historial de Conversaciones</h2>
      <Button @click="fetchSessions(true)" variant="outline" size="sm" class="gap-2">
          <RefreshCw class="w-4 h-4" /> Recargar
      </Button>
    </div>

    <!-- Filter bar -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <div class="relative flex-1 max-w-xs">
        <Bot class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <select
          v-model="robotFilter"
          class="w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-primary appearance-none"
        >
          <option value="">Todos los robots</option>
          <option v-for="r in robots" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>

      <span class="text-sm text-muted-foreground ml-auto bg-muted/50 px-3 py-1.5 rounded-full border border-border">
        <History class="w-4 h-4 inline-block mr-1 align-text-bottom" />
        {{ total }} sesión{{ total !== 1 ? 'es' : '' }} encontrada{{ total !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Two-panel layout -->
    <div class="flex gap-4" style="min-height: 520px;">

      <!-- ── Session list (left) ─────────────────────────────────── -->
      <div class="w-full md:w-2/5 flex flex-col gap-2 overflow-y-auto pr-1" style="max-height:620px;">

        <p v-if="loading && sessions.length === 0" class="text-sm text-muted-foreground text-center py-10 animate-pulse">
          Cargando sesiones…
        </p>

        <p v-else-if="sessions.length === 0" class="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-xl border-border bg-card/50">
          No hay conversaciones registradas.
        </p>

        <button
          v-for="s in sessions"
          :key="s.session_id"
          @click="selectSession(s)"
          :class="[
            'w-full text-left rounded-xl border p-4 transition-all hover:border-primary/60',
            selectedSession?.session_id === s.session_id
              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
              : 'border-border bg-card'
          ]"
        >
          <!-- Row 1: name + badge -->
          <div class="flex items-start justify-between gap-2 mb-2">
            <span class="font-semibold text-sm text-foreground truncate flex items-center gap-1.5">
              <span class="w-6 h-6 flex items-center justify-center bg-primary/10 text-primary rounded-full text-xs shrink-0 uppercase">
                 {{ s.visitor_name.charAt(0) }}
              </span>
              {{ s.visitor_name }}
            </span>
            <span :class="['text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border', expertiseBadge(s.expertise_level).color, expertiseBadge(s.expertise_level).color.replace('bg-', 'border-').replace('100', '200')]">
              {{ expertiseBadge(s.expertise_level).label }}
            </span>
          </div>
          <!-- Row 2: robot + date -->
          <div class="text-xs text-muted-foreground mb-2 flex items-center gap-1">
             <Bot class="w-3 h-3" /> {{ s.robot_name }} 
             <span class="mx-1 opacity-50">•</span> 
             <Calendar class="w-3 h-3" /> {{ formatDate(s.started_at) }}
          </div>
          <!-- Row 3: stats -->
          <div class="flex items-center gap-3 text-xs font-medium text-muted-foreground bg-muted/30 p-1.5 rounded-md">
            <span class="flex items-center gap-1"><Clock class="w-3 h-3" /> {{ formatDuration(s.duration_minutes) }}</span>
            <span class="flex items-center gap-1"><MessageSquare class="w-3 h-3" /> {{ s.message_count }} msgs</span>
            <span v-if="s.top_intent && INTENT_LABEL[s.top_intent]" class="flex items-center gap-1"><Tag class="w-3 h-3" /> {{ INTENT_LABEL[s.top_intent] }}</span>
            <span v-if="!s.ended_at" class="ml-auto text-green-600 flex items-center gap-1"><span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Activa</span>
          </div>
        </button>

        <!-- Load more -->
        <Button
          v-if="hasMore"
          variant="secondary"
          size="sm"
          class="mt-2 w-full font-medium"
          :disabled="loading"
          @click="loadMore"
        >
          {{ loading ? 'Cargando...' : 'Cargar más antiguas' }}
        </Button>
      </div>

      <!-- ── Conversation panel (right) ─────────────────────────── -->
      <div class="hidden md:flex flex-1 flex-col border border-border shadow-sm rounded-2xl bg-card overflow-hidden">

        <!-- Empty state -->
        <div v-if="!selectedSession" class="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8 text-center bg-muted/10">
          <MessagesSquare class="w-12 h-12 text-muted-foreground/30" />
          <div class="space-y-1">
            <p class="font-medium text-foreground">Ninguna sesión seleccionada</p>
            <p class="text-sm">Selecciona una sesión de la lista para ver la transcripción completa de la conversación.</p>
          </div>
        </div>

        <template v-else>
          <!-- Header -->
          <div class="border-b border-border px-5 py-4 bg-muted/30 flex items-center justify-between shadow-sm z-10">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 flex items-center justify-center bg-primary/10 text-primary rounded-full font-bold text-lg uppercase shadow-inner">
                 {{ selectedSession.visitor_name.charAt(0) }}
              </div>
              <div>
                <p class="font-bold text-sm text-foreground">{{ selectedSession.visitor_name }}</p>
                <div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                   <span class="flex items-center gap-1"><Bot class="w-3 h-3" /> {{ selectedSession.robot_name }}</span>
                   <span class="opacity-50">•</span>
                   <span>{{ formatDate(selectedSession.started_at) }}</span>
                </div>
              </div>
            </div>
            <div class="text-right">
                <span :class="['text-[11px] font-bold px-2.5 py-1 rounded-full border', expertiseBadge(selectedSession.expertise_level).color, expertiseBadge(selectedSession.expertise_level).color.replace('bg-', 'border-').replace('100', '200')]">
                  Perfil: {{ expertiseBadge(selectedSession.expertise_level).label }}
                </span>
                <p class="text-[10px] text-muted-foreground mt-1.5 flex items-center justify-end gap-1">
                    <Clock class="w-3 h-3" /> Duración: {{ formatDuration(selectedSession.duration_minutes) }}
                </p>
            </div>
          </div>

          <!-- Messages -->
          <div class="flex-1 overflow-y-auto px-5 py-6 space-y-4 bg-muted/10" style="max-height: 520px;">
            <p v-if="loadingMsgs" class="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse py-12">
              <Bot class="w-6 h-6 opacity-50" />
              Cargando mensajes...
            </p>

            <p v-else-if="messages.length === 0" class="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground py-12">
              <MessageSquare class="w-6 h-6 opacity-30" />
              Esta sesión no tiene mensajes registrados.
            </p>

            <div
              v-for="(msg, i) in messages"
              :key="i"
              :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
            >
              <div
                :class="[
                  'max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm relative group',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-card border border-border text-foreground rounded-bl-sm'
                ]"
              >
                <p class="leading-relaxed whitespace-pre-wrap">{{ msg.content }}</p>
                <div class="flex items-center justify-between gap-4 mt-2" :class="msg.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'">
                  <span v-if="msg.intent && msg.intent !== 'none' && msg.role === 'assistant'"
                        class="text-[10px] font-medium bg-background/50 px-1.5 rounded">
                    {{ INTENT_LABEL[msg.intent] || msg.intent }}
                  </span>
                  <span v-else></span>
                  <span class="text-[10px] font-medium ml-auto">
                    {{ new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>
