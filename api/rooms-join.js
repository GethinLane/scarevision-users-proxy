const ALLOWED_ORIGINS = ["https://www.scarevision.co.uk", "https://scarevision.co.uk"];

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
  res.status(status).json(data);
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
  // ✅ Preflight support
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

    if (!token || !baseId) {
      return send(req, res, 500, { ok: false, error: "Server not configured" });
    }

    const { sessionId, userRecordId } = req.body || {};

    if (!sessionId) {
      return send(req, res, 400, { ok: false, error: "Missing sessionId" });
    }

    if (!userRecordId) {
      return send(req, res, 400, { ok: false, error: "Missing userRecordId" });
    }

    // ------------------------------------------------------------
    // 1. Load Session
    // ------------------------------------------------------------
    const session = await airtableRequest({
      baseId,
      token,
      path: `Sessions/${sessionId}`,
    });

    if (session.fields.Status !== "Open") {
      return send(req, res, 400, {
        ok: false,
        error: "Room is not open",
      });
    }

    const max = session.fields.MaxParticipants || 3;
    const count = session.fields.AttendeeCount || 0;

    if (count >= max) {
      // Mark full
      await airtableRequest({
        baseId,
        token,
        path: `Sessions/${sessionId}`,
        method: "PATCH",
        body: { fields: { Status: "Full" } },
      });

      return send(req, res, 400, {
        ok: false,
        error: "Room is already full",
      });
    }

    // ------------------------------------------------------------
    // 2. Add attendee record
    // ------------------------------------------------------------
    await airtableRequest({
      baseId,
      token,
      path: "SessionAttendees",
      method: "POST",
      body: {
        fields: {
          Session: [sessionId],
          User: [userRecordId],
        },
      },
    });

    // ------------------------------------------------------------
    // 3. Return meeting link ONLY after join
    // ------------------------------------------------------------
    return send(req, res, 200, {
      ok: true,
      meetingLink: session.fields.MeetingLink,
    });
  } catch (err) {
    console.error("rooms-join error:", err);
    return send(req, res, 500, { ok: false, error: err.message });
  }
}
