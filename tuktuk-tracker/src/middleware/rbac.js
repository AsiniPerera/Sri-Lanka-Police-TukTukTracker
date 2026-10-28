const { error } = require('../utils/apiResponse');
const { ROLES } = require('../config/constants');
const asgardeoCfg = require('../config/asgardeo');
const District = require('../models/District');
const PoliceStation = require('../models/PoliceStation');

/**
 * Authorize: only the listed roles may pass.
 *   router.get('/x', protect, authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), handler)
 */
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return error(res, 'Unauthenticated', 401, 'UNAUTHENTICATED');
  if (!allowedRoles.includes(req.user.role)) {
    return error(
      res,
      `Role '${req.user.role}' is not permitted to access this resource`,
      403,
      'INSUFFICIENT_PERMISSIONS'
    );
  }
  next();
};

/**
 * Require that an Asgardeo access token carries the given OAuth scope(s).
 *
 * Orthogonal to authorize(...), and applied alongside it:
 *   authorize  -> "is this officer senior enough?"   (role, from MongoDB)
 *   requireScope -> "did this app ask to do this?"   (scope, from the token)
 *
 * Two deliberate pass-throughs:
 *
 *  1. Non-Asgardeo callers. Device tokens and legacy password tokens are issued
 *     by this API, not by an OAuth authorization server, so they have no scopes
 *     at all. Failing them here would break GPS ingestion and the password
 *     fallback; their role check still applies.
 *
 *  2. Enforcement disabled. Until the "TukTuk Tracker API" API resource exists
 *     in the Asgardeo console and the SPA is subscribed to it, Asgardeo issues
 *     tokens with no API scopes -- so enforcing would 403 every officer. The
 *     flag lets this code ship before the console work, then switch on with one
 *     env var. See docs/asgardeo-integration.md s1.2.
 */
const requireScope = (...needed) => (req, res, next) => {
  if (!req.user) return error(res, 'Unauthenticated', 401, 'UNAUTHENTICATED');
  if (!asgardeoCfg.enforceScopes) return next();
  if (req.user.auth_source !== 'asgardeo') return next();

  const have = req.user.scopes || [];
  const missing = needed.filter((s) => !have.includes(s));

  if (missing.length) {
    return error(
      res,
      `Token is missing required scope(s): ${missing.join(', ')}`,
      403,
      'INSUFFICIENT_SCOPE'
    );
  }
  next();
};

/**
 * Resolve the geographic scope of the current user.
 * Sets req.scope = { provinceIds: [...], districtIds: [...], stationIds: [...] }.
 *   - ADMIN_HQ: unrestricted (empty arrays = no filter applied)
 *   - PROVINCIAL_OFFICER: all districts & stations under their province
 *   - DISTRICT_OFFICER: all stations under their district
 *   - STATION_OFFICER: only their station
 */
const resolveScope = async (req, res, next) => {
  try {
    const { role, scope_id } = req.user;
    req.scope = { provinceIds: [], districtIds: [], stationIds: [], unrestricted: false };

    if (role === ROLES.ADMIN_HQ) {
      req.scope.unrestricted = true;
      return next();
    }

    if (role === ROLES.PROVINCIAL_OFFICER) {
      req.scope.provinceIds = [scope_id];
      const districts = await District.find({ province_id: scope_id }).select('_id');
      req.scope.districtIds = districts.map((d) => d._id.toString());
      const stations = await PoliceStation.find({
        district_id: { $in: req.scope.districtIds },
      }).select('_id');
      req.scope.stationIds = stations.map((s) => s._id.toString());
      return next();
    }

    if (role === ROLES.DISTRICT_OFFICER) {
      req.scope.districtIds = [scope_id];
      const district = await District.findById(scope_id).select('province_id');
      if (district) req.scope.provinceIds = [district.province_id.toString()];
      const stations = await PoliceStation.find({ district_id: scope_id }).select('_id');
      req.scope.stationIds = stations.map((s) => s._id.toString());
      return next();
    }

    if (role === ROLES.STATION_OFFICER) {
      req.scope.stationIds = [scope_id];
      const station = await PoliceStation.findById(scope_id).select('district_id');
      if (station) {
        req.scope.districtIds = [station.district_id.toString()];
        const district = await District.findById(station.district_id).select('province_id');
        if (district) req.scope.provinceIds = [district.province_id.toString()];
      }
      return next();
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Apply the current scope to a Mongoose query for vehicles.
 * Mutates `filter` in place to add station_id constraints when not unrestricted.
 */
const applyVehicleScope = (filter, scope) => {
  if (!scope.unrestricted && scope.stationIds.length) {
    filter.station_id = { $in: scope.stationIds };
  } else if (!scope.unrestricted) {
    filter._id = null; // out of scope = no results
  }
  return filter;
};

module.exports = { authorize, requireScope, resolveScope, applyVehicleScope, ROLES };
