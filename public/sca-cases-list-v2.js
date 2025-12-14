// sca-cases-list-v2.js
document.addEventListener('DOMContentLoaded', async () => {
  // Start at top (your existing behaviour)
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    setTimeout(() => window.scrollTo(0, 0), 50);
    setTimeout(() => window.scrollTo(0, 0), 250);
  } catch {}

  initializeSelect2();
  loadData();
  initializeDisplaySettings();

  // Load completion progress once
  await loadProgressOnce();

  // Debounced filter to avoid heavy re-renders while Select2/UI changes
  const filterCasesDebounced = debounce(filterCases, 120);

  document.getElementById('toggleDisplayType')?.addEventListener('change', filterCasesDebounced);
  document.getElementById('toggleFirstOnly')?.addEventListener('change', filterCasesDebounced);
  document.getElementById('toggleDifficultyRating')?.addEventListener('change', filterCasesDebounced);
  document.getElementById('toggleVideoOnly')?.addEventListener('change', filterCasesDebounced);

  document.getElementById('btnClinicalTopic')?.addEventListener('click', () => toggleSort('Clinical Topic'));
  document.getElementById('btnDomain')?.addEventListener('click', () => toggleSort('Domain'));
});

function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function initializeSelect2() {
  if (!window.jQuery || !jQuery.fn?.select2) return;

  $('#themesSelector').select2({
    placeholder: "Start typing to search using key words",
    allowClear: true,
    minimumInputLength: 1,
    closeOnSelect: true,
  }).on('select2:select select2:unselect', debounce(filterCases, 120));
}

/* =========================================================
   Completion glue (completed only; no flagged yet)
   ========================================================= */

window.scaCompletedSet = window.scaCompletedSet || new Set();

