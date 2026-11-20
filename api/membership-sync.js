import crypto from "node:crypto";
import { normalizeMembership } from "../lib/membership.js";
import { platformReportingConfigured, reportToPlatform } from "../lib/platform-report.js";

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
  const secret = process.env.SCA_SESSION_SECRET;
  if (!secret || !platformReportingConfigured()) return res.status(503).json({ ok: false, error: "Server not configured" });
  const uid = sessionUid(req, secret);
  if (!uid) return res.status(401).json({ ok: false, error: "Invalid session" });
  // Derive tier here rather than trusting a submitted Standard/Premium label.
  const membership = normalizeMembership(req.body?.membership, uid);
  if (!membership) return res.status(422).json({ ok: false, error: "Unrecognised or invalid membership snapshot" });

  // Stored in Supabase by the AI platform. An older report never replaces a
  // newer one there, so a retried snapshot is safe to send again.
  try {
    const report = await reportToPlatform({
      type: "membership", squarespaceUserId: uid,
      tier: membership.tier, plans: membership.plans, checkedAt: membership.checkedAt,
    });
    if (report.status === 409) return res.status(409).json({ ok: false, error: "Member not recorded yet" });
    if (!report.ok) return res.status(502).json({ ok: false, error: "Membership storage unavailable" });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ ok: false, error: "Membership storage unavailable" });
  }
}
