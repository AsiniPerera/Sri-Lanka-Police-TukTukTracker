const jwt = require('jsonwebtoken');
const User = require('../models/User');
const cfg = require('../config/asgardeo');
const { ROLES, ROLE_LIST, USER_STATUS } = require('../config/constants');

/**
 * Asgardeo token verification.
 *
 * Division of responsibility: Asgardeo asserts *who* the user is; the local User
 * record decides *what they may see*, because only MongoDB knows the
 * Province -> District -> Station graph that scope_id points into. The result is
 * that req.user keeps the exact shape it has always had, so rbac.js and every
 * controller are untouched.
 */

let client = null;

/**
 * Lazy in two senses: no network setup at require time, and `jwks-rsa` itself is
 * only loaded when an Asgardeo token actually arrives.
 *
 * The deferred require is load-bearing, not style: jwks-rsa v4 depends on `jose`,
 * which is ESM-only. Requiring it at module top makes every Jest suite that
 * reaches server.js fail with "Cannot use import statement outside a module",
 * because this project's Jest runs CommonJS with no transform.
 */
const getClient = () => {
  if (!client) {
    // eslint-disable-next-line global-require
    const { JwksClient } = require('jwks-rsa');
    client = new JwksClient({
      jwksUri: cfg.jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000, // 10 min — short enough to survive key rotation
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      timeout: 10000,
    });
  }
  return client;
};

const getKey = (header, callback) => {
  getClient().getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
};

/**
 * Verify an Asgardeo-issued JWT.
 * Resolves to the decoded payload, or rejects with the jsonwebtoken error.
 */
const verifyAsgardeoToken = (token) =>
  new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        // Pinned. Without this, jsonwebtoken honours the token's own `alg`
        // header, which is the classic algorithm-confusion vulnerability.
        algorithms: ['RS256'],
        issuer: cfg.issuer,
        ...(cfg.audience.length ? { audience: cfg.audience } : {}),
        clockTolerance: 5,
      },
      (err, payload) => (err ? reject(err) : resolve(payload))
    );
  });

/**
 * Pull a TukTukTracker role out of whichever claim Asgardeo used.
 * DEVICE_CLIENT is never accepted from an IdP — device identity is not a person.
 */
const extractRole = (payload) => {
  for (const claim of cfg.roleClaims) {
    const raw = payload[claim];
    if (!raw) continue;
    const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
    // Asgardeo may prefix with the application name: "TukTuk Tracker/ADMIN_HQ".
    const names = list.map((r) => String(r).split('/').pop().trim());
    const match = names.find((n) => ROLE_LIST.includes(n) && n !== ROLES.DEVICE_CLIENT);
    if (match) return match;
  }
  return null;
};

/**
 * Map an Asgardeo identity onto the local User record that owns role + scope_id.
 * Returns null when no local officer exists — callers must refuse rather than
 * auto-create (see asgardeoProtect).
 */
const resolveLocalUser = async (payload) => {
  const sub = payload.sub;
  const email = (payload.email || '').toLowerCase() || null;
  const username = String(
    payload.username || payload.preferred_username || email || sub
  ).toLowerCase();

  // 1. Already linked — the normal path after first sign-in.
  let user = await User.findOne({ asgardeo_sub: sub });
  if (user) return user;

  // 2. First Asgardeo sign-in for an existing officer: link by username...
  user = await User.findOne({ username });

  // ...then by email, if that is permitted.
  if (!user && email && cfg.allowEmailLinking) {
    user = await User.findOne({ email });
  }

  if (user) {
    user.asgardeo_sub = sub;
    if (email && !user.email) user.email = email;
    await user.save();
  }

  return user;
};

/**
 * Express handler for Asgardeo-issued bearer tokens.
 * `error` is injected so this module does not depend on the response helper.
 */
const asgardeoProtect = async (req, res, next, { error }) => {
  const token = req.headers.authorization.split(' ')[1];

  let payload;
  try {
    payload = await verifyAsgardeoToken(token);
  } catch (err) {
    return error(
      res,
      `Invalid or expired Asgardeo token (${err.message})`,
      401,
      'INVALID_TOKEN'
    );
  }

  let user;
  try {
    user = await resolveLocalUser(payload);
  } catch (err) {
    return next(err);
  }

  if (!user) {
    // Log the identity-bearing claims so an unmatched officer can be diagnosed
    // without guessing. Access tokens often carry fewer claims than ID tokens —
    // notably `email` is frequently absent.
    console.warn(
      '[asgardeo] no local officer matched. claims present:',
      Object.keys(payload).join(','),
      '| sub=', payload.sub,
      '| email=', payload.email,
      '| username=', payload.username,
      '| preferred_username=', payload.preferred_username
    );

    // Authenticated, but unknown here. Auto-creating would leave scope_id null,
    // which resolveScope() turns into "sees nothing" — a silently broken account.
    // An explicit, auditable refusal is the right behaviour for a police system.
    return error(
      res,
      'Your identity is valid but no officer record exists. Contact HQ.',
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    return error(res, 'User account is inactive', 403, 'ACCOUNT_INACTIVE');
  }

  // The local record is authoritative for role and scope. Drift is logged,
  // never silently applied — an IdP role change must not grant data access.
  const idpRole = extractRole(payload);
  if (idpRole && idpRole !== user.role) {
    console.warn(
      `[asgardeo] role drift for ${user.username}: idp=${idpRole} local=${user.role}`
    );
  }

  user.last_login = new Date();
  await user.save();

  req.user = {
    id: user._id.toString(),
    username: user.username,
    role: user.role,
    scope_id: user.scope_id ? user.scope_id.toString() : null,
    auth_source: 'asgardeo',
    sub: payload.sub,
    scopes: String(payload.scope || '').split(' ').filter(Boolean),
  };

  return next();
};

module.exports = {
  verifyAsgardeoToken,
  extractRole,
  resolveLocalUser,
  asgardeoProtect,
};
