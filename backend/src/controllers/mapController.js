const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('../database');
const zoneCache = require('../utils/zoneCache');
const { BASE_CATEGORY } = require('../utils/geo');

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
            if (ch === 0x23) {
                while (offset < buffer.length && buffer[offset] !== 0x0A) offset++;
                offset++;
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
    offset++;

    const bytesPerPixel = maxVal > 255 ? 2 : 1;
    const data = buffer.subarray(offset, offset + width * height * bytesPerPixel);

    if (bytesPerPixel === 2) {
        const normalized = Buffer.alloc(width * height);
        for (let i = 0; i < width * height; i++) {
            normalized[i] = Math.round((data.readUInt16BE(i * 2) / maxVal) * 255);
        }
        return { width, height, data: normalized };
    }

    return { width, height, data };
}

// ─── MAP CRUD ─────────────────────────────────────────────────

/**
 * POST /api/museums/:museum_id/maps
 * Upload a new map for a museum. Requires 'name' in body.
 */
exports.uploadMap = async (req, res) => {
    const { museum_id } = req.params;
    const { name } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';

    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
    }

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'El nombre del mapa es obligatorio' });
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
            fs.unlinkSync(yamlFile.path);
        }

        if (req.body.resolution) meta.resolution = parseFloat(req.body.resolution);
        if (req.body.origin_x) meta.origin_x = parseFloat(req.body.origin_x);
        if (req.body.origin_y) meta.origin_y = parseFloat(req.body.origin_y);

        // Convert PGM to PNG if needed
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

        const id = crypto.randomUUID();
        await dbRun(
            `INSERT INTO maps (id, museum_id, name, image_path, resolution, origin_x, origin_y, origin_theta, width, height) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [id, museum_id, name.trim(), imagePath, meta.resolution, meta.origin_x, meta.origin_y, meta.origin_theta, width, height]
        );

        const map = await dbGet('SELECT * FROM maps WHERE id = ?', [id]);
        res.status(201).json({ message: 'Mapa subido correctamente', map });
    } catch (err) {
        console.error('[Map] Upload error:', err);
        res.status(500).json({ error: 'Error al subir el mapa' });
    }
};

/**
 * GET /api/museums/:museum_id/maps
 * List all maps for a museum.
 */
exports.listMaps = async (req, res) => {
    const { museum_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
    }

    try {
        const maps = await dbAll(
            'SELECT * FROM maps WHERE museum_id = ? ORDER BY uploaded_at DESC',
            [museum_id]
        );
        res.json(maps);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener los mapas' });
    }
};

/**
 * GET /api/maps/:map_id
 * Get a specific map by ID.
 */
exports.getMap = async (req, res) => {
    const { map_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    try {
        const map = await dbGet('SELECT * FROM maps WHERE id = ?', [map_id]);
        if (!map) return res.status(404).json({ error: 'Mapa no encontrado' });
        if (!isSuperAdmin && req.user.museum_id !== map.museum_id) {
            return res.status(403).json({ error: 'No tienes acceso a este mapa' });
        }
        res.json(map);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener el mapa' });
    }
};

/**
 * DELETE /api/maps/:map_id
 * Delete a map, unassign it from robots, and remove its zones.
 */
exports.deleteMap = async (req, res) => {
    const { map_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    try {
        const map = await dbGet('SELECT * FROM maps WHERE id = ?', [map_id]);
        if (!map) return res.status(404).json({ error: 'Mapa no encontrado' });
        if (!isSuperAdmin && req.user.museum_id !== map.museum_id) {
            return res.status(403).json({ error: 'No tienes acceso a este mapa' });
        }

        // Unassign from any robots using this map
        await dbRun('UPDATE robots SET map_id = NULL WHERE map_id = ?', [map_id]);

        // Delete image file
        const filePath = path.join(__dirname, '../../', map.image_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        // Delete zones (FK constraint)
        await dbRun('DELETE FROM zones WHERE map_id = ?', [map_id]);
        await dbRun('DELETE FROM maps WHERE id = ?', [map_id]);
        zoneCache.invalidate(map_id);

        res.json({ message: 'Mapa eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar el mapa' });
    }
};

// ─── ZONES CRUD ───────────────────────────────────────────────

/**
 * GET /api/maps/:map_id/zones
 */
exports.getZones = async (req, res) => {
    const { map_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    try {
        const map = await dbGet('SELECT museum_id FROM maps WHERE id = ?', [map_id]);
        if (!map) return res.status(404).json({ error: 'Mapa no encontrado' });
        if (!isSuperAdmin && req.user.museum_id !== map.museum_id) {
            return res.status(403).json({ error: 'No tienes acceso' });
        }
        const zones = await dbAll('SELECT * FROM zones WHERE map_id = ? ORDER BY created_at DESC', [map_id]);
        res.json(zones);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener las zonas' });
    }
};

/**
 * POST /api/maps/:map_id/zones
 */
exports.createZone = async (req, res) => {
    const { map_id } = req.params;
    const { name, description, category, map_x, map_y } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';

    try {
        const map = await dbGet('SELECT museum_id FROM maps WHERE id = ?', [map_id]);
        if (!map) return res.status(404).json({ error: 'Mapa no encontrado' });
        if (!isSuperAdmin && req.user.museum_id !== map.museum_id) {
            return res.status(403).json({ error: 'No tienes acceso' });
        }

        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });

        // A base point requires coordinates (it's a navigation target).
        if (category === BASE_CATEGORY && (map_x == null || map_y == null)) {
            return res.status(400).json({ error: 'El punto base necesita una posición en el mapa.' });
        }

        const id = crypto.randomUUID();
        try {
            await dbRun(
                'INSERT INTO zones (id, map_id, name, description, category, map_x, map_y) VALUES (?,?,?,?,?,?,?)',
                [id, map_id, name, description || null, category || 'exhibit', map_x ?? null, map_y ?? null]
            );
        } catch (e) {
            // Partial unique index → only one base per map.
            if (category === BASE_CATEGORY && /UNIQUE/i.test(e.message)) {
                return res.status(409).json({ error: 'Este mapa ya tiene un punto base. Edítalo para moverlo.' });
            }
            throw e;
        }
        zoneCache.invalidate(map_id);
        const zone = await dbGet('SELECT * FROM zones WHERE id = ?', [id]);
        res.status(201).json(zone);
    } catch (err) {
        res.status(500).json({ error: 'Error al crear la zona' });
    }
};

/**
 * PUT /api/maps/:map_id/zones/:id
 */
exports.updateZone = async (req, res) => {
    const { map_id, id } = req.params;
    const { name, description, category, map_x, map_y } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';

    try {
        const map = await dbGet('SELECT museum_id FROM maps WHERE id = ?', [map_id]);
        if (!map) return res.status(404).json({ error: 'Mapa no encontrado' });
        if (!isSuperAdmin && req.user.museum_id !== map.museum_id) {
            return res.status(403).json({ error: 'No tienes acceso' });
        }

        const existing = await dbGet('SELECT * FROM zones WHERE id = ? AND map_id = ?', [id, map_id]);
        if (!existing) return res.status(404).json({ error: 'Zona no encontrada' });

        try {
            await dbRun(
                'UPDATE zones SET name = ?, description = ?, category = ?, map_x = ?, map_y = ? WHERE id = ?',
                [
                    name ?? existing.name,
                    description ?? existing.description,
                    category ?? existing.category,
                    map_x ?? existing.map_x,
                    map_y ?? existing.map_y,
                    id
                ]
            );
        } catch (e) {
            if (/UNIQUE/i.test(e.message)) {
                return res.status(409).json({ error: 'Este mapa ya tiene un punto base. Solo puede haber uno.' });
            }
            throw e;
        }
        zoneCache.invalidate(map_id);
        const updated = await dbGet('SELECT * FROM zones WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar la zona' });
    }
};

/**
 * DELETE /api/maps/:map_id/zones/:id
 */
exports.deleteZone = async (req, res) => {
    const { map_id, id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    try {
        const map = await dbGet('SELECT museum_id FROM maps WHERE id = ?', [map_id]);
        if (!map) return res.status(404).json({ error: 'Mapa no encontrado' });
        if (!isSuperAdmin && req.user.museum_id !== map.museum_id) {
            return res.status(403).json({ error: 'No tienes acceso' });
        }

        const existing = await dbGet('SELECT * FROM zones WHERE id = ? AND map_id = ?', [id, map_id]);
        if (!existing) return res.status(404).json({ error: 'Zona no encontrada' });

        await dbRun('DELETE FROM zones WHERE id = ?', [id]);
        zoneCache.invalidate(map_id);
        res.json({ message: 'Zona eliminada' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar la zona' });
    }
};
