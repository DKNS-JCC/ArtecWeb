const crypto = require('crypto');
const db = require('../database');
const aiService = require('../services/aiService');

const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 8;  // Slightly more context for better AI coherence

// ─── DB Helpers ───────────────────────────────────────────────────────────────

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

// ─── Place Resolution ─────────────────────────────────────────────────────────

/**
 * Resolves an AI-returned place_name to a known zone using:
 * 1. Exact match (case-insensitive)
 * 2. Place name contains the query (or vice-versa)
 * Returns the matching zone object or null.
 */
function resolvePlace(placeName, places) {
    if (!placeName || !places || places.length === 0) return null;

    const query = placeName.toLowerCase().trim();

    // 1. Exact match
    let match = places.find(p => p.name.toLowerCase() === query);
    if (match) return match;

    // 2. Starts-with
    match = places.find(p => p.name.toLowerCase().startsWith(query) || query.startsWith(p.name.toLowerCase()));
    if (match) return match;

    // 3. Contains
    match = places.find(p => p.name.toLowerCase().includes(query) || query.includes(p.name.toLowerCase()));
    return match || null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * POST /api/chat/message
 * Validates the visitor message, calls the AI, persists history, and responds.
 * For navigate_to intents, resolves the place name to a known zone.
 */
exports.handleMessage = async (req, res) => {
    const message = req.body.message?.trim();
    const { id: visitorId, session_id, robot_id, robot_name, museum_id, name: visitorName, expertise_level } = req.user;

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
            ? await dbAll('SELECT id, name, description, map_x, map_y FROM zones WHERE map_id = ?', [robot.map_id])
            : [];

        // Load conversation history from DB (server-side, prevents forgery)
        const recentMessages = await dbAll(
            `SELECT role, content FROM chat_messages
             WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
            [session_id, HISTORY_LIMIT]
        );
        const history = recentMessages.reverse();

        // Build AI context
        const context = {
            robotName:      robot_name || 'Robot Guía',
            visitorName:    visitorName || 'Visitante',
            museumName:     museum?.name || 'Museo',
            museumId:       museum_id,
            expertiseLevel: expertise_level || 'general',
            places
        };

        // Call AI service
        const aiResult = await aiService.interpret(message, history, context);

        // ── Place resolution for navigate_to ──────────────────────────────
        let resolvedPlace = null;
        if (aiResult.intent === 'navigate_to') {
            const requestedName = aiResult.params?.place_name || '';
            resolvedPlace = resolvePlace(requestedName, places);

            if (resolvedPlace) {
                // Normalise the place_name to the canonical stored name
                aiResult.params.place_name = resolvedPlace.name;
                aiResult.params.place_id   = resolvedPlace.id;
                if (resolvedPlace.map_x != null) aiResult.params.map_x = resolvedPlace.map_x;
                if (resolvedPlace.map_y != null) aiResult.params.map_y = resolvedPlace.map_y;

                // NOTE: Confirmation is handled by the frontend modal dialog.
                // The AI response should acknowledge the destination but not ask
                // for text-based confirmation — the modal takes care of that.
            } else if (requestedName) {
                // AI suggested a place that doesn't exist — downgrade intent
                aiResult.intent = 'none';
                aiResult.confidence = 0.3;
                // Build a helpful response listing available places
                const availableNames = places.map(p => `"${p.name}"`).join(', ');
                aiResult.response = availableNames.length > 0
                    ? `Lo siento, no conozco el lugar "${requestedName}". Los lugares disponibles en este museo son: ${availableNames}.`
                    : 'Lo siento, no tengo lugares registrados en este museo todavía.';
            }
        }

        // ── Persist messages ──────────────────────────────────────────────
        await dbRun(
            'INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content) VALUES (?,?,?,?,?,?)',
            [crypto.randomUUID(), visitorId, session_id, robot_id, 'user', message]
        );
        await dbRun(
            'INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content, intent) VALUES (?,?,?,?,?,?,?)',
            [crypto.randomUUID(), visitorId, session_id, robot_id, 'assistant', aiResult.response, aiResult.intent]
        );

        // ── Respond ───────────────────────────────────────────────────────
        res.json({
            response:       aiResult.response,
            intent:         aiResult.intent,
            params:         aiResult.params,
            confidence:     aiResult.confidence,
            resolved_place: resolvedPlace
                ? { id: resolvedPlace.id, name: resolvedPlace.name, map_x: resolvedPlace.map_x, map_y: resolvedPlace.map_y }
                : null
        });

    } catch (err) {
        console.error('[Chat] Error processing message:', err);
        res.status(500).json({
            response:   'Lo siento, tuve un problema procesando tu mensaje. ¿Puedes intentarlo de nuevo?',
            intent:     'none',
            params:     {},
            confidence: 0,
            resolved_place: null
        });
    }
};
