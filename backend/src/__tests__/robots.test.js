const request = require('supertest');
const app     = require('../server');
const db      = require('../database');
const {
    clearAllTables, createMuseum, createUser, createRobot,
    createVisitor, lockRobot, makeSuperAdminToken, makeAdminToken
} = require('./helpers/fixtures');

// Mock rosService so no real WebSocket connections are attempted
jest.mock('../services/rosService', () => ({
    connect:            jest.fn(),
    disconnect:         jest.fn(),
    getConnectionState: jest.fn().mockReturnValue(false),
    move:               jest.fn(),
    sendNavGoal:        jest.fn(),
    on:                 jest.fn(),   // rosService is an EventEmitter (sseService subscribes)
}));

// ─── State ────────────────────────────────────────────────────────────────────

let museum, museum2, superAdmin, adminUser, admin2, robot, robot2;
let superToken, adminToken, admin2Token;

beforeAll(async () => {
    await clearAllTables(db);

    museum  = await createMuseum(db, { name: 'Robot Museum 1', company: 'Co1' });
    museum2 = await createMuseum(db, { name: 'Robot Museum 2', company: 'Co2' });

    superAdmin = await createUser(db, {
        name: 'robotsuper', email: 'robotsuper@test.com',
        role: 'platform_admin', museum_id: null, password: 'SuperPass1!'
    });
    adminUser = await createUser(db, {
        name: 'robotadmin', email: 'robotadmin@test.com',
        role: 'museum_admin', museum_id: museum.id, password: 'AdminPass1!'
    });
    admin2 = await createUser(db, {
        name: 'robotadmin2', email: 'robotadmin2@test.com',
        role: 'museum_admin', museum_id: museum2.id, password: 'AdminPass2!'
    });

    superToken  = makeSuperAdminToken(superAdmin);
    adminToken  = makeAdminToken(adminUser);
    admin2Token = makeAdminToken(admin2);

    robot  = await createRobot(db, { name: 'Bot Alpha', museum_id: museum.id,  ip: '192.168.1.10' });
    robot2 = await createRobot(db, { name: 'Bot Beta',  museum_id: museum2.id, ip: '192.168.1.20' });
});

afterAll(done => { db.close(() => done()); });

// ─── POST /api/robots ─────────────────────────────────────────────────────────

describe('POST /api/robots', () => {
    test('superadmin can create a robot', async () => {
        const res = await request(app)
            .post('/api/robots')
            .set('Authorization', `Bearer ${superToken}`)
            .send({ name: 'New Bot', museum_id: museum.id });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe('New Bot');
    });

    test('returns 400 when name or museum_id missing', async () => {
        const res = await request(app)
            .post('/api/robots')
            .set('Authorization', `Bearer ${superToken}`)
            .send({ name: 'No Museum' });
        expect(res.status).toBe(400);
    });

    test('museum admin cannot create a robot (superadmin-only)', async () => {
        const res = await request(app)
            .post('/api/robots')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Forbidden Bot', museum_id: museum.id });
        expect(res.status).toBe(403);
    });

    test('returns 401 without auth', async () => {
        const res = await request(app).post('/api/robots').send({ name: 'X', museum_id: museum.id });
        expect(res.status).toBe(401);
    });
});

// ─── GET /api/robots ──────────────────────────────────────────────────────────

