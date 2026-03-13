const db = require('../database');

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

    db.run(
        `INSERT INTO museums (name, company) VALUES (?, ?)`,
        [name.trim(), company.trim()],
        function (err) {
            if (err) return res.status(500).json({ error: 'Error creating museum' });

            res.status(201).json({
                message: 'Museum created successfully',
                museum: { id: this.lastID, name, company }
            });
        }
    );
};
