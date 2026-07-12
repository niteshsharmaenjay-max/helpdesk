import { Router, type Request } from "express";
import { TicketCategory, TicketStatus, type Prisma } from "@prisma/client";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { prisma } from "../lib/prisma.ts";
import { requireRole } from "../middleware/requireRole.ts";
import { sendTicketReplyEmail } from "../lib/mailer.ts";

export const ticketsRouter = Router();

const TICKET_LIST_SELECT = {
  id: true,
  subject: true,
  fromEmail: true,
  fromName: true,
  status: true,
  category: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

// Columns the tickets table can be sorted by, mapped to how each one
// translates into a Prisma orderBy clause. Keyed on an allow-list (rather
// than trusting `sortBy` directly) so the query param can't be used to
// sort/probe arbitrary columns.
const TICKET_SORT_FIELDS: Record<string, (order: "asc" | "desc") => Prisma.TicketOrderByWithRelationInput> = {
  subject: (order) => ({ subject: order }),
  fromName: (order) => ({ fromName: order }),
  status: (order) => ({ status: order }),
  category: (order) => ({ category: order }),
  assignedTo: (order) => ({ assignedTo: { name: order } }),
  createdAt: (order) => ({ createdAt: order }),
};

function parseTicketSort(query: Request["query"]): Prisma.TicketOrderByWithRelationInput {
  const sortBy = typeof query.sortBy === "string" ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
  const buildOrderBy = TICKET_SORT_FIELDS[sortBy] ?? TICKET_SORT_FIELDS.createdAt!;
  return buildOrderBy(sortOrder);
}

// Builds the filter half of the list query from `?status=`, `?category=`,
// `?search=` (a case-insensitive subject substring match), and
// `?assignedTo=` (an agent's user id, or the literal "unassigned"). Values
// are validated against the enums / left off entirely rather than trusted
// as-is. `assignedTo` only applies for admins — an agent's results are
// always scoped to their own tickets regardless of what's passed, so the
// param would otherwise either be a no-op or contradict that scoping.
function parseTicketFilters(query: Request["query"], role: "ADMIN" | "AGENT", userId: string): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};

  if (role === "AGENT") {
    where.assignedToId = userId;
  } else {
    const assignedTo = typeof query.assignedTo === "string" ? query.assignedTo : undefined;
    if (assignedTo === "unassigned") {
      where.assignedToId = null;
    } else if (assignedTo) {
      where.assignedToId = assignedTo;
    }
  }

  const status = typeof query.status === "string" ? query.status : undefined;
  if (status && (Object.values(TicketStatus) as string[]).includes(status)) {
    where.status = status as TicketStatus;
  }

  const category = typeof query.category === "string" ? query.category : undefined;
  if (category && (Object.values(TicketCategory) as string[]).includes(category)) {
    where.category = category as TicketCategory;
  }

  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search) {
    where.subject = { contains: search, mode: "insensitive" };
  }

  return where;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parseTicketPagination(query: Request["query"]): { page: number; pageSize: number } {
  const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : NaN;
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawPageSize = typeof query.pageSize === "string" ? Number.parseInt(query.pageSize, 10) : NaN;
  const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  return { page, pageSize };
}

// List tickets, filtered, sorted, and paginated server-side (newest first
// by default). Admins see every ticket (optionally filtered by
// status/category/assignee); agents only ever see tickets assigned to them
// (per the domain model — admins assign, agents work assigned tickets).
ticketsRouter.get("/", requireRole("ADMIN", "AGENT"), async (req, res) => {
  const { session } = req;
  const where = parseTicketFilters(req.query, session!.user.role as "ADMIN" | "AGENT", session!.user.id);
  const { page, pageSize } = parseTicketPagination(req.query);

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      select: TICKET_LIST_SELECT,
      orderBy: parseTicketSort(req.query),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  res.json({ tickets, total, page, pageSize });
});

const TICKET_DETAIL_INCLUDE = {
  assignedTo: { select: { id: true, name: true } },
  messages: { orderBy: { createdAt: "asc" } },
} as const;

