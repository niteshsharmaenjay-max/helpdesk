import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Role } from "../../generated/prisma";
import { prisma } from "./prisma.ts";

const trustedOrigins = (
  process.env.TRUSTED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim());

export const auth = betterAuth({
  // Matches the client's default basePath and the Express mount in
  // src/index.ts (`/api/auth/*splat`) — this server now serves the built
  // client directly, so there's no separate proxy stripping an /api prefix
  // in between; Better Auth's own basePath has to line up with the actual
  // incoming request path or it won't recognize its own routes.
  basePath: "/api/auth",
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    database: { generateId: false },
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    window: 60,
    max: 100,
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
