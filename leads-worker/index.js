import { EmailMessage } from "cloudflare:email";

const NOTIFY_TO = "hello@clearlaw.ai";
// From-address must live on a zone with Email Routing enabled in this Cloudflare
// account; clearlaw.ai's DNS is on Route 53, so we send from the edgarready.ai zone.
const NOTIFY_FROM = "noreply@edgarready.ai";

const ALLOWED_ORIGINS = [
  "https://clearlaw.ai",
  "https://www.clearlaw.ai",
  "https://cl-jordan.github.io",
];

const FIELD_LIMITS = {
  name: 120,
  email: 200,
  firm: 200,
  phone: 60,
  matter: 300,
  message: 4000,
};

const SOURCES = ["home", "litigationos", "discovery-loop", "kaskad"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/lead") {
      return json({ error: "Not found" }, 404, request);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, request);
    }
    return handleLead(request, env);
  },
};

async function handleLead(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400, request);
  }

  // Honeypot: real users never fill this hidden field. Pretend success so bots move on.
  if (body.website) {
    return json({ ok: true }, 200, request);
  }

  const fields = {};
  for (const [key, max] of Object.entries(FIELD_LIMITS)) {
    const value = typeof body[key] === "string" ? body[key].trim() : "";
    if (value.length > max) {
      return json({ error: `Field "${key}" is too long` }, 400, request);
    }
    fields[key] = value;
  }
  fields.source = SOURCES.includes(body.source) ? body.source : "unknown";

  if (!fields.name || !fields.email) {
    return json({ error: "Please fill in your name and work email" }, 400, request);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return json({ error: "That email address doesn't look right" }, 400, request);
  }

  await env.DB.prepare(
    `INSERT INTO leads (name, email, firm, phone, matter, message, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      fields.name,
      fields.email,
      fields.firm,
      fields.phone,
      fields.matter,
      fields.message,
      fields.source
    )
    .run();

  // The lead is safely stored at this point; a notification failure shouldn't fail the request.
  try {
    await sendNotification(env, fields);
  } catch (err) {
    console.error("Notification email failed:", err);
  }

  return json({ ok: true }, 200, request);
}

async function sendNotification(env, fields) {
  const label =
    { home: "Clearlaw", litigationos: "LitigationOS", "discovery-loop": "Discovery Loop", kaskad: "Kaskad" }[
      fields.source
    ] || "Website";
  const subject = `${label} inquiry — ${fields.firm || fields.name}`;
  const bodyText = [
    `Name: ${fields.name}`,
    `Work email: ${fields.email}`,
    `Firm: ${fields.firm || "—"}`,
    `Phone: ${fields.phone || "—"}`,
    `Case / deadline: ${fields.matter || "—"}`,
    `Page: ${fields.source}`,
    "",
    "Message:",
    fields.message || "—",
  ].join("\r\n");

  const raw = [
    `From: Clearlaw Website <${NOTIFY_FROM}>`,
    `To: <${NOTIFY_TO}>`,
    `Reply-To: <${fields.email}>`,
    `Subject: ${subject.replace(/[\r\n]/g, " ")}`,
    `Message-ID: <${crypto.randomUUID()}@edgarready.ai>`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    "",
    bodyText,
  ].join("\r\n");

  await env.NOTIFY.send(new EmailMessage(NOTIFY_FROM, NOTIFY_TO, raw));
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeaders(request) : {}),
    },
  });
}
