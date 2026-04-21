/* =========================================================================
   Portal.js · wiring script (v4)
   ========================================================================= */
(function () {
  'use strict';

  // Case totals are computed dynamically from Airtable (cases-list-data):
  //   - SCA total = records with "Link" present
  //   - AI total  = records with "AI Link" present
  // These start as conservative fallbacks; live values replace them on load.
  let totalSCACases = 353;
  let totalAICases  = 40;
  const TOTAL_CASES_FOR_RANDOM = 361; // max possible Case ID for the random-case URL
  const CASE_IMAGE_BASE = "https://iix7q95khocr9u36.public.blob.vercel-storage.com/CaseImages";


  const PROXY_BASE        = "https://scarevision-users-proxy.vercel.app";
  const EXAM_CACHE_KEY    = "sca_exam_date_v1";
  const RECENT_CACHE_KEY  = "sca_cc_recent_v1";
  const TOTALS_CACHE_KEY  = "sca_cc_totals_v1";
  const RECENT_CACHE_MAX_AGE = 60 * 60 * 1000;
  const TOTALS_CACHE_MAX_AGE = 6 * 60 * 60 * 1000; // 6h

  function waitFor(pred, maxMs = 8000, intervalMs = 60) {
    return new Promise(resolve => {
      if (pred()) return resolve(true);
      const start = Date.now();
      const t = setInterval(() => {
        if (pred()) { clearInterval(t); resolve(true); return; }
        if (Date.now() - start > maxMs) { clearInterval(t); resolve(false); }
      }, intervalMs);
    });
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, ch =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch])
    );
  }

  // ----- Dateline -----
  (function () {
    const now = new Date();
    const hour = now.getHours();
    const part = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
    const day = now.toLocaleDateString(undefined, { day: "numeric", month: "long" });
    const el = document.getElementById("ccDateline");
    if (el) el.textContent = `${weekday} ${day} · ${part}`;
  })();

  // ----- Greeting name + avatar -----
  function renderGreetingName(identity) {
    const nameEl = document.getElementById("ccGreetName");
    const avatar = document.getElementById("ccAvatar");
    const first = (identity?.firstName || "").trim();
    if (first) {
      nameEl.textContent = `, ${first}`;
      if (avatar) avatar.textContent = first.charAt(0).toUpperCase();
    } else {
      nameEl.textContent = "";
      if (avatar) avatar.textContent = "—";
    }
  }
  (function initGreeting() {
    let tries = 0;
    (function tryCached() {
      const id = window.SCAAuth?.readIdentity?.();
      if (id) { renderGreetingName(id); return; }
      if (++tries < 20) setTimeout(tryCached, 50);
    })();
    waitFor(() => !!window.SCAAuth, 6000).then(ok => {
      if (ok) window.SCAAuth.getIdentity().then(renderGreetingName).catch(() => {});
    });
  })();

  // ----- Progress -----
  function readCachedProgress() {
    try {
      const raw = JSON.parse(localStorage.getItem("sca_progress_v1") || "null");
      if (!raw) return null;
      return {
        completed:      Array.isArray(raw.completed)      ? raw.completed.map(Number).filter(Number.isFinite) : [],
        flagged:        Array.isArray(raw.flagged)        ? raw.flagged.map(Number).filter(Number.isFinite)   : [],
        completedDates: raw.completedDates && typeof raw.completedDates === "object" ? raw.completedDates : {},
      };
    } catch { return null; }
  }
  async function fetchProgress() {
    if (!window.SCAProgress?.getProgress) return null;
    try { return await window.SCAProgress.getProgress(); }
    catch { return null; }
  }

  function renderCasesDone(completed) {
    const n = Math.max(0, Math.min(totalSCACases, (completed || []).length));
    const pct = totalSCACases ? n / totalSCACases : 0;
    const pctInt = Math.round(pct * 100);
    const text = document.getElementById("ccDoneText");
    const pctEl = document.getElementById("ccDonePct");
    const ring = document.getElementById("ccRing");
    if (text) text.textContent = `${n}/${totalSCACases}`;
    if (pctEl) pctEl.textContent = `${pctInt}%`;
    if (ring) ring.setAttribute("stroke-dasharray", `${pct * 97} 100`);
  }

  function computeStreak(completedDates) {
    if (!completedDates) return 0;
    const daysWithActivity = new Set();
    Object.values(completedDates).forEach(v => {
      if (!v) return;
      const d = new Date(v);
      if (isNaN(d)) return;
      daysWithActivity.add(d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate());
    });
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0,0,0,0);
    let checkedToday = false;
    while (true) {
      const key = cursor.getFullYear() + "-" + (cursor.getMonth()+1) + "-" + cursor.getDate();
      if (daysWithActivity.has(key)) streak++;
      else if (checkedToday) break;
      checkedToday = true;
      cursor.setDate(cursor.getDate() - 1);
      if (streak > 400) break;
    }
    return streak;
  }

  function renderStreak(streakDays) {
    const el = document.getElementById("ccStreak");
    if (el) el.textContent = String(streakDays);
  }

  (function initProgress() {
    const cached = readCachedProgress();
    if (cached) {
      renderCasesDone(cached.completed);
      renderStreak(computeStreak(cached.completedDates));
    }
    waitFor(() => !!window.SCAProgress?.getProgress, 6000).then(async ok => {
      if (!ok) return;
      const live = await fetchProgress();
      if (!live) return;
      renderCasesDone(live.completed || []);
      renderStreak(computeStreak(live.completedDates));
      updateGreetingSub();
    });
  })();

  function updateGreetingSub() {
    const el = document.getElementById("ccGreetSub");
    if (!el) return;
    const prog = readCachedProgress();
    const streak = prog ? computeStreak(prog.completedDates) : 0;
    const done = prog ? (prog.completed || []).length : 0;
    if (streak >= 3) el.innerHTML = `You're on a <b>${streak}-day streak</b>. Don't break it today.`;
    else if (done === 0) el.textContent = "Let's open this week with a case.";
    else el.textContent = "Pick up where you left off.";
  }
  setTimeout(updateGreetingSub, 400);

  // ----- Today's pick -----
  function pickRandomCaseId() { return Math.floor(Math.random() * TOTAL_CASES_FOR_RANDOM) + 1; }

  function renderTodaysPick(id) {
    const startLink = document.getElementById("ccPickStartLink");
    const startBtn  = document.getElementById("ccPickStartBtn");
    const title = document.getElementById("ccPickTitle");
    const blurb = document.getElementById("ccPickBlurb");
    const thumbLabel = document.getElementById("ccPickThumbLabel");
    const meta = document.getElementById("ccPickMeta");

    const href = `/casev2?case=${id}&examcase`;
    if (startLink) {
      startLink.href = href;
      startLink.setAttribute("data-seed", String(id % 5));
    }
    if (startBtn) startBtn.href = href;
    if (thumbLabel) thumbLabel.textContent = `Case #${id}`;
     
  // Show case image if available; gradient shows through on 404
  const pickImg = document.getElementById("ccPickImg");
  if (pickImg) {
    pickImg.style.display = "";
    pickImg.src = `${CASE_IMAGE_BASE}/Case-${id}.webp`;
  }
     
    const mapRow = Array.isArray(window.SCA_CASE_MAP)
      ? window.SCA_CASE_MAP.find(r => Number(r.id) === Number(id))
      : null;

    if (mapRow) {
      title.textContent = mapRow.name;
      const topic = (mapRow.topics || [])[0];
      const group = (mapRow.groups || [])[0];
      blurb.textContent = topic
        ? `A random case from the ${topic} topic — good for keeping yourself sharp.`
        : `A random case from across the full collection — good for keeping yourself sharp.`;
      meta.innerHTML = [
        `<span class="cc-tag"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg> Random case</span>`,
        topic ? `<span class="cc-tag cc-tag-ghost">${escapeHtml(topic)}</span>` : "",
        group ? `<span class="cc-tag cc-tag-ghost">${escapeHtml(group)}</span>` : "",
      ].filter(Boolean).join("");
    } else {
      title.textContent = "A random case from the collection";
    }
  }

  let currentPickId = pickRandomCaseId();
  renderTodaysPick(currentPickId);
  waitFor(() => Array.isArray(window.SCA_CASE_MAP) && window.SCA_CASE_MAP.length, 10000).then(ok => {
    if (ok) renderTodaysPick(currentPickId);
  });
  document.getElementById("ccPickAnother")?.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    currentPickId = pickRandomCaseId();
    renderTodaysPick(currentPickId);
  });

  // ----- Start Here tabs -----
