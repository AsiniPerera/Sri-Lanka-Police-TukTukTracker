# Integrating WSO2 Asgardeo into TukTukTracker

> Working notes + tutorial draft. Target reader: a MERN developer who has an existing
> JWT-authenticated Express API and wants to move user authentication to Asgardeo
> without throwing away their existing role model.

---

## Status — verified 2026-10-28

The integration is **built and working**. Both halves are done: the SPA signs in through
Asgardeo, and the API verifies Asgardeo-issued RS256 tokens against the live JWKS and maps
them onto local officer records. What remains is console configuration, not code.

### Verified against the live tenant (`orgi5zg4`)

| Check | Result |
| --- | --- |
| Discovery document | `issuer` and `jwks_uri` match `src/config/asgardeo.js` exactly |
| JWKS | one RSA/RS256 signing key published |
| SPA registration | client ID resolves to `sp=TukTuk Tracker`; `http://localhost:5173` is an accepted redirect URL |
| PKCE | `S256` offered and echoed through the authorize request |
| Configured authenticator | `BasicAuthenticator:LOCAL` only — **no Google connection yet**, so `VITE_ASGARDEO_GOOGLE_CONNECTION` must stay unset or the button breaks the login |
| Bogus client ID (control) | `invalid_client / application.not.found` |
| Opaque bearer token | 401 `TOKEN_NOT_JWT` |
| JWT from a foreign issuer | 401 `ISSUER_MISMATCH` |
| JWT forged with our `iss` | 401 `INVALID_TOKEN` — rejected at signature verification |
| `alg: none` token | 401 |
| Device (GPS) path | still ingests pings: 201 |
| Legacy password path | still logs in all four officer roles |
| CORS | `http://localhost:5173` allowed; other origins get no `Allow-Origin` header |
| Jest suite | 106 tests, 11 suites, green |

### Remaining console work (needs tenant admin access)

Per-route scope enforcement is **implemented but switched off**, because switching it on
before the console side exists would 403 every officer. Do these in order:

1. **Console → API Resources → New API Resource.** Display name `TukTuk Tracker API`,
   identifier `https://api.tuktuktracker.lk`. Add the scopes exactly as listed in `SCOPES`
   in `src/config/constants.js` — that object is the single source of truth.
2. **Console → Applications → TukTuk Tracker → API Authorization.** Subscribe to that
   resource and authorize those scopes.
3. **`tuktuk-web/src/auth/config.ts`** → set `REQUEST_API_SCOPES = true`, restart Vite.
4. **`.env`** → set `ASGARDEO_AUDIENCE=https://api.tuktuktracker.lk` and
   `ASGARDEO_ENFORCE_SCOPES=true`, restart the API.

Steps 3 and 4 must not come before 1 and 2.

> **Note on step 2, verified by probe.** §4.6 implies that requesting an unsubscribed scope
> fails the authorization request. In this tenant it does not: the authorize endpoint
> returned the same `302 → login.do` whether the request asked for `openid profile email
> roles` alone or with `vehicles:read live:read` added. Asgardeo appears to silently drop
> scopes the application cannot have. The practical consequence is that **you cannot tell
> from the login flow whether step 2 worked** — you have to decode a real access token and
> look at its `scope` claim, as §4.2 describes.

### Roles are still read from MongoDB, not from the token

Worth restating because it is easy to misread the code: `asgardeoAuth.js` extracts a role
from the token only to *log drift*. `req.user.role` always comes from the local `User`
record, so an IdP role change cannot by itself grant data access. Application roles in
Asgardeo are therefore optional for authorization — useful for labelling, not load-bearing.

---

## 0. Read this first: what this codebase actually is

Before any Asgardeo work, four facts about this repository change the plan materially.

### 0.1 There is no React frontend yet

The repo contains exactly one package, `tuktuk-tracker`, and it is a backend-only
Express + Mongoose API. `server.js` mounts Swagger UI at `/` as the home page:

```js
// server.js
app.use('/', swaggerUi.serve);
app.get('/', swaggerUi.setup(swaggerSpec, swaggerUiOptions));
```

There are no React components, no login form, and no registration form to replace.
Step 2 of the integration is therefore **"scaffold a React SPA"**, not "swap out the
existing forms". Nothing is lost — it just means the frontend work is greenfield.

### 0.2 There is no self-registration, and there should not be

The only way a user account comes into existence is an admin creating one:

```js
// src/routes/users.js:90
router.post('/', authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.create);
```

