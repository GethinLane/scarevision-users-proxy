/**
 * sca-auth.js — v2 with SiteUserInfo fast-path
 * =============================================
 * Handles all identity and session token logic.
 * Must be loaded before sca-progress.js and any page scripts.
 *
 * Exposes (UNCHANGED from v1):
 *   window.SCAAuth.getIdentity()  → Promise<identity|null>
 *   window.SCAAuth.getToken()     → Promise<token|null>
 *   window.SCAAuth.readIdentity() → identity|null  (synchronous, cache only)
 *   window.SCAAuth.authHeaders(t) → { Authorization: "Bearer " + t } | {}
 *
 * ─── WHAT CHANGED IN v2 ───────────────────────────────────────────────
 *
 * Squarespace sets a readable `SiteUserInfo` cookie on every logged-in page:
 *   {
 *     "authenticated": true,
 *     "lastAuthenticatedOn": "2026-04-23T12:57:55.449Z",
 *     "siteUserId": "65c1f73c3318b741cc561f12",
 *     "firstName": "free"
 *   }
 *
 * Previously, `getToken()` always did:
 *   1. fetch /api/site-users/account/profile  (~200-400ms)
 *   2. Decode cached token, verify uid matches fetched identity
 *   3. Return cached token
 *
 * v2 adds a synchronous fast-path BEFORE step 1:
 *   a. Parse SiteUserInfo cookie → get siteUserId
 *   b. Read cached token from localStorage, decode its uid, check expiry
 *   c. If token.uid === siteUserId AND token not expired → return cached
 *      token INSTANTLY (zero network calls)
 *   d. If anything fails → fall through to the existing slow path
 *
 * ─── SAFETY PROPERTIES PRESERVED ──────────────────────────────────────
 *
 * 1. Cross-user token reuse is still blocked. Squarespace maintains
 *    `SiteUserInfo` — when User B logs in, the cookie gets rewritten
 *    with User B's siteUserId. Any stale token minted for User A fails
 *    the uid-match check and falls through to mint a fresh one.
 *
 * 2. Server-side signature verification unchanged. Progress endpoints
 *    still verify the token signature; a forged or tampered token
 *    fails server-side regardless of what happens client-side.
 *
 * 3. No regression if `SiteUserInfo` is missing or malformed. The
 *    fast-path bails, slow-path runs exactly as before. Worst case =
 *    current behaviour, best case = ~300-500ms saved per page load.
 *
 * 4. Token expiry still checked. If cached token is expired,
 *    fast-path bails regardless of uid match.
 */

