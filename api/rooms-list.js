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
  return res.status(status).json(data);
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
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!r.ok) throw new Error(data?.error?.message || text || "Airtable error");
  return data;
}

// ✅ Airtable pagination helper (max 100 per page)
async function fetchAllSessions({ baseId, token, filterFormula, limit = 500 }) {
  const pageSizeMax = 100;
  let all = [];
  let offset = null;

  while (all.length < limit) {
    const remaining = limit - all.length;
    const pageSize = Math.min(pageSizeMax, remaining);

    const basePath =
      `Sessions?pageSize=${pageSize}` +
      `&filterByFormula=${encodeURIComponent(filterFormula)}`;

    const path = offset ? `${basePath}&offset=${encodeURIComponent(offset)}` : basePath;

    const resp = await airtableRequest({ baseId, token, path });
    const records = Array.isArray(resp.records) ? resp.records : [];

    all = all.concat(records);

    if (!resp.offset) break;
    offset = resp.offset;
  }

  return all;
}

export default async function handler(req, res) {
  // ✅ OPTIONS preflight includes CORS
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return send(req, res, 405, { ok: false, error: "Use POST" });
  }

  try {
    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    if (!token || !baseId) return send(req, res, 500, { ok: false, error: "Server not configured" });

    // Current rule: show sessions that are Open and not ended
    const filterFormula = `AND({Status}="Open",{End}>NOW())`;

    const records = await fetchAllSessions({
      baseId,
      token,
      filterFormula,
      limit: 500, // raise if you expect more concurrently-visible sessions
    });

    const rooms = records.map((r) => ({
      sessionId: r.id,
      start: r.fields.Start,
      end: r.fields.End,
      platform: r.fields.Platform,
      topic: r.fields.Topic || "",
      attendeeCount: r.fields.AttendeeCount || 0,
      spotsLeft: r.fields.SpotsLeft || 0,
      maxParticipants: r.fields.MaxParticipants || 3,
      // meetingLink intentionally NOT returned here (only returned on join)
    }));

    return send(req, res, 200, { ok: true, rooms });
  } catch (err) {
    return send(req, res, 500, { ok: false, error: err.message });
  }
}