This is a Sri Lanka Police system. Officers are provisioned by HQ or by a provincial
officer; they do not sign themselves up. **Leave Asgardeo self-registration disabled.**
Do not add `<SignUpButton />` to the UI. Officers are invited or created in Asgardeo by an
administrator, exactly as they are today in Mongo.

If you want the blog post to show a self-signup flow, demo it on a throwaway app — do not
turn it on for a law-enforcement tenant.

### 0.3 Device tokens are machine-to-machine and must not go through user login

`POST /api/v1/auth/device-token` issues a **365-day** token to a GPS tracker:

```js
// src/controllers/authController.js
const token = jwt.sign(
  { id: driver._id.toString(), role: ROLES.DEVICE_CLIENT, device_id, vehicle_id },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_DEVICE_EXPIRES_IN || '365d' }
);
```

That token is consumed by the only write path a tracker has:

```js
// src/routes/locations.js:37
router.post('/ping', protect, authorize(ROLES.DEVICE_CLIENT), ctrl.ingestPing);
```

A tuk-tuk's GPS box cannot complete an interactive OIDC login. There is no human at the
keyboard. Two valid options:

| Option | How | Trade-off |
| --- | --- | --- |
| **A. Keep local JWTs for devices** (recommended for now) | Backend verifies *either* an Asgardeo token *or* a locally-signed `DEVICE_CLIENT` token | Minimal change; one extra branch in middleware |
| **B. Asgardeo client credentials per device** | Each device is an M2M app; device calls `/oauth2/token` with `grant_type=client_credentials` | Proper central revocation, but you now provision an Asgardeo app per vehicle and the device must refresh hourly |

This guide implements **Option A** and notes where Option B would slot in. Picking A is
not a cop-out — it is the standard pattern: OIDC for humans, long-lived or
client-credential secrets for fleet hardware.

### 0.4 The real integration problem: `scope_id` is a Mongo ObjectId

This is the part generic Asgardeo tutorials never cover, and it is the most valuable
section of your blog post.

Authorization in this app is **hierarchical and geographic**. `src/middleware/rbac.js`
resolves what a user can see by walking Province → District → Station:

```js
// src/middleware/rbac.js
if (role === ROLES.PROVINCIAL_OFFICER) {
  req.scope.provinceIds = [scope_id];
  const districts = await District.find({ province_id: scope_id }).select('_id');
  req.scope.districtIds = districts.map((d) => d._id.toString());
  // ...
}
```

`scope_id` is a `mongoose.Schema.Types.ObjectId` on the `User` model that points at a
`Province`, `District`, or `PoliceStation` document. Asgardeo knows nothing about these
ObjectIds, and you do **not** want to copy database primary keys into an external IdP's
user attributes — they change when you reseed, and they leak your data model into your
identity provider.

**The fix: Asgardeo owns identity; Mongo keeps owning authorization.**

```
Asgardeo token  ──verify signature──>  sub, email, roles
                                          │
                                          ▼
                             User.findOne({ asgardeo_sub: sub })
                                          │
                                          ▼
                     req.user = { id, role, scope_id }   ← unchanged shape
                                          │
                                          ▼
                        rbac.js resolveScope()  ← zero changes needed
```

Because `req.user` keeps its exact current shape, **`rbac.js`, every controller, and
`applyVehicleScope` need no edits at all.** That is the whole trick. The only file that
really changes is `src/middleware/auth.js`.

One happy accident makes this easy — `password_hash` is already optional:

```js
// src/models/User.js
password_hash: { type: String, required: false, select: false },
```

So a federated user with no local password is already a valid `User` document.

---

## 1. Setting up the Asgardeo application

You need **two** registrations, not one. This is the most common beginner mistake: people
create a single SPA app and then wonder why their API has no `aud` to validate against.

### 1.1 Create the organization

