/**
 * Application-wide constants and enums
 */

const ROLES = {
  ADMIN_HQ: 'ADMIN_HQ',
  PROVINCIAL_OFFICER: 'PROVINCIAL_OFFICER',
  DISTRICT_OFFICER: 'DISTRICT_OFFICER',
  STATION_OFFICER: 'STATION_OFFICER',
  DEVICE_CLIENT: 'DEVICE_CLIENT',
};

const ROLE_LIST = Object.values(ROLES);

/**
 * OAuth scopes declared on the "TukTuk Tracker API" API resource in Asgardeo.
 *
 * This is the single source of truth: the Asgardeo console's scope list, the
 * SPA's requested scopes, and the requireScope(...) guards on each route must
 * all agree with this object, or sign-in fails with an opaque OAuth error.
 *
 * Scopes are orthogonal to ROLES. authorize(...) answers "what kind of officer
 * are you?"; scopes answer "what did this client app ask permission to do?".
 * Both must pass -- a compromised read-only dashboard token cannot delete a
 * vehicle even when the officer behind it is ADMIN_HQ.
 */
const SCOPES = {
  VEHICLES_READ: 'vehicles:read',
  VEHICLES_WRITE: 'vehicles:write',
  VEHICLES_DELETE: 'vehicles:delete',
  DRIVERS_READ: 'drivers:read',
  DRIVERS_WRITE: 'drivers:write',
  DRIVERS_DELETE: 'drivers:delete',
  LOCATIONS_READ: 'locations:read',
  LOCATIONS_WRITE: 'locations:write',
  LIVE_READ: 'live:read',
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  GEO_WRITE: 'geo:write',
};

const SCOPE_LIST = Object.values(SCOPES);

const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
};

const VEHICLE_STATUS = {
  REGISTERED: 'REGISTERED',
  SUSPENDED: 'SUSPENDED',
  WANTED: 'WANTED',
  DECOMMISSIONED: 'DECOMMISSIONED',
};

// Sri Lankan license plate regex (e.g. WP-CAB-1234, NB-1234, CAB-1234)
const LICENSE_PLATE_REGEX = /^[A-Z]{2,3}-?[A-Z]{2,3}-?\d{4}$/i;

// Sri Lankan NIC: old (9 digits + V/X) or new (12 digits)
const NIC_REGEX = /^(\d{9}[VvXx]|\d{12})$/;

// Sri Lankan phone (+94 or 0 prefix, 9 digits after)
const PHONE_REGEX = /^(\+94|0)\d{9}$/;

module.exports = {
  ROLES,
  ROLE_LIST,
  SCOPES,
  SCOPE_LIST,
  USER_STATUS,
  VEHICLE_STATUS,
  LICENSE_PLATE_REGEX,
  NIC_REGEX,
  PHONE_REGEX,
};
