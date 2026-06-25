const db = require('../database');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rosService = require('../services/rosService');
const zoneCache = require('../utils/zoneCache');

const dbGet = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
const dbAll = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
const dbRun = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { e ? rej(e) : res(this); }));

// GET /api/museums - List all museums
exports.listMuseums = (req, res) => {
    db.all(`SELECT * FROM museums ORDER BY name ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error fetching museums' });
        res.json(rows);
    });
};

// POST /api/museums - Create a new museum
exports.createMuseum = (req, res) => {
    const { name, company } = req.body;

    if (!name || !company) {
        return res.status(400).json({ error: 'Name and company are required' });
    }

    const museumId = crypto.randomUUID();

    db.run(
        `INSERT INTO museums (id, name, company) VALUES (?, ?, ?)`,
        [museumId, name.trim(), company.trim()],
        function (err) {
            if (err) return res.status(500).json({ error: 'Error creating museum' });

            res.status(201).json({
                message: 'Museum created successfully',
                museum: { id: museumId, name: name.trim(), company: company.trim() }
            });
        }
    );
};

// PUT /api/museums/:id - Update a museum's name/company
exports.updateMuseum = (req, res) => {
    const { id } = req.params;
    const { name, company } = req.body;

    if (!name || !company) {
        return res.status(400).json({ error: 'Name and company are required' });
    }

    db.run(
        `UPDATE museums SET name = ?, company = ? WHERE id = ?`,
        [name.trim(), company.trim(), id],
        function (err) {
            if (err) return res.status(500).json({ error: 'Error updating museum' });
            if (this.changes === 0) return res.status(404).json({ error: 'Museum not found' });

            res.json({
                message: 'Museum updated successfully',
                museum: { id, name: name.trim(), company: company.trim() }
            });
        }
    );
};

// DELETE /api/museums/:id - Delete a museum and everything under it. The FK
// cascade removes its maps, robots, users, visitors, chat and incidents in one
// shot; we still clean up the side effects the DB can't reach: live ROS
// connections and the map image files on disk.
exports.deleteMuseum = async (req, res) => {
    const { id } = req.params;

    try {
        const museum = await dbGet('SELECT id FROM museums WHERE id = ?', [id]);
        if (!museum) return res.status(404).json({ error: 'Museum not found' });

        const robots = await dbAll('SELECT id FROM robots WHERE museum_id = ?', [id]);
        const maps   = await dbAll('SELECT id, image_path FROM maps WHERE museum_id = ?', [id]);

        await dbRun('DELETE FROM museums WHERE id = ?', [id]);

        // Side effects outside the database:
        for (const r of robots) rosService.disconnect(r.id);
        for (const m of maps) {
            zoneCache.invalidate(m.id);
            const filePath = path.join(__dirname, '../../', m.image_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        res.json({ message: 'Museum deleted' });
    } catch (err) {
        console.error('[Museum] Delete error:', err.message);
        res.status(500).json({ error: 'Error deleting museum' });
    }
};
