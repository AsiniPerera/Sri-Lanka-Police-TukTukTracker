/**
 * Integration tests for /api/v1/provinces
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
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
});

const Province = require('../src/models/Province');
const { ROLES } = require('../src/config/constants');

const adminToken = () =>
  jwt.sign(
    { id: '6648f1234567890123456789', role: ROLES.ADMIN_HQ, scope_id: null },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const authHeader = () => ({ Authorization: `Bearer ${adminToken()}` });

// We need a real user in the DB for protect middleware to find
const User = require('../src/models/User');
const ensureAdmin = async () => {
  const existing = await User.findOne({ username: 'admin_hq_test' });
  if (existing) return existing;
  return User.create({
    _id: new (require('mongoose')).Types.ObjectId('6648f1234567890123456789'),
    username: 'admin_hq_test',
    full_name: 'Admin HQ',
    role: ROLES.ADMIN_HQ,
    status: 'ACTIVE',
  });
};

describe('GET /api/v1/provinces', () => {
  beforeEach(() => ensureAdmin());

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/provinces');
    expect(res.status).toBe(401);
  });

  it('returns an empty paginated list when no provinces exist', async () => {
    const res = await request(app)
      .get('/api/v1/provinces')
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns existing provinces', async () => {
    await Province.create([
      { name: 'Western', code: 'WP' },
      { name: 'Central', code: 'CP' },
    ]);
    const res = await request(app)
      .get('/api/v1/provinces')
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('filters by name (case-insensitive)', async () => {
    await Province.create([
      { name: 'Western', code: 'WP' },
      { name: 'Northern', code: 'NP' },
    ]);
    const res = await request(app)
      .get('/api/v1/provinces?name=western')
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Western');
  });
});

describe('POST /api/v1/provinces', () => {
  beforeEach(() => ensureAdmin());

  it('creates a province successfully', async () => {
    const res = await request(app)
      .post('/api/v1/provinces')
      .set(authHeader())
      .send({ name: 'Southern', code: 'SP' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Southern');
    expect(res.body.data.code).toBe('SP');
  });

  it('returns 400 (validation error) when code is missing', async () => {
    const res = await request(app)
      .post('/api/v1/provinces')
      .set(authHeader())
      .send({ name: 'Missing Code' });
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate province name', async () => {
    await Province.create({ name: 'Western', code: 'WP' });
    const res = await request(app)
      .post('/api/v1/provinces')
      .set(authHeader())
      .send({ name: 'Western', code: 'WW' });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/provinces/:id', () => {
  beforeEach(() => ensureAdmin());

  it('returns a single province by ID', async () => {
    const prov = await Province.create({ name: 'Eastern', code: 'EP' });
    const res = await request(app)
      .get(`/api/v1/provinces/${prov._id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Eastern');
  });

  it('returns 404 for non-existent ID', async () => {
    const res = await request(app)
      .get('/api/v1/provinces/6648f1234567890123456789')
      .set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/provinces/:id', () => {
  beforeEach(() => ensureAdmin());

  it('updates a province', async () => {
    const prov = await Province.create({ name: 'North Western', code: 'NW' });
    const res = await request(app)
      .patch(`/api/v1/provinces/${prov._id}`)
      .set(authHeader())
      .send({ name: 'North-Western' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('North-Western');
  });
});

describe('DELETE /api/v1/provinces/:id', () => {
  beforeEach(() => ensureAdmin());

  it('deletes a province with no child districts', async () => {
    const prov = await Province.create({ name: 'Uva', code: 'UV' });
    const res = await request(app)
      .delete(`/api/v1/provinces/${prov._id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
  });

  it('returns 404 when province does not exist', async () => {
    const res = await request(app)
      .delete('/api/v1/provinces/6648f1234567890123456789')
      .set(authHeader());
    expect(res.status).toBe(404);
  });
});
