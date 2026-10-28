/**
 * Integration tests for the Asgardeo authentication path.
 *
 * The one thing that cannot be exercised against the real tenant from CI is a
 * *valid* token: signing one requires Asgardeo's private key. So this suite
 * stands up a local JWKS endpoint that behaves exactly as Asgardeo's does --
 * same discovery shape, same RS256, same `kid` lookup -- and points
 * ASGARDEO_BASE_URL at it. Everything downstream of signature verification is
 * then the real code path: src/middleware/asgardeoAuth.js, the issuer and
 * audience checks, the local-officer resolution, and rbac.js.
 *
 * What this proves, which the live tenant cannot prove without a human at a
 * browser: that a correctly-signed Asgardeo token is accepted, mapped to the
 * right officer, and granted exactly that officer's role and geographic scope.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

// `mock`-prefixed: jest.mock factories are hoisted above the file, so Jest
// only permits them to close over variables whose names start with "mock".
const mockKid = 'test-signing-key-1';
const KID = mockKid;
const CLIENT_ID = 'test-client-id';
const baseUrl = 'https://api.asgardeo.io/t/jest-test-org';
const issuer = `${baseUrl}/oauth2/token`;

// Must precede every require below: src/config/asgardeo.js reads process.env at
// require time, and dotenv does not overwrite variables that are already set,
// so this wins over ASGARDEO_ORG in .env.
process.env.ASGARDEO_BASE_URL = baseUrl;
process.env.ASGARDEO_CLIENT_ID = CLIENT_ID;
process.env.ASGARDEO_ALLOW_EMAIL_LINKING = 'true';
process.env.NODE_ENV = 'test';

// The signing key this suite pretends Asgardeo published.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const mockPublicPem = publicKey.export({ type: 'spki', format: 'pem' });

/**
 * Stub `jwks-rsa`, and only `jwks-rsa`.
 *
 * Not a convenience: jwks-rsa v4 depends on `jose`, which is ESM-only. Node 22
 * loads it fine via require(esm) -- verified against the live tenant, where it
 * fetches the real signing key -- but Jest's CommonJS runtime cannot, and the
 * real middleware surfaces that as
 * "Invalid or expired Asgardeo token (Cannot use import statement outside a module)".
 * So the Asgardeo path is untestable here unless key retrieval is stubbed.
 *
 * Everything downstream stays real: jwt.verify with RS256 pinned, the issuer
 * and audience checks, resolveLocalUser's sub/username/email matching, and all
 * of rbac.js. Only "fetch the public key over HTTP" is replaced -- and that
 * half is covered against the live tenant instead.
 */
jest.mock('jwks-rsa', () => ({
  JwksClient: class {
    getSigningKey(kid, callback) {
      if (kid !== mockKid) return callback(new Error(`Unknown kid: ${kid}`));
      return callback(null, { getPublicKey: () => mockPublicPem });
    }
  },
}));

const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');

let app;

beforeAll(async () => {
  await connectTestDB();
  app = require('../server');
}, 120000);

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
  delete process.env.ASGARDEO_BASE_URL;
  delete process.env.ASGARDEO_CLIENT_ID;
});

const User = require('../src/models/User');
const Province = require('../src/models/Province');
const District = require('../src/models/District');
const PoliceStation = require('../src/models/PoliceStation');
const Vehicle = require('../src/models/Vehicle');
const { ROLES, USER_STATUS } = require('../src/config/constants');

