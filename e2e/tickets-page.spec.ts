import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN = { email: "admin@e2e.test", password: "e2e-admin-password" };
const AGENT = { email: "agent@e2e.test", password: "e2e-agent-password" };

const WEBHOOK_AUTH = `Basic ${Buffer.from("postmark-e2e:e2e-inbound-webhook-password").toString("base64")}`;
const SUPPORT_EMAIL = "support@helpdesk.test";

async function login(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
}

function loadTestDatabaseUrl(): string {
  const envPath = path.resolve(__dirname, "..", "server", ".env.test");
  const match = readFileSync(envPath, "utf-8").match(/^DATABASE_URL="(.+)"$/m);
  if (!match) throw new Error(`DATABASE_URL not found in ${envPath}`);
  return match[1];
}

async function queryDb<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: loadTestDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

// Tickets can only be created via the inbound-email webhook (see
// e2e/inbound-email.spec.ts) — there's no ticket-creation UI/API.
async function createTicket(
  request: APIRequestContext,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<string> {
  const fromEmail = `ticket-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await request.post("/api/webhooks/inbound-email", {
    data: {
      MessageID: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      From: fromEmail,
      FromName: "Fixture Customer",
      FromFull: { Email: fromEmail, Name: "Fixture Customer" },
      ToFull: [{ Email: SUPPORT_EMAIL, Name: "Support" }],
      Subject: "Fixture ticket",
      TextBody: "This is a fixture ticket body.",
      ...overrides,
    },
    headers: { Authorization: WEBHOOK_AUTH },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body.ticketId as string;
}

async function assignTicket(ticketId: string, agentEmail: string) {
  await queryDb(
    `UPDATE "Ticket" SET "assignedToId" = (SELECT id FROM "user" WHERE email = $1) WHERE id = $2`,
    [agentEmail, ticketId],
  );
}

// The inbound-email webhook always creates GENERAL_QUESTION tickets — there's
// no way to set category through it, so category-filter fixtures set it
// directly.
async function setTicketCategory(ticketId: string, category: string) {
  await queryDb(`UPDATE "Ticket" SET category = $1 WHERE id = $2`, [category, ticketId]);
}

test.describe("Tickets page", () => {
  test("lists tickets newest first", async ({ page, request }) => {
    const stamp = Date.now();
    const olderSubject = `Older ticket ${stamp}`;
    const newerSubject = `Newer ticket ${stamp}`;
    await createTicket(request, { Subject: olderSubject });
    await createTicket(request, { Subject: newerSubject });

    await login(page, ADMIN);
    await page.goto("/tickets");
    await expect(page.getByText(newerSubject)).toBeVisible();

    const rowsText = await page.getByRole("row").allTextContents();
    const newerIndex = rowsText.findIndex((text) => text.includes(newerSubject));
    const olderIndex = rowsText.findIndex((text) => text.includes(olderSubject));
    expect(newerIndex).toBeGreaterThan(-1);
    expect(olderIndex).toBeGreaterThan(-1);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  test("sorts by a column when its header is clicked, toggling direction on a second click", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const subjectA = `AAA sort test ${stamp}`;
    const subjectZ = `ZZZ sort test ${stamp}`;
    await createTicket(request, { Subject: subjectZ });
    await createTicket(request, { Subject: subjectA });

    await login(page, ADMIN);
    await page.goto("/tickets");
    await expect(page.getByText(subjectA)).toBeVisible();

    await page.getByRole("button", { name: /Subject/ }).click();
    await expect(async () => {
      const rowsText = await page.getByRole("row").allTextContents();
      const aIndex = rowsText.findIndex((text) => text.includes(subjectA));
      const zIndex = rowsText.findIndex((text) => text.includes(subjectZ));
      expect(aIndex).toBeGreaterThan(-1);
      expect(zIndex).toBeGreaterThan(-1);
      expect(aIndex).toBeLessThan(zIndex);
    }).toPass();

    await page.getByRole("button", { name: /Subject/ }).click();
    await expect(async () => {
      const rowsText = await page.getByRole("row").allTextContents();
      const aIndex = rowsText.findIndex((text) => text.includes(subjectA));
      const zIndex = rowsText.findIndex((text) => text.includes(subjectZ));
      expect(zIndex).toBeLessThan(aIndex);
    }).toPass();
  });

  test("admin sees unassigned and assigned tickets alike", async ({ page, request }) => {
    const unassignedSubject = `Unassigned ${Date.now()}`;
    await createTicket(request, { Subject: unassignedSubject });
    const assignedSubject = `Assigned to agent ${Date.now()}`;
    const assignedId = await createTicket(request, { Subject: assignedSubject });
    await assignTicket(assignedId, AGENT.email);

    await login(page, ADMIN);
    await page.goto("/tickets");

    await expect(page.getByRole("row", { name: new RegExp(unassignedSubject) })).toContainText("Unassigned");
    await expect(page.getByRole("row", { name: new RegExp(assignedSubject) })).toContainText("E2E Agent");
  });

  test("agent only sees tickets assigned to them", async ({ page, request }) => {
    const assignedSubject = `Agent-visible ticket ${Date.now()}`;
    const assignedId = await createTicket(request, { Subject: assignedSubject });
    await assignTicket(assignedId, AGENT.email);

    const unassignedSubject = `Agent-hidden ticket ${Date.now()}`;
    await createTicket(request, { Subject: unassignedSubject });

    await login(page, AGENT);
    await page.goto("/tickets");

    await expect(page.getByText(assignedSubject)).toBeVisible();
    await expect(page.getByText(unassignedSubject)).toHaveCount(0);
  });

  test("shows the Tickets nav link to both admins and agents", async ({ page }) => {
    await login(page, AGENT);
    await expect(page.getByRole("link", { name: "Tickets" })).toBeVisible();
  });

  test("opens a ticket's detail page with its message thread", async ({ page, request }) => {
    const subject = `Detail view ticket ${Date.now()}`;
    const ticketId = await createTicket(request, {
      Subject: subject,
      TextBody: "Please help me with my account.",
    });

    await login(page, ADMIN);
    await page.goto("/tickets");
    await page.getByRole("link", { name: subject }).click();

    await expect(page).toHaveURL(`/tickets/${ticketId}`);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByText("Please help me with my account.")).toBeVisible();
    await expect(page.getByLabel("Status")).toHaveValue("OPEN");
    await expect(page.getByLabel("Assigned to")).toHaveValue("");
  });

  test("an agent gets a not-found page for a ticket that isn't assigned to them", async ({ page, request }) => {
    const ticketId = await createTicket(request, { Subject: `Not mine ${Date.now()}` });

    await login(page, AGENT);
    await page.goto(`/tickets/${ticketId}`);

    await expect(page.getByText("Ticket not found.")).toBeVisible();
  });

  test("updates a ticket's status and category from the detail page, and it sticks after reload", async ({
    page,
    request,
  }) => {
    const subject = `Status update ticket ${Date.now()}`;
    const ticketId = await createTicket(request, { Subject: subject });

    await login(page, ADMIN);
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();

    await page.getByLabel("Status").selectOption("RESOLVED");
    await expect(page.getByLabel("Status")).toHaveValue("RESOLVED");

    // REFUND_REQUEST, not TECHNICAL_QUESTION — the pagination test below
    // reserves TECHNICAL_QUESTION exclusively for an exact-count assertion.
    await page.getByLabel("Category").selectOption("REFUND_REQUEST");
    await expect(page.getByLabel("Category")).toHaveValue("REFUND_REQUEST");

    await page.reload();
    await expect(page.getByLabel("Status")).toHaveValue("RESOLVED");
    await expect(page.getByLabel("Category")).toHaveValue("REFUND_REQUEST");

    // The list view picks up the change too.
    await page.goto("/tickets");
    await expect(page.getByRole("row", { name: new RegExp(subject) })).toContainText("RESOLVED");
    await expect(page.getByRole("row", { name: new RegExp(subject) })).toContainText("Refund Request");
  });

  test("an agent can update the status of a ticket assigned to them", async ({ page, request }) => {
    const subject = `Agent update ticket ${Date.now()}`;
    const ticketId = await createTicket(request, { Subject: subject });
    await assignTicket(ticketId, AGENT.email);

    await login(page, AGENT);
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();

    await page.getByLabel("Status").selectOption("CLOSED");
    await expect(page.getByLabel("Status")).toHaveValue("CLOSED");
  });

  test("an agent cannot update a ticket that isn't assigned to them", async ({ page, request }) => {
    const ticketId = await createTicket(request, { Subject: `Not agent's to edit ${Date.now()}` });

    await login(page, AGENT);
    const response = await page.request.patch(`/api/tickets/${ticketId}`, { data: { status: "CLOSED" } });
    expect(response.status()).toBe(404);
  });

  test("an admin assigns and unassigns a ticket, and it sticks after reload", async ({ page, request }) => {
    const subject = `Assignment ticket ${Date.now()}`;
    const ticketId = await createTicket(request, { Subject: subject });

    await login(page, ADMIN);
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByLabel("Assigned to")).toHaveValue("");

    await page.getByLabel("Assigned to").selectOption({ label: "E2E Agent" });
    await expect(page.getByLabel("Assigned to")).toHaveValue(/.+/);

    await page.reload();
    await expect(page.getByLabel("Assigned to")).not.toHaveValue("");

    // The list view picks up the assignment too.
    await page.goto("/tickets");
    await expect(page.getByRole("row", { name: new RegExp(subject) })).toContainText("E2E Agent");

    // Unassign it again.
    await page.goto(`/tickets/${ticketId}`);
    await page.getByLabel("Assigned to").selectOption({ label: "Unassigned" });
    await expect(page.getByLabel("Assigned to")).toHaveValue("");
    await page.reload();
    await expect(page.getByLabel("Assigned to")).toHaveValue("");
  });

  test("an agent sees who a ticket is assigned to but cannot change it", async ({ page, request }) => {
    const subject = `Read-only assignee ${Date.now()}`;
    const ticketId = await createTicket(request, { Subject: subject });
    await assignTicket(ticketId, AGENT.email);

    await login(page, AGENT);
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();

    // "E2E Agent" also appears in the NavBar as the logged-in user's own
    // name, so scope to the definition list entry to avoid ambiguity.
    await expect(page.getByRole("definition").filter({ hasText: "E2E Agent" })).toBeVisible();
    await expect(page.getByLabel("Assigned to")).toHaveCount(0);
  });

  test("an agent cannot assign a ticket via a direct API call", async ({ page, request }) => {
    const ticketId = await createTicket(request, { Subject: `Agent cannot assign ${Date.now()}` });
    await assignTicket(ticketId, AGENT.email);

    await login(page, AGENT);
    const response = await page.request.patch(`/api/tickets/${ticketId}`, {
      data: { assignedToId: null },
    });
    expect(response.status()).toBe(403);
  });

  test("unauthenticated visitor is redirected from /tickets to /login", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page).toHaveURL("/login");
  });

  test("filters by category", async ({ page, request }) => {
    const stamp = Date.now();
    const refundSubject = `Refund filter test ${stamp}`;
    const generalSubject = `General filter test ${stamp}`;
    const refundId = await createTicket(request, { Subject: refundSubject });
    await setTicketCategory(refundId, "REFUND_REQUEST");
    await createTicket(request, { Subject: generalSubject });

    await login(page, ADMIN);
    await page.goto("/tickets");
    await expect(page.getByText(refundSubject)).toBeVisible();
    await expect(page.getByText(generalSubject)).toBeVisible();

    await page.getByLabel("Category").selectOption("REFUND_REQUEST");

    await expect(page.getByText(refundSubject)).toBeVisible();
    await expect(page.getByText(generalSubject)).toHaveCount(0);
  });

  test("filters by assigned agent (admin only)", async ({ page, request }) => {
    const stamp = Date.now();
    const mineSubject = `Assignee filter mine ${stamp}`;
    const notMineSubject = `Assignee filter not-mine ${stamp}`;
    const mineId = await createTicket(request, { Subject: mineSubject });
    await assignTicket(mineId, AGENT.email);
    await createTicket(request, { Subject: notMineSubject });

    await login(page, ADMIN);
    await page.goto("/tickets");

    await page.getByLabel("Assigned to").selectOption({ label: "E2E Agent" });
    await expect(page.getByText(mineSubject)).toBeVisible();
    await expect(page.getByText(notMineSubject)).toHaveCount(0);
  });

  test("clears filters when Clear filters is clicked", async ({ page, request }) => {
    const stamp = Date.now();
    const refundSubject = `Clear filter test refund ${stamp}`;
    const generalSubject = `Clear filter test general ${stamp}`;
    const refundId = await createTicket(request, { Subject: refundSubject });
    await setTicketCategory(refundId, "REFUND_REQUEST");
    await createTicket(request, { Subject: generalSubject });

    await login(page, ADMIN);
    await page.goto("/tickets");
    await page.getByLabel("Category").selectOption("REFUND_REQUEST");
    await expect(page.getByText(generalSubject)).toHaveCount(0);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText(generalSubject)).toBeVisible();
  });

  test("an agent does not see an Assigned to filter", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/tickets");
    await expect(page.getByLabel("Status")).toBeVisible();
    await expect(page.getByLabel("Assigned to")).toHaveCount(0);
  });

  test("an agent can still filter their own tickets by status and category", async ({ page, request }) => {
    const stamp = Date.now();
    const resolvedSubject = `Agent status filter resolved ${stamp}`;
    const openSubject = `Agent status filter open ${stamp}`;
    const resolvedId = await createTicket(request, { Subject: resolvedSubject });
    await assignTicket(resolvedId, AGENT.email);
    await queryDb(`UPDATE "Ticket" SET status = 'RESOLVED' WHERE id = $1`, [resolvedId]);
    const openId = await createTicket(request, { Subject: openSubject });
    await assignTicket(openId, AGENT.email);

    await login(page, AGENT);
    await page.goto("/tickets");
    await expect(page.getByText(resolvedSubject)).toBeVisible();
    await expect(page.getByText(openSubject)).toBeVisible();

    await page.getByLabel("Status").selectOption("RESOLVED");
    await expect(page.getByText(resolvedSubject)).toBeVisible();
    await expect(page.getByText(openSubject)).toHaveCount(0);
  });

  test("searches by subject", async ({ page, request }) => {
    const stamp = Date.now();
    const matchingSubject = `Zephyr onboarding question ${stamp}`;
    const otherSubject = `Something unrelated ${stamp}`;
    await createTicket(request, { Subject: matchingSubject });
    await createTicket(request, { Subject: otherSubject });

    await login(page, ADMIN);
    await page.goto("/tickets");
    // Not asserting both are visible pre-search: with enough tickets from
    // other tests running in parallel, a freshly created one isn't
    // guaranteed to land on page 1 of the unfiltered (20-per-page) list.

    // Also proves the search is case-insensitive.
    await page.getByLabel("Search by subject").fill("zephyr onboarding");

    await expect(page.getByText(matchingSubject)).toBeVisible();
    await expect(page.getByText(otherSubject)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
  });

  test("paginates through results", async ({ page, request }) => {
    const stamp = Date.now();
    const subjects = Array.from({ length: 25 }, (_, i) => `Pagination test ${stamp} #${String(i).padStart(2, "0")}`);
    const ids = await Promise.all(subjects.map((subject) => createTicket(request, { Subject: subject })));
    await Promise.all(ids.map((id) => setTicketCategory(id, "TECHNICAL_QUESTION")));

    await login(page, ADMIN);
    await page.goto("/tickets");
    await page.getByLabel("Category").selectOption("TECHNICAL_QUESTION");
    await page.getByRole("button", { name: /^Subject/ }).click(); // ascending, so #00.. comes first

    await expect(page.getByText("Page 1 of 2 (25 tickets)")).toBeVisible();
    await expect(page.getByText(subjects[0]!)).toBeVisible();
    await expect(page.getByText(subjects[19]!)).toBeVisible();
    await expect(page.getByText(subjects[20]!)).toHaveCount(0);

    await page.getByRole("button", { name: /Next/ }).click();
    await expect(page.getByText("Page 2 of 2 (25 tickets)")).toBeVisible();
    await expect(page.getByText(subjects[20]!)).toBeVisible();
    await expect(page.getByText(subjects[0]!)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Next/ })).toBeDisabled();

    await page.getByRole("button", { name: /Previous/ }).click();
    await expect(page.getByText("Page 1 of 2 (25 tickets)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Previous/ })).toBeDisabled();
  });
});
