import "dotenv/config";
import { Role, TicketCategory, TicketStatus } from "../generated/prisma";
import { prisma } from "../src/lib/prisma.ts";

type TicketTemplate = {
  category: TicketCategory;
  subject: string;
  body: string;
  reply: string;
};

const GENERAL_QUESTION_TEMPLATES: TicketTemplate[] = [
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "How do I reset my password?",
    body: "Hi, I forgot my password and the reset email never arrived. Can you help me get back into my account?",
    reply: "Hi! I've just resent the reset link to your inbox — it can take a couple of minutes to arrive. Let me know if it still doesn't show up.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "Can I change the email address on my account?",
    body: "I switched jobs and need to update the email associated with my account to my new work address. What's the process for that?",
    reply: "Sure thing — I've updated your account email as requested. You'll get a confirmation link at the new address, please click it to finish verifying.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "Where can I download my invoice history?",
    body: "I need last quarter's invoices for our bookkeeping. Is there a place in the dashboard to download them as PDFs?",
    reply: "You can find all past invoices under Billing > History — each one has a download icon. Let me know if any are missing.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "How do I upgrade from the Starter to the Pro plan?",
    body: "We've outgrown the Starter plan's seat limit. What are the steps to upgrade to Pro, and will we be charged a prorated amount?",
    reply: "Upgrading is available anytime from Settings > Plan — it's prorated automatically, so you'll only pay the difference for the rest of this cycle.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "Is there a mobile app for iOS?",
    body: "My team is mostly on the road and would love a mobile app. Do you have one, or is a browser tab the only option right now?",
    reply: "We don't have a native app yet, but the web dashboard is fully responsive and works well on mobile Safari in the meantime.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "How do I invite a new teammate to our workspace?",
    body: "We just hired a new support agent and I can't find where to send them an invite. Where is that option?",
    reply: "You can invite teammates from Settings > Team > Invite Member — just enter their email and choose a role.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "What are your support hours?",
    body: "Quick question before I escalate something urgent — what timezone and hours is your support team staffed?",
    reply: "Our team covers 8am–8pm ET, Monday through Friday, with limited weekend coverage for urgent issues.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "Can I export our data to CSV?",
    body: "We're evaluating a few tools in parallel and want to make sure we're not locked in. Is a full CSV export available?",
    reply: "Yes, go to Settings > Data > Export — it packages everything into a CSV you can download immediately.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "How do I cancel my subscription?",
    body: "We've decided to go a different direction internally. Can you point me to where I cancel, or do I need to do that through you?",
    reply: "Sorry to see you go! You can cancel any time from Settings > Plan > Cancel Subscription — no need to go through us.",
  },
  {
    category: TicketCategory.GENERAL_QUESTION,
    subject: "Do you offer a free trial for the annual plan?",
    body: "I'd like to try the annual plan's extra features before committing for a full year. Is there a trial period?",
    reply: "The annual plan includes the same 14-day trial as monthly — you won't be charged until the trial ends.",
  },
];

