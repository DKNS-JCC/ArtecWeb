<script setup>
/**
 * @module components/StatsTab
 * @description
 * Pestaña del panel con las **estadísticas** del museo: totales de robots,
 * visitantes y museos, tiempo medio de sesión y distribuciones (visitantes por
 * día, nivel de experiencia, intenciones y actividad por robot).
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** {@link module:services/api}, {@link module:stores/auth},
 * {@link module:components/ui/Card}, {@link module:components/ui/Button},
 * `lucide-vue-next`.
 */
import { ref, computed, onMounted } from 'vue'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Building2, Users, Clock, Bot, TrendingUp } from 'lucide-vue-next'

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => authStore.isPlatformAdmin)

// ─── Estado ────────────────────────────────────────────────────────────────────

const stats = ref({
    totalRobots: 0, activeRobots: 0, totalVisitors: 0, avgSessionTime: 0,
    totalMuseums: null, visitorsByDay: [], expertiseDist: [], intentDist: [], robotActivity: []
})
const loading = ref(false)

async function fetchStats() {
    loading.value = true
    try {
        const data = await api.get('/admin/stats')
        stats.value = { ...stats.value, ...data }
    } catch (e) {
        console.error('[Stats]', e)
    } finally {
        loading.value = false
    }
}

onMounted(fetchStats)
defineExpose({ refresh: fetchStats })

// ─── Config ───────────────────────────────────────────────────────────────────

const EXP_COLORS  = { nino: '#fbbf24', general: '#60a5fa', estudiante: '#a78bfa', experto: '#34d399' }
const EXP_LABELS  = { nino: 'Niño',    general: 'General', estudiante: 'Estudiante', experto: 'Experto' }
const INTENT_LABELS  = { navigate_to: 'Navegación', explain: 'Explicación', greet: 'Saludo', farewell: 'Despedida' }
const INTENT_COLORS  = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171']

// Donut constants exposed to template
const DONUT_R  = 36
const DONUT_CX = 60
const DONUT_CY = 60
const DONUT_C  = 2 * Math.PI * DONUT_R  // ≈ 226.19

// ─── KPI helpers ─────────────────────────────────────────────────────────────

function fmtTime(mins) {
    if (!mins || mins <= 0) return '-'
    if (mins < 60) return `${mins.toFixed(1)} min`
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
}

// ─── Bar chart - last 7 days ──────────────────────────────────────────────────

const PLOT_H = 80    // px in SVG coordinate space
const SLOT_W = 40    // 280 / 7

const filledDays = computed(() => {
    const result = []
    for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = d.toISOString().split('T')[0]
        const found = (stats.value.visitorsByDay || []).find(r => r.day === key)
        result.push({
            label: d.toLocaleDateString('es-ES', { weekday: 'short' }),
            count: found?.count || 0,
        })
    }
    return result
})

const barMax = computed(() => Math.max(1, ...filledDays.value.map(d => d.count)))

const bars = computed(() => filledDays.value.map((d, i) => {
    const h = d.count > 0 ? Math.max(3, (d.count / barMax.value) * PLOT_H) : 0
    return { ...d, x: i * SLOT_W + 4, w: SLOT_W - 8, h, y: PLOT_H - h }
}))

const hasDayData = computed(() => bars.value.some(b => b.count > 0))

// ─── Gráfico de donut - distribución por nivel ────────────────────────────────────

const donutTotal = computed(() =>
    (stats.value.expertiseDist || []).reduce((s, d) => s + d.count, 0)
)

const donutSegments = computed(() => {
    const total = donutTotal.value
    if (!total) return []
    let cum = 0
    return (stats.value.expertiseDist || []).map(d => {
        const arc = (d.count / total) * DONUT_C
        const seg = {
            level: d.level,
            count: d.count,
            pct: Math.round((d.count / total) * 100),
            dasharray: `${arc.toFixed(2)} ${DONUT_C.toFixed(2)}`,
            dashoffset: (-cum).toFixed(2),
            color: EXP_COLORS[d.level] || '#94a3b8',
            label: EXP_LABELS[d.level] || d.level,
        }
        cum += arc
        return seg
    })
})

// ─── Horizontal bar helpers ───────────────────────────────────────────────────

const intentMax = computed(() => Math.max(1, ...(stats.value.intentDist    || []).map(d => d.count)))
const robotMax  = computed(() => Math.max(1, ...(stats.value.robotActivity || []).map(d => d.count)))
</script>

