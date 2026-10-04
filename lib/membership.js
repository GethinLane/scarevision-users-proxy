// Reporting only: these plans are observed by the browser, not authorization claims.
export function classifyMembership(plans) {
  if (!Array.isArray(plans)) return null;
  if (!plans.length) return "Inactive";
  const kinds = plans.map(plan => {
    const name = plan.name.toLowerCase().replace(/[–—]/g, "-");
    if (/\bpremium\b/.test(name)) return "premium";
    if (plan.id === "c69a0c75-9191-48d0-a5ac-9bdf787b78b2" ||
        (/\bvideos?\b/.test(name) && /\badd[ -]?on\b/.test(name))) return "video";
    if (plan.id === "f0eded04-1713-4d74-bdd0-aa75bc9543b5" ||
        /\bstandard\b/.test(name)) return "standard";
    return "unknown";
  });
  if (kinds.includes("premium") || (kinds.includes("standard") && kinds.includes("video"))) return "Premium";
  if (kinds.includes("standard") && !kinds.includes("unknown")) return "Standard";
  return null; // Unrecognised plans must never silently downgrade an existing result.
}

export function normalizeMembership(value, uid, now = Date.now()) {
  if (!value || value.userId !== uid || !Array.isArray(value.plans) || value.plans.length > 30) return null;
  const checked = Date.parse(value.checkedAt);
  if (!Number.isFinite(checked) || checked > now + 60000 || checked < now - 14 * 86400000) return null;
  const plans = [];
  for (const plan of value.plans) {
    if (!plan || typeof plan.name !== "string" || !plan.name.trim() || plan.name.length > 200 ||
        typeof plan.id !== "string" || plan.id.length > 100) return null;
    plans.push({ id: plan.id, name: plan.name.trim() });
  }
  const tier = classifyMembership(plans);
  if (!tier) return null;
  return { userId: uid, tier, plans, checkedAt: new Date(checked).toISOString() };
}