1. Sign up at [asgardeo.io](https://asgardeo.io) and create an organization,
   e.g. `tuktuktracker`.
2. Your endpoints are then all derived from that name:

| Purpose | URL |
| --- | --- |
| Discovery | `https://api.asgardeo.io/t/tuktuktracker/oauth2/token/.well-known/openid-configuration` |
| Issuer (`iss`) | `https://api.asgardeo.io/t/tuktuktracker/oauth2/token` |
| JWKS | `https://api.asgardeo.io/t/tuktuktracker/oauth2/jwks` |
| Authorize | `https://api.asgardeo.io/t/tuktuktracker/oauth2/authorize` |
| UserInfo | `https://api.asgardeo.io/t/tuktuktracker/oauth2/userinfo` |

Always `curl` the discovery document first and copy values from it rather than
hand-assembling URLs:

```bash
curl -s https://api.asgardeo.io/t/tuktuktracker/oauth2/token/.well-known/openid-configuration | jq
```

> **Screenshot 1:** Asgardeo console → Home, showing the organization name and region.

### 1.2 Register the API resource (do this *before* the SPA)

**Console → API Resources → New API Resource.**

- **Display name:** `TukTuk Tracker API`
- **Identifier:** `https://api.tuktuktracker.lk` — this becomes the `aud` claim of your
  access tokens. It is an identifier, not a URL that gets called; it does not have to
  resolve.
- **Scopes** — model these on the actual route permissions in `src/routes/`:

| Scope | Grants |
| --- | --- |
| `vehicles:read` | `GET /vehicles`, `/vehicles/:id`, `/vehicles/by-plate/:plate` |
| `vehicles:write` | `POST/PUT /vehicles`, `PATCH /vehicles/:id/status` |
| `vehicles:delete` | `DELETE /vehicles/:id` |
| `drivers:read` / `drivers:write` / `drivers:delete` | `src/routes/drivers.js` |
| `locations:read` | location history endpoints |
| `live:read` | `GET /live`, `/live/stats`, `/live/vehicle/:id` |
| `users:read` / `users:write` | `src/routes/users.js` |
| `geo:write` | province / district / station mutations |

> **Screenshot 2:** The API resource with its identifier and the scope list.

Why scopes *and* the existing roles? The `authorize(...)` middleware answers *"what kind of
officer are you?"*; scopes answer *"what did this particular client app ask permission to
do?"*. Keep both — defence in depth. A compromised read-only dashboard token still cannot
delete a vehicle even if the officer behind it is `ADMIN_HQ`.

### 1.3 Register the SPA

**Console → Applications → New Application → Single-Page Application.**

| Setting | Value | Why it matters |
| --- | --- | --- |
| Name | `TukTuk Tracker Console` | |
| Authorized redirect URLs | `http://localhost:5173`, plus your prod origin | Must match **exactly**, including trailing slash. The #1 cause of `invalid_callback`. |
| Allowed origins | `http://localhost:5173` | This is Asgardeo's CORS allowlist. Omit it and the token request fails in the browser with an opaque CORS error. |
| Allowed grant types | **Code** only | Enable PKCE. Do **not** enable Implicit (deprecated, leaks tokens in the URL) or Password. |
| Public client | **Yes** | An SPA cannot keep a secret. There is no client secret to put in your React code — if a tutorial tells you to paste one, it is wrong. |
| Access token type | **JWT** | Required so your Express backend can validate it offline against JWKS. If you pick Opaque you are forced into a network `/oauth2/introspect` call on every request. |

Then:

- **Protocol tab → Access token → Audience:** add `https://api.tuktuktracker.lk`.
  Without this your tokens carry only the client ID as `aud` and your API has nothing
  app-specific to validate.
- **API Authorization tab:** subscribe this app to `TukTuk Tracker API` and select the
  scopes it may request.
- **User Attributes tab:** add `email`, `given_name`, `family_name`, **`roles`**, and
  **`groups`**. If `roles` is not added here it will not appear in the token and your
  role mapping will silently fall back to the lowest privilege.
- **Sign-in Method:** username & password, plus TOTP as a second factor. For a police
  system, enforcing MFA is the single highest-value thing Asgardeo buys you over the
  current bcrypt login — and it costs you zero lines of code.

> **Screenshot 3:** SPA protocol settings — grant types, public client, JWT token type.
> **Screenshot 4:** API Authorization tab with scopes subscribed.
> **Screenshot 5:** User Attributes tab with `roles` enabled.

### 1.4 Create application roles that mirror `ROLES`

**Application → Roles → New Role.** Create one per value in `src/config/constants.js`:

```js
const ROLES = {
  ADMIN_HQ: 'ADMIN_HQ',
  PROVINCIAL_OFFICER: 'PROVINCIAL_OFFICER',
  DISTRICT_OFFICER: 'DISTRICT_OFFICER',
  STATION_OFFICER: 'STATION_OFFICER',
  DEVICE_CLIENT: 'DEVICE_CLIENT',   // ← do NOT create this one in Asgardeo
};
```

Use the **exact same strings**. Matching names mean your mapping layer is a no-op lookup
instead of a translation table you have to maintain in two places.

Attach scopes to each role so Asgardeo enforces the coarse split, e.g.
`DISTRICT_OFFICER` and `STATION_OFFICER` get only `*:read` scopes — which matches the
README's note that those two roles are read-only.

> **Screenshot 6:** The five application roles with their permission assignments.

---

## 2. The React frontend

### 2.1 Scaffold it

From the repo root (keeping the API untouched as a sibling):

```bash
npm create vite@latest tuktuk-web -- --template react-ts
cd tuktuk-web
npm install
npm install @asgardeo/react
npm install react-router-dom maplibre-gl react-map-gl
```

Two SDKs exist and the docs for them are easy to confuse:

| Package | Style | Use when |
| --- | --- | --- |
| `@asgardeo/react` | Component-first: `<SignInButton />`, `<SignedIn />`, `useAsgardeo()` | **New projects — use this** |
| `@asgardeo/auth-react` (v5.x) | Older hook-first: `useAuthContext()` | Existing apps already on it |

This guide uses `@asgardeo/react`.

### 2.2 Environment

`tuktuk-web/.env.local` — note Vite only exposes vars prefixed `VITE_`:

```dotenv
VITE_ASGARDEO_CLIENT_ID=<client id from the console>
VITE_ASGARDEO_BASE_URL=https://api.asgardeo.io/t/tuktuktracker
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_API_AUDIENCE=https://api.tuktuktracker.lk
```

There is deliberately no client secret here. Commit `.env.example`, never `.env.local`.

### 2.3 Wrap the app

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AsgardeoProvider } from '@asgardeo/react';
import App from './App';

