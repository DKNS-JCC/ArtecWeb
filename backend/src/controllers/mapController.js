const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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
 * POST /api/museums/:museum_id/map
 * Upload map image + optional YAML metadata.
 * Expects multipart with fields: "image" (PNG/JPG/PGM) and optionally "yaml" (YAML).
 */
exports.uploadMap = async (req, res) => {
    const { museum_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    // Verify museum access
    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
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

        // Get image dimensions (basic approach: store from client or default)
        const width = parseInt(req.body.width) || 0;
        const height = parseInt(req.body.height) || 0;

        const imagePath = `/uploads/maps/${imageFile.filename}`;

        // Delete old map image if one exists
        const existing = await dbGet('SELECT image_path FROM museum_maps WHERE museum_id = ?', [museum_id]);
        if (existing) {
            const oldPath = path.join(__dirname, '../../', existing.image_path);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

            await dbRun(
                `UPDATE museum_maps SET image_path = ?, resolution = ?, origin_x = ?, origin_y = ?, origin_theta = ?, width = ?, height = ?, uploaded_at = CURRENT_TIMESTAMP WHERE museum_id = ?`,
                [imagePath, meta.resolution, meta.origin_x, meta.origin_y, meta.origin_theta, width, height, museum_id]
            );
        } else {
            const id = crypto.randomUUID();
            await dbRun(
                `INSERT INTO museum_maps (id, museum_id, image_path, resolution, origin_x, origin_y, origin_theta, width, height) VALUES (?,?,?,?,?,?,?,?,?)`,
                [id, museum_id, imagePath, meta.resolution, meta.origin_x, meta.origin_y, meta.origin_theta, width, height]
            );
        }

        const map = await dbGet('SELECT * FROM museum_maps WHERE museum_id = ?', [museum_id]);
        res.json({ message: 'Mapa subido correctamente', map });
    } catch (err) {
        console.error('[Map] Upload error:', err);
        res.status(500).json({ error: 'Error al subir el mapa' });
    }
};

/**
 * GET /api/museums/:museum_id/map
 * Returns map metadata + image URL for the museum.
 */
exports.getMap = async (req, res) => {
    const { museum_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
    }

    try {
        const map = await dbGet('SELECT * FROM museum_maps WHERE museum_id = ?', [museum_id]);
        if (!map) {
            return res.status(404).json({ error: 'No hay mapa registrado para este museo' });
        }
        res.json(map);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener el mapa' });
    }
};

/**
 * DELETE /api/museums/:museum_id/map
 */
exports.deleteMap = async (req, res) => {
    const { museum_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
    }

    try {
        const existing = await dbGet('SELECT image_path FROM museum_maps WHERE museum_id = ?', [museum_id]);
        if (existing) {
            const oldPath = path.join(__dirname, '../../', existing.image_path);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            await dbRun('DELETE FROM museum_maps WHERE museum_id = ?', [museum_id]);
        }
        res.json({ message: 'Mapa eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar el mapa' });
    }
};

// ─── PLACES / ZONES CRUD ─────────────────────────────────────

/**
 * GET /api/museums/:museum_id/places
 */
exports.getPlaces = async (req, res) => {
    const { museum_id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
    }

    try {
        const places = await dbAll('SELECT * FROM museum_places WHERE museum_id = ? ORDER BY created_at DESC', [museum_id]);
        res.json(places);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener los lugares' });
    }
};

/**
 * POST /api/museums/:museum_id/places
 */
exports.createPlace = async (req, res) => {
    const { museum_id } = req.params;
    const { name, description, category, map_x, map_y } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';

    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
    }

    if (!name) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    try {
        const id = crypto.randomUUID();
        await dbRun(
            'INSERT INTO museum_places (id, museum_id, name, description, category, map_x, map_y) VALUES (?,?,?,?,?,?,?)',
            [id, museum_id, name, description || null, category || 'exhibit', map_x ?? null, map_y ?? null]
        );
        const place = await dbGet('SELECT * FROM museum_places WHERE id = ?', [id]);
        res.status(201).json(place);
    } catch (err) {
        res.status(500).json({ error: 'Error al crear el lugar' });
    }
};

/**
 * PUT /api/museums/:museum_id/places/:id
 */
exports.updatePlace = async (req, res) => {
    const { museum_id, id } = req.params;
    const { name, description, category, map_x, map_y } = req.body;
    const isSuperAdmin = req.user.role === 'platform_admin';

    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
    }

    try {
        const existing = await dbGet('SELECT * FROM museum_places WHERE id = ? AND museum_id = ?', [id, museum_id]);
        if (!existing) return res.status(404).json({ error: 'Lugar no encontrado' });

        await dbRun(
            'UPDATE museum_places SET name = ?, description = ?, category = ?, map_x = ?, map_y = ? WHERE id = ?',
            [
                name ?? existing.name,
                description ?? existing.description,
                category ?? existing.category,
                map_x ?? existing.map_x,
                map_y ?? existing.map_y,
                id
            ]
        );
        const updated = await dbGet('SELECT * FROM museum_places WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar el lugar' });
    }
};

/**
 * DELETE /api/museums/:museum_id/places/:id
 */
exports.deletePlace = async (req, res) => {
    const { museum_id, id } = req.params;
    const isSuperAdmin = req.user.role === 'platform_admin';

    if (!isSuperAdmin && req.user.museum_id !== museum_id) {
        return res.status(403).json({ error: 'No tienes acceso a este museo' });
    }

    try {
        const existing = await dbGet('SELECT * FROM museum_places WHERE id = ? AND museum_id = ?', [id, museum_id]);
        if (!existing) return res.status(404).json({ error: 'Lugar no encontrado' });

        await dbRun('DELETE FROM museum_places WHERE id = ?', [id]);
        res.json({ message: 'Lugar eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar el lugar' });
    }
};
