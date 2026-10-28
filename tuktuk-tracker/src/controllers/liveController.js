const LiveStatus = require('../models/LiveStatus');
const Vehicle = require('../models/Vehicle');
const PoliceStation = require('../models/PoliceStation');
const District = require('../models/District');
const asyncHandler = require('../utils/asyncHandler');
const { success, paginated, error } = require('../utils/apiResponse');
const { getPagination, getSort } = require('../utils/pagination');

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes


exports.list = asyncHandler(async (req, res) => {
  const {
    province_id, district_id, station_id, vehicle_status,
    online, license_plate, minSpeed, maxSpeed, sort,
  } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  // Build the vehicle-side filter so we can scope through stations
  const vehicleFilter = {};
  if (vehicle_status) vehicleFilter.status = vehicle_status;
  if (license_plate) vehicleFilter.license_plate = { $regex: license_plate, $options: 'i' };

  if (station_id) vehicleFilter.station_id = station_id;
  else if (district_id) {
    const stations = await PoliceStation.find({ district_id }).select('_id');
    vehicleFilter.station_id = { $in: stations.map((s) => s._id) };
  } else if (province_id) {
    const districts = await District.find({ province_id }).select('_id');
    const stations = await PoliceStation.find({ district_id: { $in: districts.map((d) => d._id) } }).select('_id');
    vehicleFilter.station_id = { $in: stations.map((s) => s._id) };
  }

  // Apply user scope (overrides query if user is non-HQ)
  if (!req.scope.unrestricted) {
    vehicleFilter.station_id = { $in: req.scope.stationIds };
  }

  const vehicles = await Vehicle.find(vehicleFilter).select('_id license_plate status station_id');
  const vehicleIds = vehicles.map((v) => v._id);
  const vehicleMap = new Map(vehicles.map((v) => [v._id.toString(), v]));

  // LiveStatus filter
  const liveFilter = { vehicle_id: { $in: vehicleIds } };
  if (minSpeed !== undefined) liveFilter.speed = { ...(liveFilter.speed || {}), $gte: Number(minSpeed) };
  if (maxSpeed !== undefined) liveFilter.speed = { ...(liveFilter.speed || {}), $lte: Number(maxSpeed) };

  if (online === 'true') {
    liveFilter.last_updated = { $gte: new Date(Date.now() - ONLINE_THRESHOLD_MS) };
  } else if (online === 'false') {
    liveFilter.last_updated = { $lt: new Date(Date.now() - ONLINE_THRESHOLD_MS) };
  }

  const [statuses, total] = await Promise.all([
    LiveStatus.find(liveFilter)
      .sort(getSort(sort, { last_updated: -1 }))
      .skip(skip)
      .limit(limit),
    LiveStatus.countDocuments(liveFilter),
  ]);

  // Attach vehicle plate for display
  const enriched = statuses.map((s) => {
    const v = vehicleMap.get(s.vehicle_id.toString());
    return {
      ...s.toJSON(),
      license_plate: v ? v.license_plate : null,
      vehicle_status: v ? v.status : null,
      is_online: s.last_updated >= new Date(Date.now() - ONLINE_THRESHOLD_MS),
    };
  });

  return paginated(res, { data: enriched, total, page, limit });
});

/**
 * GET /live/vehicle/:vehicleId
 */
exports.getOne = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  // Scope: ensure the vehicle is visible to user
  const vFilter = { _id: vehicleId };
  if (!req.scope.unrestricted) vFilter.station_id = { $in: req.scope.stationIds };
  const vehicle = await Vehicle.findOne(vFilter);
  if (!vehicle) return error(res, 'Vehicle not found or out of scope', 404, 'NOT_FOUND');

  const status = await LiveStatus.findOne({ vehicle_id: vehicleId });
  if (!status) return error(res, 'No live status available', 404, 'NO_DATA');

  return success(res, {
    ...status.toJSON(),
    license_plate: vehicle.license_plate,
    vehicle_status: vehicle.status,
    is_online: status.last_updated >= new Date(Date.now() - ONLINE_THRESHOLD_MS),
  });
});

/**
 * GET /live/stats
 * Aggregate dashboard counts within the user's scope.
 */
exports.stats = asyncHandler(async (req, res) => {
  const vehicleFilter = {};
  if (!req.scope.unrestricted) vehicleFilter.station_id = { $in: req.scope.stationIds };
  const vehicles = await Vehicle.find(vehicleFilter).select('_id status');
  const totalVehicles = vehicles.length;
  const wantedCount = vehicles.filter((v) => v.status === 'WANTED').length;
  const suspendedCount = vehicles.filter((v) => v.status === 'SUSPENDED').length;
  const ids = vehicles.map((v) => v._id);
  const onlineCount = await LiveStatus.countDocuments({
    vehicle_id: { $in: ids },
    last_updated: { $gte: new Date(Date.now() - ONLINE_THRESHOLD_MS) },
  });
  return success(res, {
    total_vehicles: totalVehicles,
    online_now: onlineCount,
    offline: totalVehicles - onlineCount,
    wanted: wantedCount,
    suspended: suspendedCount,
    online_threshold_minutes: ONLINE_THRESHOLD_MS / 60000,
  });
});
