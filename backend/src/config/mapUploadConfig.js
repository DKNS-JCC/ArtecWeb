const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads/maps');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const museumId = req.params.museum_id || 'unknown';
        const ext = path.extname(file.originalname);
        cb(null, `map-${museumId}-${Date.now()}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/x-portable-graymap', 'application/x-yaml', 'text/yaml'];
    const allowedExts = ['.png', '.jpg', '.jpeg', '.pgm', '.yaml', '.yml'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Formato no válido. Sube una imagen (PNG/JPG/PGM) o un archivo YAML.'), false);
    }
};

const mapUpload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB (maps can be large)
    fileFilter
});

module.exports = mapUpload;
