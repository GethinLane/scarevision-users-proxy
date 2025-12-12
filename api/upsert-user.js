// Vercel Serverless Function (Node.js)
// Endpoint: POST /api/upsert-user

function send(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
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

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return send(res, 405, { ok: false, error: "Use POST" });
    }

    const secret = req.headers["x-sca-secret"];
    if (!secret || secret !== process.env.SCA_UPSERT_SECRET) {
      return send(res, 401, { ok: false, error: "Unauthorized" });
    }

    const { squarespaceUserId, email, firstName, lastName } = req.body || {};
    if (!squarespaceUserId || !email) {
      return send(res, 400, { ok: false, error: "Missing squarespaceUserId or email" });
    }

    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;
    const table = process.env.AIRTABLE_USERS_TABLE || "Users";

    if (!token || !baseId) {
      return send(res, 500, { ok: false, error: "Server not configured (missing env vars)" });
    }

    const filter = encodeURIComponent(`{SquarespaceUserId}="${String(squarespaceUserId)}"`);
    const found = await airtableRequest({
      baseId,
      token,
      path: `${table}?maxRecords=1&filterByFormula=${filter}`,
    });

    const fields = {
      SquarespaceUserId: String(squarespaceUserId),
      Email: String(email),
      FirstName: firstName ? String(firstName) : "",
      LastName: lastName ? String(lastName) : "",
      LastSeen: new Date().toISOString(),
    };

    if (found.records?.length) {
      const recordId = found.records[0].id;
      await airtableRequest({
        baseId,
        token,
        path: `${table}/${recordId}`,
        method: "PATCH",
        body: { fields },
      });
      return send(res, 200, { ok: true, action: "updated" });
    } else {
      await airtableRequest({
        baseId,
        token,
        path: table,
        method: "POST",
        body: { records: [{ fields }] },
      });
      return send(res, 200, { ok: true, action: "created" });
    }
  } catch (err) {
    return send(res, 500, { ok: false, error: err?.message || "Server error" });
  }
}
