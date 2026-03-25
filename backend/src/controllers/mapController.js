const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('../database');

// Promisified DB helpers
function dbGet(sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}
function dbAll(sql, params) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
}
function dbRun(sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
    });
}

/**
 * Parses a ROS map_saver YAML file to extract resolution and origin.
 * Expected format:
 *   resolution: 0.050000
 *   origin: [-12.200000, -12.200000, 0.000000]
 */
function parseMapYaml(yamlContent) {
    const meta = { resolution: 0.05, origin_x: 0, origin_y: 0, origin_theta: 0 };

    const resMatch = yamlContent.match(/resolution:\s*([\d.]+)/);
    if (resMatch) meta.resolution = parseFloat(resMatch[1]);

    const originMatch = yamlContent.match(/origin:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/);
    if (originMatch) {
        meta.origin_x = parseFloat(originMatch[1]);
        meta.origin_y = parseFloat(originMatch[2]);
        meta.origin_theta = parseFloat(originMatch[3]);
    }

    return meta;
}

/**
 * Parses a binary (P5) PGM file buffer into width, height, and raw pixel data.
 */
function parsePgm(buffer) {
    let offset = 0;

    function skipWhitespaceAndComments() {
        while (offset < buffer.length) {
            const ch = buffer[offset];
            if (ch === 0x23) { // '#' comment
                while (offset < buffer.length && buffer[offset] !== 0x0A) offset++;
                offset++; // skip newline
            } else if (ch === 0x20 || ch === 0x09 || ch === 0x0A || ch === 0x0D) {
                offset++;
            } else {
                break;
            }
        }
    }

    function readToken() {
        skipWhitespaceAndComments();
        let token = '';
        while (offset < buffer.length) {
            const ch = buffer[offset];
            if (ch === 0x20 || ch === 0x09 || ch === 0x0A || ch === 0x0D) break;
            token += String.fromCharCode(ch);
            offset++;
        }
        return token;
    }

    const magic = readToken();
    if (magic !== 'P5') throw new Error('Only binary PGM (P5) is supported');

    const width = parseInt(readToken(), 10);
    const height = parseInt(readToken(), 10);
    const maxVal = parseInt(readToken(), 10);

    // After maxval there is exactly one whitespace byte before pixel data
    offset++;

    const bytesPerPixel = maxVal > 255 ? 2 : 1;
    const data = buffer.subarray(offset, offset + width * height * bytesPerPixel);

    // Normalize 16-bit to 8-bit if needed
    if (bytesPerPixel === 2) {
        const normalized = Buffer.alloc(width * height);
        for (let i = 0; i < width * height; i++) {
            normalized[i] = Math.round((data.readUInt16BE(i * 2) / maxVal) * 255);
        }
        return { width, height, data: normalized };
    }

    return { width, height, data };
}

/**
 * POST /api/robots/:robot_id/map
 * Upload map image + optional YAML metadata.
 * Expects multipart with fields: "image" (PNG/JPG/PGM) and optionally "yaml" (YAML).
 */
