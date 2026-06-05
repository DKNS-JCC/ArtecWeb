const multer = require('multer');

/**
 * In-memory upload config for short voice clips (speech-to-text).
 * Audio never touches disk — the buffer is handed straight to the local
 * Whisper service and discarded after transcription.
 */
const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024,   // ~8 MB is plenty for a 16 kHz mono WAV clip
        files: 1,
    },
    fileFilter: (req, file, cb) => {
        // Browsers label WAV as audio/wav, audio/x-wav or audio/wave.
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Formato de audio no válido.'), false);
        }
    },
});

module.exports = audioUpload;