describe('GET /api/robots', () => {
    test('superadmin sees all robots', async () => {
        const res = await request(app)
            .get('/api/robots')
            .set('Authorization', `Bearer ${superToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const names = res.body.map(r => r.name);
        expect(names).toContain('Bot Alpha');
        expect(names).toContain('Bot Beta');
    });

    test('museum admin sees only their own museum robots', async () => {
        const res = await request(app)
            .get('/api/robots')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const ids = res.body.map(r => r.museum_id);
        ids.forEach(id => expect(id).toBe(museum.id));
    });

    test('robot list includes position, status and connection fields', async () => {
        const res = await request(app)
            .get('/api/robots')
            .set('Authorization', `Bearer ${adminToken}`);
        const bot = res.body.find(r => r.id === robot.id);
        expect(bot).toBeDefined();
        expect(bot).toHaveProperty('position');
        expect(bot).toHaveProperty('status');
        expect(bot).toHaveProperty('connected');
        expect(bot).toHaveProperty('is_occupied');
    });

    test('returns 401 without token', async () => {
        const res = await request(app).get('/api/robots');
        expect(res.status).toBe(401);
    });
});

// ─── GET /api/robots/:id ──────────────────────────────────────────────────────

describe('GET /api/robots/:id', () => {
    test('admin can get their own robot', async () => {
        const res = await request(app)
            .get(`/api/robots/${robot.id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(robot.id);
    });

    test('museum admin cannot access another museum robot', async () => {
        const res = await request(app)
            .get(`/api/robots/${robot2.id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });

    test('returns 404 for non-existent robot', async () => {
        const res = await request(app)
            .get('/api/robots/non-existent-id')
            .set('Authorization', `Bearer ${superToken}`);
        expect(res.status).toBe(404);
    });
});

// ─── PUT /api/robots/:id ──────────────────────────────────────────────────────

describe('PUT /api/robots/:id', () => {
    test('admin can update robot name', async () => {
        const res = await request(app)
            .put(`/api/robots/${robot.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Bot Alpha Updated' });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/updated/i);
    });

    test('admin can update robot IP', async () => {
        const res = await request(app)
            .put(`/api/robots/${robot.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ip: '10.0.0.5' });
        expect(res.status).toBe(200);
    });

    test('returns 400 for invalid IP format', async () => {
        const res = await request(app)
            .put(`/api/robots/${robot.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ip: 'not-an-ip' });
        expect(res.status).toBe(400);
    });

    test('museum admin cannot update robot from another museum', async () => {
        const res = await request(app)
            .put(`/api/robots/${robot2.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Stolen Name' });
        expect(res.status).toBe(404);
    });
});

// ─── POST /api/robots/:id/command ─────────────────────────────────────────────

describe('POST /api/robots/:id/command', () => {
    test('stop command updates status to idle', async () => {
        const res = await request(app)
            .post(`/api/robots/${robot.id}/command`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ command: 'stop' });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/stop/i);
    });

    test('move command is accepted', async () => {
        const res = await request(app)
            .post(`/api/robots/${robot.id}/command`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ command: 'move', payload: { linearX: 0.5, angularZ: 0 } });
        expect(res.status).toBe(200);
    });

    test('charge command is accepted', async () => {
        const res = await request(app)
            .post(`/api/robots/${robot.id}/command`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ command: 'charge' });
        expect(res.status).toBe(200);
    });

    test('connect command is accepted', async () => {
        const res = await request(app)
            .post(`/api/robots/${robot.id}/command`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ command: 'connect', payload: { ip: '192.168.1.10' } });
        expect(res.status).toBe(200);
    });

    test('returns 400 for unknown command', async () => {
        const res = await request(app)
            .post(`/api/robots/${robot.id}/command`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ command: 'self_destruct' });
        expect(res.status).toBe(400);
    });

    test('museum admin cannot command another museum robot', async () => {
        const res = await request(app)
            .post(`/api/robots/${robot2.id}/command`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ command: 'stop' });
        expect(res.status).toBe(404);
    });
});

// ─── POST /api/robots/:id/force-end ──────────────────────────────────────────

describe('POST /api/robots/:id/force-end', () => {
    let occupiedRobot, occupyingVisitor;

    beforeAll(async () => {
        occupiedRobot   = await createRobot(db, { name: 'Occupied Bot', museum_id: museum.id });
        occupyingVisitor = await createVisitor(db, { robot_id: occupiedRobot.id, name: 'Squatter' });
        await lockRobot(db, occupiedRobot.id, occupyingVisitor.id, 60);
    });

    test('admin can force-end an active visitor session', async () => {
        const res = await request(app)
            .post(`/api/robots/${occupiedRobot.id}/force-end`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/finalizada/i);
    });

    test('force-end on robot with no session returns ok message', async () => {
        const freeRobot = await createRobot(db, { name: 'Free Bot', museum_id: museum.id });
        const res = await request(app)
            .post(`/api/robots/${freeRobot.id}/force-end`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/No active session/i);
    });
});
