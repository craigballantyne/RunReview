# Run Review

Web app for storing, importing, and visualizing running activity data. See `Project spec/` for the product spec, and `CLAUDE.md` for an overview of the technical design and codebase layout.

## Stack

React + Vite (frontend) · Fastify + TypeScript (API) · PostgreSQL + Prisma · BullMQ + Redis (import processing) · Docker Compose (local dev).

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (only needed if running things outside Docker, e.g. `npm run typecheck` locally)

## First-time setup

```bash
cp .env.example .env   # edit RESEND_API_KEY, SESSION_COOKIE_SECRET, NOMINATIM_USER_AGENT at minimum
docker compose up -d postgres redis
npm install
npm run prisma:migrate:deploy --workspace packages/api   # applies packages/api/prisma/migrations
docker compose up
```

- API: http://localhost:3000
- Web: http://localhost:5173

The import worker (`packages/api/src/queue/worker.ts`) runs as its own `worker` service in `docker-compose.yml` — it must be running for uploaded files to actually get processed, not just accepted.

## Everyday commands

```bash
npm run typecheck   # all packages
npm run lint        # eslint across the monorepo
npm run test        # unit tests everywhere; api integration tests additionally require
                     # DATABASE_URL/REDIS_URL pointed at real services (see docker compose or CI)
npm run build        # production builds
```

## Notes

- `RESEND_API_KEY` needs a real key for verification/reset emails to actually send; without one, signup/reset will fail at the email-send step.
- `NOMINATIM_USER_AGENT` must be a descriptive string with contact info per Nominatim's usage policy, or reverse geocoding during import will be rejected.
- Import files are capped at 256MB and processed in the background — poll `GET /api/import/:jobId` (the frontend does this for you) for progress.
