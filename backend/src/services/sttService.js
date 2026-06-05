/**
 * Speech-to-Text service — 100% local, free, no external API.
 *
 * Runs OpenAI Whisper on-device (on this server) through Transformers.js
 * (`@xenova/transformers`). Inference uses onnxruntime-node, which ships
 * prebuilt binaries for Windows/macOS/Linux, so there is NO native build step.
 *
 * The model is downloaded from the HuggingFace hub on first use (~75 MB for
 * `whisper-tiny`, ~145 MB for `whisper-base`) and cached on disk afterwards,
 * so subsequent runs work fully offline.
 *
 * Audio contract: the frontend records the visitor's voice, resamples it to
 * 16 kHz mono and uploads it as a PCM-16 WAV. This keeps the backend free of
 * ffmpeg/native audio dependencies — we only parse a well-formed WAV buffer.
 */

// Multilingual model. `whisper-tiny` is the fastest; `whisper-base` is more
// accurate for Spanish at a small latency cost. Override with WHISPER_MODEL.
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-tiny';
const WHISPER_LANGUAGE = process.env.WHISPER_LANGUAGE || 'spanish';

const TARGET_SAMPLE_RATE = 16000;          // Whisper expects 16 kHz mono
const MIN_DURATION_SEC   = 0.25;            // reject accidental taps / silence
const MAX_DURATION_SEC   = 30;              // Whisper processes 30 s windows

let transcriberPromise = null;             // lazy singleton (model load is heavy)

/**
 * Lazily loads the ASR pipeline once and reuses it for every request.
 * `@xenova/transformers` is ESM-only, so we import it dynamically from CommonJS.
 */
async function getTranscriber() {
    if (!transcriberPromise) {
        transcriberPromise = (async () => {
            const { pipeline, env } = await import('@xenova/transformers');
            // We only ever run local inference — never hit a remote inference API.
            env.allowRemoteModels = true;   // allow first-time model download from the hub
            env.allowLocalModels  = true;
            console.log(`[STT] Loading local Whisper model "${WHISPER_MODEL}" (first run downloads & caches it)...`);
            const asr = await pipeline('automatic-speech-recognition', WHISPER_MODEL);
            console.log('[STT] Whisper model ready.');
            return asr;
        })().catch((err) => {
            // Reset so a later request can retry the load instead of failing forever.
            transcriberPromise = null;
            throw err;
        });
    }
    return transcriberPromise;
}

/**
 * Parses a PCM-16 WAV buffer into a normalised Float32Array (mono).
 * Scans RIFF sub-chunks rather than assuming a fixed 44-byte header so it
 * tolerates extra metadata chunks some encoders insert.
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

    // Walk the chunk list: [4-byte id][4-byte little-endian size][payload]
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
        // Chunks are word-aligned (padded to even sizes).
        offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (dataOffset === -1 || dataLength <= 0) {
        throw new Error('El archivo de audio no contiene datos PCM.');
    }
    if (bitsPerSample !== 16) {
        throw new Error('Solo se admite audio PCM de 16 bits.');
    }

    // Decode interleaved PCM-16 → mono Float32 in [-1, 1].
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

/** Linear-resamples mono audio to 16 kHz if the source rate differs. */
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
        out[i] = a + (b - a) * frac;   // linear interpolation
    }
    return out;
}

// Serialise transcriptions: Whisper inference is CPU/RAM heavy, so running many
// at once on a shared museum server would spike memory. A tiny promise chain
// keeps requests in order without an external queue dependency.
let queue = Promise.resolve();

/**
 * Transcribes a visitor audio clip to Spanish text using the local model.
 * @param {Buffer} wavBuffer  16 kHz-ish mono PCM-16 WAV uploaded by the client.
 * @returns {Promise<string>} the recognised text (may be empty for silence).
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

    // Keep the chain alive even if this run rejects, so later requests proceed.
    queue = run.catch(() => {});
    return run;
}

module.exports = {
    transcribe,
    // Exported for unit testing
    parseWav,
    resampleTo16k,
};
