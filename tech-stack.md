# Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React with TypeScript |
| **Backend** | Node.js with Express |
| **Database** | PostgreSQL |
| **ORM** | Prisma |
| **AI** | OpenAI API |
| **Auth** | JWT-based authentication |
| **Email (outbound)** | Nodemailer |
| **Email (inbound)** | Webhook-based parsing (SendGrid Inbound Parse / Mailgun Routes / Postmark) |
| **Job queue** | BullMQ + Redis (async classification, summaries, reply generation) |
| **Real-time updates** | Socket.io (live ticket list/status on the dashboard) |
| **Testing** | Vitest/Jest + Supertest (API), Playwright (e2e) |
| **Deployment** | Docker Compose (app + Postgres + Redis) |
