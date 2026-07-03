const multer = require('multer');
const path = require('path');
const { almacenamientoEnDisco, filtroPorTipo } = require('./uploadFactory');

// Config de subida a disco para los avatares del personal.
const storage = almacenamientoEnDisco('avatars', (req, file) => {
    // Nombre de archivo único: user_id + timestamp + extensión
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const userId = req.user ? req.user.id : 'unknown';
    return `user-${userId}-${uniqueSuffix}${ext}`;
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // límite de 5 MB
    },
    fileFilter: filtroPorTipo({
        mimePrefix: 'image/',
        mensajeError: 'Formato de archivo no válido. Sube una imagen.',
    }),
});

module.exports = upload;
