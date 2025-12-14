// sca-cases-list-v3.js
// V3: stale-while-revalidate local cache + background refresh + lazy panel rendering
//     + cleaner scroll-to-top fix + debounce filters + bind resize once + de-duped listeners

document.addEventListener("DOMContentLoaded", async () => {
  // ✅ Cleaner Squarespace scroll-restoration fix (less janky than repeated scrollTo)
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    forceScrollTopOnce();
  } catch {}

  initializeSelect2();

  // ✅ Load cases: instant from cache (if any), then refresh in background
  loadData();

  initializeDisplaySettings();

  // ✅ Load completion progress once
  await loadProgressOnce();

  // ✅ Debounced filter wiring
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

let __scaProgressLoaded = false;

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
  if (__scaProgressLoaded) return;
  __scaProgressLoaded = true;

  const ok = await waitForSCAProgress();
  if (!ok) return;

  try {
    const { progress } = await window.SCAProgress.init();
    window.scaCompletedSet = new Set((progress?.completed || []).map(String));
    window.applyCompletedStyles?.();
  } catch {}
}

/* =========================================================
   Data load: Stale-while-revalidate local cache
   ========================================================= */

const CASES_CACHE_KEY = "airtableData"; // reuse your existing key for continuity

function loadData() {
  const cached = safeJsonParse(localStorage.getItem(CASES_CACHE_KEY));

  // 1) Instant render from cache (even if old)
  if (cached && Array.isArray(cached.data) && cached.data.length) {
    processAirtableData(cached.data);
  } else {
    const container = document.getElementById("caseList");
    if (container) container.innerHTML = `<div style="padding:14px;color:#6c7485;">Loading cases…</div>`;
  }

  // 2) Always refresh in the background
  refreshCasesInBackground(cached);
}

function signatureOf(records) {
  // lightweight change detector
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

      // Only re-render if changed
      if (nextSig !== prevSig) {
        writeCasesCache(records, nextSig);
        processAirtableData(records);
      } else {
        // Keep cache warm (optional)
        // (no UI update needed)
      }
    })
    .catch(() => {
      // Silent failure if cache exists
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
  if (videoOnly) {
    filtered = filtered.filter((r) => !!r.fields?.["Video Link"]);
  }

  displayCases(filtered);
}

/* =========================================================
   Render: Lazy-build panels (big UX win for 350+ cases)
   ========================================================= */

let __scaResizeBound = false;

function bindResizeOnce() {
  if (__scaResizeBound) return;
  __scaResizeBound = true;

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

  // Group records
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

        // ✅ Build panel only once, when opened
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

  // (Completed styles are applied when panels are built/opened)
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
      record.fields?.["Case ID"] ?? record.fields?.["CaseID"] ?? record.fields?.["Case Number"] ?? record.fields?.["Case"];

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
   ========================================================= */

document.addEventListener("click", async (e) => {
  const entry = e.target.closest(".case-entry");
  if (!entry) return;

  // don't interfere with links
  if (e.target.closest("a")) return;

  // only toggle if click is inside the left checkbox gutter
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

  try {
    await window.SCAProgress.setComplete(caseId, !isCompleted);
  } catch (err) {
    try {
      await window.SCAProgress.init();
      await window.SCAProgress.setComplete(caseId, !isCompleted);
    } catch (err2) {
      // rollback only if retry fails
      entry.classList.toggle("is-completed", isCompleted);
      window.scaCompletedSet?.[isCompleted ? "add" : "delete"](String(caseId));
      console.warn("Failed to save completion after retry:", err2 || err);
    }
  }
});
