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
- Set `RAILWAY_DOCKERFILE_PATH` as a **Variable** on the service (Variables tab, not Settings) —
  see the table below. This is the reliable way to force the Dockerfile builder; see the gotcha
  below on why the Settings → Build dashboard fields (Builder dropdown / Config-as-code path) are
  not the recommended path here.
- **Settings → Networking**: no public domain needed — Railway healthchecks reach the service over
  the private network regardless.

**Variables:**

| Variable | Value |
|---|---|
| `RAILWAY_DOCKERFILE_PATH` | `/server/Dockerfile` |
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
- Set `RAILWAY_DOCKERFILE_PATH` as a Variable, same as server — see table below.
- **Settings → Networking → Generate Domain**: enable this — this is the service the browser hits.

**Variables:**

| Variable | Value |
|---|---|
| `RAILWAY_DOCKERFILE_PATH` | `/client/Dockerfile` |
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
- **Force the Dockerfile builder via the `RAILWAY_DOCKERFILE_PATH` variable, not the dashboard.**
  Railway auto-detects a Dockerfile only if it's literally named `Dockerfile` at the service's
  source root; for a nested monorepo Dockerfile like this repo's, that auto-detection never fires.
  In principle the Settings → Build "Builder" dropdown + "Config-as-code path"/`railway.json` are
  supposed to override this, but in practice both were observed to silently not take effect for
  this repo — the build kept falling back to Railpack (which then fails trying to guess a Node
  entrypoint, since there's no root-level `package.json` main/index file) even after setting them.
  Setting `RAILWAY_DOCKERFILE_PATH=/server/Dockerfile` (or `/client/Dockerfile`) as a plain
  environment **Variable** on the service is the mechanism that actually works — it's read directly
  by Railway's build step, independent of whatever the Settings UI shows. Leading slash, absolute
  from the repo root, same as the `railway.json`/`Dockerfile` naming convention below.
- **`railway.json` per service, not one at the repo root.** Railway's schema has no multi-service
  `services` key, so one file can't configure both. These still exist in the repo and are harmless,
  but `RAILWAY_DOCKERFILE_PATH` is the one that reliably forces the Dockerfile builder — treat the
  `railway.json` files as a secondary, best-effort config-as-code path rather than the primary fix.

## Verifying

- `server`'s `/health` route runs `SELECT 1` against the DB — Railway's healthcheck (configured in
  `server/railway.json`) hits this automatically on every deploy.
- Once both services are up, visit the client's public domain, log in with the seed admin
  credentials, and confirm you land on `/dashboard`.
