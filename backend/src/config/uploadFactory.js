const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Fábrica compartida para las configuraciones de subida (multer).
 * Unifica el patrón de almacenamiento en disco y el filtro por tipo de archivo,
 * de modo que cada config concreta (avatar, mapa, audio) solo declare sus
 * diferencias (subcarpeta, nombre del archivo, formatos y tamaño permitidos).
 */

/**
 * Crea un almacenamiento en disco de multer, asegurando que el directorio existe.
 * @param {string} subdir Subcarpeta dentro de `uploads/` (p. ej. `'avatars'`)
 * @param {(req, file) => string} nombrarArchivo Genera el nombre final del archivo
 * @returns {import('multer').StorageEngine}
 */
function almacenamientoEnDisco(subdir, nombrarArchivo) {
    const uploadDir = path.join(__dirname, '../../uploads', subdir);
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    return multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, nombrarArchivo(req, file)),
    });
}

/**
 * Crea un filtro de multer que acepta el archivo si coincide con alguno de los
 * criterios indicados: prefijo de mimetype, lista de mimetypes o lista de
 * extensiones. Si no coincide con ninguno, rechaza con `mensajeError`.
 * @param {object} opciones
 * @param {string} [opciones.mimePrefix] Prefijo de mimetype (p. ej. `'image/'`)
 * @param {string[]} [opciones.allowedTypes] Mimetypes exactos permitidos
 * @param {string[]} [opciones.allowedExts] Extensiones permitidas (en minúsculas, con punto)
 * @param {string} opciones.mensajeError Mensaje del error cuando el archivo no es válido
 * @returns {(req, file, cb) => void}
 */
function filtroPorTipo({ mimePrefix, allowedTypes, allowedExts, mensajeError }) {
    return (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const okPrefix = mimePrefix && file.mimetype.startsWith(mimePrefix);
        const okType = allowedTypes && allowedTypes.includes(file.mimetype);
        const okExt = allowedExts && allowedExts.includes(ext);

        if (okPrefix || okType || okExt) {
            cb(null, true);
        } else {
            cb(new Error(mensajeError), false);
        }
    };
}

module.exports = { almacenamientoEnDisco, filtroPorTipo };
