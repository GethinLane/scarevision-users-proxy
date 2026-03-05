/**
 * SCA Dashboard — Unified Script v2
 * ====================================
 * One file. One auth strategy. Cache first, everywhere.
 *
 * Pattern (mirrors the welcome name script throughout):
 *   1. Read from localStorage cache       → render/use instantly, no network
 *   2. If sca_session_token is valid      → call proxy directly, no SCAProgress
 *   3. If token missing/expired           → await SCA.progressReady (re-auth once)
 *   4. Update cache after live fetch      → next visit skips auth entirely
 *
 * Covers:
 *   - Shared auth bootstrap  (SCA.progressReady — runs ONCE if needed)
 *   - Case map               (Airtable, public, no auth)
 *   - Welcome name           (#dashWelcomeName)
 *   - Case completion card   (#scaCaseCompletionCard)
 *   - Progress breakdown     (#scaBreakdownCard)
 *   - Exam date hero         (#scaHeroExamCard)
 */

(() => {
  'use strict';

  /* ============================================================
     1. SHARED AUTH BOOTSTRAP
     SCAProgress.init() runs AT MOST ONCE per page load.
     Only called if the cached session token is missing or expired.
  ============================================================ */
  window.SCA = window.SCA || {};

  if (!window.SCA.progressReady) {
    window.SCA.progressReady = (async () => {
      const start = Date.now();
      while (!window.SCAProgress?.init && Date.now() - start < 4000) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (!window.SCAProgress?.init) return null;
      try {
        return await window.SCAProgress.init(); // exactly once
      } catch {
        return null;
      }
    })();
  }


  /* ============================================================
     2. SESSION TOKEN HELPERS
     The proxy uses a signed Bearer token stored as sca_session_token.
     Reading this (like sca_member_identity in the welcome script) lets
     us call the proxy directly without touching SCAProgress at all.
  ============================================================ */
  const PROXY_BASE = "https://scarevision-users-proxy.vercel.app";
  const TOKEN_KEY  = "sca_session_token";

  /** Returns the raw token string if present and not yet expired, else null. */
  function readToken() {
    try {
      const t = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
      if (!t) return null;
      // Peek at expiry from the base64url payload — no full verify needed client-side
      const payload = JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
      if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
      return t;
    } catch { return null; }
  }

  function authHeaders(token) {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Fetch progress (completed + flagged arrays) using the cached token.
   * If the token is missing or rejected, falls back to SCA.progressReady
   * to re-authenticate (writing a fresh token to localStorage), then retries.
   * Returns { completed: number[], flagged: number[] } or null on failure.
   */
  async function getProgress() {
    // Fast path — valid cached token, call proxy directly (no SCAProgress)
    let token = readToken();
    if (token) {
      try {
        const r    = await fetch(`${PROXY_BASE}/api/progress-get-v2`, {
          method: "POST", credentials: "include",
          headers: authHeaders(token)
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.ok) return data;
        // Token was structurally valid but rejected server-side — fall through
      } catch {}
    }

    // Slow path — need SCAProgress to (re-)authenticate.
    // This is the ONLY place SCAProgress is ever invoked.
    const res = await window.SCA.progressReady;
    if (!res) return null;

    // SCAProgress.init() writes a fresh token to localStorage
    token = readToken();
    if (!token) {
      // Older build: progressReady itself returned progress data directly
      if (Array.isArray(res?.progress?.completed)) return res.progress;
      return null;
    }

    try {
      const r    = await fetch(`${PROXY_BASE}/api/progress-get-v2`, {
        method: "POST", credentials: "include",
        headers: authHeaders(token)
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) return data;
    } catch {}

    return null;
  }


  /* ============================================================
     3. PROGRESS CACHE  (shared across all widgets on the page)
     Same key as before — completion card and breakdown share this.
  ============================================================ */
  const PROGRESS_CACHE_KEY = "sca_cc_completed_ids_v1";
  const PROGRESS_MAX_AGE   = 24 * 60 * 60 * 1000;

  function readProgressCache() {
    try {
      const obj = JSON.parse(localStorage.getItem(PROGRESS_CACHE_KEY) || "null");
      if (!obj?.ts || Date.now() - Number(obj.ts) > PROGRESS_MAX_AGE) return null;
      if (!Array.isArray(obj.completed)) return null;
      return obj.completed.map(Number);
    } catch { return null; }
  }

  function writeProgressCache(completedIds) {
    try {
      localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify({
        completed: Array.isArray(completedIds) ? completedIds.map(Number) : [],
        ts: Date.now()
      }));
    } catch {}
  }


  /* ============================================================
     4. CASE MAP  (Airtable, public — no auth, start immediately)
  ============================================================ */
  async function loadCaseMap() {
    try {
      const r    = await fetch(
        "https://scarevision-airtable-proxy.vercel.app/api/cases-list-data",
        { cache: "no-store" }
      );
      const data = await r.json();
      const records = Array.isArray(data.records) ? data.records : [];

      const asArray = v => {
        if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
        if (typeof v === "string") return v.split(",").map(s => s.trim()).filter(Boolean);
        return [];
      };

      window.SCA_CASE_MAP = records
        .map(rec => {
          const f    = rec.fields || {};
          const id   = Number(f["Case ID"]);
          const name = String(f["Name"] || "").trim();
          if (!Number.isFinite(id) || !name) return null;
          return {
            id,
            name,
            groups: asArray(f["Domain"] ?? f["Themes"]),
            topics: asArray(f["Clinical Topics"]),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.id - b.id);

      console.log("[SCA] Case map loaded:", window.SCA_CASE_MAP.length);
    } catch (e) {
      console.warn("[SCA] Failed to load SCA_CASE_MAP:", e);
      window.SCA_CASE_MAP = [];
    }
  }


  /* ============================================================
     5. SHARED UTILITIES
  ============================================================ */
  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function waitFor(predicate, timeoutMs = 20000) {
    return new Promise(resolve => {
      const start = Date.now();
      (function tick() {
        try { if (predicate()) return resolve(true); } catch {}
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tick, 50);
      })();
    });
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, ch =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch])
    );
  }

  function showLoginNotice() {
    const el = document.getElementById("scaInlineLoginNotice");
    if (el) el.hidden = false;
  }


  /* ============================================================
     6. WELCOME NAME  (#dashWelcomeName)
     Original working pattern — kept exactly as-is.
  ============================================================ */
  function initWelcomeName() {
    const el = document.getElementById("dashWelcomeName");
    if (!el) return;

    function formatName(identity) {
      const first = (identity?.firstName || "").trim();
      const last  = (identity?.lastName  || "").trim();
      return [first, last].filter(Boolean).join(" ");
    }

    function setName(name) { el.textContent = name ? `, ${name}` : ""; }

    // Step 1: instant from cache (sca_member_identity written by SCAProgress)
    try {
      const cached = JSON.parse(localStorage.getItem("sca_member_identity") || "null");
      const name   = formatName(cached);
      if (name) setName(name);
    } catch {}

    // Step 2: live update once auth resolves (only if needed)
    (async () => {
      try {
        const res  = await window.SCA.progressReady;
        const name = formatName(res?.identity);
        if (name) setName(name);
      } catch {}
    })();
  }


  /* ============================================================
     7. CASE COMPLETION CARD  (#scaCaseCompletionCard)
     Cache first → proxy with token → progressReady fallback.
  ============================================================ */
  function initCaseCompletionCard() {
    const countEl = document.getElementById("scaCcCompletedCount");
    if (!countEl) return;

    const TOTAL = 353;

    const toggle  = document.getElementById("scaCcTrackToggle");
    const panel   = document.getElementById("scaCcTrackPanel");
    const totalEl = document.getElementById("scaCcTotalCount");
    const pctEl   = document.getElementById("scaCcPctText");
    const ringFg  = document.getElementById("scaCcRingFg");

    if (toggle && panel) {
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", open ? "false" : "true");
        panel.hidden = open;
      });
    }

    if (totalEl) totalEl.textContent = String(TOTAL);

    const C = 2 * Math.PI * 46;

    function render(completedIds) {
      const n    = Array.isArray(completedIds) ? completedIds.length : Number(completedIds) || 0;
      const safe = Math.max(0, Math.min(TOTAL, n));
      const pct  = TOTAL > 0 ? safe / TOTAL : 0;
      countEl.textContent = String(safe);
      if (pctEl)  pctEl.textContent            = `${Math.round(pct * 100)}%`;
      if (ringFg) ringFg.style.strokeDasharray = `${C * pct} ${C * (1 - pct)}`;
    }

    // Step 1: render from cache instantly
    const cached = readProgressCache();
    render(cached || []);

    // Step 2: live update — token first, progressReady fallback
    (async () => {
      try {
        const progress = await getProgress();
        const ids      = Array.isArray(progress?.completed) ? progress.completed : [];
        render(ids);
        writeProgressCache(ids);
      } catch {}
    })();
  }


  /* ============================================================
     8. PROGRESS BREAKDOWN  (#scaBreakdownCard)
     Cache → Airtable case map → render immediately.
     Live auth in background, re-renders only if data changed.
  ============================================================ */
  function initProgressBreakdown() {
    const barsEl = document.getElementById("scaBreakdownBars");
    if (!barsEl) return;

    const btnTopics   = document.getElementById("scaModeTopics");
    const btnGroups   = document.getElementById("scaModeGroups");
    const strongGrid  = document.getElementById("scaStrongGrid");
    const weakGrid    = document.getElementById("scaWeakGrid");
    const strongTitle = document.getElementById("scaStrongTitle");
    const weakTitle   = document.getElementById("scaWeakTitle");

    let completedSet = new Set();
    let mode         = "topic";
    let topicRows    = [];
    let groupRows    = [];
    let labelToIds   = new Map();
    let openLabel    = null;

    function getCaseName(id, mappingIndex) {
      return mappingIndex?.get(id)?.name || window.SCA_CASE_NAMES?.[id] || null;
    }

    function buildLabelToIds(mapping, key) {
      const m = new Map();
      for (const row of (mapping || [])) {
        const id = Number(row?.id);
        if (!Number.isFinite(id)) continue;
        const uniq = [...new Set((Array.isArray(row?.[key]) ? row[key] : []).map(v => String(v).trim()).filter(Boolean))];
        for (const label of uniq) {
          if (!m.has(label)) m.set(label, []);
          m.get(label).push(id);
        }
      }
      for (const [k, arr] of m) m.set(k, arr.sort((a, b) => a - b));
      return m;
    }

    function buildStats(mapping, key) {
      const stats = new Map();
      for (const row of (mapping || [])) {
        const id = Number(row?.id);
        if (!Number.isFinite(id)) continue;
        const uniq = [...new Set((Array.isArray(row?.[key]) ? row[key] : []).map(v => String(v).trim()).filter(Boolean))];
        for (const label of uniq) {
          if (!stats.has(label)) stats.set(label, { total: 0, done: 0 });
          const s = stats.get(label);
          s.total += 1;
          if (completedSet.has(id)) s.done += 1;
        }
      }
      return stats;
    }

    function statsToRows(stats) {
      return Array.from(stats.entries()).map(([label, v]) => ({
        label, done: v.done, total: v.total,
        pct: v.total > 0 ? v.done / v.total : 0
      }));
    }

    function miniBarColor(pct01) {
      const p = Math.round((Number(pct01) || 0) * 100);
      if (p < 25) return "#A13A3A";
      if (p < 40) return "#C26B1A";
      if (p < 60) return "#D6A11C";
      if (p < 80) return "#7FBF2A";
      return "#2FAE66";
    }

    function renderMiniCards(targetEl, rows) {
      if (!targetEl) return;
      targetEl.innerHTML = rows.map(r => {
        const pct = Math.round(r.pct * 100);
        return `
          <div class="sca-mini-card">
            <div class="sca-mini-title" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</div>
            <div class="sca-mini-meta"><strong>${r.done}</strong> / <strong>${r.total}</strong> cases</div>
            <div class="sca-mini-progress">
              <div class="sca-mini-bar">
                <span style="width:${pct}%;background:${miniBarColor(r.pct)};"></span>
              </div>
              <div class="sca-mini-pct"><span>${pct}%</span><span>${r.done}/${r.total}</span></div>
            </div>
          </div>`;
      }).join("");
    }

    function renderStrongAndWeak(rows) {
      if (strongTitle) strongTitle.textContent = "Most practised";
      if (weakTitle)   weakTitle.textContent   = "What to focus on";
      renderMiniCards(strongGrid, [...rows].sort((a, b) => (b.pct - a.pct) || (b.done - a.done)).slice(0, 3));
      renderMiniCards(weakGrid,   [...rows].sort((a, b) => (a.pct - b.pct) || (a.done - b.done)).slice(0, 3));
    }

    function closeAll() {
      openLabel = null;
      barsEl.querySelectorAll(".sca-expand").forEach(exp => {
        exp.classList.remove("is-open");
        exp.style.maxHeight = "0px";
      });
      barsEl.querySelectorAll(".sca-bar").forEach(b => b.setAttribute("aria-expanded", "false"));
    }

    function buildCaseTableHtml(ids, mappingIndex) {
      const head = `
        <div class="sca-case-head">
          <div></div><div>Case</div><div style="text-align:right;">Status</div>
        </div>`;
      if (!ids.length) return head + `
        <div class="sca-case-row">
          <div class="sca-case-tick is-todo">•</div>
          <div style="font-weight:800;color:#6c7485;">No cases found.</div>
          <div class="sca-case-status is-todo">—</div>
        </div>`;
      return head + ids.map(id => {
        const done  = completedSet.has(id);
        const label = getCaseName(id, mappingIndex) || `Case ${id}`;
        return `
          <div class="sca-case-row">
            <div class="sca-case-tick ${done ? "is-done" : "is-todo"}">${done ? "✓" : "•"}</div>
            <a class="sca-case-link" href="/casev2?case=${id}" title="${escapeHtml(label)}">
              ${escapeHtml(label)} <span style="opacity:.65;">(${id})</span>
            </a>
            <div class="sca-case-status ${done ? "is-done" : "is-todo"}">
              ${done ? "Completed" : "Not completed"}
            </div>
          </div>`;
      }).join("");
    }

    function openLabelPanel(label, mappingIndex) {
      closeAll();
      openLabel = label;
      const exp = barsEl.querySelector(`.sca-expand[data-label="${CSS.escape(label)}"]`);
      const bar = barsEl.querySelector(`.sca-bar[data-label="${CSS.escape(label)}"]`);
      if (!exp) return;
      if (bar) bar.setAttribute("aria-expanded", "true");
      if (!exp.dataset.built) {
        const table = exp.querySelector(".sca-case-table");
        if (table) table.innerHTML = buildCaseTableHtml(labelToIds.get(label) || [], mappingIndex);
        exp.dataset.built = "1";
      }
      exp.classList.add("is-open");
      exp.style.maxHeight = exp.scrollHeight + "px";
    }

    function renderBars(rows, mappingIndex) {
      if (!rows?.length) {
        barsEl.innerHTML = `<div style="padding:10px 0;color:#6c7485;font-weight:800;">No breakdown data found.</div>`;
        return;
      }
      const sorted = [...rows].sort((a, b) => (b.pct - a.pct) || (b.done - a.done));
      barsEl.innerHTML = sorted.map(r => {
        const pct  = Math.round(r.pct * 100);
        const fill = `${pct}%`;
        return `
          <div class="sca-bar-row">
            <div class="sca-bar" role="button" tabindex="0" aria-expanded="false"
                 data-label="${escapeHtml(r.label)}">
              <div class="sca-bar-fill" style="width:${fill}"></div>
              <div class="sca-bar-label dark">
                <span class="sca-bar-name" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</span>
              </div>
              <div class="sca-bar-label-mask" style="width:${fill}">
                <div class="sca-bar-label light">
                  <span class="sca-bar-name" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</span>
                </div>
              </div>
              <div class="sca-bar-count">${r.done}/${r.total}</div>
            </div>
            <div class="sca-bar-pct">${pct}%</div>
            <div class="sca-expand" data-label="${escapeHtml(r.label)}">
              <div class="sca-expand-inner"><div class="sca-case-table"></div></div>
            </div>
          </div>`;
      }).join("");

      barsEl.querySelectorAll(".sca-bar").forEach(bar => {
        const label = bar.getAttribute("data-label");
        function toggle() {
          if (openLabel === label) { closeAll(); return; }
          openLabelPanel(label, mappingIndex);
        }
        bar.addEventListener("click", toggle);
        bar.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
        });
      });
      closeAll();
    }

    function setMode(newMode, mapping, mappingIndex) {
      mode = newMode;
      const isTopics = mode === "topic";
      if (btnTopics) btnTopics.classList.toggle("is-active", isTopics);
      if (btnGroups) btnGroups.classList.toggle("is-active", !isTopics);
      labelToIds = buildLabelToIds(mapping, isTopics ? "topics" : "groups");
      const rows = isTopics ? topicRows : groupRows;
      renderStrongAndWeak(rows);
      renderBars(rows, mappingIndex);
      closeAll();
    }

    function buildAndRender(mapping, mappingIndex) {
      topicRows = statsToRows(buildStats(mapping, "topics"));
      groupRows = statsToRows(buildStats(mapping, "groups"));
      window.__sca_cache = { mapping, mappingIndex };
      setMode(topicRows.length ? "topic" : "group", mapping, mappingIndex);
    }

    if (btnTopics) btnTopics.addEventListener("click", () => {
      if (window.__sca_cache) setMode("topic", window.__sca_cache.mapping, window.__sca_cache.mappingIndex);
    });
    if (btnGroups) btnGroups.addEventListener("click", () => {
      if (window.__sca_cache) setMode("group", window.__sca_cache.mapping, window.__sca_cache.mappingIndex);
    });

    // Boot — mirrors the welcome script pattern:
    // Step 1: read completed IDs from localStorage — instant, no network
    // Step 2: wait for Airtable case map (public, no auth) → render immediately with cached IDs
    // Step 3: fetch live progress in background (token first, progressReady only if needed)
    //         → re-render only if data actually changed
    (async () => {
      // Step 1: grab cached IDs immediately — same as welcome name reads sca_member_identity
      const cachedIds = readProgressCache();
      if (cachedIds) {
        completedSet = new Set(cachedIds);
      }

      // Show spinner only if case map hasn't resolved yet
      if (!Array.isArray(window.SCA_CASE_MAP)) {
        barsEl.innerHTML = `<div style="padding:10px 0;color:#6c7485;font-weight:800;">Loading…</div>`;
      }

      // Step 2: wait for public Airtable case map — no auth needed
      const ok = await waitFor(() => Array.isArray(window.SCA_CASE_MAP), 20000);
      if (!ok) {
        barsEl.innerHTML = `<div style="padding:10px 0;color:#6c7485;font-weight:800;">Cases not available.</div>`;
        return;
      }

      const mapping      = window.SCA_CASE_MAP || [];
      const mappingIndex = new Map();
      for (const row of mapping) {
        const id = Number(row?.id);
        if (Number.isFinite(id)) mappingIndex.set(id, row);
      }

      // Render now with cached IDs — page looks complete before any auth
      buildAndRender(mapping, mappingIndex);

      // Step 3: live progress silently in background
      // getProgress() uses cached token first — only hits SCAProgress if token is gone
      (async () => {
        try {
          const progress = await getProgress();
          const liveIds  = Array.isArray(progress?.completed)
            ? progress.completed.map(Number)
            : null;

          if (!liveIds) {
            // No live data — if we had no cache either, nudge user to log in
            if (!cachedIds) showLoginNotice();
            return;
          }

          // Re-render only if live data differs from what we already showed
          const changed = liveIds.length !== completedSet.size ||
            liveIds.some(id => !completedSet.has(id));

          if (changed) {
            completedSet = new Set(liveIds);
            buildAndRender(mapping, mappingIndex);
          }

          writeProgressCache(liveIds);
        } catch (e) {
          console.warn("[SCA] Breakdown live refresh failed:", e);
        }
      })();
    })();
  }


  /* ============================================================
     9. EXAM DATE HERO  (#scaHeroExamCard)
     Cache first → proxy with token → progressReady fallback.
  ============================================================ */
  function initExamDateHero() {
    if (window.__scaHeroExamInit) return;
    window.__scaHeroExamInit = true;

    const dateText  = document.getElementById("scaHeroExamDateText");
    const changeBtn = document.getElementById("scaHeroExamChangeBtn");
    const editor    = document.getElementById("scaHeroExamEditor");
    const inputEl   = document.getElementById("scaHeroExamInput");
    const saveBtn   = document.getElementById("scaHeroExamSaveBtn");
    const msgEl     = document.getElementById("scaHeroExamMsg");
    const countdown = document.getElementById("scaHeroExamCountdown");
    const weeksEl   = document.getElementById("scaHeroExamWeeks");
    const daysEl    = document.getElementById("scaHeroExamDays");
    const disWrap   = document.getElementById("scaHeroExamDisclaimer");
    const disOk     = document.getElementById("scaHeroExamDisclaimerOk");
    const disCancel = document.getElementById("scaHeroExamDisclaimerCancel");
    const loginNotice = document.getElementById("scaInlineLoginNotice");
    const loginLink   = document.getElementById("scaInlineLoginLink");

    if (!dateText || !changeBtn || !editor || !inputEl || !saveBtn || !msgEl || !countdown || !weeksEl || !daysEl) return;

    function hideLoginNotice() { if (loginNotice) loginNotice.hidden = true; }

    // Wire "log in again" link → Squarespace account overlay
    if (loginLink) {
      const activate = e => {
        if (e.type !== "click" && e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault?.();
        const selectors = [
          "a.user-accounts-text-link",
          "a.user-accounts-link",
          "a[href='#'][class*='user-accounts']"
        ];
        let clicked = false;
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); clicked = true; break; }
        }
        if (!clicked) {
          const fallback = [...document.querySelectorAll("header a,header button,nav a,nav button")]
            .find(el => ["account","log in","login","sign in"]
              .includes((el.textContent || "").trim().toLowerCase()));
          if (fallback) fallback.click();
          else alert("Please use the Account / Log in button in the site header.");
        }
      };
      loginLink.addEventListener("click", activate);
      loginLink.addEventListener("keydown", activate);
    }

    function formatPretty(ymd) {
      const [y, m, d] = String(ymd).split("-").map(Number);
      return new Date(y, (m||1)-1, d||1).toLocaleDateString(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      });
    }

    function calcWeeksDays(ymd) {
      const [y, m, d] = String(ymd).split("-").map(Number);
      const exam  = new Date(y, (m||1)-1, d||1);
      const today = new Date(); today.setHours(0,0,0,0);
      const diff  = Math.max(0, Math.ceil((exam - today) / 86400000));
      return { weeks: Math.floor(diff / 7), days: diff % 7 };
    }

    function hideAllPanels() {
      editor.hidden = true;
      if (disWrap) disWrap.hidden = true;
    }

    function showEditor(msg) {
      if (disWrap) disWrap.hidden = true;
      editor.hidden    = false;
      countdown.hidden = true;
      changeBtn.hidden = true;
      msgEl.textContent = msg == null ? "" : String(msg);
    }

    function showDisclaimer() {
      msgEl.textContent = "";
      editor.hidden = true;
      if (disWrap) disWrap.hidden = false;
      changeBtn.hidden = true;
    }

    function restoreMain() {
      if (disWrap) disWrap.hidden = true;
      editor.hidden    = true;
      changeBtn.hidden = false;
    }

    function showCountdown(examDateStr) {
      hideAllPanels();
      countdown.hidden      = false;
      changeBtn.hidden      = false;
      changeBtn.textContent = "Change exam date";
      dateText.textContent  = formatPretty(examDateStr);
      const { weeks, days } = calcWeeksDays(examDateStr);
      weeksEl.textContent   = String(weeks);
      daysEl.textContent    = String(days);
      hideLoginNotice();
    }

    function showNoDate() {
      hideAllPanels();
      countdown.hidden      = true;
      changeBtn.hidden      = false;
      changeBtn.textContent = "Set exam date";
      dateText.textContent  = "No exam date set";
      msgEl.textContent     = "";
      hideLoginNotice();
    }

    // Exam date cache
    const EXAM_KEY     = "sca_exam_date_v1";
    const EXAM_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

    function readExamCache() {
      try {
        const obj = JSON.parse(localStorage.getItem(EXAM_KEY) || "null");
        if (!obj?.ts || Date.now() - Number(obj.ts) > EXAM_MAX_AGE) return null;
        return obj.examDate || null;
      } catch { return null; }
    }

    function writeExamCache(examDate) {
      try {
        if (!examDate) { localStorage.removeItem(EXAM_KEY); return; }
        localStorage.setItem(EXAM_KEY, JSON.stringify({ examDate: String(examDate), ts: Date.now() }));
      } catch {}
    }

    async function fetchExamDate() {
      const token = readToken();
      const r = await fetch(`${PROXY_BASE}/api/exam-date-get`, {
        method: "POST", credentials: "include",
        headers: authHeaders(token)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || "exam-date-get failed");
      return data.examDate || null;
    }

    async function saveExamDate(val) {
      const token = readToken();
      const r = await fetch(`${PROXY_BASE}/api/exam-date-set`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ examDate: val })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || "exam-date-set failed");
      return true;
    }

    // Step 1: render from cache instantly
    const cachedExam = readExamCache();
    if (cachedExam) {
      showCountdown(cachedExam);
    } else {
      dateText.textContent = "Loading…";
      countdown.hidden     = true;
      editor.hidden        = true;
      if (disWrap) disWrap.hidden = true;
      changeBtn.hidden     = true;
    }

    // Button wiring
    changeBtn.addEventListener("click", () => showDisclaimer());
    if (disOk)     disOk.addEventListener("click",    () => showEditor(""));
    if (disCancel) disCancel.addEventListener("click", () => restoreMain());

    saveBtn.addEventListener("click", async () => {
      const val = (inputEl.value || "").trim();
      if (!val) { msgEl.textContent = "Please select a date."; return; }
      msgEl.textContent = "Saving…";
      try {
        // Ensure valid token before writing — re-auth only if necessary
        if (!readToken()) await window.SCA.progressReady;
        if (!readToken()) {
          msgEl.textContent = "Please log in again to save your exam date.";
          showLoginNotice();
          return;
        }
        await saveExamDate(val);
        writeExamCache(val);
        msgEl.textContent = "";
        showCountdown(val);
      } catch {
        msgEl.textContent = "Could not save. Please try again.";
      }
    });

    // Step 2: live refresh — token first, progressReady only if token is missing
    (async () => {
      try {
        if (!readToken()) await window.SCA.progressReady;
        if (!readToken()) {
          if (!cachedExam) { showLoginNotice(); dateText.textContent = "Please log in"; }
          return;
        }
        const live = await fetchExamDate();
        if (live) { showCountdown(live); writeExamCache(live); }
        else      { writeExamCache(null); showNoDate(); }
      } catch {
        if (!cachedExam) {
          dateText.textContent = "Unable to load exam date";
          showEditor("Please refresh or log in again.");
        }
        showLoginNotice();
      }
    })();
  }


  /* ============================================================
     BOOT
  ============================================================ */
  loadCaseMap(); // public fetch — starts immediately, no auth

  onReady(() => {
    initWelcomeName();
    initCaseCompletionCard();
    initProgressBreakdown();
    initExamDateHero();
  });

})();
