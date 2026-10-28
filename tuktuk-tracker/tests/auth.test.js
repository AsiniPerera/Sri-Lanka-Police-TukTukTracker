/**
 * Integration tests for POST /api/v1/auth/login
 * and POST /api/v1/auth/device-token
 */
const request = require('supertest');
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

const User = require('../src/models/User');
const Driver = require('../src/models/Driver');
const { ROLES } = require('../src/config/constants');

const createAdminUser = async (password = 'Password123!') => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(password, 10);
  return User.create({
    username: 'admin_hq',
    full_name: 'HQ Admin',
    role: ROLES.ADMIN_HQ,
    status: 'ACTIVE',
    password_hash: hash,
  });
};

describe('POST /api/v1/auth/login', () => {
  it('returns 400 when credentials are missing', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_CREDENTIALS');
  });

  it('returns 401 for unknown username', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'nobody', password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for wrong password', async () => {
    await createAdminUser('CorrectPass1!');
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin_hq', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('returns 200 and a JWT for valid credentials', async () => {
    await createAdminUser('Password123!');
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin_hq', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.role).toBe(ROLES.ADMIN_HQ);
  });

  it('returns 403 when the user account is inactive', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Password123!', 10);
    await User.create({
      username: 'inactive_user',
      full_name: 'Inactive',
      role: ROLES.STATION_OFFICER,
      status: 'INACTIVE',
      password_hash: hash,
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'inactive_user', password: 'Password123!' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ACCOUNT_INACTIVE');
  });
});

describe('POST /api/v1/auth/device-token', () => {
  it('returns 400 when device_id is missing', async () => {
    const res = await request(app).post('/api/v1/auth/device-token').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_DEVICE_ID');
  });

  it('returns 404 for unknown device_id', async () => {
    const res = await request(app)
      .post('/api/v1/auth/device-token')
      .send({ device_id: 'UNKNOWN-DEV-999' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DEVICE_NOT_FOUND');
  });

  it('returns 400 when device is not linked to a vehicle', async () => {
    await Driver.create({
      nic_number: '199012345678',
      full_name: 'Test Driver',
      phone_number: '0711234567',
      device_id: 'DEV-001',
      current_vehicle_id: null,
    });
    const res = await request(app)
      .post('/api/v1/auth/device-token')
      .send({ device_id: 'DEV-001' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DEVICE_UNASSIGNED');
  });
});
