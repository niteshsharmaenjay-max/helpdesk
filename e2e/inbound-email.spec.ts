import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { expect, test, type APIRequestContext } from "@playwright/test";

const WEBHOOK_USER = "postmark-e2e";
const WEBHOOK_PASSWORD = "e2e-inbound-webhook-password";
const SUPPORT_EMAIL = "support@helpdesk.test";
const BASIC_AUTH = `Basic ${Buffer.from(`${WEBHOOK_USER}:${WEBHOOK_PASSWORD}`).toString("base64")}`;

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

// Each test gets its own sender address so tests running in parallel (the
// suite runs `fullyParallel`, against a database that's only reset once for
// the whole run) never see each other's tickets.
function uniqueSender(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

function postmarkPayload(fromEmail: string, overrides: Partial<Record<string, unknown>> = {}) {
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    MessageID: messageId,
    From: fromEmail,
    FromName: "Curious Customer",
    FromFull: { Email: fromEmail, Name: "Curious Customer" },
    ToFull: [{ Email: SUPPORT_EMAIL, Name: "Support" }],
    Subject: "I need help with my order",
    TextBody: "My order hasn't arrived yet, can you help?",
    HtmlBody: "<p>My order hasn't arrived yet, can you help?</p>",
    ...overrides,
  };
}

async function postInboundEmail(
  request: APIRequestContext,
  payload: Record<string, unknown>,
  { auth = true }: { auth?: boolean } = {},
) {
  return request.post("/api/webhooks/inbound-email", {
    data: payload,
    headers: auth ? { Authorization: BASIC_AUTH } : {},
  });
}

test.describe("Inbound email → ticket", () => {
  test("creates a new ticket and message from a first-time sender", async ({ request }) => {
    const fromEmail = uniqueSender("first-time");
    const payload = postmarkPayload(fromEmail);

    const response = await postInboundEmail(request, payload);
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("ok");

    const tickets = await queryDb(`SELECT * FROM "Ticket" WHERE id = $1`, [body.ticketId]);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      subject: payload.Subject,
      body: payload.TextBody,
      fromEmail,
      fromName: "Curious Customer",
      status: "OPEN",
    });

    const messages = await queryDb(`SELECT * FROM "Message" WHERE "ticketId" = $1`, [body.ticketId]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      body: payload.TextBody,
      fromEmail,
      isAgent: false,
      providerMessageId: payload.MessageID,
    });
  });

  test("falls back to a stripped HtmlBody when TextBody is missing", async ({ request }) => {
    const fromEmail = uniqueSender("html-only");
    const payload = postmarkPayload(fromEmail, { TextBody: undefined, HtmlBody: "<p>Only <b>html</b> here</p>" });

    const response = await postInboundEmail(request, payload);
    expect(response.status()).toBe(201);
    const { ticketId } = await response.json();

    const tickets = await queryDb(`SELECT body FROM "Ticket" WHERE id = $1`, [ticketId]);
    expect(tickets[0]?.body).toBe("Only html here");
  });

  test("threads a reply from the same sender onto the existing open ticket", async ({ request }) => {
    const fromEmail = uniqueSender("threaded");
    const first = postmarkPayload(fromEmail);
    const firstResponse = await postInboundEmail(request, first);
    expect(firstResponse.status()).toBe(201);
    const { ticketId } = await firstResponse.json();

    const reply = postmarkPayload(fromEmail, { Subject: "Re: I need help with my order", TextBody: "Any update?" });
    const replyResponse = await postInboundEmail(request, reply);
    expect(replyResponse.status()).toBe(200);
    const replyBody = await replyResponse.json();
    expect(replyBody.ticketId).toBe(ticketId);

    const tickets = await queryDb(`SELECT * FROM "Ticket" WHERE "fromEmail" = $1`, [fromEmail]);
    expect(tickets).toHaveLength(1);

    const messages = await queryDb(`SELECT * FROM "Message" WHERE "ticketId" = $1 ORDER BY "createdAt"`, [ticketId]);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ body: "Any update?", providerMessageId: reply.MessageID });
  });

  test("reopens a resolved ticket when the customer replies", async ({ request }) => {
    const fromEmail = uniqueSender("reopen");
    const first = postmarkPayload(fromEmail);
    const firstResponse = await postInboundEmail(request, first);
    const { ticketId } = await firstResponse.json();

    await queryDb(`UPDATE "Ticket" SET status = 'RESOLVED' WHERE id = $1`, [ticketId]);

    const reply = postmarkPayload(fromEmail, { Subject: "Re: I need help with my order" });
    const replyResponse = await postInboundEmail(request, reply);
    expect(replyResponse.status()).toBe(200);

    const tickets = await queryDb(`SELECT status FROM "Ticket" WHERE id = $1`, [ticketId]);
    expect(tickets[0]?.status).toBe("OPEN");
  });

  test("is idempotent when the same MessageID is redelivered", async ({ request }) => {
    const fromEmail = uniqueSender("idempotent");
    const payload = postmarkPayload(fromEmail);

    const first = await postInboundEmail(request, payload);
    expect(first.status()).toBe(201);

    const redelivered = await postInboundEmail(request, payload);
    expect(redelivered.status()).toBe(200);
    const body = await redelivered.json();
    expect(body.status).toBe("duplicate");

    const messages = await queryDb(`SELECT * FROM "Message" WHERE "providerMessageId" = $1`, [payload.MessageID]);
    expect(messages).toHaveLength(1);
  });

  test("acknowledges without creating a ticket when not addressed to the support inbox", async ({ request }) => {
    const fromEmail = uniqueSender("wrong-inbox");
    const payload = postmarkPayload(fromEmail, { ToFull: [{ Email: "someone-else@example.com", Name: "Someone Else" }] });

    const response = await postInboundEmail(request, payload);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");

    const tickets = await queryDb(`SELECT * FROM "Ticket" WHERE "fromEmail" = $1`, [fromEmail]);
    expect(tickets).toHaveLength(0);
  });

  test("rejects requests without valid Basic Auth credentials", async ({ request }) => {
    const fromEmail = uniqueSender("unauthorized");
    const payload = postmarkPayload(fromEmail);

    const response = await postInboundEmail(request, payload, { auth: false });
    expect(response.status()).toBe(401);

    const tickets = await queryDb(`SELECT * FROM "Ticket" WHERE "fromEmail" = $1`, [fromEmail]);
    expect(tickets).toHaveLength(0);
  });

  test("rejects a malformed payload", async ({ request }) => {
    const response = await postInboundEmail(request, { MessageID: "only-a-message-id" });
    expect(response.status()).toBe(400);
  });
});
