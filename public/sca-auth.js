/**
 * sca-auth.js
 * ===========
 * Handles all identity and session token logic.
 * Must be loaded before sca-progress.js and any page scripts.
 *
 * Exposes:
 *   window.SCAAuth.getIdentity()  → Promise<identity|null>
 *   window.SCAAuth.getToken()     → Promise<token|null>
 *   window.SCAAuth.readIdentity() → identity|null  (synchronous, cache only)
 *
 * Auth order:
 *   1. Live Squarespace session (crumb cookies) — freshest, updates cache
 *   2. localStorage sca_member_identity cache   — instant fallback
 *   3. session-start-v2 proxy call              — writes signed token
 *   4. Token cached in sca_session_token        — skips steps 1-3 next visit
 */

(() => {
  'use strict';

  if (window.SCAAuth) return; // already loaded

  const PROXY_BASE = "https://scarevision-users-proxy.vercel.app";
  const ID_KEY     = "sca_member_identity";
  const TOKEN_KEY  = "sca_session_token";
  const ID_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days


  /* ============================================================
     IDENTITY
  ============================================================ */

  /** Parse document.cookie into a key→value map */
  function cookieMap() {
    return document.cookie.split(";").reduce((acc, c) => {
      const i = c.indexOf("=");
      if (i < 0) return acc;
      acc[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1));
      return acc;
    }, {});
  }

  /**
   * Try to fetch identity live from Squarespace.
   * Returns identity object or null if not logged in / cookies missing.
   */
  async function fetchLiveIdentity() {
    try {
      const cookies       = cookieMap();
      const crumb         = cookies["crumb"];
      const siteUserCrumb = cookies["siteUserCrumb"];
      if (!crumb || !siteUserCrumb) return null;

      const r = await fetch("/api/site-users/account/profile", {
        headers: {
          "x-csrf-token":          crumb,
          "x-siteuser-xsrf-token": siteUserCrumb,
        },
      });
      if (!r.ok) return null;

      const p = await r.json().catch(() => null);
      if (!p?.email) return null;

      const identity = {
        id:        p.id               || null,
        email:     p.email            || null,
        firstName: p?.name?.firstName || null,
        lastName:  p?.name?.lastName  || null,
      };

      // Always update cache with latest live identity + timestamp
      try {
        localStorage.setItem(ID_KEY, JSON.stringify(identity));
        localStorage.setItem(ID_KEY + "_ts", String(Date.now()));
      } catch {}

      return identity;

    } catch { return null; }
  }

  /**
   * Read identity from localStorage synchronously.
   * Returns identity object or null if missing / expired.
   *
   * FIX: Only reject on expiry if _ts actually exists.
   * If _ts is missing (written by another script that doesn't set it),
   * we still use the cached identity — we just can't check expiry.
   */
  function readCachedIdentity() {
    try {
      const raw = localStorage.getItem(ID_KEY);
      if (!raw) return null;
      const ts = Number(localStorage.getItem(ID_KEY + "_ts") || 0);
      // Only apply expiry check if a timestamp was actually written
      if (ts > 0 && Date.now() - ts > ID_MAX_AGE) return null;
      const obj = JSON.parse(raw);
      if (obj?.id && obj?.email) return obj;
    } catch {}
    return null;
  }

  // Single shared identity promise — resolves once per page load
  let _identityPromise = null;

  /**
   * FIX: Don't permanently cache a null result.
   * If identity resolves to null, clear the promise so the next
   * call retries rather than being stuck returning null forever.
   */
  function getIdentity() {
    if (_identityPromise) return _identityPromise;
    _identityPromise = (async () => {
      // 1. Try live Squarespace session first
      const live = await fetchLiveIdentity();
      if (live) return live;

      // 2. Fall back to localStorage cache
      return readCachedIdentity();
    })();

    // Don't cache null — allow retry on next call
    _identityPromise.then(v => { if (!v) _identityPromise = null; });

    return _identityPromise;
  }


  /* ============================================================
     SESSION TOKEN
  ============================================================ */

  /**
   * Read the stored token; return it if structurally valid and not expired.
   * Token format: base64url(payload).hmac  (two parts, not a JWT).
   */
  function readToken() {
    try {
      const t = localStorage.getItem(TOKEN_KEY) || "";
      if (!t) return null;
      const parts = t.split(".");
      if (parts.length < 2) return null;
      // Payload is parts[0] — contains { uid, exp, ... }
      const payload = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
      if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
      return t;
    } catch { return null; }
  }

  /**
   * Call session-start-v2 with identity → receive a signed token.
   * Token is stored in localStorage for reuse.
   */
  async function startSession(identity) {
    const r = await fetch(`${PROXY_BASE}/api/session-start-v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        squarespaceUserId: identity.id,
        email:             identity.email,
        firstName:         identity.firstName,
        lastName:          identity.lastName,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "session-start failed");
    if (data.token) {
      try { localStorage.setItem(TOKEN_KEY, data.token); } catch {}
      return data.token;
    }
    return null;
  }

  // Single shared token promise — resolves once per page load
  let _tokenPromise = null;

  function getToken() {
    if (_tokenPromise) return _tokenPromise;
    _tokenPromise = (async () => {
      // Fast path — valid cached token, no network needed
      const cached = readToken();
      if (cached) return cached;

      // Need identity to start a session
      const identity = await getIdentity();
      if (!identity) return null;

      try {
        return await startSession(identity);
      } catch (e) {
        console.warn("[SCAAuth] session-start failed:", e);
        return null;
      }
    })();

    // Don't cache null — allow retry on next call
    _tokenPromise.then(v => { if (!v) _tokenPromise = null; });

    return _tokenPromise;
  }


  /* ============================================================
     PUBLIC API
  ============================================================ */

  window.SCAAuth = {
    /** Async — resolves to identity object or null */
    getIdentity,

    /** Async — resolves to signed token string or null */
    getToken,

    /** Synchronous — returns cached identity instantly (may be null) */
    readIdentity: readCachedIdentity,

    /** Returns auth headers object for fetch calls */
    authHeaders(token) {
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  };

  // Kick off identity + token resolution immediately so they're
  // ready by the time page scripts and sca-progress.js need them
  getIdentity();
  getToken();

  console.log("[SCAAuth] loaded");

})();
