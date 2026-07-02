import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Role } from "@prisma/client";
import { prisma } from "./prisma.ts";

const trustedOrigins = (
  process.env.TRUSTED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim());

export const auth = betterAuth({
  basePath: "/auth",
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    database: { generateId: false },
  },
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      role: {
        type: Object.values(Role),
        required: false,
        defaultValue: Role.AGENT,
        input: false,
      },
    },
  },
});
