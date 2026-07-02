# Helpdesk — Claude Code Project Guide

## Project Overview

An AI-powered ticket management system for handling support emails. AI automatically classifies, summarizes, and suggests replies to tickets; agents handle complex cases via a dashboard.

## Architecture

Monorepo with two workspaces managed by Bun:

```
helpdesk/
├── client/      # React 19 + TypeScript + Vite frontend
└── server/      # Bun + Express 5 backend
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 8 |
| Backend | Bun runtime, Express 5, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| AI | OpenAI API |
| Auth | Better Auth (email/password, session cookies) |
| Email outbound | Nodemailer |
| Email inbound | Webhook parsing (SendGrid / Mailgun / Postmark) |
| Job queue | BullMQ + Redis |
| Real-time | Socket.io |
| Testing | Vitest/Jest + Supertest, Playwright (e2e) |
| Deployment | Docker Compose |

## Dev Commands

```bash
bun dev:client       # Start Vite dev server (client/)
bun dev:server       # Start server with --watch (server/)
bun build:client     # Production build of client
```

## Domain Model

**Ticket statuses:** Open → Resolved → Closed

**Ticket categories:** General Question · Technical Question · Refund Request

**User roles:**
- **Admin** — manages agents, assigns tickets, system settings
- **Agent** — views assigned tickets, responds, updates status

## Authentication

Auth is handled by **Better Auth** (`better-auth`), not raw JWTs — it manages sessions via HTTP-only cookies backed by the `Session` table in Postgres.

**Server** (`server/src/lib/auth.ts`):
- `betterAuth()` instance mounted at `basePath: "/auth"`, using the `prismaAdapter`.
- Mounted in `server/src/index.ts` as `app.all("/auth/*splat", toNodeHandler(auth))` — this **must** come before `express.json()`, since Better Auth needs the raw request body.
- `emailAndPassword: { enabled: true, disableSignUp: true }` — email/password only, self-registration is disabled. Users are provisioned only via the seed script or an admin flow, never a public sign-up endpoint.
- `role` is a custom `additionalFields` entry on `User` (`ADMIN` | `AGENT`, defaults to `AGENT`, `input: false` so clients can't set/escalate their own role).
- `trustedOrigins` is read from the `TRUSTED_ORIGINS` env var (comma-separated), defaulting to the local Vite dev origins.

**Client** (`client/src/lib/auth-client.ts`):
- `createAuthClient()` from `better-auth/react`, exporting `signIn`, `signUp`, `signOut`, `useSession`.
- `RequireAuth` (`client/src/components/RequireAuth.tsx`) wraps protected routes, reads `useSession()`, and redirects to `/login` when there's no session.
- `LoginForm` (`client/src/components/LoginForm.tsx`) calls `signIn.email({ email, password })`; there is no sign-up UI since sign-up is disabled server-side.

**Prisma models:** `User`, `Session`, `Account`, `Verification` (all Better Auth–managed; see `server/prisma/schema.prisma`). `User.role` drives authorization — check it in route handlers/middleware for admin-only actions (e.g. assigning agents, system settings).

**Env vars** (`server/.env`, see `server/.env` for actual values — never hardcode or print secrets):
- `BETTER_AUTH_SECRET` — session signing secret.
- `BETTER_AUTH_URL` — base URL Better Auth issues cookies/links against.
- `TRUSTED_ORIGINS` — comma-separated allowed origins for CORS/CSRF.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` and `SEED_AGENT_*` — used by `bun db:seed` (`server/prisma/seed.ts`) to create the initial admin/agent users.

**Adding protected server routes:** there is currently no Express auth middleware beyond the Better Auth handler itself — new routes that require a session must call `auth.api.getSession({ headers: req.headers })` (or equivalent) and check `session.user.role` themselves.

Use the **better-auth-best-practices** skill and the context7 library `/better-auth/better-auth` for Better Auth config/API questions.

## Fetching Up-to-Date Documentation

Always use the **context7 MCP server** to get current docs before working with any library, framework, or API in this project. Never rely on training-data knowledge alone — packages like React, Express, Prisma, BullMQ, Socket.io, Vite, and OpenAI release breaking changes frequently.

### How to use context7

1. Resolve the library ID first:
   ```
   mcp__context7__resolve-library-id  { "libraryName": "prisma" }
   ```
2. Then fetch focused docs:
   ```
   mcp__context7__query-docs  { "context7CompatibleLibraryID": "/prisma/prisma", "query": "schema migrations" }
   ```

### Key library IDs for this project

| Library | Query name |
|---------|-----------|
| React 19 | `react` |
| Express 5 | `expressjs/express` |
| Prisma | `prisma` |
| Vite | `vitejs/vite` |
| Better Auth | `better-auth/better-auth` |
| BullMQ | `bullmq` |
| Socket.io | `socketio/socket.io` |
| OpenAI Node SDK | `openai-node` |
| Nodemailer | `nodemailer` |
| TypeScript | `typescript` |
| Bun | `oven-sh/bun` |

Use context7 for: API syntax, config options, version migrations, setup instructions, CLI usage.
Skip context7 for: refactoring, business logic, code review, general programming concepts.
