const request = require('supertest');
const app     = require('../server');
const db      = require('../database');
const {
    clearAllTables, createMuseum, createRobot, createVisitor, lockRobot,
    createZone, makeVisitorToken, makeAdminToken, createUser
} = require('./helpers/fixtures');

// ─── Mock AI service ──────────────────────────────────────────────────────────
// We isolate unit tests from the real Gemini API

jest.mock('../services/aiService', () => ({
    interpret: jest.fn(),
    VALID_INTENTS: ['navigate_to', 'explain', 'greet', 'farewell', 'none']
}));

const aiService = require('../services/aiService');

// ─── Test state ───────────────────────────────────────────────────────────────

let museum, robot, visitor, zone, visitorToken;

beforeAll(async () => {
    await clearAllTables(db);
    museum  = await createMuseum(db, { name: 'Chat Museum' });
    robot   = await createRobot(db, { name: 'ChatBot', museum_id: museum.id });
    visitor = await createVisitor(db, { robot_id: robot.id, name: 'ChatVisitor' });
    await lockRobot(db, robot.id, visitor.id, 60); // Lock for 1 hour

    // Create a map + zone to test place resolution
    const mapId = require('crypto').randomUUID();
    await new Promise(r => db.run(
        'INSERT INTO maps (id, museum_id, name, image_path, resolution, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [mapId, museum.id, 'Floor 1', '/tmp/map.png', 0.05, 100, 100], r
    ));
    await new Promise(r => db.run(
        'UPDATE robots SET map_id = ? WHERE id = ?', [mapId, robot.id], r
    ));
    zone = await createZone(db, { map_id: mapId, name: 'Sala Egipcia', map_x: 3.5, map_y: 4.0 });

    visitorToken = makeVisitorToken(visitor, robot);
});

afterAll(done => { db.close(() => done()); });

beforeEach(() => aiService.interpret.mockClear());

// ─── POST /api/chat/message ───────────────────────────────────────────────────

describe('POST /api/chat/message', () => {
    test('returns AI response for a valid message', async () => {
        aiService.interpret.mockResolvedValueOnce({
            intent: 'greet', params: {},
            response: '¡Hola! Bienvenido al museo.',
            confidence: 0.95
        });

        const res = await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${visitorToken}`)
            .send({ message: 'Hola!' });

        expect(res.status).toBe(200);
        expect(res.body.response).toBe('¡Hola! Bienvenido al museo.');
        expect(res.body.intent).toBe('greet');
        expect(res.body.confidence).toBe(0.95);
    });

    test('persists both user and assistant messages in chat_messages', async () => {
        aiService.interpret.mockResolvedValueOnce({
            intent: 'none', params: {},
            response: 'Cuéntame más.',
            confidence: 0.6
        });

        await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${visitorToken}`)
            .send({ message: 'Mensaje de persistencia' });

        const rows = await new Promise(r => db.all(
            'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 2',
            [visitor.session_id], (_, rs) => r(rs)
        ));
        expect(rows.some(r => r.role === 'user')).toBe(true);
        expect(rows.some(r => r.role === 'assistant')).toBe(true);
    });

    test('resolves navigate_to place name to zone coordinates', async () => {
        aiService.interpret.mockResolvedValueOnce({
            intent: 'navigate_to',
            params: { place_name: 'Sala Egipcia' },
            response: 'Te llevo a la Sala Egipcia.',
            confidence: 0.9
        });

        const res = await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${visitorToken}`)
            .send({ message: 'Llévame a la Sala Egipcia' });

        expect(res.status).toBe(200);
        expect(res.body.intent).toBe('navigate_to');
        expect(res.body.params.place_id).toBe(zone.id);
        expect(res.body.params.map_x).toBe(3.5);
        expect(res.body.resolved_place).toBeTruthy();
        expect(res.body.resolved_place.name).toBe('Sala Egipcia');
    });

    test('downgrades navigate_to to none when place does not exist', async () => {
        aiService.interpret.mockResolvedValueOnce({
            intent: 'navigate_to',
            params: { place_name: 'Lugar Inexistente' },
            response: 'Te llevo allí.',
            confidence: 0.8
        });

        const res = await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${visitorToken}`)
            .send({ message: 'Llévame al lugar inexistente' });

        expect(res.status).toBe(200);
        expect(res.body.intent).toBe('none');
        expect(res.body.response).toMatch(/no conozco el lugar/i);
        expect(res.body.resolved_place).toBeNull();
    });

    test('returns 400 when message is empty', async () => {
        const res = await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${visitorToken}`)
            .send({ message: '   ' });
        expect(res.status).toBe(400);
    });

    test('returns 400 when message exceeds max length', async () => {
        const res = await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${visitorToken}`)
            .send({ message: 'x'.repeat(501) });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/too long/i);
    });

    test('returns 401 without auth token', async () => {
        const res = await request(app)
            .post('/api/chat/message')
            .send({ message: 'Hola' });
        expect(res.status).toBe(401);
    });

    test('returns 403 for non-visitor token', async () => {
        const admin = await createUser(db, {
            name: 'chatadmin', email: 'chatadmin@test.com',
            role: 'museum_admin', museum_id: museum.id, password: 'P1!'
        });
        const adminToken = makeAdminToken(admin);
        const res = await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ message: 'Hola' });
        expect(res.status).toBe(403);
    });

    test('returns 500-level error response when AI throws', async () => {
        aiService.interpret.mockRejectedValueOnce(new Error('AI exploded'));

        const res = await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${visitorToken}`)
            .send({ message: 'Trigger error' });

        // Controller catches the error and returns a friendly response with 500
        expect(res.status).toBe(500);
        expect(res.body.response).toMatch(/problema procesando/i);
    });

    test('includes resolved_place: null for non-navigate intents', async () => {
        aiService.interpret.mockResolvedValueOnce({
            intent: 'explain', params: { topic: 'pintura' },
            response: 'Las pinturas son hermosas.',
            confidence: 0.85
        });

        const res = await request(app)
            .post('/api/chat/message')
            .set('Authorization', `Bearer ${visitorToken}`)
            .send({ message: '¿Qué es esta pintura?' });

        expect(res.status).toBe(200);
        expect(res.body.resolved_place).toBeNull();
    });
});
