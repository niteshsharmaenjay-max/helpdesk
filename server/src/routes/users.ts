import { Router } from "express";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../lib/prisma.ts";
import { auth } from "../lib/auth.ts";
import { requireRole } from "../middleware/requireRole.ts";

export const usersRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE_EMAIL_ERROR = "A user with this email already exists";

// `deletedAt` was added via a hand-applied migration (see
// prisma/migrations/20260703152432_add_user_soft_delete) rather than
// `prisma migrate`/`prisma generate`, which crash in this environment
// (see e2e_instruction.md). The generated Prisma client is therefore
// unaware of the column, so it's read/written with raw SQL here instead
// of through the typed `prisma.user` API.
async function findActiveOrDeletedUser(id: string) {
  const rows = await prisma.$queryRaw<{ id: string; role: Role; deletedAt: Date | null }[]>`
    SELECT "id", "role", "deletedAt" FROM "user" WHERE "id" = ${id}
  `;
  return rows[0] ?? null;
}

// List all non-deleted users — admin only.
usersRouter.get("/", requireRole("ADMIN"), async (_req, res) => {
  const users = await prisma.$queryRaw<
    { id: string; name: string; email: string; role: Role; emailVerified: boolean; createdAt: Date }[]
  >`
    SELECT "id", "name", "email", "role", "emailVerified", "createdAt"
    FROM "user"
    WHERE "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
  `;

  res.json({ users });
});

// Create a new user — admin only. Always created as AGENT; role is never
// taken from the request body since Better Auth's `input: false` on `role`
// only blocks its own public APIs, not a hand-rolled route reading raw JSON.
usersRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const { name, email, password } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length < 3) {
    res.status(400).json({ error: "Name must be at least 3 characters" });
    return;
  }

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    res.status(400).json({ error: "Enter a valid email" });
    return;
  }

  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const ctx = await auth.$context;

  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: DUPLICATE_EMAIL_ERROR });
    return;
  }

  try {
    const created = await ctx.internalAdapter.createUser({
      email: normalizedEmail,
      name: name.trim(),
      emailVerified: true,
      role: "AGENT",
    });

    const hashedPassword = await ctx.password.hash(password);
    await ctx.internalAdapter.linkAccount({
      accountId: created.id,
      providerId: "credential",
      password: hashedPassword,
      userId: created.id,
    });

    res.status(201).json({
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        emailVerified: created.emailVerified,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: DUPLICATE_EMAIL_ERROR });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Update a user's name, email, role, and (optionally) password — admin only.
// Password is only changed when a non-empty value is provided in the body.
usersRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const { name, email, role, password } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length < 3) {
    res.status(400).json({ error: "Name must be at least 3 characters" });
    return;
  }

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    res.status(400).json({ error: "Enter a valid email" });
    return;
  }

  if (role !== "ADMIN" && role !== "AGENT") {
    res.status(400).json({ error: "Role must be ADMIN or AGENT" });
    return;
  }

  const changePassword = typeof password === "string" && password.length > 0;
  if (changePassword && password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const existing = await findActiveOrDeletedUser(id);
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { name: name.trim(), email: normalizedEmail, role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (changePassword) {
      const ctx = await auth.$context;
      const hashedPassword = await ctx.password.hash(password);
      const accounts = await ctx.internalAdapter.findAccounts(id);
      if (accounts.some((account) => account.providerId === "credential")) {
        await ctx.internalAdapter.updatePassword(id, hashedPassword);
      } else {
        await ctx.internalAdapter.linkAccount({
          accountId: id,
          providerId: "credential",
          password: hashedPassword,
          userId: id,
        });
      }
    }

    res.json({ user: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: DUPLICATE_EMAIL_ERROR });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Soft-delete a user — admin only. Admins can't be deleted. Deleting a user
// revokes their active sessions so access is cut off immediately, even
// though their credentials remain in the database for record-keeping.
usersRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = req.params.id as string;

  const target = await findActiveOrDeletedUser(id);
  if (!target || target.deletedAt) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (target.role === "ADMIN") {
    res.status(400).json({ error: "Admin users can't be deleted" });
    return;
  }

  // A bound JS Date (not SQL `now()`) — the DB session's timezone isn't
  // UTC, so `now()` would be stored as a naive local-time value that gets
  // misread as UTC elsewhere.
  await prisma.$executeRaw`UPDATE "user" SET "deletedAt" = ${new Date()} WHERE "id" = ${id}`;

  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(id);

  res.status(204).send();
});
