// Sends a main-site report to the AI platform, which stores it in Supabase
// (public.main_site_members) through /api/main-site/report. Server to server:
// AI_PLATFORM_URL is the AI site's address and MAIN_SITE_REPORT_SECRET is the
// shared secret configured on both Vercel projects.
export async function reportToPlatform(report) {
  const base = process.env.AI_PLATFORM_URL;
  const secret = process.env.MAIN_SITE_REPORT_SECRET;
  if (!base || !secret) throw new Error("Platform reporting is not configured");
  const response = await fetch(new URL("/api/main-site/report", base), {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok && body?.ok === true, result: body?.result ?? null };
}

export function platformReportingConfigured() {
  return Boolean(process.env.AI_PLATFORM_URL && process.env.MAIN_SITE_REPORT_SECRET);
}
