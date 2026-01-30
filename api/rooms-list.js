const ALLOWED_ORIGINS = ["https://www.scarevision.co.uk", "https://scarevision.co.uk"];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Airtable error");
  return data;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    const sessionsTable = "Sessions";

    const resp = await airtableRequest({
      baseId,
      token,
      path: `${sessionsTable}?filterByFormula=${encodeURIComponent(
        `AND({Status}="Open",{End}>NOW())`
      )}`,
    });

    const rooms = (resp.records || []).map((r) => ({
      sessionId: r.id,
      start: r.fields.Start,
      end: r.fields.End,
      platform: r.fields.Platform,
      attendeeCount: r.fields.AttendeeCount || 0,
      spotsLeft: r.fields.SpotsLeft || 0,
      maxParticipants: r.fields.MaxParticipants || 3,
    }));

    return res.json({ ok: true, rooms });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
