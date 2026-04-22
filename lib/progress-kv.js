// lib/progress-kv.js
// =====================================================================
// Shared helpers for caching user progress in Upstash Redis.
//
// Upstash speaks HTTP directly — no npm package required. Each Redis
// command is sent as a JSON array to the REST endpoint.
//
// Every function is safe to call even if Upstash is down:
//   - read failures return null
//   - write/delete failures are swallowed
// Callers must always have a fallback path that talks to Airtable.
// =====================================================================

const KV_URL     = process.env.PROGRESS_KV_REST_API_URL;
const KV_TOKEN   = process.env.PROGRESS_KV_REST_API_TOKEN;
const TTL_SECONDS = 60 * 60; // 1 hour — long enough for a study session,
                             // short enough to self-heal any drift

function key(userId) {
  return `progress:v1:${userId}`;
}

// Send a single Redis command to Upstash over HTTP.
// Example: kvCommand(["SET", "mykey", "myvalue", "EX", "3600"])
async function kvCommand(command) {
  if (!KV_URL || !KV_TOKEN) throw new Error("KV env vars not configured");
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`KV HTTP ${r.status}`);
  const data = await r.json();
  return data.result;
}

/**
 * Read cached progress for a user.
 * Returns the cached object, or null if not present / on error / on bad data.
 */
export async function kvRead(userId) {
  try {
    const raw = await kvCommand(["GET", key(userId)]);
    if (!raw) return null;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return null;
    if (!data.recordId) return null;
    if (!Array.isArray(data.flagged)) return null;
    if (!Array.isArray(data.completed)) return null;
    return data;
  } catch (e) {
    console.warn("[progress-kv] read failed:", e?.message || e);
    return null;
  }
}

/**
 * Write progress to cache. Silently swallows errors.
 */
export async function kvWrite(userId, data) {
  try {
    const payload = JSON.stringify({ ...data, updatedAt: Date.now() });
    await kvCommand(["SET", key(userId), payload, "EX", String(TTL_SECONDS)]);
  } catch (e) {
    console.warn("[progress-kv] write failed:", e?.message || e);
  }
}

/**
 * Delete a user's cached progress. For future use if you ever need to
 * force a refresh (e.g. after an admin edits Airtable directly).
 */
export async function kvInvalidate(userId) {
  try {
    await kvCommand(["DEL", key(userId)]);
  } catch (e) {
    console.warn("[progress-kv] delete failed:", e?.message || e);
  }
}
