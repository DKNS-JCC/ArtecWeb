const crypto = require('crypto');
const db = require('../database');
const aiService = require('../services/aiService');

const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 6;

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
 * POST /api/chat/message
 * Handles a visitor chat message: validates, calls AI, logs, responds.
 */
exports.handleMessage = async (req, res) => {
    const message = req.body.message?.trim();
    const { id: visitorId, session_id, robot_id, robot_name, museum_id, name: visitorName } = req.user;

    // Input validation
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
    }

    try {
        // Load museum context
        const museum = await dbGet('SELECT name FROM museums WHERE id = ?', [museum_id]);
        // Load zones from the map assigned to the robot (if any)
        const robot = await dbGet('SELECT map_id FROM robots WHERE id = ?', [robot_id]);
        const places = robot?.map_id
            ? await dbAll('SELECT id, name, description FROM zones WHERE map_id = ?', [robot.map_id])
            : [];

        // Load conversation history from DB (server-side, prevents forgery)
        const recentMessages = await dbAll(
            'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
            [session_id, HISTORY_LIMIT]
        );
        const history = recentMessages.reverse();

        // Build AI context
        const context = {
            robotName: robot_name || 'Robot Guía',
            visitorName: visitorName || 'Visitante',
            museumName: museum?.name || 'Museo',
            museumId: museum_id,
            places
        };

        // Call AI service
        const aiResult = await aiService.interpret(message, history, context);

        // Log user message
        await dbRun(
            'INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content) VALUES (?,?,?,?,?,?)',
            [crypto.randomUUID(), visitorId, session_id, robot_id, 'user', message]
        );

        // Log assistant response
        await dbRun(
            'INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content, intent) VALUES (?,?,?,?,?,?,?)',
            [crypto.randomUUID(), visitorId, session_id, robot_id, 'assistant', aiResult.response, aiResult.intent]
        );

        // Return response
        res.json({
            response: aiResult.response,
            intent: aiResult.intent,
            params: aiResult.params,
            confidence: aiResult.confidence
        });

    } catch (err) {
        console.error('[Chat] Error processing message:', err);
        res.status(500).json({
            response: 'Lo siento, tuve un problema procesando tu mensaje. ¿Puedes intentarlo de nuevo?',
            intent: 'none',
            params: {},
            confidence: 0
        });
    }
};
