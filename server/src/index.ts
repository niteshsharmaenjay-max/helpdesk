import "dotenv/config";
import path from "node:path";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";
import { prisma } from "./lib/prisma.ts";
import { usersRouter } from "./routes/users.ts";
import { webhooksRouter } from "./routes/webhooks.ts";
import { ticketsRouter } from "./routes/tickets.ts";
import { analyticsRouter } from "./routes/analytics.ts";

const app = express();
const port = process.env.PORT ?? 3000;
const publicDir = path.join(import.meta.dir, "../public");

// Better Auth needs the raw request body, so it must be mounted before express.json().
// Routes live under /api so this single server can also serve the built client (below)
// on the same origin/port — no separate reverse proxy needed.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});

app.use("/api/users", usersRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/analytics", analyticsRouter);

// Built client assets (see Dockerfile — `client`'s `vite build` output is copied to
// server/public in the image). Anything not matched above falls through to the SPA's
// index.html so client-side routing (react-router) works on a hard refresh/direct link.
app.use(express.static(publicDir));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