window.applyCompletedStyles = window.applyCompletedStyles || function applyCompletedStyles() {
  document.querySelectorAll('.case-entry[data-case-id]').forEach(el => {
    const id = String(el.dataset.caseId || '');
    el.classList.toggle('is-completed', window.scaCompletedSet.has(id));
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
    window.applyCompletedStyles();
  } catch {}
}

/* =========================================================
   Data load: cache + Vercel API (NOT Airtable direct)
   ========================================================= */

function loadData() {
  const dataKey = 'airtableData'; // keep same key so existing cache still works
  const cached = safeJsonParse(localStorage.getItem(dataKey));

  if (cached && cached.timestamp && Date.now() - cached.timestamp < 3600000 && Array.isArray(cached.data)) {
    processAirtableData(cached.data);
  } else {
    fetchDataFromVercel();
  }
}

function safeJsonParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function fetchDataFromVercel() {
  const url = "https://scarevision-airtable-proxy.vercel.app/api/cases-list-data";

  fetch(url, { method: "GET" })
    .then(r => r.json())
    .then(data => {
      const records = data?.records;
      if (!Array.isArray(records)) throw new Error("Invalid cases payload");
      finalizeData(records);
    })
    .catch(err => console.error('Error fetching cases list data:', err));
}

function finalizeData(records) {
  try {
    localStorage.setItem('airtableData', JSON.stringify({
      timestamp: Date.now(),
      data: records
    }));
  } catch {}
  processAirtableData(records);
}

function processAirtableData(records) {
  window.allCases = records;
  populateFilters(records);
  filterCases();
}

function populateFilters(records) {
  const themes = new Set();
  records.forEach(r => r.fields?.['Themes']?.forEach(t => themes.add(t)));

  if (!window.jQuery) return;
  const sel = $('#themesSelector');
  sel.empty();
  themes.forEach(t => sel.append(`<option value="${t}">${t}</option>`));
  sel.trigger('change');
}

function initializeDisplaySettings() {
  const params = new URLSearchParams(window.location.search);

  const showDiagnosis = params.has('showDiagnosis')
    ? params.get('showDiagnosis') === 'true'
    : true;
  const elShow = document.getElementById('toggleDisplayType');
  if (elShow) elShow.checked = showDiagnosis;

  const sortParam = params.get('sortType');
  const isDomain = sortParam ? sortParam === 'Domain' : true;
  document.getElementById('btnClinicalTopic')?.classList.toggle('active', !isDomain);
  document.getElementById('btnDomain')?.classList.toggle('active', isDomain);

  if (params.has('videoOnly')) {
    const v = params.get('videoOnly');
    const isOn = v === 'true' || v === '1' || v === '';
    const el = document.getElementById('toggleVideoOnly');
    if (el) el.checked = isOn;
  }

  filterCases();
}

function toggleSort(type) {
  const isDomain = (type === 'Domain');
  document.getElementById('btnClinicalTopic')?.classList.toggle('active', !isDomain);
  document.getElementById('btnDomain')?.classList.toggle('active', isDomain);
  filterCases();
}

function filterCases() {
  const themes = (window.jQuery ? ($('#themesSelector').val() || []) : []);
  let filtered = (window.allCases || []).filter(r => {
    const recThemes = r.fields?.['Themes'] || [];
    return themes.every(t => recThemes.includes(t));
  });

  const videoOnlyEl = document.getElementById('toggleVideoOnly');
  if (videoOnlyEl?.checked) {
    filtered = filtered.filter(r => !!r.fields?.['Video Link']);
  }

  displayCases(filtered);
}

/* =========================================================
   Render (fix: resize listener bound once)
   ========================================================= */

let __scaResizeBound = false;

function bindResizeOnce() {
  if (__scaResizeBound) return;
  __scaResizeBound = true;

  window.addEventListener('resize', () => {
    document.querySelectorAll('.panel').forEach(p => {
      if (p.previousElementSibling?.classList.contains('active')) {
        p.style.maxHeight = `${p.scrollHeight}px`;
      }
    });
  });
}

function displayCases(cases) {
  bindResizeOnce();

  const sortMethod = document.getElementById('btnDomain')?.classList.contains('active')
    ? 'Domain'
    : 'Clinical Topic';

  const showDiagnosis = !!document.getElementById('toggleDisplayType')?.checked;
  const showDiff = !!document.getElementById('toggleDifficultyRating')?.checked;
  const firstOnly = !!document.getElementById('toggleFirstOnly')?.checked;

  const container = document.getElementById('caseList');
  if (!container) return;
  container.innerHTML = '';

  const groupField = sortMethod === 'Clinical Topic' ? 'Clinical Topics' : 'Domain';

  const grouped = cases.reduce((acc, rec) => {
    const items = rec.fields?.[groupField] || [];
    const toUse = firstOnly ? [items[0]] : items;
    toUse.forEach(item => {
      if (!item) return;
      (acc[item] ||= []).push(rec);
    });
    return acc;
  }, {});

  const frag = document.createDocumentFragment();

  Object.keys(grouped).sort().forEach(group => {
    const header = document.createElement('button');
    header.className = 'accordion';
    header.textContent = group;

    const panel = document.createElement('div');
    panel.className = 'panel';

    grouped[group].sort((a, b) => {
      const textA = showDiagnosis ? a.fields?.['Name'] : a.fields?.['Presenting Complaint'];
      const textB = showDiagnosis ? b.fields?.['Name'] : b.fields?.['Presenting Complaint'];
      return String(textA || '').localeCompare(String(textB || ''));
    }).forEach(record => {
      const div = document.createElement('div');
      div.className = 'case-entry';

      const rawCaseId =
        record.fields?.['Case ID'] ??
        record.fields?.['CaseID'] ??
        record.fields?.['Case Number'] ??
        record.fields?.['Case'];

      const trimmed = String(rawCaseId ?? '').trim();
      const n = Number(trimmed);
      if (Number.isFinite(n)) div.dataset.caseId = String(n);

      const linkField = showDiagnosis ? 'Link' : 'Link-nt';
      const anchor = document.createElement('a');
      anchor.href = record.fields?.[linkField];
      anchor.target = '_blank';
      anchor.textContent = showDiagnosis ? record.fields?.['Name'] : record.fields?.['Presenting Complaint'];
      div.appendChild(anchor);

      const actions = document.createElement('div');
      actions.className = 'case-actions';

      if (record.fields?.['Video Link']) {
        const va = document.createElement('a');
        va.href = record.fields['Video Link'];
        va.target = '_blank';
        va.className = 'video-link';
        const vi = document.createElement('i');
        vi.className = 'fa-sharp fa-light fa-video video-icon';
        va.addEventListener('mouseenter', () => vi.classList.replace('fa-light','fa-solid'));
        va.addEventListener('mouseleave', () => vi.classList.replace('fa-solid','fa-light'));
        va.appendChild(vi);
        actions.appendChild(va);
      }

      if (showDiff) {
        const sa = document.createElement('a');
        sa.href = record.fields?.[linkField];
        sa.target = '_blank';
        const diff = parseInt(record.fields?.['Difficulty'] || '0', 10);
        for (let i = 1; i <= 3; i++) {
          const star = document.createElement('i');
          star.className = i <= diff ? 'fa-solid fa-star star-icon' : 'fa-regular fa-star star-icon';
          sa.appendChild(star);
        }
        actions.appendChild(sa);
      }

      div.appendChild(actions);
      panel.appendChild(div);
    });

    header.addEventListener('click', () => {
      const open = header.classList.toggle('active');
      panel.style.maxHeight = open ? `${panel.scrollHeight}px` : null;
    });

    frag.appendChild(header);
    frag.appendChild(panel);
  });

  container.appendChild(frag);
  window.applyCompletedStyles?.();
}

/* =========================================================
   Completion toggling + live sync (kept, but de-duped)
   ========================================================= */

// ✅ Live sync channel
const scaProgressChannel = ("BroadcastChannel" in window)
  ? new BroadcastChannel("sca-progress")
  : null;

function scaRefreshProgress() {
  if (!window.SCAProgress?.getProgress) return;
  return window.SCAProgress.getProgress().then(({ completed }) => {
    window.scaCompletedSet = new Set((completed || []).map(String));
    window.applyCompletedStyles?.();
  }).catch(() => {});
}

if (scaProgressChannel) {
  scaProgressChannel.onmessage = (e) => {
    if (e?.data?.type === "progress-updated") scaRefreshProgress();
  };
}

// Fallback: storage event (single listener)
window.addEventListener("storage", (e) => {
  if (e.key === "sca-progress-updated") scaRefreshProgress();
});

window.addEventListener("focus", scaRefreshProgress);
window.addEventListener("pageshow", scaRefreshProgress);

// ✅ Toggle completion by clicking checkbox gutter
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