const scopes = [
  'openid', 'profile', 'email', 'roles',
  'vehicles:read', 'vehicles:write',
  'drivers:read', 'locations:read', 'live:read',
  'users:read',
];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AsgardeoProvider
      clientId={import.meta.env.VITE_ASGARDEO_CLIENT_ID}
      baseUrl={import.meta.env.VITE_ASGARDEO_BASE_URL}
      afterSignInUrl={window.location.origin}
      afterSignOutUrl={window.location.origin}
      scopes={scopes}
    >
      <App />
    </AsgardeoProvider>
  </React.StrictMode>
);
```

Two things to get right:

- **Request your API scopes at sign-in.** If you only ask for `openid profile`, the
  returned access token has no `vehicles:read` and every API call 403s. This confuses
  people for hours.
- **`afterSignInUrl` must be one of the Authorized redirect URLs** from §1.3, byte for byte.

### 2.4 Sign in, sign out, gate content

Replace what would have been a `<LoginForm />`:

```tsx
// src/App.tsx
import { SignedIn, SignedOut, SignInButton, SignOutButton, Loading, useAsgardeo } from '@asgardeo/react';
import TrackerMap from './TrackerMap';

export default function App() {
  const { user } = useAsgardeo();

  return (
    <>
      <Loading><p>Checking your session…</p></Loading>

      <SignedOut>
        <main className="login">
          <h1>TukTuk Tracker</h1>
          <p>Sri Lanka Police — authorised personnel only.</p>
          <SignInButton>Sign in with Asgardeo</SignInButton>
        </main>
      </SignedOut>

      <SignedIn>
        <header>
          <span>{user?.username}</span>
          <SignOutButton>Sign out</SignOutButton>
        </header>
        <TrackerMap />
      </SignedIn>
    </>
  );
}
```

Note what disappeared: no password state, no `onSubmit`, no `localStorage.setItem('token', …)`,
no "invalid credentials" handling, no password-reset screen. Asgardeo's hosted page owns
all of it, which also means **credentials never touch your React bundle** — a genuine
security improvement over the current `POST /auth/login` flow, not just a refactor.

### 2.5 Calling the API with the token

Get the token from the SDK on each call rather than caching it yourself — the SDK handles
silent refresh, and a token you stashed in a module variable will be stale.

```ts
// src/api/client.ts
import { useAsgardeo } from '@asgardeo/react';
import { useCallback } from 'react';

export function useApi() {
  const { getAccessToken } = useAsgardeo();

  return useCallback(async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await getAccessToken();

    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || `${res.status} ${res.statusText}`);
    }
    return body.data as T;   // matches src/utils/apiResponse.js
  }, [getAccessToken]);
}
```

The `body.data` unwrap is deliberate — it matches the existing envelope shape produced by
`src/utils/apiResponse.js`, so the API contract does not change at all.

Usage against the live-tracking endpoint:

```tsx
// src/TrackerMap.tsx
const api = useApi();
const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);

