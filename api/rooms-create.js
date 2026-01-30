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

  // Only allow POST
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
    // Read request body
    // ------------------------------------------------------------
    const {
      userRecordId,
      start,
      end,
      platform,
      meetingLink,
      topic,
      roomType,
    } = req.body || {};

    if (!userRecordId) {
      return send(req, res, 400, {
        ok: false,
        error: "Missing userRecordId",
      });
    }

    if (!meetingLink) {
      return send(req, res, 400, {
        ok: false,
        error: "Missing meetingLink",
      });
    }

    // ------------------------------------------------------------
    // 1. Create Session record in Airtable
    // ------------------------------------------------------------
    const sessionResp = await airtableRequest({
      baseId,
      token,
      path: "Sessions",
      method: "POST",
      body: {
        fields: {
          HostUser: [userRecordId],

          Start: start,
          End: end,

          Status: "Open",

          Platform: platform || "Google Meet",
          MeetingLink: meetingLink,

          // ✅ NEW fields
          Topic: topic || "",
        

          MaxParticipants: 3,
        },
      },
    });

    const sessionId = sessionResp?.id;
    if (!sessionId) {
      throw new Error("Session created but no ID returned");
    }

    // ------------------------------------------------------------
    // 2. Auto-add host as attendee
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
    // Done
    // ------------------------------------------------------------
    return send(req, res, 200, {
      ok: true,
      sessionId,
    });
  } catch (err) {
    console.error("rooms-create error:", err);

    return send(req, res, 500, {
      ok: false,
      error: err.message,
    });
  }
}
