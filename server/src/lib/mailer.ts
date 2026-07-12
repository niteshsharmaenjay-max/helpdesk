import * as postmark from "postmark";

const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const POSTMARK_FROM_ADDRESS = process.env.POSTMARK_FROM_ADDRESS;

// Sends outbound mail through Postmark's HTTP API (same provider already
// used for inbound parsing — see webhooks.ts) instead of raw Gmail SMTP.
// `From` must be a verified Sender Signature/domain in the Postmark account.
const client = POSTMARK_SERVER_TOKEN ? new postmark.ServerClient(POSTMARK_SERVER_TOKEN) : null;

export async function sendTicketReplyEmail(params: {
  to: string;
  subject: string;
  body: string;
}) {
  if (!client || !POSTMARK_FROM_ADDRESS) {
    console.warn("POSTMARK_SERVER_TOKEN/POSTMARK_FROM_ADDRESS not configured — skipping outbound email send.");
    return;
  }

  await client.sendEmail({
    From: POSTMARK_FROM_ADDRESS,
    To: params.to,
    Subject: params.subject,
    TextBody: params.body,
  });
}
