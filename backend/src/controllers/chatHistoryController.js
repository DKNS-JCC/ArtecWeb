const db = require('../database');

// ─── DB Helpers ───────────────────────────────────────────────────────────────

function dbAll(sql, params) {
    return new Promise((resolve, reject) =>
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
    );
}

function dbGet(sql, params) {
    return new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
    );
}

// ─── GET /api/chat-history/sessions ──────────────────────────────────────────
// Lists all sessions across the admin's robots, newest first.
// Query params: robot_id (filter), limit (default 30), offset (default 0)

exports.listSessions = async (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId     = req.user.museum_id;
    const robotFilter  = req.query.robot_id || null;
    const limit        = Math.min(parseInt(req.query.limit)  || 30, 100);
    const offset       = Math.max(parseInt(req.query.offset) || 0,  0);

    try {
        let where = isSuperAdmin ? '1=1' : 'r.museum_id = ?';
        const params = isSuperAdmin ? [] : [museumId];

        if (robotFilter) {
            where += ' AND r.id = ?';
            params.push(robotFilter);
        }

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

        // Total count for pagination
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

// ─── GET /api/chat-history/sessions/:session_id/messages ─────────────────────
// Returns the full ordered conversation for one session.

exports.getSessionMessages = async (req, res) => {
    const isSuperAdmin = req.user.role === 'platform_admin';
    const museumId     = req.user.museum_id;
    const { session_id } = req.params;

    try {
        // Access control: verify the session belongs to an authorised robot
        const session = await dbGet(`
            SELECT v.session_id, v.name AS visitor_name, v.expertise_level,
                   v.created_at AS started_at, v.ended_at,
                   r.name AS robot_name, r.museum_id
            FROM   visitors v
            JOIN   robots   r ON r.id = v.robot_id
            WHERE  v.session_id = ?
              AND  (? OR r.museum_id = ?)
        `, [session_id, isSuperAdmin ? 1 : 0, museumId]);

        if (!session) {
            return res.status(404).json({ error: 'Sesión no encontrada o sin acceso' });
        }

        const messages = await dbAll(`
            SELECT role, content, intent, created_at
            FROM   chat_messages
            WHERE  session_id = ?
            ORDER  BY created_at ASC
        `, [session_id]);

        res.json({ session, messages });
    } catch (err) {
        console.error('[ChatHistory] getSessionMessages error:', err);
        res.status(500).json({ error: 'Error cargando mensajes de sesión' });
    }
};

// ─── GET /api/chat-history/robots ─────────────────────────────────────────────
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
    } catch (err) {
        res.status(500).json({ error: 'Error cargando robots' });
    }
};
