const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Driver = require('../models/Driver');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { ROLES, USER_STATUS } = require('../config/constants');

const signUserToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, scope_id: user.scope_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
};

/**
 * POST /auth/login
 * Body: { username, password }
 */
exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return error(res, 'Username and password are required', 400, 'MISSING_CREDENTIALS');
  }

  const user = await User.findOne({ username: username.toLowerCase() }).select('+password_hash');
  if (!user) return error(res, 'Invalid credentials', 401, 'INVALID_CREDENTIALS');
  if (user.status !== USER_STATUS.ACTIVE) {
    return error(res, 'Account is inactive — contact your administrator', 403, 'ACCOUNT_INACTIVE');
  }

  const ok = await user.comparePassword(password);
  if (!ok) return error(res, 'Invalid credentials', 401, 'INVALID_CREDENTIALS');

  user.last_login = new Date();
  await user.save();

  const token = signUserToken(user);

  return success(
    res,
    {
      token,
      expires_in: process.env.JWT_EXPIRES_IN || '12h',
      user: {
        id: user._id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        scope_id: user.scope_id,
      },
    },
    'Login successful'
  );
});

/**
 * POST /auth/device-token
 * Body: { device_id }
 * Issues a long-lived token for a tracking device bound to a vehicle.
 */
exports.issueDeviceToken = asyncHandler(async (req, res) => {
  const { device_id } = req.body;
  if (!device_id) return error(res, 'device_id is required', 400, 'MISSING_DEVICE_ID');

  const driver = await Driver.findOne({ device_id: device_id.toUpperCase() });
  if (!driver) return error(res, 'Unknown device_id', 404, 'DEVICE_NOT_FOUND');
  if (!driver.current_vehicle_id) {
    return error(res, 'Device is not linked to any vehicle', 400, 'DEVICE_UNASSIGNED');
  }

  const token = jwt.sign(
    {
      id: driver._id.toString(),
      role: ROLES.DEVICE_CLIENT,
      device_id: driver.device_id,
      vehicle_id: driver.current_vehicle_id.toString(),
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_DEVICE_EXPIRES_IN || '365d' }
  );

  return success(
    res,
    {
      token,
      expires_in: process.env.JWT_DEVICE_EXPIRES_IN || '365d',
      vehicle_id: driver.current_vehicle_id,
      device_id: driver.device_id,
    },
    'Device token issued'
  );
});

/**
 * GET /auth/me
 */
exports.me = asyncHandler(async (req, res) => {
  if (req.user.role === ROLES.DEVICE_CLIENT) {
    return success(res, req.user, 'Device session');
  }
  const user = await User.findById(req.user.id);
  if (!user) return error(res, 'User not found', 404, 'NOT_FOUND');
  return success(res, user, 'Current user');
});

/**
 * POST /auth/change-password
 * Body: { current_password, new_password }
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return error(res, 'current_password and new_password are required', 400, 'MISSING_FIELDS');
  }
  if (new_password.length < 8) {
    return error(res, 'New password must be at least 8 characters', 400, 'WEAK_PASSWORD');
  }
  const user = await User.findById(req.user.id).select('+password_hash');
  if (!user) return error(res, 'User not found', 404, 'NOT_FOUND');
  const ok = await user.comparePassword(current_password);
  if (!ok) return error(res, 'Current password is incorrect', 401, 'INVALID_CREDENTIALS');
  user.password = new_password;
  await user.save();
  return success(res, {}, 'Password changed successfully');
});
