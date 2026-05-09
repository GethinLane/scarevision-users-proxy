/**
 * sca-progress-for-sca-auth-v2.js
 * ===============
 * V2: Same as V1 + null/corruption guards on cache read/write + safe number parsing
 * ★ V2.1: Guide tracking added (completedGuides, setGuideComplete, etc.)
 *
 * Purely handles reading and writing user progress (completed + flagged cases,
 * and now completed guides). All auth/identity is delegated to sca-auth.js —
 * must be loaded first.
 *
 * Exposes:
 *   window.SCAProgress.getProgress()                    → Promise<{ completed, flagged, completedDates, completedGuides }>
 *   window.SCAProgress.setComplete(id, bool)            → Promise<progress>
 *   window.SCAProgress.setFlag(id, bool)                → Promise<progress>
 *   window.SCAProgress.readCachedCompleted()            → number[] | null
 *   window.SCAProgress.readCachedFlagged()              → number[] | null
 *   ★ window.SCAProgress.setGuideComplete(slug, bool)   → Promise<progress>
 *   ★ window.SCAProgress.readCachedCompletedGuides()    → { slug: dateString } | null
 *   ★ window.SCAProgress.readCachedGuideSlugs()         → string[] | null
 *   ★ window.SCAProgress.isGuideCompleted(slug)         → boolean | null  (sync, cache-only)
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

  // ★ NEW: guide slug validation, mirrored from server (api/progress-update-v2.js).
  //   Catches typos client-side so we don't bother the server with garbage.
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i;

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
   * ★ NEW: Safe guide map: { slug: dateStringOrNull }.
   * Same defensive parsing pattern as toSafeNumberArray, but for the
   * slug-keyed object shape used by completedGuides.
   */
  function toSafeGuideMap(val) {
    if (!val || typeof val !== "object" || Array.isArray(val)) return {};
    const out = {};
    for (const k of Object.keys(val)) {
      const slug = String(k).trim();
      if (!slug) continue;
      out[slug] = typeof val[k] === "string" ? val[k] : null;
    }
    return out;
  }

  /**
   * ✅ Validate a progress object has the expected shape.
   * Returns true only if both arrays are present and well-formed.
   *
   * Note: completedGuides is intentionally NOT required — caches written
   * before guide tracking existed don't have it, and we want to keep
   * accepting them rather than nuke valid case progress.
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
    if (!raw) return null;

    const obj = JSON.parse(raw);

    if (!obj?.ts || Date.now() - Number(obj.ts) > CACHE_MAX_AGE) return null;
    if (!isValidProgress(obj)) return null;

    return {
      completed:      toSafeNumberArray(obj.completed),
      flagged:        toSafeNumberArray(obj.flagged),
      completedDates: (obj.completedDates && typeof obj.completedDates === "object")
                        ? obj.completedDates : {},
      // ★ NEW: read guides if present, default to {} for old caches.
      completedGuides: toSafeGuideMap(obj.completedGuides),
    };
  } catch {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    return null;
  }
}

function writeCache(progress) {
  try {
    if (!isValidProgress(progress)) return;

    localStorage.setItem(CACHE_KEY, JSON.stringify({
      completed:      toSafeNumberArray(progress.completed),
      flagged:        toSafeNumberArray(progress.flagged),
      completedDates: (progress.completedDates && typeof progress.completedDates === "object")
                        ? progress.completedDates : {},
      // ★ NEW: persist guides alongside cases.
      completedGuides: toSafeGuideMap(progress.completedGuides),
      ts:             Date.now(),
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
      completed:      toSafeNumberArray(data.completed),
      flagged:        toSafeNumberArray(data.flagged),
      completedDates: (data.completedDates && typeof data.completedDates === "object")
                        ? data.completedDates : {},
      // ★ NEW: surface guide map to callers.
      completedGuides: toSafeGuideMap(data.completedGuides),
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
      completed:      toSafeNumberArray(data.completed),
      flagged:        toSafeNumberArray(data.flagged),
      completedDates: (data.completedDates && typeof data.completedDates === "object")
                        ? data.completedDates : {},
      // ★ NEW: server returns guides on every update; keep cache in sync.
      completedGuides: toSafeGuideMap(data.completedGuides),
    };

    writeCache(progress);
    _progressPromise = Promise.resolve(progress);

    // Notify other tabs/pages
    try { localStorage.setItem("sca-progress-updated", String(Date.now())); } catch {}
    try { window._scaProgressChannel?.postMessage?.({ type: "progress-updated" }); } catch {}

    return progress;
  }


  /* ============================================================
     ★ NEW: UPDATE PROGRESS  (guide complete / uncomplete)
     Mirrors updateProgress() but sends { slug, action } instead of
     { caseId, action }. Server routes on which key is present.
  ============================================================ */
  async function updateGuideProgress(slug, action) {
    await waitForAuth();
    const token = await window.SCAAuth.getToken();
    if (!token) throw new Error("No session");

    if (typeof slug !== "string" || !SLUG_RE.test(slug.trim())) {
      throw new Error(`Invalid slug: ${slug}`);
    }
    const cleanSlug = slug.trim();

    const r    = await fetch(ENDPOINTS.progressUpdate, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...window.SCAAuth.authHeaders(token),
      },
      body: JSON.stringify({ slug: cleanSlug, action }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "progress-update failed");

    const progress = {
      completed:      toSafeNumberArray(data.completed),
      flagged:        toSafeNumberArray(data.flagged),
      completedDates: (data.completedDates && typeof data.completedDates === "object")
                        ? data.completedDates : {},
      completedGuides: toSafeGuideMap(data.completedGuides),
    };

    writeCache(progress);
    _progressPromise = Promise.resolve(progress);

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
     * Get completed + flagged case ID arrays + completed guide map.
     * Uses cache first on first call, then live proxy.
     * Returns { completed: number[], flagged: number[], completedDates: {}, completedGuides: {} }
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

    /* ──────────────────────────────────────────────────────────
       ★ NEW: Guide progress API.
       Mirror-image of the case API but keyed by slug.
    ────────────────────────────────────────────────────────── */

    /** Read completed-guides map synchronously from cache. */
    readCachedCompletedGuides() {
      return readCache()?.completedGuides ?? null;
    },

    /** Read just the slugs of completed guides. */
    readCachedGuideSlugs() {
      const map = readCache()?.completedGuides;
      return map ? Object.keys(map) : null;
    },

    /** Sync check: is a specific guide completed? null = no cache yet. */
    isGuideCompleted(slug) {
      const map = readCache()?.completedGuides;
      if (!map) return null;
      return Object.prototype.hasOwnProperty.call(map, slug);
    },

    /** Mark a guide as read or unread. */
    setGuideComplete(slug, isCompleted) {
      return updateGuideProgress(slug, isCompleted ? "complete" : "uncomplete");
    },
  };

  console.log("[SCAProgress] v2 with guide tracking loaded");

})();
