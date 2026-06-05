import { ref, onBeforeUnmount } from 'vue'
import { chatService } from '@/services/chatService'

/**
 * Speech-to-Text composable — records the visitor's voice and sends it to the
 * backend's LOCAL Whisper model for transcription (no external/paid API).
 *
 * To keep the server free of native audio dependencies (ffmpeg), the heavy
 * lifting happens here: we capture the mic, decode it, downsample to 16 kHz
 * mono and encode a compact PCM-16 WAV that Whisper consumes directly.
 *
 * Usage: hold-to-talk → `start()` on press, `stopAndTranscribe()` on release,
 * which resolves with the recognised text (or '' if nothing was understood).
 */

const TARGET_RATE = 16000

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

    /** Begins capturing microphone audio. Resolves once recording is live. */
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
     * Stops recording, transcribes the clip via the local Whisper backend and
     * resolves with the recognised text. Returns '' on cancel/empty/failure.
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

    /** Aborts the current recording without transcribing. */
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

// ── Audio conversion helpers ───────────────────────────────────────────────────

/**
 * Decodes a recorded audio Blob (webm/opus, mp4/aac…), downsamples it to
 * 16 kHz mono and encodes a PCM-16 WAV Blob — the format the backend parses.
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

    // Render to a 16 kHz mono buffer via an offline graph (handles resampling).
    const frameCount = Math.ceil(decoded.duration * TARGET_RATE)
    const offline = new OfflineAudioContext(1, frameCount, TARGET_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()

    return encodeWav(rendered.getChannelData(0), TARGET_RATE)
}

/** Encodes a mono Float32 sample array as a 16-bit PCM WAV Blob. */
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
    view.setUint32(16, 16, true)            // PCM chunk size
    view.setUint16(20, 1, true)             // audio format = PCM
    view.setUint16(22, 1, true)             // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true)             // block align
    view.setUint16(34, 16, true)            // bits per sample
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
