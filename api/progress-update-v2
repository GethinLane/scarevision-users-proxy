import crypto from "crypto";

const ALLOWED_ORIGINS = ["https://www.scarevision.co.uk", "https://scarevision.co.uk"];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  // ✅ Allow Authorization for Bearer tokens
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function send(req, res, status, data) {
  setCors(req, res);
  res.status(status).json(data);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header
    .split(";")
    .map((v) => v.split("="))
    .reduce((acc, [k, v]) => {
      if (!k) return acc;
      acc[k.trim()] = decodeURIComponent(v || "");
      return acc;
    }, {});
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

  const cookies = parseCookies(req);
  return cookies["sca_session"] || "";
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

function safeParseList(s) {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }
  if (req.method !== "POST") return send(req, res, 405, { ok: false, error: "Use POST" });

  try {
    const userId = verifySession(req);

    const { caseId, action } = req.body || {};
    const cid = Number(caseId);
    if (!Number.isFinite(cid)) return send(req, res, 400, { ok: false, error: "Bad caseId" });

    const allowed = new Set(["flag", "unflag", "complete", "uncomplete"]);
    if (!allowed.has(action)) return send(req, res, 400, { ok: false, error: "Bad action" });

    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    const table = process.env.AIRTABLE_USERS_TABLE;

    if (!token || !baseId || !table) {
      return send(req, res, 500, { ok: false, error: "Server not configured" });
    }

    const filter = encodeURIComponent(`{SquarespaceUserId}="${userId}"`);
    const found = await airtableRequest({
      baseId,
      token,
      path: `${table}?maxRecords=1&filterByFormula=${filter}`,
    });

    if (!found.records?.length) {
      return send(req, res, 404, { ok: false, error: "User not found in Airtable yet" });
    }

    const record = found.records[0];
    const recordId = record.id;

    const flagged = safeParseList(record.fields?.FlaggedCasesJson);
    const completed = safeParseList(record.fields?.CompletedCasesJson);

    const flaggedSet = new Set(flagged);
    const completedSet = new Set(completed);

    if (action === "flag") flaggedSet.add(cid);
    if (action === "unflag") flaggedSet.delete(cid);
    if (action === "complete") completedSet.add(cid);
    if (action === "uncomplete") completedSet.delete(cid);

    const fields = {
      FlaggedCasesJson: JSON.stringify(Array.from(flaggedSet).sort((a, b) => a - b)),
      CompletedCasesJson: JSON.stringify(Array.from(completedSet).sort((a, b) => a - b)),
      LastSeen: new Date().toISOString(),
    };

    await airtableRequest({
      baseId,
      token,
      path: `${table}/${recordId}`,
      method: "PATCH",
      body: { fields },
    });

    return send(req, res, 200, {
      ok: true,
      flagged: JSON.parse(fields.FlaggedCasesJson),
      completed: JSON.parse(fields.CompletedCasesJson),
    });
  } catch (err) {
    return send(req, res, 401, { ok: false, error: err.message || "Unauthorized" });
  }
}
