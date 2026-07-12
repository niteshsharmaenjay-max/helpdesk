import "dotenv/config";
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

// Better Auth needs the raw request body, so it must be mounted before express.json().
app.all("/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});

app.use("/users", usersRouter);
app.use("/webhooks", webhooksRouter);
app.use("/tickets", ticketsRouter);
app.use("/analytics", analyticsRouter);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
