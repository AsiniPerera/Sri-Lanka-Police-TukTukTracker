const Vehicle = require('../models/Vehicle');
const PoliceStation = require('../models/PoliceStation');
const District = require('../models/District');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated, error } = require('../utils/apiResponse');
const { getPagination, getSort } = require('../utils/pagination');
const { applyVehicleScope } = require('../middleware/rbac');
const { VEHICLE_STATUS } = require('../config/constants');

/**
 * GET /vehicles
 * Filters: license_plate, owner_name, owner_nic, chassis_number, engine_number,
 *          status, station_id, district_id, province_id, search,
 *          createdAfter, createdBefore
 */
exports.list = asyncHandler(async (req, res) => {
  const {
    license_plate, owner_name, owner_nic, chassis_number, engine_number,
    status, station_id, district_id, province_id, search,
    createdAfter, createdBefore, sort,
  } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (license_plate) filter.license_plate = { $regex: license_plate, $options: 'i' };
  if (owner_name) filter.owner_name = { $regex: owner_name, $options: 'i' };
  if (owner_nic) filter.owner_nic = { $regex: owner_nic, $options: 'i' };
  if (chassis_number) filter.chassis_number = { $regex: chassis_number, $options: 'i' };
  if (engine_number) filter.engine_number = { $regex: engine_number, $options: 'i' };
  if (status) filter.status = status;
  if (station_id) filter.station_id = station_id;

  if (district_id) {
    const stations = await PoliceStation.find({ district_id }).select('_id');
    filter.station_id = { $in: stations.map((s) => s._id) };
  }
  if (province_id) {
    const districts = await District.find({ province_id }).select('_id');
    const stations = await PoliceStation.find({ district_id: { $in: districts.map((d) => d._id) } }).select('_id');
    filter.station_id = { $in: stations.map((s) => s._id) };
  }

  if (search) {
    filter.$or = [
      { license_plate: { $regex: search, $options: 'i' } },
      { owner_name: { $regex: search, $options: 'i' } },
      { owner_nic: { $regex: search, $options: 'i' } },
      { chassis_number: { $regex: search, $options: 'i' } },
    ];
  }

  if (createdAfter || createdBefore) {
    filter.createdAt = {};
    if (createdAfter) filter.createdAt.$gte = new Date(createdAfter);
    if (createdBefore) filter.createdAt.$lte = new Date(createdBefore);
  }

  applyVehicleScope(filter, req.scope);

  const [data, total] = await Promise.all([
    Vehicle.find(filter)
      .populate({
        path: 'station_id',
        select: 'station_name station_code district_id',
        populate: { path: 'district_id', select: 'name province_id' },
      })
      .sort(getSort(sort, { createdAt: -1 }))
      .skip(skip)
      .limit(limit),
    Vehicle.countDocuments(filter),
  ]);
  return paginated(res, { data, total, page, limit });
});

exports.getById = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };
  applyVehicleScope(filter, req.scope);
  const vehicle = await Vehicle.findOne(filter).populate({
    path: 'station_id',
    select: 'station_name station_code district_id',
    populate: { path: 'district_id', select: 'name province_id' },
  });
  if (!vehicle) return error(res, 'Vehicle not found or out of scope', 404, 'NOT_FOUND');
  return success(res, vehicle);
});

/** GET /vehicles/by-plate/:plate */
exports.getByPlate = asyncHandler(async (req, res) => {
  const filter = { license_plate: req.params.plate.toUpperCase() };
  applyVehicleScope(filter, req.scope);
  const vehicle = await Vehicle.findOne(filter);
  if (!vehicle) return error(res, 'Vehicle not found or out of scope', 404, 'NOT_FOUND');
  return success(res, vehicle);
});

exports.create = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.create(req.body);
  return created(res, vehicle, 'Vehicle registered');
});

exports.update = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!vehicle) return error(res, 'Vehicle not found', 404, 'NOT_FOUND');
  return success(res, vehicle, 'Vehicle updated');
});

/** PATCH /vehicles/:id/status  Body: { status } */
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!Object.values(VEHICLE_STATUS).includes(status)) {
    return error(res, `Invalid status. Allowed: ${Object.values(VEHICLE_STATUS).join(', ')}`, 400, 'INVALID_STATUS');
  }
  const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!vehicle) return error(res, 'Vehicle not found', 404, 'NOT_FOUND');
  return success(res, vehicle, `Vehicle marked as ${status}`);
});

exports.remove = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
  if (!vehicle) return error(res, 'Vehicle not found', 404, 'NOT_FOUND');
  return success(res, {}, 'Vehicle deleted');
});