// True if this viewer is allowed to see/modify the ticket: admins can
// touch any ticket, agents only ones assigned to them.
function canAccessTicket(ticket: { assignedToId: string | null }, role: "ADMIN" | "AGENT", userId: string) {
  return role === "ADMIN" || ticket.assignedToId === userId;
}

// Ticket detail with its full message thread, oldest first. Agents get a
// 404 (not 403) for tickets that aren't assigned to them, so as not to
// reveal a ticket's existence to agents who can't see it.
ticketsRouter.get("/:id", requireRole("ADMIN", "AGENT"), async (req, res) => {
  const { session } = req;
  const id = req.params.id as string;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: TICKET_DETAIL_INCLUDE,
  });

  if (!ticket || !canAccessTicket(ticket, session!.user.role as "ADMIN" | "AGENT", session!.user.id)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json({ ticket });
});

// Raw SQL, not the typed `prisma.user` client — `deletedAt` was added via a
// hand-applied migration the generated client is unaware of (see
// e2e_instruction.md and users.ts).
async function findActiveAgent(id: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "user" WHERE "id" = ${id} AND "role" = 'AGENT' AND "deletedAt" IS NULL
  `;
  return rows[0] ?? null;
}

// Update a ticket's status, category, and/or assignee. Status/category
// follow the same visibility rule as the detail view: admins can update
// any ticket, agents only ones assigned to them (404, not 403, if not —
// matches GET /:id's not-found-not-forbidden behavior). Assigning is
// admin-only regardless (per the domain model — admins assign, agents
// work assigned tickets), enforced separately since an agent could
// otherwise pass `assignedToId` on a ticket that IS assigned to them.
ticketsRouter.patch("/:id", requireRole("ADMIN", "AGENT"), async (req, res) => {
  const { session } = req;
  const role = session!.user.role as "ADMIN" | "AGENT";
  const id = req.params.id as string;
  const { status, category, assignedToId } = req.body ?? {};

  const existing = await prisma.ticket.findUnique({ where: { id }, select: { assignedToId: true } });
  if (!existing || !canAccessTicket(existing, role, session!.user.id)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const data: Prisma.TicketUpdateInput = {};

  if (status !== undefined) {
    if (typeof status !== "string" || !(Object.values(TicketStatus) as string[]).includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    data.status = status as TicketStatus;
  }

  if (category !== undefined) {
    if (typeof category !== "string" || !(Object.values(TicketCategory) as string[]).includes(category)) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
    data.category = category as TicketCategory;
  }

  if (assignedToId !== undefined) {
    if (role !== "ADMIN") {
      res.status(403).json({ error: "Only admins can assign tickets" });
      return;
    }
    if (assignedToId === null) {
      data.assignedTo = { disconnect: true };
    } else {
      if (typeof assignedToId !== "string" || !(await findActiveAgent(assignedToId))) {
        res.status(400).json({ error: "Invalid assignee" });
        return;
      }
      data.assignedTo = { connect: { id: assignedToId } };
    }
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const ticket = await prisma.ticket.update({
    where: { id },
    data,
    include: TICKET_DETAIL_INCLUDE,
  });

  res.json({ ticket });
});

// Post an agent reply onto a ticket's message thread. Same visibility rule
// as GET/PATCH /:id: admins can reply to any ticket, agents only ones
// assigned to them (404 if not, to match the not-found-not-forbidden
// convention used elsewhere on this router). Unlike inbound customer
// emails (see webhooks.ts), agent replies have no providerMessageId, so
// they're written through the typed `prisma.message` API rather than raw SQL.
ticketsRouter.post("/:id/messages", requireRole("ADMIN", "AGENT"), async (req, res) => {
  const { session } = req;
  const role = session!.user.role as "ADMIN" | "AGENT";
  const id = req.params.id as string;

  const existing = await prisma.ticket.findUnique({
    where: { id },
    select: { assignedToId: true, subject: true, fromEmail: true },
  });
  if (!existing || !canAccessTicket(existing, role, session!.user.id)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) {
    res.status(400).json({ error: "Reply body is required" });
    return;
  }

  await prisma.message.create({
    data: {
      body,
      fromEmail: session!.user.email,
      fromName: session!.user.name,
      isAgent: true,
      ticketId: id,
    },
  });

  await sendTicketReplyEmail({
    to: existing.fromEmail,
    subject: `Re: ${existing.subject}`,
    body,
  });

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id },
    include: TICKET_DETAIL_INCLUDE,
  });

  res.status(201).json({ ticket });
});

const POLISH_SYSTEM_PROMPT = `You are helping a customer support agent polish a draft reply before sending it. \
Improve clarity, grammar, and tone (professional, friendly, empathetic) while preserving the original meaning and \
intent. Keep any specific facts, names, numbers, and commitments unchanged. Do not add a greeting/sign-off unless \
the draft already has one. Return only the rewritten reply text, with no commentary or quotes around it.`;

const SUMMARY_SYSTEM_PROMPT = `You are helping a customer support agent quickly catch up on a ticket. Write a concise \
summary (2-4 sentences) of the customer's issue and the conversation so far, including any commitments or \
resolutions made by the agent. Do not include greetings or sign-offs. Return only the summary text, with no \
commentary or quotes around it.`;

// Uses Gemini 2.5 Flash-Lite (via the Vercel AI SDK's Google provider) to
// summarize a ticket's full conversation history. Same visibility rule as
// the other per-ticket routes: 404 if this viewer can't access the ticket.
// Unlike polish-reply, the result IS persisted to `Ticket.aiSummary` — the
// summary is meant to be regenerated (overwriting the previous one) each
// time the agent clicks the summarize button, not kept ephemeral client-side.
ticketsRouter.post("/:id/summarize", requireRole("ADMIN", "AGENT"), async (req, res) => {
  const { session } = req;
  const role = session!.user.role as "ADMIN" | "AGENT";
  const id = req.params.id as string;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      assignedToId: true,
      subject: true,
      messages: { orderBy: { createdAt: "asc" }, select: { body: true, fromName: true, isAgent: true } },
    },
  });
  if (!ticket || !canAccessTicket(ticket, role, session!.user.id)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const conversation = ticket.messages
    .map((message) => `${message.isAgent ? "Agent" : "Customer"} (${message.fromName}): ${message.body}`)
    .join("\n\n");

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: `Ticket subject: ${ticket.subject}\n\nConversation:\n${conversation}`,
    });

    const updated = await prisma.ticket.update({
      where: { id },
      data: { aiSummary: text.trim() },
      include: TICKET_DETAIL_INCLUDE,
    });

    res.json({ ticket: updated });
  } catch (error) {
    console.error("Failed to summarize ticket:", error);
    res.status(502).json({ error: "Couldn't summarize the ticket. Please try again." });
  }
});

