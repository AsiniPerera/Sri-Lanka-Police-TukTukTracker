const District = require('../models/District');
const PoliceStation = require('../models/PoliceStation');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated, error } = require('../utils/apiResponse');
const { getPagination, getSort } = require('../utils/pagination');
const { ROLES } = require('../config/constants');


exports.list = asyncHandler(async (req, res) => {
  const { name, province_id, search, sort } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (name) filter.name = { $regex: name, $options: 'i' };
  if (province_id) filter.province_id = province_id;
  if (search) filter.name = { $regex: search, $options: 'i' };

  // Apply scope
  if (!req.scope.unrestricted) {
    if (req.user.role === ROLES.PROVINCIAL_OFFICER) {
      filter.province_id = req.user.scope_id;
    } else if (req.user.role === ROLES.DISTRICT_OFFICER || req.user.role === ROLES.STATION_OFFICER) {
      filter._id = { $in: req.scope.districtIds };
    }
  }

  const [data, total] = await Promise.all([
    District.find(filter).populate('province_id', 'name code').sort(getSort(sort, { name: 1 })).skip(skip).limit(limit),
    District.countDocuments(filter),
  ]);
  return paginated(res, { data, total, page, limit });
});

exports.getById = asyncHandler(async (req, res) => {
  const district = await District.findById(req.params.id).populate('province_id', 'name code');
  if (!district) return error(res, 'District not found', 404, 'NOT_FOUND');
  return success(res, district);
});

exports.create = asyncHandler(async (req, res) => {
  const district = await District.create(req.body);
  return created(res, district, 'District created');
});

exports.update = asyncHandler(async (req, res) => {
  const district = await District.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!district) return error(res, 'District not found', 404, 'NOT_FOUND');
  return success(res, district, 'District updated');
});

exports.remove = asyncHandler(async (req, res) => {
  const child = await PoliceStation.findOne({ district_id: req.params.id });
  if (child) return error(res, 'Cannot delete district with existing stations', 409, 'HAS_CHILDREN');
  const district = await District.findByIdAndDelete(req.params.id);
  if (!district) return error(res, 'District not found', 404, 'NOT_FOUND');
  return success(res, {}, 'District deleted');
});

/** GET /districts/:id/stations */
exports.listStations = asyncHandler(async (req, res) => {
  const stations = await PoliceStation.find({ district_id: req.params.id }).sort({ station_name: 1 });
  return success(res, stations);
});
