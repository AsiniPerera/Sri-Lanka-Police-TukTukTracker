/**
 * Asgardeo client configuration.
 *
 * The scopes list matters more than it looks. Asgardeo only puts a scope into the
 * access token if the SPA *asks* for it here AND the application is subscribed to
 * the API resource that owns it (Console -> Application -> API Authorization).
 * Ask for nothing but `openid profile` and every API call will come back 403.
 */

export const OIDC_SCOPES = [
  'openid',
  'profile',
  'email',
  'roles',
] as const;

/**
 * Scopes declared on the "TukTuk Tracker API" API resource.
 *
 * Must stay in sync with SCOPES in the API's src/config/constants.js, which is
 * the single source of truth. Asgardeo rejects the whole authorization request
 * if the SPA asks for a scope the application is not subscribed to, so a stale
 * entry here presents as a broken login rather than a missing permission.
 *
 * The console is the staff admin UI, so it requests the full set; which of them
 * a given officer may actually exercise is decided server-side by authorize(...)
 * on the role in their Mongo User record. The scopes bound the *app*, not the
 * officer -- see requireScope(...) in the API's src/middleware/rbac.js.
 *
 * locations:write is deliberately absent: only on-vehicle GPS hardware writes
 * pings, using a locally-issued device token, never this SPA.
 */
export const API_SCOPES = [
  'vehicles:read',
  'vehicles:write',
  'vehicles:delete',
  'drivers:read',
  'drivers:write',
  'drivers:delete',
  'locations:read',
  'live:read',
  'users:read',
  'users:write',
  'geo:write',
] as const;

/**
 * Flip to `true` once the "TukTuk Tracker API" API resource exists in the console
 * AND this application is subscribed to it (Application -> API Authorization).
 *
 * Until then the SPA must not request these: asking for a scope the application
 * is not subscribed to can fail the whole authorization request, which looks like
 * a broken login rather than a misconfigured scope.
 *
 * The OIDC scopes below are enough to sign in and to call the API — route access
 * is enforced by authorize(...) on the Express side, which reads the role from
 * the Mongo User record, not from the token's scopes. Per-route scope checks are
 * the optional second layer described in §3.6 of the integration guide.
 */
export const REQUEST_API_SCOPES = false;

export const asgardeoConfig = {
  clientId: import.meta.env.VITE_ASGARDEO_CLIENT_ID,
  baseUrl: import.meta.env.VITE_ASGARDEO_BASE_URL,

  // Must match an entry in Console -> Application -> Protocol -> Authorized redirect URLs
  // *byte for byte*, trailing slash included. Mismatches surface as `invalid_callback`.
  afterSignInUrl: window.location.origin,
  afterSignOutUrl: window.location.origin,

  scopes: REQUEST_API_SCOPES ? [...OIDC_SCOPES, ...API_SCOPES] : [...OIDC_SCOPES],

  // sessionStorage keeps tokens out of long-lived browser storage: closing the tab
  // ends the session. For a police console that is the behaviour we want.
  storage: 'sessionStorage' as const,
};

/**
 * Name of the Google connection as created in Asgardeo
 * (Console -> Connections -> New Connection -> Google -> "Name" field).
 *
 * Passed as the `fidp` parameter on the authorize request, which sends the user
 * straight to Google instead of showing Asgardeo's provider chooser.
 *
 * Left empty, the Google button is not rendered at all — a button carrying an
 * `fidp` that does not exist in the console fails the authorization request,
 * so showing it before the connection exists would be worse than hiding it.
 * The value must match the connection name exactly, including case.
 */
export const GOOGLE_CONNECTION =
  import.meta.env.VITE_ASGARDEO_GOOGLE_CONNECTION || '';

export const isGoogleLoginEnabled = GOOGLE_CONNECTION.length > 0;

/** True when .env.local has actually been filled in. */
export const isAsgardeoConfigured =
  Boolean(asgardeoConfig.clientId) &&
  asgardeoConfig.clientId !== 'replace-me' &&
  Boolean(asgardeoConfig.baseUrl);

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
