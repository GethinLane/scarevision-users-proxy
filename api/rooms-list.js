const ALLOWED_ORIGINS = [
  "https://www.scarevision.co.uk",
  "https://scarevision.co.uk",
];

function setCors(req, res) {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

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

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Airtable error");

  return data;
}

export default async function handler(req, res) {
  // ✅ OPTIONS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return send(req, res, 405, { ok: false, error: "Use POST" });
  }

  try {
    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;

    if (!token || !baseId) {
      return send(req, res, 500, {
        ok: false,
        error: "Server not configured",
      });
    }

    // ------------------------------------------------------------
    // Fetch all OPEN sessions that haven't ended
    // ------------------------------------------------------------
    const resp = await airtableRequest({
      baseId,
      token,
      path: `Sessions?filterByFormula=${encodeURIComponent(
        `AND({Status}="Open",{End}>NOW())`
      )}`,
    });

    // ------------------------------------------------------------
    // Format response for frontend
    // ------------------------------------------------------------
    const rooms = (resp.records || []).map((r) => ({
      sessionId: r.id,

      start: r.fields.Start,
      end: r.fields.End,

      platform: r.fields.Platform || "Google Meet",

      // ✅ NEW fields for UI
      topic: r.fields.Topic || "",
      roomType: r.fields.RoomType || "ActiveNow",

      attendeeCount: r.fields.AttendeeCount || 0,
      spotsLeft: r.fields.SpotsLeft || 0,
      maxParticipants: r.fields.MaxParticipants || 3,
    }));

    return send(req, res, 200, {
      ok: true,
      rooms,
    });
  } catch (err) {
    console.error("rooms-list error:", err);

    return send(req, res, 500, {
      ok: false,
      error: err.message,
    });
  }
}
