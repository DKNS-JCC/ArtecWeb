const db = require('../database');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rosService = require('../services/rosService');
const zoneCache = require('../utils/zoneCache');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
    });
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

exports.listMuseums = (req, res) => {
    db.all(`SELECT * FROM museums ORDER BY name ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al obtener los museos' });
        res.json(rows);
    });
};

// POST /api/museums - Crea un museo nuevo
exports.createMuseum = (req, res) => {
    const { name, company } = req.body;

    if (!name || !company) {
        return res.status(400).json({ error: 'El nombre y la empresa son obligatorios' });
    }

    const museumId = crypto.randomUUID();

    db.run(
        `INSERT INTO museums (id, name, company) VALUES (?, ?, ?)`,
        [museumId, name.trim(), company.trim()],
        function (err) {
            if (err) return res.status(500).json({ error: 'Error al crear el museo' });

            res.status(201).json({
                message: 'Museo creado correctamente',
                museum: { id: museumId, name: name.trim(), company: company.trim() }
            });
        }
    );
};

// PUT /api/museums/:id - Actualiza el nombre/empresa de un museo
exports.updateMuseum = (req, res) => {
    const { id } = req.params;
    const { name, company } = req.body;

    if (!name || !company) {
        return res.status(400).json({ error: 'El nombre y la empresa son obligatorios' });
    }

    db.run(
        `UPDATE museums SET name = ?, company = ? WHERE id = ?`,
        [name.trim(), company.trim(), id],
        function (err) {
            if (err) return res.status(500).json({ error: 'Error al actualizar el museo' });
            if (this.changes === 0) return res.status(404).json({ error: 'Museo no encontrado' });

            res.json({
                message: 'Museo actualizado correctamente',
                museum: { id, name: name.trim(), company: company.trim() }
            });
        }
    );
};

// DELETE /api/museums/:id - Elimina un museo y todo lo que cuelga de él. El
// cascade de claves foráneas borra de golpe sus mapas, robots, usuarios, visitantes,
// chat e incidencias; aún así limpiamos los efectos colaterales que la BD no alcanza:
// las conexiones ROS en vivo y los archivos de imagen del mapa en disco.
exports.deleteMuseum = async (req, res) => {
    const { id } = req.params;

    try {
        const museum = await dbGet('SELECT id FROM museums WHERE id = ?', [id]);
        if (!museum) return res.status(404).json({ error: 'Museo no encontrado' });

        const robots = await dbAll('SELECT id FROM robots WHERE museum_id = ?', [id]);
        const maps   = await dbAll('SELECT id, image_path FROM maps WHERE museum_id = ?', [id]);

        await dbRun('DELETE FROM museums WHERE id = ?', [id]);

        // Efectos colaterales fuera de la base de datos:
        for (const r of robots) rosService.disconnect(r.id);
        for (const m of maps) {
            zoneCache.invalidate(m.id);
            const filePath = path.join(__dirname, '../../', m.image_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        res.json({ message: 'Museo eliminado' });
    } catch (err) {
        console.error('[Museum] Delete error:', err.message);
        res.status(500).json({ error: 'Error al eliminar el museo' });
    }
};