useEffect(() => {
  const tick = () => api<LiveVehicle[]>('/live').then(setVehicles).catch(console.error);
  tick();
  const id = setInterval(tick, 5000);
  return () => clearInterval(id);
}, [api]);
```

### 2.6 Loosen CORS on the API

`server.js` currently has `app.use(cors({ origin: '*' }))`. A wildcard origin is
incompatible with credentialed requests and is too open for production anyway:

```js
// server.js
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  credentials: true,
}));
```

---

## 3. Verifying Asgardeo access tokens in Express

### 3.1 Install

```bash
npm install jwks-rsa
```

`jsonwebtoken` is already a dependency, so `jwks-rsa` is the only addition. `jwks-rsa`
fetches Asgardeo's public signing keys, caches them, and rate-limits refetches — so
validation is a local signature check with no network hop per request.

### 3.2 Add the mapping field to the User model

```js
// src/models/User.js — add inside the schema
asgardeo_sub: {
  type: String,
  default: null,
  unique: true,
  sparse: true,   // sparse: many legacy users have null; unique would otherwise collide
  index: true,
},
email: {
  type: String,
  lowercase: true,
  trim: true,
  default: null,
},
```

`sparse: true` is essential. Without it, the second user with `asgardeo_sub: null` fails
the unique index.

### 3.3 Create `src/config/asgardeo.js`

```js
const ORG = process.env.ASGARDEO_ORG;
const BASE = process.env.ASGARDEO_BASE_URL || `https://api.asgardeo.io/t/${ORG}`;

module.exports = {
  enabled: Boolean(ORG || process.env.ASGARDEO_BASE_URL),
  baseUrl: BASE,
  issuer: `${BASE}/oauth2/token`,
  jwksUri: `${BASE}/oauth2/jwks`,
  audience: process.env.ASGARDEO_AUDIENCE,       // https://api.tuktuktracker.lk
  clientId: process.env.ASGARDEO_CLIENT_ID,
  // Asgardeo puts roles under different claims depending on config; check both.
  roleClaims: ['roles', 'groups', 'application_roles'],
};
```

### 3.4 Create `src/middleware/asgardeoAuth.js`

```js
const jwt = require('jsonwebtoken');
const { JwksClient } = require('jwks-rsa');
const User = require('../models/User');
const cfg = require('../config/asgardeo');
const { ROLES, ROLE_LIST, USER_STATUS } = require('../config/constants');

const client = cfg.enabled
  ? new JwksClient({
      jwksUri: cfg.jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000,   // 10 min
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    })
  : null;

const getKey = (header, callback) => {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
};

/** Verify an Asgardeo-issued JWT. Resolves to the decoded payload or rejects. */
const verifyAsgardeoToken = (token) =>
  new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],          // pin it — never trust the token's own alg
        issuer: cfg.issuer,
        audience: cfg.audience || cfg.clientId,
        clockTolerance: 5,
      },
      (err, payload) => (err ? reject(err) : resolve(payload))
    );
  });

/** Pull a TukTukTracker role out of whichever claim Asgardeo used. */
const extractRole = (payload) => {
  for (const claim of cfg.roleClaims) {
    const raw = payload[claim];
    if (!raw) continue;
    const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
    // Asgardeo may prefix with the app name, e.g. "TukTuk Tracker Console/ADMIN_HQ"
    const names = list.map((r) => String(r).split('/').pop().trim());
    const match = names.find((n) => ROLE_LIST.includes(n) && n !== ROLES.DEVICE_CLIENT);
    if (match) return match;
  }
  return null;
};

/**
 * Map an Asgardeo identity onto the local User record that owns scope_id.
 * Identity lives in Asgardeo; authorization scope stays in Mongo.
 */
const resolveLocalUser = async (payload) => {
  const sub = payload.sub;
  const email = (payload.email || '').toLowerCase() || null;
  const username = (payload.username || payload.preferred_username || email || sub).toLowerCase();

  // 1. Already linked.
  let user = await User.findOne({ asgardeo_sub: sub });

  // 2. First Asgardeo login for a pre-existing officer — link by username, then email.
  if (!user) {
    user = await User.findOne({ username });
    if (!user && email) user = await User.findOne({ email });
    if (user) {
      user.asgardeo_sub = sub;
      if (email && !user.email) user.email = email;
      await user.save();
    }
  }

  return { user, sub, email, username };
};

