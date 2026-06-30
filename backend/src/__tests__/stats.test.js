const request = require('supertest');
const app     = require('../server');
const db      = require('../database');
const {
    clearAllTables, createMuseum, createUser, createRobot,
    createVisitor, makeSuperAdminToken, makeAdminToken
} = require('./helpers/fixtures');

jest.mock('../services/rosService', () => ({
    connect:            jest.fn(),
    disconnect:         jest.fn(),
    getConnectionState: jest.fn().mockReturnValue(false),
    move:               jest.fn(),
    sendNavGoal:        jest.fn(),
    on:                 jest.fn(),   // rosService is an EventEmitter (sseService subscribes)
}));


let museum, superAdmin, adminUser, superToken, adminToken;

beforeAll(async () => {
    await clearAllTables(db);

    museum = await createMuseum(db, { name: 'Stats Museum', company: 'StatsCo' });

    superAdmin = await createUser(db, {
        name: 'statssuper', email: 'statssuper@test.com',
        role: 'platform_admin', museum_id: null, password: 'SuperPass1!'
    });
    adminUser = await createUser(db, {
        name: 'statsadmin', email: 'statsadmin@test.com',
        role: 'museum_admin', museum_id: museum.id, password: 'AdminPass1!'
    });

    superToken = makeSuperAdminToken(superAdmin);
    adminToken = makeAdminToken(adminUser);

    // Seed a robot and some visitors so stats are non-trivial
    const robot   = await createRobot(db, { name: 'StatBot', museum_id: museum.id });
    const visitor = await createVisitor(db, { robot_id: robot.id, name: 'StatVisitor' });

    // Mark visitor as ended (so avgSessionTime has data)
    await new Promise(r => db.run(
        "UPDATE visitors SET ended_at = datetime('now', '+5 minutes') WHERE id = ?",
        [visitor.id], r
    ));
});

afterAll(done => { db.close(() => done()); });


describe('GET /api/admin/stats', () => {
    test('platform admin gets global stats with totalMuseums', async () => {
        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${superToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalMuseums');
        expect(res.body).toHaveProperty('totalRobots');
        expect(res.body).toHaveProperty('totalVisitors');
        expect(res.body).toHaveProperty('activeRobots');
        expect(res.body.totalMuseums).toBeGreaterThanOrEqual(1);
    });

    test('museum admin gets museum-scoped stats (no totalMuseums)', async () => {
        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalRobots');
        expect(res.body).toHaveProperty('totalVisitors');
        expect(res.body).not.toHaveProperty('totalMuseums');
    });

    test('returns 401 without auth token', async () => {
        const res = await request(app).get('/api/admin/stats');
        expect(res.status).toBe(401);
    });

    test('museum admin stats are numeric values', async () => {
        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(typeof res.body.totalRobots).toBe('number');
        expect(typeof res.body.totalVisitors).toBe('number');
        expect(typeof res.body.activeRobots).toBe('number');
    });

    test('superadmin stats totalRobots matches seeded data', async () => {
        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${superToken}`);
        expect(res.body.totalRobots).toBeGreaterThanOrEqual(1);
        expect(res.body.totalVisitors).toBeGreaterThanOrEqual(1);
    });
});
