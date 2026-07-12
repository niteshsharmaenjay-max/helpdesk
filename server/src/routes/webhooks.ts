import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.ts";

export const webhooksRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_EMAIL_ADDRESS = (process.env.SUPPORT_EMAIL_ADDRESS ?? "support@helpdesk.test").toLowerCase();

// Postmark's inbound webhook is secured with HTTP Basic Auth configured
// directly on the webhook URL (https://user:pass@host/...), not a
// signature header — see https://postmarkapp.com/support/article/1052.
function requireInboundEmailAuth(req: Request, res: Response, next: NextFunction) {
  const expectedUser = process.env.INBOUND_EMAIL_WEBHOOK_USER;
  const expectedPassword = process.env.INBOUND_EMAIL_WEBHOOK_PASSWORD;

  const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user, password] = Buffer.from(encoded, "base64").toString("utf-8").split(":");
  if (!expectedUser || !expectedPassword || user !== expectedUser || password !== expectedPassword) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type PostmarkInboundPayload = {
  MessageID?: string;
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  ToFull?: { Email?: string; Name?: string }[];
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
};

async function findMessageByProviderMessageId(providerMessageId: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Message" WHERE "providerMessageId" = ${providerMessageId} LIMIT 1
  `;
  return rows[0] ?? null;
}

// `providerMessageId` was added via a hand-applied migration (see
// prisma/migrations/20260703160500_add_message_provider_id) rather than
// `prisma migrate`/`prisma generate`, which crash in this environment (see
// e2e_instruction.md). The generated Prisma client is unaware of the
// column, so inbound messages are inserted with raw SQL instead of the
// typed `prisma.message` API.
async function insertInboundMessage(params: {
  ticketId: string;
  body: string;
  fromEmail: string;
  fromName: string;
  providerMessageId: string;
}) {
  const id = randomUUID();
  // A bound JS Date parameter (not SQL `now()`) — the DB session's
  // timezone isn't necessarily UTC, and `now()` would get stored as a
  // naive local-time value that Prisma's own UTC-assuming reads (e.g.
  // Ticket.createdAt, set client-side) would then misinterpret.
  const createdAt = new Date();
  await prisma.$executeRaw`
    INSERT INTO "Message" ("id", "body", "fromEmail", "fromName", "isAgent", "createdAt", "ticketId", "providerMessageId")
    VALUES (${id}, ${params.body}, ${params.fromEmail}, ${params.fromName}, false, ${createdAt}, ${params.ticketId}, ${params.providerMessageId})
  `;
  return id;
}

// Receives Postmark's inbound-parse webhook for the support address and
// converts each email into a ticket: a reply from a sender with an
// already-open (non-CLOSED) ticket is threaded onto it as a new Message
// (reopening it if it was RESOLVED); otherwise a new Ticket is created.
webhooksRouter.post("/inbound-email", requireInboundEmailAuth, async (req, res) => {
  const payload = (req.body ?? {}) as PostmarkInboundPayload;

  const providerMessageId = payload.MessageID;
  const fromEmail = (payload.FromFull?.Email ?? payload.From ?? "").trim().toLowerCase();
  const fromName = payload.FromFull?.Name || payload.FromName || fromEmail;
  const subject = payload.Subject?.trim() || "(no subject)";
  const body = payload.TextBody?.trim() || stripHtml(payload.HtmlBody ?? "");
  const toAddresses = (payload.ToFull ?? []).map((to) => (to.Email ?? "").trim().toLowerCase());

  if (!providerMessageId || !EMAIL_PATTERN.test(fromEmail) || !body) {
    res.status(400).json({ error: "Malformed inbound email payload" });
    return;
  }

  if (!toAddresses.includes(SUPPORT_EMAIL_ADDRESS)) {
    // Not addressed to the support inbox — acknowledge so the provider
    // doesn't retry, but don't create a ticket for it.
    res.status(200).json({ status: "ignored" });
    return;
  }

  const existingMessage = await findMessageByProviderMessageId(providerMessageId);
  if (existingMessage) {
    res.status(200).json({ status: "duplicate" });
    return;
  }

  const openTicket = await prisma.ticket.findFirst({
    where: { fromEmail, status: { not: "CLOSED" } },
    orderBy: { updatedAt: "desc" },
  });

  let ticketId: string;
  if (openTicket) {
    ticketId = openTicket.id;
    // Bump updatedAt and reopen if the customer replied to a resolved ticket.
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "OPEN" } });
  } else {
    const created = await prisma.ticket.create({
      data: { subject, body, fromEmail, fromName, status: "OPEN" },
    });
    ticketId = created.id;
  }

  await insertInboundMessage({ ticketId, body, fromEmail, fromName, providerMessageId });

  res.status(openTicket ? 200 : 201).json({ status: "ok", ticketId });
});
