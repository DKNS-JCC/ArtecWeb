import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue'

/**
 * Text-to-Speech composable — 100% local & free.
 *
 * Uses the browser's built-in `SpeechSynthesis` API, which renders speech with
 * the on-device OS voices (no network, no API key, no cost). It powers the
 * robot guide "speaking" its replies in the visitor's phone.
 *
 * Exposes both behaviours requested for the chat:
 *  - `autoSpeak` global toggle (persisted) → auto-read every robot reply.
 *  - `speak()` → replay any single message on demand (per-bubble button).
 */

const AUTO_SPEAK_KEY = 'artec_chat_autospeak'

export function useTextToSpeech() {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
    const supported = !!synth && typeof window.SpeechSynthesisUtterance !== 'undefined'

    const isSpeaking = ref(false)
    const speakingId = ref(null)               // id of the message currently being spoken
    const autoSpeak  = ref(loadAutoSpeakPref())
    const spanishVoice = shallowRef(null)

    function loadAutoSpeakPref() {
        try {
            const saved = localStorage.getItem(AUTO_SPEAK_KEY)
            return saved === null ? true : saved === '1'   // on by default (immersive guide)
        } catch {
            return true
        }
    }

    function toggleAutoSpeak() {
        autoSpeak.value = !autoSpeak.value
        try { localStorage.setItem(AUTO_SPEAK_KEY, autoSpeak.value ? '1' : '0') } catch { /* ignore */ }
        if (!autoSpeak.value) cancel()
    }

    /** Picks the most natural Spanish voice available on the device. */
    function pickVoice() {
        if (!synth) return
        const voices = synth.getVoices()
        if (!voices.length) return

        const spanish = voices.filter(v => /^es(-|_|$)/i.test(v.lang))
        // Prefer es-ES, then any Spanish; favour local (offline) voices, then
        // higher-quality "natural/neural/enhanced/premium" voices when present.
        const score = (v) => {
            let s = 0
            if (/^es-ES/i.test(v.lang)) s += 4
            if (v.localService) s += 2
            if (/natural|neural|enhanced|premium|google|microsoft/i.test(v.name)) s += 1
            return s
        }
        spanishVoice.value = spanish.sort((a, b) => score(b) - score(a))[0] || voices[0]
    }

    /**
     * Speaks the given text aloud. Cancels any in-progress utterance first so
     * a new reply never overlaps the previous one.
     * @param {string} text
     * @param {string|number} [id]  message id, to drive per-bubble UI state.
     */
    function speak(text, id = null) {
        if (!supported || !text) return
        cancel()

        if (!spanishVoice.value) pickVoice()

        const utter = new SpeechSynthesisUtterance(String(text))
        utter.lang  = spanishVoice.value?.lang || 'es-ES'
        if (spanishVoice.value) utter.voice = spanishVoice.value
        utter.rate  = 1.0
        utter.pitch = 1.0

        utter.onstart = () => { isSpeaking.value = true;  speakingId.value = id }
        utter.onend   = () => { isSpeaking.value = false; speakingId.value = null }
        utter.onerror = () => { isSpeaking.value = false; speakingId.value = null }

        synth.speak(utter)
    }

    /** Speaks only when the global auto-read toggle is on (used for new replies). */
    function speakIfAuto(text, id = null) {
        if (autoSpeak.value) speak(text, id)
    }

    function cancel() {
        if (!supported) return
        synth.cancel()
        isSpeaking.value = false
        speakingId.value = null
    }

    onMounted(() => {
        if (!supported) return
        pickVoice()
        // Voices load asynchronously in most browsers (and lazily on iOS).
        synth.addEventListener?.('voiceschanged', pickVoice)
    })

    onBeforeUnmount(() => {
        if (!supported) return
        synth.removeEventListener?.('voiceschanged', pickVoice)
        cancel()
    })

    return {
        supported,
        isSpeaking,
        speakingId,
        autoSpeak,
        toggleAutoSpeak,
        speak,
        speakIfAuto,
        cancel,
    }
}
