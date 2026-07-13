# Deploying to Railway

This repo already has Railway-ready Dockerfiles (`server/Dockerfile`, `client/Dockerfile`) and a
`railway.json` next to each. The setup is **3 Railway resources in one project**:

- **Postgres** — Railway's managed Postgres plugin.
- **server** — Bun + Express API, built from `server/Dockerfile`. Private-networking only, no public domain needed.
- **client** — nginx serving the built React app, reverse-proxying `/api/*` to `server` over Railway's private network. This is the one public-facing service.

The client is a single-origin proxy (see `client/nginx.conf`): the browser only ever talks to the
client's public domain, which forwards `/api/*` to the server internally. That's why Better Auth's
session cookie and CORS/origin checks are configured against the **client's** public URL, not the
server's.

## 1. Create the project and add Postgres

New Railway project → **+ New → Database → PostgreSQL**. No config needed; Railway exposes its
connection details as reference variables (`${{Postgres.DATABASE_URL}}` etc.) that the other two
services will pull from.

## 2. Add the `server` service

**+ New → GitHub Repo** → pick this repo.

- **Root Directory**: leave as `/` (repo root). Don't scope it to `server/` — both Dockerfiles
  assume a repo-root build context because of the Bun workspace (see the comment at the top of
  `server/Dockerfile`).
- **Settings → Build → Config-as-code path**: set to `/server/railway.json` — **with the leading
  slash**. Railway resolves this path as absolute from the repo root regardless of Root Directory;
  a path without the leading slash silently fails to match and Railway falls back to Railpack
  (which then fails with a "no main field / no index.js" error, since it's trying to auto-detect a
  Node entrypoint instead of using the Dockerfile). Railway only auto-reads a root-level
  `railway.json` by default; since this repo has one per service, you have to point each Railway
  service at its own file explicitly.
- **Settings → Networking**: no public domain needed — Railway healthchecks reach the service over
  the private network regardless.

**Variables:**

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SHADOW_DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (see gotcha below — any valid Postgres URL works, it's never actually connected to) |
| `BETTER_AUTH_SECRET` | a long random string — generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | the **client's** public URL, e.g. `https://helpdesk-client.up.railway.app` (set this after step 3, once that domain exists) |
| `TRUSTED_ORIGINS` | same as `BETTER_AUTH_URL` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | initial admin account, created on first boot |
| `SEED_AGENT_EMAIL` / `SEED_AGENT_PASSWORD` / `SEED_AGENT_NAME` | initial agent account |
| `SUPPORT_EMAIL_ADDRESS` | address inbound mail is forwarded to (optional if not wiring up inbound email yet) |
| `INBOUND_EMAIL_WEBHOOK_USER` / `INBOUND_EMAIL_WEBHOOK_PASSWORD` | Basic Auth for `/webhooks/inbound-email` (optional, same condition) |
| `POSTMARK_SERVER_TOKEN` / `POSTMARK_FROM_ADDRESS` | outbound email (optional — replies just log a warning and skip sending without these) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini key for AI features (optional until those routes are wired up) |

`PORT` doesn't need to be set — the Dockerfile's `CMD` reads `process.env.PORT ?? 3000` and Railway
only auto-injects `PORT` for services with a public domain, which this one doesn't have.

## 3. Add the `client` service

Same repo, same "+ New → GitHub Repo" flow, as a second service in the same project.

- **Root Directory**: `/` (same reasoning as server).
- **Config-as-code path**: `/client/railway.json` — leading slash, same reasoning as server.
- **Settings → Networking → Generate Domain**: enable this — this is the service the browser hits.

**Variables:**

| Variable | Value |
|---|---|
| `SERVER_UPSTREAM` | `${{server.RAILWAY_PRIVATE_DOMAIN}}:3000` |

Leave `PORT` unset — Railway injects it automatically for services with a generated domain, and
`client/nginx.conf`'s template picks it up (`listen ${PORT};`, defaulting to 80 via the
Dockerfile's `ENV PORT=80` if a platform doesn't inject one).

## 4. Close the loop on `server`'s env vars

Once the client has a public domain (step 3), go back to `server`'s variables and set
`BETTER_AUTH_URL` / `TRUSTED_ORIGINS` to that domain, then redeploy `server`. This ordering
(server before client's domain exists) is unavoidable the first time through — the two services
reference each other's addresses.

## Gotchas

- **`SHADOW_DATABASE_URL` is required even though `migrate deploy` never uses it.**
  `server/prisma.config.ts` calls `env("SHADOW_DATABASE_URL")` eagerly at module load — Prisma's
  `env()` helper throws immediately if the variable is unset or empty, for *any* prisma command,
  including plain `generate`/`migrate deploy`. Point it at the same Postgres instance
  (`${{Postgres.DATABASE_URL}}`) rather than skipping it.
- **Migrations and seeding run on every deploy, not just the first.** `server/Dockerfile`'s `CMD`
  chain is `prisma generate && prisma migrate deploy && bun prisma/seed.ts && bun src/index.ts`.
  `migrate deploy` only applies pending migrations (no-op if none), and `seed.ts` skips users that
  already exist — so redeploys are safe, just not instant.
- **The Prisma client is regenerated at container start, not just at build time.** Some platforms
  (Railway included, historically) don't reliably carry the build-time `RUN prisma generate`
  output through to the deployed container. The `CMD` regenerates it on every boot as a cheap
  (~150ms) safety net — don't remove that call even if it looks redundant with the build step.
- **Private networking hostnames need the port.** `${{server.RAILWAY_PRIVATE_DOMAIN}}` resolves to
  a bare hostname; `SERVER_UPSTREAM` needs `:3000` appended since nginx's `proxy_pass` needs a port.
- **`railway.json` per service, not one at the repo root.** Railway's schema has no multi-service
  `services` key, so one file can't configure both — each service needs its own Config-as-code
  path. If a service's build falls back to Railpack/Nixpacks detection (typically failing with "no
  main field / no index.js" since it's trying to guess a Node entrypoint instead of using the
  Dockerfile), check the path.
- **The Config-as-code path must be absolute from the repo root, with a leading slash** —
  `/server/railway.json` / `/client/railway.json`, not `server/railway.json`. This is easy to get
  wrong and fails silently (no error, it just doesn't match, and Railway quietly falls back to
  Railpack). Railway's own monorepo docs example is `/backend/railway.toml`. This is independent of
  the service's Root Directory setting — the config path is always relative to the repo root, never
  to Root Directory.

## Verifying

- `server`'s `/health` route runs `SELECT 1` against the DB — Railway's healthcheck (configured in
  `server/railway.json`) hits this automatically on every deploy.
- Once both services are up, visit the client's public domain, log in with the seed admin
  credentials, and confirm you land on `/dashboard`.
