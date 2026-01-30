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

async function airtableRequest({ baseId, token, path }) {
  const url = `https://api.airtable.com/v0/${baseId}/${path}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Airtable error");
  return data;
}

export default async function handler(req, res) {
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

    const resp = await airtableRequest({
      baseId,
      token,
      path: `Sessions?filterByFormula=${encodeURIComponent(
        `AND({Status}="Open",{End}>NOW())`
      )}`,
    });

    const rooms = (resp.records || []).map((r) => ({
      sessionId: r.id,
      start: r.fields.Start,
      end: r.fields.End,
      platform: r.fields.Platform,
      spotsLeft: r.fields.SpotsLeft || 0,
    }));

    return send(req, res, 200, { ok: true, rooms });
  } catch (err) {
    return send(req, res, 500, { ok: false, error: err.message });
  }
}
