/**
 * Asgardeo (OIDC) configuration.
 *
 * Every value is derived from the organization name so there is a single place
 * to change when moving between dev/prod tenants. Verified against
 * https://api.asgardeo.io/t/<org>/oauth2/token/.well-known/openid-configuration
 */

const ORG = process.env.ASGARDEO_ORG;
const BASE =
  process.env.ASGARDEO_BASE_URL || (ORG ? `https://api.asgardeo.io/t/${ORG}` : null);

module.exports = {
  /** When false, `protect` behaves exactly as it did before Asgardeo existed. */
  enabled: Boolean(BASE),

  baseUrl: BASE,
  issuer: BASE ? `${BASE}/oauth2/token` : null,
  jwksUri: BASE ? `${BASE}/oauth2/jwks` : null,

  /**
   * Expected `aud`. Asgardeo puts the API resource identifier here when one is
   * configured; otherwise the token carries the client ID. Accept either so the
   * integration works before the API resource exists.
   */
  audience: [process.env.ASGARDEO_AUDIENCE, process.env.ASGARDEO_CLIENT_ID].filter(
    Boolean
  ),

  clientId: process.env.ASGARDEO_CLIENT_ID,

  /** Asgardeo emits roles under different claims depending on configuration. */
  roleClaims: ['roles', 'groups', 'application_roles'],

  /**
   * Enforce per-route OAuth scopes via requireScope(...) in rbac.js.
   *
   * Must stay false until the "TukTuk Tracker API" API resource exists in the
   * console AND the SPA is subscribed to it (Application -> API Authorization)
   * AND the SPA requests the API scopes (REQUEST_API_SCOPES in the web app's
   * src/auth/config.ts). Turn it on before then and every Asgardeo-authenticated
   * request 403s, because the tokens carry no API scopes to check.
   */
  enforceScopes: process.env.ASGARDEO_ENFORCE_SCOPES === 'true',

  /**
   * Link a federated identity to a local User by email when no asgardeo_sub
   * match exists. Convenient for migration, but it means whoever controls a
   * matching mailbox inherits that officer's role and scope — so it is opt-in.
   */
  allowEmailLinking: process.env.ASGARDEO_ALLOW_EMAIL_LINKING !== 'false',
};
