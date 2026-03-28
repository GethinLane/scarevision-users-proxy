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
 *   2. localStorage sca_member_identity cache   — fallback, used regardless of age
 *   3. session-start-v2 proxy call              — writes signed token
 *   4. Token cached in sca_session_token        — skips step 3 next visit
 *      BUT only if token UID matches current identity
 *
 * ✅ FIX (2026-03-28): getToken() now always resolves identity FIRST, then
 *    validates the cached token's UID against the identity. Prevents cross-user
 *    token reuse when a different person logs in on the same device/browser.
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
   * Read identity from localStorage.
   * 
   * strict=true  — respects the 7-day expiry (used for readIdentity() public API)
   * strict=false — ignores expiry, uses cache regardless of age (used as last
   *                resort fallback in getIdentity() when live fetch fails, since
   *                identity data like email/id doesn't change)
   */
  function readCachedIdentity(strict) {
    if (strict === undefined) strict = true;
    try {
      const raw = localStorage.getItem(ID_KEY);
      if (!raw) return null;
      if (strict) {
        const ts = Number(localStorage.getItem(ID_KEY + "_ts") || 0);
        if (ts > 0 && Date.now() - ts > ID_MAX_AGE) return null;
      }
      const obj = JSON.parse(raw);
      if (obj && obj.id && obj.email) return obj;
    } catch {}
    return null;
  }

  // Single shared identity promise — resolves once per page load
  let _identityPromise = null;

  function getIdentity() {
    if (_identityPromise) return _identityPromise;
    _identityPromise = (async () => {
      // 1. Try live Squarespace session first (also refreshes cache + timestamp)
      const live = await fetchLiveIdentity();
      if (live) return live;

      // 2. Fall back to cache — lenient mode, ignores expiry.
      //    Identity data (email, id, name) doesn't change, so stale cache
      //    is still valid for auth purposes. Live fetch will update it next
      //    time the user has active Squarespace cookies.
      return readCachedIdentity(false);
    })();

    // Don't permanently cache null — allow retry on next call
    _identityPromise.then(function(v) { if (!v) _identityPromise = null; });

    return _identityPromise;
  }


  /* ============================================================
     SESSION TOKEN
  ============================================================ */

  /**
   * Decode the token's payload without verifying the signature.
   * Returns the parsed payload object or null if malformed.
   */
  function decodeTokenPayload(token) {
    try {
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length < 2) return null;
      return JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      return null;
    }
  }

  /**
   * Read the stored token; return it ONLY if:
   *   1. structurally valid
   *   2. not expired
   *   3. UID matches the provided expectedUid (if given)
   *
   * If the UID doesn't match, the stale token is removed from storage
   * so it can never be accidentally reused.
   */
  function readToken(expectedUid) {
    try {
      const t = localStorage.getItem(TOKEN_KEY) || "";
      if (!t) return null;

      const payload = decodeTokenPayload(t);
      if (!payload || !payload.exp || Date.now() > Number(payload.exp)) {
        // Expired or malformed — clean up
        try { localStorage.removeItem(TOKEN_KEY); } catch {}
        return null;
      }

      // ✅ FIX: if we know who the current user is, reject tokens from other users
      if (expectedUid && String(payload.uid) !== String(expectedUid)) {
        console.warn(
          "[SCAAuth] Token UID mismatch — cached token belongs to",
          String(payload.uid).slice(0, 8) + "…",
          "but current user is",
          String(expectedUid).slice(0, 8) + "…",
          "— invalidating stale token"
        );
        try { localStorage.removeItem(TOKEN_KEY); } catch {}
        return null;
      }

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
    const data = await r.json().catch(function() { return {}; });
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

      // ✅ FIX: Always resolve identity FIRST so we can validate the token against it.
      //
      // Priority:
      //   1. Live Squarespace identity (crumb cookies) — highest trust
      //   2. Cached identity (localStorage)            — fallback
      //   3. Neither available                         — no auth possible
      const identity = await getIdentity();
      if (!identity) return null;

      const expectedUid = identity.id || null;

      // Now check for a cached token — but only accept it if the UID matches
      const cached = readToken(expectedUid);
      if (cached) return cached;

      // No valid cached token (or it belonged to a different user) — mint fresh
      try {
        return await startSession(identity);
      } catch (e) {
        console.warn("[SCAAuth] session-start failed:", e);
        return null;
      }
    })();

    // Don't permanently cache null — allow retry on next call
    _tokenPromise.then(function(v) { if (!v) _tokenPromise = null; });

    return _tokenPromise;
  }


  /* ============================================================
     PUBLIC API
  ============================================================ */

  window.SCAAuth = {
    /** Async — resolves to identity object or null */
    getIdentity: getIdentity,

    /** Async — resolves to signed token string or null */
    getToken: getToken,

    /** Synchronous — returns cached identity (respects 7-day expiry) */
    readIdentity: function() { return readCachedIdentity(true); },

    /** Returns auth headers object for fetch calls */
    authHeaders: function(token) {
      return token ? { Authorization: "Bearer " + token } : {};
    },
  };

  // Kick off identity + token resolution immediately so they're
  // ready by the time page scripts and sca-progress.js need them
  getIdentity();
  getToken();

  console.log("[SCAAuth] loaded (with cross-user token guard)");

})();
