import crypto from "crypto";

/**
 * api/ai-intro-flag.js
 * ====================
 * GET  — read HasSeenAiIntro for the authenticated user
 * POST — set HasSeenAiIntro = true for the authenticated user
 *
 * Uses the same session token as all other .co.uk endpoints.
 * Purely a backup for localStorage — failures are non-critical.
 */

const ALLOWED_ORIGINS = ["https://www.scarevision.co.uk", "https://scarevision.co.uk"];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function send(req, res, status, data) {
  setCors(req, res);
  res.status(status).json(data);
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a, b) {
  try {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function readSessionToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

function verifySession(req) {
  const secret = process.env.SCA_SESSION_SECRET;
  if (!secret) throw new Error("Missing SCA_SESSION_SECRET");

  const token = readSessionToken(req);
  if (!token) throw new Error("No session");

  const [b64, sig] = token.split(".");
  if (!b64 || !sig) throw new Error("Bad token");

  let payload = "";
  try {
    payload = Buffer.from(b64, "base64url").toString("utf8");
  } catch {
    throw new Error("Bad token");
  }

  const expected = sign(payload, secret);
  if (!safeEqual(expected, sig)) throw new Error("Invalid token");

  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    throw new Error("Invalid payload");
  }

  if (!data?.uid || !data?.exp) throw new Error("Invalid payload");
  if (Date.now() > Number(data.exp)) throw new Error("Session expired");

  return String(data.uid);
}

async function airtableRequest({ baseId, token, path, method = "GET", body }) {
  const url = `https://api.airtable.com/v0/${baseId}/${path}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!r.ok) {
    const msg = data?.error?.message || `Airtable error (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

export default async function handler(req, res) {
  // Preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return send(req, res, 405, { ok: false, error: "Use GET or POST" });
  }

  try {
    const userId = verifySession(req);

    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    const table = process.env.AIRTABLE_USERS_TABLE;

    if (!token || !baseId || !table) {
      return send(req, res, 500, { ok: false, error: "Server not configured" });
    }

    // Find user record
    const filter = encodeURIComponent(`{SquarespaceUserId}="${userId}"`);
    const found = await airtableRequest({
      baseId,
      token,
      path: `${table}?maxRecords=1&filterByFormula=${filter}`,
    });

    if (!found.records?.length) {
      return send(req, res, 404, { ok: false, error: "User not found" });
    }

    const record = found.records[0];
    const recordId = record.id;

    // ── GET: read the flag ──
    if (req.method === "GET") {
      const hasSeenAiIntro = !!record.fields?.HasSeenAiIntro;
      return send(req, res, 200, { ok: true, hasSeenAiIntro });
    }

    // ── POST: set the flag ──
    if (req.method === "POST") {
      await airtableRequest({
        baseId,
        token,
        path: `${table}/${recordId}`,
        method: "PATCH",
        body: {
          fields: { HasSeenAiIntro: true },
        },
      });

      return send(req, res, 200, { ok: true, hasSeenAiIntro: true });
    }
  } catch (err) {
    return send(req, res, 401, { ok: false, error: err.message || "Unauthorized" });
  }
}
