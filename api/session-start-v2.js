import crypto from "crypto";
import { kvWrite } from "../lib/progress-kv.js";

const ALLOWED_ORIGINS = ["https://www.scarevision.co.uk", "https://scarevision.co.uk"];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

function safeParseCompleted(s) {
  try {
    const v = JSON.parse(s || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    if (Array.isArray(v)) {
      const map = {};
      for (const id of v) {
        const n = Number(id);
        if (Number.isFinite(n)) map[String(n)] = null;
      }
      return map;
    }
    return {};
  } catch {
    return {};
  }
}

function completedMapToArray(map) {
  return Object.keys(map)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }
  if (req.method !== "POST") return send(req, res, 405, { ok: false, error: "Use POST" });

  try {
    const sessionSecret = process.env.SCA_SESSION_SECRET;
    if (!sessionSecret) return send(req, res, 500, { ok: false, error: "Missing SCA_SESSION_SECRET" });

    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    const table = process.env.AIRTABLE_USERS_TABLE;
    if (!token || !baseId || !table) {
      return send(req, res, 500, { ok: false, error: "Server not configured" });
    }

    const { squarespaceUserId, email, firstName, lastName } = req.body || {};
    if (!squarespaceUserId || !email) {
      return send(req, res, 400, { ok: false, error: "Missing squarespaceUserId or email" });
    }

    const uid = String(squarespaceUserId).trim();
    const emailNorm = String(email).trim().toLowerCase();

    // ✅ identity-only upsert (prevents wiping progress fields)
    const identityFields = {
      SquarespaceUserId: uid,
      Email: emailNorm,
      FirstName: firstName ? String(firstName) : "",
      LastName: lastName ? String(lastName) : "",
      LastSeen: new Date().toISOString(),
    };

    // ✅ atomic upsert (prevents duplicates)
    const upsertResp = await airtableRequest({
      baseId,
      token,
      path: table,
      method: "PATCH",
      body: {
        performUpsert: { fieldsToMergeOn: ["SquarespaceUserId"] },
        records: [{ fields: identityFields }],
      },
    });

    const recordId = upsertResp?.records?.[0]?.id;
    if (!recordId) throw new Error("Upsert ok but no record id returned");

    // ✅ set defaults only if missing
    const rec = await airtableRequest({
      baseId,
      token,
      path: `${table}/${recordId}`,
      method: "GET",
    });

    const flaggedRaw = rec?.fields?.FlaggedCasesJson;
    const completedRaw = rec?.fields?.CompletedCasesJson;

    const needsDefaults = typeof flaggedRaw !== "string" || typeof completedRaw !== "string";

    if (needsDefaults) {
      await airtableRequest({
        baseId,
        token,
        path: `${table}/${recordId}`,
        method: "PATCH",
        body: {
          fields: {
            FlaggedCasesJson: typeof flaggedRaw === "string" ? flaggedRaw : "[]",
            CompletedCasesJson: typeof completedRaw === "string" ? completedRaw : "[]",
          },
        },
      });
    }

    // ================================================================
    // Seed Upstash with the user's current progress so their very
    // first page load after login is already fast. We already have
    // the data in hand — no extra Airtable calls needed.
    // ================================================================
    const flaggedParsed = safeParseList(
      typeof flaggedRaw === "string" ? flaggedRaw : "[]"
    );
    const completedParsed = safeParseCompleted(
      typeof completedRaw === "string" ? completedRaw : "{}"
    );

    await kvWrite(uid, {
      recordId,
      flagged: flaggedParsed,
      completed: completedMapToArray(completedParsed),
      completedDates: completedParsed,
    });

    // ✅ signed session token (14 days)
    const exp = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const payload = JSON.stringify({ uid, exp });
    const sig = sign(payload, sessionSecret);
    const sessionToken = Buffer.from(payload).toString("base64url") + "." + sig;

    // ✅ keep cookie (works where cookies are allowed)
    res.setHeader(
      "Set-Cookie",
      [
        `sca_session=${sessionToken}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=None",
        `Max-Age=${14 * 24 * 60 * 60}`,
      ].join("; ")
    );

    // ✅ ALSO return token for Bearer auth fallback
    return send(req, res, 200, {
      ok: true,
      token: sessionToken,
      exp,
      userRecordId: recordId,
      hasSeenAiIntro: !!rec?.fields?.HasSeenAiIntro,
    });

  } catch (err) {
    return send(req, res, 500, { ok: false, error: err.message || "Server error" });
  }
}
