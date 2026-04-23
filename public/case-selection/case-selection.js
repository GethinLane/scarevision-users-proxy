/**
 * sca-cases-list-remix.js
 * =======================
 * Replacement for sca-cases-list-for-sca-auth.js.
 *
 * Same public contract:
 *   - Depends on SCAAuth  (window.SCAAuth)
 *   - Depends on SCAProgress (window.SCAProgress)
 *   - Fetches cases from https://scarevision-airtable-proxy.vercel.app/api/cases-list-data
 *   - Writes completions via SCAProgress.setComplete
 *   - Listens for cross-tab progress updates via BroadcastChannel / localStorage
 *
 * Differences:
 *   - Renders the new "remix" UI (list / grid / priority views) into one mount
 *     point (#sca-cases-remix) instead of the old accordion DOM.
 *   - No jQuery / Select2 dependency.
 *   - All CSS classes are prefixed `cx-` (matches sca-cases-list-remix.css).
 *
 * Mount point:
 *   Place a single <div id="sca-cases-remix"></div> on the cases page.
 *   If absent, the script auto-creates one inside the first <main> / <body>.
 */

(() => {
  'use strict';

  if (window.__scaCasesRemixLoaded) return;
  window.__scaCasesRemixLoaded = true;

  const PROXY_URL = "https://scarevision-airtable-proxy.vercel.app/api/cases-list-data";
  const CACHE_KEY = "airtableData"; // reuse existing cache key so old bootscript stays warm

  /* =========================================================
     Tiny helpers
     ========================================================= */

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = v;
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  };

  const debounce = (fn, ms = 150) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const safeJson = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

  const asArray = (v) => {
    if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
    if (typeof v === "string") return v.split(",").map(s => s.trim()).filter(Boolean);
    return [];
  };

  const isAiSite = () => /(^|\.)scarevision\.ai$/i.test(window.location.hostname);

  /* =========================================================
     SVG icons (inline so no extra http)
     ========================================================= */

  const ICONS = {
    search:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    shuffle:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
    timer:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg>',
    filter:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>',
    viewGrid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    viewList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    viewPrio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20v-6M12 20V10M20 20V4"/></svg>',
    play:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v14l11-7z"/></svg>',
    check:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-11"/></svg>',
    arrow:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>',
  };

  const icon = (name, size = 14) => {
    const s = document.createElement('span');
    s.className = 'cx-ico';
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.innerHTML = ICONS[name] || '';
    return s;
  };

  /* =========================================================
     State
     ========================================================= */

  const DEFAULT_FILTERS = {
    diagnosis:  true,
    onlyOnce:   false,
    difficulty: true,
    videoOnly:  false,
    undone:     false,
  };

  const state = {
    records:       [],
    loading:       true,
    progressReady: false,

    // ui
    view:           readInitialView(),
    kind:           "topic",                 // "topic" | "experience"
    selectedThemes: [],                      // Select2 multi-select values (Themes field)
    allThemes:      [],                      // union of Themes across all records
    filters:        { ...DEFAULT_FILTERS },
    opened:         null,                    // topic id (drawer target, grid/priority views)
    listOpen:       new Set(),               // list view: which topics are expanded

    // derived (recomputed on state change)
    topics:            [],
    casesByTopic:      {},
    totalUniqueCases:  0,
    totalUniqueDone:   0,
  };

  function readInitialView() {
    const raw = localStorage.getItem("cx-view");
    // Migrate deprecated values. User removed Index + Heatmap and made List the default.
    if (raw === "list" || raw === "grid" || raw === "priority") return raw;
    return "list";
  }

  function saveFiltersToUrl() {
    try {
      const p = new URLSearchParams(window.location.search);
      p.set("showDiagnosis", state.filters.diagnosis);
      p.set("videoOnly", state.filters.videoOnly);
      history.replaceState(null, "", "?" + p.toString());
    } catch {}
  }

  /* =========================================================
     Data load (stale-while-revalidate, mirrors old script)
     ========================================================= */

  function loadCases() {
    const cached = safeJson(localStorage.getItem(CACHE_KEY));
    if (cached && Array.isArray(cached.data) && cached.data.length) {
      state.records = cached.data;
      state.loading = false;
      recomputeAndRender();
    }
    return fetch(PROXY_URL, { method: "GET" })
      .then(r => r.json())
      .then(data => {
        const records = data?.records;
        if (!Array.isArray(records)) throw new Error("Invalid cases payload");
        const sig = sigOf(records);
        const prevSig = cached?.sig || null;
        if (sig !== prevSig) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), sig, data: records })); } catch {}
          state.records = records;
        }
        state.loading = false;
        recomputeAndRender();
      })
      .catch(() => {
        state.loading = false;
        recomputeAndRender();
      });
  }

  function sigOf(records) {
    try {
      const n = records.length;
      const f = records[0]?.id || "", m = records[Math.floor(n/2)]?.id || "", l = records[n-1]?.id || "";
      const ai = records.filter(r => !!r.fields?.["AI Link"]).map(r => r.id).join(",");
      return `${n}|${f}|${m}|${l}|${ai}`;
    } catch { return String(Date.now()); }
  }

  /* =========================================================
     Progress (via SCAProgress)
     ========================================================= */

  window.scaCompletedSet = window.scaCompletedSet || new Set();

  function waitForSCAProgress(maxMs = 5000) {
    return new Promise(resolve => {
      if (window.SCAProgress?.getProgress) return resolve(true);
      const start = Date.now();
      const t = setInterval(() => {
        if (window.SCAProgress?.getProgress) { clearInterval(t); resolve(true); return; }
        if (Date.now() - start > maxMs)     { clearInterval(t); resolve(false); }
      }, 100);
    });
  }

  async function loadProgress() {
    const ok = await waitForSCAProgress();
    if (!ok) { state.progressReady = true; recomputeAndRender(); return; }
    try {
      const progress = await window.SCAProgress.getProgress();
      window.scaCompletedSet = new Set((progress?.completed || []).map(String));
    } catch {}
    state.progressReady = true;
    recomputeAndRender();
  }

  async function refreshProgressAfterChange() {
    if (!window.SCAProgress?.getProgress) return;
    try {
      const progress = await window.SCAProgress.getProgress();
      window.scaCompletedSet = new Set((progress?.completed || []).map(String));
      recomputeAndRender();
    } catch {}
  }

  // Cross-tab sync (same channel as old script, so both live side-by-side).
  // We set _suppressNextBroadcast briefly around our own writes so we don't
  // react to the echo of our own BroadcastChannel/storage message.
  let _suppressBroadcastUntil = 0;

  const progressChannel = "BroadcastChannel" in window
    ? new BroadcastChannel("sca-progress")
    : null;
  if (progressChannel) {
    progressChannel.onmessage = e => {
      if (e?.data?.type !== "progress-updated") return;
      if (Date.now() < _suppressBroadcastUntil) return;
      refreshProgressAfterChange();
    };
  }
  window.addEventListener("storage", e => {
    if (e.key !== "sca-progress-updated") return;
    if (Date.now() < _suppressBroadcastUntil) return;
    refreshProgressAfterChange();
  });
  window.addEventListener("focus",    refreshProgressAfterChange);
  window.addEventListener("pageshow", refreshProgressAfterChange);

  /* =========================================================
     Data normalisation — records → { topics, casesByTopic }
     ========================================================= */

  function recompute() {
    const records = state.records;
    const onAi    = isAiSite();
    const linkField = onAi
      ? "AI Link"
      : (state.filters.diagnosis ? "Link" : "Link-nt");

    // Build the complete theme set across ALL records (not filtered), so the
    // Select2 options always show every available theme regardless of current
    // filters. Matches old behaviour in populateFilters().
    const themeSet = new Set();
    for (const r of records) {
      const t = r.fields?.["Themes"];
      if (Array.isArray(t)) for (const x of t) if (x) themeSet.add(String(x));
    }
    state.allThemes = Array.from(themeSet).sort();

    // Record-level visibility (same rules as old script):
    //   - on scarevision.ai, require an AI Link
    //   - Video Only filter drops anything without a Video Link
    //   - Selected themes: intersection — record must contain every selected theme
    const visible = records.filter(r => {
      const f = r.fields || {};
      if (onAi && !f["AI Link"]) return false;
      if (state.filters.videoOnly && !f["Video Link"]) return false;
      if (state.selectedThemes.length) {
        const rt = f["Themes"] || [];
        if (!state.selectedThemes.every(t => rt.includes(t))) return false;
      }
      return true;
    });

    // Build flat case objects
    const cases = visible.map(r => {
      const f = r.fields || {};
      const caseIdRaw = f["Case ID"] ?? f["CaseID"] ?? f["Case Number"] ?? f["Case"];
      const caseId = Number(String(caseIdRaw ?? "").trim());
      const cid = Number.isFinite(caseId) ? caseId : null;

      return {
        id:         cid,
        airId:      r.id,
        name:       String(f["Name"] || "").trim(),
        pc:         String(f["Presenting Complaint"] || "").trim(),
        link:       f[linkField] || f["Link"] || "#",
        videoLink:  f["Video Link"] || null,
        difficulty: Math.max(0, Math.min(3, parseInt(f["Difficulty"] || "0", 10) || 0)),
        topics:     asArray(f["Clinical Topics"]),
        domains:    asArray(f["Domain"] || f["Themes"]),
        themes:     asArray(f["Themes"]),
        done:       cid != null && window.scaCompletedSet.has(String(cid)),
      };
    });

    // Decide which key to group by
    const groupKey = state.kind === "topic" ? "topics" : "domains";

    // Build topic buckets
    const byBucket = {};
    for (const c of cases) {
      const groups = c[groupKey];
      if (!groups.length) continue;
      groups.forEach((g, i) => {
        if (!byBucket[g]) byBucket[g] = { cases: [], firstCases: [] };
        byBucket[g].cases.push(c);
        if (i === 0) byBucket[g].firstCases.push(c);
      });
    }

    const useFirstOnly = state.filters.onlyOnce;
    const topics = Object.keys(byBucket).sort().map(name => {
      const list = useFirstOnly ? byBucket[name].firstCases : byBucket[name].cases;
      const done = list.filter(c => c.done).length;
      return {
        id:   name,
        t:    name,
        n:    list.length,
        d:    done,
        kind: state.kind,
        _cases: list,
      };
    }).filter(t => t.n > 0);

    const casesByTopic = {};
    for (const t of topics) casesByTopic[t.id] = t._cases;

    state.topics = topics;
    state.casesByTopic = casesByTopic;
    state.totalUniqueCases = cases.length;
    state.totalUniqueDone  = cases.filter(c => c.done).length;
  }

  /* =========================================================
     Filtering for the current search query
     ========================================================= */

  function filteredTopics() {
    // All filtering now happens in recompute() — this wrapper is retained in
    // case we reintroduce post-grouping filters later (e.g. hide empty buckets).
    return state.topics;
  }

  /* =========================================================
     Render pipeline
     ========================================================= */

  let mountEl = null;

  function getMount() {
    if (mountEl) return mountEl;
    mountEl = document.getElementById("sca-cases-remix");
    if (!mountEl) {
      // Fallback: create next to whatever the existing page had
      const old = document.getElementById("caseList") || document.querySelector("main") || document.body;
      mountEl = document.createElement("div");
      mountEl.id = "sca-cases-remix";
      if (old && old !== document.body && old.parentNode) {
        old.parentNode.insertBefore(mountEl, old);
        old.style.display = "none"; // hide old UI if present
      } else {
        document.body.appendChild(mountEl);
      }
    }
    return mountEl;
  }

  function recomputeAndRender() {
    recompute();
    render();
  }

  function render() {
    const mount = getMount();
    mount.className = "cx-root";

    // Content lives inside an inner shell so the .cx-root background extends
    // full-bleed but the content stays constrained to the design max-width.
    const shell = h("div", { class: "cx-shell" },
      ensureLoginNotice(),
      renderHero(),
      ensureControls(),
      renderActiveFilters(),
      renderMain(),
      ensureRecent(),
    );
    mount.replaceChildren(shell);

    // Patch the cached control bar's "on" classes + filter count in place
    updateControlsState();

    // Initialise / sync Select2 on the themes selector (idempotent)
    ensureSelect2();

    // Drawer lives on document.body (fixed-position). Don't rebuild it from
    // scratch every render — that would restart the slide-in animation and
    // cause visible "blink" when progress state changes while the drawer is
    // open. Instead: only create it when first opened, patch its contents in
    // place on subsequent renders, remove it when closed.
    syncDrawer();
  }

  function syncDrawer() {
    const want = state.opened && state.view !== "list";
    const existing = document.querySelector(".cx-drawer-wrap");

    if (!want) {
      if (existing) existing.remove();
      return;
    }

    // Want a drawer. If one already exists for the same topic, patch it;
    // otherwise (topic changed, or no drawer yet) build fresh.
    if (existing && existing.dataset.topicId === String(state.opened)) {
      patchDrawer(existing);
    } else {
      if (existing) existing.remove();
      document.body.appendChild(renderDrawer());
    }
  }

  function patchDrawer(wrap) {
    const topic = state.topics.find(t => t.id === state.opened);
    if (!topic) return;
    const cases = state.casesByTopic[topic.id] || [];
    const pct = topic.n ? Math.round((topic.d / topic.n) * 100) : 0;

    // Update header counters
    const p = wrap.querySelector(".cx-drawer-head p");
    if (p) p.textContent = `${topic.d} of ${topic.n} cases done · ${pct}%`;

    // Update progress bar — apply both width and background-size so the
    // gradient reveals correctly when completion changes mid-drawer.
    const bar = wrap.querySelector(".cx-drawer-bar > span");
    if (bar) {
      const s = progressBarFillStyle(pct);
      bar.style.width = s.width;
      bar.style.backgroundSize = s.backgroundSize || "";
    }

    // Re-render the case list inside the drawer
    const list = wrap.querySelector(".cx-drawer-cases");
    if (list) {
      list.replaceChildren(...cases.map(caseEntry).filter(Boolean));
    }
  }

  /* ---------- Hero ---------- */

  function renderHero() {
    const kindLabel = state.kind === "topic" ? "clinical topics" : "experience groups";
    const total     = state.totalUniqueCases || 0;
    const done      = state.totalUniqueDone || 0;
    const topicsN   = state.topics.length;
    const pct       = total ? Math.round((done / total) * 100) : 0;

    // Hero title reflects the active filter mode. "Browse written/videos/AI cases."
    // gives the user a live sense of what subset they're looking at, and leaves
    // room to add further modes (AI, etc.) behind different colour tokens.
    const mode = heroMode();

    return h("section", { class: "cx-hero" },
      h("div", { class: "cx-hero-left" },
        h("div", { class: "cx-eyebrow" }, "Cases"),
        h("h1", { class: "cx-hero-title" },
          "Browse cases: ",
          h("span", {
            class: "cx-hero-mode",
            "data-mode": mode.key,
          }, mode.word),
        ),
        h("p", { class: "cx-hero-sub", html:
          `<b>${total}</b> cases &middot; <b>${topicsN}</b> ${kindLabel} &middot; <b>${pct}%</b> complete`
        }),
      ),
      h("div", { class: "cx-hero-right" },
        h("a", { href: "#", class: "cx-btn cx-btn-primary", onClick: onRandomCase },
          icon("shuffle", 14), h("span", {}, "Random case"),
        ),
      ),
    );
  }

  /* Map the current filter state to a word + colour token for the hero.
     Add more modes here (AI, etc.) and they'll render automatically, as
     long as the CSS has a matching [data-mode="..."] rule. */
  function heroMode() {
    if (state.filters.videoOnly) return { key: "videos",  word: "Videos" };
    return { key: "written", word: "Written" };
  }

  function onRandomCase(e) {
    e.preventDefault();
    const all = [];
    for (const t of state.topics) {
      for (const c of (state.casesByTopic[t.id] || [])) {
        if (!state.filters.undone || !c.done) all.push(c);
      }
    }
    if (!all.length) return;
    const pick = all[Math.floor(Math.random() * all.length)];
    if (pick?.link && pick.link !== "#") window.open(pick.link, "_blank", "noopener");
  }

  /* ---------- Controls ---------- */

  // --- Cached control bar ---------------------------------------------------
  // Built ONCE and reused across renders. Why: Select2 wraps the select
  // element with its own sibling DOM. Rebuilding the control bar every render
  // would tear that down and flicker. Instead we mutate specific bits in
  // place via updateControlsState().

  let _controlsEl    = null;
  let _themesSelect  = null;
  let _filterBtnEl   = null;
  let _kindSegEl     = null;
  let _viewSegEl     = null;
  let _select2Ready  = false;

  function ensureControls() {
    if (_controlsEl) return _controlsEl;

    // ---- search (Select2 multi-select on Themes) ----
    _themesSelect = document.createElement("select");
    _themesSelect.id = "sca-themes-selector";
    _themesSelect.setAttribute("multiple", "multiple");
    _themesSelect.style.width = "100%";

    const searchBox = h("div", { class: "cx-search" },
      icon("search", 16),
      _themesSelect,
    );

    // ---- filter button ----
    _filterBtnEl = h("button", { class: "cx-filterbtn", onClick: toggleFilterPop },
      icon("filter", 14),
      h("span", {}, "Filters"),
      h("span", { class: "cx-filterbtn-count", style: { display: "none" } }, ""),
    );
    const filterWrap = h("div", { class: "cx-filterbtn-wrap" }, _filterBtnEl);

    // ---- kind segment (topic / experience) ----
    _kindSegEl = h("div", { class: "cx-seg cx-seg-kind" });
    const mkKindBtn = (k, label) => {
      const b = h("button", { "data-kind": k }, label);
      b.addEventListener("click", () => {
        if (state.kind === k) return;
        state.kind = k;
        state.listOpen.clear();
        updateControlsState();
        recomputeAndRender();
      });
      return b;
    };
    _kindSegEl.appendChild(mkKindBtn("topic",      "Clinical topics"));
    _kindSegEl.appendChild(mkKindBtn("experience", "Experience groups"));

    // ---- view segment (List / Grid / Priority) ----
    const views = [
      { k: "list",     t: "List",     ic: "viewList" },
      { k: "grid",     t: "Grid",     ic: "viewGrid" },
      { k: "priority", t: "Priority", ic: "viewPrio" },
    ];
    _viewSegEl = h("div", { class: "cx-seg cx-seg-view" });
    for (const o of views) {
      const b = h("button", {
        "data-view": o.k, title: o.t, "aria-label": o.t,
      },
        icon(o.ic, 14),
        h("span", { class: "cx-seg-label" }, o.t),
      );
      b.addEventListener("click", () => {
        if (state.view === o.k) return;
        state.view = o.k;
        try { localStorage.setItem("cx-view", o.k); } catch {}
        if (o.k === "list") state.opened = null;
        updateControlsState();
        render();
      });
      _viewSegEl.appendChild(b);
    }

    _controlsEl = h("section", { class: "cx-controls" }, searchBox, filterWrap, _kindSegEl, _viewSegEl);
    updateControlsState();
    return _controlsEl;
  }

  function updateControlsState() {
    if (!_controlsEl) return;

    // filter button active count + "on" class
    const active = Object.keys(DEFAULT_FILTERS).filter(k => state.filters[k] !== DEFAULT_FILTERS[k]).length;
    _filterBtnEl.classList.toggle("on", active > 0);
    const badge = _filterBtnEl.querySelector(".cx-filterbtn-count");
    if (badge) {
      badge.textContent = String(active);
      badge.style.display = active > 0 ? "" : "none";
    }

    // kind segment
    _kindSegEl.querySelectorAll("button").forEach(b => {
      b.classList.toggle("on", b.dataset.kind === state.kind);
    });

    // view segment
    _viewSegEl.querySelectorAll("button").forEach(b => {
      b.classList.toggle("on", b.dataset.view === state.view);
    });
  }

  // Initialise Select2 on the themes selector once jQuery + Select2 are ready
  // and the select element is in the DOM. Populate options from state.allThemes.
  // Called from render() on every paint — idempotent.
  function ensureSelect2() {
    if (!window.jQuery || !window.jQuery.fn?.select2) return;
    if (!_themesSelect) return;
    if (!document.contains(_themesSelect)) return;

    const $sel = window.jQuery(_themesSelect);

    if (!_select2Ready) {
      $sel.select2({
        placeholder:        "Start typing to search using key words",
        allowClear:         true,
        minimumInputLength: 1,
        closeOnSelect:      true,
        width:              "100%",
      });
      $sel.on("change", () => {
        const vals = $sel.val() || [];
        // Avoid infinite loops: only recompute if the set actually changed
        const prev = state.selectedThemes.join("|");
        const next = vals.join("|");
        if (prev === next) return;
        state.selectedThemes = vals.slice();
        recomputeAndRender();
      });
      _select2Ready = true;
    }

    // Sync options to state.allThemes. Only rebuild if the list changed.
    const currentOpts = Array.from(_themesSelect.options).map(o => o.value);
    const need = state.allThemes;
    const sameOpts = currentOpts.length === need.length && currentOpts.every((v, i) => v === need[i]);
    if (!sameOpts) {
      const selected = new Set(state.selectedThemes);
      _themesSelect.innerHTML = "";
      for (const t of need) {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        if (selected.has(t)) o.selected = true;
        _themesSelect.appendChild(o);
      }
      $sel.trigger("change.select2");
    }
  }

  // Popover lives on document.body so render() doesn't destroy it mid-interaction
  // --- Inline "log in again" notice ---------------------------------------
  // Preserves the old HTML snippet's behaviour: shown when SCAAuth.getToken()
  // resolves to null (no session), hidden when a token is present. Cached
  // across renders so the state isn't reset on every paint.

  let _loginNoticeEl = null;

  function ensureLoginNotice() {
    if (_loginNoticeEl) return _loginNoticeEl;

    const link = h("span", {
      id:       "scaInlineLoginLink",
      role:     "button",
      tabIndex: 0,
      style:    { color: "#2563eb", fontWeight: 600, cursor: "pointer" },
    }, "log in again");

    const openLoginOverlay = (e) => {
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const selectors = [
        "a.user-accounts-text-link",
        "a.user-accounts-link",
        "a[href='#'][class*='user-accounts']",
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.click(); return; }
      }
      const all = document.querySelectorAll("header a, header button, nav a, nav button");
      for (const el of all) {
        const t = (el.textContent || "").trim().toLowerCase();
        if (["account", "log in", "login", "sign in"].includes(t)) {
          el.click();
          return;
        }
      }
      alert("Please use the Account / Log in button in the site header.");
    };

    link.addEventListener("click", openLoginOverlay);
    link.addEventListener("keydown", openLoginOverlay);

    _loginNoticeEl = h("p", {
      id:    "scaInlineLoginNotice",
      class: "cx-login-notice",
      style: { margin: "10px 0 18px", fontSize: "15px", color: "#6c7485" },
    },
      "To display your progress data, please ",
      link,
      " to confirm your account.",
    );

    // Default: hidden until we know there's no session (prevents a flash of
    // the notice on initial load while SCAAuth resolves).
    _loginNoticeEl.hidden = true;

    if (window.SCAAuth?.getToken) {
      window.SCAAuth.getToken().then(token => {
        _loginNoticeEl.hidden = !!token;
      }).catch(() => { _loginNoticeEl.hidden = false; });
    }

    return _loginNoticeEl;
  }

  // Call whenever auth state might have changed (e.g. after a retry succeeds).
  function refreshLoginNotice() {
    if (!_loginNoticeEl || !window.SCAAuth?.getToken) return;
    window.SCAAuth.getToken().then(token => {
      _loginNoticeEl.hidden = !!token;
    }).catch(() => { _loginNoticeEl.hidden = false; });
  }

  /* =========================================================
     Filter popover
     ========================================================= */

  function toggleFilterPop(e) {
    e.stopPropagation();
    const existing = document.getElementById("cx-filterpop");
    if (existing) { closePop(existing); return; }

    const btn = e.currentTarget;
    const pop = buildFilterPop();
    pop.style.position = "fixed";
    pop.style.zIndex = "60";
    document.body.appendChild(pop);
    positionPop(pop, btn);

    const onResize = () => positionPop(pop, btn);
    const closer = (ev) => {
      if (pop.contains(ev.target)) return;
      if (btn.contains && btn.contains(ev.target)) return;
      closePop(pop);
    };
    const escCloser = (ev) => { if (ev.key === "Escape") closePop(pop); };

    function closePop(p) {
      try { p.remove(); } catch {}
      document.removeEventListener("mousedown", closer);
      document.removeEventListener("keydown", escCloser);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    }

    setTimeout(() => {
      document.addEventListener("mousedown", closer);
      document.addEventListener("keydown", escCloser);
      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onResize, true);
    }, 0);
  }

  function positionPop(pop, btn) {
    const r = btn.getBoundingClientRect();
    const popWidth = 320;
    const margin = 8;
    // Try to align right-edge with button; clamp to viewport
    let right = Math.max(margin, window.innerWidth - r.right);
    if (right + popWidth > window.innerWidth - margin) right = margin;
    pop.style.top = (r.bottom + margin) + "px";
    pop.style.right = right + "px";
    pop.style.left = "auto";
  }

  function buildFilterPop() {
    const rows = [
      { k: "diagnosis",  label: "Show diagnosis",  hint: "Reveal each case's diagnosis" },
      { k: "difficulty", label: "Show difficulty", hint: "Display the 1–3 ★ rating" },
      { k: "videoOnly",  label: "Video only",      hint: "Only cases with a video" },
      { k: "undone",     label: "Not done yet",    hint: "Hide cases you've completed" },
      { k: "onlyOnce",   label: "Each case once",  hint: "Don't repeat cases across topics" },
    ];

    const activeCount = () => Object.keys(DEFAULT_FILTERS)
      .filter(k => state.filters[k] !== DEFAULT_FILTERS[k]).length;

    const head = h("div", { class: "cx-filterpop-head" }, h("span", {}, "Filter cases"));
    const resetBtn = h("button", {
      class: "cx-filterpop-reset",
      onClick: () => {
        state.filters = { ...DEFAULT_FILTERS };
        saveFiltersToUrl();
        recomputeAndRender();
        refreshPopInternals();
      },
    }, "Reset all");

    if (activeCount()) head.appendChild(resetBtn);

    const rowsWrap = h("div", { class: "cx-filterpop-rows" });

    for (const r of rows) {
      const sw = h("button", {
        class: "cx-switch" + (state.filters[r.k] ? " on" : ""),
        "aria-pressed": !!state.filters[r.k],
      }, h("span", {}));
      const row = h("label", { class: "cx-filterrow" },
        h("div", {},
          h("div", { class: "cx-filterrow-label" }, r.label),
          h("div", { class: "cx-filterrow-hint" }, r.hint),
        ),
        sw,
      );
      sw.dataset.filterKey = r.k;
      sw.addEventListener("click", (e) => {
        e.preventDefault();
        state.filters[r.k] = !state.filters[r.k];
        sw.classList.toggle("on", state.filters[r.k]);
        sw.setAttribute("aria-pressed", String(!!state.filters[r.k]));
        saveFiltersToUrl();
        recomputeAndRender();           // the pop survives — it's in document.body
        refreshPopInternals();
      });
      rowsWrap.appendChild(row);
    }

    const pop = h("div", { id: "cx-filterpop", class: "cx-filterpop" }, head, rowsWrap);

    function refreshPopInternals() {
      // Toggle the reset button presence without rebuilding the pop
      const hasReset = head.contains(resetBtn);
      if (activeCount() && !hasReset) head.appendChild(resetBtn);
      if (!activeCount() && hasReset) resetBtn.remove();
      // Sync switch classes from state (covers the "reset all" case)
      pop.querySelectorAll(".cx-switch").forEach(swEl => {
        const k = swEl.dataset.filterKey;
        if (!k) return;
        const on = !!state.filters[k];
        swEl.classList.toggle("on", on);
        swEl.setAttribute("aria-pressed", String(on));
      });
    }

    return pop;
  }

  /* ---------- Active filter chip strip ---------- */

  function renderActiveFilters() {
    const chips = [];

    if (state.filters.diagnosis !== true) chips.push(chip("Diagnosis hidden", () => { state.filters.diagnosis = true; recomputeAndRender(); }));
    if (state.filters.difficulty !== true) chips.push(chip("Difficulty hidden", () => { state.filters.difficulty = true; render(); }));
    if (state.filters.videoOnly) chips.push(chip("Video only", () => { state.filters.videoOnly = false; recomputeAndRender(); }));
    if (state.filters.undone) chips.push(chip("Not done yet", () => { state.filters.undone = false; render(); }));
    if (state.filters.onlyOnce) chips.push(chip("Each case once", () => { state.filters.onlyOnce = false; recomputeAndRender(); }));

    const count = filteredTopics().length;
    const noun = state.kind === "topic" ? "topics" : "groups";

    return h("section", { class: "cx-activefilters" },
      h("div", { class: "cx-activefilters-left" },
        chips.length
          ? chips
          : h("span", { class: "cx-activefilters-none" }, "No filters applied"),
      ),
      h("span", { class: "cx-activefilters-count", html: `<b>${count}</b> ${noun}` }),
    );
  }

  function chip(label, onRemove) {
    return h("button", { class: "cx-chip", onClick: onRemove },
      label, " ", h("span", {}, "×"),
    );
  }

  /* =========================================================
     Recent section (below main list)
     =========================================================
     5×2 grid of the 10 most-recently-added cases, plus a
     collapsible list of the titles. Same image source + sort
     behaviour as the portal's "recently added" rail so the two
     pages stay visually consistent.
  */
  const CASE_IMAGE_BASE = "https://iix7q95khocr9u36.public.blob.vercel-storage.com/CaseImages";
  const RECENT_COUNT = 10;
  let _recentEl = null;

  function computeRecentItems() {
    const records = state.records || [];
    // Map down to a uniform shape and filter out cases without a working link.
    // (Cases without a Link field aren't navigable — don't surface them here.)
    const items = records.map(r => {
      const f = r.fields || {};
      return {
        id:      Number(f["Case ID"]),
        title:   f["Name"] || "",
        tag:     (Array.isArray(f["Clinical Topics"]) ? f["Clinical Topics"][0] : f["Clinical Topics"]) || "",
        created: f["Created"] ? new Date(f["Created"]).getTime() : null,
        hasLink: typeof f["Link"] === "string" && !!f["Link"].trim(),
      };
    }).filter(x => Number.isFinite(x.id) && x.hasLink);

    // Prefer Created date when any record has it; fall back to Case ID descending.
    // (Matches portal.js behaviour exactly — if Created is missing/inconsistent
    //  across the base, sorting by Case ID is a reasonable proxy for "newest".)
    if (items.some(x => x.created)) {
      return items.filter(x => x.created)
                  .sort((a, b) => b.created - a.created)
                  .slice(0, RECENT_COUNT);
    }
    return items.sort((a, b) => b.id - a.id).slice(0, RECENT_COUNT);
  }

  function ensureRecent() {
    if (!_recentEl) {
      _recentEl = h("section", { class: "cx-recent" });
    }
    populateRecent();
    return _recentEl;
  }

  function populateRecent() {
    if (!_recentEl) return;
    const items = computeRecentItems();

    if (!items.length) {
      // No records yet or none with usable links — hide the whole section.
      _recentEl.style.display = "none";
      _recentEl.innerHTML = "";
      return;
    }
    _recentEl.style.display = "";

    // Header
    const head = h("header", { class: "cx-recent-head" },
      h("div", { class: "cx-recent-head-left" },
        h("div", { class: "cx-eyebrow" }, `${items.length} newest cases`),
        h("h3", {}, "Recently added"),
      ),
    );

    // Grid of thumbnails — pure anchors, no JS wiring needed. The onerror hides
    // the <img> on a 404 so the gradient background shows through instead.
    const grid = h("div", { class: "cx-recent-grid" });
    items.forEach((it, i) => {
      const link = document.createElement("a");
      link.className = "cx-recent-tile";
      link.href = `/casev2?case=${it.id}`;
      link.setAttribute("aria-label", it.title || `Case ${it.id}`);
      link.dataset.seed = String(i % 5);

      const img = document.createElement("img");
      img.className = "cx-recent-img";
      img.src = `${CASE_IMAGE_BASE}/Case-${it.id}.webp`;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 400;
      img.height = 400;
      img.onerror = function () { this.style.display = "none"; };
      link.appendChild(img);

      const num = document.createElement("span");
      num.className = "cx-recent-num";
      num.textContent = `#${it.id}`;
      link.appendChild(num);

      grid.appendChild(link);
    });

    // Collapsible list of titles — native <details>/<summary> (no JS).
    // Default collapsed; the user can expand to see names.
    const details = h("details", { class: "cx-recent-details" });
    const summary = h("summary", { class: "cx-recent-summary" },
      h("span", {}, "Show case names"),
      h("i", { class: "fa-solid fa-chevron-down cx-recent-chev" }),
    );
    const list = h("ol", { class: "cx-recent-list" });
    items.forEach(it => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `/casev2?case=${it.id}`;
      a.textContent = it.title || `Case ${it.id}`;
      li.appendChild(a);

      if (it.tag) {
        const tagEl = document.createElement("span");
        tagEl.className = "cx-recent-list-tag";
        tagEl.textContent = it.tag;
        li.appendChild(tagEl);
      }

      const idEl = document.createElement("span");
      idEl.className = "cx-recent-list-id";
      idEl.textContent = `#${it.id}`;
      li.appendChild(idEl);

      list.appendChild(li);
    });
    details.appendChild(summary);
    details.appendChild(list);

    _recentEl.replaceChildren(head, grid, details);
  }

  /* ---------- Main content by view ---------- */

  function renderMain() {
    if (state.loading && !state.records.length) {
      return h("div", { class: "cx-loading" }, "Loading cases…");
    }
    const list = filteredTopics();
    if (!list.length) {
      return h("div", { class: "cx-empty" },
        h("strong", {}, "No topics match."),
        h("div", {}, "Try clearing the search or changing filters."),
      );
    }
    if (state.view === "list")     return renderListView(list);
    if (state.view === "grid")     return renderGridView(list);
    if (state.view === "priority") return renderPriorityView(list);
    return renderListView(list);
  }

  /* =========================================================
     Progress-bar gradient
     =========================================================
     The track's fill span carries a linear-gradient from pale (#c8d4e4)
     through peri (#7DA8F0) to deep ink (#253551). At 100% fill the whole
     spectrum is visible; at 50% only the left half (ending around peri)
     is visible. The trick: the fill is only as wide as the progress, but
     the gradient must be scaled up so it represents the FULL track. We do
     that by setting background-size = (100/pct)% horizontally — so the
     fill shows exactly its left slice of the full gradient.
  */
  function progressBarFillStyle(pct) {
    if (pct <= 0) return { width: "0%" };
    // background-size horizontal = 100% / (pct/100) = 10000/pct %
    // e.g. pct=25 → bg-size 400%, fill width 25% → shows 0–25% of gradient
    // e.g. pct=100 → bg-size 100%, fill width 100% → shows the whole thing
    const bgX = 10000 / pct;
    return {
      width: pct + "%",
      backgroundSize: bgX.toFixed(2) + "% 100%",
    };
  }

  /* ---------- List view (default) ---------- */

  function renderListView(topics) {
    const wrap = h("section", { class: "cx-list" });
    for (const t of topics) {
      const isOpen = state.listOpen.has(t.id);
      const pct = t.n ? Math.round((t.d / t.n) * 100) : 0;

      const head = h("button", { class: "cx-row-head", onClick: () => {
        if (isOpen) state.listOpen.delete(t.id); else state.listOpen.add(t.id);
        render();
      }},
        h("span", { class: "cx-row-chevron" }, isOpen ? "−" : "+"),
        h("span", { class: "cx-row-title" }, t.t),
        h("span", { class: "cx-row-progress" },
          h("span", { class: "cx-row-track" },
            h("span", { style: progressBarFillStyle(pct) }),
          ),
          h("span", { class: "cx-row-count", html: `<b>${t.d}</b>/${t.n}` }),
        ),
      );

      const row = h("div", { class: "cx-row" + (isOpen ? " open" : "") }, head);

      if (isOpen) {
        const cases = state.casesByTopic[t.id] || [];
        row.appendChild(h("div", { class: "cx-row-cases" },
          ...cases.map(caseEntry),
        ));
      }
      wrap.appendChild(row);
    }
    return wrap;
  }

  /* ---------- Grid view ---------- */

  function renderGridView(topics) {
    const wrap = h("section", { class: "cx-grid" });
    for (const t of topics) {
      const pct = t.n ? Math.round((t.d / t.n) * 100) : 0;
      const remaining = t.n - t.d;
      const r = 22, c = 2 * Math.PI * r;
      const dash = (pct / 100) * c;

      const card = h("button", {
        class: "cx-card",
        onClick: () => { state.opened = t.id; render(); },
      },
        h("div", { class: "cx-card-top" },
          // SVG ring via innerHTML for simplicity
          h("div", { class: "cx-card-ring", html:
            `<svg width="60" height="60" viewBox="0 0 60 60">
               <circle cx="30" cy="30" r="${r}" fill="none" stroke="var(--paper-3)" stroke-width="4"/>
               <circle cx="30" cy="30" r="${r}" fill="none" stroke="var(--peri)" stroke-width="4"
                 stroke-dasharray="${dash} ${c}" stroke-linecap="round" transform="rotate(-90 30 30)"/>
             </svg>
             <span>${pct}%</span>`
          }),
          h("span", {
            class: "cx-card-status " +
              (t.d === t.n ? "complete" : t.d === 0 ? "empty" : "partial"),
          }, t.d === t.n ? "Complete" : t.d === 0 ? "Not started" : `${remaining} to go`),
        ),
        h("h3", { class: "cx-card-title" }, t.t),
        h("div", { class: "cx-card-meta" },
          h("span", { html: `<b>${t.d}</b>/${t.n} cases` }),
          h("span", { class: "cx-card-go" },
            "Open ",
            icon("arrow", 12),
          ),
        ),
      );
      wrap.appendChild(card);
    }
    return wrap;
  }

  /* ---------- Priority view ---------- */

  function renderPriorityView(topics) {
    const b = { next: [], progress: [], nearly: [], mastered: [] };
    topics.forEach(t => {
      const pct = t.n ? (t.d / t.n) * 100 : 0;
      if (pct === 0)        b.next.push(t);
      else if (pct >= 100)  b.mastered.push(t);
      else if (pct >= 70)   b.nearly.push(t);
      else                  b.progress.push(t);
    });

    // Tone names match the progress-bar story: empty/paper for not-yet-started,
    // peri for early progress, steel for mid/late, ink navy for mastered.
    const cols = [
      { key: "next",     t: "Start next",   sub: "Untouched topics — a fresh place to begin", tone: "empty-tone", items: b.next },
      { key: "progress", t: "Keep going",   sub: "Partially complete — build momentum",       tone: "peri",       items: b.progress },
      { key: "nearly",   t: "Nearly there", sub: "Less than 30% of cases left",                tone: "steel",      items: b.nearly },
      { key: "mastered", t: "Mastered",     sub: "100% — revisit any case anytime",            tone: "ink",        items: b.mastered },
    ];

    const wrap = h("section", { class: "cx-prio" });
    for (const col of cols) {
      const colEl = h("div", { class: `cx-prio-col cx-prio-${col.tone}` },
        h("header", { class: "cx-prio-head" },
          h("div", {},
            h("h3", {}, col.t),
            h("p", {}, col.sub),
          ),
          h("span", { class: "cx-prio-n" }, String(col.items.length)),
        ),
        h("div", { class: "cx-prio-items" },
          ...(col.items.length
            ? col.items.map(t => {
                const pct = t.n ? Math.round((t.d / t.n) * 100) : 0;
                return h("button", {
                  class: "cx-prio-item",
                  onClick: () => { state.opened = t.id; render(); },
                },
                  h("h4", {}, t.t),
                  h("div", { class: "cx-prio-line" },
                    h("span", { style: { width: pct + "%" } }),
                  ),
                  h("div", { class: "cx-prio-meta" },
                    h("span", { html: `<b>${t.d}</b>/${t.n}` }),
                    h("span", { class: "cx-prio-pct" }, pct + "%"),
                  ),
                );
              })
            : [h("div", { class: "cx-prio-empty" }, "Nothing here yet")]),
        ),
      );
      wrap.appendChild(colEl);
    }
    return wrap;
  }

  /* ---------- Drawer (grid/priority only) ---------- */

  function renderDrawer() {
    const topic = state.topics.find(t => t.id === state.opened);
    if (!topic) return document.createTextNode("");
    const cases = state.casesByTopic[topic.id] || [];
    const pct = topic.n ? Math.round((topic.d / topic.n) * 100) : 0;

    const close = () => { state.opened = null; render(); };

    const wrap = h("div", {
      class: "cx-drawer-wrap",
      "data-topic-id": String(topic.id),
      onClick: close,
    });
    const aside = h("aside", { class: "cx-drawer", onClick: (e) => e.stopPropagation() },
      h("header", { class: "cx-drawer-head" },
        h("div", {},
          h("span", { class: "cx-eyebrow" }, topic.kind === "topic" ? "Clinical topic" : "Experience group"),
          h("h2", {}, topic.t),
          h("p", {}, `${topic.d} of ${topic.n} cases done · ${pct}%`),
        ),
        h("button", { class: "cx-drawer-close", onClick: close, "aria-label": "Close" }, "×"),
      ),
      h("div", { class: "cx-drawer-bar" }, h("span", { style: progressBarFillStyle(pct) })),
      h("div", { class: "cx-drawer-cases" },
        ...cases.map(caseEntry),
      ),
    );
    wrap.appendChild(aside);

    // Escape to close
    const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);

    return wrap;
  }

  /* ---------- Case row (shared by list & drawer) ---------- */

  function caseEntry(c) {
    if (state.filters.videoOnly && !c.videoLink) return null;
    if (state.filters.undone && c.done) return null;

    const title = state.filters.diagnosis
      ? (c.name || c.pc)
      : (c.pc || c.name);
    const diagLine = state.filters.diagnosis && c.pc ? c.pc : null;

    const checkbox = h("span", {
      class: "cx-case-check" + (c.done ? " done" : ""),
      role: "checkbox",
      tabIndex: 0,
      "aria-checked": !!c.done,
      "data-case-id": c.id != null ? String(c.id) : "",
      title: c.done ? "Mark as not done" : "Mark as done",
      html: c.done ? ICONS.check : "",
    });
    checkbox.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggleCaseDone(c); });
    checkbox.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCaseDone(c); } });

    const meta = h("span", { class: "cx-case-meta" });

    // Video link — Font Awesome icon, matches old site's fa-sharp fa-light fa-video
    // with hover swap to fa-solid.
    if (c.videoLink) {
      const va = document.createElement("a");
      va.href = c.videoLink;
      va.target = "_blank";
      va.rel = "noopener";
      va.className = "cx-case-video-link";
      va.title = "Watch video";
      va.addEventListener("click", (e) => e.stopPropagation());

      const vi = document.createElement("i");
      // Pro is loaded on this site. fa-light renders a thin outlined video
      // camera (weight 300); the :hover CSS rule on .cx-case-video-ic bumps
      // font-weight to 900 which maps to fa-solid — giving a clean light →
      // solid transition without any JS class swap.
      vi.className = "fa-light fa-video cx-case-video-ic";
      va.appendChild(vi);
      meta.appendChild(va);
    }

    // Difficulty stars — Font Awesome solid/regular star (matches old site).
    if (state.filters.difficulty) {
      const stars = document.createElement("span");
      stars.className = "cx-case-diff";
      for (let i = 1; i <= 3; i++) {
        const star = document.createElement("i");
        star.className = (i <= c.difficulty)
          ? "fa-solid fa-star cx-case-star on"
          : "fa-regular fa-star cx-case-star";
        stars.appendChild(star);
      }
      meta.appendChild(stars);
    }

    return h("a", {
      href:  c.link || "#",
      target: c.link && c.link !== "#" ? "_blank" : null,
      rel:   c.link && c.link !== "#" ? "noopener" : null,
      class: "cx-case" + (c.done ? " done" : ""),
      "data-case-id": c.id != null ? String(c.id) : "",
    },
      checkbox,
      h("span", { class: "cx-case-body" },
        h("span", { class: "cx-case-title" }, title || "(untitled)"),
        diagLine ? h("span", { class: "cx-case-diag" }, diagLine) : null,
      ),
      meta,
    );
  }

  /* =========================================================
     Completion toggle (same pattern as old script, but self-contained)
     ========================================================= */

  async function toggleCaseDone(c) {
    if (c.id == null) return;
    if (!window.SCAProgress?.setComplete) return;

    const wasDone = !!c.done;
    const key = String(c.id);

    // Optimistic: flip state and re-render once. State holds the truth; the
    // render function is our single source of UI updates.
    window.scaCompletedSet?.[wasDone ? "delete" : "add"](key);
    recomputeAndRender();

    const rollback = () => {
      window.scaCompletedSet?.[wasDone ? "add" : "delete"](key);
      recomputeAndRender();
    };

    const attempt = async () => {
      await window.SCAProgress.setComplete(c.id, !wasDone);
      // Suppress echoes of our own broadcast/storage events for a short window
      // so we don't re-render a second time when we hear our own message.
      _suppressBroadcastUntil = Date.now() + 1500;
      try { localStorage.setItem("sca-progress-updated", String(Date.now())); } catch {}
      try { progressChannel?.postMessage?.({ type: "progress-updated" }); } catch {}
    };

    try {
      await attempt();
    } catch (err) {
      // One retry after refreshing the token
      try {
        await window.SCAAuth?.getToken();
        await attempt();
      } catch (err2) {
        rollback();
        const eMsg = err2 || err;
        if (window.SCAAuthUI?.isAuthError?.(eMsg)) {
          window.SCAAuthUI.show(
            "To save your progress, please <b>log in again</b> to confirm your account."
          );
          // Auth state may have shifted to "no token" — update inline notice
          refreshLoginNotice();
        }
        console.warn("[SCA] Failed to save completion after retry:", err2 || err);
      }
    }
  }

  /* =========================================================
     Boot
     ========================================================= */

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      window.scrollTo(0, 0);
    } catch {}

    // Hide legacy widgets on the same page (if the old DOM still lives here)
    ["caseList", "themesSelector", "toggleDisplayType", "toggleFirstOnly", "toggleDifficultyRating", "toggleVideoOnly", "btnClinicalTopic", "btnDomain"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.closest("form, section, div")?.style.setProperty("display","none"); });

    getMount(); // ensure mount exists
    render();   // first paint (loading state)

    // Kick off both in parallel
    loadProgress();
    loadCases();
  });

})();
