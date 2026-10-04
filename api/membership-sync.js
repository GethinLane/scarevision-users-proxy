import crypto from "node:crypto";
import { normalizeMembership } from "../lib/membership.js";

const ORIGINS = ["https://www.scarevision.co.uk", "https://scarevision.co.uk"];

function sessionUid(req, secret) {
  try {
    const token = (req.headers.authorization || "").match(/^Bearer (\S+)$/)?.[1];
    const parts = token?.split(".");
    if (!parts || parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
    const payload = Buffer.from(parts[0], "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(parts[1], "hex"))) return null;
    const data = JSON.parse(payload);
    if (typeof data.uid !== "string" || !data.uid || data.uid.length > 100 ||
        !Number.isFinite(data.exp) || data.exp <= Date.now()) return null;
    return data.uid;
  } catch { return null; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");
  if (!ORIGINS.includes(origin)) return res.status(403).json({ ok: false, error: "Origin not allowed" });
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST" });
  const { SCA_SESSION_SECRET: secret, AIRTABLE_USERS_TOKEN: token,
    AIRTABLE_USERS_BASE_ID: baseId, AIRTABLE_USERS_TABLE: table } = process.env;
  if (!secret || !token || !baseId || !table) return res.status(503).json({ ok: false, error: "Server not configured" });
  const uid = sessionUid(req, secret);
  if (!uid) return res.status(401).json({ ok: false, error: "Invalid session" });
  // Derive tier here rather than trusting a submitted Standard/Premium label.
  const membership = normalizeMembership(req.body?.membership, uid);
  if (!membership) return res.status(422).json({ ok: false, error: "Unrecognised or invalid membership snapshot" });

  async function airtable(path, body) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
      method: body ? "PATCH" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Membership storage unavailable");
    return response.json();
  }
  try {
    const formula = `{SquarespaceUserId}=${JSON.stringify(uid)}`;
    const found = await airtable(`?maxRecords=2&filterByFormula=${encodeURIComponent(formula)}`);
    if (found.records?.length !== 1) return res.status(409).json({ ok: false, error: "Expected one existing user record" });
    const record = found.records[0];
    const previous = Date.parse(record.fields?.MembershipCheckedAt);
    if (!Number.isFinite(previous) || previous < Date.parse(membership.checkedAt)) {
      await airtable(`/${record.id}`, { fields: {
        MembershipTier: membership.tier,
        MembershipPlansJson: JSON.stringify(membership.plans),
        MembershipCheckedAt: membership.checkedAt,
      } });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ ok: false, error: "Membership storage unavailable" });
  }
}
