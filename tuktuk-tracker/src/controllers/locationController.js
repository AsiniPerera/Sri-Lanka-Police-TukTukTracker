const LocationPing = require('../models/LocationPing');
const LiveStatus = require('../models/LiveStatus');
const Vehicle = require('../models/Vehicle');
const PoliceStation = require('../models/PoliceStation');
const District = require('../models/District');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated, error } = require('../utils/apiResponse');
const { getPagination, getSort } = require('../utils/pagination');
const { applyVehicleScope } = require('../middleware/rbac');
const { ROLES } = require('../config/constants');


exports.ingestPing = asyncHandler(async (req, res) => {
  const { latitude, longitude, speed = 0, heading = 0, timestamp } = req.body;
  if (latitude === undefined || longitude === undefined) {
    return error(res, 'latitude and longitude are required', 400, 'MISSING_COORDS');
  }
  const vehicleId = req.user.vehicle_id;
  if (!vehicleId) return error(res, 'No vehicle associated with this device', 400, 'NO_VEHICLE');

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) return error(res, 'Vehicle not found', 404, 'NOT_FOUND');

  const ping = await LocationPing.create({
    vehicle_id: vehicleId,
    latitude,
    longitude,
    speed,
    heading,
    timestamp: timestamp ? new Date(timestamp) : new Date(),
    raw_payload: JSON.stringify(req.body),
  });

  // Best-effort: attach district/province via the registered station
  const station = await PoliceStation.findById(vehicle.station_id).select('district_id');
  let district_id = station ? station.district_id : null;
  let province_id = null;
  if (district_id) {
    const d = await District.findById(district_id).select('province_id');
    if (d) province_id = d.province_id;
  }

  await LiveStatus.findOneAndUpdate(
    { vehicle_id: vehicleId },
    {
      vehicle_id: vehicleId,
      last_ping_id: ping._id,
      latitude,
      longitude,
      speed,
      heading,
      last_updated: ping.timestamp,
      current_district_id: district_id,
      current_province_id: province_id,
      is_online: true,
    },
    { upsert: true, new: true }
  );

  return created(res, { id: ping._id, timestamp: ping.timestamp }, 'Ping recorded');
});

/**
 * Build the timestamp/speed half of a ping filter from query params.
 * Shared by list() and history() so the two cannot drift apart.
 */
const applyPingFilters = (filter, { from, to, minSpeed, maxSpeed }) => {
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to) filter.timestamp.$lte = new Date(to);
  }
  if (minSpeed !== undefined) {
    filter.speed = { ...(filter.speed || {}), $gte: Number(minSpeed) };
  }
  if (maxSpeed !== undefined) {
    filter.speed = { ...(filter.speed || {}), $lte: Number(maxSpeed) };
  }
  return filter;
};

/**
 * GET /locations
 * Fleet-wide ping feed, newest first.
 * Filters: vehicle_id, from, to, minSpeed, maxSpeed
 *
 * Scope-enforced: an officer sees only pings from vehicles stationed inside
 * their scope. LocationPing has no station_id of its own, so scope has to be
 * resolved through Vehicle first.
 */
exports.list = asyncHandler(async (req, res) => {
  const { vehicle_id: vehicleId, sort } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  // ADMIN_HQ is unrestricted, so skip the vehicle lookup entirely rather than
  // paying for an $in over every vehicle in the country.
  if (!req.scope.unrestricted) {
    const inScope = await Vehicle.find(applyVehicleScope({}, req.scope)).select('_id');
    const scopedIds = inScope.map((v) => v._id.toString());

    if (!scopedIds.length) return paginated(res, { data: [], total: 0, page, limit });

    // An explicit ?vehicle_id must still fall inside the caller's scope.
    if (vehicleId && !scopedIds.includes(vehicleId)) {
      return error(res, 'Vehicle not found or out of scope', 404, 'NOT_FOUND');
    }
    filter.vehicle_id = vehicleId || { $in: scopedIds };
  } else if (vehicleId) {
    filter.vehicle_id = vehicleId;
  }

  applyPingFilters(filter, req.query);

  const [data, total] = await Promise.all([
    LocationPing.find(filter).sort(getSort(sort, { timestamp: -1 })).skip(skip).limit(limit),
    LocationPing.countDocuments(filter),
  ]);
  return paginated(res, { data, total, page, limit });
});

/**
 * GET /locations/vehicle/:vehicleId
 * Filters: from, to, minSpeed, maxSpeed
 * Returns historical pings for a vehicle (scope-checked).
 */
exports.history = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const { from, to, minSpeed, maxSpeed, sort } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  // Scope check via vehicle
  const vehicleFilter = { _id: vehicleId };
  applyVehicleScope(vehicleFilter, req.scope);
  const vehicle = await Vehicle.findOne(vehicleFilter);
  if (!vehicle) return error(res, 'Vehicle not found or out of scope', 404, 'NOT_FOUND');

  const filter = applyPingFilters({ vehicle_id: vehicleId }, { from, to, minSpeed, maxSpeed });

  const [data, total] = await Promise.all([
    LocationPing.find(filter).sort(getSort(sort, { timestamp: -1 })).skip(skip).limit(limit),
    LocationPing.countDocuments(filter),
  ]);
  return paginated(res, { data, total, page, limit });
});

/**
 * GET /locations/vehicle/:vehicleId/latest
 * Returns the most recent ping (single object).
 */
exports.latest = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const vehicleFilter = { _id: vehicleId };
  applyVehicleScope(vehicleFilter, req.scope);
  const vehicle = await Vehicle.findOne(vehicleFilter);
  if (!vehicle) return error(res, 'Vehicle not found or out of scope', 404, 'NOT_FOUND');

  const ping = await LocationPing.findOne({ vehicle_id: vehicleId }).sort({ timestamp: -1 });
  if (!ping) return error(res, 'No location data available for this vehicle', 404, 'NO_DATA');
  return success(res, ping);
});
