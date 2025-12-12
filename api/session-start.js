import crypto from "crypto";

const ALLOWED_ORIGINS = ["https://www.scarevision.co.uk", "https://scarevision.co.uk"];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function send(req, res, status, data) {
  setCors(req, res);
  res.status(status).json(data);
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    return res.status(204).end();
  }
  if (req.method !== "POST") return send(req, res, 405, { ok: false, error: "Use POST" });

  const secret = process.env.SCA_SESSION_SECRET;
  if (!secret) return send(req, res, 500, { ok: false, error: "Missing SCA_SESSION_SECRET" });

  const { squarespaceUserId, email } = req.body || {};
  if (!squarespaceUserId || !email) {
    return send(req, res, 400, { ok: false, error: "Missing squarespaceUserId or email" });
  }

  // Create a signed session token good for 14 days
  const exp = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ uid: String(squarespaceUserId), exp });
  const sig = sign(payload, secret);
  const token = Buffer.from(payload).toString("base64url") + "." + sig;

  // Set cookie (HttpOnly so JS can't steal it)
  const cookie = [
    `sca_session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${14 * 24 * 60 * 60}`
  ].join("; ");

  res.setHeader("Set-Cookie", cookie);

  return send(req, res, 200, { ok: true });
}