exports.uploadMap = async (req, res) => {
    const { robot_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    // Verify robot access
    const robot = await dbGet('SELECT museum_id FROM robots WHERE id = ?', [robot_id]);
    if (!robot || (!isSuperAdmin && req.user.museum_id !== robot.museum_id)) {
        return res.status(403).json({ error: 'No tienes acceso a este robot' });
    }

    const imageFile = req.files?.image?.[0];
    if (!imageFile) {
        return res.status(400).json({ error: 'Se requiere una imagen del mapa' });
    }

    try {
        // Parse YAML metadata if provided
        let meta = { resolution: 0.05, origin_x: 0, origin_y: 0, origin_theta: 0 };
        const yamlFile = req.files?.yaml?.[0];
        if (yamlFile) {
            const yamlContent = fs.readFileSync(yamlFile.path, 'utf-8');
            meta = parseMapYaml(yamlContent);
            // Remove YAML file after parsing (we store metadata in DB)
            fs.unlinkSync(yamlFile.path);
        }

        // Parse manual metadata from body (overrides YAML if provided)
        if (req.body.resolution) meta.resolution = parseFloat(req.body.resolution);
        if (req.body.origin_x) meta.origin_x = parseFloat(req.body.origin_x);
        if (req.body.origin_y) meta.origin_y = parseFloat(req.body.origin_y);

        // Convert PGM to PNG (browsers cannot display PGM) and extract dimensions
        let finalFilename = imageFile.filename;
        const ext = path.extname(imageFile.filename).toLowerCase();
        if (ext === '.pgm') {
            const pgmBuf = fs.readFileSync(imageFile.path);
            const { width: pgmW, height: pgmH, data } = parsePgm(pgmBuf);
            const pngFilename = imageFile.filename.replace(/\.pgm$/i, '.png');
            const pngPath = path.join(path.dirname(imageFile.path), pngFilename);
            await sharp(data, { raw: { width: pgmW, height: pgmH, channels: 1 } })
                .png()
                .toFile(pngPath);
            fs.unlinkSync(imageFile.path);
            finalFilename = pngFilename;
        }

        const finalPath = path.join(path.dirname(imageFile.path), finalFilename);
        const imgMeta = await sharp(finalPath).metadata();
        const width = imgMeta.width || 0;
        const height = imgMeta.height || 0;

        const imagePath = `/uploads/maps/${finalFilename}`;

        // Delete old map image if one exists
        const existing = await dbGet('SELECT image_path FROM robot_maps WHERE robot_id = ?', [robot_id]);
        if (existing) {
            const oldPath = path.join(__dirname, '../../', existing.image_path);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

            await dbRun(
                `UPDATE robot_maps SET image_path = ?, resolution = ?, origin_x = ?, origin_y = ?, origin_theta = ?, width = ?, height = ?, uploaded_at = CURRENT_TIMESTAMP WHERE robot_id = ?`,
                [imagePath, meta.resolution, meta.origin_x, meta.origin_y, meta.origin_theta, width, height, robot_id]
            );
        } else {
            const id = crypto.randomUUID();
            await dbRun(
                `INSERT INTO robot_maps (id, robot_id, image_path, resolution, origin_x, origin_y, origin_theta, width, height) VALUES (?,?,?,?,?,?,?,?,?)`,
                [id, robot_id, imagePath, meta.resolution, meta.origin_x, meta.origin_y, meta.origin_theta, width, height]
            );
        }

        const map = await dbGet('SELECT * FROM robot_maps WHERE robot_id = ?', [robot_id]);
        res.json({ message: 'Mapa subido correctamente', map });
    } catch (err) {
        console.error('[Map] Upload error:', err);
        res.status(500).json({ error: 'Error al subir el mapa' });
    }
};

/**
 * GET /api/robots/:robot_id/map
 * Returns map metadata + image URL for the robot.
 */
exports.getMap = async (req, res) => {
    const { robot_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    const robot = await dbGet('SELECT museum_id FROM robots WHERE id = ?', [robot_id]);
    if (!robot || (!isSuperAdmin && req.user.museum_id !== robot.museum_id)) {
        return res.status(403).json({ error: 'No tienes acceso a este robot' });
    }

    try {
        const map = await dbGet('SELECT * FROM robot_maps WHERE robot_id = ?', [robot_id]);
        if (!map) {
            return res.status(404).json({ error: 'No hay mapa registrado para este robot' });
        }
        res.json(map);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener el mapa' });
    }
};

/**
 * DELETE /api/robots/:robot_id/map
 */
exports.deleteMap = async (req, res) => {
    const { robot_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    const robot = await dbGet('SELECT museum_id FROM robots WHERE id = ?', [robot_id]);
    if (!robot || (!isSuperAdmin && req.user.museum_id !== robot.museum_id)) {
        return res.status(403).json({ error: 'No tienes acceso a este robot' });
    }

    try {
        const existing = await dbGet('SELECT image_path FROM robot_maps WHERE robot_id = ?', [robot_id]);
        if (existing) {
            const oldPath = path.join(__dirname, '../../', existing.image_path);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            await dbRun('DELETE FROM robot_maps WHERE robot_id = ?', [robot_id]);
        }
        res.json({ message: 'Mapa eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar el mapa' });
    }
};

// ─── PLACES / ZONES CRUD ─────────────────────────────────────

/**
 * GET /api/robots/:robot_id/places
 */
exports.getPlaces = async (req, res) => {
    const { robot_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    const robot = await dbGet('SELECT museum_id FROM robots WHERE id = ?', [robot_id]);
    if (!robot || (!isSuperAdmin && req.user.museum_id !== robot.museum_id)) {
        return res.status(403).json({ error: 'No tienes acceso a este robot' });
    }

    try {
        const places = await dbAll('SELECT * FROM robot_places WHERE robot_id = ? ORDER BY created_at DESC', [robot_id]);
        res.json(places);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener los lugares' });
    }
};

/**
 * POST /api/robots/:robot_id/places
 */
exports.createPlace = async (req, res) => {
    const { robot_id } = req.params;
    const { name, description, category, map_x, map_y } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';

    const robot = await dbGet('SELECT museum_id FROM robots WHERE id = ?', [robot_id]);
    if (!robot || (!isSuperAdmin && req.user.museum_id !== robot.museum_id)) {
        return res.status(403).json({ error: 'No tienes acceso a este robot' });
    }

    if (!name) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    try {
        const id = crypto.randomUUID();
        await dbRun(
            'INSERT INTO robot_places (id, robot_id, name, description, category, map_x, map_y) VALUES (?,?,?,?,?,?,?)',
            [id, robot_id, name, description || null, category || 'exhibit', map_x ?? null, map_y ?? null]
        );
        const place = await dbGet('SELECT * FROM robot_places WHERE id = ?', [id]);
        res.status(201).json(place);
    } catch (err) {
        res.status(500).json({ error: 'Error al crear el lugar' });
    }
};

/**
 * PUT /api/robots/:robot_id/places/:id
 */
exports.updatePlace = async (req, res) => {
    const { robot_id, id } = req.params;
    const { name, description, category, map_x, map_y } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';

    const robot = await dbGet('SELECT museum_id FROM robots WHERE id = ?', [robot_id]);
    if (!robot || (!isSuperAdmin && req.user.museum_id !== robot.museum_id)) {
        return res.status(403).json({ error: 'No tienes acceso a este robot' });
    }

    try {
        const existing = await dbGet('SELECT * FROM robot_places WHERE id = ? AND robot_id = ?', [id, robot_id]);
        if (!existing) return res.status(404).json({ error: 'Lugar no encontrado' });

        await dbRun(
            'UPDATE robot_places SET name = ?, description = ?, category = ?, map_x = ?, map_y = ? WHERE id = ?',
            [
                name ?? existing.name,
                description ?? existing.description,
                category ?? existing.category,
                map_x ?? existing.map_x,
                map_y ?? existing.map_y,
                id
            ]
        );
        const updated = await dbGet('SELECT * FROM robot_places WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar el lugar' });
    }
};

/**
 * DELETE /api/robots/:robot_id/places/:id
 */
exports.deletePlace = async (req, res) => {
    const { robot_id, id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    const robot = await dbGet('SELECT museum_id FROM robots WHERE id = ?', [robot_id]);
    if (!robot || (!isSuperAdmin && req.user.museum_id !== robot.museum_id)) {
        return res.status(403).json({ error: 'No tienes acceso a este robot' });
    }

    try {
        const existing = await dbGet('SELECT * FROM robot_places WHERE id = ? AND robot_id = ?', [id, robot_id]);
        if (!existing) return res.status(404).json({ error: 'Lugar no encontrado' });

        await dbRun('DELETE FROM robot_places WHERE id = ?', [id]);
        res.json({ message: 'Lugar eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar el lugar' });
    }
};
