const jwt = require('jsonwebtoken');
const { authMiddleware, adminMiddleware, superAdminMiddleware } = require('../middleware/authMiddleware');
const { visitorMiddleware } = require('../middleware/visitorMiddleware');
const db = require('../database');
const { clearAllTables, createMuseum, createRobot, createVisitor, lockRobot } = require('./helpers/fixtures');

const JWT_SECRET = process.env.JWT_SECRET;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
    return { header: (h) => overrides.header?.(h) ?? null, ...overrides };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
}

const next = jest.fn();

beforeEach(() => next.mockClear());

// ─── authMiddleware ────────────────────────────────────────────────────────────

describe('authMiddleware', () => {
    test('calls next() with valid token', () => {
        const token = jwt.sign({ id: '1', role: 'museum_admin' }, JWT_SECRET, { expiresIn: '1h' });
        const req = mockReq({ header: () => `Bearer ${token}` });
        const res = mockRes();
        authMiddleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toMatchObject({ id: '1', role: 'museum_admin' });
    });

    test('returns 401 with no Authorization header', () => {
        const req = mockReq({ header: () => null });
        const res = mockRes();
        authMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 with malformed Bearer token', () => {
        const req = mockReq({ header: () => 'Bearer invalid.token.here' });
        const res = mockRes();
        authMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('returns 401 with expired token', () => {
        const token = jwt.sign({ id: '1' }, JWT_SECRET, { expiresIn: '-1s' });
        const req = mockReq({ header: () => `Bearer ${token}` });
        const res = mockRes();
        authMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('returns 401 when token signed with wrong secret', () => {
        const token = jwt.sign({ id: '1' }, 'wrong-secret', { expiresIn: '1h' });
        const req = mockReq({ header: () => `Bearer ${token}` });
        const res = mockRes();
        authMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

// ─── adminMiddleware ──────────────────────────────────────────────────────────

describe('adminMiddleware', () => {
    test('passes for museum_admin', () => {
        const req = { user: { role: 'museum_admin' } };
        adminMiddleware(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    test('passes for platform_admin', () => {
        const req = { user: { role: 'platform_admin' } };
        adminMiddleware(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    test('returns 403 for technician', () => {
        const req = { user: { role: 'technician' } };
        const res = mockRes();
        adminMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 for visitor', () => {
        const req = { user: { role: 'visitor' } };
        const res = mockRes();
        adminMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

// ─── superAdminMiddleware ─────────────────────────────────────────────────────

describe('superAdminMiddleware', () => {
    test('passes for platform_admin', () => {
        const req = { user: { role: 'platform_admin' } };
        superAdminMiddleware(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    test('returns 403 for museum_admin', () => {
        const req = { user: { role: 'museum_admin' } };
        const res = mockRes();
        superAdminMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

// ─── visitorMiddleware ────────────────────────────────────────────────────────

describe('visitorMiddleware', () => {
    let museum, robot, visitor;

    beforeAll(async () => {
        await clearAllTables(db);
        museum  = await createMuseum(db, { name: 'MW Museum' });
        robot   = await createRobot(db, { museum_id: museum.id });
        visitor = await createVisitor(db, { robot_id: robot.id, name: 'MW Visitor' });
        await lockRobot(db, robot.id, visitor.id, 10);
    });

    afterAll(done => { db.close(() => done()); });

    test('calls next() for valid active visitor session', done => {
        const req = {
            user: { role: 'visitor', id: visitor.id, robot_id: robot.id }
        };
        const res = mockRes();
        const nextCb = jest.fn(() => done());
        visitorMiddleware(req, res, nextCb);
    });

    test('returns 403 for non-visitor role', () => {
        const req = { user: { role: 'museum_admin', id: 'x', robot_id: robot.id } };
        const res = mockRes();
        visitorMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 400 when no robot_id in token', () => {
        const req = { user: { role: 'visitor', id: visitor.id, robot_id: null } };
        const res = mockRes();
        visitorMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 403 when session lock is expired', done => {
        const expiredLock = new Date(Date.now() - 1000).toISOString();
        db.run(
            'UPDATE robots SET locked_until = ? WHERE id = ?',
            [expiredLock, robot.id],
            () => {
                const req = { user: { role: 'visitor', id: visitor.id, robot_id: robot.id } };
                const res = mockRes();
                visitorMiddleware(req, res, jest.fn());
                setTimeout(() => {
                    expect(res.status).toHaveBeenCalledWith(403);
                    done();
                }, 50);
            }
        );
    });
});
