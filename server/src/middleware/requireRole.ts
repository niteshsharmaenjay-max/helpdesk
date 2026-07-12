import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Role } from "@prisma/client";
import { auth } from "../lib/auth.ts";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

declare module "express-serve-static-core" {
  interface Request {
    session?: NonNullable<Session>;
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!roles.includes(session.user.role as Role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    req.session = session;
    next();
  };
}
