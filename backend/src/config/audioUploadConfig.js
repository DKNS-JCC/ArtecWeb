const multer = require('multer');
const { filtroPorTipo } = require('./uploadFactory');

/**
 * Config de subida en memoria para clips de voz cortos (speech-to-text).
 * El audio nunca toca el disco: el buffer se entrega directamente al servicio
 * local de Whisper y se descarta tras la transcripción.
 */
const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024,   // ~8 MB sobra para un clip WAV mono de 16 kHz
        files: 1,
    },
    // Los navegadores etiquetan el WAV como audio/wav, audio/x-wav o audio/wave.
    fileFilter: filtroPorTipo({
        mimePrefix: 'audio/',
        mensajeError: 'Formato de audio no válido.',
    }),
});

module.exports = audioUpload;