const asgardeoProtect = async (req, res, next, { error }) => {
  const token = req.headers.authorization.split(' ')[1];

  let payload;
  try {
    payload = await verifyAsgardeoToken(token);
  } catch (err) {
    return error(res, 'Invalid or expired Asgardeo token', 401, 'INVALID_TOKEN');
  }

  const { user } = await resolveLocalUser(payload);

  if (!user) {
    // Authenticated by Asgardeo, but unknown to this system.
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

  // Local record is the source of truth for role + scope.
  // If Asgardeo disagrees about the role, log the drift rather than silently applying it.
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
    scopes: (payload.scope || '').split(' ').filter(Boolean),
  };
  next();
};

module.exports = { verifyAsgardeoToken, extractRole, resolveLocalUser, asgardeoProtect };
```

Three design calls worth explaining in the blog post:

1. **`algorithms: ['RS256']` is pinned.** Omit it and `jsonwebtoken` will honour the
   token's own `alg` header — the classic algorithm-confusion vulnerability.
2. **Just-in-time provisioning is refused.** Auto-creating an officer on first login would
   be convenient, but a new `User` has `scope_id: null`, which `resolveScope()` turns into
   an empty scope — a silently broken account. For a police system an explicit
   `USER_NOT_PROVISIONED` error is the correct, auditable behaviour.
3. **The local record wins on role and scope.** Asgardeo asserts *who you are*; Mongo
   decides *what you may see*, because only Mongo knows the Province/District/Station
   graph. Drift is logged, not silently applied.

### 3.5 Make `protect` accept both token types

This is the whole change to `src/middleware/auth.js`. The device path and the legacy
password path keep working, so nothing breaks while you migrate.

```js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { error } = require('../utils/apiResponse');
const { USER_STATUS, ROLES } = require('../config/constants');
const cfg = require('../config/asgardeo');
const { asgardeoProtect } = require('./asgardeoAuth');

/** Unverified peek at the issuer so we can route to the right verifier. */
const looksLikeAsgardeo = (token) => {
  try {
    const decoded = jwt.decode(token, { complete: true });
    return decoded?.payload?.iss === cfg.issuer;
  } catch {
    return false;
  }
};

