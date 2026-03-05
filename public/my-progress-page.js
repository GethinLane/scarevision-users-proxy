/**
 * SCA Dashboard — Unified Script
 * ================================
 * Single source of truth for all dashboard functionality.
 * Load once via <script src="..." defer></script> in the page header.
 *
 * Replaces ALL inline scripts for:
 *   - Shared auth (SCA.progressReady) — runs ONCE, everything else awaits it
 *   - Case map (SCA_CASE_MAP) — loaded from Airtable, no auth needed
 *   - Welcome name (#dashWelcomeName)
 *   - Case completion card (#scaCaseCompletionCard)
 *   - Progress breakdown (#scaBreakdownCard)
 *   - Exam date hero (#scaHeroExamCard)
 */

(() => {
  'use strict';

  /* ============================================================
     1. SHARED AUTH
     ONE init, ONE promise. Everything else awaits window.SCA.progressReady.
     Never call SCAProgress.init() directly anywhere else.
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
        return await window.SCAProgress.init(); // runs exactly once
      } catch {
        return null;
      }
    })();
  }


  /* ============================================================
     2. CASE MAP  (no auth needed — start immediately)
  ============================================================ */
  async function loadCaseMap() {
    try {
      const r = await fetch(
        "https://scarevision-airtable-proxy.vercel.app/api/cases-list-data",
        { cache: "no-store" }
      );
      const data = await r.json();
      const records = Array.isArray(data.records) ? data.records : [];

      const asArray = (v) => {
        if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
        if (typeof v === "string") return v.split(",").map(s => s.trim()).filter(Boolean);
        return [];
      };

      window.SCA_CASE_MAP = records
        .map(rec => {
          const f = rec.fields || {};
          const id = Number(f["Case ID"]);
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
     3. SHARED UTILITIES
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
    return String(s ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[ch]));
  }


  /* ============================================================
     4. WELCOME NAME  (#dashWelcomeName)
     — Shows first + last name from cache instantly, then updates live.
  ============================================================ */
  function initWelcomeName() {
    const el = document.getElementById("dashWelcomeName");
    if (!el) return;

    function formatName(identity) {
      const first = (identity?.firstName || "").trim();
      const last  = (identity?.lastName  || "").trim();
      return [first, last].filter(Boolean).join(" ");
    }

    function setName(name) {
      el.textContent = name ? `, ${name}` : "";
    }

    // Instant: read from localStorage cache
    try {
      const cached = JSON.parse(localStorage.getItem("sca_member_identity") || "null");
      const name = formatName(cached);
      if (name) setName(name);
    } catch {}

    // Live: update once auth resolves
    (async () => {
      try {
        const res = await window.SCA.progressReady;
        const name = formatName(res?.identity);
        if (name) setName(name);
      } catch {}
    })();
  }


  /* ============================================================
     5. CASE COMPLETION CARD  (#scaCaseCompletionCard)
     — Donut chart of completed / total cases.
  ============================================================ */
  function initCaseCompletionCard() {
    const countEl = document.getElementById("scaCcCompletedCount");
    if (!countEl) return; // card not present on this page

    const TOTAL       = 353;
    const CACHE_KEY   = "sca_cc_completed_ids_v1";
    const MAX_AGE_MS  = 24 * 60 * 60 * 1000;

    const toggle  = document.getElementById("scaCcTrackToggle");
    const panel   = document.getElementById("scaCcTrackPanel");
    const totalEl = document.getElementById("scaCcTotalCount");
    const pctEl   = document.getElementById("scaCcPctText");
    const ringFg  = document.getElementById("scaCcRingFg");

    // Help panel toggle
    if (toggle && panel) {
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", open ? "false" : "true");
        panel.hidden = open;
      });
    }

    if (totalEl) totalEl.textContent = String(TOTAL);

    const CIRCUMFERENCE = 2 * Math.PI * 46; // r=46

    function render(completedCount) {
      const safe  = Math.max(0, Math.min(TOTAL, Number(completedCount) || 0));
      const pct   = TOTAL > 0 ? safe / TOTAL : 0;
      countEl.textContent = String(safe);
      if (pctEl)   pctEl.textContent  = `${Math.round(pct * 100)}%`;
      if (ringFg)  ringFg.style.strokeDasharray = `${CIRCUMFERENCE * pct} ${CIRCUMFERENCE * (1 - pct)}`;
    }

    function readCache() {
      try {
        const obj = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (!obj?.ts || Date.now() - Number(obj.ts) > MAX_AGE_MS) return null;
        if (!Array.isArray(obj.completed)) return null;
        return obj;
      } catch { return null; }
    }

    function writeCache(ids) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          completed: Array.isArray(ids) ? ids : [],
          ts: Date.now()
        }));
      } catch {}
    }

    // Render from cache instantly
    const cached = readCache();
    render(cached?.completed?.length || 0);

    // Live update via shared auth
    (async () => {
      try {
        const res = await window.SCA.progressReady;
        const ids = Array.isArray(res?.progress?.completed) ? res.progress.completed : [];
        render(ids.length);
        writeCache(ids);
      } catch {}
    })();
  }


  /* ============================================================
     6. PROGRESS BREAKDOWN  (#scaBreakdownCard)
     — Topic / group bars with expandable case tables.
  ============================================================ */
  function initProgressBreakdown() {
    const barsEl = document.getElementById("scaBreakdownBars");
    if (!barsEl) return; // not on this page

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

    function showLoginNotice() {
      const el = document.getElementById("scaInlineLoginNotice");
      if (el) el.hidden = false;
    }

    function getCaseName(id, mappingIndex) {
      return mappingIndex?.get(id)?.name || window.SCA_CASE_NAMES?.[id] || null;
    }

    function buildLabelToIds(mapping, key) {
      const m = new Map();
      for (const row of (mapping || [])) {
        const id = Number(row?.id);
        if (!Number.isFinite(id)) continue;
        const labels = Array.isArray(row?.[key]) ? row[key] : [];
        const uniq = [...new Set(labels.map(v => String(v).trim()).filter(Boolean))];
        for (const label of uniq) {
          if (!m.has(label)) m.set(label, []);
          m.get(label).push(id);
        }
      }
      for (const [k, arr] of m.entries()) m.set(k, arr.sort((a, b) => a - b));
      return m;
    }

    function buildStats(mapping, key) {
      const stats = new Map();
      for (const row of (mapping || [])) {
        const id = Number(row?.id);
        if (!Number.isFinite(id)) continue;
        const labels = Array.isArray(row?.[key]) ? row[key] : [];
        const uniq = [...new Set(labels.map(v => String(v).trim()).filter(Boolean))];
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
        const pct   = Math.round(r.pct * 100);
        const fill  = `${pct}%`;
        const label = r.label;
        return `
          <div class="sca-bar-row">
            <div class="sca-bar" role="button" tabindex="0" aria-expanded="false"
                 data-label="${escapeHtml(label)}">
              <div class="sca-bar-fill" style="width:${fill}"></div>
              <div class="sca-bar-label dark">
                <span class="sca-bar-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
              </div>
              <div class="sca-bar-label-mask" style="width:${fill}">
                <div class="sca-bar-label light">
                  <span class="sca-bar-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
                </div>
              </div>
              <div class="sca-bar-count">${r.done}/${r.total}</div>
            </div>
            <div class="sca-bar-pct">${pct}%</div>
            <div class="sca-expand" data-label="${escapeHtml(label)}">
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

    // Mode toggle buttons
    if (btnTopics) btnTopics.addEventListener("click", () => {
      if (window.__sca_cache) setMode("topic", window.__sca_cache.mapping, window.__sca_cache.mappingIndex);
    });
    if (btnGroups) btnGroups.addEventListener("click", () => {
      if (window.__sca_cache) setMode("group", window.__sca_cache.mapping, window.__sca_cache.mappingIndex);
    });

    // Boot
    (async () => {
      barsEl.innerHTML = `<div style="padding:10px 0;color:#6c7485;font-weight:800;">Loading…</div>`;

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

      // ✅ Single shared auth call
      try {
        const res          = await window.SCA.progressReady;
        const completedIds = Array.isArray(res?.progress?.completed) ? res.progress.completed : [];
        completedSet       = new Set(completedIds.map(Number));
        if (!res) showLoginNotice();
      } catch (e) {
        console.warn("[SCA] Breakdown: progress fetch failed:", e);
        showLoginNotice();
        completedSet = new Set();
      }

      topicRows = statsToRows(buildStats(mapping, "topics"));
      groupRows = statsToRows(buildStats(mapping, "groups"));
      window.__sca_cache = { mapping, mappingIndex };

      setMode(topicRows.length ? "topic" : "group", mapping, mappingIndex);
    })();
  }


  /* ============================================================
     7. EXAM DATE HERO  (#scaHeroExamCard)
     — Show / set / countdown to exam date.
  ============================================================ */
  function initExamDateHero() {
    if (window.__scaHeroExamInit) return;
    window.__scaHeroExamInit = true;

    const API_BASE   = "https://scarevision-users-proxy.vercel.app";
    const TOKEN_KEY  = "sca_session_token";
    let   MEM_TOKEN  = "";

    // Token helpers (still needed for API calls after auth)
    function readToken() {
      if (MEM_TOKEN) return MEM_TOKEN;
      try { const t = localStorage.getItem(TOKEN_KEY);  if (t) return (MEM_TOKEN = t); } catch {}
      try { const t = sessionStorage.getItem(TOKEN_KEY); if (t) return (MEM_TOKEN = t); } catch {}
      return "";
    }

    function authHeaders() {
      const t = readToken();
      return t ? { Authorization: `Bearer ${t}` } : {};
    }

    // DOM refs
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

    function showLoginNotice() { if (loginNotice) loginNotice.hidden = false; }
    function hideLoginNotice() { if (loginNotice) loginNotice.hidden = true;  }

    // Wire the "log in again" link to trigger the Squarespace account overlay
    if (loginLink) {
      const activate = (e) => {
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
          const fallback = [...document.querySelectorAll("header a, header button, nav a, nav button")]
            .find(el => ["account","log in","login","sign in"].includes((el.textContent || "").trim().toLowerCase()));
          if (fallback) fallback.click();
          else alert("Please use the Account / Log in button in the site header.");
        }
      };
      loginLink.addEventListener("click", activate);
      loginLink.addEventListener("keydown", activate);
    }

    // Date helpers
    function formatPretty(ymd) {
      const [y, m, d] = String(ymd).split("-").map(Number);
      return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      });
    }

    function calcWeeksDays(ymd) {
      const [y, m, d] = String(ymd).split("-").map(Number);
      const exam  = new Date(y, (m || 1) - 1, d || 1);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const diff  = Math.max(0, Math.ceil((exam - today) / 86400000));
      return { weeks: Math.floor(diff / 7), days: diff % 7 };
    }

    // UI state helpers
    function hideAllPanels() {
      editor.hidden = true;
      if (disWrap) disWrap.hidden = true;
    }

    function showEditor(withMsg) {
      if (disWrap) disWrap.hidden = true;
      editor.hidden   = false;
      countdown.hidden = true;
      changeBtn.hidden = true;
      msgEl.textContent = withMsg == null ? "" : String(withMsg);
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
      countdown.hidden  = false;
      changeBtn.hidden  = false;
      changeBtn.textContent = "Change exam date";
      dateText.textContent  = formatPretty(examDateStr);
      const { weeks, days } = calcWeeksDays(examDateStr);
      weeksEl.textContent = String(weeks);
      daysEl.textContent  = String(days);
      hideLoginNotice();
    }

    function showNoDate() {
      hideAllPanels();
      countdown.hidden  = true;
      changeBtn.hidden  = false;
      changeBtn.textContent = "Set exam date";
      dateText.textContent  = "No exam date set";
      msgEl.textContent     = "";
      hideLoginNotice();
    }

    // Cache
    const EXAM_CACHE_KEY = "sca_exam_date_v1";
    const EXAM_MAX_AGE   = 7 * 24 * 60 * 60 * 1000;

    function readExamCache() {
      try {
        const obj = JSON.parse(localStorage.getItem(EXAM_CACHE_KEY) || "null");
        if (!obj?.ts || Date.now() - Number(obj.ts) > EXAM_MAX_AGE) return null;
        if (!obj.examDate) return null;
        return obj;
      } catch { return null; }
    }

    function writeExamCache(examDate) {
      try {
        if (!examDate) { localStorage.removeItem(EXAM_CACHE_KEY); return; }
        localStorage.setItem(EXAM_CACHE_KEY, JSON.stringify({ examDate: String(examDate), ts: Date.now() }));
      } catch {}
    }

    // API calls
    async function getExamDate() {
      const r = await fetch(`${API_BASE}/api/exam-date-get`, {
        method: "POST", credentials: "include",
        headers: { ...authHeaders() }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || "exam-date-get failed");
      return data.examDate || null;
    }

    async function setExamDate(val) {
      const r = await fetch(`${API_BASE}/api/exam-date-set`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ examDate: val })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || "exam-date-set failed");
      return true;
    }

    // Render from cache immediately
    const cachedExam = readExamCache();
    if (cachedExam?.examDate) {
      showCountdown(cachedExam.examDate);
    } else {
      dateText.textContent  = "Loading…";
      countdown.hidden      = true;
      editor.hidden         = true;
      if (disWrap) disWrap.hidden = true;
      changeBtn.hidden      = true;
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
        // ✅ Shared auth first, then use resulting token for API call
        const res = await window.SCA.progressReady;
        if (!res && !readToken()) {
          msgEl.textContent = "Please log in again to confirm your account.";
          showLoginNotice();
          return;
        }
        await setExamDate(val);
        writeExamCache(val);
        msgEl.textContent = "";
        showCountdown(val);
      } catch {
        msgEl.textContent = "Could not save exam date. Please try again.";
      }
    });

    // Live refresh — ✅ shared auth only
    (async () => {
      try {
        const res = await window.SCA.progressReady;
        if (!res && !readToken()) {
          showLoginNotice();
          if (!cachedExam?.examDate) dateText.textContent = "Please log in again";
          return;
        }
        const live = await getExamDate();
        if (live) {
          showCountdown(live);
          writeExamCache(live);
        } else {
          writeExamCache(null);
          showNoDate();
        }
      } catch {
        if (!cachedExam?.examDate) {
          dateText.textContent = "Unable to load exam date";
          showEditor("Please refresh. If it keeps happening, log in again.");
        }
        showLoginNotice();
      }
    })();
  }


  /* ============================================================
     BOOT
     Load case map immediately (no auth needed).
     Init all UI modules once the DOM is ready.
  ============================================================ */
  loadCaseMap();

  onReady(() => {
    initWelcomeName();
    initCaseCompletionCard();
    initProgressBreakdown();
    initExamDateHero();
  });

})();
