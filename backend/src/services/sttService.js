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
 * dependencias de ffmpeg/audio nativo: solo parseamos un buffer WAV bien formado.
 */

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
 * Parsea un buffer WAV PCM-16 a un Float32Array normalizado (mono).
 * Recorre los sub-chunks RIFF en lugar de asumir una cabecera fija de 44 bytes, de
 * forma que tolera chunks de metadatos extra que algunos codificadores insertan.
 *
 * @returns {{ samples: Float32Array, sampleRate: number }}
 */
function parseWav(buffer) {
    if (!buffer || buffer.length < 44) {
        throw new Error('Audio inválido o demasiado corto.');
    }
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('Formato de audio no soportado (se esperaba WAV).');
    }

    let sampleRate    = TARGET_SAMPLE_RATE;
    let numChannels   = 1;
    let bitsPerSample = 16;
    let dataOffset    = -1;
    let dataLength    = 0;

    // Recorre la lista de chunks: [id de 4 bytes][tamaño little-endian de 4 bytes][payload]
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const chunkId   = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);

        if (chunkId === 'fmt ') {
            numChannels   = buffer.readUInt16LE(offset + 10);
            sampleRate    = buffer.readUInt32LE(offset + 12);
            bitsPerSample = buffer.readUInt16LE(offset + 22);
        } else if (chunkId === 'data') {
            dataOffset = offset + 8;
            dataLength = Math.min(chunkSize, buffer.length - dataOffset);
            break;
        }
        // Los chunks están alineados a palabra (con relleno a tamaños pares).
        offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (dataOffset === -1 || dataLength <= 0) {
        throw new Error('El archivo de audio no contiene datos PCM.');
    }
    if (bitsPerSample !== 16) {
        throw new Error('Solo se admite audio PCM de 16 bits.');
    }

    // Decodifica PCM-16 intercalado → Float32 mono en [-1, 1].
    const totalSamples = Math.floor(dataLength / 2);
    const frames       = Math.floor(totalSamples / numChannels);
    const mono         = new Float32Array(frames);

    for (let i = 0; i < frames; i++) {
        let acc = 0;
        for (let c = 0; c < numChannels; c++) {
            acc += buffer.readInt16LE(dataOffset + (i * numChannels + c) * 2);
        }
        mono[i] = (acc / numChannels) / 32768;
    }

    return { samples: mono, sampleRate };
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
