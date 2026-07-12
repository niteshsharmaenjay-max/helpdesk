import "dotenv/config";
import { Role } from "../generated/prisma";
import { auth } from "../src/lib/auth.ts";
import { prisma } from "../src/lib/prisma.ts";

type SeedUser = {
  email: string;
  password: string;
  name: string;
  role: Role;
};

const users: SeedUser[] = [
  {
    email: requireEnv("SEED_ADMIN_EMAIL"),
    password: requireEnv("SEED_ADMIN_PASSWORD"),
    name: process.env.SEED_ADMIN_NAME ?? "Admin",
    role: Role.ADMIN,
  },
  {
    email: requireEnv("SEED_AGENT_EMAIL"),
    password: requireEnv("SEED_AGENT_PASSWORD"),
    name: process.env.SEED_AGENT_NAME ?? "Agent",
    role: Role.AGENT,
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function seedUser(ctx: Awaited<typeof auth.$context>, user: SeedUser) {
  const existing = await ctx.internalAdapter.findUserByEmail(user.email);
  if (existing) {
    console.log(`Skipped (already exists): ${user.email}`);
    return;
  }

  const created = await ctx.internalAdapter.createUser({
    email: user.email,
    name: user.name,
    emailVerified: true,
    role: user.role,
  });

  const hashedPassword = await ctx.password.hash(user.password);
  await ctx.internalAdapter.linkAccount({
    accountId: created.id,
    providerId: "credential",
    password: hashedPassword,
    userId: created.id,
  });

  console.log(`Created ${user.role}: ${user.email}`);
}

async function main() {
  const ctx = await auth.$context;
  for (const user of users) {
    await seedUser(ctx, user);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
