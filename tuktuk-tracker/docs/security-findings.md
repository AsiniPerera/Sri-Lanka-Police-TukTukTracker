# Security findings — authorization review, 2026-10-28

Found while verifying the Asgardeo integration end to end against a seeded database
(250 vehicles, 250 drivers, 31 officers). All of these are **pre-existing** and unrelated
to Asgardeo; the OIDC work is what prompted the review, not what caused them.

Two are fixed. One is left open because closing it changes a provisioning workflow, which
is a product decision rather than a bug fix.

---

## 1. FIXED — Read routes accepted GPS device tokens

**Severity: high.** `GET /vehicles`, `/drivers`, `/provinces`, `/districts` and `/stations`
carried no `authorize(...)` call. An Express route without one accepts *any* authenticated
principal, and that includes `DEVICE_CLIENT` — the long-lived (365-day) token issued to
on-vehicle GPS hardware.

Observed before the fix: a device token read the full driver registry, 250 records,
including `nic_number`, `phone_number` and `device_id`.

A tracking box bolted to a tuk-tuk is physically accessible and its token lives for a year.
It needs exactly one permission: `POST /locations/ping` for its own vehicle.

**Fix.** Read routes now list the four human officer roles explicitly, via an
`OFFICER_ROLES` constant in each route file. Device tokens get 403
`INSUFFICIENT_PERMISSIONS`; ping ingestion is unaffected.

Regression tests: `tests/scopeIsolation.test.js`, "DEVICE_CLIENT tokens cannot read the
registries".

---

## 2. FIXED — `/drivers` ignored geographic scope entirely

**Severity: high.** `driverController.list` and `getById` applied no scope filter, so the
four-tier Province → District → Station model that `/vehicles` and `/locations` enforce
simply did not apply to drivers. A single-station officer with 27 vehicles in scope could
read all 250 drivers nationwide.

This is a straight PII disclosure — full name, NIC number, phone number — and it is the
first half of the escalation chain in finding 3.

**Fix.** A `Driver` has no `station_id`; its only link into the hierarchy is
`current_vehicle_id`. `applyDriverScope` resolves scope through `Vehicle`, the same way
`locationController` already did. It also validates a caller-supplied
`?current_vehicle_id` against the scope, so the filter cannot be used to step outside it,
and returns the same 404 for an out-of-scope driver as for a nonexistent one.

Unassigned drivers (no vehicle, therefore no station) are visible to `ADMIN_HQ` only.

After the fix, driver visibility matches vehicle visibility exactly:

| Role | Vehicles | Drivers (before) | Drivers (after) |
| --- | --- | --- | --- |
| `ADMIN_HQ` | 250 | 250 | 250 |
| `PROVINCIAL_OFFICER` | 136 | 250 | 136 |
| `DISTRICT_OFFICER` | 84 | 250 | 84 |
| `STATION_OFFICER` | 27 | 250 | 27 |

Regression tests: `tests/scopeIsolation.test.js`.

---

## 3. OPEN — `POST /auth/device-token` mints a token for any `device_id`, unauthenticated

**Severity: high. Not changed — needs a decision.**

The endpoint has no `protect` middleware. It accepts a bare `device_id` and returns a
365-day `DEVICE_CLIENT` token scoped to that device's vehicle:

```js
// src/routes/auth.js
router.post('/device-token', auth.issueDeviceToken);
```

Combined with finding 2, this was a full escalation chain, reproduced end to end:

1. Any authenticated principal — including a single GPS box — read all 250 drivers.
2. Each record carries `device_id`.
3. `POST /auth/device-token` with a harvested `device_id` returned a valid token for
   *that* vehicle. Confirmed: minting a token for an unrelated vehicle succeeded.
4. That token forges GPS pings for a vehicle the attacker has no relationship with.

Findings 1 and 2 break steps 1–2, so the chain no longer starts from inside the API. But
step 3 stands on its own: **anyone who learns a `device_id` by any means can impersonate
that vehicle for a year.** Device IDs are printed on hardware, appear in provisioning
paperwork, and follow the guessable pattern `DEV-` + 8 hex characters.

Why it is still open: this is the device *provisioning* path. Requiring authentication
would break whatever currently calls it during installation, and that workflow is not
described in the repository. The fix is a one-liner, but which option is right depends on
how field provisioning actually happens:

- **Option A — restrict to HQ.** `router.post('/device-token', protect, authorize(ROLES.ADMIN_HQ), auth.issueDeviceToken);`
  Correct if devices are provisioned centrally. Field technicians then need an officer
  account.
- **Option B — one-time enrolment secret.** Store a per-device secret at registration and
  require it alongside `device_id`. Survives decentralised provisioning; needs a migration
  and a secret-distribution story.
- **Option C — single-use enrolment.** Refuse to re-issue once a device has a live token,
  so a harvested `device_id` is useless after installation. Smallest change that closes
  the hole without new secrets; needs a reset path for replaced hardware.

Option C is the best fit for the current design if provisioning must stay decentralised;
Option A is simpler and strictly safer if it does not.

Also worth doing regardless: stop returning `device_id` in driver payloads to anyone below
`ADMIN_HQ`. It is a credential, not an attribute, and nothing in the console UI reads it.

---

## 4. FIXED — `CORS_ORIGINS` was ignored

**Severity: medium.** `server.js` hardcoded `cors({ origin: '*' })`, so the
`CORS_ORIGINS` variable that `.env` sets and §2.6 of the integration guide documents had
no effect. Every origin on the internet could read the API with a token the browser
already held.

**Fix.** `CORS_ORIGINS` is now honoured as a comma-separated allowlist. Requests with no
`Origin` header (curl, Swagger UI, GPS clients) still pass, since those are not browser
cross-origin requests. An unset `CORS_ORIGINS` falls back to `*` with a startup warning so
existing setups keep working.

---

## 5. FIXED — `asgardeo_sub` unique index broke user creation

**Severity: high (availability).** Not a vulnerability, but it made the system unusable,
so it is recorded here. The field combined `default: null` with a `sparse` unique index:

```js
asgardeo_sub: { type: String, default: null, unique: true, sparse: true, index: true }
```

A sparse index skips documents where the field is **absent**; an explicit `null` is still
indexed. With `default: null`, every not-yet-linked officer collided, so the *second* user
ever created failed with `E11000 duplicate key error`. Seeding died at user 2, and in
production no second officer could be provisioned.

The code comment correctly said "`sparse` is essential" — `default: null` quietly defeated
it.

**Fix.** Dropped the default and replaced the inline index with a partial index keyed on
type, which excludes both absent and null values:

```js
userSchema.index(
  { asgardeo_sub: 1 },
  { unique: true, partialFilterExpression: { asgardeo_sub: { $type: 'string' } } }
);
```

Any number of unlinked officers can now coexist, while one Asgardeo identity still cannot
be linked to two records. Seeding completes: 31 users, 250 vehicles, 93,759 pings.
