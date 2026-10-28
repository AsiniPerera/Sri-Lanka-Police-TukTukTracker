const Province = require('../models/Province');
const District = require('../models/District');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated, error } = require('../utils/apiResponse');
const { getPagination, getSort } = require('../utils/pagination');


exports.list = asyncHandler(async (req, res) => {
  const { name, code, search, sort } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (name) filter.name = { $regex: name, $options: 'i' };
  if (code) filter.code = code.toUpperCase();
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
    ];
  }
  const [data, total] = await Promise.all([
    Province.find(filter).sort(getSort(sort, { name: 1 })).skip(skip).limit(limit),
    Province.countDocuments(filter),
  ]);
  return paginated(res, { data, total, page, limit });
});

exports.getById = asyncHandler(async (req, res) => {
  const province = await Province.findById(req.params.id);
  if (!province) return error(res, 'Province not found', 404, 'NOT_FOUND');
  return success(res, province);
});

exports.create = asyncHandler(async (req, res) => {
  const province = await Province.create(req.body);
  return created(res, province, 'Province created');
});

exports.update = asyncHandler(async (req, res) => {
  const province = await Province.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!province) return error(res, 'Province not found', 404, 'NOT_FOUND');
  return success(res, province, 'Province updated');
});

exports.remove = asyncHandler(async (req, res) => {
  const child = await District.findOne({ province_id: req.params.id });
  if (child) return error(res, 'Cannot delete province with existing districts', 409, 'HAS_CHILDREN');
  const province = await Province.findByIdAndDelete(req.params.id);
  if (!province) return error(res, 'Province not found', 404, 'NOT_FOUND');
  return success(res, {}, 'Province deleted');
});

/** GET /provinces/:id/districts */
exports.listDistricts = asyncHandler(async (req, res) => {
  const districts = await District.find({ province_id: req.params.id }).sort({ name: 1 });
  return success(res, districts);
});
