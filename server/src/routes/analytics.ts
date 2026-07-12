import { Router } from "express";
import { Prisma, TicketCategory, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.ts";
import { requireRole } from "../middleware/requireRole.ts";

export const analyticsRouter = Router();

const TICKETS_BY_DAY_WINDOW_DAYS = 14;

function scopedWhere(role: "ADMIN" | "AGENT", userId: string): Prisma.TicketWhereInput {
  return role === "AGENT" ? { assignedToId: userId } : {};
}

// Zero-fills a groupBy's `_count` rows against the full enum, since groupBy
// silently omits buckets with no rows (e.g. a brand new agent with zero
// REFUND_REQUEST tickets wouldn't otherwise appear as 0 in the response).
function zeroFillCounts<T extends string>(
  values: T[],
  rows: { count: number; value: T }[],
): Record<T, number> {
  const counts = Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
  for (const row of rows) counts[row.value] = row.count;
  return counts;
}

// Builds the last N days (oldest first, as ISO date strings) so the
// tickets-by-day chart has a zero-filled point for every day in the window,
// not just the days that happen to have a ticket.
function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - i);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

// Ticket analytics for the dashboard: status/category breakdown, ticket
// volume over the last two weeks, and (admin-only) open-ticket workload per
// agent. Scoping matches tickets.ts: agents only ever see their own tickets,
// admins see everything plus the cross-agent workload view.
analyticsRouter.get("/tickets", requireRole("ADMIN", "AGENT"), async (req, res) => {
  const { session } = req;
  const role = session!.user.role as "ADMIN" | "AGENT";
  const userId = session!.user.id;
  const where = scopedWhere(role, userId);

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (TICKETS_BY_DAY_WINDOW_DAYS - 1));

  const agentFilter = role === "AGENT" ? Prisma.sql`AND "assignedToId" = ${userId}` : Prisma.empty;

  const [totalTickets, statusRows, categoryRows, ticketsByDayRows] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["category"], where, _count: { _all: true } }),
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "Ticket"
      WHERE "createdAt" >= ${since} ${agentFilter}
      GROUP BY day
      ORDER BY day ASC
    `,
  ]);

  const statusCounts = zeroFillCounts(
    Object.values(TicketStatus),
    statusRows.map((row) => ({ value: row.status, count: row._count._all })),
  );
  const categoryCounts = zeroFillCounts(
    Object.values(TicketCategory),
    categoryRows.map((row) => ({ value: row.category, count: row._count._all })),
  );

  const countsByDay = new Map(
    ticketsByDayRows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]),
  );
  const ticketsByDay = lastNDays(TICKETS_BY_DAY_WINDOW_DAYS).map((date) => ({
    date,
    count: countsByDay.get(date) ?? 0,
  }));

  let agentWorkload: { agentId: string | null; agentName: string; openCount: number }[] | null = null;

  if (role === "ADMIN") {
    const workloadRows = await prisma.ticket.groupBy({
      by: ["assignedToId"],
      where: { status: { not: TicketStatus.CLOSED } },
      _count: { _all: true },
    });

    const agentIds = workloadRows.map((row) => row.assignedToId).filter((id): id is string => id !== null);
    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    });
    const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

    agentWorkload = workloadRows.map((row) => ({
      agentId: row.assignedToId,
      agentName: row.assignedToId ? (agentNames.get(row.assignedToId) ?? "Unknown agent") : "Unassigned",
      openCount: row._count._all,
    }));
  }

  res.json({ totalTickets, statusCounts, categoryCounts, ticketsByDay, agentWorkload });
});
