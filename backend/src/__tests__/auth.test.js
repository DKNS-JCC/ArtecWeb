const request = require('supertest');
const app     = require('../server');
const db      = require('../database');
const {
    clearAllTables, createMuseum, createUser, createRobot,
    lockRobot, createVisitor, makeAdminToken
} = require('./helpers/fixtures');

// Mock email service so no real emails are sent
jest.mock('../utils/emailService', () => ({
    sendWelcomeEmail: jest.fn().mockResolvedValue(true)
}));

// Mock rosService so the visitor "robot must be online" pre-flight check
// (see authController.createVisitor) passes without a real WebSocket/robot
jest.mock('../services/rosService', () => ({
    connect:            jest.fn(),
    disconnect:         jest.fn(),
    getConnectionState: jest.fn().mockReturnValue(true),
    waitForConnection:  jest.fn().mockResolvedValue(true),
    on:                 jest.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

let museum, adminUser, superAdminUser, robot;

beforeAll(async () => {
    await clearAllTables(db);
    museum       = await createMuseum(db);
    superAdminUser = await createUser(db, {
        name: 'superadmin', email: 'superadmin@test.com',
        role: 'platform_admin', museum_id: null, password: 'SuperPass1!'
    });
    adminUser = await createUser(db, {
        name: 'museumadmin', email: 'museumadmin@test.com',
        role: 'museum_admin', museum_id: museum.id, password: 'AdminPass1!'
    });
    robot = await createRobot(db, { name: 'TestBot', museum_id: museum.id });
});

afterAll(done => {
    db.close(done);
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
    test('logs in with valid username + password', async () => {
        const res = await request(app).post('/api/auth/login')
            .send({ identifier: 'museumadmin', password: 'AdminPass1!' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user.role).toBe('museum_admin');
    });

    test('logs in with email identifier', async () => {
        const res = await request(app).post('/api/auth/login')
            .send({ identifier: 'museumadmin@test.com', password: 'AdminPass1!' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
    });

    test('returns 401 on wrong password', async () => {
        const res = await request(app).post('/api/auth/login')
            .send({ identifier: 'museumadmin', password: 'WrongPass!' });
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error');
    });

    test('returns 401 on unknown user', async () => {
        const res = await request(app).post('/api/auth/login')
            .send({ identifier: 'nobody', password: 'pass' });
        expect(res.status).toBe(401);
    });

    test('returns 400 when fields are missing', async () => {
        const res = await request(app).post('/api/auth/login').send({});
        expect(res.status).toBe(400);
    });

    test('returns 403 for deactivated account', async () => {
        const inactiveUser = await createUser(db, {
            name: 'inactive', email: 'inactive@test.com',
            role: 'technician', museum_id: museum.id,
            password: 'Pass1!', active: 0, must_change_password: 0
        });
        const res = await request(app).post('/api/auth/login')
            .send({ identifier: 'inactive', password: 'Pass1!' });
        expect(res.status).toBe(403);
    });
});

// ─── POST /api/auth/visitor ───────────────────────────────────────────────────

describe('POST /api/auth/visitor', () => {
    test('creates a visitor session for a free robot', async () => {
        const res = await request(app).post('/api/auth/visitor')
            .send({ robotId: robot.id, name: 'Alice' });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
        expect(res.body.visitor.name).toBe('Alice');
        // Clean up so robot is free for next tests
        await db.run && db.run(
            'UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?',
            [robot.id], () => {}
        );
    });

    test('uses default name "Visitante" when name is omitted', async () => {
        const res = await request(app).post('/api/auth/visitor')
            .send({ robotId: robot.id });
        expect(res.status).toBe(201);
        expect(res.body.visitor.name).toBe('Visitante');
        await new Promise(r => db.run(
            'UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?',
            [robot.id], r
        ));
    });

    test('returns 404 for non-existent robot', async () => {
        const res = await request(app).post('/api/auth/visitor')
            .send({ robotId: 'non-existent-id', name: 'Bob' });
        expect(res.status).toBe(404);
    });

    test('returns 400 when robotId is missing', async () => {
        const res = await request(app).post('/api/auth/visitor').send({ name: 'Bob' });
        expect(res.status).toBe(400);
    });

    test('returns 403 when robot is already occupied', async () => {
        const visitor = await createVisitor(db, { robot_id: robot.id });
        await lockRobot(db, robot.id, visitor.id, 10);

        const res = await request(app).post('/api/auth/visitor')
            .send({ robotId: robot.id, name: 'Charlie' });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/ya está siendo utilizado/i);

        // Release robot
        await new Promise(r => db.run(
            'UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?',
            [robot.id], r
        ));
    });
});

// ─── POST /api/auth/change-password ──────────────────────────────────────────

describe('POST /api/auth/change-password', () => {
    let userForPwChange, token;

    beforeAll(async () => {
        userForPwChange = await createUser(db, {
            name: 'pwchangeuser', email: 'pwchange@test.com',
            role: 'technician', museum_id: museum.id, password: 'OldPass1!'
        });
        token = makeAdminToken(userForPwChange);
    });

    test('changes password with correct current password', async () => {
        const res = await request(app)
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'OldPass1!', new_password: 'NewPass1!' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
    });

    test('returns 401 with incorrect current password', async () => {
        const res = await request(app)
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'WrongOld!', new_password: 'NewPass1!' });
        expect(res.status).toBe(401);
    });

    test('returns 400 when new password is too short', async () => {
        const res = await request(app)
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${token}`)
            .send({ current_password: 'OldPass1!', new_password: '123' });
        expect(res.status).toBe(400);
    });

    test('returns 401 without auth token', async () => {
        const res = await request(app)
            .post('/api/auth/change-password')
            .send({ current_password: 'OldPass1!', new_password: 'NewPass1!' });
        expect(res.status).toBe(401);
    });
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
    test('museum admin can list users in their museum', async () => {
        const token = makeAdminToken(adminUser);
        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('returns 401 without token', async () => {
        const res = await request(app).get('/api/admin/users');
        expect(res.status).toBe(401);
    });

    test('returns 403 for non-admin role', async () => {
        const tech = await createUser(db, {
            name: 'tech1', email: 'tech1@test.com',
            role: 'technician', museum_id: museum.id, password: 'TechPass1!'
        });
        const token = makeAdminToken(tech);
        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });
});

// ─── POST /api/admin/create-staff ─────────────────────────────────────────────

describe('POST /api/admin/create-staff', () => {
    test('museum admin can create a technician', async () => {
        const token = makeAdminToken(adminUser);
        const res = await request(app)
            .post('/api/admin/create-staff')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'newtechnician', email: 'newtech@test.com', role: 'technician', museum_id: museum.id });
        expect(res.status).toBe(201);
        expect(res.body.user.role).toBe('technician');
    });

    test('returns 409 on duplicate name', async () => {
        const token = makeAdminToken(adminUser);
        const res = await request(app)
            .post('/api/admin/create-staff')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'newtechnician', email: 'another@test.com', role: 'technician', museum_id: museum.id });
        expect(res.status).toBe(409);
    });

    test('returns 400 on invalid email format', async () => {
        const token = makeAdminToken(adminUser);
        const res = await request(app)
            .post('/api/admin/create-staff')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'bademail', email: 'not-an-email', role: 'technician', museum_id: museum.id });
        expect(res.status).toBe(400);
    });

    test('museum admin cannot create another museum_admin', async () => {
        const token = makeAdminToken(adminUser);
        const res = await request(app)
            .post('/api/admin/create-staff')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'newadmin2', email: 'newadmin2@test.com', role: 'museum_admin', museum_id: museum.id });
        expect(res.status).toBe(403);
    });
});

// ─── GET /api/auth/visitor/status ─────────────────────────────────────────────

describe('GET /api/auth/visitor/status', () => {
    test('returns active:true for an active visitor', async () => {
        const visitor = await createVisitor(db, { robot_id: robot.id, name: 'StatusVisitor' });
        await lockRobot(db, robot.id, visitor.id, 10);
        const { makeVisitorToken } = require('./helpers/fixtures');
        const token = makeVisitorToken(visitor, robot);

        const res = await request(app)
            .get('/api/auth/visitor/status')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.active).toBe(true);

        await new Promise(r => db.run(
            'UPDATE robots SET locked_until = NULL, current_visitor_id = NULL WHERE id = ?',
            [robot.id], r
        ));
    });
});