// Uses Gemini 2.5 Flash-Lite (via the Vercel AI SDK's Google provider) to
// rewrite an agent's in-progress draft reply. Same visibility rule as the other
// per-ticket routes: 404 if this viewer can't access the ticket. The
// ticket's subject and latest customer message are included as context so
// the rewrite stays relevant, but nothing is persisted here — the agent
// still has to review and submit the polished text via POST /:id/messages.
ticketsRouter.post("/:id/polish-reply", requireRole("ADMIN", "AGENT"), async (req, res) => {
  const { session } = req;
  const role = session!.user.role as "ADMIN" | "AGENT";
  const id = req.params.id as string;

  const draft = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!draft) {
    res.status(400).json({ error: "Reply body is required" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      assignedToId: true,
      subject: true,
      messages: { orderBy: { createdAt: "desc" }, where: { isAgent: false }, take: 1 },
    },
  });
  if (!ticket || !canAccessTicket(ticket, role, session!.user.id)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const lastCustomerMessage = ticket.messages[0]?.body;

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      system: POLISH_SYSTEM_PROMPT,
      prompt: [
        `Ticket subject: ${ticket.subject}`,
        lastCustomerMessage ? `Customer's message: ${lastCustomerMessage}` : null,
        `Agent's draft reply: ${draft}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    res.json({ text: text.trim() });
  } catch (error) {
    console.error("Failed to polish reply:", error);
    res.status(502).json({ error: "Couldn't polish the reply. Please try again." });
  }
});
