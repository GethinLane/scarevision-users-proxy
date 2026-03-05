/**
 * sca-progress-for-sca-auth-v2.js
 * ===============
 * V2: Same as V1 + null/corruption guards on cache read/write + safe number parsing
 *
 * Purely handles reading and writing user progress (completed + flagged cases).
 * All auth/identity is delegated to sca-auth.js — must be loaded first.
 *
 * Exposes:
 *   window.SCAProgress.getProgress()           → Promise<{ completed, flagged }>
 *   window.SCAProgress.setComplete(id, bool)   → Promise<{ completed, flagged }>
 *   window.SCAProgress.setFlag(id, bool)       → Promise<{ completed, flagged }>
 *   window.SCAProgress.readCachedCompleted()   → number[] | null
 *   window.SCAProgress.readCachedFlagged()     → number[] | null
 *
 * Load order:
 *   <script defer src="sca-auth.js"></script>
 *   <script defer src="sca-progress-v2.js"></script>
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
     HELPERS
  ============================================================ */

  /**
   * ✅ Safe number array: filters out nulls, undefineds, and NaNs.
   * Prevents corrupted cache entries from propagating.
   */
  function toSafeNumberArray(val) {
    if (!Array.isArray(val)) return [];
    return val
      .map(Number)
      .filter(n => Number.isFinite(n));
  }

  /**
   * ✅ Validate a progress object has the expected shape.
   * Returns true only if both arrays are present and well-formed.
   */
  function isValidProgress(obj) {
    return (
      obj != null &&
      typeof obj === 'object' &&
      Array.isArray(obj.completed) &&
      Array.isArray(obj.flagged)
    );
  }


  /* ============================================================
     PROGRESS CACHE
  ============================================================ */
  const CACHE_KEY     = "sca_progress_v1";
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      // ✅ Guard: if nothing stored, return null cleanly
      if (!raw) return null;

      const obj = JSON.parse(raw);

      // ✅ Guard: reject stale or malformed cache entries
      if (!obj?.ts || Date.now() - Number(obj.ts) > CACHE_MAX_AGE) return null;
      if (!isValidProgress(obj)) return null;

      return {
        completed: toSafeNumberArray(obj.completed),
        flagged:   toSafeNumberArray(obj.flagged),
      };
    } catch {
      // ✅ Guard: corrupted JSON — clear it so it doesn't keep failing
      try { localStorage.removeItem(CACHE_KEY); } catch {}
      return null;
    }
  }

  function writeCache(progress) {
    try {
      // ✅ Guard: only write if progress is valid
      if (!isValidProgress(progress)) return;

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        completed: toSafeNumberArray(progress.completed),
        flagged:   toSafeNumberArray(progress.flagged),
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

    // ✅ Guard: sanitise API response before using or caching
    const progress = {
      completed: toSafeNumberArray(data.completed),
      flagged:   toSafeNumberArray(data.flagged),
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

    // ✅ Guard: ensure caseId is a valid finite number before sending
    const safeCaseId = Number(caseId);
    if (!Number.isFinite(safeCaseId)) throw new Error(`Invalid caseId: ${caseId}`);

    const r    = await fetch(ENDPOINTS.progressUpdate, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...window.SCAAuth.authHeaders(token),
      },
      body: JSON.stringify({ caseId: safeCaseId, action }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "progress-update failed");

    // ✅ Guard: sanitise API response before caching
    const progress = {
      completed: toSafeNumberArray(data.completed),
      flagged:   toSafeNumberArray(data.flagged),
    };

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

  console.log("[SCAProgress] v2 loaded");

})();
