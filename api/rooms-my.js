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

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
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

    // Pull recent attendee rows (avoid filterByFormula surprises with linked fields)
    // This is MVP-safe; increase pageSize if you want.
    const att = await airtableRequest({
      baseId,
      token,
      path: `SessionAttendees?pageSize=200&sort%5B0%5D%5Bfield%5D=Created&sort%5B0%5D%5Bdirection%5D=desc`,
    });

    const all = att.records || [];

    // IMPORTANT: Airtable returns linked fields as ARRAYS of recordIds
    const mine = all.filter(r => {
      const users = r.fields?.User; // expects linked field name is "User"
      return Array.isArray(users) && users.includes(userRecordId);
    });

    const committed = mine.filter(r => norm(r.fields?.CommitStatus) === "committed");

    // If your linked field is NOT called "User", we want to detect it quickly:
    // We'll include the available field keys from the first record as debug.
    const debugFieldKeys = all[0]?.fields ? Object.keys(all[0].fields) : [];

    if (!committed.length) {
      return send(req, res, 200, {
        ok: true,
        commitments: [],
        debug: {
          fetchedAttendees: all.length,
          matchedByUser: mine.length,
          matchedByCommitStatus: committed.length,
          sampleCommitStatusValues: mine.slice(0, 5).map(r => r.fields?.CommitStatus),
          sampleUserArrays: mine.slice(0, 3).map(r => r.fields?.User),
          firstRecordFieldKeys: debugFieldKeys,
          note:
            "If matchedByUser is 0, your linked field probably isn't named 'User' or the attendee rows link to a different Users table.",
        },
      });
    }

    // Fetch sessions for matched commitments
    const sessionIds = committed
      .map(r => (Array.isArray(r.fields?.Session) ? r.fields.Session[0] : null))
      .filter(Boolean);

    const or = sessionIds.slice(0, 50).map(id => `RECORD_ID()="${id}"`).join(",");
    const sess = await airtableRequest({
      baseId,
      token,
      path: `Sessions?filterByFormula=${encodeURIComponent(`OR(${or})`)}`,
    });

    const sessionMap = new Map((sess.records || []).map(s => [s.id, s]));

    const commitments = committed.map(a => {
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
        commitStatus: a.fields?.CommitStatus || "",
      };
    });

    return send(req, res, 200, {
      ok: true,
      commitments,
      debug: {
        fetchedAttendees: all.length,
        matchedByUser: mine.length,
        matchedByCommitStatus: committed.length,
      },
    });
  } catch (err) {
    console.error("rooms-my error:", err);
    return send(req, res, 500, { ok: false, error: err.message });
  }
}
