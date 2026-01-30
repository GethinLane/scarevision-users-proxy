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

    const { sessionId, userRecordId, meetingLink, platform, topic } = req.body || {};
    if (!sessionId || !userRecordId) {
      return send(req, res, 400, { ok: false, error: "Missing sessionId or userRecordId" });
    }

    // Load session to verify host
    const session = await airtableRequest({
      baseId,
      token,
      path: `Sessions/${sessionId}`,
    });

    const hostArr = session?.fields?.HostUser;
    const isHost = Array.isArray(hostArr) && hostArr.includes(userRecordId);
    if (!isHost) return send(req, res, 403, { ok: false, error: "Only the host can update this session" });

    // Build allowed updates ONLY
    const fields = {};
    if (typeof meetingLink === "string" && meetingLink.trim()) {
      if (!meetingLink.trim().startsWith("http")) {
        return send(req, res, 400, { ok: false, error: "meetingLink must be a valid URL" });
      }
      fields.MeetingLink = meetingLink.trim();
    }
    if (typeof platform === "string" && platform.trim()) fields.Platform = platform.trim();
    if (typeof topic === "string") fields.Topic = topic.trim();

    if (!Object.keys(fields).length) {
      return send(req, res, 400, { ok: false, error: "No fields to update" });
    }

    await airtableRequest({
      baseId,
      token,
      path: `Sessions/${sessionId}`,
      method: "PATCH",
      body: { fields },
    });

    return send(req, res, 200, { ok: true });
  } catch (err) {
    console.error("rooms-host-update error:", err);
    return send(req, res, 500, { ok: false, error: err.message || "Server error" });
  }
}
