# Deploying to Railway

Single Railway project, **two resources**:

- **Postgres** — Railway's managed Postgres plugin.
- **app** — one service, built from the repo-root `Dockerfile`. The Express server both serves
  the API (under `/api/*`) and serves the built React client directly (see
  `server/src/index.ts`) — no nginx, no second service, no private networking to configure.

This replaced an earlier two-service setup (separate `server` and `client` services talking over
Railway's private networking). That setup hit a wall of platform quirks — the config-as-code path
needing a leading slash, `RAILWAY_DOCKERFILE_PATH` being the only reliable way to force the
Dockerfile builder, reference variables resolving empty when a service name didn't match, and an
nginx reverse-proxy bug on top of all that. None of that exists anymore: one service means one
build, one set of env vars, and no cross-service address to get wrong.

## 1. Create the project and add Postgres

New Railway project → **+ New → Database → PostgreSQL**. Railway exposes its connection details
as a reference variable (`${{Postgres.DATABASE_URL}}`) the app service pulls from below.

## 2. Add the `app` service

**+ New → GitHub Repo** → pick this repo.

- **Root Directory**: leave as `/` (repo root) — default, don't change it.
- **Build**: nothing to configure. Railway auto-detects the `Dockerfile` at the repo root with
  zero settings needed — no config-as-code path, no `RAILWAY_DOCKERFILE_PATH` variable, no
  Builder dropdown to set. This is the whole point of moving the Dockerfile to the root.
- **Settings → Networking → Generate Domain**: enable this — this is the one public-facing
  service, the browser talks to it directly.

**Variables:**

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SHADOW_DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (see gotcha below — any valid Postgres URL works, it's never actually connected to) |
| `BETTER_AUTH_SECRET` | a long random string — generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | this service's own public URL, e.g. `https://helpdesk-production-xxxx.up.railway.app` (available once you've generated the domain above) |
| `TRUSTED_ORIGINS` | same value as `BETTER_AUTH_URL` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | initial admin account, created on first boot |
| `SEED_AGENT_EMAIL` / `SEED_AGENT_PASSWORD` / `SEED_AGENT_NAME` | initial agent account |
| `SUPPORT_EMAIL_ADDRESS` | address inbound mail is forwarded to (optional if not wiring up inbound email yet) |
| `INBOUND_EMAIL_WEBHOOK_USER` / `INBOUND_EMAIL_WEBHOOK_PASSWORD` | Basic Auth for `/webhooks/inbound-email` (optional, same condition) |
| `POSTMARK_SERVER_TOKEN` / `POSTMARK_FROM_ADDRESS` | outbound email (optional — replies just log a warning and skip sending without these) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini key for AI features (optional until those routes are wired up) |

`PORT` doesn't need to be set — `server/src/index.ts` reads `process.env.PORT ?? 3000`, and
Railway auto-injects `PORT` for services with a generated domain, which this one has.

## Gotchas

- **`SHADOW_DATABASE_URL` is required even though `migrate deploy` never uses it.**
  `server/prisma.config.ts` calls `env("SHADOW_DATABASE_URL")` eagerly at module load — Prisma's
  `env()` helper throws immediately if the variable is unset or empty, for *any* prisma command,
  including plain `generate`/`migrate deploy`. Point it at the same Postgres instance
  (`${{Postgres.DATABASE_URL}}`) rather than skipping it.
- **Migrations and seeding run on every deploy, not just the first.** The `Dockerfile`'s `CMD`
  chain is `prisma generate && prisma migrate deploy && bun prisma/seed.ts && bun src/index.ts`.
  `migrate deploy` only applies pending migrations (no-op if none), and `seed.ts` skips users that
  already exist — so redeploys are safe, just not instant.
- **The Prisma client is regenerated at container start, not just at build time.** Some platforms
  (Railway included, historically) don't reliably carry the build-time `RUN prisma generate`
  output through to the deployed container. The `CMD` regenerates it on every boot as a cheap
  (~150ms) safety net — don't remove that call even if it looks redundant with the build step.
- **`BETTER_AUTH_URL`/`TRUSTED_ORIGINS` need the service's own domain**, set *after* generating it
  in step 2 — chicken-and-egg the first time through, since the domain doesn't exist until you
  enable it. Redeploy after setting these if the domain came first.

## Verifying

- `/health` runs `SELECT 1` against the DB — Railway's healthcheck (configured in `railway.json`)
  hits this automatically on every deploy.
- Once the service is up, visit its public domain, log in with the seed admin credentials, and
  confirm you land on `/dashboard`.
