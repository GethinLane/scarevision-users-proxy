// sca-cases-list-v3.js (rewritten)
// V3: stale-while-revalidate local cache + background refresh + lazy panel rendering
//     + scroll-to-top fix + debounce filters + bind resize once + de-duped listeners
//     + NEW: auth/session popup on user action + Safari-safe globals

(() => {
  // ✅ Prevent duplicate execution issues on Squarespace soft navigation
  if (window.__scaCasesListV3Loaded) return;
  window.__scaCasesListV3Loaded = true;

  /* =========================================================
     Auth popup (shown only on user-triggered save failures)
     ========================================================= */

  (function installAuthModal() {
    if (window.SCAAuthUI) return;

    const ALREADY = { installed: false };
    ALREADY.installed = true;

    function openSquarespaceAccountOverlay() {
      const selectors = [
        "a.user-accounts-text-link",
        "a.user-accounts-link",
        "a[href='#'][class*='user-accounts']",
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          el.click();
          return true;
        }
      }

      const fallback = [...document.querySelectorAll("header a, header button, nav a, nav button")].find((el) => {
        const t = (el.textContent || "").trim().toLowerCase();
        return ["account", "log in", "login", "sign in"].includes(t);
      });

      if (fallback) {
        fallback.click();
        return true;
      }
      return false;
    }

    function ensureModal() {
      if (document.getElementById("scaAuthModalBackdrop")) return;

      const style = document.createElement("style");
      style.textContent = `
#scaAuthModalBackdrop{
  position:fixed; inset:0; background:rgba(15,23,42,.55);
  z-index:999999; display:flex; align-items:center; justify-content:center;
  padding:18px;
}
#scaAuthModalBackdrop,
#scaAuthModal,
#scaAuthModal *{
  font-family: inherit !important;
}

#scaAuthModal .scaBtn,
#scaAuthModal .scaAuthClose{
  font: inherit !important;
}
#scaAuthModal{
  width:min(520px, 100%); background:#fff; border-radius:18px;
  box-shadow:0 24px 80px rgba(15,23,42,.25);
  border:1px solid rgba(148,163,184,.28);
  overflow:hidden;
}
#scaAuthModal .scaAuthHead{
  padding:16px 18px 10px;
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
}
#scaAuthModal .scaAuthTitle{
  margin: 0;
}

#scaAuthModal .scaAuthClose{
  border:0; background:transparent; cursor:pointer;
  font-size:22px; line-height:1; color:#64748b;
}
#scaAuthModal .scaAuthBody{ padding:0 18px 16px; color:#6c7485; line-height:1.5; }
#scaAuthModal .scaAuthBtns{
  display:flex; gap:10px; flex-wrap:wrap;
  padding:0 18px 18px;
}
#scaAuthModal .scaBtn{
  border-radius:12px; padding:10px 14px; font-weight:800; cursor:pointer;
  border:1px solid rgba(148,163,184,.35); background:#fff; color:#1c2b4a;
}
#scaAuthModal .scaBtnPrimary{
  border:1px solid rgba(37,99,235,.25);
  background:rgba(37,99,235,.10);
  color:#1d4ed8;
}
#scaAuthModal .scaAuthNote{
  padding:0 18px 16px; font-size:13px; color:#94a3b8;
}
`;
      document.head.appendChild(style);

      const backdrop = document.createElement("div");
      backdrop.id = "scaAuthModalBackdrop";
      backdrop.hidden = true;

backdrop.innerHTML = `
<div id="scaAuthModal" role="dialog" aria-modal="true" aria-labelledby="scaAuthTitle">
  <div class="scaAuthHead">
    <h4 class="scaAuthTitle" id="scaAuthTitle"><b>Please log in again</b></h4>
    <button class="scaAuthClose" type="button" aria-label="Close">×</button>
  </div>

  <div class="scaAuthBody" id="scaAuthBody">
    To save your progress, please <b>log in again</b> to confirm your account.
  </div>

  <div class="scaAuthBtns">
    <button class="scaBtn scaBtnPrimary" type="button" id="scaAuthLoginBtn">Log in again</button>
    <button class="scaBtn" type="button" id="scaAuthDismissBtn">Not now</button>
  </div>

  <div class="scaAuthNote">
    If this keeps happening (especially on Safari), it can be cookie/session restrictions. Logging in again refreshes access. Please ensure you are not browsing in 'incognito' mode.
  </div>
</div>
`;


      document.body.appendChild(backdrop);

      // ✅ Bulletproof close
      const close = () => {
        try { backdrop.hidden = true; } catch {}
        try { backdrop.style.display = "none"; } catch {} // extra safety
        window.__scaAuthRetry = null;
      };

      // Show/hide uses "hidden"; also ensure display resets when shown
      const open = () => {
        try { backdrop.style.display = "flex"; } catch {}
        backdrop.hidden = false;
      };

      // Close on backdrop click
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close();
      });

      // Close on X / Not now
      backdrop.querySelector(".scaAuthClose")?.addEventListener("click", close);
      backdrop.querySelector("#scaAuthDismissBtn")?.addEventListener("click", close);

      // Log in again action
      backdrop.querySelector("#scaAuthLoginBtn")?.addEventListener("click", () => {
        if (!openSquarespaceAccountOverlay()) {
          alert("Please use the Account / Log in button in the site header.");
        }
      });

      // Expose open/close hooks on the backdrop for the show() function
      backdrop.__scaOpen = open;
      backdrop.__scaClose = close;

      backdrop.querySelector("#scaAuthRetryBtn").addEventListener("click", async () => {
        const fn = window.__scaAuthRetry;
        if (!fn) return;
        try {
          await fn();
          close();
        } catch (e) {
          console.warn("Retry failed:", e?.message || e);
        }
      });
    }

    function isAuthError(err) {
  const msg = String(err?.message || err || "");

  // Common auth/session strings
  if (
    msg.includes("No session") ||
    msg.includes("Session expired") ||
    msg.includes("Unauthorized") ||
    msg.includes("Invalid token") ||
    msg.includes("Not authenticated") ||
    msg.includes("cookies missing") ||
    msg.includes("Profile request failed") // ✅ Chrome case
  ) return true;

  // Catch HTTP-ish text patterns
  if (/\b401\b/.test(msg) || /\b403\b/.test(msg)) return true;

  return false;
}


    window.SCAAuthUI = {
  isAuthError,
  show(reasonHtml) {
    // rate-limit so we don’t spam modals on rapid clicks
    window.__scaAuthModalLast = window.__scaAuthModalLast || 0;
    if (Date.now() - window.__scaAuthModalLast < 4000) return;
    window.__scaAuthModalLast = Date.now();

    ensureModal();

    const backdrop = document.getElementById("scaAuthModalBackdrop");
    const body = document.getElementById("scaAuthBody");
    if (body && reasonHtml) body.innerHTML = reasonHtml;

    // Retry removed
    window.__scaAuthRetry = null;

    // ✅ Open modal (supports both basic + "bulletproof" versions)
    if (backdrop?.__scaOpen) {
      backdrop.__scaOpen();
    } else {
      try { backdrop.style.display = "flex"; } catch {}
      backdrop.hidden = false;
    }
  },
};

  })();

  /* =========================================================
     Boot
     ========================================================= */

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      forceScrollTopOnce();
    } catch {}

    initializeSelect2();

    loadData();
    initializeDisplaySettings();

    await loadProgressOnce();

    const filterCasesDebounced = debounce(filterCases, 120);

    document.getElementById("toggleDisplayType")?.addEventListener("change", filterCasesDebounced);
    document.getElementById("toggleFirstOnly")?.addEventListener("change", filterCasesDebounced);
    document.getElementById("toggleDifficultyRating")?.addEventListener("change", filterCasesDebounced);
    document.getElementById("toggleVideoOnly")?.addEventListener("change", filterCasesDebounced);

    document.getElementById("btnClinicalTopic")?.addEventListener("click", () => toggleSort("Clinical Topic"));
    document.getElementById("btnDomain")?.addEventListener("click", () => toggleSort("Domain"));
  });

  /* =========================================================
     Scroll helper (Squarespace-friendly)
     ========================================================= */

  function forceScrollTopOnce() {
    requestAnimationFrame(() => {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => window.scrollTo(0, 0), { timeout: 600 });
      } else {
        setTimeout(() => window.scrollTo(0, 0), 200);
      }
    });
  }

  /* =========================================================
     Utility
     ========================================================= */

  function debounce(fn, ms = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function safeJsonParse(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /* =========================================================
     Select2
     ========================================================= */

  function initializeSelect2() {
    if (!window.jQuery || !jQuery.fn?.select2) return;

    $("#themesSelector")
      .select2({
        placeholder: "Start typing to search using key words",
        allowClear: true,
        minimumInputLength: 1,
        closeOnSelect: true,
      })
      .on("select2:select select2:unselect", debounce(filterCases, 120));
  }

  /* =========================================================
     Completion glue (completed only)
     ========================================================= */

  window.scaCompletedSet = window.scaCompletedSet || new Set();

  window.applyCompletedStyles =
    window.applyCompletedStyles ||
    function applyCompletedStyles() {
      document.querySelectorAll(".case-entry[data-case-id]").forEach((el) => {
        const id = String(el.dataset.caseId || "");
        el.classList.toggle("is-completed", window.scaCompletedSet.has(id));
      });
    };

  // ✅ Safari-safe: store on window so re-execution doesn’t crash
  window.__scaProgressLoaded = window.__scaProgressLoaded || false;

  function waitForSCAProgress(maxMs = 5000, intervalMs = 100) {
    return new Promise((resolve) => {
      const start = Date.now();
      const t = setInterval(() => {
        if (window.SCAProgress?.init) {
          clearInterval(t);
          resolve(true);
          return;
        }
        if (Date.now() - start > maxMs) {
          clearInterval(t);
          resolve(false);
        }
      }, intervalMs);
    });
  }

  async function loadProgressOnce() {
    if (window.__scaProgressLoaded) return;
    window.__scaProgressLoaded = true;

    const ok = await waitForSCAProgress();
    if (!ok) return;

    try {
      const { progress } = await window.SCAProgress.init();
      window.scaCompletedSet = new Set((progress?.completed || []).map(String));
      window.applyCompletedStyles?.();
    } catch {
      // silent
    }
  }

  /* =========================================================
     Data load: Stale-while-revalidate local cache
     ========================================================= */

  const CASES_CACHE_KEY = "airtableData";

  function loadData() {
    const cached = safeJsonParse(localStorage.getItem(CASES_CACHE_KEY));

    if (cached && Array.isArray(cached.data) && cached.data.length) {
      processAirtableData(cached.data);
    } else {
      const container = document.getElementById("caseList");
      if (container) container.innerHTML = `<div style="padding:14px;color:#6c7485;">Loading cases…</div>`;
    }

    refreshCasesInBackground(cached);
  }

  function signatureOf(records) {
    try {
      const n = records.length;
      const first = records[0]?.id || "";
      const mid = records[Math.floor(n / 2)]?.id || "";
      const last = records[n - 1]?.id || "";
      return `${n}|${first}|${mid}|${last}`;
    } catch {
      return String(Date.now());
    }
  }

  function writeCasesCache(records, sig) {
    try {
      localStorage.setItem(
        CASES_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          sig,
          data: records,
        })
      );
    } catch {}
  }

  function refreshCasesInBackground(cached) {
    const url = "https://scarevision-airtable-proxy.vercel.app/api/cases-list-data";

    fetch(url, { method: "GET" })
      .then((r) => r.json())
      .then((data) => {
        const records = data?.records;
        if (!Array.isArray(records)) throw new Error("Invalid cases payload");

        const nextSig = signatureOf(records);
        const prevSig = cached?.sig || null;

        if (nextSig !== prevSig) {
          writeCasesCache(records, nextSig);
          processAirtableData(records);
        }
      })
      .catch(() => {
        // silent if cache exists
      });
  }

  /* =========================================================
     Process + filters
     ========================================================= */

  function processAirtableData(records) {
    window.allCases = records;
    populateFilters(records);
    filterCases();
  }

  function populateFilters(records) {
    if (!window.jQuery) return;

    const themes = new Set();
    records.forEach((r) => r.fields?.["Themes"]?.forEach((t) => themes.add(t)));

    const sel = $("#themesSelector");
    sel.empty();
    themes.forEach((t) => sel.append(`<option value="${t}">${t}</option>`));
    sel.trigger("change");
  }

  function initializeDisplaySettings() {
    const params = new URLSearchParams(window.location.search);

    const showDiagnosis = params.has("showDiagnosis") ? params.get("showDiagnosis") === "true" : true;
    const elShow = document.getElementById("toggleDisplayType");
    if (elShow) elShow.checked = showDiagnosis;

    const sortParam = params.get("sortType");
    const isDomain = sortParam ? sortParam === "Domain" : true;
    document.getElementById("btnClinicalTopic")?.classList.toggle("active", !isDomain);
    document.getElementById("btnDomain")?.classList.toggle("active", isDomain);

    if (params.has("videoOnly")) {
      const v = params.get("videoOnly");
      const isOn = v === "true" || v === "1" || v === "";
      const el = document.getElementById("toggleVideoOnly");
      if (el) el.checked = isOn;
    }

    filterCases();
  }

  function toggleSort(type) {
    const isDomain = type === "Domain";
    document.getElementById("btnClinicalTopic")?.classList.toggle("active", !isDomain);
    document.getElementById("btnDomain")?.classList.toggle("active", isDomain);
    filterCases();
  }

  function filterCases() {
    const themes = window.jQuery ? $("#themesSelector").val() || [] : [];

    let filtered = (window.allCases || []).filter((r) => {
      const recThemes = r.fields?.["Themes"] || [];
      return themes.every((t) => recThemes.includes(t));
    });

    const videoOnly = !!document.getElementById("toggleVideoOnly")?.checked;
    if (videoOnly) filtered = filtered.filter((r) => !!r.fields?.["Video Link"]);

    displayCases(filtered);
  }

  /* =========================================================
     Render: Lazy-build panels
     ========================================================= */

  window.__scaResizeBound = window.__scaResizeBound || false;

  function bindResizeOnce() {
    if (window.__scaResizeBound) return;
    window.__scaResizeBound = true;

    window.addEventListener("resize", () => {
      document.querySelectorAll(".panel").forEach((p) => {
        if (p.previousElementSibling?.classList.contains("active")) {
          p.style.maxHeight = `${p.scrollHeight}px`;
        }
      });
    });
  }

  function displayCases(cases) {
    bindResizeOnce();

    const sortMethod = document.getElementById("btnDomain")?.classList.contains("active") ? "Domain" : "Clinical Topic";

    const showDiagnosis = !!document.getElementById("toggleDisplayType")?.checked;
    const showDiff = !!document.getElementById("toggleDifficultyRating")?.checked;
    const firstOnly = !!document.getElementById("toggleFirstOnly")?.checked;

    const container = document.getElementById("caseList");
    if (!container) return;
    container.innerHTML = "";

    const groupField = sortMethod === "Clinical Topic" ? "Clinical Topics" : "Domain";

    const grouped = cases.reduce((acc, rec) => {
      const items = rec.fields?.[groupField] || [];
      const toUse = firstOnly ? [items[0]] : items;
      toUse.forEach((item) => {
        if (!item) return;
        (acc[item] ||= []).push(rec);
      });
      return acc;
    }, {});

    const frag = document.createDocumentFragment();

    Object.keys(grouped)
      .sort()
      .forEach((group) => {
        const header = document.createElement("button");
        header.className = "accordion";
        header.textContent = group;

        const panel = document.createElement("div");
        panel.className = "panel";
        panel.dataset.built = "false";

        header.addEventListener("click", () => {
          const open = header.classList.toggle("active");

          if (open && panel.dataset.built === "false") {
            buildPanel(panel, grouped[group], { showDiagnosis, showDiff });
            panel.dataset.built = "true";
            window.applyCompletedStyles?.();
          }

          panel.style.maxHeight = open ? `${panel.scrollHeight}px` : null;
        });

        frag.appendChild(header);
        frag.appendChild(panel);
      });

    container.appendChild(frag);
  }

  function buildPanel(panel, records, opts) {
    const { showDiagnosis, showDiff } = opts;
    const linkField = showDiagnosis ? "Link" : "Link-nt";

    records.sort((a, b) => {
      const textA = showDiagnosis ? a.fields?.["Name"] : a.fields?.["Presenting Complaint"];
      const textB = showDiagnosis ? b.fields?.["Name"] : b.fields?.["Presenting Complaint"];
      return String(textA || "").localeCompare(String(textB || ""));
    });

    const frag = document.createDocumentFragment();

    for (const record of records) {
      const div = document.createElement("div");
      div.className = "case-entry";

      const rawCaseId =
        record.fields?.["Case ID"] ??
        record.fields?.["CaseID"] ??
        record.fields?.["Case Number"] ??
        record.fields?.["Case"];

      const trimmed = String(rawCaseId ?? "").trim();
      const n = Number(trimmed);
      if (Number.isFinite(n)) div.dataset.caseId = String(n);

      const anchor = document.createElement("a");
      anchor.href = record.fields?.[linkField];
      anchor.target = "_blank";
      anchor.textContent = showDiagnosis ? record.fields?.["Name"] : record.fields?.["Presenting Complaint"];
      div.appendChild(anchor);

      const actions = document.createElement("div");
      actions.className = "case-actions";

      if (record.fields?.["Video Link"]) {
        const va = document.createElement("a");
        va.href = record.fields["Video Link"];
        va.target = "_blank";
        va.className = "video-link";
        const vi = document.createElement("i");
        vi.className = "fa-sharp fa-light fa-video video-icon";
        va.addEventListener("mouseenter", () => vi.classList.replace("fa-light", "fa-solid"));
        va.addEventListener("mouseleave", () => vi.classList.replace("fa-solid", "fa-light"));
        va.appendChild(vi);
        actions.appendChild(va);
      }

      if (showDiff) {
        const sa = document.createElement("a");
        sa.href = record.fields?.[linkField];
        sa.target = "_blank";
        const diff = parseInt(record.fields?.["Difficulty"] || "0", 10);
        for (let i = 1; i <= 3; i++) {
          const star = document.createElement("i");
          star.className = i <= diff ? "fa-solid fa-star star-icon" : "fa-regular fa-star star-icon";
          sa.appendChild(star);
        }
        actions.appendChild(sa);
      }

      div.appendChild(actions);
      frag.appendChild(div);
    }

    panel.appendChild(frag);
  }

  /* =========================================================
     Progress live sync (de-duped)
     ========================================================= */

  const scaProgressChannel = "BroadcastChannel" in window ? new BroadcastChannel("sca-progress") : null;

  function scaRefreshProgress() {
    if (!window.SCAProgress?.getProgress) return;
    return window.SCAProgress.getProgress()
      .then(({ completed }) => {
        window.scaCompletedSet = new Set((completed || []).map(String));
        window.applyCompletedStyles?.();
      })
      .catch(() => {});
  }

  if (scaProgressChannel) {
    scaProgressChannel.onmessage = (e) => {
      if (e?.data?.type === "progress-updated") scaRefreshProgress();
    };
  }

  window.addEventListener("storage", (e) => {
    if (e.key === "sca-progress-updated") scaRefreshProgress();
  });

  window.addEventListener("focus", scaRefreshProgress);
  window.addEventListener("pageshow", scaRefreshProgress);

  /* =========================================================
     Toggle completion by clicking the checkbox gutter
     + NEW: auth popup on session/auth failure
     ========================================================= */

  document.addEventListener("click", async (e) => {
    const entry = e.target.closest(".case-entry");
    if (!entry) return;

    if (e.target.closest("a")) return;

    const x = e.clientX - entry.getBoundingClientRect().left;
    if (x > 45) return;

    e.preventDefault();
    e.stopPropagation();

    const caseId = entry.dataset.caseId;
    if (!caseId || !window.SCAProgress?.setComplete) return;

    const isCompleted = entry.classList.contains("is-completed");

    // optimistic UI update
    entry.classList.toggle("is-completed", !isCompleted);
    window.scaCompletedSet?.[isCompleted ? "delete" : "add"](String(caseId));

    const rollback = () => {
      entry.classList.toggle("is-completed", isCompleted);
      window.scaCompletedSet?.[isCompleted ? "add" : "delete"](String(caseId));
    };

    const attemptSave = async () => {
      await window.SCAProgress.setComplete(caseId, !isCompleted);
      // if saved, notify other tabs/pages
      try {
        localStorage.setItem("sca-progress-updated", String(Date.now()));
      } catch {}
      try {
        scaProgressChannel?.postMessage?.({ type: "progress-updated" });
      } catch {}
    };

    try {
      await attemptSave();
    } catch (err) {
      try {
        await window.SCAProgress.init();
        await attemptSave();
      } catch (err2) {
        rollback();

        // ✅ show login modal only for auth/session-related failures
        const eMsg = err2 || err;
        if (window.SCAAuthUI?.isAuthError?.(eMsg)) {
          window.SCAAuthUI.show(
  "To save your progress, please <b>log in again</b> to confirm your account."
);

        }

        console.warn("Failed to save completion after retry:", err2 || err);
      }
    }
  });
})();