const protect = async (req, res, next) => {
  try {
    let token = null;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return error(res, 'Authentication token is required', 401, 'MISSING_TOKEN');
    }

    // --- Asgardeo-issued user token ---
    if (cfg.enabled && looksLikeAsgardeo(token)) {
      return asgardeoProtect(req, res, next, { error });
    }

    // --- Locally-signed token: devices, and legacy password logins ---
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return error(res, 'Invalid or expired token', 401, 'INVALID_TOKEN');
    }

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

    // Legacy human login. Refuse once LEGACY_LOGIN_ENABLED is turned off.
    if (process.env.LEGACY_LOGIN_ENABLED === 'false') {
      return error(res, 'Password login is retired — sign in via Asgardeo', 401, 'LEGACY_DISABLED');
    }

    const user = await User.findById(decoded.id);
    if (!user) return error(res, 'User no longer exists', 401, 'USER_NOT_FOUND');
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
```

`algorithms: ['HS256']` is added on the local branch too, so an attacker cannot present an
RS256 token and have it checked against your HMAC secret.

### 3.6 Enforce scopes per route — implemented, switched off

> **Status.** This is no longer a suggestion: `requireScope(...)` is implemented in
> `src/middleware/rbac.js` and wired onto every route. It is gated behind
> `ASGARDEO_ENFORCE_SCOPES`, which defaults to `false` until the API resource exists in
> the console (see **Status** at the top of this document). The scope names live in
> `SCOPES` in `src/config/constants.js`, which the console, the SPA and the route guards
> must all agree with.
>
> Two pass-throughs are deliberate, and both are covered by
> `tests/middleware/requireScope.test.js`: device and legacy tokens are not
> OAuth-issued and carry no scopes, so failing them would break GPS ingestion and the
> password fallback; and with enforcement off, the guard is a no-op.

A second, orthogonal check alongside `authorize(...)`:

```js
// src/middleware/rbac.js — add and export
const requireScope = (...needed) => (req, res, next) => {
  // Device and legacy tokens have no OAuth scopes; role checks still apply to them.
  if (req.user.auth_source !== 'asgardeo') return next();
  const have = req.user.scopes || [];
  const missing = needed.filter((s) => !have.includes(s));
  if (missing.length) {
    return error(res, `Token is missing scope(s): ${missing.join(', ')}`, 403, 'INSUFFICIENT_SCOPE');
  }
  next();
};
```

```js
// src/routes/vehicles.js
router.delete('/:id', requireScope('vehicles:delete'), authorize(ROLES.ADMIN_HQ), ctrl.remove);
```

### 3.7 Retire the password endpoints (last, not first)

Once the SPA is live and officers are linked, in `src/routes/auth.js`:

- Delete `POST /login` and `POST /change-password` — Asgardeo owns both.
- **Keep** `POST /device-token` (Option A) and `GET /me`.
- In `src/controllers/userController.js`, drop `resetPassword` and stop accepting
  `password` in `create` — admins invite via Asgardeo instead.

Do this only after §4 passes end to end. Keeping both paths alive during the migration is
what makes this a safe change rather than a flag day.

### 3.8 `.env` additions

```dotenv
ASGARDEO_ORG=tuktuktracker
ASGARDEO_BASE_URL=https://api.asgardeo.io/t/tuktuktracker
ASGARDEO_AUDIENCE=https://api.tuktuktracker.lk
ASGARDEO_CLIENT_ID=<spa client id>
LEGACY_LOGIN_ENABLED=true
CORS_ORIGINS=http://localhost:5173
```

---

## 4. Testing the end-to-end flow

### 4.1 Link the seeded officers first

The seeded accounts in the README (`admin`, `prov_western`, `dist_colombo`,
`stat_colombo_central`) each hold a real `scope_id`. Create matching Asgardeo users with
**the same usernames** so §3.4's username fallback links them on first login. Verify:

```bash
mongosh "$MONGODB_URI" --quiet --eval \
  'db.users.find({}, {username:1, role:1, scope_id:1, asgardeo_sub:1}).toArray()'
```

Every officer should end up with a non-null `asgardeo_sub` after their first sign-in.

### 4.2 Inspect a real token before trusting your middleware

Sign in to the SPA, copy the access token from the network tab, and decode it:

```bash
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

Check, in this order — these are the four things that actually go wrong:

| Claim | Expected | If wrong |
| --- | --- | --- |
| `iss` | `https://api.asgardeo.io/t/tuktuktracker/oauth2/token` | Your `ASGARDEO_BASE_URL` has a typo or trailing slash |
| `aud` | contains `https://api.tuktuktracker.lk` | You skipped the Audience setting in §1.3 |
| `scope` | includes `vehicles:read` etc. | You didn't request them in `scopes` (§2.3) or didn't subscribe the app (§1.3) |
| `roles` | `ADMIN_HQ`, possibly app-prefixed | `roles` not enabled in User Attributes (§1.3) |

If the token is opaque rather than three dot-separated segments, you left the access token
type as Opaque — go back to §1.3.

### 4.3 Walk the matrix

```bash
TOKEN=<paste>
API=http://localhost:5000/api/v1

curl -s $API/auth/me        -H "Authorization: Bearer $TOKEN" | jq
curl -s $API/live           -H "Authorization: Bearer $TOKEN" | jq '.data | length'
curl -s $API/vehicles       -H "Authorization: Bearer $TOKEN" | jq '.meta'
curl -s -X DELETE $API/vehicles/<id> -H "Authorization: Bearer $TOKEN" | jq
```

Expected, per role:

| Token | `GET /live` | `POST /vehicles` | `DELETE /vehicles/:id` |
| --- | --- | --- | --- |
| `ADMIN_HQ` | all vehicles | 201 | 204 |
| `PROVINCIAL_OFFICER` (Western) | Western only | 201 | 403 `INSUFFICIENT_PERMISSIONS` |
| `DISTRICT_OFFICER` (Colombo) | Colombo only | 403 | 403 |
| `STATION_OFFICER` | one station | 403 | 403 |
| no token | 401 `MISSING_TOKEN` | 401 | 401 |
| tampered signature | 401 `INVALID_TOKEN` | — | — |

**The critical assertion is the scoping column.** If a provincial officer's `GET /live`
returns vehicles from other provinces, your Asgardeo→Mongo mapping failed and
`resolveScope()` is running with the wrong `scope_id` — that is a data leak, not a
cosmetic bug. Check it before anything else.

