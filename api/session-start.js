import crypto from "crypto";

const ALLOWED_ORIGINS = [
  "https://www.scarevision.co.uk",
  "https://scarevision.co.uk"
];

/* -------------------- helpers -------------------- */

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function send(res, status, data) {
  res.status(status).json(data);
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
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
    const msg = data?.error?.message || `Airtable error (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

/* -------------------- handler -------------------- */

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    setCors(req, res);
    return send(res, 405, { ok: false, error: "Use POST" });
  }

  try {
    setCors(req, res);

    const sessionSecret = process.env.SCA_SESSION_SECRET;
    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    const table = process.env.AIRTABLE_USERS_TABLE;

    if (!sessionSecret || !token || !baseId || !table) {
      return send(res, 500, { ok: false, error: "Server not configured" });
    }

    const { squarespaceUserId, email, firstName, lastName } = req.body || {};
    if (!squarespaceUserId || !email) {
      return send(res, 400, { ok: false, error: "Missing squarespaceUserId or email" });
    }

    const uid = String(squarespaceUserId).trim();
    const emailNorm = String(email).trim().toLowerCase();

    /* ------------------------------------------------
       ✅ ATOMIC UPSERT (NO RACE CONDITIONS)
       ------------------------------------------------ */

    const fields = {
      SquarespaceUserId: uid,
      Email: emailNorm,
      FirstName: firstName ? String(firstName) : "",
      LastName: lastName ? String(lastName) : "",
      LastSeen: new Date().toISOString(),
      // safe defaults (won't overwrite if record already exists)
      FlaggedCasesJson: "[]",
      CompletedCasesJson: "[]",
    };

    await airtableRequest({
      baseId,
      token,
      path: table,
      method: "PATCH",
      body: {
        performUpsert: {
          fieldsToMergeOn: ["SquarespaceUserId"],
        },
        records: [{ fields }],
      },
    });

    /* ------------------------------------------------
       ✅ CREATE SESSION COOKIE
       ------------------------------------------------ */

    const exp = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const payload = JSON.stringify({ uid, exp });
    const sig = sign(payload, sessionSecret);
    const sessionToken =
      Buffer.from(payload).toString("base64url") + "." + sig;

    res.setHeader(
      "Set-Cookie",
      [
        `sca_session=${sessionToken}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=None",
        `Max-Age=${14 * 24 * 60 * 60}`,
      ].join("; ")
    );

    return send(res, 200, { ok: true });

  } catch (err) {
    return send(res, 500, {
      ok: false,
      error: err.message || "Server error",
    });
  }
}