const START_MODES = {
solo: {
  sub: "Read, watch, or consult with an AI patient.",
  render: () => `
    <a href="https://www.scarevision.ai/members-portal" class="cc-start-ai-hero">
      <span class="cc-start-tile-ic"><i class="fa-sharp fa-light fa-brain-circuit"></i></span>
      <span class="cc-start-hero-body">
        <span class="cc-start-hero-t">Practise with an AI patient <span class="cc-start-hero-pill">Credits</span></span>
        <span class="cc-start-hero-s">A simulated consultation that responds to your questions.</span>
      </span>
      <i class="fa-sharp fa-light fa-arrow-right cc-start-hero-arrow"></i>
    </a>
    <a href="/case-selection" class="cc-start-tile">
      <span class="cc-start-tile-ic"><i class="fa-sharp fa-light fa-book-open-reader"></i></span>
      <span class="cc-start-tile-body">
        <span class="cc-start-tile-t">Read a case</span>
        <span class="cc-start-tile-s">Work through on your own.</span>
      </span>
      <span class="cc-start-tile-arrow"><i class="fa-sharp fa-light fa-arrow-right"></i></span>
    </a>
    <a href="/scavideos" class="cc-start-tile">
      <span class="cc-start-tile-ic"><i class="fa-sharp fa-light fa-circle-play"></i></span>
      <span class="cc-start-tile-body">
        <span class="cc-start-tile-t">Watch a consultation</span>
        <span class="cc-start-tile-s">Example videos with commentary.</span>
      </span>
      <span class="cc-start-tile-arrow"><i class="fa-sharp fa-light fa-arrow-right"></i></span>
    </a>
  `,
},
pair: {
  sub: "One's the doctor, one's the patient. Mark it together after.",
  render: () => `
    <a href="/case-selection" class="cc-start-combo">
      <div class="cc-start-combo-head">
        <span class="cc-start-combo-ic"><i class="fa-sharp fa-light fa-user-doctor"></i></span>
        <div class="cc-start-combo-body">
          <div class="cc-start-combo-t">Run a case together</div>
          <div class="cc-start-combo-s">Share the case to your partner's device, then swap roles.</div>
        </div>
      </div>
      <div class="cc-start-combo-split">
        <div class="cc-start-combo-opt is-ai is-recommended">
          <span class="cc-start-combo-opt-ic"><i class="fa-sharp fa-light fa-wand-magic-sparkles"></i></span>
          <span class="cc-start-combo-opt-text"><b>Let AI mark it</b><span class="cc-start-combo-pill">Recommended</span></span>
        </div>
        <div class="cc-start-combo-opt">
          <span class="cc-start-combo-opt-ic"><i class="fa-sharp fa-light fa-clipboard-check"></i></span>
          <span class="cc-start-combo-opt-text"><b>Mark yourselves</b></span>
        </div>
      </div>
    </a>
  `,
},
group: {
  sub: "Run a case, one person watches and marks. Rotate between rounds.",
  render: () => `
    <a href="/case-selection" class="cc-start-combo">
      <div class="cc-start-combo-head">
        <span class="cc-start-combo-ic"><i class="fa-sharp fa-light fa-users"></i></span>
        <div class="cc-start-combo-body">
          <div class="cc-start-combo-t">Run cases as a group</div>
          <div class="cc-start-combo-s">Share the case to each person's device. Rotate doctor/patient/observer.</div>
        </div>
      </div>
      <div class="cc-start-combo-split">
        <div class="cc-start-combo-opt is-recommended">
          <span class="cc-start-combo-opt-ic"><i class="fa-sharp fa-light fa-clipboard-check"></i></span>
          <span class="cc-start-combo-opt-text"><b>Someone marks it</b><span class="cc-start-combo-pill">Recommended</span></span>
        </div>
        <div class="cc-start-combo-opt is-ai">
          <span class="cc-start-combo-opt-ic"><i class="fa-sharp fa-light fa-wand-magic-sparkles"></i></span>
          <span class="cc-start-combo-opt-text"><b>Or let AI mark</b></span>
        </div>
      </div>
    </a>
  `,
},
};
function renderStartMode(mode) {
  const m = START_MODES[mode] || START_MODES.solo;
  document.getElementById("ccStartSub").textContent = m.sub;
  const container = document.getElementById("ccStartActions");
  container.className = "cc-start-actions" + (mode === "solo" ? " cc-start-solo" : "");
  container.innerHTML = m.render();
}
  document.getElementById("ccStartTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    document.querySelectorAll("#ccStartTabs .cc-start-tab").forEach(b => {
      b.classList.toggle("on", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    renderStartMode(btn.dataset.mode);
  });
  renderStartMode("solo");

  // ----- Totals + recently added rail (single Airtable fetch) -----

  function readTotalsCache() {
    try {
      const obj = JSON.parse(localStorage.getItem(TOTALS_CACHE_KEY) || "null");
      if (!obj?.ts || Date.now() - Number(obj.ts) > TOTALS_CACHE_MAX_AGE) return null;
      if (!Number.isFinite(obj.sca) || !Number.isFinite(obj.ai)) return null;
      return { sca: obj.sca, ai: obj.ai };
    } catch { return null; }
  }
  function writeTotalsCache(sca, ai) {
    try {
      localStorage.setItem(TOTALS_CACHE_KEY, JSON.stringify({ sca, ai, ts: Date.now() }));
    } catch {}
  }

  function applyTotals(sca, ai) {
    if (Number.isFinite(sca) && sca > 0) totalSCACases = sca;
    if (Number.isFinite(ai)  && ai  > 0) totalAICases  = ai;
    // Re-render anything that depends on these
    const prog = readCachedProgress();
    renderCasesDone(prog ? prog.completed : []);
    const aiCountEl = document.getElementById("ccAICasesCount");
    if (aiCountEl) aiCountEl.textContent = String(totalAICases);
  }

  // Instant paint from cache
  (function initTotalsCache() {
    const cached = readTotalsCache();
    if (cached) applyTotals(cached.sca, cached.ai);
    else {
      // Show fallback for AI count pill
      const aiCountEl = document.getElementById("ccAICasesCount");
      if (aiCountEl) aiCountEl.textContent = String(totalAICases);
    }
  })();

  function pickRecentThumb(idx) { return idx % 5; }
  function renderRail(items) {
    const rail = document.getElementById("ccRail");
    if (!rail) return;
    if (!items || !items.length) {
      rail.innerHTML = `<div style="padding:14px;color:var(--cc-muted);font-size:13px;">No recently added cases yet.</div>`;
      return;
    }
rail.innerHTML = items.map((it, i) => `
  <a class="cc-rail-card" href="/casev2?case=${it.id}">
    <div class="cc-rail-thumb" data-i="${pickRecentThumb(i)}">
      <img class="cc-rail-img"
           src="${CASE_IMAGE_BASE}/Case-${it.id}.webp"
           alt=""
           width="400" height="400"
           loading="lazy" decoding="async"
           onerror="this.style.display='none'">
      <span class="cc-rail-thumb-num">#${it.id}</span>
    </div>
    <div class="cc-rail-meta">
      <span class="cc-rail-tag">${escapeHtml(it.tag || "New")}</span>
      <span class="cc-rail-title">${escapeHtml(it.title || ("Case " + it.id))}</span>
    </div>
  </a>
`).join("");
  }
  function readRecentCache() {
    try {
      const obj = JSON.parse(localStorage.getItem(RECENT_CACHE_KEY) || "null");
      if (!obj?.ts || Date.now() - Number(obj.ts) > RECENT_CACHE_MAX_AGE) return null;
      return Array.isArray(obj.items) ? obj.items : null;
    } catch { return null; }
  }
  function writeRecentCache(items) {
    try { localStorage.setItem(RECENT_CACHE_KEY, JSON.stringify({ items, ts: Date.now() })); } catch {}
  }

  async function loadCasesListData() {
    // Instant paint of recent from cache
    const cachedRecent = readRecentCache();
    if (cachedRecent) renderRail(cachedRecent);

    try {
      const r = await fetch("https://scarevision-airtable-proxy.vercel.app/api/cases-list-data", { cache: "no-store" });
      const data = await r.json();
      const records = Array.isArray(data?.records) ? data.records : [];

      // --- Totals ---
      // SCA total = records that actually have a "Link" set
      // AI total  = records that actually have an "AI Link" set
      let scaCount = 0, aiCount = 0;
      for (const rec of records) {
        const f = rec.fields || {};
        const link = f["Link"];
        const aiLink = f["AI Link"];
        if (typeof link === "string" && link.trim()) scaCount++;
        if (typeof aiLink === "string" && aiLink.trim()) aiCount++;
      }
      if (scaCount > 0 || aiCount > 0) {
        applyTotals(scaCount, aiCount);
        writeTotalsCache(scaCount, aiCount);
      }

      // --- Recently added ---
      const withDates = records.map(rec => {
        const f = rec.fields || {};
        return {
          id: Number(f["Case ID"]),
          title: f["Name"] || "",
          tag: (Array.isArray(f["Clinical Topics"]) ? f["Clinical Topics"][0] : f["Clinical Topics"]) || "New",
          created: f["Created"] ? new Date(f["Created"]).getTime() : null,
          hasLink: typeof f["Link"] === "string" && !!f["Link"].trim(),
        };
      }).filter(x => Number.isFinite(x.id) && x.hasLink);

      let items;
      if (withDates.some(x => x.created)) {
        items = withDates.filter(x => x.created).sort((a, b) => b.created - a.created).slice(0, 8);
      } else {
        items = withDates.sort((a, b) => b.id - a.id).slice(0, 8);
      }
      writeRecentCache(items);
      renderRail(items);
    } catch (e) {
      if (!cachedRecent) renderRail([]);
      console.warn("[SCA CC] cases-list-data load failed:", e);
    }
  }
  loadCasesListData();

  // ----- Exam date -----
  function readExamCache() {
    try {
      const obj = JSON.parse(localStorage.getItem(EXAM_CACHE_KEY) || "null");
      return obj?.examDate ? String(obj.examDate) : null;
    } catch { return null; }
  }
  function writeExamCache(val) {
    try {
      if (!val) localStorage.removeItem(EXAM_CACHE_KEY);
      else localStorage.setItem(EXAM_CACHE_KEY, JSON.stringify({ examDate: val, ts: Date.now() }));
    } catch {}
  }
  function renderExam(examDate) {
    const daysEl = document.getElementById("ccExamDays");
    const unitEl = document.getElementById("ccExamUnit");
    const pillLabel = document.getElementById("ccExamLabel");
    if (!examDate) {
      if (daysEl) daysEl.textContent = "—";
      if (unitEl) unitEl.textContent = "not set";
      if (pillLabel) pillLabel.textContent = "Set your exam date ↘";
      return;
    }
    const [y, m, d] = examDate.split("-").map(Number);
    const exam = new Date(y, (m||1)-1, d||1);
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.max(0, Math.ceil((exam - today) / 86400000));
    if (daysEl) daysEl.textContent = String(diff);
    if (unitEl) unitEl.textContent = diff === 1 ? "day" : "days";
    if (pillLabel) {
      const pretty = exam.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      pillLabel.textContent = `Exam · ${pretty}`;
    }
  }
  renderExam(readExamCache());
  (async function liveExam() {
    const ok = await waitFor(() => !!window.SCAAuth?.getToken, 6000);
    if (!ok) return;
    try {
      const token = await window.SCAAuth.getToken();
      if (!token) return;
      const r = await fetch(`${PROXY_BASE}/api/exam-date-get`, {
        method: "POST",
        credentials: "include",
        headers: window.SCAAuth.authHeaders(token),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        const v = data.examDate || null;
        writeExamCache(v);
        renderExam(v);
      }
    } catch {}
  })();

  const modal = document.getElementById("ccExamModal");
  const modalInput = document.getElementById("ccExamInput");
  const modalMsg = document.getElementById("ccExamMsg");
  function openExamModal() {
    modalMsg.textContent = "";
    const current = readExamCache();
    if (current) modalInput.value = current;
    else {
      const d = new Date(); d.setMonth(d.getMonth() + 3);
      modalInput.value = d.toISOString().slice(0, 10);
    }
    modal.hidden = false;
  }
  function closeExamModal() { modal.hidden = true; }
  document.getElementById("ccExamBtn")?.addEventListener("click", openExamModal);
  document.getElementById("ccExamCancel")?.addEventListener("click", closeExamModal);
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeExamModal(); });
  document.getElementById("ccExamSave")?.addEventListener("click", async () => {
    const val = (modalInput.value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) { modalMsg.textContent = "Please select a valid date."; return; }
    modalMsg.textContent = "Saving…";
    try {
      const token = await window.SCAAuth?.getToken();
      if (!token) { modalMsg.textContent = "Please log in again to save."; return; }
      const r = await fetch(`${PROXY_BASE}/api/exam-date-set`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...window.SCAAuth.authHeaders(token) },
        body: JSON.stringify({ examDate: val }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) { modalMsg.textContent = data?.error || "Could not save — try again."; return; }
      writeExamCache(val);
      renderExam(val);
      closeExamModal();
    } catch { modalMsg.textContent = "Network error — try again."; }
  });

  // ----- Random-case redirect (preserved) -----
  const RANDOM_CASE_BASE = "/casev2?case=";
  function goRandomCase(e) {
    if (e) e.preventDefault();
    const n = Math.floor(Math.random() * TOTAL_CASES_FOR_RANDOM) + 1;
    window.location.href = `${RANDOM_CASE_BASE}${n}&examcase`;
  }
  document.addEventListener("click", function (e) {
    const el = e.target.closest('a[href="#random-case"]');
    if (!el) return;
    goRandomCase(e);
  });

  // ----- Random AI patient (preserved with excluded set) -----
  const AI_CASE_COUNT = 355;
  const AI_EXCLUDED = new Set([30, 49, 88, 91, 93, 105, 162, 287, 319]);
  function aiRandomId() {
    let id;
    do { id = Math.floor(Math.random() * AI_CASE_COUNT) + 1; } while (AI_EXCLUDED.has(id));
    return id;
  }
  document.addEventListener("click", function (e) {
    const link = e.target.closest(".js-random-case");
    if (!link) return;
    e.preventDefault();
    window.location.href = `https://www.scarevision.ai/ai-patient?case=${aiRandomId()}`;
  });

})();
