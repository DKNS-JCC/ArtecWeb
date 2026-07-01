const crypto = require('crypto');
const db = require('../database');
const aiService = require('../services/aiService');
const sttService = require('../services/sttService');
const { findNearestZone, BASE_CATEGORY } = require('../utils/geo');

const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 8;  // Un poco más de contexto para mejorar la coherencia de la IA


function dbGet(sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
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


/**
 * Resuelve el place_name devuelto por la IA a una zona conocida usando:
 * 1. Coincidencia exacta (sin distinguir mayúsculas/minúsculas)
 * 2. El nombre del lugar contiene la consulta (o viceversa)
 * Devuelve el objeto de zona coincidente o null.
 */
function resolvePlace(placeName, places) {
    if (!placeName || !places || places.length === 0) return null;

    const query = placeName.toLowerCase().trim();

    // 1. Coincidencia exacta
    let match = places.find(p => p.name.toLowerCase() === query);
    if (match) return match;

    // 2. Empieza por
    match = places.find(p => p.name.toLowerCase().startsWith(query) || query.startsWith(p.name.toLowerCase()));
    if (match) return match;

    // 3. Contiene
    match = places.find(p => p.name.toLowerCase().includes(query) || query.includes(p.name.toLowerCase()));
    return match || null;
}


/**
 * POST /api/chat/message
 * Valida el mensaje del visitante, llama a la IA, persiste el historial y responde.
 * Para intents navigate_to, resuelve el nombre del lugar a una zona conocida.
 */
exports.handleMessage = async (req, res) => {
    const message = req.body.message?.trim();
    const { id: visitorId, session_id, robot_id, robot_name, museum_id, name: visitorName, expertise_level, language } = req.user;

    if (!message) {
        return res.status(400).json({ error: 'El mensaje es obligatorio' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Mensaje demasiado largo (máximo ${MAX_MESSAGE_LENGTH} caracteres)` });
    }

    try {
        const museum = await dbGet('SELECT name FROM museums WHERE id = ?', [museum_id]);

        // Carga las zonas del mapa asignado al robot (si lo hay).
        // El punto base es interno: se excluye de todo lo que ve la IA.
        const robot = await dbGet('SELECT map_id, position_x, position_y FROM robots WHERE id = ?', [robot_id]);
        const places = robot?.map_id
            ? await dbAll('SELECT id, name, description, category, map_x, map_y FROM zones WHERE map_id = ? AND category != ?', [robot.map_id, BASE_CATEGORY])
            : [];

        // ¿Dónde está el robot ahora mismo? El waypoint con nombre más cercano a su pose
        // en vivo, para que pueda responder "¿dónde estás?" con naturalidad.
        const nearest = findNearestZone(robot?.position_x, robot?.position_y, places);

        // Carga el historial de conversación de la BD (en el servidor, evita falsificaciones)
        const recentMessages = await dbAll(
            `SELECT role, content FROM chat_messages
             WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
            [session_id, HISTORY_LIMIT]
        );
        const history = recentMessages.reverse();

        const context = {
            robotName:      robot_name || 'Robot Guía',
            visitorName:    visitorName || 'Visitante',
            museumName:     museum?.name || 'Museo',
            museumId:       museum_id,
            expertiseLevel: expertise_level || 'general',
            language:       language || 'es',
            places,
            currentLocation: nearest?.name || null
        };

        // Llama al servicio de IA
        const aiResult = await aiService.interpret(message, history, context);

        let resolvedPlace = null;
        if (aiResult.intent === 'navigate_to') {
            const requestedName = aiResult.params?.place_name || '';
            resolvedPlace = resolvePlace(requestedName, places);

            if (resolvedPlace) {
                // Normaliza el place_name al nombre canónico almacenado
                aiResult.params.place_name = resolvedPlace.name;
                aiResult.params.place_id   = resolvedPlace.id;
                if (resolvedPlace.map_x != null) aiResult.params.map_x = resolvedPlace.map_x;
                if (resolvedPlace.map_y != null) aiResult.params.map_y = resolvedPlace.map_y;

                // NOTA: la confirmación la gestiona el modal del frontend.
                // La respuesta de la IA debe reconocer el destino pero no pedir
                // confirmación por texto: de eso se encarga el modal.
            } else if (requestedName) {
                // La IA sugirió un lugar que no existe - se degrada el intent
                aiResult.intent = 'none';
                aiResult.confidence = 0.3;
                const availableNames = places.map(p => `"${p.name}"`).join(', ');
                aiResult.response = availableNames.length > 0
                    ? `Lo siento, no conozco el lugar "${requestedName}". Los lugares disponibles en este museo son: ${availableNames}.`
                    : 'Lo siento, no tengo lugares registrados en este museo todavía.';
            }
        }

        await dbRun(
            'INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content) VALUES (?,?,?,?,?,?)',
            [crypto.randomUUID(), visitorId, session_id, robot_id, 'user', message]
        );
        await dbRun(
            'INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content, intent) VALUES (?,?,?,?,?,?,?)',
            [crypto.randomUUID(), visitorId, session_id, robot_id, 'assistant', aiResult.response, aiResult.intent]
        );

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

/**
 * POST /api/chat/stt
 * Transcribe un clip de voz del visitante a texto usando el modelo local de Whisper.
 * El audio (WAV mono 16 kHz) llega en memoria vía multer; no se almacena nada.
 * Devuelve solo el texto reconocido: el cliente lo envía después como un mensaje
 * escrito, reutilizando la tubería existente de /chat/message (IA, historial, intents).
 */
exports.handleTranscribe = async (req, res) => {
    if (!req.file || !req.file.buffer?.length) {
        return res.status(400).json({ error: 'No se recibió ningún audio.' });
    }

    try {
        const text = await sttService.transcribe(req.file.buffer);
        return res.json({ text });
    } catch (err) {
        console.error('[STT] Transcription failed:', err.message);
        // Los errores de validación llevan un mensaje amigable en español; se devuelven
        // como 400, y cualquier cosa inesperada como 503 (fallo de carga del modelo / inferencia).
        const isUserError = /audio|grabación|formato|corto|PCM|WAV/i.test(err.message || '');
        return res.status(isUserError ? 400 : 503).json({
            error: isUserError
                ? err.message
                : 'El reconocimiento de voz no está disponible en este momento.',
        });
    }
};
