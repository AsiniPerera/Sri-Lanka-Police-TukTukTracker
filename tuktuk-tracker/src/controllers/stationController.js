const PoliceStation = require('../models/PoliceStation');
const Vehicle = require('../models/Vehicle');
const District = require('../models/District');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated, error } = require('../utils/apiResponse');
const { getPagination, getSort } = require('../utils/pagination');
const { ROLES } = require('../config/constants');


exports.list = asyncHandler(async (req, res) => {
  const { station_name, station_code, district_id, province_id, contact_number, search, sort } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (station_name) filter.station_name = { $regex: station_name, $options: 'i' };
  if (station_code) filter.station_code = { $regex: station_code, $options: 'i' };
  if (district_id) filter.district_id = district_id;
  if (contact_number) filter.contact_number = { $regex: contact_number, $options: 'i' };
  if (search) {
    filter.$or = [
      { station_name: { $regex: search, $options: 'i' } },
      { station_code: { $regex: search, $options: 'i' } },
    ];
  }
  // Filter by province via districts
  if (province_id) {
    const districts = await District.find({ province_id }).select('_id');
    filter.district_id = { $in: districts.map((d) => d._id) };
  }

  // Apply user scope
  if (!req.scope.unrestricted) {
    if (req.user.role === ROLES.PROVINCIAL_OFFICER) {
      filter.district_id = { $in: req.scope.districtIds };
    } else if (req.user.role === ROLES.DISTRICT_OFFICER) {
      filter.district_id = req.user.scope_id;
    } else if (req.user.role === ROLES.STATION_OFFICER) {
      filter._id = req.user.scope_id;
    }
  }

  const [data, total] = await Promise.all([
    PoliceStation.find(filter)
      .populate({ path: 'district_id', select: 'name province_id', populate: { path: 'province_id', select: 'name code' } })
      .sort(getSort(sort, { station_name: 1 }))
      .skip(skip)
      .limit(limit),
    PoliceStation.countDocuments(filter),
  ]);
  return paginated(res, { data, total, page, limit });
});

exports.getById = asyncHandler(async (req, res) => {
  const station = await PoliceStation.findById(req.params.id).populate({
    path: 'district_id',
    select: 'name province_id',
    populate: { path: 'province_id', select: 'name code' },
  });
  if (!station) return error(res, 'Station not found', 404, 'NOT_FOUND');
  return success(res, station);
});

exports.create = asyncHandler(async (req, res) => {
  const station = await PoliceStation.create(req.body);
  return created(res, station, 'Police station created');
});

exports.update = asyncHandler(async (req, res) => {
  const station = await PoliceStation.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!station) return error(res, 'Station not found', 404, 'NOT_FOUND');
  return success(res, station, 'Station updated');
});

exports.remove = asyncHandler(async (req, res) => {
  const child = await Vehicle.findOne({ station_id: req.params.id });
  if (child) return error(res, 'Cannot delete station with registered vehicles', 409, 'HAS_CHILDREN');
  const station = await PoliceStation.findByIdAndDelete(req.params.id);
  if (!station) return error(res, 'Station not found', 404, 'NOT_FOUND');
  return success(res, {}, 'Station deleted');
});
