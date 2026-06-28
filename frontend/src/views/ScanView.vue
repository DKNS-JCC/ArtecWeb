<script setup>
/**
 * @module views/ScanView
 * @description
 * Pantalla a la que se llega al **escanear el QR** de un robot (`/r/:id`).
 * Comprueba la disponibilidad del robot, pide el nombre y el nivel de
 * conocimiento del visitante y crea su sesión efímera, redirigiéndolo al chat.
 *
 * **Props:** ninguna. · **Eventos:** ninguno.
 *
 * **Dependencias:** `vue-router`, {@link module:stores/auth},
 * {@link module:services/authService}, componentes de UI.
 */
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'

const route     = useRoute()
const router    = useRouter()
const authStore = useAuthStore()

const error          = ref('')
const loading        = ref(false)
const checking       = ref(true)   // verifying robot availability on entry
const robotId        = ref('')
const visitorName    = ref('')
const expertiseLevel = ref('general')
const showNamePrompt = ref(false)

const LANGUAGES = [
    { id: 'es', name: 'Español', flag: '🇪🇸' },
    { id: 'en', name: 'English', flag: '🇬🇧' },
    { id: 'fr', name: 'Français', flag: '🇫🇷' },
    { id: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { id: 'it', name: 'Italiano', flag: '🇮🇹' }
]

const TRANSLATIONS = {
    es: {
        checking_robot: 'Comprobando el robot…',
        access_unavailable: 'Acceso no disponible',
        try_again: 'Inténtalo de nuevo',
        back_home: 'Volver al inicio',
        greeting: 'Hola!',
        greeting_question: 'Cuentanos un poco sobre ti',
        your_name: 'Tu nombre',
        name_placeholder: 'Ej. María',
        expertise_question: '¿Cuánto sabes sobre arte?',
        start_visit: 'Empezar la visita',
        establishing_connection: 'Estableciendo conexión…',
        enter_name: 'Por favor, ingresa tu nombre',
        error_generic: 'Error al conectar con el robot',
        levels: {
            nino: { label: 'Niño / Joven', desc: 'Explicaciones sencillas y accesibles' },
            general: { label: 'Público general', desc: 'Lenguaje claro, sin tecnicismos' },
            estudiante: { label: 'Estudiante / Aficionado', desc: 'Contexto técnico e histórico' },
            experto: { label: 'Experto / Licenciado', desc: 'Terminología especializada, análisis profundo' }
        }
    },
    en: {
        checking_robot: 'Checking robot…',
        access_unavailable: 'Access not available',
        try_again: 'Try again',
        back_home: 'Back to home',
        greeting: 'Hello!',
        greeting_question: 'Tell us a bit about yourself',
        your_name: 'Your name',
        name_placeholder: 'E.g. John',
        expertise_question: 'How much do you know about art?',
        start_visit: 'Start your visit',
        establishing_connection: 'Establishing connection…',
        enter_name: 'Please enter your name',
        error_generic: 'Error connecting to the robot',
        levels: {
            nino: { label: 'Child / Young', desc: 'Simple, accessible explanations' },
            general: { label: 'General audience', desc: 'Clear language, no jargon' },
            estudiante: { label: 'Student / Enthusiast', desc: 'Technical and historical context' },
            experto: { label: 'Expert / Graduate', desc: 'Specialized terminology, deep analysis' }
        }
    },
    fr: {
        checking_robot: 'Vérification du robot…',
        access_unavailable: 'Accès non disponible',
        try_again: 'Réessayez',
        back_home: '← Retour à l\'accueil',
        greeting: 'Bonjour !',
        greeting_question: 'Parlez-nous un peu de vous',
        your_name: 'Ton nom',
        name_placeholder: 'Ex. Marie',
        expertise_question: 'Combien en sais-tu sur l\'art ?',
        start_visit: 'Commencer la visite',
        establishing_connection: 'Établissement de la connexion…',
        enter_name: 'Veuillez entrer votre nom',
        error_generic: 'Erreur lors de la connexion au robot',
        levels: {
            nino: { label: 'Enfant / Jeune', desc: 'Explications simples et accessibles' },
            general: { label: 'Grand public', desc: 'Langage clair, sans jargon' },
            estudiante: { label: 'Étudiant / Amateur', desc: 'Contexte technique et historique' },
            experto: { label: 'Expert / Diplômé', desc: 'Terminologie spécialisée, analyse approfondie' }
        }
    },
    de: {
        checking_robot: 'Roboter wird überprüft…',
        access_unavailable: 'Zugriff nicht verfügbar',
        try_again: 'Versuchen Sie es erneut',
        back_home: 'Zurück zur Startseite',
        greeting: 'Hallo!',
        greeting_question: 'Erzähl uns ein wenig über dich!',
        your_name: 'Dein Name',
        name_placeholder: 'Z.B. Klaus',
        expertise_question: 'Wie viel weißt du über Kunst?',
        start_visit: 'Besuch starten',
        establishing_connection: 'Verbindung wird aufgebaut…',
        enter_name: 'Bitte geben Sie Ihren Namen ein',
        error_generic: 'Fehler beim Verbinden mit dem Roboter',
        levels: {
            nino: { label: 'Kind / Jugendlich', desc: 'Einfache, verständliche Erklärungen' },
            general: { label: 'Allgemeine Öffentlichkeit', desc: 'Klare Sprache, keine Fachbegriffe' },
            estudiante: { label: 'Student / Enthusiast', desc: 'Technischer und historischer Kontext' },
            experto: { label: 'Experte / Absolvent', desc: 'Fachterminologie, tiefgreifende Analyse' }
        }
    },
    it: {
        checking_robot: 'Controllo del robot…',
        access_unavailable: 'Accesso non disponibile',
        try_again: 'Riprova',
        back_home: 'Torna alla home',
        greeting: 'Ciao!',
        greeting_question: 'Parlaci un po\' di te!',
        your_name: 'Il tuo nome',
        name_placeholder: 'Es. Mario',
        expertise_question: 'Quanto sai dell\'arte?',
        start_visit: 'Inizia la visita',
        establishing_connection: 'Connessione in corso…',
        enter_name: 'Per favore, inserisci il tuo nome',
        error_generic: 'Errore di connessione al robot',
        levels: {
            nino: { label: 'Bambino / Giovane', desc: 'Spiegazioni semplici e accessibili' },
            general: { label: 'Pubblico generale', desc: 'Linguaggio chiaro, senza gergo' },
            estudiante: { label: 'Studente / Appassionato', desc: 'Contesto tecnico e storico' },
            experto: { label: 'Esperto / Laureato', desc: 'Terminologia specializzata, analisi approfondita' }
        }
    }
}

const t = computed(() => TRANSLATIONS[authStore.language] || TRANSLATIONS.es)

const LEVELS = computed(() => [
    { id: 'nino', ...t.value.levels.nino },
    { id: 'general', ...t.value.levels.general },
    { id: 'estudiante', ...t.value.levels.estudiante },
    { id: 'experto', ...t.value.levels.experto }
])

// Description of the currently selected level, shown under the combo box.
const selectedLevel = computed(() => LEVELS.value.find(l => l.id === expertiseLevel.value))

onMounted(async () => {
    robotId.value = route.params.id
    if (!robotId.value) {
        error.value    = 'Código QR no válido'
        checking.value = false
        return
    }
    try {
        const status = await authService.checkRobotAvailability(robotId.value)
        if (status.occupied) {
            error.value = 'Este robot ya está siendo utilizado por otro visitante. Por favor, espera a que termine su visita.'
        } else if (!status.online) {
            error.value = 'El robot no está disponible en este momento. Puede estar apagado o sin conexión. Inténtalo de nuevo en unos minutos.'
        } else {
            showNamePrompt.value = true
        }
    } catch (err) {
        error.value = err.message || 'No se pudo verificar el robot. Inténtalo de nuevo.'
    } finally {
        checking.value = false
    }
})

const startChat = async () => {
    if (!visitorName.value.trim()) {
        alert(t.value.enter_name)
        return
    }

    showNamePrompt.value = false
    loading.value        = true
    error.value          = ''

    try {
        await authStore.createVisitor(robotId.value, visitorName.value.trim(), expertiseLevel.value)
        router.push('/chat')
    } catch (err) {
        error.value          = err.response?.data?.error || err.message || t.value.error_generic
        loading.value        = false
        showNamePrompt.value = true
    }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background px-6 py-12">
    <div class="w-full max-w-[26rem]">

      <!-- Language selector (always visible) -->
      <div class="flex justify-center gap-2 mb-8">
        <button v-for="lang in LANGUAGES" :key="lang.id" @click="authStore.setLanguage(lang.id)"
          type="button" class="flex items-center gap-1 px-3 py-2 text-sm rounded-sm transition-all border"
          :class="authStore.language === lang.id 
            ? 'border-primary bg-primary/10 text-primary' 
            : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'"
          :title="lang.name">
          <span>{{ lang.flag }}</span>
          <span class="hidden sm:inline">{{ lang.id.toUpperCase() }}</span>
        </button>
      </div>

      <!-- Checking robot availability -->
      <div v-if="checking" class="flex flex-col items-center gap-4 text-center reveal">
        <div class="h-9 w-9 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
        <p class="text-muted-foreground text-[0.95rem]">{{ t.checking_robot }}</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="reveal" style="animation-delay: 40ms">
        <header class="mb-8">
          <p class="eyebrow text-destructive mb-3">{{ t.access_unavailable }}</p>
          <h1 class="font-display text-4xl font-medium tracking-tight leading-[0.95]">{{ t.try_again }}</h1>
        </header>
        <Alert variant="destructive">{{ error }}</Alert>
        <p class="mt-6 text-sm text-muted-foreground">
          <router-link to="/" class="text-foreground underline decoration-border decoration-1 underline-offset-4 hover:decoration-primary transition-colors">{{ t.back_home }}</router-link>
        </p>
      </div>

      <!-- Form -->
      <div v-else-if="showNamePrompt">
        <header class="reveal" style="animation-delay: 40ms">
          <h1 class="font-display text-5xl font-medium tracking-tight leading-[0.95] mb-3">{{ t.greeting }}</h1>
          <p class="text-muted-foreground text-[0.95rem] leading-relaxed">{{ t.greeting_question }}</p>
        </header>

        <hr class="hairline my-8 reveal" style="animation-delay: 120ms" />

        <div class="space-y-7 reveal" style="animation-delay: 200ms">
          <div>
            <Label for="visitor-name">{{ t.your_name }}</Label>
            <Input id="visitor-name" v-model="visitorName" type="text" :placeholder="t.name_placeholder"
              autofocus @keyup.enter="startChat" />
          </div>

          <div>
            <Label for="expertise-level">{{ t.expertise_question }}</Label>
            <div class="relative">
              <select id="expertise-level" v-model="expertiseLevel"
                class="flex h-11 w-full appearance-none rounded-sm border border-input bg-background pl-4 pr-10 py-3 text-sm text-foreground transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer">
                <option v-for="lvl in LEVELS" :key="lvl.id" :value="lvl.id">{{ lvl.label }}</option>
              </select>
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">&#9662;</span>
            </div>
            <p v-if="selectedLevel" class="text-xs text-muted-foreground mt-2">{{ selectedLevel.desc }}</p>
          </div>

          <Button @click="startChat" size="lg" class="w-full group">
            {{ t.start_visit }}
            <span class="transition-transform group-hover:translate-x-1">&rarr;</span>
          </Button>
        </div>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="flex flex-col items-center gap-4 text-center reveal">
        <div class="h-9 w-9 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
        <p class="text-muted-foreground text-[0.95rem]">{{ t.establishing_connection }}</p>
      </div>

    </div>
  </div>
</template>
