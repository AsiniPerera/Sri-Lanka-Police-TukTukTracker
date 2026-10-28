# TukTuk Tracker — Web Console

React SPA for the TukTukTracker API, authenticated with WSO2 Asgardeo.

Integration rationale and the matching backend changes live in
[`../tuktuk-tracker/docs/asgardeo-integration.md`](../tuktuk-tracker/docs/asgardeo-integration.md).

## Stack

| Concern | Choice |
| --- | --- |
| Build | Vite 8 + React 19 + TypeScript |
| Auth | `@asgardeo/react` (OIDC authorization code + PKCE) |
| Map | MapLibre GL via `react-map-gl/maplibre`, OpenStreetMap raster tiles |

No map API key is required.

## Setup

```bash
cp .env.example .env.local   # then fill in the two Asgardeo values
npm install
npm run dev                  # http://localhost:5173
```

Vite reads env files **only at startup** — restart the dev server after editing
`.env.local`.

### Required Asgardeo console settings

The app will not sign in until the SPA registration matches:

| Console field | Value |
| --- | --- |
| Authorized redirect URLs | `http://localhost:5173` |
| Allowed origins | `http://localhost:5173` |
| Allowed grant types | Code (with PKCE) |
| Public client | Yes |
| Access token type | JWT |
| User attributes | `email`, `profile`, `roles` |

The app must also be subscribed to the `TukTuk Tracker API` resource with the scopes
listed in [src/auth/config.ts](src/auth/config.ts). A scope the SPA does not request
never reaches the token, and the API then answers 403.

The API needs `CORS_ORIGINS=http://localhost:5173` — the backend's default
`cors({ origin: '*' })` will not work for credentialed requests.

## Layout

```
src/
  auth/config.ts         Asgardeo config + scope lists
  api/
    types.ts             mirrors the Mongoose models and both response envelopes
    client.ts            fetch wrapper that attaches a fresh access token
    hooks.ts             useMe, useLiveVehicles, useLiveStats, useVehicles
  components/
    LoginScreen.tsx      <SignInButton /> — no password fields anywhere
    AppShell.tsx         header, tabs, role label, not-provisioned state
    LiveDashboard.tsx    stats + sidebar + map
    TrackerMap.tsx       MapLibre map, heading-aware markers, popups
    VehicleList.tsx      sidebar list, online-first ordering
    VehiclesPage.tsx     paged, searchable vehicle registry
    StatsBar.tsx         fleet counters
```

## Two decisions worth knowing

**Role comes from `GET /auth/me`, not from the ID token.** Asgardeo asserts *who* you
are; the Mongo `User` record decides *what you may see*, because only Mongo knows the
Province → District → Station graph that `scope_id` points into. See
[src/api/hooks.ts](src/api/hooks.ts).

**Role checks in the UI only hide controls.** All scoping is enforced server-side by
`applyVehicleScope()` in the API's `src/middleware/rbac.js`. Hiding a button is a
courtesy, not a security boundary — anyone can call the API directly.

## Before production

- Replace the OpenStreetMap tile source in [TrackerMap.tsx](src/components/TrackerMap.tsx).
  OSM's tile usage policy forbids application traffic against `tile.openstreetmap.org`.
- `GET /live` is polled every 5s with `limit: 200` (the API's hard ceiling). Past 200
  live vehicles this needs paging or a map-bounds filter.
- `maplibre-gl` is ~1.1 MB; lazy-load the map route if first paint matters.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then bundle |
| `npm run lint` | oxlint |
| `npm run preview` | Serve the production build |
