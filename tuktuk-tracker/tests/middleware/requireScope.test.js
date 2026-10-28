/**
 * Unit tests for requireScope(...) in src/middleware/rbac.js
 *
 * requireScope reads its on/off switch from src/config/asgardeo.js, which latches
 * process.env at require time. So each enforcement mode needs its own module
 * registry: set the env var, jest.resetModules(), then require.
 */
const { SCOPES } = require('../../src/config/constants');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

/** Load rbac.js fresh with ASGARDEO_ENFORCE_SCOPES set to `value`. */
const loadRbac = (value) => {
  jest.resetModules();
  if (value === undefined) delete process.env.ASGARDEO_ENFORCE_SCOPES;
  else process.env.ASGARDEO_ENFORCE_SCOPES = value;
  // eslint-disable-next-line global-require
  return require('../../src/middleware/rbac');
};

const asgardeoUser = (scopes) => ({
  id: 'u1',
  username: 'prov_western',
  role: 'PROVINCIAL_OFFICER',
  auth_source: 'asgardeo',
  scopes,
});

const ORIGINAL = process.env.ASGARDEO_ENFORCE_SCOPES;
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.ASGARDEO_ENFORCE_SCOPES;
  else process.env.ASGARDEO_ENFORCE_SCOPES = ORIGINAL;
});

describe('requireScope — enforcement disabled (the shipping default)', () => {
  it('lets an Asgardeo token through even with no scopes at all', () => {
    const { requireScope } = loadRbac('false');
    const req = { user: asgardeoUser([]) };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.VEHICLES_READ)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('is also off when the env var is absent entirely', () => {
    const { requireScope } = loadRbac(undefined);
    const req = { user: asgardeoUser([]) };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.VEHICLES_DELETE)(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireScope — enforcement enabled', () => {
  it('passes a token that carries the required scope', () => {
    const { requireScope } = loadRbac('true');
    const req = { user: asgardeoUser(['vehicles:read', 'live:read']) };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.VEHICLES_READ)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('403s with INSUFFICIENT_SCOPE when the scope is missing', () => {
    const { requireScope } = loadRbac('true');
    const req = { user: asgardeoUser(['vehicles:read']) };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.VEHICLES_DELETE)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INSUFFICIENT_SCOPE' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('names every missing scope in the message, not just the first', () => {
    const { requireScope } = loadRbac('true');
    const req = { user: asgardeoUser([]) };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.USERS_READ, SCOPES.USERS_WRITE)(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('users:read, users:write'),
      })
    );
  });

  it('requires ALL listed scopes, not any one of them', () => {
    const { requireScope } = loadRbac('true');
    const req = { user: asgardeoUser(['users:read']) };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.USERS_READ, SCOPES.USERS_WRITE)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  // This is what keeps GPS ingestion alive once enforcement is switched on:
  // device tokens are issued by this API and have no OAuth scopes to check.
  it('passes DEVICE_CLIENT tokens through — they have no OAuth scopes', () => {
    const { requireScope } = loadRbac('true');
    const req = {
      user: { id: 'd1', role: 'DEVICE_CLIENT', auth_source: 'local-device' },
    };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.LOCATIONS_WRITE)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes legacy password tokens through for the same reason', () => {
    const { requireScope } = loadRbac('true');
    const req = {
      user: { id: 'u2', role: 'ADMIN_HQ', auth_source: 'local-password' },
    };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.VEHICLES_DELETE)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('tolerates an Asgardeo token with no scopes array', () => {
    const { requireScope } = loadRbac('true');
    const req = { user: { id: 'u3', role: 'ADMIN_HQ', auth_source: 'asgardeo' } };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.VEHICLES_READ)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireScope — unauthenticated', () => {
  it('401s when protect() never ran', () => {
    const { requireScope } = loadRbac('true');
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireScope(SCOPES.VEHICLES_READ)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHENTICATED' })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
