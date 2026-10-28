/**
 * Unit tests for src/middleware/auth.js  (protect middleware)
 */
const jwt = require('jsonwebtoken');
const { connectTestDB, clearTestDB, closeTestDB } = require('../setup');

// Must set env before loading the app modules
beforeAll(async () => {
  await connectTestDB();
}, 120000);
afterAll(async () => {
  await closeTestDB();
});
afterEach(async () => {
  await clearTestDB();
});

const { protect } = require('../../src/middleware/auth');
const User = require('../../src/models/User');
const { ROLES } = require('../../src/config/constants');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('protect middleware', () => {
  it('returns 401 when no Authorization header', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'MISSING_TOKEN' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  // 'invalid.token.here' does not decode as a JWT at all, so protect() reports
  // the more specific TOKEN_NOT_JWT -- the hint that an Asgardeo application is
  // still issuing opaque access tokens instead of JWTs.
  it('returns 401 TOKEN_NOT_JWT when the bearer token is not a JWT', async () => {
    const req = { headers: { authorization: 'Bearer invalid.token.here' } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TOKEN_NOT_JWT' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  // A well-formed JWT that simply fails signature verification is the generic
  // case, and must still come back as INVALID_TOKEN.
  it('returns 401 INVALID_TOKEN for a well-formed JWT with a bad signature', async () => {
    const forged = jwt.sign({ id: 'abc', role: ROLES.ADMIN_HQ }, 'not-the-real-secret');
    const req = { headers: { authorization: `Bearer ${forged}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INVALID_TOKEN' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.user and calls next for a valid user token', async () => {
    const user = await User.create({
      username: 'testuser',
      full_name: 'Test User',
      role: ROLES.ADMIN_HQ,
      status: 'ACTIVE',
    });

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, scope_id: null },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ role: ROLES.ADMIN_HQ });
  });

  it('returns 401 when the token user no longer exists in the DB', async () => {
    const token = jwt.sign(
      { id: '6648f1234567890123456789', role: ROLES.ADMIN_HQ, scope_id: null },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'USER_NOT_FOUND' })
    );
  });

  it('passes through DEVICE_CLIENT tokens without a DB lookup', async () => {
    const token = jwt.sign(
      {
        id: '6648f1234567890123456789',
        role: ROLES.DEVICE_CLIENT,
        device_id: 'DEV-001',
        vehicle_id: '6648f1234567890123456780',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe(ROLES.DEVICE_CLIENT);
    expect(req.user.device_id).toBe('DEV-001');
  });
});
