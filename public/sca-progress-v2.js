(function () {
  const API_BASE = "https://scarevision-users-proxy.vercel.app"; // keep, or swap to your domain later

  // ---- Identity cache helpers (unchanged) ----
  const CACHE_KEY = "sca_member_identity";
  const CACHE_TS_KEY = "sca_member_identity_ts";
  const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

  // ---- Bearer token storage (NEW) ----
  const TOKEN_KEY = "sca_session_token";

  function saveToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, String(token));
    } catch {}
  }

  function loadToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function authHeaders() {
    const t = loadToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

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

  // -------------------------------
  // Single-flight (dedupe) layer
  // -------------------------------
  const SF = {
    init: null,
    identity: null, // { identity, source }
    sessionByUser: new Map(), // key: squarespaceUserId|email -> Promise
    progress: null, // Promise for progress-get
  };

  function userKey(identity) {
    return `${identity?.id || ""}|${identity?.email || ""}`;
  }

  // ---- API calls (cookie-based + bearer token fallback) ----
  function sessionStartOnce(identity) {
    if (!identity?.id || !identity?.email) {
      return Promise.reject(new Error("Missing identity id/email"));
    }

    const key = userKey(identity);
    if (SF.sessionByUser.has(key)) return SF.sessionByUser.get(key);

    const p = (async () => {
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

      // ✅ store bearer token fallback (NEW)
      if (data.token) saveToken(data.token);

      return data;
    })();

    SF.sessionByUser.set(key, p);
    return p;
  }

  function progressGetOnce() {
    if (SF.progress) return SF.progress;

    SF.progress = (async () => {
      const r = await fetch(`${API_BASE}/api/progress-get`, {
        method: "POST",
        credentials: "include",
        headers: { ...authHeaders() }, // ✅ NEW
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || "progress-get failed");

      return {
        flagged: Array.isArray(data.flagged) ? data.flagged : [],
        completed: Array.isArray(data.completed) ? data.completed : [],
      };
    })();

    return SF.progress;
  }

  async function progressUpdate(caseId, action) {
    const r = await fetch(`${API_BASE}/api/progress-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() }, // ✅ NEW
      credentials: "include",
      body: JSON.stringify({ caseId, action }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "progress-update failed");

    const next = {
      flagged: Array.isArray(data.flagged) ? data.flagged : [],
      completed: Array.isArray(data.completed) ? data.completed : [],
    };

    SF.progress = Promise.resolve(next);
    return next;
  }

  // ---- Public API ----
  window.SCAProgress = {
    async init() {
      if (SF.init) return SF.init;

      SF.init = (async () => {
        if (!SF.identity) SF.identity = getIdentityLiveOrCached();
        const { identity, source } = await SF.identity;

        await sessionStartOnce(identity);
        const progress = await progressGetOnce();

        return { identity, source, progress };
      })();

      return SF.init;
    },

    async ensureSession(identity) {
      if (SF.init) {
        try {
          const res = await SF.init;
          if (identity?.id && identity?.email && userKey(identity) !== userKey(res?.identity)) {
            return sessionStartOnce(identity);
          }
          return true;
        } catch {
          // fall through
        }
      }
      return sessionStartOnce(identity);
    },

    async getProgress() {
      if (SF.init) {
        try {
          const res = await SF.init;
          return res?.progress || progressGetOnce();
        } catch {
          // fall through
        }
      }
      return progressGetOnce();
    },

    async setFlag(caseId, isFlagged) {
      return progressUpdate(caseId, isFlagged ? "flag" : "unflag");
    },

    async setComplete(caseId, isCompleted) {
      return progressUpdate(caseId, isCompleted ? "complete" : "uncomplete");
    },
  };
})();
