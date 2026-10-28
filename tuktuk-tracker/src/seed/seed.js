/**
 * Seed script — populates a clean database with realistic Sri Lankan demo data.
 *
 * Run:  npm run seed
 *
 * Generates:
 *   - 9 provinces, 25 districts (real Sri Lankan administrative hierarchy)
 *   - 30 police stations (mapped to districts)
 *   - 1 HQ admin + 9 provincial + 9 district + 12 station officers
 *   - 250 registered three-wheelers
 *   - 250 drivers (1 per vehicle, with hardware device IDs)
 *   - 2 weeks of location pings per vehicle (varying density)
 *   - LiveStatus rows with the most recent ping per vehicle
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Province = require('../models/Province');
const District = require('../models/District');
const PoliceStation = require('../models/PoliceStation');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Driver = require('../models/Driver');
const LocationPing = require('../models/LocationPing');
const LiveStatus = require('../models/LiveStatus');

const { ROLES, USER_STATUS, VEHICLE_STATUS } = require('../config/constants');

// ─────────────────────────────────────────────────────────────────
//  STATIC GEOGRAPHIC DATA — the real Sri Lankan administrative layout
// ─────────────────────────────────────────────────────────────────
const PROVINCES = [
  { name: 'Western', code: 'WP', center: { lat: 6.927, lng: 79.861 } },
  { name: 'Central', code: 'CP', center: { lat: 7.290, lng: 80.633 } },
  { name: 'Southern', code: 'SP', center: { lat: 6.053, lng: 80.220 } },
  { name: 'Northern', code: 'NP', center: { lat: 9.661, lng: 80.025 } },
  { name: 'Eastern', code: 'EP', center: { lat: 7.717, lng: 81.700 } },
  { name: 'North Western', code: 'NW', center: { lat: 7.486, lng: 80.362 } },
  { name: 'North Central', code: 'NC', center: { lat: 8.311, lng: 80.403 } },
  { name: 'Uva', code: 'UV', center: { lat: 6.989, lng: 81.055 } },
  { name: 'Sabaragamuwa', code: 'SG', center: { lat: 6.706, lng: 80.384 } },
];

const DISTRICTS = {
  Western: [
    { name: 'Colombo', center: { lat: 6.927, lng: 79.861 } },
    { name: 'Gampaha', center: { lat: 7.092, lng: 80.000 } },
    { name: 'Kalutara', center: { lat: 6.585, lng: 79.961 } },
  ],
  Central: [
    { name: 'Kandy', center: { lat: 7.291, lng: 80.636 } },
    { name: 'Matale', center: { lat: 7.466, lng: 80.623 } },
    { name: 'Nuwara Eliya', center: { lat: 6.949, lng: 80.789 } },
  ],
  Southern: [
    { name: 'Galle', center: { lat: 6.053, lng: 80.221 } },
    { name: 'Matara', center: { lat: 5.949, lng: 80.535 } },
    { name: 'Hambantota', center: { lat: 6.124, lng: 81.101 } },
  ],
  Northern: [
    { name: 'Jaffna', center: { lat: 9.661, lng: 80.025 } },
    { name: 'Kilinochchi', center: { lat: 9.396, lng: 80.398 } },
    { name: 'Mannar', center: { lat: 8.977, lng: 79.904 } },
    { name: 'Vavuniya', center: { lat: 8.751, lng: 80.498 } },
    { name: 'Mullaitivu', center: { lat: 9.267, lng: 80.815 } },
  ],
  Eastern: [
    { name: 'Batticaloa', center: { lat: 7.717, lng: 81.700 } },
    { name: 'Ampara', center: { lat: 7.300, lng: 81.682 } },
    { name: 'Trincomalee', center: { lat: 8.587, lng: 81.215 } },
  ],
  'North Western': [
    { name: 'Kurunegala', center: { lat: 7.486, lng: 80.362 } },
    { name: 'Puttalam', center: { lat: 8.034, lng: 79.829 } },
  ],
  'North Central': [
    { name: 'Anuradhapura', center: { lat: 8.311, lng: 80.403 } },
    { name: 'Polonnaruwa', center: { lat: 7.940, lng: 81.017 } },
  ],
  Uva: [
    { name: 'Badulla', center: { lat: 6.989, lng: 81.055 } },
    { name: 'Monaragala', center: { lat: 6.872, lng: 81.349 } },
  ],
  Sabaragamuwa: [
    { name: 'Ratnapura', center: { lat: 6.706, lng: 80.384 } },
    { name: 'Kegalle', center: { lat: 7.253, lng: 80.346 } },
  ],
};

// District code abbreviations for plates / station codes
const DISTRICT_CODES = {
  Colombo: 'CMB', Gampaha: 'GMP', Kalutara: 'KLT',
  Kandy: 'KND', Matale: 'MTL', 'Nuwara Eliya': 'NEL',
  Galle: 'GAL', Matara: 'MAT', Hambantota: 'HBT',
  Jaffna: 'JFN', Kilinochchi: 'KCH', Mannar: 'MNR', Vavuniya: 'VAV', Mullaitivu: 'MUL',
  Batticaloa: 'BAT', Ampara: 'AMP', Trincomalee: 'TRC',
  Kurunegala: 'KUR', Puttalam: 'PUT',
  Anuradhapura: 'ANR', Polonnaruwa: 'POL',
  Badulla: 'BAD', Monaragala: 'MON',
  Ratnapura: 'RAT', Kegalle: 'KEG',
};

// 30 stations: at least one per district, with extras in major cities
const STATIONS_BY_DISTRICT = {
  Colombo:        ['Colombo Central', 'Maradana', 'Pettah', 'Borella'],
  Gampaha:        ['Gampaha Town', 'Negombo'],
  Kalutara:       ['Kalutara Town'],
  Kandy:          ['Kandy Central', 'Peradeniya'],
  Matale:         ['Matale Town'],
  'Nuwara Eliya': ['Nuwara Eliya Town'],
  Galle:          ['Galle Fort', 'Hikkaduwa'],
  Matara:         ['Matara Town'],
  Hambantota:     ['Hambantota Town'],
  Jaffna:         ['Jaffna Central'],
  Kilinochchi:    ['Kilinochchi Town'],
  Mannar:         ['Mannar Town'],
  Vavuniya:       ['Vavuniya Town'],
  Mullaitivu:     ['Mullaitivu Town'],
  Batticaloa:     ['Batticaloa Central'],
  Ampara:         ['Ampara Town'],
  Trincomalee:    ['Trincomalee Town'],
  Kurunegala:     ['Kurunegala Central'],
  Puttalam:       ['Puttalam Town'],
  Anuradhapura:   ['Anuradhapura Central'],
  Polonnaruwa:    ['Polonnaruwa Town'],
  Badulla:        ['Badulla Town'],
  Monaragala:     ['Monaragala Town'],
  Ratnapura:      ['Ratnapura Town'],
  Kegalle:        ['Kegalle Town'],
};

const SINHALA_FIRST = ['Kamal', 'Nimal', 'Sunil', 'Saman', 'Ruwan', 'Chaminda', 'Tharindu', 'Pradeep', 'Lasantha', 'Asanka', 'Buddhika', 'Mahesh', 'Lahiru', 'Roshan', 'Nuwan', 'Gayan', 'Dinesh', 'Kasun', 'Sampath', 'Janaka'];
const SINHALA_LAST  = ['Perera', 'Silva', 'Fernando', 'De Silva', 'Wijesinghe', 'Gunawardena', 'Rajapaksha', 'Bandara', 'Jayasuriya', 'Senanayake', 'Karunaratne', 'Dissanayake', 'Mendis', 'Wickramasinghe', 'Ratnayake'];
const TAMIL_FIRST   = ['Suresh', 'Ravi', 'Murugan', 'Kumar', 'Vishnu', 'Anand', 'Selvan', 'Pradeep', 'Karthik', 'Sundar'];
const TAMIL_LAST    = ['Subramaniam', 'Kandasamy', 'Rajendran', 'Velauthan', 'Thiagarajah', 'Sivakumar', 'Nadesan'];

// ─────────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const pad = (n, w) => String(n).padStart(w, '0');

const randomName = () => {
  const tamil = Math.random() < 0.25;
  return tamil
    ? `${pick(TAMIL_FIRST)} ${pick(TAMIL_LAST)}`
    : `${pick(SINHALA_FIRST)} ${pick(SINHALA_LAST)}`;
};

const randomNIC = () => {
  // New 12-digit format
  const yyyy = randInt(1970, 2003);
  const day = pad(randInt(1, 365), 3);
  const serial = pad(randInt(0, 99999), 5);
  return `${yyyy}${day}${serial}`;
};

const randomPhone = () => {
  const prefixes = ['70', '71', '72', '74', '75', '76', '77', '78'];
  return `+94${pick(prefixes)}${pad(randInt(0, 9999999), 7)}`;
};

const randomDeviceId = () => {
  const hex = '0123456789ABCDEF';
  let id = 'DEV-';
  for (let i = 0; i < 8; i++) id += hex[randInt(0, 15)];
  return id;
};

// ─────────────────────────────────────────────────────────────────
//  MAIN SEEDER
// ─────────────────────────────────────────────────────────────────
const seed = async () => {
  await connectDB();
  console.log('\n🧹  Wiping existing collections...');

  await Promise.all([
    Province.deleteMany({}),
    District.deleteMany({}),
    PoliceStation.deleteMany({}),
    User.deleteMany({}),
    Vehicle.deleteMany({}),
    Driver.deleteMany({}),
    LocationPing.deleteMany({}),
    LiveStatus.deleteMany({}),
  ]);

  // ── Provinces ─────────────────────────────────────────────────
  console.log('🗺️   Creating provinces...');
  const provinceDocs = await Province.insertMany(
    PROVINCES.map(({ name, code }) => ({ name, code }))
  );
  const provinceMap = new Map(provinceDocs.map((p) => [p.name, p]));
  console.log(`   ✓ ${provinceDocs.length} provinces`);

  // ── Districts ────────────────────────────────────────────────
  console.log('📍  Creating districts...');
  const districtPayload = [];
  for (const provinceName of Object.keys(DISTRICTS)) {
    for (const d of DISTRICTS[provinceName]) {
      districtPayload.push({ name: d.name, province_id: provinceMap.get(provinceName)._id });
    }
  }
  const districtDocs = await District.insertMany(districtPayload);
  const districtMap = new Map(districtDocs.map((d) => [d.name, d]));
  console.log(`   ✓ ${districtDocs.length} districts`);

  // Helper to get center coords for a district
  const districtCenter = (districtName) => {
    for (const provName of Object.keys(DISTRICTS)) {
      const found = DISTRICTS[provName].find((d) => d.name === districtName);
      if (found) return found.center;
    }
    return { lat: 7.873, lng: 80.771 }; // fallback: SL center
  };

  // ── Stations ──────────────────────────────────────────────────
  console.log('🚓  Creating police stations...');
  const stationPayload = [];
  for (const districtName of Object.keys(STATIONS_BY_DISTRICT)) {
    const district = districtMap.get(districtName);
    if (!district) continue;
    const code = DISTRICT_CODES[districtName] || 'XXX';
    STATIONS_BY_DISTRICT[districtName].forEach((stationName, idx) => {
      stationPayload.push({
        district_id: district._id,
        station_name: `${stationName} Police Station`,
        station_code: `${code}-${pad(idx + 1, 2)}`,
        contact_number: `+94${randInt(11, 91)}${pad(randInt(2000000, 9999999), 7)}`,
      });
    });
  }
  const stationDocs = await PoliceStation.insertMany(stationPayload);
  console.log(`   ✓ ${stationDocs.length} police stations`);

  // ── Users ─────────────────────────────────────────────────────
  console.log('👤  Creating users (1 HQ + provincial + district + station officers)...');
  const adminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@1234';
  /**
   * Optional. Set DEFAULT_ADMIN_EMAIL to the email of a user in your Asgardeo
   * organization and that identity links to this HQ admin on its first
   * Asgardeo sign-in (asgardeoAuth.resolveLocalUser matches by email when no
   * asgardeo_sub or username match exists).
   *
   * Seeding it here rather than patching the record afterwards matters for the
   * in-memory dev database, which is recreated on every restart.
   */
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || null;
  /**
   * Optional. The `sub` claim of an Asgardeo user, pinned to the HQ admin.
   *
   * Needed because this tenant's *access* tokens carry only
   * sub/aut/iss/client_id/aud/nbf/azp/org_id/scope/exp/iat/jti -- no `email`
   * and no `username`. resolveLocalUser therefore has nothing to match on
   * except sub, and email linking can never fire.
   *
   * Find the value in the API log after one failed sign-in:
   *   [asgardeo] no local officer matched. ... | sub= <this value>
   *
   * The alternative, and the better fix for a real deployment, is to add Email
   * as a requested attribute in Asgardeo (Console -> Applications -> your app
   * -> User Attributes) so tokens carry `email` and any officer can be linked
   * by email instead of one hardcoded id.
   */
  const adminAsgardeoSub = process.env.DEFAULT_ADMIN_ASGARDEO_SUB || null;

  const createUser = async (data, password) => {
    const u = new User(data);
    u.password = password;
    return u.save();
  };

  await createUser(
    {
      username: adminUsername,
      full_name: 'National HQ Administrator',
      ...(adminEmail ? { email: adminEmail.toLowerCase() } : {}),
      ...(adminAsgardeoSub ? { asgardeo_sub: adminAsgardeoSub } : {}),
      role: ROLES.ADMIN_HQ,
      scope_id: null,
      status: USER_STATUS.ACTIVE,
    },
    adminPassword
  );

  // 1 provincial officer per province
  for (const p of provinceDocs) {
    const username = `prov_${p.name.toLowerCase().replace(/\s+/g, '_')}`;
    await createUser(
      {
        username,
        full_name: `${p.name} Province Officer`,
        role: ROLES.PROVINCIAL_OFFICER,
        scope_id: p._id,
        status: USER_STATUS.ACTIVE,
      },
      'Officer@123'
    );
  }

  // 1 district officer for each of: Colombo, Gampaha, Kalutara, Kandy, Galle, Jaffna, Batticaloa, Anuradhapura, Badulla
  const districtOfficerCities = ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Galle', 'Jaffna', 'Batticaloa', 'Anuradhapura', 'Badulla'];
  for (const dn of districtOfficerCities) {
    const d = districtMap.get(dn);
    if (!d) continue;
    await createUser(
      {
        username: `dist_${dn.toLowerCase().replace(/\s+/g, '_')}`,
        full_name: `${dn} District Officer`,
        role: ROLES.DISTRICT_OFFICER,
        scope_id: d._id,
        status: USER_STATUS.ACTIVE,
      },
      'Officer@123'
    );
  }

  // Station officers for the first 12 stations
  for (let i = 0; i < Math.min(12, stationDocs.length); i++) {
    const s = stationDocs[i];
    const slug = s.station_name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_police_station$/, '');
    await createUser(
      {
        username: `stat_${slug}`,
        full_name: `Station Officer — ${s.station_name}`,
        role: ROLES.STATION_OFFICER,
        scope_id: s._id,
        status: USER_STATUS.ACTIVE,
      },
      'Officer@123'
    );
  }
  const userCount = await User.countDocuments();
  console.log(`   ✓ ${userCount} users (admin + officers)`);

  // ── Vehicles + Drivers ────────────────────────────────────────
  console.log('🛺  Creating 250 vehicles + drivers...');
  const VEHICLE_COUNT = 250;
  const vehicles = [];
  const drivers = [];
  const usedPlates = new Set();

  for (let i = 0; i < VEHICLE_COUNT; i++) {
    // Pick a station weighted toward Colombo / urban areas (first 8 stations)
    const station = Math.random() < 0.5
      ? stationDocs[randInt(0, Math.min(7, stationDocs.length - 1))]
      : stationDocs[randInt(0, stationDocs.length - 1)];

    // Find the district & province for this station to pick the plate prefix
    const district = districtDocs.find((d) => d._id.equals(station.district_id));
    const province = provinceDocs.find((p) => p._id.equals(district.province_id));
    const provCode = province.code;

    // Build a unique-ish plate: WP-CAB-1234
    let plate;
    do {
      plate = `${provCode}-CAB-${pad(randInt(1000, 9999), 4)}`;
    } while (usedPlates.has(plate));
    usedPlates.add(plate);

    // Status: 92% REGISTERED, 4% SUSPENDED, 3% WANTED, 1% DECOMMISSIONED
    const r = Math.random();
    let status = VEHICLE_STATUS.REGISTERED;
    if (r > 0.99) status = VEHICLE_STATUS.DECOMMISSIONED;
    else if (r > 0.96) status = VEHICLE_STATUS.WANTED;
    else if (r > 0.92) status = VEHICLE_STATUS.SUSPENDED;

    vehicles.push({
      license_plate: plate,
      chassis_number: `CHS${pad(i + 1, 6)}${randInt(1000, 9999)}`,
      engine_number: `ENG${pad(i + 1, 6)}${randInt(1000, 9999)}`,
      owner_name: randomName(),
      owner_nic: randomNIC(),
      station_id: station._id,
      status,
    });
  }

  const vehicleDocs = await Vehicle.insertMany(vehicles);
  console.log(`   ✓ ${vehicleDocs.length} vehicles`);

  for (const v of vehicleDocs) {
    drivers.push({
      nic_number: randomNIC(),
      full_name: randomName(),
      phone_number: randomPhone(),
      current_vehicle_id: v._id,
      device_id: randomDeviceId(),
    });
  }
  // Some collisions on NIC are theoretically possible but vanishingly rare
  // for 250 records. We use insertMany with ordered:false to skip duplicates.
  let driverDocs = [];
  try {
    driverDocs = await Driver.insertMany(drivers, { ordered: false });
  } catch (e) {
    driverDocs = await Driver.find({});
  }
  console.log(`   ✓ ${driverDocs.length} drivers`);

  // ── Location pings: 2 weeks of history ────────────────────────
  console.log('📡  Generating 2 weeks of location pings...');
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const PING_INTERVAL_MS = 30 * 60 * 1000; // ping every 30 minutes during active hours
  const now = new Date();
  const startTime = new Date(now.getTime() - TWO_WEEKS_MS);

  const pingsBatch = [];
  const liveStatuses = [];

  for (const vehicle of vehicleDocs) {
    // Skip pings for DECOMMISSIONED vehicles (realistic)
    if (vehicle.status === VEHICLE_STATUS.DECOMMISSIONED) continue;

    const station = stationDocs.find((s) => s._id.equals(vehicle.station_id));
    const district = districtDocs.find((d) => d._id.equals(station.district_id));
    const province = provinceDocs.find((p) => p._id.equals(district.province_id));
    const center = districtCenter(district.name);

    // Each vehicle pings during ~12 active hours per day at 30-min intervals
    // ~24 pings/day × 14 days = ~336 pings per vehicle (but with skips for variation)
    let lastPing = null;

    for (let t = startTime.getTime(); t < now.getTime(); t += PING_INTERVAL_MS) {
      const hour = new Date(t).getUTCHours();
      // Sri Lanka is UTC+5:30; rough activity window: local 06:00-22:00 = UTC 00:30-16:30
      if (hour < 0 || hour > 17) continue;
      // 25% chance to skip a slot (vehicle off, parked, etc.)
      if (Math.random() < 0.25) continue;

      // Drift up to ~5km from district center (~0.045 deg)
      const lat = center.lat + rand(-0.045, 0.045);
      const lng = center.lng + rand(-0.045, 0.045);
      const speed = randInt(0, 60);
      const heading = randInt(0, 359);

      const ping = {
        vehicle_id: vehicle._id,
        latitude: parseFloat(lat.toFixed(6)),
        longitude: parseFloat(lng.toFixed(6)),
        speed,
        heading,
        timestamp: new Date(t),
      };
      pingsBatch.push(ping);
      lastPing = ping;

      // Flush every 5000 docs to keep memory reasonable
      if (pingsBatch.length >= 5000) {
        await LocationPing.insertMany(pingsBatch);
        pingsBatch.length = 0;
      }
    }

    if (lastPing) {
      // Online if last ping within the past 30 minutes (true for ~half of vehicles)
      const isOnline = (now.getTime() - lastPing.timestamp.getTime()) <= 10 * 60 * 1000;
      liveStatuses.push({
        vehicle_id: vehicle._id,
        latitude: lastPing.latitude,
        longitude: lastPing.longitude,
        speed: lastPing.speed,
        heading: lastPing.heading,
        last_updated: lastPing.timestamp,
        current_district_id: district._id,
        current_province_id: province._id,
        is_online: isOnline,
      });
    }
  }

  if (pingsBatch.length) await LocationPing.insertMany(pingsBatch);
  if (liveStatuses.length) await LiveStatus.insertMany(liveStatuses);

  const totalPings = await LocationPing.estimatedDocumentCount();
  const totalLive = await LiveStatus.estimatedDocumentCount();
  console.log(`   ✓ ${totalPings.toLocaleString()} location pings`);
  console.log(`   ✓ ${totalLive} live status snapshots`);

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  ✅  SEED COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  Provinces .......... ${provinceDocs.length}`);
  console.log(`  Districts .......... ${districtDocs.length}`);
  console.log(`  Police stations .... ${stationDocs.length}`);
  console.log(`  Users .............. ${userCount}`);
  console.log(`  Vehicles ........... ${vehicleDocs.length}`);
  console.log(`  Drivers ............ ${driverDocs.length}`);
  console.log(`  Location pings ..... ${totalPings.toLocaleString()}`);
  console.log(`  Live status rows ... ${totalLive}`);
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('\n  🔐  DEMO LOGINS (all passwords visible for the demo)');
  console.log(`     HQ admin       :  ${adminUsername} / ${adminPassword}`);
  if (adminEmail) {
    console.log(`     Asgardeo email :  ${adminEmail} -> ${adminUsername}`);
  }
  if (adminAsgardeoSub) {
    console.log(`     Asgardeo sub   :  ${adminAsgardeoSub} -> ${adminUsername} (ADMIN_HQ)`);
  }
  console.log(`     Provincial     :  prov_western / Officer@123`);
  console.log(`     District       :  dist_colombo / Officer@123`);
  console.log(`     Station        :  stat_colombo_central / Officer@123`);
  console.log('\n  🚀  Now run:  npm start');
  console.log('     Then open http://localhost:5000/  (Swagger UI is the home page)\n');

  await mongoose.connection.close();
  process.exit(0);
};

seed().catch(async (err) => {
  console.error('\n❌  Seed failed:', err);
  try { await mongoose.connection.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
