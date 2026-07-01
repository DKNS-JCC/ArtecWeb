/**
 * @file Composable de *speech-to-text* del chat del visitante.
 * @module composables/useSpeechToText
 */
import { ref, onBeforeUnmount } from 'vue'
import { chatService } from '@/services/chatService'

const TARGET_RATE = 16000

/**
 * Composable *Speech-to-Text* - graba la voz del visitante y la envía al modelo
 * **Whisper local** del backend para transcribirla (sin API externa de pago).
 *
 * Para no añadir dependencias nativas de audio (ffmpeg) en el servidor, el
 * trabajo pesado se hace aquí: se captura el micrófono, se decodifica, se
 * reduce a 16 kHz mono y se codifica un WAV PCM-16 compacto que Whisper consume
 * directamente.
 *
 * Uso (*hold-to-talk*): `start()` al pulsar, `stopAndTranscribe()` al soltar,
 * que resuelve con el texto reconocido (o `''` si no se entendió nada).
 *
 * **Dependencias:** `vue`, {@link module:services/chatService},
 * `MediaRecorder` / `AudioContext` del navegador.
 *
 * **Devuelve** un objeto con:
 * - `supported` `{boolean}` - Si el navegador soporta grabación/transcripción.
 * - `isRecording` `{Ref<boolean>}` - Hay una grabación en curso.
 * - `isTranscribing` `{Ref<boolean>}` - Se está transcribiendo el audio.
 * - `error` `{Ref<string|null>}` - Último error (o `null`).
 * - `start()` `{Function}` - Comienza a grabar (`Promise<void>`).
 * - `stopAndTranscribe()` `{Function}` - Detiene y transcribe (`Promise<string>`).
 * - `cancel()` `{Function}` - Aborta la grabación sin transcribir.
 *
 * @function useSpeechToText
 * @memberof module:composables/useSpeechToText
 * @returns {Object}  API del composable: estado reactivo y controles de grabación.
 */
export function useSpeechToText() {
    const supported = typeof navigator !== 'undefined'
        && !!navigator.mediaDevices?.getUserMedia
        && typeof window.MediaRecorder !== 'undefined'

    const isRecording    = ref(false)
    const isTranscribing = ref(false)
    const error          = ref(null)

    let mediaRecorder = null
    let chunks        = []
    let stream        = null

    /** Comienza a capturar el audio del micrófono. Se resuelve cuando la grabación está activa. */
    async function start() {
        if (!supported || isRecording.value || isTranscribing.value) return
        error.value = null

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
            })
        } catch {
            error.value = 'No se pudo acceder al micrófono. Revisa los permisos.'
            return
        }

        chunks = []
        mediaRecorder = new MediaRecorder(stream)
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
        mediaRecorder.start()
        isRecording.value = true
    }

    /**
     * Detiene la grabación, transcribe el clip mediante el backend de Whisper local
     * y se resuelve con el texto reconocido. Devuelve '' si se cancela/vacío/falla.
     */
    function stopAndTranscribe() {
        return new Promise((resolve) => {
            if (!mediaRecorder || !isRecording.value) {
                cleanupStream()
                return resolve('')
            }

            mediaRecorder.onstop = async () => {
                isRecording.value = false
                cleanupStream()

                const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })
                chunks = []
                if (blob.size === 0) return resolve('')

                isTranscribing.value = true
                try {
                    const wav  = await blobToWav16k(blob)
                    const data = await chatService.transcribe(wav)
                    resolve((data.text || '').trim())
                } catch (err) {
                    error.value = err.message || 'No se pudo transcribir el audio.'
                    resolve('')
                } finally {
                    isTranscribing.value = false
                }
            }

            mediaRecorder.stop()
        })
    }

    /** Aborta la grabación actual sin transcribir. */
    function cancel() {
        if (mediaRecorder && isRecording.value) {
            mediaRecorder.onstop = () => cleanupStream()
            mediaRecorder.stop()
        } else {
            cleanupStream()
        }
        chunks = []
        isRecording.value = false
    }

    function cleanupStream() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop())
            stream = null
        }
        mediaRecorder = null
    }

    onBeforeUnmount(cancel)

    return {
        supported,
        isRecording,
        isTranscribing,
        error,
        start,
        stopAndTranscribe,
        cancel,
    }
}


/**
 * Decodifica un Blob de audio grabado (webm/opus, mp4/aac…), lo reduce a
 * 16 kHz mono y codifica un Blob WAV PCM-16 - el formato que parsea el backend.
 */
async function blobToWav16k(blob) {
    const arrayBuffer = await blob.arrayBuffer()

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const decodeCtx = new AudioCtx()
    let decoded
    try {
        decoded = await decodeCtx.decodeAudioData(arrayBuffer)
    } finally {
        decodeCtx.close()
    }

    // Renderiza a un buffer mono de 16 kHz mediante un grafo offline (gestiona el remuestreo).
    const frameCount = Math.ceil(decoded.duration * TARGET_RATE)
    const offline = new OfflineAudioContext(1, frameCount, TARGET_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()

    return encodeWav(rendered.getChannelData(0), TARGET_RATE)
}

/** Codifica un array de muestras Float32 mono como un Blob WAV PCM de 16 bits. */
function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)            // tamaño del chunk PCM
    view.setUint16(20, 1, true)             // formato de audio = PCM
    view.setUint16(22, 1, true)             // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true) // tasa de bytes
    view.setUint16(32, 2, true)             // alineación de bloque
    view.setUint16(34, 16, true)            // bits por muestra
    writeString(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    let offset = 44
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
        offset += 2
    }

    return new Blob([view], { type: 'audio/wav' })
}
