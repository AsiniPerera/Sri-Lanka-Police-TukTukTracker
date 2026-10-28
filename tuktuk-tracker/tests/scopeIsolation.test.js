/**
 * Regression tests for two authorization defects found during end-to-end
 * verification of the Asgardeo integration:
 *
 *  1. Read routes carried no authorize(...) call, so a DEVICE_CLIENT token --
 *     issued to on-vehicle GPS hardware, and obtainable from an unauthenticated
 *     endpoint given only a device_id -- could read the vehicle and driver
 *     registries.
 *
 *  2. driverController applied no geographic scope, so a single-station officer
 *     could read every driver in the country: name, NIC, phone and device_id.
 *     Because device_id is all POST /auth/device-token requires, that was also
 *     an escalation path to forging GPS pings for any vehicle.
 *
 * Both are about *who may read what*, so they are asserted end to end through
 * the router rather than against the controllers directly.
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

const Province = require('../src/models/Province');
const District = require('../src/models/District');
const PoliceStation = require('../src/models/PoliceStation');
const Vehicle = require('../src/models/Vehicle');
const Driver = require('../src/models/Driver');
const User = require('../src/models/User');
const { ROLES } = require('../src/config/constants');

const token = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

/**
 * Two stations in different districts, each with a vehicle and a driver, plus an
 * officer at the first station. Enough hierarchy for "in scope" and "out of
 * scope" to be meaningfully different.
 */
const seedTwoStations = async () => {
  const province = await Province.create({ name: 'Western', code: 'WP' });
  const otherProvince = await Province.create({ name: 'Central', code: 'CP' });

  const district = await District.create({
    name: 'Colombo',
    province_id: province._id,
  });
  const otherDistrict = await District.create({
    name: 'Kandy',
    province_id: otherProvince._id,
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
    district_id: otherDistrict._id,
  });

  const mine = await Vehicle.create({
    license_plate: 'WP-CAB-1111',
    chassis_number: 'CHS-1111',
    engine_number: 'ENG-1111',
    owner_name: 'Owner One',
    owner_nic: '199011111111',
    station_id: station._id,
  });
  const theirs = await Vehicle.create({
    license_plate: 'CP-CAB-2222',
    chassis_number: 'CHS-2222',
    engine_number: 'ENG-2222',
    owner_name: 'Owner Two',
    owner_nic: '199022222222',
    station_id: otherStation._id,
  });

  const myDriver = await Driver.create({
    nic_number: '199012345678',
    full_name: 'In Scope Driver',
    phone_number: '0711111111',
    device_id: 'DEV-INSCOPE',
    current_vehicle_id: mine._id,
  });
  const theirDriver = await Driver.create({
    nic_number: '199087654321',
    full_name: 'Out Of Scope Driver',
    phone_number: '0712222222',
    device_id: 'DEV-OUTOFSCOPE',
    current_vehicle_id: theirs._id,
  });

  const stationOfficerId = new mongoose.Types.ObjectId();
  await User.create({
    _id: stationOfficerId,
    username: 'stat_colombo_central',
    full_name: 'Station Officer',
    role: ROLES.STATION_OFFICER,
    status: 'ACTIVE',
    scope_id: station._id,
  });

  const adminId = new mongoose.Types.ObjectId();
  await User.create({
    _id: adminId,
    username: 'admin_scope_test',
    full_name: 'HQ Admin',
    role: ROLES.ADMIN_HQ,
    status: 'ACTIVE',
  });

  return {
    stationToken: token({
      id: stationOfficerId.toString(),
      role: ROLES.STATION_OFFICER,
      scope_id: station._id.toString(),
    }),
    adminToken: token({ id: adminId.toString(), role: ROLES.ADMIN_HQ, scope_id: null }),
    // A device token as issued by POST /auth/device-token.
    deviceToken: token({
      id: myDriver._id.toString(),
      role: ROLES.DEVICE_CLIENT,
      device_id: 'DEV-INSCOPE',
      vehicle_id: mine._id.toString(),
    }),
    myDriver,
    theirDriver,
  };
};

describe('DEVICE_CLIENT tokens cannot read the registries', () => {
  // GPS hardware needs exactly one permission: POST a ping for its own vehicle.
  const registryRoutes = [
    '/api/v1/vehicles',
    '/api/v1/drivers',
    '/api/v1/provinces',
    '/api/v1/districts',
    '/api/v1/stations',
  ];

  it.each(registryRoutes)('refuses a device token on GET %s', async (route) => {
    const { deviceToken } = await seedTwoStations();

    const res = await request(app).get(route).set(bearer(deviceToken));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('still lets a device POST its own location ping', async () => {
    const { deviceToken } = await seedTwoStations();

    const res = await request(app)
      .post('/api/v1/locations/ping')
      .set(bearer(deviceToken))
      .send({ latitude: 6.927079, longitude: 79.861244, speed: 31 });

    expect(res.status).toBe(201);
  });
});

describe('GET /api/v1/drivers is geographically scoped', () => {
  it('shows a station officer only drivers at their own station', async () => {
    const { stationToken } = await seedTwoStations();

    const res = await request(app).get('/api/v1/drivers').set(bearer(stationToken));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].full_name).toBe('In Scope Driver');
  });

  it('shows HQ every driver', async () => {
    const { adminToken } = await seedTwoStations();

    const res = await request(app).get('/api/v1/drivers').set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  // The leak that made the device-token escalation possible.
  it('does not disclose an out-of-scope driver device_id', async () => {
    const { stationToken } = await seedTwoStations();

    const res = await request(app).get('/api/v1/drivers').set(bearer(stationToken));

    const ids = res.body.data.map((d) => d.device_id);
    expect(ids).not.toContain('DEV-OUTOFSCOPE');
  });

  it('cannot be bypassed with an explicit out-of-scope current_vehicle_id', async () => {
    const { stationToken, theirDriver } = await seedTwoStations();

    const res = await request(app)
      .get(`/api/v1/drivers?current_vehicle_id=${theirDriver.current_vehicle_id}`)
      .set(bearer(stationToken));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  // Unassigned drivers have no vehicle, so no station, so no place in the
  // hierarchy -- HQ only.
  it('hides unassigned drivers from a scoped officer', async () => {
    const { stationToken, adminToken } = await seedTwoStations();
    await Driver.create({
      nic_number: '199055555555',
      full_name: 'Unassigned Driver',
      phone_number: '0715555555',
      device_id: 'DEV-UNASSIGNED',
    });

    const scoped = await request(app)
      .get('/api/v1/drivers?assigned=false')
      .set(bearer(stationToken));
    expect(scoped.status).toBe(200);
    expect(scoped.body.total).toBe(0);

    const hq = await request(app)
      .get('/api/v1/drivers?assigned=false')
      .set(bearer(adminToken));
    expect(hq.body.total).toBe(1);
  });
});

describe('GET /api/v1/drivers/:id is geographically scoped', () => {
  it('returns an in-scope driver', async () => {
    const { stationToken, myDriver } = await seedTwoStations();

    const res = await request(app)
      .get(`/api/v1/drivers/${myDriver._id}`)
      .set(bearer(stationToken));

    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('In Scope Driver');
  });

  it('404s on an out-of-scope driver rather than confirming it exists', async () => {
    const { stationToken, theirDriver } = await seedTwoStations();

    const res = await request(app)
      .get(`/api/v1/drivers/${theirDriver._id}`)
      .set(bearer(stationToken));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('lets HQ read the same driver', async () => {
    const { adminToken, theirDriver } = await seedTwoStations();

    const res = await request(app)
      .get(`/api/v1/drivers/${theirDriver._id}`)
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
  });
});
