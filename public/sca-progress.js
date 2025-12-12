(function () {
  const API_BASE = "https://scarevision-users-proxy.vercel.app";

  // ---- Identity cache helpers (same idea as before) ----
  const CACHE_KEY = "sca_member_identity";
  const CACHE_TS_KEY = "sca_member_identity_ts";
  const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

  function cacheIdentity(identity) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(identity));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch {}
  }

  function getCachedIdentity() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const ts = Number(localStorage.getItem(CACHE_TS_KEY));
      if (!raw || !ts) return null;
      if (Date.now() - ts > CACHE_MAX_AGE) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getCookieMap() {
    return document.cookie
      .split(";")
      .map((c) => c.split("="))
      .reduce((acc, [k, v]) => {
        acc[(k || "").trim()] = decodeURIComponent(v || "");
        return acc;
      }, {});
  }

  async function fetchLiveIdentity() {
    const cookies = getCookieMap();
    const crumb = cookies["crumb"];
    const siteUserCrumb = cookies["siteUserCrumb"];
    if (!crumb || !siteUserCrumb) throw new Error("Not authenticated (cookies missing)");

    const r = await fetch("/api/site-users/account/profile", {
      headers: {
        "x-csrf-token": crumb,
        "x-siteuser-xsrf-token": siteUserCrumb,
      },
    });

    if (!r.ok) throw new Error("Profile request failed");
    const profile = await r.json();
    if (!profile?.email) throw new Error("Invalid profile");

    const identity = {
      id: profile.id || null,
      email: profile.email || null,
      firstName: profile?.name?.firstName || null,
      lastName: profile?.name?.lastName || null,
    };

    cacheIdentity(identity);
    return { identity, source: "live" };
  }

  async function getIdentityLiveOrCached() {
    try {
      return await fetchLiveIdentity();
    } catch (e) {
      const cached = getCachedIdentity();
      if (cached?.id && cached?.email) return { identity: cached, source: "cached" };
      throw e;
    }
  }

  // ---- API calls (cookie-based session) ----
  async function sessionStart(identity) {
    if (!identity?.id || !identity?.email) throw new Error("Missing identity id/email");

    const r = await fetch(`${API_BASE}/api/session-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        squarespaceUserId: identity.id,
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "session-start failed");
    return data;
  }

  async function progressGet() {
    const r = await fetch(`${API_BASE}/api/progress-get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "progress-get failed");
    return {
      flagged: Array.isArray(data.flagged) ? data.flagged : [],
      completed: Array.isArray(data.completed) ? data.completed : [],
    };
  }

  async function progressUpdate(caseId, action) {
    const r = await fetch(`${API_BASE}/api/progress-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ caseId, action }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "progress-update failed");
    return {
      flagged: Array.isArray(data.flagged) ? data.flagged : [],
      completed: Array.isArray(data.completed) ? data.completed : [],
    };
  }

  // ---- Public API ----
  window.SCAProgress = {
    // call once on page load
    async init() {
      const { identity, source } = await getIdentityLiveOrCached();

      // IMPORTANT: try to start session even if cached (so user gets created/updated)
      // If Squarespace truly has no usable session anymore, this may fail — caller can handle it.
      await sessionStart(identity);

      const progress = await progressGet();
      return { identity, source, progress };
    },

    // if your existing code already has identity, you can do:
    async ensureSession(identity) {
      return sessionStart(identity);
    },

    async getProgress() {
      return progressGet();
    },

    async setFlag(caseId, isFlagged) {
      return progressUpdate(caseId, isFlagged ? "flag" : "unflag");
    },

    async setComplete(caseId, isCompleted) {
      return progressUpdate(caseId, isCompleted ? "complete" : "uncomplete");
    },
  };
})();
