const Driver = require('../models/Driver');
const Vehicle = require('../models/Vehicle');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated, error } = require('../utils/apiResponse');
const { getPagination, getSort } = require('../utils/pagination');
const { applyVehicleScope } = require('../middleware/rbac');

/**
 * Restrict a Driver query to the caller's geographic scope.
 *
 * A Driver has no station_id of its own -- its only link to the
 * Province -> District -> Station graph is current_vehicle_id -- so scope has
 * to be resolved through Vehicle, the same way locationController does it.
 *
 * Returns false when the caller can see nothing, so the handler can short
 * -circuit instead of issuing a query that matches everything.
 *
 * Unassigned drivers (no current_vehicle_id) sit outside the hierarchy
 * entirely, so only ADMIN_HQ sees them.
 */
const applyDriverScope = async (filter, scope) => {
  if (scope.unrestricted) return true;

  const inScope = await Vehicle.find(applyVehicleScope({}, scope)).select('_id');
  const ids = inScope.map((v) => v._id);
  if (!ids.length) return false;

  // An explicit ?current_vehicle_id must still fall inside the scope.
  if (filter.current_vehicle_id) {
    const wanted = String(filter.current_vehicle_id);
    if (!ids.some((id) => String(id) === wanted)) return false;
  } else {
    filter.current_vehicle_id = { $in: ids };
  }
  return true;
};

/**
 * GET /drivers
 * Filters: full_name, nic_number, phone_number, device_id, current_vehicle_id, assigned, search
 */
exports.list = asyncHandler(async (req, res) => {
  const { full_name, nic_number, phone_number, device_id, current_vehicle_id, assigned, search, sort } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (full_name) filter.full_name = { $regex: full_name, $options: 'i' };
  if (nic_number) filter.nic_number = { $regex: nic_number, $options: 'i' };
  if (phone_number) filter.phone_number = { $regex: phone_number, $options: 'i' };
  if (device_id) filter.device_id = { $regex: device_id, $options: 'i' };
  if (current_vehicle_id) filter.current_vehicle_id = current_vehicle_id;
  if (assigned === 'true') filter.current_vehicle_id = { $ne: null };
  if (assigned === 'false') filter.current_vehicle_id = null;

  // assigned=false means "no vehicle", and a driver with no vehicle has no
  // station, so it is visible to HQ only.
  if (assigned === 'false' && !req.scope.unrestricted) {
    return paginated(res, { data: [], total: 0, page, limit });
  }

  if (search) {
    filter.$or = [
      { full_name: { $regex: search, $options: 'i' } },
      { nic_number: { $regex: search, $options: 'i' } },
      { phone_number: { $regex: search, $options: 'i' } },
      { device_id: { $regex: search, $options: 'i' } },
    ];
  }

  // Scope must be applied AFTER the query filters above, because it needs to
  // validate any caller-supplied current_vehicle_id against the scope.
  const visible = await applyDriverScope(filter, req.scope);
  if (!visible) return paginated(res, { data: [], total: 0, page, limit });

  const [data, total] = await Promise.all([
    Driver.find(filter)
      .populate('current_vehicle_id', 'license_plate status')
      .sort(getSort(sort, { full_name: 1 }))
      .skip(skip)
      .limit(limit),
    Driver.countDocuments(filter),
  ]);
  return paginated(res, { data, total, page, limit });
});

exports.getById = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };
  const visible = await applyDriverScope(filter, req.scope);
  if (!visible) return error(res, 'Driver not found', 404, 'NOT_FOUND');

  const driver = await Driver.findOne(filter).populate(
    'current_vehicle_id',
    'license_plate status'
  );
  // Same 404 whether the driver is absent or merely out of scope -- a
  // distinguishable response would confirm the existence of records the caller
  // is not allowed to see.
  if (!driver) return error(res, 'Driver not found', 404, 'NOT_FOUND');
  return success(res, driver);
});

exports.create = asyncHandler(async (req, res) => {
  const driver = await Driver.create(req.body);
  return created(res, driver, 'Driver created');
});

exports.update = asyncHandler(async (req, res) => {
  const driver = await Driver.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!driver) return error(res, 'Driver not found', 404, 'NOT_FOUND');
  return success(res, driver, 'Driver updated');
});

/** PATCH /drivers/:id/assign-vehicle  Body: { vehicle_id } */
exports.assignVehicle = asyncHandler(async (req, res) => {
  const { vehicle_id } = req.body;
  const driver = await Driver.findByIdAndUpdate(
    req.params.id,
    { current_vehicle_id: vehicle_id || null },
    { new: true }
  );
  if (!driver) return error(res, 'Driver not found', 404, 'NOT_FOUND');
  return success(res, driver, vehicle_id ? 'Vehicle assigned' : 'Vehicle unassigned');
});

exports.remove = asyncHandler(async (req, res) => {
  const driver = await Driver.findByIdAndDelete(req.params.id);
  if (!driver) return error(res, 'Driver not found', 404, 'NOT_FOUND');
  return success(res, {}, 'Driver deleted');
});
