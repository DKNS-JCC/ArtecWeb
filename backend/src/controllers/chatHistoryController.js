const db = require('../database');


function dbAll(sql, params) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbRun(sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// Lists sessions (soft-deleted excluded). Supports robot_id, date_from, date_to filters.

exports.listSessions = async (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId     = req.user.museum_id;
    const robotFilter  = req.query.robot_id  || null;
    const dateFrom     = req.query.date_from || null;  // 'YYYY-MM-DD'
    const dateTo       = req.query.date_to   || null;  // 'YYYY-MM-DD'
    const limit        = Math.min(parseInt(req.query.limit)  || 30, 100);
    const offset       = Math.max(parseInt(req.query.offset) || 0,  0);

    try {
        const conditions = [];
        const params     = [];

        if (!isSuperAdmin) {
            conditions.push('r.museum_id = ?');
            params.push(museumId);
        }

        // Soft-delete: hide deleted sessions from history
        conditions.push('v.deleted_at IS NULL');

        if (robotFilter) {
            conditions.push('r.id = ?');
            params.push(robotFilter);
        }
        if (dateFrom) {
            conditions.push('v.created_at >= ?');
            params.push(dateFrom);
        }
        if (dateTo) {
            conditions.push("v.created_at < date(?, '+1 day')");
            params.push(dateTo);
        }

        const where = conditions.join(' AND ');

        const sessions = await dbAll(`
            SELECT
                v.session_id,
                v.name          AS visitor_name,
                v.expertise_level,
                v.created_at    AS started_at,
                v.ended_at,
                ROUND(
                    (julianday(COALESCE(v.ended_at, datetime('now'))) - julianday(v.created_at)) * 24 * 60,
                    1
                )                             AS duration_minutes,
                COUNT(cm.id)                  AS message_count,
                r.id                          AS robot_id,
                r.name                        AS robot_name,
                (
                    SELECT cm2.intent
                    FROM   chat_messages cm2
                    WHERE  cm2.session_id = v.session_id
                      AND  cm2.role       = 'assistant'
                      AND  cm2.intent NOT IN ('none', 'greet', 'farewell')
                      AND  cm2.intent IS NOT NULL
                    GROUP  BY cm2.intent
                    ORDER  BY COUNT(*) DESC
                    LIMIT  1
                ) AS top_intent
            FROM   visitors   v
            JOIN   robots     r  ON r.id = v.robot_id
            LEFT   JOIN chat_messages cm ON cm.session_id = v.session_id
            WHERE  ${where}
            GROUP  BY v.session_id
            ORDER  BY v.created_at DESC
            LIMIT  ? OFFSET ?
        `, [...params, limit, offset]);

        const countRow = await dbGet(`
            SELECT COUNT(DISTINCT v.session_id) AS total
            FROM   visitors v
            JOIN   robots   r ON r.id = v.robot_id
            WHERE  ${where}
        `, params);

        res.json({ sessions, total: countRow?.total || 0, limit, offset });
    } catch (err) {
        console.error('[ChatHistory] listSessions error:', err);
        res.status(500).json({ error: 'Error cargando historial de sesiones' });
    }
};

// Returns the ordered conversation for one session (paginated, max 500).

exports.getSessionMessages = async (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId     = req.user.museum_id;
    const { session_id } = req.params;

    try {
        const session = await dbGet(`
            SELECT v.session_id, v.name AS visitor_name, v.expertise_level,
                   v.created_at AS started_at, v.ended_at,
                   r.name AS robot_name, r.museum_id
            FROM   visitors v
            JOIN   robots   r ON r.id = v.robot_id
            WHERE  v.session_id = ?
              AND  v.deleted_at IS NULL
              AND  (? OR r.museum_id = ?)
        `, [session_id, isSuperAdmin ? 1 : 0, museumId]);

        if (!session) {
            return res.status(404).json({ error: 'Sesión no encontrada o sin acceso' });
        }

        const limit  = Math.min(parseInt(req.query.limit)  || 200, 500);
        const offset = Math.max(parseInt(req.query.offset) || 0,   0);

        const countRow = await dbGet(
            `SELECT COUNT(*) AS total FROM chat_messages WHERE session_id = ?`,
            [session_id]
        );

        const messages = await dbAll(`
            SELECT role, content, intent, created_at
            FROM   chat_messages
            WHERE  session_id = ?
            ORDER  BY created_at ASC
            LIMIT  ? OFFSET ?
        `, [session_id, limit, offset]);

        res.json({ session, messages, total: countRow?.total || 0, limit, offset });
    } catch (err) {
        console.error('[ChatHistory] getSessionMessages error:', err);
        res.status(500).json({ error: 'Error cargando mensajes de sesión' });
    }
};

// Soft-deletes a session: hidden in history, still counted in stats.

exports.deleteSession = async (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId     = req.user.museum_id;
    const { session_id } = req.params;

    try {
        // Verify the session belongs to an authorised robot
        const session = await dbGet(`
            SELECT v.session_id FROM visitors v
            JOIN   robots r ON r.id = v.robot_id
            WHERE  v.session_id = ?
              AND  v.deleted_at IS NULL
              AND  (? OR r.museum_id = ?)
        `, [session_id, isSuperAdmin ? 1 : 0, museumId]);

        if (!session) {
            return res.status(404).json({ error: 'Sesión no encontrada o sin acceso' });
        }

        await dbRun(
            `UPDATE visitors SET deleted_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
            [session_id]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('[ChatHistory] deleteSession error:', err);
        res.status(500).json({ error: 'Error al eliminar la sesión' });
    }
};

// Convenience: list robots the admin can see (for the filter dropdown).

exports.listRobotsForFilter = async (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId     = req.user.museum_id;

    try {
        const rows = await dbAll(
            isSuperAdmin
                ? `SELECT id, name, museum_id FROM robots ORDER BY name`
                : `SELECT id, name, museum_id FROM robots WHERE museum_id = ? ORDER BY name`,
            isSuperAdmin ? [] : [museumId]
        );
        res.json(rows);
    } catch (_err) {
        res.status(500).json({ error: 'Error cargando robots' });
    }
};
