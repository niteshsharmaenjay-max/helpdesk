# Writing E2E Tests

This project uses Playwright for end-to-end tests, running against an isolated test database so tests never touch dev data.

## How it's wired up

- Config: `playwright.config.ts` (repo root)
- Test files: `e2e/*.spec.ts`
- Test database: `helpdesk_test` (separate Postgres database from the dev `helpdesk` db)
- Test server: runs on port `3100` using `server/.env.test`
- Test client: runs on port `5273`, Vite proxies `/api` to port `3100` (via `VITE_API_PROXY_TARGET`)

Before each run, `e2e/global-setup.ts` runs `server/scripts/setup-test-db.ts`, which:
1. Creates the `helpdesk_test` database if it doesn't exist.
2. Drops and recreates the `public` schema, then replays the SQL in `server/prisma/migrations/*/migration.sql` directly (the Prisma CLI is currently broken in this environment — see note below).
3. Runs `server/prisma/seed.ts` against the test database to create the seed users.

Every test run starts from a clean, freshly-seeded database.

## Running tests

```bash
bun test:e2e              # run all e2e tests headless
bunx playwright test --ui # interactive UI mode, useful while writing tests
bunx playwright show-report
```

## Seed users

Credentials come from `server/.env.test`:

| Role  | Email             | Password             |
|-------|-------------------|-----------------------|
| ADMIN | admin@e2e.test    | e2e-admin-password    |
| AGENT | agent@e2e.test    | e2e-agent-password    |

These are test-only, gitignored, low-stakes credentials — fine to hardcode directly in spec files.

## Writing a new test case

1. Add a new file under `e2e/*.spec.ts`.
2. Use `page.goto('/some-path')` — `baseURL` (`http://localhost:5273`) is already configured, so relative paths work.
3. Prefer role/label-based locators over CSS selectors: `getByRole('button', { name: '...' })`, `getByLabel('...')`, `getByRole('heading', { name: '...' })`.
4. **Gotcha:** `getByLabel('Password')` also matches the "Show password" toggle button on the login form, because its `aria-label` contains the substring "password". Always use `getByLabel('Password', { exact: true })`.
5. If a test needs to start from a logged-in state, copy the `loginAs()` / `login()` helper pattern from `e2e/auth.spec.ts` or `e2e/users-page.spec.ts` (fills the login form and waits for the post-login redirect) rather than re-implementing it inline.
6. Group related tests with `test.describe(...)`.

## Calling the auth API directly

Some scenarios (sign-up actually being disabled server-side, role escalation via `update-user`, etc.) need to hit Better Auth's REST API directly instead of driving the UI — use the `request` fixture (anonymous) or `page.request` (carries the logged-in page's session cookies automatically).

**Gotcha:** the client's Better Auth instance defaults to base path `/api/auth`, not `/api`. The server mounts Better Auth at that same path (`app.all("/api/auth/*splat", ...)` in `server/src/index.ts` — the server serves the built client directly and routes everything under `/api`, so Vite's dev proxy forwards `/api/*` through unchanged, no prefix stripped). So every direct API call in a test must go to `/api/auth/<endpoint>`, e.g.:

```ts
await request.post("/api/auth/sign-up/email", { data: { email, password, name } });
await request.post("/api/auth/sign-in/email", { data: { email, password } });
await page.request.get("/api/auth/get-session");
await page.request.post("/api/auth/update-user", { data: { name, role: "ADMIN" } });
```

Dropping the `/auth` segment (e.g. `/api/sign-up/email`) doesn't error loudly — it silently 404s against Express's default error page instead of ever reaching Better Auth, so a test asserting `response.ok()` is falsy will pass for the *wrong* reason (route not found) rather than actually exercising the rejection logic. If you're asserting an API call was rejected, don't just check `response.ok()` — also verify the underlying effect didn't happen (e.g. the "rejected" sign-up test in `e2e/auth.spec.ts` also attempts a sign-in with that email afterward, and the role-escalation test re-fetches `/api/auth/get-session` to confirm the role is unchanged) so a wrong-path 404 can't masquerade as a passing test.

## Example

```ts
import { expect, test } from "@playwright/test";

test("redirects an unauthenticated visitor from / to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});
```

## Known environment issue

The Prisma CLI (`prisma generate`, `prisma migrate deploy`, etc.) currently crashes in this environment with `ERR_REQUIRE_ESM` (an upstream bug in the exact `prisma@7.8.0` / `@prisma/dev@0.24.3` pairing). This is why the test DB setup script applies migration SQL directly via `pg` instead of calling `prisma migrate deploy`. If you add a new Prisma migration, `server/scripts/setup-test-db.ts` will pick it up automatically (it replays every folder under `server/prisma/migrations`) — no changes needed there, but be aware `prisma generate` itself still won't work until this is fixed upstream or worked around.