(() => {
  'use strict';

  if (window.SCAAuth) return; // already loaded

  const PROXY_BASE = "https://scarevision-users-proxy.vercel.app";
  const ID_KEY     = "sca_member_identity";
  const TOKEN_KEY  = "sca_session_token";
  const ID_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days


  /* ============================================================
     COOKIE HELPERS
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
   * NEW in v2: Read Squarespace's SiteUserInfo cookie.
   * Returns the parsed object or null if missing/malformed.
   *
   * The cookie looks like:
   *   SiteUserInfo={"authenticated":true,"siteUserId":"...","firstName":"...",...}
   *
   * Returns null if:
   *   - Cookie not present
   *   - Cookie not valid JSON (malformed)
   *   - authenticated !== true (logged out)
   *   - No siteUserId (unexpected shape)
   */
  function readSiteUserInfoCookie() {
    try {
      const cookies = cookieMap();
      const raw = cookies["SiteUserInfo"];
      if (!raw) return null;

      const info = JSON.parse(raw);
      if (!info || info.authenticated !== true) return null;
      if (!info.siteUserId) return null;

      return {
        siteUserId:         String(info.siteUserId),
        firstName:          info.firstName || null,
        lastAuthenticatedOn: info.lastAuthenticatedOn || null,
      };
    } catch {
      // Malformed JSON, URI decode failure, etc. — bail silently.
      return null;
    }
  }


  /* ============================================================
     IDENTITY
  ============================================================ */

  /**
   * Try to fetch identity live from Squarespace.
   * Returns identity object or null if not logged in / cookies missing.
   *
   * This is the "slow path" — makes an HTTP call to the profile endpoint.
   * Called when:
   *   - Fast-path fails (no SiteUserInfo, or uid mismatch, or no token)
   *   - User explicitly calls getIdentity() for full profile data
   *     (email, lastName — not in SiteUserInfo cookie)
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

      // Cross-user token guard: reject tokens from other users
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

    // ╔═══════════════════════════════════════════════════════════╗
    // ║  FAST PATH (new in v2)                                    ║
    // ║  ───────────────────────                                  ║
    // ║  Fully synchronous. Zero network calls.                   ║
    // ║                                                           ║
    // ║  If Squarespace's SiteUserInfo cookie is present AND      ║
    // ║  we have a cached token whose uid matches AND the token   ║
    // ║  is not expired → return it immediately. This covers the  ║
    // ║  ~common case of a returning user on their own device.   ║
    // ║                                                           ║
    // ║  If any check fails (cookie missing, no cached token,     ║
    // ║  uid mismatch, token expired) → fall through to the slow  ║
    // ║  path below. Worst case is identical to v1 behaviour.     ║
    // ╚═══════════════════════════════════════════════════════════╝

    const sqspInfo = readSiteUserInfoCookie();
    if (sqspInfo?.siteUserId) {
      const fastToken = readToken(sqspInfo.siteUserId);
      if (fastToken) {
        // Cache this promise so repeated getToken() calls during the same
        // page load don't re-parse the cookie.
        _tokenPromise = Promise.resolve(fastToken);

        // Background: kick off a live identity refresh so the
        // sca_member_identity cache stays fresh for next visit. Non-blocking
        // — we don't await it. If the user has changed, the next page load's
        // fast-path uid check will catch the mismatch.
        //
        // Only run if cached identity is missing or older than 24h — no need
        // to hammer the profile endpoint on every page load.
        try {
          const ts = Number(localStorage.getItem(ID_KEY + "_ts") || 0);
          const stale = !ts || (Date.now() - ts > 24 * 60 * 60 * 1000);
          if (stale) fetchLiveIdentity().catch(() => {});
        } catch {}

        return _tokenPromise;
      }
    }

    // ╔═══════════════════════════════════════════════════════════╗
    // ║  SLOW PATH (v1 behaviour)                                 ║
    // ║  ────────────────────────                                 ║
    // ║  Runs when the fast path didn't match — e.g.:             ║
    // ║   - First visit (no cached token)                         ║
    // ║   - Token expired                                         ║
    // ║   - Different user now logged in (uid mismatch)           ║
    // ║   - SiteUserInfo cookie missing/malformed                 ║
    // ║   - User logged out (cleared by Squarespace)              ║
    // ║                                                           ║
    // ║  Resolves identity live (HTTP call), verifies cached      ║
    // ║  token if present, otherwise mints a fresh one via        ║
    // ║  session-start-v2.                                        ║
    // ╚═══════════════════════════════════════════════════════════╝

    _tokenPromise = (async () => {
      const identity = await getIdentity();
      if (!identity) return null;

      const expectedUid = identity.id || null;

      // Check cache again now that we have the live uid
      const cached = readToken(expectedUid);
      if (cached) return cached;

      // Mint fresh token
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
     PUBLIC API  (unchanged from v1)
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

  // Kick off token resolution immediately so it's ready by the time
  // page scripts and sca-progress.js need it. getIdentity() is no
  // longer pre-warmed — the fast-path in getToken() doesn't need it,
  // and it'll be called lazily by the slow path if needed.
  getToken();

  console.log("[SCAAuth] v2 loaded (with SiteUserInfo fast-path)");

})();
