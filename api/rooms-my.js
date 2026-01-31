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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!r.ok) {
    const msg = json?.error?.message || text || `Airtable error (${r.status})`;
    const type = json?.error?.type || "unknown";
    const err = new Error(`${type}: ${msg}`);
    err._airtable = { status: r.status, statusText: r.statusText, url, path, method, bodyText: text, bodyJson: json };
    throw err;
  }

  return json ?? {};
}

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

// Fetch up to N attendee records with pagination (no sort field needed)
async function fetchAttendees({ baseId, token, limit = 300 }) {
  const pageSizeMax = 100;
  let all = [];
  let offset = null;

  while (all.length < limit) {
    const remaining = limit - all.length;
    const pageSize = Math.min(pageSizeMax, remaining);

    const basePath = `SessionAttendees?pageSize=${pageSize}`;
    const path = offset ? `${basePath}&offset=${encodeURIComponent(offset)}` : basePath;

    const resp = await airtableRequest({ baseId, token, path });
    const records = Array.isArray(resp.records) ? resp.records : [];

    all = all.concat(records);

    if (!resp.offset) break;
    offset = resp.offset;
  }

  return all;
}

// Helper: is session still relevant (live or upcoming)?
function isLiveOrUpcomingSession(sessionFields, nowMs) {
  const endIso = sessionFields?.End;
  if (!endIso) return false;
  const endMs = Date.parse(endIso);
  if (Number.isNaN(endMs)) return false;
  return endMs > nowMs;
}

export default async function handler(req, res) {
  const DEBUG = !!(req.body && req.body.debug);

  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }
  if (req.method !== "POST") return send(req, res, 405, { ok: false, error: "Use POST" });

  const debugOut = {
    stage: "start",
    env: { hasToken: false, hasBaseId: false },
    request: { userRecordId: DEBUG ? req.body?.userRecordId : null },
    attendees: {},
    matching: {},
    sessions: {},
  };

  try {
    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;

    debugOut.env.hasToken = !!token;
    debugOut.env.hasBaseId = !!baseId;

    if (!token || !baseId) {
      debugOut.stage = "env_missing";
      return send(req, res, 500, { ok: false, error: "Server not configured", debug: DEBUG ? debugOut : undefined });
    }

    const { userRecordId } = req.body || {};
    if (!userRecordId) {
      debugOut.stage = "missing_userRecordId";
      return send(req, res, 400, { ok: false, error: "Missing userRecordId", debug: DEBUG ? debugOut : undefined });
    }

    const nowMs = Date.now();

    // 1) Fetch attendee rows
    debugOut.stage = "fetch_attendees";
    const all = await fetchAttendees({ baseId, token, limit: 300 });

    debugOut.attendees.totalFetched = all.length;
    debugOut.attendees.firstRecordFieldKeys = all[0]?.fields ? Object.keys(all[0].fields) : [];
    debugOut.attendees.firstRecordFieldsSample = DEBUG ? all[0]?.fields : undefined;

    // 2) Filter rows for this user
    debugOut.stage = "filter_by_user";
    const mine = all.filter((r) => Array.isArray(r.fields?.User) && r.fields.User.includes(userRecordId));

    debugOut.matching.matchedByUser = mine.length;
    debugOut.matching.sampleCommitStatuses = DEBUG ? mine.slice(0, 10).map((r) => r.fields?.CommitStatus) : undefined;
    debugOut.matching.sampleSessionArrays = DEBUG ? mine.slice(0, 5).map((r) => r.fields?.Session) : undefined;

    if (!mine.length) {
      debugOut.stage = "no_attendee_rows_found";
      return send(req, res, 200, { ok: true, commitments: [], debug: DEBUG ? debugOut : undefined });
    }

    // 3) Collect session IDs from ALL my attendee rows
    debugOut.stage = "collect_session_ids";
    const sessionIds = mine
      .map((r) => (Array.isArray(r.fields?.Session) ? r.fields.Session[0] : null))
      .filter(Boolean);

    debugOut.sessions.wantedSessionIds = DEBUG ? sessionIds : undefined;

    if (!sessionIds.length) {
      debugOut.stage = "no_session_ids";
      return send(req, res, 200, { ok: true, commitments: [], debug: DEBUG ? debugOut : undefined });
    }

    // 4) Fetch session records (limit 50 per request as you had)
    debugOut.stage = "fetch_sessions";
    const or = sessionIds.slice(0, 50).map((id) => `RECORD_ID()="${id}"`).join(",");
    const sessionsPath = `Sessions?filterByFormula=${encodeURIComponent(`OR(${or})`)}`;

    debugOut.sessions.path = sessionsPath;

    const sess = await airtableRequest({ baseId, token, path: sessionsPath });
    const sessions = Array.isArray(sess.records) ? sess.records : [];
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));

    debugOut.sessions.fetched = sessions.length;
    debugOut.sessions.firstSessionFieldsSample = DEBUG ? sessions[0]?.fields : undefined;

    // 5) Build response:
    // Include if:
    // - session End > now (live or upcoming)
    // - session Status != Cancelled
    // - AND (user is Host OR CommitStatus == Committed)
    debugOut.stage = "build_response";

    const bySessionId = new Map();

    for (const a of mine) {
      const sid = Array.isArray(a.fields?.Session) ? a.fields.Session[0] : null;
      if (!sid) continue;

      const s = sessionMap.get(sid);
      if (!s?.fields) continue;

      // Filter out old sessions
      if (!isLiveOrUpcomingSession(s.fields, nowMs)) continue;

      // Filter out cancelled
      const status = String(s.fields.Status || "");
      if (norm(status) === "cancelled") continue;

      const hostArr = s.fields.HostUser;
      const isHost = Array.isArray(hostArr) && hostArr.includes(userRecordId);

      const commitStatusRaw = a.fields?.CommitStatus || "";
      const isCommitted = norm(commitStatusRaw) === "committed";

      // Only include if committed attendee OR host
      if (!isCommitted && !isHost) continue;

      const item = {
        attendeeId: a.id,
        sessionId: sid,
        start: s.fields.Start,
        end: s.fields.End,
        topic: s.fields.Topic || "",
        platform: s.fields.Platform || "",
        status: s.fields.Status || "",
        meetingLink: s.fields.MeetingLink || "",
        isHost,
        commitStatus: commitStatusRaw,
      };

      // Deduplicate: prefer host view if multiple rows exist
      const existing = bySessionId.get(sid);
      if (!existing || (isHost && !existing.isHost)) {
        bySessionId.set(sid, item);
      }
    }

    const commitments = Array.from(bySessionId.values())
      .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));

    debugOut.stage = "done";
    return send(req, res, 200, { ok: true, commitments, debug: DEBUG ? debugOut : undefined });
  } catch (err) {
    console.error("rooms-my error:", err);

    const airtable = err?._airtable;
    debugOut.stage = "error";

    return send(req, res, 500, {
      ok: false,
      error: err.message || "Server error",
      debug: DEBUG
        ? {
            ...debugOut,
            airtableError: airtable
              ? {
                  status: airtable.status,
                  statusText: airtable.statusText,
                  method: airtable.method,
                  path: airtable.path,
                  url: airtable.url,
                  bodyText: airtable.bodyText,
                  bodyJson: airtable.bodyJson,
                }
              : null,
          }
        : undefined,
    });
  }
}
