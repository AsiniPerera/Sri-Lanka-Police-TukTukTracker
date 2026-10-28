
Student ID: COBSCCOMP242P-024    
Name: G A U Perera

 
User to Test Permissions:

For ADMIN tests:
  Username: admin
  Password: Admin@1234

For PROVINCIAL tests:
  Username: prov_western
  Password: Officer@123

For DISTRICT tests (READ-ONLY):
  Username: dist_colombo
  Password: Officer@123

For STATION tests (READ-ONLY):
  Username: stat_colombo_central
  Password: Officer@123

---

## WSO2 product used: Asgardeo (WSO2 Identity Server as a Service)

Officer sign-in is handled by **WSO2 Asgardeo** over OIDC + PKCE. The React console
(`tuktuk-web`) never sees a password; the Express API (`tuktuk-tracker`) verifies
Asgardeo-issued RS256 access tokens against the tenant's live JWKS.

The division of responsibility is the interesting part: **Asgardeo asserts *who* the
officer is, MongoDB decides *what they may see*.** Asgardeo cannot know the
Province → District → Station ObjectId graph that `scope_id` points into, so the token's
`sub` is mapped onto a local `User` record which remains authoritative for role and
geographic scope. An IdP role change cannot by itself grant data access.

Full write-up: [`tuktuk-tracker/docs/asgardeo-integration.md`](tuktuk-tracker/docs/asgardeo-integration.md).
Authorization review: [`tuktuk-tracker/docs/security-findings.md`](tuktuk-tracker/docs/security-findings.md).

### Running it

The API needs MongoDB. If you do not have one installed, use the in-memory launcher,
which also seeds realistic demo data (9 provinces, 25 districts, 250 vehicles, ~94k GPS
pings):

```bash
cd tuktuk-tracker
npm install
npm run dev:memory        # in-memory MongoDB + seed + serve on :5000
```

With a real MongoDB, set `MONGO_URI` in `.env` and use `npm run seed && npm start`.

```bash
cd tuktuk-web
npm install
npm run dev               # console on :5173
```

- API + Swagger UI: http://localhost:5000/
- Console: http://localhost:5173/

Sign in with **Sign in with Asgardeo**, or use the password form below it — the API runs
both paths at once (`LEGACY_LOGIN_ENABLED`) so the migration does not need a flag day.

### Tests

```bash
cd tuktuk-tracker && npm test      # 106 tests, 11 suites
```

### Not yet configured in the Asgardeo console

Per-route OAuth scope enforcement is implemented but switched off
(`ASGARDEO_ENFORCE_SCOPES=false`): it needs the `TukTuk Tracker API` API resource to be
created and subscribed first. The "Status" section at the top of the integration guide
lists the four steps, in order. There is also no Google connection in the tenant yet, so
`VITE_ASGARDEO_GOOGLE_CONNECTION` must stay unset.


### Demo credentials

Asgardeo sign-in and seeded password accounts are listed in
`tuktuk-tracker/docs/demo-credentials.md`, which is git-ignored so live
credentials are not published.