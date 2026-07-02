import "dotenv/config";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";
import { prisma } from "./lib/prisma.ts";

const app = express();
const port = process.env.PORT ?? 3000;

// Better Auth needs the raw request body, so it must be mounted before express.json().
app.all("/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