const TECHNICAL_QUESTION_TEMPLATES: TicketTemplate[] = [
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "Dashboard shows a 500 error on load",
    body: "Every time I log in, the dashboard throws a 500 error and won't render. This started happening this morning.",
    reply: "Thanks for flagging this — we identified a bad deploy and rolled it back. Can you refresh and confirm it's working now?",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "API requests timing out intermittently",
    body: "About 1 in 10 of our API calls to /v1/records are timing out after 30s with no response body. Is there a known issue?",
    reply: "We're seeing elevated latency on that endpoint from a downstream dependency and are actively working on a fix — I'll update this ticket once it's resolved.",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "Webhook deliveries aren't reaching our endpoint",
    body: "We haven't received a single webhook event since yesterday, but the delivery log on your side shows them as 'sent'. Any ideas?",
    reply: "Your endpoint was returning a 308 redirect, which we don't automatically follow. Updating it to respond 200 directly should fix delivery.",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "Login page shows a blank screen on Safari",
    body: "On the latest Safari on macOS, the login page just renders blank white. Works fine on Chrome. Any known compatibility issue?",
    reply: "This was a Safari-specific bundling bug — it's fixed in today's release. Please hard-refresh (Cmd+Shift+R) and let me know if it persists.",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "CSV export is missing the last column",
    body: "When I export tickets to CSV, the 'assigned to' column is always cut off at the end of the file. Reproducible every time.",
    reply: "Good catch, that was a trailing-delimiter bug in the export job — it's queued for the next release. I'll follow up here once it ships.",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "Two-factor codes aren't arriving via SMS",
    body: "I enabled 2FA last week and haven't received a single SMS code since, so I'm locked out of the account. Can you help?",
    reply: "I've temporarily disabled 2FA on your account so you can log back in — please re-enable it using the authenticator app option instead, which has been more reliable.",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "Search results don't update in real time",
    body: "New tickets don't show up in search until I manually reload the page. Is live search supposed to work without a refresh?",
    reply: "You're right, that's a caching bug in the search index — a fix is rolling out today. Refreshing will work as a workaround until then.",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "File uploads fail for anything over 10MB",
    body: "We're trying to attach screen recordings to tickets and anything over roughly 10MB just fails silently with no error message.",
    reply: "That's an undocumented server-side limit — we're raising it to 50MB and adding a proper error message in the meantime.",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "SSO login redirects to an error page",
    body: "Since this morning, clicking 'Log in with SSO' takes our team to a generic error page instead of our identity provider.",
    reply: "We found a misconfigured redirect URI after a recent update — it's corrected now, could you try logging in again?",
  },
  {
    category: TicketCategory.TECHNICAL_QUESTION,
    subject: "Push notifications are duplicated on mobile web",
    body: "I'm getting every notification twice within a second of each other when using the site on my phone. Desktop is fine.",
    reply: "This turned out to be a duplicate service-worker registration — clearing your site data once should stop the duplicates for good.",
  },
];

const REFUND_REQUEST_TEMPLATES: TicketTemplate[] = [
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Accidental duplicate charge this month",
    body: "I was charged twice for this month's subscription — once on the 1st and again on the 3rd. Could you refund the duplicate?",
    reply: "I can see the duplicate charge and have refunded it back to your original payment method — it should post within 5-7 business days.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Charged after I canceled my subscription",
    body: "I canceled last month but was still billed for this cycle. Can you refund this and confirm the cancellation actually went through?",
    reply: "I'm sorry about that — the cancellation didn't process correctly on our end. I've refunded the charge and confirmed your account is now fully canceled.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Refund for annual plan we no longer need",
    body: "We upgraded to annual billing but are downsizing the team significantly. Is a partial refund for unused months possible?",
    reply: "Since we're inside the 30-day window, I've processed a full refund for the annual plan — you'll see it back on your card shortly.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Billed twice in the same billing cycle",
    body: "Looking at my card statement, I see two identical charges from you this cycle. Please refund one of them.",
    reply: "Confirmed a billing system glitch on our end caused the double charge — the extra one has been refunded, apologies for the trouble.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Requesting a refund — the product didn't fit our workflow",
    body: "We gave it a real try for three weeks, but it doesn't fit how our support team actually works. Can we get a refund for this month?",
    reply: "Totally understand — I've refunded this month in full. If you ever want to share what didn't fit, I'd love to pass that feedback to the product team.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Downgrade wasn't prorated correctly",
    body: "I downgraded from Pro to Starter mid-cycle but was still charged the full Pro rate. Shouldn't that have been prorated?",
    reply: "You're right, the proration didn't apply — I've refunded the difference between the Pro and Starter rates for the remainder of the cycle.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Accidentally purchased the wrong plan",
    body: "I meant to buy the Team plan but clicked into Enterprise by mistake at checkout. Can this be corrected and the difference refunded?",
    reply: "No problem, I've swapped you to the Team plan and refunded the price difference to your card.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Refund requested due to extended outage",
    body: "Your service was down for most of last Tuesday, which caused real disruption for our team. Can we get a credit or refund for that day?",
    reply: "Absolutely fair — I've issued a one-day service credit to your account to cover Tuesday's outage.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Trial converted to paid without notice",
    body: "I didn't realize the trial had ended and was charged the full annual amount. I would have canceled if I'd gotten a heads up.",
    reply: "I hear you — we've refunded the annual charge in full and added an extra 14-day trial extension so you have time to decide.",
  },
  {
    category: TicketCategory.REFUND_REQUEST,
    subject: "Coupon code didn't apply at checkout",
    body: "I had a 20% off coupon that didn't apply when I checked out, so I was overcharged. Can you refund the difference?",
    reply: "I've applied the 20% discount retroactively and refunded the overcharged amount to your card.",
  },
];

