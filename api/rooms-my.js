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

// Airtable request that never hides raw responses
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
    err._airtable = {
      status: r.status,
      statusText: r.statusText,
      bodyText: text,
      bodyJson: json,
      url,
      path,
      method,
    };
    throw err;
  }

  return json ?? {};
}

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

// Fetch multiple pages from Airtable safely (max pageSize=100)
async function fetchAllAttendees({ baseId, token, sortField = "CreatedAt", limit = 300 }) {
  const pageSizeMax = 100;
  let all = [];
  let offset = null;

  while (all.length < limit) {
    const remaining = limit - all.length;
    const pageSize = Math.min(pageSizeMax, remaining);

    const basePath =
      `SessionAttendees?pageSize=${pageSize}` +
      `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(sortField)}` +
      `&sort%5B0%5D%5Bdirection%5D=desc`;

    const path = offset ? `${basePath}&offset=${encodeURIComponent(offset)}` : basePath;

    const resp = await airtableRequest({ baseId, token, path });

    const records = Array.isArray(resp.records) ? resp.records : [];
    all = all.concat(records);

    if (!resp.offset) break;
    offset = resp.offset;
  }

  return all;
}

export default async function handler(req, res) {
  const DEBUG = !!(req.body && req.body.debug);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return send(req, res, 405, { ok: false, error: "Use POST" });
  }

  const debugOut = {
    stage: "start",
    env: { hasToken: false, hasBaseId: false },
    request: { userRecordId: null },
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
    debugOut.request.userRecordId = DEBUG ? userRecordId : null;

    if (!userRecordId) {
      debugOut.stage = "missing_userRecordId";
      return send(req, res, 400, { ok: false, error: "Missing userRecordId", debug: DEBUG ? debugOut : undefined });
    }

    // ------------------------------------------------------------
    // 1) Fetch attendees (paged) sorted by CreatedAt
    // ------------------------------------------------------------
    debugOut.stage = "fetch_attendees";

    const all = await fetchAllAttendees({
      baseId,
      token,
      sortField: "CreatedAt",
      limit: 300,
    });

    debugOut.attendees.totalFetched = all.length;
    debugOut.attendees.firstRecordFieldKeys = all[0]?.fields ? Object.keys(all[0].fields) : [];
    debugOut.attendees.firstRecordFieldsSample = DEBUG ? all[0]?.fields : undefined;

    // ------------------------------------------------------------
    // 2) Match this user (linked field "User" must contain recordId)
    // ------------------------------------------------------------
    debugOut.stage = "filter_by_user";

    const mine = all.filter((r) => Array.isArray(r.fields?.User) && r.fields.User.includes(userRecordId));

    debugOut.matching.matchedByUser = mine.length;
    debugOut.matching.sampleUserArrays = DEBUG ? mine.slice(0, 3).map((r) => r.fields?.User) : undefined;
    debugOut.matching.sampleCommitStatuses = DEBUG ? mine.slice(0, 8).map((r) => r.fields?.CommitStatus) : undefined;
    debugOut.matching.sampleSessionArrays = DEBUG ? mine.slice(0, 3).map((r) => r.fields?.Session) : undefined;

    // ------------------------------------------------------------
    // 3) Only commitments (CommitStatus == Committed)
    // ------------------------------------------------------------
    debugOut.stage = "filter_committed";

    const committed = mine.filter((r) => norm(r.fields?.CommitStatus) === "committed");

    debugOut.matching.matchedByCommitted = committed.length;

    if (!committed.length) {
      debugOut.stage = "no_commitments_found";
      return send(req, res, 200, { ok: true, commitments: [], debug: DEBUG ? debugOut : undefined });
    }

    // ------------------------------------------------------------
    // 4) Fetch sessions for those commitments
    // ------------------------------------------------------------
    debugOut.stage = "fetch_sessions";

    const sessionIds = committed
      .map((r) => (Array.isArray(r.fields?.Session) ? r.fields.Session[0] : null))
      .filter(Boolean);

    const or = sessionIds.slice(0, 50).map((id) => `RECORD_ID()="${id}"`).join(",");
    const sessionsPath = `Sessions?filterByFormula=${encodeURIComponent(`OR(${or})`)}`;

    debugOut.sessions.wantedSessionIds = DEBUG ? sessionIds : undefined;
    debugOut.sessions.path = sessionsPath;

    const sess = await airtableRequest({ baseId, token, path: sessionsPath });

    const sessions = Array.isArray(sess.records) ? sess.records : [];
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));

    debugOut.sessions.fetched = sessions.length;
    debugOut.sessions.firstSessionFieldsSample = DEBUG ? sessions[0]?.fields : undefined;

    // ------------------------------------------------------------
    // 5) Build response
    // ------------------------------------------------------------
    debugOut.stage = "build_response";

    const commitments = committed.map((a) => {
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
