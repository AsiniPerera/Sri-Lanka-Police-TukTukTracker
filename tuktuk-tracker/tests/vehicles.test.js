/**
 * Integration tests for /api/v1/vehicles
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

const Vehicle = require('../src/models/Vehicle');
const PoliceStation = require('../src/models/PoliceStation');
const District = require('../src/models/District');
const Province = require('../src/models/Province');
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
    username: 'admin_veh_test',
    full_name: 'Admin Vehicle Test',
    role: ROLES.ADMIN_HQ,
    status: 'ACTIVE',
  });
};

let stationId;
const seedStation = async () => {
  const prov = await Province.create({ name: 'Western', code: 'WP' });
  const dist = await District.create({ name: 'Colombo', code: 'CO', province_id: prov._id });
  const station = await PoliceStation.create({
    station_name: 'Colombo Fort',
    station_code: 'CF01',
    district_id: dist._id,
    contact_number: '0112345678',
  });
  stationId = station._id;
};

const sampleVehicle = (overrides = {}) => ({
  license_plate: 'WP-CAB-1234',
  chassis_number: 'CHASIS1234567890A',
  engine_number: 'ENG1234567890',
  owner_name: 'Saman Kumara',
  owner_nic: '199012345678',
  station_id: stationId,
  ...overrides,
});

describe('GET /api/v1/vehicles', () => {
  beforeEach(async () => {
    await ensureAdmin();
    await seedStation();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/vehicles');
    expect(res.status).toBe(401);
  });

  it('returns empty list when no vehicles', async () => {
    const res = await request(app).get('/api/v1/vehicles').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns created vehicles', async () => {
    await Vehicle.create(sampleVehicle());
    const res = await request(app).get('/api/v1/vehicles').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by license_plate (partial)', async () => {
    await Vehicle.create(sampleVehicle());
    const res = await request(app)
      .get('/api/v1/vehicles?license_plate=CAB')
      .set(authHeader());
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/v1/vehicles', () => {
  beforeEach(async () => {
    await ensureAdmin();
    await seedStation();
  });

  it('creates a vehicle successfully', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set(authHeader())
      .send(sampleVehicle());
    expect(res.status).toBe(201);
    expect(res.body.data.license_plate).toBe('WP-CAB-1234');
  });

  it('returns 400 for invalid license plate', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set(authHeader())
      .send(sampleVehicle({ license_plate: 'BAD-PLATE' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate license plate', async () => {
    await Vehicle.create(sampleVehicle());
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set(authHeader())
      .send(sampleVehicle({ chassis_number: 'CHASSIS2', engine_number: 'ENGINE2' }));
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/vehicles/:id', () => {
  beforeEach(async () => {
    await ensureAdmin();
    await seedStation();
  });

  it('returns a vehicle by ID', async () => {
    const vehicle = await Vehicle.create(sampleVehicle());
    const res = await request(app)
      .get(`/api/v1/vehicles/${vehicle._id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.chassis_number).toBe('CHASIS1234567890A');
  });

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .get('/api/v1/vehicles/6648f1234567890123456789')
      .set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/vehicles/:id', () => {
  beforeEach(async () => {
    await ensureAdmin();
    await seedStation();
  });

  it('updates vehicle owner_name', async () => {
    const vehicle = await Vehicle.create(sampleVehicle());
    const res = await request(app)
      .patch(`/api/v1/vehicles/${vehicle._id}`)
      .set(authHeader())
      .send({ owner_name: 'New Owner' });
    expect(res.status).toBe(200);
    expect(res.body.data.owner_name).toBe('New Owner');
  });
});

describe('DELETE /api/v1/vehicles/:id', () => {
  beforeEach(async () => {
    await ensureAdmin();
    await seedStation();
  });

  it('deletes a vehicle', async () => {
    const vehicle = await Vehicle.create(sampleVehicle());
    const res = await request(app)
      .delete(`/api/v1/vehicles/${vehicle._id}`)
      .set(authHeader());
    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent vehicle', async () => {
    const res = await request(app)
      .delete('/api/v1/vehicles/6648f1234567890123456789')
      .set(authHeader());
    expect(res.status).toBe(404);
  });
});
