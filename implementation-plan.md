# Implementation Plan

Reference: `project-scope.md`, `tech-stack.md`

## Phase 0 — Project Setup & Infrastructure

- [ ] Initialize monorepo structure (`/client`, `/server`)
- [ ] Set up Express + TypeScript backend skeleton
- [ ] Set up React + TypeScript frontend skeleton (Vite)
- [ ] Configure ESLint/Prettier for both packages
- [ ] Set up Docker Compose (Postgres, Redis, app)
- [ ] Set up environment config (`.env` handling, secrets)
- [ ] Initialize git repo, base CI (lint + test on PR)

## Phase 1 — Database & Core Models

- [ ] Set up Prisma with PostgreSQL connection
- [ ] Define `User` model (role: admin/agent)
- [ ] Define `Ticket` model (status, category, timestamps)
- [ ] Define `Message`/`Reply` model (ticket thread history)
- [ ] Define `KnowledgeBase` model (articles used for AI replies)
- [ ] Write and run initial migration
- [ ] Add seed script (default admin account)

## Phase 2 — Auth & User Management

- [ ] Implement JWT auth (login endpoint, token issuance)
- [ ] Implement password hashing (bcrypt) and login validation
- [ ] Implement auth middleware (role-based route protection)
- [ ] Admin: create/list/update/deactivate agent accounts
- [ ] Admin: assign tickets to agents
- [ ] Frontend: login page + auth context/token storage
- [ ] Frontend: protected routes by role

## Phase 3 — Ticket Ingestion (Inbound Email)

- [ ] Configure inbound email provider (SendGrid/Mailgun/Postmark webhook)
- [ ] Implement webhook endpoint to receive parsed emails
- [ ] Map inbound email → new `Ticket` + initial `Message`
- [ ] Handle threading (reply to existing ticket vs. new ticket)
- [ ] Error handling / dead-letter logging for malformed payloads

## Phase 4 — Ticket Management API

- [ ] `GET /tickets` with filtering (status, category, assignee) and sorting
- [ ] `GET /tickets/:id` detail endpoint (with message thread)
- [ ] `PATCH /tickets/:id` update status (open/resolved/closed)
- [ ] `PATCH /tickets/:id/assign` assign to agent
- [ ] `POST /tickets/:id/messages` agent sends reply (via Nodemailer)
- [ ] Pagination for ticket list endpoint

## Phase 5 — AI Features (Background Jobs)

- [ ] Set up BullMQ + Redis job queue
- [ ] Job: classify ticket into category on creation
- [ ] Job: generate AI summary of ticket thread
- [ ] Job: generate suggested reply using knowledge base (RAG-lite: retrieve relevant KB articles + prompt)
- [ ] Store AI outputs on ticket (category, summary, suggested reply)
- [ ] Retry/failure handling for AI job errors
- [ ] Admin/agent-facing endpoint to manage knowledge base articles

## Phase 6 — Frontend: Core Ticket Views

- [ ] Ticket list page (table, filters, sort, pagination)
- [ ] Ticket detail page (thread view, status, category, AI summary)
- [ ] Suggested reply UI (accept/edit/send)
- [ ] Status update controls (resolve/close)
- [ ] Reply composer (send message to customer)

## Phase 7 — Frontend: Dashboard & Admin

- [ ] Dashboard view (ticket counts by status/category, agent load)
- [ ] Admin: user management UI (create/edit/deactivate agents)
- [ ] Admin: ticket assignment UI
- [ ] Admin: knowledge base management UI

## Phase 8 — Real-time Updates

- [ ] Set up Socket.io server (auth-aware connections)
- [ ] Emit events on ticket create/update/assign
- [ ] Frontend: live-update ticket list and detail view on relevant events

## Phase 9 — Testing & QA

- [ ] Unit tests for auth, ticket, and AI job logic (Vitest/Jest)
- [ ] API integration tests (Supertest) for core endpoints
- [ ] E2E tests (Playwright): login, create ticket via email, agent reply, resolve
- [ ] Manual QA pass against `project-scope.md` requirements

## Phase 10 — Deployment

- [ ] Production Dockerfile(s) for client/server
- [ ] Docker Compose production config (Postgres, Redis, app, reverse proxy)
- [ ] Configure production email webhook + secrets
- [ ] Deployment smoke test + default admin account creation on first deploy
