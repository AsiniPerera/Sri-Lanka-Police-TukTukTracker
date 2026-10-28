const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated, error } = require('../utils/apiResponse');
const { getPagination, getSort } = require('../utils/pagination');
const { ROLES, ROLE_LIST, USER_STATUS } = require('../config/constants');


exports.list = asyncHandler(async (req, res) => {
  const { username, role, status, scope_id, search, sort } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (username) filter.username = { $regex: username, $options: 'i' };
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (scope_id) filter.scope_id = scope_id;
  if (search) {
    filter.$or = [
      { username: { $regex: search, $options: 'i' } },
      { full_name: { $regex: search, $options: 'i' } },
    ];
  }

  // Scope: provincial officers only see users within their province scope
  if (!req.scope.unrestricted) {
    if (req.user.role === ROLES.PROVINCIAL_OFFICER) {
      filter.scope_id = {
        $in: [req.user.scope_id, ...req.scope.districtIds, ...req.scope.stationIds],
      };
    } else {
      // District / station officers can only view themselves
      filter._id = req.user.id;
    }
  }

  // Never expose other ADMIN_HQ accounts to non-HQ
  if (req.user.role !== ROLES.ADMIN_HQ) {
    filter.role = filter.role || { $ne: ROLES.ADMIN_HQ };
  }

  const [data, total] = await Promise.all([
    User.find(filter).sort(getSort(sort, { username: 1 })).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return paginated(res, { data, total, page, limit });
});

exports.getById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return error(res, 'User not found', 404, 'NOT_FOUND');
  return success(res, user);
});

/**
 * POST /users
 * Body: { username, password, role, scope_id, full_name }
 */
exports.create = asyncHandler(async (req, res) => {
  const { username, password, role, scope_id, full_name, email } = req.body;
  if (!username || !password || !role) {
    return error(res, 'username, password and role are required', 400, 'MISSING_FIELDS');
  }
  if (!ROLE_LIST.includes(role)) {
    return error(res, `Invalid role. Allowed: ${ROLE_LIST.join(', ')}`, 400, 'INVALID_ROLE');
  }
  if (password.length < 8) {
    return error(res, 'Password must be at least 8 characters', 400, 'WEAK_PASSWORD');
  }
  if (role !== ROLES.ADMIN_HQ && !scope_id) {
    return error(res, 'scope_id is required for non-HQ roles', 400, 'MISSING_SCOPE');
  }
  // Provincial officers may only create users within their scope
  if (req.user.role === ROLES.PROVINCIAL_OFFICER) {
    if (role === ROLES.ADMIN_HQ) {
      return error(res, 'Provincial officers cannot create HQ admins', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    const allowed = [req.user.scope_id, ...req.scope.districtIds, ...req.scope.stationIds];
    if (scope_id && !allowed.includes(scope_id)) {
      return error(res, 'Cannot assign user outside your province', 403, 'OUT_OF_SCOPE');
    }
  }

  const user = new User({
    username: username.toLowerCase(),
    full_name,
    // Set at creation so an officer can sign in through Asgardeo straight away.
    ...(email ? { email: email.toLowerCase() } : {}),
    role,
    scope_id: role === ROLES.ADMIN_HQ ? null : scope_id,
    status: USER_STATUS.ACTIVE,
  });
  user.password = password;
  await user.save();
  return created(res, user, 'User created');
});

exports.update = asyncHandler(async (req, res) => {
  // `email` is updatable because it is what Asgardeo email-linking matches on:
  // a seeded officer has no email, so without this there is no way to attach an
  // external identity to an existing record. See asgardeoAuth.resolveLocalUser.
  const updates = (({ full_name, role, scope_id, status, email }) => ({
    full_name,
    role,
    scope_id,
    status,
    email,
  }))(req.body);
  Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

  if (updates.role && !ROLE_LIST.includes(updates.role)) {
    return error(res, 'Invalid role', 400, 'INVALID_ROLE');
  }
  if (updates.status && !Object.values(USER_STATUS).includes(updates.status)) {
    return error(res, 'Invalid status', 400, 'INVALID_STATUS');
  }
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!user) return error(res, 'User not found', 404, 'NOT_FOUND');
  return success(res, user, 'User updated');
});

/** PATCH /users/:id/reset-password  Body: { new_password } */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return error(res, 'new_password must be at least 8 characters', 400, 'WEAK_PASSWORD');
  }
  const user = await User.findById(req.params.id);
  if (!user) return error(res, 'User not found', 404, 'NOT_FOUND');
  user.password = new_password;
  await user.save();
  return success(res, {}, 'Password reset');
});

exports.remove = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return error(res, 'You cannot delete your own account', 400, 'SELF_DELETE_FORBIDDEN');
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return error(res, 'User not found', 404, 'NOT_FOUND');
  return success(res, {}, 'User deleted');
});
