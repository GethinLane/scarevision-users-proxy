/**
 * sca-ai-intro.js
 * ================
 * Shows a one-time onboarding popup when a user clicks an AI link
 * (any link pointing to scarevision.ai) for the first time.
 *
 * Source of truth: localStorage (instant, no auth required)
 * Backup: Airtable HasSeenAiIntro field (cross-device, opportunistic)
 *
 * Load order (in Squarespace header or code block):
 *   <link rel="stylesheet" href="https://scarevision-users-proxy.vercel.app/sca-ai-intro.css">
 *   <script defer src="https://scarevision-users-proxy.vercel.app/sca-ai-intro.js"></script>
 *
 * Optional (improves Airtable backup — add sca-auth.js to portal page):
 *   <script defer src="https://scarevision-users-proxy.vercel.app/sca-auth.js"></script>
 */

(function () {
  "use strict";

  // ── Config ──
  const LS_KEY = "sca_seen_ai_intro";
  const TOKEN_KEY = "sca_session_token";
  const PROXY_BASE = "https://scarevision-users-proxy.vercel.app";
  const SIGNUP_URL = "https://scarevision.ai?msopen=/member/sign_up/pft2ocszx1";
  const LEARN_MORE_URL = "/ai-practice"; // change to your landing page path
  const AI_DOMAIN = "scarevision.ai";

  // ── State ──
  let popupEl = null;
  let pendingUrl = null; // the AI URL the user originally clicked

  // ── localStorage helpers ──
  function hasSeen() {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
  }

  // ── Airtable backup (opportunistic, never blocks UI) ──
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  }

  function backgroundCheckAirtable() {
    // If localStorage already has the flag, skip entirely
    if (hasSeen()) return;

    var token = getToken();
    if (!token) return; // no auth available, that's fine

    // Silent background check — seeds localStorage if Airtable says seen
    fetch(PROXY_BASE + "/api/ai-intro-flag", {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.hasSeenAiIntro) {
          markSeen();
        }
      })
      .catch(function () {}); // silent
  }

  function fireAndForgetWriteFlag() {
    var token = getToken();
    if (!token) return; // no auth, skip silently

    fetch(PROXY_BASE + "/api/ai-intro-flag", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ hasSeenAiIntro: true }),
    }).catch(function () {}); // silent
  }

  // ── Is this an AI link? ──
  function isAiLink(el) {
    if (!el) return false;
    var href = el.getAttribute("href") || "";
    // Matches any link containing scarevision.ai
    if (href.indexOf(AI_DOMAIN) !== -1) return true;
    // Also catch the random case class (generates scarevision.ai URLs)
    if (el.classList.contains("js-random-case")) return true;
    return false;
  }

  function getAiUrl(el) {
    var href = el.getAttribute("href") || "";
    if (href.indexOf(AI_DOMAIN) !== -1) return href;
    // js-random-case generates the URL dynamically — we'll redirect to the AI site
    if (el.classList.contains("js-random-case")) return "https://www." + AI_DOMAIN + "/members-portal";
    return "https://www." + AI_DOMAIN;
  }

  // ── Build popup DOM ──
  function buildPopup() {
    var backdrop = document.createElement("div");
    backdrop.className = "sca-ai-backdrop";
    backdrop.innerHTML =
      '<div class="sca-ai-card">' +
        '<button class="sca-ai-close" data-sca-ai="close" type="button">&times;</button>' +

        '<div class="sca-ai-icon-top">' +
          '<i class="fa-solid fa-brain-circuit"></i>' +
        '</div>' +

        '<h2 class="sca-ai-title">You\'re about to unlock AI practice</h2>' +

        '<div class="sca-ai-features">' +
          '<div class="sca-ai-feat sca-ai-feat--purple">' +
            '<div class="sca-ai-feat-icon"><i class="fa-solid fa-message-bot"></i></div>' +
            '<div class="sca-ai-feat-label">AI Role-Play</div>' +
          '</div>' +
          '<div class="sca-ai-feat sca-ai-feat--green">' +
            '<div class="sca-ai-feat-icon"><i class="fa-solid fa-pen-ruler"></i></div>' +
            '<div class="sca-ai-feat-label">AI Marking</div>' +
          '</div>' +
          '<div class="sca-ai-feat sca-ai-feat--blue">' +
            '<div class="sca-ai-feat-icon"><i class="fa-solid fa-gift"></i></div>' +
            '<div class="sca-ai-feat-label">3 Free Credits</div>' +
          '</div>' +
        '</div>' +

        '<div class="sca-ai-divider"></div>' +

        '<p class="sca-ai-explain">' +
          'Our AI tools run on a separate platform to track your AI progress and credits, so you\'ll need to ' +
          '<strong>create a quick, free account</strong> on our AI site. ' +
          'Takes about 30 seconds \u2014 or one click with Google.' +
        '</p>' +

        '<div class="sca-ai-btns">' +
          '<button class="sca-ai-btn-go" data-sca-ai="signup" type="button">' +
            'Let\u2019s go \u2014 set up my free account ' +
            '<i class="fa-solid fa-arrow-right"></i>' +
          '</button>' +
          '<button class="sca-ai-btn-existing" data-sca-ai="existing" type="button">' +
            'I already have an AI account \u2014 take me there' +
          '</button>' +
          '<button class="sca-ai-btn-learn" data-sca-ai="learn" type="button">' +
            'Learn more about AI practice' +
          '</button>' +
          '<button class="sca-ai-btn-later" data-sca-ai="later" type="button">' +
            'Maybe later' +
          '</button>' +
        '</div>' +
      '</div>';

    return backdrop;
  }

  // ── Show / hide ──
  function showPopup(originalUrl) {
    if (popupEl) return; // already showing

    pendingUrl = originalUrl;
    popupEl = buildPopup();
    document.body.appendChild(popupEl);

    // Prevent body scroll
    document.body.style.overflow = "hidden";

    // Click backdrop to dismiss
    popupEl.addEventListener("click", function (e) {
      if (e.target === popupEl) dismiss();
    });

    // Button handlers
    popupEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-sca-ai]");
      if (!btn) return;

      var action = btn.getAttribute("data-sca-ai");

      if (action === "signup") {
        markSeen();
        fireAndForgetWriteFlag();
        window.location.href = SIGNUP_URL;
      }

      if (action === "existing") {
        markSeen();
        fireAndForgetWriteFlag();
        window.location.href = pendingUrl || "https://www." + AI_DOMAIN;
      }

      if (action === "learn") {
        // Open in new tab, keep popup open
        window.open(LEARN_MORE_URL, "_blank");
      }

      if (action === "later" || action === "close") {
        // Do NOT set flag — popup will show again next time
        dismiss();
      }
    });
  }

  function dismiss() {
    if (!popupEl) return;
    popupEl.remove();
    popupEl = null;
    pendingUrl = null;
    document.body.style.overflow = "";
  }

  // ── Intercept AI link clicks ──
  function handleClick(e) {
    // Already seen? Let everything through normally
    if (hasSeen()) return;

    var link = e.target.closest("a");
    if (!link) return;
    if (!isAiLink(link)) return;

    // Prevent the navigation
    e.preventDefault();
    e.stopPropagation();

    // Show the popup with the original destination stored
    showPopup(getAiUrl(link));
  }

  // ── Also intercept the toolbar AI button ──
  function interceptToolbarButton() {
    var aiBtn = document.getElementById("scaAiBtn");
    if (!aiBtn) return;

    // Remove the inline onclick
    aiBtn.removeAttribute("onclick");

    aiBtn.addEventListener("click", function (e) {
      if (hasSeen()) {
        // When they've seen the popup, let it do whatever it normally does
        // For now it's "Coming Soon" — when you wire it up, change this
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      showPopup("https://www." + AI_DOMAIN + "/members-portal");
    });
  }

  // ── Init ──
  function init() {
    // Background Airtable check (non-blocking, seeds localStorage if flag exists)
    backgroundCheckAirtable();

    // Intercept all AI link clicks via delegation
    document.addEventListener("click", handleClick, true);

    // Intercept toolbar button when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", interceptToolbarButton);
    } else {
      interceptToolbarButton();
    }
  }

  init();
})();
