/**
 * Servicio de reconocimiento de voz (Speech-to-Text) - 100% local, gratuito y sin API externa.
 *
 * Ejecuta OpenAI Whisper en el propio dispositivo (este servidor) mediante Transformers.js
 * (`@xenova/transformers`). La inferencia usa onnxruntime-node, que incluye binarios
 * precompilados para Windows/macOS/Linux, así que NO hay paso de compilación nativa.
 *
 * El modelo se descarga del hub de HuggingFace en el primer uso (~75 MB para
 * `whisper-tiny`, ~145 MB para `whisper-base`) y luego se cachea en disco, de modo
 * que las siguientes ejecuciones funcionan totalmente offline.
 *
 * Contrato de audio: el frontend graba la voz del visitante, la remuestrea a
 * 16 kHz mono y la sube como WAV PCM-16. Esto mantiene el backend libre de
 * dependencias de ffmpeg/audio nativo: solo decodificamos un buffer WAV bien formado.
 */

const wav = require('node-wav');

// Modelo multilingüe. `whisper-tiny` es el más rápido; `whisper-base` es más
// preciso en español a costa de algo de latencia. Se sobreescribe con WHISPER_MODEL.
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-tiny';
const WHISPER_LANGUAGE = process.env.WHISPER_LANGUAGE || 'spanish';

const TARGET_SAMPLE_RATE = 16000;          // Whisper espera 16 kHz mono
const MIN_DURATION_SEC   = 0.25;            // descarta toques accidentales / silencio
const MAX_DURATION_SEC   = 30;              // Whisper procesa ventanas de 30 s

let transcriberPromise = null;             // singleton perezoso (cargar el modelo es costoso)

/**
 * Carga la pipeline de ASR una sola vez (de forma perezosa) y la reutiliza en cada petición.
 * `@xenova/transformers` es solo ESM, así que la importamos dinámicamente desde CommonJS.
 */
async function getTranscriber() {
    if (!transcriberPromise) {
        transcriberPromise = (async () => {
            const { pipeline, env } = await import('@xenova/transformers');
            // La inferencia siempre es local; solo se permite descargar el modelo del hub la primera vez y después funciona offline.
            env.allowRemoteModels = true;   // permite la descarga inicial del modelo desde el hub
            env.allowLocalModels  = true;
            console.log(`[STT] Loading local Whisper model "${WHISPER_MODEL}" (first run downloads & caches it)...`);
            const asr = await pipeline('automatic-speech-recognition', WHISPER_MODEL);
            console.log('[STT] Whisper model ready.');
            return asr;
        })().catch((err) => {
            // Se resetea para que una petición posterior pueda reintentar la carga en vez de fallar para siempre.
            transcriberPromise = null;
            throw err;
        });
    }
    return transcriberPromise;
}

/**
 * Decodifica un buffer WAV a un Float32Array normalizado (mono) usando `node-wav`.
 * La librería tolera cabeceras con chunks de metadatos extra y distintas
 * profundidades de bits; aquí solo mezclamos los canales a mono.
 *
 * @returns {{ samples: Float32Array, sampleRate: number }}
 */
function parseWav(buffer) {
    if (!buffer || buffer.length < 44) {
        throw new Error('Audio inválido o demasiado corto.');
    }

    let decoded;
    try {
        decoded = wav.decode(buffer);   // { sampleRate, channelData: [Float32Array, ...] } normalizado a [-1, 1]
    } catch {
        throw new Error('Formato de audio no soportado (se esperaba WAV).');
    }

    const channels = decoded.channelData;
    if (!channels || channels.length === 0 || !channels[0].length) {
        throw new Error('El archivo de audio no contiene datos PCM.');
    }

    // Mezcla los canales a mono promediándolos (para mono es una copia directa).
    const frames = channels[0].length;
    const mono   = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
        let acc = 0;
        for (let c = 0; c < channels.length; c++) acc += channels[c][i];
        mono[i] = acc / channels.length;
    }

    return { samples: mono, sampleRate: decoded.sampleRate };
}

/** Remuestrea linealmente el audio mono a 16 kHz si la frecuencia de origen difiere. */
function resampleTo16k(samples, sampleRate) {
    if (sampleRate === TARGET_SAMPLE_RATE) return samples;

    const ratio    = sampleRate / TARGET_SAMPLE_RATE;
    const outLength = Math.round(samples.length / ratio);
    const out      = new Float32Array(outLength);

    for (let i = 0; i < outLength; i++) {
        const srcPos = i * ratio;
        const idx    = Math.floor(srcPos);
        const frac   = srcPos - idx;
        const a      = samples[idx] || 0;
        const b      = samples[idx + 1] !== undefined ? samples[idx + 1] : a;
        out[i] = a + (b - a) * frac;   // interpolación lineal
    }
    return out;
}

// Serializa las transcripciones: la inferencia de Whisper consume mucha CPU/RAM, así que
// ejecutar muchas a la vez en un servidor de museo compartido dispararía la memoria. Una
// pequeña cadena de promesas mantiene el orden de las peticiones sin depender de una cola externa.
let queue = Promise.resolve();

/**
 * Transcribe un clip de audio del visitante a texto en español usando el modelo local.
 * @param {Buffer} wavBuffer  WAV PCM-16 mono (~16 kHz) subido por el cliente.
 * @returns {Promise<string>} el texto reconocido (puede estar vacío si hay silencio).
 */
async function transcribe(wavBuffer) {
    const { samples, sampleRate } = parseWav(wavBuffer);

    const durationSec = samples.length / sampleRate;
    if (durationSec < MIN_DURATION_SEC) {
        throw new Error('La grabación es demasiado corta. Mantén pulsado el micrófono mientras hablas.');
    }

    let audio = resampleTo16k(samples, sampleRate);
    if (audio.length / TARGET_SAMPLE_RATE > MAX_DURATION_SEC) {
        audio = audio.subarray(0, MAX_DURATION_SEC * TARGET_SAMPLE_RATE);
    }

    const run = queue.then(async () => {
        const transcriber = await getTranscriber();
        const result = await transcriber(audio, {
            language: WHISPER_LANGUAGE,
            task: 'transcribe',
            chunk_length_s: 30,
        });
        return (result?.text || '').trim();
    });

    // Mantiene viva la cadena aunque esta ejecución se rechace, para que las siguientes peticiones continúen.
    queue = run.catch(() => {});
    return run;
}

module.exports = {
    transcribe,
    // Exportado para pruebas unitarias
    parseWav,
    resampleTo16k,
};