const ALL_TEMPLATES = [...GENERAL_QUESTION_TEMPLATES, ...TECHNICAL_QUESTION_TEMPLATES, ...REFUND_REQUEST_TEMPLATES];

const FIRST_NAMES = [
  "Sarah", "Michael", "Emily", "David", "Jessica", "James", "Amanda", "Robert",
  "Lisa", "Christopher", "Michelle", "Daniel", "Ashley", "Matthew", "Jennifer",
  "Andrew", "Nicole", "Joshua", "Stephanie", "Ryan", "Rachel", "Brandon",
  "Laura", "Kevin", "Megan", "Tyler", "Samantha", "Justin", "Victoria", "Nathan",
];

const LAST_NAMES = [
  "Chen", "Rodriguez", "Johnson", "Kim", "Patel", "Wilson", "Garcia", "Martinez",
  "Anderson", "Lee", "Thompson", "Brown", "Davis", "Taylor", "White", "Harris",
  "Clark", "Lewis", "Walker", "Hall", "Young", "King", "Wright", "Scott",
  "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell",
];

const COMPANY_DOMAINS = [
  "acme.co", "globex.io", "initech.com", "umbrella-corp.com", "stark-industries.com",
  "wayneenterprises.com", "hooli.io", "piedpiper.io", "dundermifflin.com",
  "vandelayindustries.com", "gringottsbank.co", "cyberdyne.io", "aperturescience.com",
  "monsters-inc.com", "oscorp.com",
];

const STATUS_WEIGHTS: [TicketStatus, number][] = [
  [TicketStatus.OPEN, 0.45],
  [TicketStatus.RESOLVED, 0.3],
  [TicketStatus.CLOSED, 0.25],
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function pickWeighted<T>(weighted: [T, number][]): T {
  const roll = Math.random();
  let cumulative = 0;
  for (const [value, weight] of weighted) {
    cumulative += weight;
    if (roll <= cumulative) return value;
  }
  return weighted[weighted.length - 1]![0];
}

function randomDateWithinLastDays(days: number): Date {
  const now = Date.now();
  const offsetMs = Math.random() * days * 24 * 60 * 60 * 1000;
  return new Date(now - offsetMs);
}

function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function main() {
  // Raw SQL, not the typed `prisma.user` client — `deletedAt` was added via
  // a hand-applied migration (see prisma/migrations) that the generated
  // client is unaware of (see e2e_instruction.md).
  const agents = await prisma.$queryRaw<{ id: string; name: string; email: string }[]>`
    SELECT "id", "name", "email" FROM "user" WHERE "role" = ${Role.AGENT} AND "deletedAt" IS NULL
  `;
  if (agents.length === 0) {
    console.warn("No AGENT users found — all seeded tickets will be left unassigned.");
  }

  const TICKET_COUNT = 100;

  for (let i = 0; i < TICKET_COUNT; i++) {
    const template = pick(ALL_TEMPLATES);
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const domain = pick(COMPANY_DOMAINS);
    const fromName = `${firstName} ${lastName}`;
    const fromEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;

    const status = pickWeighted(STATUS_WEIGHTS);
    const assignedAgent = agents.length > 0 && Math.random() < 0.55 ? pick(agents) : null;
    const createdAt = randomDateWithinLastDays(60);

    const ticket = await prisma.ticket.create({
      data: {
        subject: template.subject,
        body: template.body,
        fromEmail,
        fromName,
        status,
        category: template.category,
        createdAt,
        assignedTo: assignedAgent ? { connect: { id: assignedAgent.id } } : undefined,
      },
    });

    await prisma.message.create({
      data: {
        body: template.body,
        fromEmail,
        fromName,
        isAgent: false,
        createdAt,
        ticketId: ticket.id,
      },
    });

    // Resolved/closed tickets get an agent reply in the thread; open ones
    // are left as a fresh, unanswered inbound message.
    if (status !== TicketStatus.OPEN) {
      const replyAgent = assignedAgent ?? pick(agents.length > 0 ? agents : [null]);
      if (replyAgent) {
        await prisma.message.create({
          data: {
            body: template.reply,
            fromEmail: replyAgent.email,
            fromName: replyAgent.name,
            isAgent: true,
            createdAt: minutesAfter(createdAt, 30 + Math.random() * 600),
            ticketId: ticket.id,
          },
        });
      }
    }

    process.stdout.write(`\rSeeded ${i + 1}/${TICKET_COUNT} tickets`);
  }

  console.log(`\nDone — created ${TICKET_COUNT} tickets.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