/** Mint a token shaped like one Asgardeo issues for this application. */
const asgardeoToken = (payload = {}, options = {}) =>
  jwt.sign(
    {
      sub: 'a1b2c3d4-0000-0000-0000-000000000001',
      scope: 'openid profile email roles',
      ...payload,
    },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: KID,
      issuer,
      audience: CLIENT_ID,
      expiresIn: '1h',
      ...options,
    }
  );

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe('a validly-signed Asgardeo token', () => {
  it('is accepted and mapped onto the officer with the matching username', async () => {
    await User.create({
      username: 'prov_western',
      full_name: 'Provincial Officer',
      role: ROLES.PROVINCIAL_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(asgardeoToken({ username: 'prov_western' })));

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('prov_western');
    expect(res.body.data.role).toBe(ROLES.PROVINCIAL_OFFICER);
  });

  it('stores asgardeo_sub on first sign-in, so later logins match directly', async () => {
    await User.create({
      username: 'dist_colombo',
      full_name: 'District Officer',
      role: ROLES.DISTRICT_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const sub = 'a1b2c3d4-0000-0000-0000-00000000beef';
    await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(asgardeoToken({ sub, username: 'dist_colombo' })))
      .expect(200);

    const linked = await User.findOne({ username: 'dist_colombo' });
    expect(linked.asgardeo_sub).toBe(sub);

    // Second sign-in matches on sub alone — the username claim is now irrelevant.
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(asgardeoToken({ sub, username: 'something-else-entirely' })));

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('dist_colombo');
  });

  it('links by email when the username does not match', async () => {
    await User.create({
      username: 'stat_borella',
      full_name: 'Station Officer',
      email: 'officer@police.lk',
      role: ROLES.STATION_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(
        bearer(
          asgardeoToken({ username: 'no-such-officer', email: 'officer@police.lk' })
        )
      );

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('stat_borella');
  });
});

describe('the local record stays authoritative', () => {
  // The whole point of the design: Asgardeo says who you are, Mongo says what
  // you may see. A role claim in the token must not grant anything.
  it('ignores a role claim that disagrees with the local record', async () => {
    await User.create({
      username: 'stat_pettah',
      full_name: 'Station Officer',
      role: ROLES.STATION_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(
        bearer(
          asgardeoToken({ username: 'stat_pettah', roles: ['ADMIN_HQ'] })
        )
      );

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe(ROLES.STATION_OFFICER);
  });

  it('refuses to let an IdP role claim escalate into HQ-only routes', async () => {
    await User.create({
      username: 'stat_maradana',
      full_name: 'Station Officer',
      role: ROLES.STATION_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const res = await request(app)
      .get('/api/v1/users')
      .set(
        bearer(
          asgardeoToken({
            username: 'stat_maradana',
            roles: ['TukTuk Tracker/ADMIN_HQ'],
          })
        )
      );

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('applies the officer geographic scope from Mongo, not the token', async () => {
    const province = await Province.create({ name: 'Western', code: 'WP' });
    const district = await District.create({
      name: 'Colombo',
      province_id: province._id,
    });
    const station = await PoliceStation.create({
      station_name: 'Colombo Central',
      station_code: 'CMB-C',
      contact_number: '0112421111',
      district_id: district._id,
    });
    const otherStation = await PoliceStation.create({
      station_name: 'Kandy Central',
      station_code: 'KDY-C',
      contact_number: '0812222222',
      district_id: district._id,
    });

    const mk = (plate, st) =>
      Vehicle.create({
        license_plate: plate,
        chassis_number: `CHS-${plate}`,
        engine_number: `ENG-${plate}`,
        owner_name: 'Owner',
        owner_nic: '199011111111',
        station_id: st._id,
      });
    await mk('WP-CAB-1111', station);
    await mk('WP-CAB-2222', station);
    await mk('CP-CAB-3333', otherStation);

    await User.create({
      username: 'stat_colombo_central',
      full_name: 'Station Officer',
      role: ROLES.STATION_OFFICER,
      status: USER_STATUS.ACTIVE,
      scope_id: station._id,
    });

    const res = await request(app)
      .get('/api/v1/vehicles')
      .set(bearer(asgardeoToken({ username: 'stat_colombo_central' })));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2); // not the third, at the other station
  });
});

describe('tokens that must be refused', () => {
  it('403s a valid identity with no officer record', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(asgardeoToken({ username: 'ghost', email: 'ghost@nowhere.lk' })));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('USER_NOT_PROVISIONED');
  });

  it('403s an officer whose account is inactive', async () => {
    await User.create({
      username: 'retired_officer',
      full_name: 'Retired',
      role: ROLES.DISTRICT_OFFICER,
      status: USER_STATUS.INACTIVE,
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(asgardeoToken({ username: 'retired_officer' })));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ACCOUNT_INACTIVE');
  });

  it('401s a token signed by a key that is not in the JWKS', async () => {
    await User.create({
      username: 'prov_central',
      full_name: 'Provincial Officer',
      role: ROLES.PROVINCIAL_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const { privateKey: rogue } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const forged = jwt.sign({ sub: 'x', username: 'prov_central' }, rogue, {
      algorithm: 'RS256',
      keyid: KID, // our kid resolves to our public key, so the signature fails
      issuer,
      audience: CLIENT_ID,
      expiresIn: '1h',
    });

    const res = await request(app).get('/api/v1/auth/me').set(bearer(forged));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_TOKEN');
  });

  it('401s an expired token', async () => {
    await User.create({
      username: 'prov_southern',
      full_name: 'Provincial Officer',
      role: ROLES.PROVINCIAL_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const expired = asgardeoToken({ username: 'prov_southern' }, { expiresIn: '-1h' });
    const res = await request(app).get('/api/v1/auth/me').set(bearer(expired));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_TOKEN');
  });

  it('401s a token minted for a different audience', async () => {
    await User.create({
      username: 'prov_uva',
      full_name: 'Provincial Officer',
      role: ROLES.PROVINCIAL_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const wrongAud = asgardeoToken(
      { username: 'prov_uva' },
      { audience: 'some-other-application' }
    );
    const res = await request(app).get('/api/v1/auth/me').set(bearer(wrongAud));

    expect(res.status).toBe(401);
  });

  // DEVICE_CLIENT is hardware identity. An IdP must never be able to assert it.
  it('never accepts DEVICE_CLIENT from the IdP', async () => {
    await User.create({
      username: 'stat_negombo',
      full_name: 'Station Officer',
      role: ROLES.STATION_OFFICER,
      status: USER_STATUS.ACTIVE,
    });

    const res = await request(app)
      .post('/api/v1/locations/ping')
      .set(
        bearer(
          asgardeoToken({
            username: 'stat_negombo',
            roles: ['DEVICE_CLIENT'],
          })
        )
      )
      .send({ latitude: 6.9, longitude: 79.8 });

    expect(res.status).toBe(403);
  });
});

describe('the officer record records the sign-in', () => {
  it('updates last_login', async () => {
    const before = new Date(Date.now() - 60_000);
    await User.create({
      username: 'prov_northern',
      full_name: 'Provincial Officer',
      role: ROLES.PROVINCIAL_OFFICER,
      status: USER_STATUS.ACTIVE,
      last_login: before,
    });

    await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(asgardeoToken({ username: 'prov_northern' })))
      .expect(200);

    const after = await User.findOne({ username: 'prov_northern' });
    expect(after.last_login.getTime()).toBeGreaterThan(before.getTime());
  });
});