### 4.4 Confirm the device path still works

The regression most likely to be missed, because the SPA never exercises it:

```bash
DEV=$(curl -s -X POST $API/auth/device-token \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"DEV-A1B2C3D4"}' | jq -r .data.token)

curl -s -X POST $API/locations/ping \
  -H "Authorization: Bearer $DEV" -H 'Content-Type: application/json' \
  -d '{"latitude":6.9271,"longitude":79.8612,"speed":32}' | jq
```

Must still succeed. If it 401s, `looksLikeAsgardeo()` is misrouting local tokens.

### 4.5 Keep the Jest suite green

`tests/setup.js` injects `JWT_SECRET` and the suites sign their own HS256 tokens. Because
`protect` still handles locally-signed tokens, **the existing suite should pass unchanged** —
run it to prove the dual-mode middleware is backward compatible:

```bash
npm test
```

Then add Asgardeo-specific unit tests that do **not** hit the network. Test `extractRole`
and `resolveLocalUser` directly, and for `verifyAsgardeoToken` generate a throwaway RSA
keypair and stub `jwks-rsa`:

```js
jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn().mockImplementation(() => ({
    getSigningKey: (kid, cb) => cb(null, { getPublicKey: () => PUBLIC_KEY }),
  })),
}));
```

Cases worth covering: valid token → mapped user; wrong `iss` → 401; wrong `aud` → 401;
expired → 401; `alg: none` → 401; valid token with no local `User` → 403
`USER_NOT_PROVISIONED`; app-prefixed role string → correct role extracted.

### 4.6 Things that will bite you

| Symptom | Cause |
| --- | --- |
| CORS error on `/oauth2/token` | Origin missing from **Allowed origins** in the console (not the same field as redirect URLs) |
| `invalid_callback` | `afterSignInUrl` ≠ an Authorized redirect URL, usually a trailing-slash mismatch |
| Token has no API scopes | App not subscribed to the API resource, or scopes not listed in `scopes` |
| `aud` is the client ID, not your API | Audience not added on the Protocol tab |
| 403 `USER_NOT_PROVISIONED` for a real officer | Asgardeo username ≠ Mongo `username`; link manually by setting `asgardeo_sub` |
| Officer sees nothing after login | `scope_id` is null on the linked `User`, so `applyVehicleScope` sets `_id: null` |
| Works in dev, 401s in prod | Different Asgardeo org/region, so a different `iss` |
| Signature check fails intermittently | Asgardeo rotated keys and `cacheMaxAge` is too long; lower it |

---

## 5. Blog post outline

The generic "add Asgardeo to React" post already exists a hundred times. The three
starred sections below are what makes yours worth reading, and they all come from §0.

1. **The system** — real-time tuk-tuk tracking for Sri Lanka Police, four-tier geographic
   RBAC, GPS devices as first-class API clients.
2. **Why Asgardeo** — MFA and credential handling you get for free; credentials leave your
   codebase entirely.
3. **Console setup** — two registrations, and why the API resource comes first.
4. **The React SPA** — how much login code simply disappears.
5. **⭐ The interesting problem: external identity, internal authorization.** Asgardeo
   cannot know your Mongo ObjectIds. Show the mapping layer, and show that `rbac.js` and
   every controller stayed untouched. This is the transferable lesson.
6. **⭐ What *not* to migrate.** GPS trackers cannot do interactive OIDC; self-registration
   has no place in a police system. Knowing the limits of an IdP is the senior-engineer
   signal.
7. **⭐ Migrating without a flag day.** Dual-mode `protect`, `LEGACY_LOGIN_ENABLED`, and an
   unchanged Jest suite as proof of backward compatibility.
8. **Testing** — the role × endpoint matrix, especially the scoping column.
9. **Gotchas** — the table in §4.6.

---

## Sources

- [Asgardeo React SDK overview](https://is.docs.wso2.com/en/next/sdks/react/overview/)
- [React quickstart](https://is.docs.wso2.com/en/next/quick-starts/react/)
- [Discover OIDC configs](https://wso2.com/asgardeo/docs/guides/authentication/oidc/discover-oidc-configs/)
- [API authorization](https://wso2.com/asgardeo/docs/guides/api-authorization/)
- [Access tokens reference](https://wso2.com/asgardeo/docs/references/tokens/access-tokens/)
- [asgardeo/javascript monorepo](https://github.com/asgardeo/javascript)
