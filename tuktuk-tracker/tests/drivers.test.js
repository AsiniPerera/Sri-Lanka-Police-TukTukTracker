/**
 * Integration tests for /api/v1/drivers
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
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

const Driver = require('../src/models/Driver');
const User = require('../src/models/User');
const { ROLES } = require('../src/config/constants');

const ADMIN_ID = '6648f1234567890123456789';

const adminToken = () =>
  jwt.sign(
    { id: ADMIN_ID, role: ROLES.ADMIN_HQ, scope_id: null },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const authHeader = () => ({ Authorization: `Bearer ${adminToken()}` });

const ensureAdmin = async () => {
  const existing = await User.findById(ADMIN_ID);
  if (existing) return existing;
  return User.create({
    _id: new mongoose.Types.ObjectId(ADMIN_ID),
    username: 'admin_drv_test',
    full_name: 'Admin Driver Test',
    role: ROLES.ADMIN_HQ,
    status: 'ACTIVE',
  });
};

const sampleDriver = (overrides = {}) => ({
  nic_number: '199012345678',
  full_name: 'Kamal Perera',
  phone_number: '0711234567',
  device_id: 'DEV-001',
  ...overrides,
});

describe('GET /api/v1/drivers', () => {
  beforeEach(() => ensureAdmin());

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/drivers');
    expect(res.status).toBe(401);
  });

  it('returns empty list when no drivers exist', async () => {
    const res = await request(app).get('/api/v1/drivers').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns paginated list of drivers', async () => {
    await Driver.create(sampleDriver());
    const res = await request(app).get('/api/v1/drivers').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by full_name (partial, case-insensitive)', async () => {
    await Driver.create(sampleDriver());
    await Driver.create(sampleDriver({ nic_number: '199099991234', full_name: 'Nimal Silva', device_id: 'DEV-002', phone_number: '0719999999' }));
    const res = await request(app)
      .get('/api/v1/drivers?full_name=kamal')
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].full_name).toBe('Kamal Perera');
  });

  it('filters unassigned drivers (assigned=false)', async () => {
    await Driver.create(sampleDriver());
    const res = await request(app)
      .get('/api/v1/drivers?assigned=false')
      .set(authHeader());
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/v1/drivers', () => {
  beforeEach(() => ensureAdmin());

  it('creates a driver successfully', async () => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set(authHeader())
      .send(sampleDriver());
    expect(res.status).toBe(201);
    expect(res.body.data.full_name).toBe('Kamal Perera');
    expect(res.body.data.device_id).toBe('DEV-001');
  });

  it('returns 400 for invalid NIC format', async () => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set(authHeader())
      .send(sampleDriver({ nic_number: 'BADNIC' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid phone number', async () => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set(authHeader())
      .send(sampleDriver({ phone_number: '12345' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate NIC', async () => {
    await Driver.create(sampleDriver());
    const res = await request(app)
      .post('/api/v1/drivers')
      .set(authHeader())
      .send(sampleDriver({ device_id: 'DEV-999' }));
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/drivers/:id', () => {
  beforeEach(() => ensureAdmin());

  it('returns driver by id', async () => {
    const driver = await Driver.create(sampleDriver());
    const res = await request(app)
      .get(`/api/v1/drivers/${driver._id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.nic_number).toBe('199012345678');
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .get('/api/v1/drivers/6648f1234567890123456789')
      .set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/drivers/:id', () => {
  beforeEach(() => ensureAdmin());

  it('updates driver full_name', async () => {
    const driver = await Driver.create(sampleDriver());
    const res = await request(app)
      .patch(`/api/v1/drivers/${driver._id}`)
      .set(authHeader())
      .send({ full_name: 'Kamal K. Perera' });
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('Kamal K. Perera');
  });
});

describe('DELETE /api/v1/drivers/:id', () => {
  beforeEach(() => ensureAdmin());

  it('deletes a driver', async () => {
    const driver = await Driver.create(sampleDriver());
    const res = await request(app)
      .delete(`/api/v1/drivers/${driver._id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
  });

  it('returns 404 when driver does not exist', async () => {
    const res = await request(app)
      .delete('/api/v1/drivers/6648f1234567890123456789')
      .set(authHeader());
    expect(res.status).toBe(404);
  });
});
