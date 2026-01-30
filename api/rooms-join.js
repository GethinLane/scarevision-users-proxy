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

async function airtableDelete({ baseId, token, table, recordId }) {
  const url = `https://api.airtable.com/v0/${baseId}/${table}/${recordId}`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!r.ok) throw new Error(data?.error?.message || text || "Airtable error");
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

    const { attendeeId } = req.body || {};
    if (!attendeeId) return send(req, res, 400, { ok: false, error: "Missing attendeeId" });

    await airtableDelete({
      baseId,
      token,
      table: "SessionAttendees",
      recordId: attendeeId,
    });

    return send(req, res, 200, // Freed spot immediately
      { ok: true }
    );
  } catch (err) {
    console.error("rooms-cancel error:", err);
    return send(req, res, 500, { ok: false, error: err.message });
  }
}
