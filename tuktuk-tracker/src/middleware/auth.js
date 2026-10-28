const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { error } = require('../utils/apiResponse');
const { USER_STATUS, ROLES } = require('../config/constants');
const cfg = require('../config/asgardeo');
const { asgardeoProtect } = require('./asgardeoAuth');

/**
 * Unverified peek at the issuer to route the token to the right verifier.
 *
 * Reading an unverified claim is safe here because it only chooses which
 * verifier runs — both verify the signature before trusting anything.
 */
const looksLikeAsgardeo = (token) => {
  try {
    const decoded = jwt.decode(token, { complete: true });
    return Boolean(decoded) && decoded.payload && decoded.payload.iss === cfg.issuer;
  } catch (err) {
    return false;
  }
};

/**
 * Verify the Bearer token and attach the user (or device claim) to req.user.
 *
 * Dual-mode during the Asgardeo migration:
 *   - RS256 tokens issued by Asgardeo  -> asgardeoProtect (human officers)
 *   - HS256 tokens signed locally      -> device clients and legacy logins
 *
 * Keeping both alive is what makes this a safe migration rather than a flag day.
 */
const protect = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return error(res, 'Authentication token is required', 401, 'MISSING_TOKEN');
    }

    // ----- Asgardeo-issued user token -----
    if (cfg.enabled && looksLikeAsgardeo(token)) {
      return asgardeoProtect(req, res, next, { error });
    }

    // ----- Locally-signed token -----
    let decoded;
    try {
      // Pinned to HS256 so an RS256 token can never be checked against the
      // HMAC secret (algorithm confusion).
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      // The token is not a valid local HS256 token. Before returning a generic
      // failure, work out whether it was meant for the Asgardeo path and only
      // missed because of a configuration mismatch — otherwise this presents as
      // "invalid token" when the real cause is an opaque token or a wrong issuer.
      const peek = jwt.decode(token, { complete: true });

      if (!peek) {
        console.warn('[auth] bearer token is not a JWT (opaque access token?)');
        return error(
          res,
          'Token is not a JWT. If this came from Asgardeo, set the application\'s ' +
            'access token type to JWT (Console -> Application -> Protocol).',
          401,
          'TOKEN_NOT_JWT'
        );
      }

      const iss = peek.payload && peek.payload.iss;
      if (cfg.enabled && iss && iss !== cfg.issuer) {
        console.warn(`[auth] issuer mismatch: token=${iss} expected=${cfg.issuer}`);
        return error(
          res,
          `Token issuer '${iss}' does not match the configured Asgardeo issuer ` +
            `'${cfg.issuer}'. Check ASGARDEO_ORG / ASGARDEO_BASE_URL.`,
          401,
          'ISSUER_MISMATCH'
        );
      }

      return error(res, 'Invalid or expired token', 401, 'INVALID_TOKEN');
    }

    // DEVICE_CLIENT tokens are stateless — no user lookup needed.
    // GPS hardware cannot complete an interactive OIDC flow, so these stay local.
    if (decoded.role === ROLES.DEVICE_CLIENT) {
      req.user = {
        id: decoded.id,
        role: ROLES.DEVICE_CLIENT,
        device_id: decoded.device_id,
        vehicle_id: decoded.vehicle_id,
        auth_source: 'local-device',
      };
      return next();
    }

    // Legacy password login. Set LEGACY_LOGIN_ENABLED=false to retire it once
    // every officer has signed in through Asgardeo at least once.
    if (process.env.LEGACY_LOGIN_ENABLED === 'false') {
      return error(
        res,
        'Password login is retired — sign in via Asgardeo',
        401,
        'LEGACY_DISABLED'
      );
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return error(res, 'User no longer exists', 401, 'USER_NOT_FOUND');
    }
    if (user.status !== USER_STATUS.ACTIVE) {
      return error(res, 'User account is inactive', 403, 'ACCOUNT_INACTIVE');
    }

    req.user = {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      scope_id: user.scope_id ? user.scope_id.toString() : null,
      auth_source: 'local-password',
    };
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { protect };
