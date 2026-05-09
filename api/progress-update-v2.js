import crypto from "crypto";
import { kvRead, kvWrite } from "../lib/progress-kv.js";

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

// ★ NEW: Slug-keyed guide map.
function safeParseGuides(s) {
  try {
    const v = JSON.parse(s || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out = {};
    for (const k of Object.keys(v)) {
      const slug = String(k).trim();
      if (!slug) continue;
      out[slug] = typeof v[k] === "string" ? v[k] : null;
    }
    return out;
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

// ★ NEW: Guide slugs are author-defined strings. Reject anything weird before
// it lands in Airtable. Permissive but safe — alphanumerics + hyphens only.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }
  if (req.method !== "POST") return send(req, res, 405, { ok: false, error: "Use POST" });

  try {
    const userId = verifySession(req);

    // ★ NEW: Request can target a case (caseId + action) OR a guide
    // (slug + action). Exactly one must be present. Old clients sending
    // only { caseId, action } work unchanged.
    const { caseId, slug, action } = req.body || {};
    const hasCase = caseId !== undefined && caseId !== null && caseId !== "";
    const hasSlug = typeof slug === "string" && slug.trim() !== "";
    if (hasCase === hasSlug) {
      return send(req, res, 400, { ok: false, error: "Provide exactly one of caseId or slug" });
    }

    let cid = null;
    let cleanSlug = null;
    let allowed;
    if (hasCase) {
      cid = Number(caseId);
      if (!Number.isFinite(cid)) return send(req, res, 400, { ok: false, error: "Bad caseId" });
      allowed = new Set(["flag", "unflag", "complete", "uncomplete"]);
    } else {
      cleanSlug = slug.trim();
      if (!SLUG_RE.test(cleanSlug)) return send(req, res, 400, { ok: false, error: "Bad slug" });
      // Guides have no "flag" concept — only complete/uncomplete.
      allowed = new Set(["complete", "uncomplete"]);
    }
    if (!allowed.has(action)) return send(req, res, 400, { ok: false, error: "Bad action" });

    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    const table = process.env.AIRTABLE_USERS_TABLE;

    if (!token || !baseId || !table) {
      return send(req, res, 500, { ok: false, error: "Server not configured" });
    }

    // ================================================================
    // Find the user's Airtable recordId.
    //
    // We check Upstash first — if we know the recordId we can do a
    // direct Airtable GET (~100ms) instead of a filterByFormula
    // search (~300ms). We only trust the cache for the recordId; the
    // actual state is always re-read from Airtable so writes can't
    // clobber each other through stale cache.
    // ================================================================
    let record = null;
    const cached = await kvRead(userId);

    if (cached?.recordId) {
      try {
        record = await airtableRequest({
          baseId,
          token,
          path: `${table}/${cached.recordId}`,
        });
      } catch {
        // Record moved/deleted/stale — fall through to filterByFormula
        record = null;
      }
    }

    if (!record) {
      const filter = encodeURIComponent(`{SquarespaceUserId}="${userId}"`);
      const found = await airtableRequest({
        baseId,
        token,
        path: `${table}?maxRecords=1&filterByFormula=${filter}`,
      });
      if (!found.records?.length) {
        return send(req, res, 404, { ok: false, error: "User not found in Airtable yet" });
      }
      record = found.records[0];
    }

    const recordId = record.id;
    const flagged = safeParseList(record.fields?.FlaggedCasesJson);
    const completedMap = safeParseCompleted(record.fields?.CompletedCasesJson);
    // ★ NEW: read guide progress alongside cases.
    const completedGuides = safeParseGuides(record.fields?.CompletedGuidesJson);

    // ================================================================
    // Apply the mutation
    // ================================================================
    const flaggedSet = new Set(flagged);

    // ★ MODIFIED: branch on case vs guide. Cases path is unchanged from v2.
    const fields = {};
    if (hasCase) {
      if (action === "flag") flaggedSet.add(cid);
      if (action === "unflag") flaggedSet.delete(cid);
      if (action === "complete") completedMap[String(cid)] = new Date().toISOString();
      if (action === "uncomplete") delete completedMap[String(cid)];
      fields.FlaggedCasesJson = JSON.stringify(Array.from(flaggedSet).sort((a, b) => a - b));
      fields.CompletedCasesJson = JSON.stringify(completedMap);
    } else {
      // ★ NEW: guide branch. Only touches CompletedGuidesJson.
      if (action === "complete") completedGuides[cleanSlug] = new Date().toISOString();
      if (action === "uncomplete") delete completedGuides[cleanSlug];
      fields.CompletedGuidesJson = JSON.stringify(completedGuides);
    }
    fields.LastSeen = new Date().toISOString();

    const finalFlagged = Array.from(flaggedSet).sort((a, b) => a - b);
    const finalCompleted = completedMapToArray(completedMap);

    // Write to Airtable (source of truth) FIRST
    await airtableRequest({
      baseId,
      token,
      path: `${table}/${recordId}`,
      method: "PATCH",
      body: { fields },
    });

    // Then write-through to Upstash. If this fails, no harm done —
    // the next read will hit Airtable and repopulate the cache.
    await kvWrite(userId, {
      recordId,
      flagged: finalFlagged,
      completed: finalCompleted,
      completedDates: completedMap,
      completedGuides, // ★ NEW
    });

    return send(req, res, 200, {
      ok: true,
      flagged: finalFlagged,
      completed: finalCompleted,
      completedDates: completedMap,
      completedGuides, // ★ NEW
    });
  } catch (err) {
    return send(req, res, 401, { ok: false, error: err.message || "Unauthorized" });
  }
}