<template>
  <div>
    <!-- Cabecera -->
    <div class="flex justify-between items-center mb-6">
      <h2 class="font-display text-xl font-medium tracking-tight text-foreground">Estadísticas del Sistema</h2>
      <Button @click="fetchStats" variant="outline" size="sm" class="gap-2" :disabled="loading">
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Recargar
      </Button>
    </div>

    <!-- ── KPI Cards ─────────────────────────────────────────────────────────── -->
    <div class="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">

      <Card class="overflow-hidden">
        <div class="h-1 bg-blue-500"></div>
        <CardContent class="p-5">
          <div class="flex items-start justify-between mb-3">
            <p class="text-sm text-muted-foreground font-medium leading-tight">Visitantes totales</p>
            <div class="w-8 h-8 shrink-0 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users class="w-4 h-4 text-blue-500" />
            </div>
          </div>
          <div class="font-display text-3xl font-medium text-foreground">
            {{ (stats.totalVisitors || 0).toLocaleString('es-ES') }}
          </div>
          <p class="text-xs text-muted-foreground mt-1">Interacciones registradas</p>
        </CardContent>
      </Card>

      <Card class="overflow-hidden">
        <div class="h-1 bg-purple-500"></div>
        <CardContent class="p-5">
          <div class="flex items-start justify-between mb-3">
            <p class="text-sm text-muted-foreground font-medium leading-tight">Sesión promedio</p>
            <div class="w-8 h-8 shrink-0 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Clock class="w-4 h-4 text-purple-500" />
            </div>
          </div>
          <div class="font-display text-3xl font-medium text-foreground">{{ fmtTime(stats.avgSessionTime) }}</div>
          <p class="text-xs text-muted-foreground mt-1">Duración media por visita</p>
        </CardContent>
      </Card>

      <Card class="overflow-hidden">
        <div class="h-1 bg-emerald-500"></div>
        <CardContent class="p-5">
          <div class="flex items-start justify-between mb-3">
            <p class="text-sm text-muted-foreground font-medium leading-tight">Robots</p>
            <div class="w-8 h-8 shrink-0 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Bot class="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <div class="font-display text-3xl font-medium text-foreground">{{ stats.totalRobots || 0 }}</div>
          <p class="text-xs mt-1">
            <span class="text-emerald-600 dark:text-emerald-400 font-medium">{{ stats.activeRobots || 0 }} en operación</span>
            <span class="text-muted-foreground"> · {{ (stats.totalRobots || 0) - (stats.activeRobots || 0) }} en espera</span>
          </p>
        </CardContent>
      </Card>

      <!-- Museos (superadmin) / % activos (museum admin) -->
      <Card v-if="isPlatformAdmin" class="overflow-hidden">
        <div class="h-1 bg-amber-500"></div>
        <CardContent class="p-5">
          <div class="flex items-start justify-between mb-3">
            <p class="text-sm text-muted-foreground font-medium leading-tight">Museos</p>
            <div class="w-8 h-8 shrink-0 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Building2 class="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <div class="font-display text-3xl font-medium text-foreground">{{ stats.totalMuseums ?? '-' }}</div>
          <p class="text-xs text-muted-foreground mt-1">Instalaciones en la plataforma</p>
        </CardContent>
      </Card>
      <Card v-else class="overflow-hidden">
        <div class="h-1 bg-amber-500"></div>
        <CardContent class="p-5">
          <div class="flex items-start justify-between mb-3">
            <p class="text-sm text-muted-foreground font-medium leading-tight">Robots activos</p>
            <div class="w-8 h-8 shrink-0 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <TrendingUp class="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <div class="font-display text-3xl font-medium text-foreground">
            {{ stats.totalRobots ? Math.round((stats.activeRobots / stats.totalRobots) * 100) : 0 }}%
          </div>
          <p class="text-xs text-muted-foreground mt-1">En operación ahora mismo</p>
        </CardContent>
      </Card>
    </div>

    <!-- ── Charts - fila 1 ───────────────────────────────────────────────────── -->
    <div class="grid gap-4 md:grid-cols-5 mb-4">

      <!-- Barras: visitantes últimos 7 días (3/5) -->
      <Card class="md:col-span-3">
        <CardHeader class="pb-1 px-5 pt-5">
          <p class="text-sm font-medium text-foreground">Visitantes - últimos 7 días</p>
        </CardHeader>
        <CardContent class="px-5 pb-5 pt-3">
          <div v-if="!loading && !hasDayData"
               class="h-28 flex items-center justify-center text-sm text-muted-foreground">
            Sin visitas en los últimos 7 días
          </div>
          <svg v-else viewBox="0 0 280 105" class="w-full" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico de visitas diarias">
            <!-- Líneas de la cuadrícula -->
            <line x1="0" :y1="PLOT_H * 0.75" x2="280" :y2="PLOT_H * 0.75" stroke="currentColor" stroke-opacity="0.07" stroke-width="1"/>
            <line x1="0" :y1="PLOT_H * 0.5"  x2="280" :y2="PLOT_H * 0.5"  stroke="currentColor" stroke-opacity="0.07" stroke-width="1"/>
            <line x1="0" :y1="PLOT_H * 0.25" x2="280" :y2="PLOT_H * 0.25" stroke="currentColor" stroke-opacity="0.07" stroke-width="1"/>
            <!-- Baseline -->
            <line x1="0" :y1="PLOT_H" x2="280" :y2="PLOT_H" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>

            <g v-for="(bar, i) in bars" :key="i">
              <!-- Bar -->
              <rect v-if="bar.h > 0"
                :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h"
                rx="2" fill="#3b82f6" fill-opacity="0.78"
              />
              <!-- Count label -->
              <text v-if="bar.count > 0"
                :x="bar.x + bar.w / 2" :y="Math.max(bar.y - 3, 9)"
                text-anchor="middle" fill="currentColor" fill-opacity="0.55" font-size="7.5">{{ bar.count }}</text>
              <!-- Day label -->
              <text
                :x="bar.x + bar.w / 2" y="100"
                text-anchor="middle" fill="currentColor" fill-opacity="0.45" font-size="8" class="capitalize">{{ bar.label }}</text>
            </g>
          </svg>
        </CardContent>
      </Card>

      <!-- Donut: distribución de perfiles (2/5) -->
      <Card class="md:col-span-2">
        <CardHeader class="pb-1 px-5 pt-5">
          <p class="text-sm font-medium text-foreground">Perfil de visitantes</p>
        </CardHeader>
        <CardContent class="px-5 pb-5 pt-3">
          <div v-if="!donutTotal && !loading"
               class="h-28 flex items-center justify-center text-sm text-muted-foreground">
            Sin datos aún
          </div>
          <div v-else class="flex gap-5 items-center">
            <!-- Donut SVG -->
            <svg viewBox="0 0 120 120" class="w-[7.5rem] h-[7.5rem] shrink-0" xmlns="http://www.w3.org/2000/svg">
              <!-- Track -->
              <circle :cx="DONUT_CX" :cy="DONUT_CY" :r="DONUT_R"
                fill="none" stroke="currentColor" stroke-opacity="0.08" stroke-width="14"/>
              <!-- Segments stacked via stroke-dasharray / dashoffset -->
              <circle v-for="seg in donutSegments" :key="seg.level"
                :cx="DONUT_CX" :cy="DONUT_CY" :r="DONUT_R"
                fill="none"
                :stroke="seg.color"
                stroke-width="14"
                :stroke-dasharray="seg.dasharray"
                :stroke-dashoffset="seg.dashoffset"
                transform="rotate(-90 60 60)"
              />
              <!-- Center total -->
              <text :x="DONUT_CX" :y="DONUT_CY + 2" text-anchor="middle"
                fill="currentColor" font-size="18" font-weight="600">{{ donutTotal }}</text>
              <text :x="DONUT_CX" :y="DONUT_CY + 13" text-anchor="middle"
                fill="currentColor" fill-opacity="0.45" font-size="8">visitas</text>
            </svg>
            <!-- Legend -->
            <ul class="flex-1 space-y-2.5 min-w-0">
              <li v-for="seg in donutSegments" :key="seg.level" class="flex items-center gap-2 text-xs">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: seg.color }"></span>
                <span class="text-muted-foreground truncate flex-1">{{ seg.label }}</span>
                <span class="font-semibold text-foreground tabular-nums">{{ seg.pct }}%</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- ── Charts - fila 2 ───────────────────────────────────────────────────── -->
    <div class="grid gap-4 md:grid-cols-2">

      <!-- Intenciones más frecuentes -->
      <Card>
        <CardHeader class="pb-1 px-5 pt-5">
          <p class="text-sm font-medium text-foreground">Intenciones más frecuentes</p>
        </CardHeader>
        <CardContent class="px-5 pb-5 pt-3">
          <div v-if="!stats.intentDist?.length"
               class="h-24 flex items-center justify-center text-sm text-muted-foreground">
            Sin datos de intenciones aún
          </div>
          <div v-else class="space-y-3.5">
            <div v-for="(d, i) in stats.intentDist" :key="d.intent" class="space-y-1">
              <div class="flex justify-between items-center text-xs">
                <span class="font-medium text-foreground">{{ INTENT_LABELS[d.intent] || d.intent }}</span>
                <span class="text-muted-foreground tabular-nums">{{ d.count }}</span>
              </div>
              <div class="h-2 rounded-full bg-muted overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500"
                     :style="{ width: `${Math.round((d.count / intentMax) * 100)}%`, background: INTENT_COLORS[i] || '#60a5fa' }">
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Actividad por robot -->
      <Card>
        <CardHeader class="pb-1 px-5 pt-5">
          <p class="text-sm font-medium text-foreground">Actividad por robot</p>
        </CardHeader>
        <CardContent class="px-5 pb-5 pt-3">
          <div v-if="!stats.robotActivity?.length"
               class="h-24 flex items-center justify-center text-sm text-muted-foreground">
            Sin robots registrados
          </div>
          <div v-else class="space-y-3.5">
            <div v-for="(d, i) in stats.robotActivity" :key="d.robot_name" class="space-y-1">
              <div class="flex justify-between items-center text-xs">
                <span class="font-medium text-foreground flex items-center gap-1.5">
                  <span class="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] flex items-center justify-center font-bold shrink-0">
                    {{ i + 1 }}
                  </span>
                  {{ d.robot_name }}
                </span>
                <span class="text-muted-foreground tabular-nums">{{ d.count }} visita{{ d.count !== 1 ? 's' : '' }}</span>
              </div>
              <div class="h-2 rounded-full bg-muted overflow-hidden">
                <div class="h-full rounded-full bg-emerald-500 transition-all duration-500"
                     :style="{ width: `${Math.round((d.count / robotMax) * 100)}%` }">
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
