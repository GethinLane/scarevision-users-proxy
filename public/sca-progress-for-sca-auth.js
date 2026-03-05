/**
 * sca-progress.js
 * ===============
 * Purely handles reading and writing user progress (completed + flagged cases).
 * All auth/identity is delegated to sca-auth.js — must be loaded first.
 *
 * Exposes:
 *   window.SCAProgress.getProgress()           → Promise<{ completed, flagged }>
 *   window.SCAProgress.setComplete(id, bool)   → Promise<{ completed, flagged }>
 *   window.SCAProgress.setFlag(id, bool)       → Promise<{ completed, flagged }>
 *
 * Load order:
 *   <script defer src="sca-auth.js"></script>
 *   <script defer src="sca-progress.js"></script>
 */

(() => {
  'use strict';

  if (window.SCAProgress) return; // already loaded

  const PROXY_BASE = "https://scarevision-users-proxy.vercel.app";
  const ENDPOINTS  = {
    progressGet:    `${PROXY_BASE}/api/progress-get-v2`,
    progressUpdate: `${PROXY_BASE}/api/progress-update-v2`,
  };

  /* ============================================================
     WAIT FOR SCAAuth
     sca-auth.js should always be loaded first, but just in case
     we wait up to 4 seconds before giving up.
  ============================================================ */
  function waitForAuth(maxMs = 4000) {
    return new Promise(resolve => {
      if (window.SCAAuth) return resolve(true);
      const start = Date.now();
      const t = setInterval(() => {
        if (window.SCAAuth) { clearInterval(t); resolve(true); return; }
        if (Date.now() - start > maxMs) { clearInterval(t); resolve(false); }
      }, 50);
    });
  }


  /* ============================================================
     PROGRESS CACHE
  ============================================================ */
  const CACHE_KEY    = "sca_progress_v1";
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

  function readCache() {
    try {
      const obj = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!obj?.ts || Date.now() - Number(obj.ts) > CACHE_MAX_AGE) return null;
      return {
        completed: Array.isArray(obj.completed) ? obj.completed.map(Number) : [],
        flagged:   Array.isArray(obj.flagged)   ? obj.flagged.map(Number)   : [],
      };
    } catch { return null; }
  }

  function writeCache(progress) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        completed: Array.isArray(progress.completed) ? progress.completed.map(Number) : [],
        flagged:   Array.isArray(progress.flagged)   ? progress.flagged.map(Number)   : [],
        ts:        Date.now(),
      }));
    } catch {}
  }


  /* ============================================================
     FETCH PROGRESS  (shared single-flight promise)
  ============================================================ */
  let _progressPromise = null;

  async function fetchProgress() {
    await waitForAuth();
    const token = await window.SCAAuth.getToken();
    if (!token) throw new Error("No session");

    const r    = await fetch(ENDPOINTS.progressGet, {
      method: "POST",
      credentials: "include",
      headers: window.SCAAuth.authHeaders(token),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "progress-get failed");

    const progress = {
      completed: Array.isArray(data.completed) ? data.completed.map(Number) : [],
      flagged:   Array.isArray(data.flagged)   ? data.flagged.map(Number)   : [],
    };
    writeCache(progress);
    return progress;
  }

  function getProgress() {
    if (_progressPromise) return _progressPromise;
    _progressPromise = fetchProgress().catch(err => {
      _progressPromise = null; // allow retry on next call
      throw err;
    });
    return _progressPromise;
  }


  /* ============================================================
     UPDATE PROGRESS  (complete / flag)
  ============================================================ */
  async function updateProgress(caseId, action) {
    await waitForAuth();
    const token = await window.SCAAuth.getToken();
    if (!token) throw new Error("No session");

    const r    = await fetch(ENDPOINTS.progressUpdate, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...window.SCAAuth.authHeaders(token),
      },
      body: JSON.stringify({ caseId: Number(caseId), action }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "progress-update failed");

    const progress = {
      completed: Array.isArray(data.completed) ? data.completed.map(Number) : [],
      flagged:   Array.isArray(data.flagged)   ? data.flagged.map(Number)   : [],
    };

    // Update cache and invalidate the shared progress promise so
    // next getProgress() call returns fresh data
    writeCache(progress);
    _progressPromise = Promise.resolve(progress);

    // Notify other tabs/pages
    try { localStorage.setItem("sca-progress-updated", String(Date.now())); } catch {}
    try { window._scaProgressChannel?.postMessage?.({ type: "progress-updated" }); } catch {}

    return progress;
  }


  /* ============================================================
     BROADCAST CHANNEL  (sync across tabs)
  ============================================================ */
  window._scaProgressChannel = "BroadcastChannel" in window
    ? new BroadcastChannel("sca-progress")
    : null;

  if (window._scaProgressChannel) {
    window._scaProgressChannel.onmessage = e => {
      if (e?.data?.type === "progress-updated") {
        // Invalidate cached promise so next getProgress() fetches fresh
        _progressPromise = null;
      }
    };
  }

  window.addEventListener("storage", e => {
    if (e.key === "sca-progress-updated") _progressPromise = null;
  });


  /* ============================================================
     PUBLIC API
  ============================================================ */
  window.SCAProgress = {
    /**
     * Get completed + flagged case ID arrays.
     * Uses cache first on first call, then live proxy.
     * Returns { completed: number[], flagged: number[] }
     */
    getProgress,

    /**
     * Read completed IDs synchronously from cache (no network).
     * Useful for instant UI render before async resolves.
     * Returns number[] or null if no cache.
     */
    readCachedCompleted() {
      return readCache()?.completed ?? null;
    },

    /**
     * Read flagged IDs synchronously from cache.
     * Returns number[] or null if no cache.
     */
    readCachedFlagged() {
      return readCache()?.flagged ?? null;
    },

    /** Mark a case as complete or not complete */
    setComplete(caseId, isCompleted) {
      return updateProgress(caseId, isCompleted ? "complete" : "uncomplete");
    },

    /** Mark a case as flagged or unflagged */
    setFlag(caseId, isFlagged) {
      return updateProgress(caseId, isFlagged ? "flag" : "unflag");
    },
  };

  console.log("[SCAProgress] loaded");

})();
