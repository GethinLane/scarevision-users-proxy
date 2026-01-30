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

    const { userRecordId } = req.body || {};
    if (!userRecordId) return send(req, res, 400, { ok: false, error: "Missing userRecordId" });

    // 1) Get attendee records for this user where CommitStatus=Committed
    const att = await airtableRequest({
      baseId,
      token,
      path: `SessionAttendees?filterByFormula=${encodeURIComponent(
        `AND(FIND("${userRecordId}", ARRAYJOIN({User})), {CommitStatus}="Committed")`
      )}`,
    });

    const attendeeRecords = att.records || [];
    if (!attendeeRecords.length) return send(req, res, 200, { ok: true, commitments: [] });

    // Extract session IDs
    const sessionIds = attendeeRecords
      .map(r => (Array.isArray(r.fields?.Session) ? r.fields.Session[0] : null))
      .filter(Boolean);

    // 2) Fetch sessions in one go using OR(RECORD_ID()=...)
    const or = sessionIds.slice(0, 50).map(id => `RECORD_ID()="${id}"`).join(",");
    const sess = await airtableRequest({
      baseId,
      token,
      path: `Sessions?filterByFormula=${encodeURIComponent(`OR(${or})`)}`,
    });

    const sessionMap = new Map((sess.records || []).map(s => [s.id, s]));

    const commitments = attendeeRecords.map(a => {
      const sid = Array.isArray(a.fields?.Session) ? a.fields.Session[0] : null;
      const s = sessionMap.get(sid);
      return {
        attendeeId: a.id,
        sessionId: sid,
        start: s?.fields?.Start,
        end: s?.fields?.End,
        topic: s?.fields?.Topic || "",
        platform: s?.fields?.Platform || "",
        status: s?.fields?.Status || "",
      };
    });

    return send(req, res, 200, { ok: true, commitments });
  } catch (err) {
    console.error("rooms-my error:", err);
    return send(req, res, 500, { ok: false, error: err.message });
  }
}
