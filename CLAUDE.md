# Run Review

Web app for importing, storing, and visualizing running activity data (route maps, pace/HR/elevation charts). Product spec lives in `Project spec/` (gitignored — ask the user if you need it). MVP scope: accounts, JSON data import, activity feed + map. Route planning and AI-recommended runs are explicitly future/out of scope.

## Stack

- **Frontend**: React 19 + Vite, Tailwind, TanStack Query, React Router, react-leaflet 5 (Leaflet maps)
- **API**: Fastify + TypeScript, Prisma + PostgreSQL, server-side sessions (not JWT)
- **Import pipeline**: BullMQ + Redis, streaming JSON parse (`stream-json`) — files up to 256MB
- **Local dev**: Docker Compose (`postgres`, `redis`, `api`, `worker`, `web` services)

## Monorepo layout

```
packages/
  shared/   pure types + formatting/calc helpers, consumed as raw TS (no build step)
  api/      Fastify app; src/modules/{auth,account,runs,import,audit}, src/queue/ (BullMQ worker)
  web/      React SPA; src/components/{nav,auth,activities,account}, src/routes/
```

`packages/shared`'s `main`/`types` point straight at `src/index.ts` — it's never compiled, both `api` and `web` transform it live via their own tsx/Vite pipelines. Don't add a build step to it without checking that still works.

## Running it

See `README.md` for the actual setup commands. Short version: `docker compose up -d postgres redis`, apply the Prisma migration, then `docker compose up`. The `worker` service must be running for uploaded imports to actually process — the `api` service only accepts the upload and enqueues the job.

## Key architecture decisions (the "why", not in the code comments)

- **Sessions over JWT.** `packages/api/src/middleware/session.ts` — opaque token in an httpOnly cookie, session row in Postgres. Password reset and password change both invalidate other sessions for that user.
- **`external_activity_id` is `BigInt`.** Source IDs (e.g. `7070576238`) exceed Postgres/Prisma `Int` range. Dedup key is `@@unique([userId, externalActivityId])`.
- **Import is a background job, not a request-cycle operation.** `POST /api/import` streams the upload straight to disk and returns `202` immediately; `packages/api/src/queue/worker.ts` does the actual parsing (via `stream-json`, never a full `JSON.parse` — that would OOM on a 256MB file) and DB inserts. Poll `GET /api/import/:jobId` for status.
- **Activity type filter is substring-based.** Anything whose `activity_type_key` contains "running" (case-insensitive) is accepted — `trail_running` etc. See `@run-review/shared`'s `isRunningActivityType`.
- **Reverse geocoding is synchronous inside the import job**, throttled to ~1 req/sec against Nominatim and cached in the `geocode_cache` table (rounded to ~110m). Known throughput trade-off for imports with many distinct start locations — documented escape hatch is decoupling it into an async backfill if it ever matters.
- **`audit_logs.user_id` uses `onDelete: SetNull`, not `Cascade`**, with a denormalized `user_email` snapshot. Cascading would delete the `ACCOUNT_DELETED` log row the instant it's written.
- **Track points can have null lat/long** (pre-GPS-lock). The map only shows "no mapping data" when *zero* points in a run have coordinates — `buildRouteCoordinates()` filters nulls, it doesn't treat a partial trace as missing data.
- **Cursor pagination on the runs list**, not offset — `(startTimeGmt, id)` keyset, base64url-encoded cursor. See `runs.service.ts`.
- **React is pinned to 19 via a root `package.json` `overrides` block.** `react-leaflet@4.x`'s peer dep is React 18 only and actually breaks under 19's StrictMode double-invoke (map re-init throws "already initialized") — fixed by upgrading to `react-leaflet@5` rather than downgrading React, since several other deps (resend's `@react-email/render`, etc.) pull in 19 transitively anyway. If you touch `react`/`react-dom`/`react-leaflet` versions, be deliberate about this — it's a real, previously-hit landmine, not a hypothetical.
- **Map tiles are CARTO Positron** (`{s}.basemaps.cartocdn.com/light_all`), not stock OSM raster tiles — deliberately muted so the colored gradient routes and markers stand out. Free tier, no API key, but shared-service fair-use applies same as OSM's own tile server would.
- **Route gradient visualization** (`lib/route-gradient.ts`): pace/heart-rate/elevation modes each render as many small 2-point `Polyline` segments rather than one path, since Leaflet can't gradient-fill a single line. Colors are single-hue ramps normalized to that run's own min/max, not a fixed global scale.
- **The "All metrics" drawer is portal-rendered to `document.body`** (`RunMetricsDrawer.tsx`), not nested in the map panel's DOM position — it needs to visually cover both the activity list and map columns, which live in sibling components.
- **Docker footguns already hit and fixed** (see `packages/api/Dockerfile`): missing `.dockerignore` let the host's macOS-built Prisma engine leak into the Linux image; `prisma generate` has to run explicitly in the `dev` stage too, not just `build`; plain `node:20-alpine` ships no OpenSSL at all, which breaks Prisma's engine-detection — `apk add openssl` is required before `npm install`. The `web` container's Vite dev-server proxy needs `API_BASE_URL` overridden to `http://api:3000` (the Docker network hostname) specifically for that service in `docker-compose.yml` — `.env`'s `API_BASE_URL` has to stay `http://localhost:3000` for verification-email links to resolve in an actual browser, so it can't just be changed globally.

## Testing

Unit tests colocated as `*.test.ts(x)` next to the source (Vitest everywhere). `packages/api/test/integration/` needs real Postgres/Redis (docker compose or CI service containers) — won't run standalone. Run `npm run test`, `npm run typecheck`, `npm run lint` from the repo root before considering a change done.

## Known gaps

- No git history before this file was added — the "why" for anything predating it lives only in prior conversation context, not commit messages.
- `RESEND_API_KEY`'s sending domain (`runreview.app`) isn't verified with Resend — real signup/reset emails will fail to send until either the domain is verified or `EMAIL_FROM` is pointed at a working sender. The API logs a warning and continues rather than failing the request when this happens (see `auth.service.ts`).
