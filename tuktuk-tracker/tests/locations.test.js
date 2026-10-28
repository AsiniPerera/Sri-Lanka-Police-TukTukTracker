/**
 * Integration tests for POST /api/v1/locations/ping  (device location ingestion)
 * and GET /api/v1/locations  (history)
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

const ADMIN_ID = '6648f1234567890123456001';

const adminToken = () =>
  jwt.sign(
    { id: ADMIN_ID, role: ROLES.ADMIN_HQ, scope_id: null },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const ensureAdmin = async () => {
  const existing = await User.findById(ADMIN_ID);
  if (existing) return existing;
  return User.create({
    _id: new mongoose.Types.ObjectId(ADMIN_ID),
    username: 'admin_loc_test',
    full_name: 'Admin Loc Test',
    role: ROLES.ADMIN_HQ,
    status: 'ACTIVE',
  });
};

let vehicleId;
const seedVehicle = async () => {
  const prov = await Province.create({ name: 'Southern', code: 'SP' });
  const dist = await District.create({ name: 'Galle', code: 'GL', province_id: prov._id });
  const station = await PoliceStation.create({
    station_name: 'Galle Fort',
    station_code: 'GF01',
    district_id: dist._id,
    contact_number: '0912345678',
  });
  const vehicle = await Vehicle.create({
    license_plate: 'SP-CAB-5678',
    chassis_number: 'CHS0000000000002',
    engine_number: 'ENG0000000002',
    owner_name: 'Ruwan',
    owner_nic: '199011112222',
    station_id: station._id,
  });
  vehicleId = vehicle._id;
};

const deviceToken = () =>
  jwt.sign(
    {
      id: '6648f0000000000000000001',
      role: ROLES.DEVICE_CLIENT,
      device_id: 'DEV-LOC-01',
      vehicle_id: vehicleId ? vehicleId.toString() : '6648f0000000000000000002',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

describe('POST /api/v1/locations/ping', () => {
  beforeEach(async () => {
    await ensureAdmin();
    await seedVehicle();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/v1/locations/ping').send({
      latitude: 6.9271,
      longitude: 79.8612,
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when latitude or longitude is missing', async () => {
    const res = await request(app)
      .post('/api/v1/locations/ping')
      .set({ Authorization: `Bearer ${deviceToken()}` })
      .send({ latitude: 6.9271 }); // missing longitude
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_COORDS');
  });

  it('ingests a ping successfully with a valid device token', async () => {
    const res = await request(app)
      .post('/api/v1/locations/ping')
      .set({ Authorization: `Bearer ${deviceToken()}` })
      .send({ latitude: 6.9271, longitude: 79.8612, speed: 30, heading: 90 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when a non-device token attempts to ping', async () => {
    const res = await request(app)
      .post('/api/v1/locations/ping')
      .set({ Authorization: `Bearer ${adminToken()}` })
      .send({ latitude: 6.9271, longitude: 79.8612 });
    // DEVICE_CLIENT role required — should be forbidden
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/locations', () => {
  beforeEach(async () => {
    await ensureAdmin();
    await seedVehicle();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/locations');
    expect(res.status).toBe(401);
  });

  it('returns empty list when no pings', async () => {
    const res = await request(app)
      .get('/api/v1/locations')
      .set({ Authorization: `Bearer ${adminToken()}` });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
