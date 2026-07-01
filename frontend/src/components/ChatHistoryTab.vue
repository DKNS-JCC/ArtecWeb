<script setup>
/**
 * @module components/ChatHistoryTab
 * @description
 * Pestaña del panel que muestra el **historial de conversaciones** de los
 * visitantes con la guía IA. Permite filtrar por robot y rango de fechas,
 * paginar las sesiones y revisar/eliminar los mensajes de cada sesión.
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** {@link module:services/api}, {@link module:components/ui/Card},
 * {@link module:components/ui/Button}, `lucide-vue-next`.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '@/services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessagesSquare, Bot, Clock, MessageSquare, History, RefreshCw, Calendar, Tag, Trash2, AlertTriangle, X } from 'lucide-vue-next'

// ─── Data ─────────────────────────────────────────────────────────────────────

const robots       = ref([])
const sessions     = ref([])
const total        = ref(0)
const offset       = ref(0)
const LIMIT        = 20

const robotFilter  = ref('')
const dateFrom     = ref('')
const dateTo       = ref('')
const loading      = ref(false)
const loadingMsgs  = ref(false)

const selectedSession = ref(null)
const messages        = ref([])

// session_id a la espera de confirmar el borrado (null = ninguno)
const pendingDelete   = ref(null)
const deleting        = ref(false)

// ─── Mapa de etiquetas de nivel ───────────────────────────────────────────────────────

const EXPERTISE = {
    nino:       { label: 'Niño',       color: 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' },
    general:    { label: 'General',    color: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
    estudiante: { label: 'Estudiante', color: 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
    experto:    { label: 'Experto',    color: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
}

const INTENT_LABEL = {
    navigate_to: 'Navegación',
    explain:     'Explicación',
    greet:       'Saludo',
    farewell:    'Despedida',
    none:        '',
}

// ─── Computadas ──────────────────────────────────────────────────────────────────

const hasMore        = computed(() => offset.value + LIMIT < total.value)
const hasDateFilter  = computed(() => dateFrom.value || dateTo.value)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
    if (!iso) return '-'
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
    return EXPERTISE[level] || { label: level || 'General', color: 'bg-muted text-muted-foreground border-border' }
}

function clearDates() {
    dateFrom.value = ''
    dateTo.value   = ''
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchRobots() {
    try {
        robots.value = await api.get('/chat-history/robots')
    } catch { /* non-critical */ }
}

async function fetchSessions(reset = false) {
    if (reset) {
        offset.value = 0
        sessions.value = []
        selectedSession.value = null
        messages.value = []
        pendingDelete.value = null
    }
    loading.value = true
    try {
        const qs = new URLSearchParams({ limit: LIMIT, offset: offset.value })
        if (robotFilter.value) qs.set('robot_id', robotFilter.value)
        if (dateFrom.value)    qs.set('date_from', dateFrom.value)
        if (dateTo.value)      qs.set('date_to',   dateTo.value)

        const data = await api.get(`/chat-history/sessions?${qs}`)
        sessions.value = reset ? data.sessions : [...sessions.value, ...data.sessions]
        total.value    = data.total
    } finally {
        loading.value = false
    }
}

async function loadMore() {
    offset.value += LIMIT
    await fetchSessions()
}

