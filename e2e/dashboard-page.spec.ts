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
async function createTicket(request: APIRequestContext): Promise<string> {
  const fromEmail = `dashboard-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await request.post("/api/webhooks/inbound-email", {
    data: {
      MessageID: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      From: fromEmail,
      FromName: "Fixture Customer",
      FromFull: { Email: fromEmail, Name: "Fixture Customer" },
      ToFull: [{ Email: SUPPORT_EMAIL, Name: "Support" }],
      Subject: "Dashboard fixture ticket",
      TextBody: "This is a fixture ticket body.",
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

test.describe("Dashboard page", () => {
  test("unauthenticated visitor is redirected from /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });

  test("admin sees the Dashboard nav link and its headline stats/charts", async ({ page }) => {
    await login(page, ADMIN);

    const dashboardLink = page.getByRole("link", { name: "Dashboard" });
    await expect(dashboardLink).toBeVisible();

    await dashboardLink.click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await expect(page.getByText("Total tickets")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tickets by status" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tickets by category" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tickets created, last 14 days" })).toBeVisible();
  });

  test("admin sees the agent workload chart once an agent has an open ticket assigned", async ({
    page,
    request,
  }) => {
    const ticketId = await createTicket(request);
    await assignTicket(ticketId, AGENT.email);

    await login(page, ADMIN);
    await page.goto("/dashboard");

    const workloadHeading = page.getByRole("heading", { name: "Open tickets by agent" });
    await expect(workloadHeading).toBeVisible();
    // recharts also renders a visually-hidden `#recharts_measurement_span` with
    // the same text for layout measurement, so scope to the axis tick's <tspan>
    // rather than `getByText`, which would hit both and violate strict mode.
    await expect(page.locator("tspan", { hasText: "E2E Agent" })).toBeVisible();
  });

  test("agent has no agent-workload chart on their dashboard", async ({ page }) => {
    await login(page, AGENT);

    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open tickets by agent" })).toHaveCount(0);
  });
});
