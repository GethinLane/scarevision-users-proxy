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
 */

(function () {
  "use strict";

  // ── Config ──
  var LS_KEY = "sca_seen_ai_intro";
  var TOKEN_KEY = "sca_session_token";
  var PROXY_BASE = "https://scarevision-users-proxy.vercel.app";
  var SIGNUP_URL = "https://scarevision.ai?msopen=/member/sign_up/pft2ocszx1";
  var LEARN_MORE_URL = "https://www.scarevision.ai/home";
  var AI_DOMAIN = "scarevision.ai";
  var AI_EXCLUDED_PATHS = ["/home"];

  // ── State ──
  var popupEl = null;
  var pendingUrl = null;

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
    if (hasSeen()) return;

    var token = getToken();
    if (!token) return;

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
      .catch(function () {});
  }

  function fireAndForgetWriteFlag() {
    var token = getToken();
    if (!token) return;

    fetch(PROXY_BASE + "/api/ai-intro-flag", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ hasSeenAiIntro: true }),
    }).catch(function () {});
  }

  // ── Is this an AI link? ──
  function isAiLink(el) {
    if (!el) return false;
    var href = el.getAttribute("href") || "";
    if (href.indexOf(AI_DOMAIN) !== -1) {
      for (var i = 0; i < AI_EXCLUDED_PATHS.length; i++) {
        try {
          var url = new URL(href, window.location.origin);
          if (url.pathname === AI_EXCLUDED_PATHS[i] || url.pathname === AI_EXCLUDED_PATHS[i] + "/") {
            return false;
          }
        } catch {
          if (href.indexOf(AI_DOMAIN + AI_EXCLUDED_PATHS[i]) !== -1) return false;
        }
      }
      return true;
    }
    if (el.classList.contains("js-random-case")) return true;
    return false;
  }

  function getAiUrl(el) {
    var href = el.getAttribute("href") || "";
    if (href.indexOf(AI_DOMAIN) !== -1) return href;
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

        '<h2 class="sca-ai-title">Supercharge your revision with AI</h2>' +

        '<div class="sca-ai-features">' +
          '<div class="sca-ai-feat sca-ai-feat--purple">' +
            '<div class="sca-ai-feat-icon"><i class="fa-solid fa-message-bot"></i></div>' +
            '<div class="sca-ai-feat-label">AI Role-Play</div>' +
          '</div>' +
          '<div class="sca-ai-feat sca-ai-feat--green">' +
            '<div class="sca-ai-feat-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
            '<div class="sca-ai-feat-label">AI Marking</div>' +
          '</div>' +
          '<div class="sca-ai-feat sca-ai-feat--blue">' +
            '<div class="sca-ai-feat-icon"><i class="fa-solid fa-gift"></i></div>' +
            '<div class="sca-ai-feat-label">3 Free Credits</div>' +
          '</div>' +
        '</div>' +

        '<p class="sca-ai-explain">' +
          'You\u2019re just one quick step away! Our AI tools live on a ' +
          'separate site, so you\u2019ll need a ' +
          '<strong>free account</strong> to get started. ' +
          'It only takes 30 seconds \u2014 and you can sign up with Google in one click!' +
        '</p>' +

        '<div class="sca-ai-btns">' +
          '<button class="sca-ai-btn-go" data-sca-ai="signup" type="button">' +
            'Let\u2019s do it \u2014 grab my free credits! ' +
            '<i class="fa-solid fa-arrow-right"></i>' +
          '</button>' +
          '<button class="sca-ai-btn-existing" data-sca-ai="existing" type="button">' +
            'I\u2019m already set up \u2014 take me there' +
          '</button>' +
        '</div>' +

        '<div class="sca-ai-links">' +
          '<button class="sca-ai-link" data-sca-ai="learn" type="button">Tell me more</button>' +
          '<button class="sca-ai-link" data-sca-ai="later" type="button">Maybe later</button>' +
        '</div>' +
      '</div>';

    return backdrop;
  }

  // ── Show / hide ──
  function showPopup(originalUrl) {
    if (popupEl) return;

    pendingUrl = originalUrl;
    popupEl = buildPopup();
    document.body.appendChild(popupEl);

    document.body.style.overflow = "hidden";

    popupEl.addEventListener("click", function (e) {
      if (e.target === popupEl) dismiss();
    });

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
        window.open(LEARN_MORE_URL, "_blank");
      }

      if (action === "later" || action === "close") {
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
    if (hasSeen()) return;

    var link = e.target.closest("a");
    if (!link) return;
    if (!isAiLink(link)) return;

    e.preventDefault();
    e.stopPropagation();

    showPopup(getAiUrl(link));
  }

  // ── Intercept toolbar AI button ──
  function interceptToolbarButton() {
    var aiBtn = document.getElementById("scaAiBtn");
    if (!aiBtn) return;

    aiBtn.removeAttribute("onclick");

    aiBtn.addEventListener("click", function (e) {
      if (hasSeen()) return;
      e.preventDefault();
      e.stopPropagation();
      showPopup("https://www." + AI_DOMAIN + "/members-portal");
    });
  }

  // ── Init ──
  function init() {
    backgroundCheckAirtable();
    document.addEventListener("click", handleClick, true);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", interceptToolbarButton);
    } else {
      interceptToolbarButton();
    }
  }

  init();
})();