async function selectSession(s) {
    if (pendingDelete.value) return   // bloquea la selección mientras se confirma el borrado
    selectedSession.value = s
    messages.value        = []
    loadingMsgs.value     = true
    try {
        const data     = await api.get(`/chat-history/sessions/${s.session_id}/messages`)
        messages.value = data.messages
    } finally {
        loadingMsgs.value = false
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

function requestDelete(e, sessionId) {
    e.stopPropagation()
    pendingDelete.value = sessionId
}

function cancelDelete(e) {
    e?.stopPropagation()
    pendingDelete.value = null
}

async function confirmDelete(e, sessionId) {
    e.stopPropagation()
    deleting.value = true
    try {
        await api.delete(`/chat-history/sessions/${sessionId}`)
        sessions.value = sessions.value.filter(s => s.session_id !== sessionId)
        total.value    = Math.max(0, total.value - 1)
        if (selectedSession.value?.session_id === sessionId) {
            selectedSession.value = null
            messages.value = []
        }
    } catch (err) {
        console.error('[History] Delete failed:', err)
    } finally {
        deleting.value      = false
        pendingDelete.value = null
    }
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

watch(robotFilter, () => fetchSessions(true))
watch(dateFrom,    () => fetchSessions(true))
watch(dateTo,      () => fetchSessions(true))

onMounted(async () => {
    await fetchRobots()
    await fetchSessions(true)
})
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h2 class="font-display text-xl font-medium tracking-tight text-foreground">Historial de Conversaciones</h2>
      <Button @click="fetchSessions(true)" variant="outline" size="sm" class="gap-2">
          <RefreshCw class="w-4 h-4" /> Recargar
      </Button>
    </div>

    <!-- Barra de filtros -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <!-- Filtro de robot -->
      <div class="relative">
        <Bot class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <select
          v-model="robotFilter"
          class="h-10 rounded-sm border border-input bg-background pl-9 pr-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none appearance-none"
        >
          <option value="">Todos los robots</option>
          <option v-for="r in robots" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>

      <!-- Fecha desde -->
      <div class="relative">
        <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          v-model="dateFrom"
          type="date"
          :max="dateTo || undefined"
          class="h-10 rounded-sm border border-input bg-background pl-9 pr-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
        />
      </div>

      <span class="text-xs text-muted-foreground">-</span>

      <!-- Date to -->
      <div class="relative">
        <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          v-model="dateTo"
          type="date"
          :min="dateFrom || undefined"
          class="h-10 rounded-sm border border-input bg-background pl-9 pr-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
        />
      </div>

      <!-- Limpiar fechas -->
      <Button v-if="hasDateFilter" @click="clearDates" variant="ghost" size="sm" class="gap-1.5 text-muted-foreground hover:text-foreground">
        <X class="w-3.5 h-3.5" /> Limpiar fechas
      </Button>

      <!-- Contador de sesiones -->
      <span class="text-sm text-muted-foreground ml-auto bg-muted/50 px-3 py-1.5 rounded-full border border-border">
        <History class="w-4 h-4 inline-block mr-1 align-text-bottom" />
        {{ total }} sesión{{ total !== 1 ? 'es' : '' }}
      </span>
    </div>

    <!-- Disposición de dos paneles -->
    <div class="flex gap-4" style="min-height: 520px;">

      <!-- ── Lista de sesiones (izquierda) ─────────────────────────────────── -->
      <div class="w-full md:w-2/5 flex flex-col gap-2 overflow-y-auto pr-1" style="max-height:620px;">

        <p v-if="loading && sessions.length === 0" class="text-sm text-muted-foreground text-center py-10 animate-pulse">
          Cargando sesiones…
        </p>

        <p v-else-if="sessions.length === 0" class="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-md border-border bg-card/50">
          No hay conversaciones registradas.
        </p>

        <div
          v-for="s in sessions"
          :key="s.session_id"
          :class="[
            'w-full text-left rounded-md border transition-all',
            pendingDelete === s.session_id
              ? 'border-destructive/60 bg-destructive/5'
              : selectedSession?.session_id === s.session_id
                ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20 cursor-pointer hover:border-primary/60'
                : 'border-border bg-card cursor-pointer hover:border-primary/60'
          ]"
        >
          <!-- Normal view -->
          <div
            v-if="pendingDelete !== s.session_id"
            class="p-4"
            @click="selectSession(s)"
          >
            <!-- Fila 1: nombre + insignia + botón de borrar -->
            <div class="flex items-start justify-between gap-2 mb-2">
              <span class="font-semibold text-sm text-foreground truncate flex items-center gap-1.5">
                <span class="w-6 h-6 flex items-center justify-center bg-primary/10 text-primary rounded-full text-xs shrink-0 uppercase">
                   {{ s.visitor_name.charAt(0) }}
                </span>
                {{ s.visitor_name }}
              </span>
              <div class="flex items-center gap-1.5 shrink-0">
                <span :class="['text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border', expertiseBadge(s.expertise_level).color]">
                  {{ expertiseBadge(s.expertise_level).label }}
                </span>
                <button
                  @click.stop="requestDelete($event, s.session_id)"
                  class="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Eliminar sesión"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <!-- Fila 2: robot + fecha -->
            <div class="text-xs text-muted-foreground mb-2 flex items-center gap-1">
               <Bot class="w-3 h-3" /> {{ s.robot_name }}
               <span class="mx-1 opacity-50">•</span>
               <Calendar class="w-3 h-3" /> {{ formatDate(s.started_at) }}
            </div>
            <!-- Fila 3: estadísticas -->
            <div class="flex items-center gap-3 text-xs font-medium text-muted-foreground bg-muted/30 p-1.5 rounded-md">
              <span class="flex items-center gap-1"><Clock class="w-3 h-3" /> {{ formatDuration(s.duration_minutes) }}</span>
              <span class="flex items-center gap-1"><MessageSquare class="w-3 h-3" /> {{ s.message_count }} msgs</span>
              <span v-if="s.top_intent && INTENT_LABEL[s.top_intent]" class="flex items-center gap-1"><Tag class="w-3 h-3" /> {{ INTENT_LABEL[s.top_intent] }}</span>
              <span v-if="!s.ended_at" class="ml-auto text-green-600 flex items-center gap-1"><span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Activa</span>
            </div>
          </div>

          <!-- Vista de confirmación de borrado -->
          <div v-else class="p-4 flex flex-col gap-3">
            <div class="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle class="w-4 h-4 shrink-0" />
              ¿Eliminar sesión de <span class="font-bold truncate">{{ s.visitor_name }}</span>?
            </div>
            <p class="text-xs text-muted-foreground">
              Se ocultará del historial pero seguirá contando en las estadísticas.
            </p>
            <div class="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                class="flex-1 gap-1.5"
                :disabled="deleting"
                @click="confirmDelete($event, s.session_id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
                {{ deleting ? 'Eliminando…' : 'Confirmar' }}
              </Button>
              <Button
                size="sm"
                variant="outline"
                class="flex-1"
                :disabled="deleting"
                @click="cancelDelete($event)"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>

        <!-- Cargar más -->
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

      <!-- ── Panel de conversación (derecha) ─────────────────────────── -->
      <div class="hidden md:flex flex-1 flex-col border border-border shadow-sm rounded-md bg-card overflow-hidden">

        <!-- Estado vacío -->
        <div v-if="!selectedSession" class="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8 text-center bg-muted/10">
          <MessagesSquare class="w-12 h-12 text-muted-foreground/30" />
          <div class="space-y-1">
            <p class="font-medium text-foreground">Ninguna sesión seleccionada</p>
            <p class="text-sm">Selecciona una sesión de la lista para ver la transcripción completa de la conversación.</p>
          </div>
        </div>

        <template v-else>
          <!-- Cabecera -->
          <div class="border-b border-border px-5 py-4 bg-muted/30 flex items-center justify-between shadow-sm z-10">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 flex items-center justify-center bg-primary/10 text-primary rounded-full font-bold text-lg uppercase shadow-inner">
                 {{ selectedSession.visitor_name.charAt(0) }}
              </div>
              <div>
                <p class="font-semibold text-sm text-foreground">{{ selectedSession.visitor_name }}</p>
                <div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                   <span class="flex items-center gap-1"><Bot class="w-3 h-3" /> {{ selectedSession.robot_name }}</span>
                   <span class="opacity-50">•</span>
                   <span>{{ formatDate(selectedSession.started_at) }}</span>
                </div>
              </div>
            </div>
            <div class="text-right">
                <span :class="['text-[11px] font-bold px-2.5 py-1 rounded-full border', expertiseBadge(selectedSession.expertise_level).color]">
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
