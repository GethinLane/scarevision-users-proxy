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

// Airtable request that NEVER hides raw responses
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

export default async function handler(req, res) {
  const DEBUG = !!(req.body && req.body.debug);

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }

  // Only POST
  if (req.method !== "POST") {
    return send(req, res, 405, { ok: false, error: "Use POST" });
  }

  const debugOut = {
    stage: "start",
    env: {
      hasToken: false,
      hasBaseId: false,
    },
    request: {
      hasUserRecordId: false,
      userRecordId: null,
    },
    airtable: {},
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
    debugOut.request.hasUserRecordId = !!userRecordId;
    debugOut.request.userRecordId = DEBUG ? userRecordId : null;

    if (!userRecordId) {
      debugOut.stage = "missing_userRecordId";
      return send(req, res, 400, { ok: false, error: "Missing userRecordId", debug: DEBUG ? debugOut : undefined });
    }

    // ------------------------------------------------------------
    // 1) Pull attendee rows (sorted by CreatedAt)
    // ------------------------------------------------------------
    debugOut.stage = "fetch_attendees";

    const attendeesPath =
      `SessionAttendees?pageSize=200` +
      `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent("CreatedAt")}` +
      `&sort%5B0%5D%5Bdirection%5D=desc`;

    const att = await airtableRequest({
      baseId,
      token,
      path: attendeesPath,
    });

    const all = Array.isArray(att.records) ? att.records : [];

    debugOut.airtable.attendees = {
      path: attendeesPath,
      totalFetched: all.length,
      firstRecordFieldKeys: all[0]?.fields ? Object.keys(all[0].fields) : [],
      firstRecordFieldsSample: DEBUG ? all[0]?.fields : undefined,
    };

    // ------------------------------------------------------------
    // 2) Match by linked User array
    // ------------------------------------------------------------
    debugOut.stage = "filter_by_user";

    const mine = all.filter((r) => Array.isArray(r.fields?.User) && r.fields.User.includes(userRecordId));

    debugOut.airtable.matching = {
      matchedByUser: mine.length,
      sampleUserArrays: DEBUG ? mine.slice(0, 3).map((r) => r.fields?.User) : undefined,
      sampleCommitStatuses: DEBUG ? mine.slice(0, 5).map((r) => r.fields?.CommitStatus) : undefined,
      sampleSessionArrays: DEBUG ? mine.slice(0, 3).map((r) => r.fields?.Session) : undefined,
    };

    // ------------------------------------------------------------
    // 3) Filter commitments
    // ------------------------------------------------------------
    debugOut.stage = "filter_committed";

    const committed = mine.filter((r) => norm(r.fields?.CommitStatus) === "committed");

    debugOut.airtable.matching.matchedByCommitted = committed.length;

    if (!committed.length) {
      debugOut.stage = "no_commitments_found";
      return send(req, res, 200, {
        ok: true,
        commitments: [],
        debug: DEBUG ? debugOut : undefined,
      });
    }

    // ------------------------------------------------------------
    // 4) Fetch session records for those commitments
    // ------------------------------------------------------------
    debugOut.stage = "fetch_sessions";

    const sessionIds = committed
      .map((r) => (Array.isArray(r.fields?.Session) ? r.fields.Session[0] : null))
      .filter(Boolean);

    const or = sessionIds.slice(0, 50).map((id) => `RECORD_ID()="${id}"`).join(",");
    const sessionsPath = `Sessions?filterByFormula=${encodeURIComponent(`OR(${or})`)}`;

    debugOut.airtable.sessions = {
      wantedSessionIds: DEBUG ? sessionIds : undefined,
      path: sessionsPath,
    };

    const sess = await airtableRequest({
      baseId,
      token,
      path: sessionsPath,
    });

    const sessions = Array.isArray(sess.records) ? sess.records : [];
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));

    debugOut.airtable.sessions.fetched = sessions.length;
    debugOut.airtable.sessions.firstSessionFieldsSample = DEBUG ? sessions[0]?.fields : undefined;

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
    // Always return a JSON error, with Airtable raw error if present
    debugOut.stage = "error";

    const airtable = err?._airtable;

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
                  // url is safe, but verbose; include for completeness in debug mode
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
