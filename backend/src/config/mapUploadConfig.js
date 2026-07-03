const multer = require('multer');
const path = require('path');
const { almacenamientoEnDisco, filtroPorTipo } = require('./uploadFactory');

// Config de subida a disco para las imágenes de mapa (PNG/JPG/PGM) y su YAML.
const storage = almacenamientoEnDisco('maps', (req, file) => {
    const museumId = req.params.museum_id || 'unknown';
    const ext = path.extname(file.originalname);
    return `map-${museumId}-${Date.now()}${ext}`;
});

const mapUpload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB (los mapas pueden ser grandes)
    fileFilter: filtroPorTipo({
        allowedTypes: ['image/png', 'image/jpeg', 'image/x-portable-graymap', 'application/x-yaml', 'text/yaml'],
        allowedExts: ['.png', '.jpg', '.jpeg', '.pgm', '.yaml', '.yml'],
        mensajeError: 'Formato no válido. Sube una imagen (PNG/JPG/PGM) o un archivo YAML.',
    }),
});

module.exports = mapUpload;
