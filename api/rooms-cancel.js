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
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!r.ok) {
    const msg = data?.error?.message || text || `Airtable error (${r.status})`;
    const type = data?.error?.type || "unknown";
    throw new Error(`${type}: ${msg}`);
  }

  return data;
}

async function airtableDelete({ baseId, token, table, recordId }) {
  const url = `https://api.airtable.com/v0/${baseId}/${table}/${recordId}`;

  const r = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!r.ok) {
    const msg = data?.error?.message || text || `Airtable error (${r.status})`;
    const type = data?.error?.type || "unknown";
    throw new Error(`${type}: ${msg}`);
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }
  if (req.method !== "POST") return send(req, res, 405, { ok: false, error: "Use POST" });

  try {
    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    if (!token || !baseId) return send(req, res, 500, { ok: false, error: "Server not configured" });

    const { attendeeId, sessionId, userRecordId } = req.body || {};

    // ✅ Preferred: delete by attendeeId
    if (attendeeId) {
      await airtableDelete({
        baseId,
        token,
        table: "SessionAttendees",
        recordId: attendeeId,
      });

      return send(req, res, 200, { ok: true });
    }

    // ✅ Fallback: if you ever only have sessionId+userRecordId, find the attendee row then delete it
    if (!sessionId || !userRecordId) {
      return send(req, res, 400, { ok: false, error: "Missing attendeeId (or sessionId + userRecordId)" });
    }

    const found = await airtableRequest({
      baseId,
      token,
      path: `SessionAttendees?filterByFormula=${encodeURIComponent(
        `AND(FIND("${sessionId}", ARRAYJOIN({Session})), FIND("${userRecordId}", ARRAYJOIN({User})))`
      )}`,
    });

    const recId = found?.records?.[0]?.id;
    if (!recId) return send(req, res, 404, { ok: false, error: "Commitment not found" });

    await airtableDelete({
      baseId,
      token,
      table: "SessionAttendees",
      recordId: recId,
    });

    return send(req, res, 200, { ok: true });
  } catch (err) {
    console.error("rooms-cancel error:", err);
    return send(req, res, 500, { ok: false, error: err.message || "Server error" });
  }
}
