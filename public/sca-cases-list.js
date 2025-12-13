// sca-cases-list.js
// Ensure the code runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    // ✅ NEW: always start at the top of the page
    // (prevents browser/Squarespace restoring scroll to the bottom)
    try {
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        window.scrollTo(0, 0);
        // double-tap after layout settles (accordion/grid/Select2 can shift height)
        setTimeout(() => window.scrollTo(0, 0), 50);
        setTimeout(() => window.scrollTo(0, 0), 250);
    } catch {}

    initializeSelect2();
    loadData();
    initializeDisplaySettings();

    // ✅ Load completion progress once (robust to script load order)
    await loadProgressOnce();

    // Re-run filters whenever any control changes:
    document.getElementById('toggleDisplayType')
        .addEventListener('change', filterCases);
    document.getElementById('toggleFirstOnly')
        .addEventListener('change', filterCases);
    document.getElementById('toggleDifficultyRating')
        .addEventListener('change', filterCases);
    document.getElementById('toggleVideoOnly')
        .addEventListener('change', filterCases);
    document.getElementById('btnClinicalTopic')
        .addEventListener('click', () => toggleSort('Clinical Topic'));
    document.getElementById('btnDomain')
        .addEventListener('click', () => toggleSort('Domain'));
});

function initializeSelect2() {
    $('#themesSelector').select2({
        placeholder: "Start typing to search using key words",
        allowClear: true,
        minimumInputLength: 1,
        closeOnSelect: true,
    }).on('select2:select select2:unselect', filterCases);
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
    if (!ok) {
        console.warn("SCAProgress not available (sca-progress.js not loaded or blocked).");
        return;
    }

    try {
        const { progress } = await window.SCAProgress.init();
        window.scaCompletedSet = new Set((progress?.completed || []).map(String));
        window.applyCompletedStyles();
    } catch (e) {
        console.warn("Could not load completion progress:", e?.message || e);
    }
}

/* =========================================================
   Airtable caching + fetch
   ========================================================= */

function loadData() {
    const dataKey = 'airtableData';
    const cached = JSON.parse(localStorage.getItem(dataKey));
    if (cached && Date.now() - cached.timestamp < 3600000) {
        console.log('Using cached data');
        processAirtableData(cached.data);
    } else {
        console.log('Fetching new data from Airtable');
        fetchData();
    }
}

function fetchData() {
    const baseId = 'appcfY32cRVRuUJ9i';
    const tableId = 'tbl0zASOWTNNXGayL';
   const apiKey = 'patIaCiSU4KaGocOw.ca221afed9b6c4bc9a9c2cdad23c2bf95c871886912cb250ea4df3870bd6770e'; // <— your API key
    let allRecords = [], offset = '';

    (function nextPage() {
        const url = `https://api.airtable.com/v0/${baseId}/${tableId}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
        fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
            .then(r => r.json())
            .then(data => {
                allRecords.push(...data.records);
                if (data.offset) {
                    offset = data.offset;
                    nextPage();
                } else {
                    finalizeData(allRecords);
                }
            })
            .catch(err => console.error('Error fetching data:', err));
    })();
}

function finalizeData(records) {
    localStorage.setItem('airtableData', JSON.stringify({
        timestamp: Date.now(),
        data: records
    }));
    processAirtableData(records);
}

function processAirtableData(records) {
    window.allCases = records;
    populateFilters(records);
    filterCases();
}

function populateFilters(records) {
    const themes = new Set();
    records.forEach(r => r.fields['Themes']?.forEach(t => themes.add(t)));

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
    document.getElementById('toggleDisplayType').checked = showDiagnosis;

    const sortParam = params.get('sortType');
    const isDomain = sortParam ? sortParam === 'Domain' : true;
    document.getElementById('btnClinicalTopic')
        .classList.toggle('active', !isDomain);
    document.getElementById('btnDomain')
        .classList.toggle('active', isDomain);

    if (params.has('videoOnly')) {
        const v = params.get('videoOnly');
        const isOn = v === 'true' || v === '1' || v === '';
        document.getElementById('toggleVideoOnly').checked = isOn;
    }

    filterCases();
}

function toggleSort(type) {
    const isDomain = (type === 'Domain');
    document.getElementById('btnClinicalTopic')
        .classList.toggle('active', !isDomain);
    document.getElementById('btnDomain')
        .classList.toggle('active', isDomain);
    filterCases();
}

function filterCases() {
    const themes = $('#themesSelector').val() || [];
    let filtered = (window.allCases || []).filter(r => {
        const recThemes = r.fields['Themes'] || [];
        return themes.every(t => recThemes.includes(t));
    });

    if (document.getElementById('toggleVideoOnly').checked) {
        filtered = filtered.filter(r => !!r.fields['Video Link']);
    }

    displayCases(filtered);
}

function displayCases(cases) {
    const sortMethod = document.getElementById('btnDomain').classList.contains('active')
        ? 'Domain'
        : 'Clinical Topic';

    const showDiagnosis = document.getElementById('toggleDisplayType').checked;
    const showDiff = document.getElementById('toggleDifficultyRating').checked;
    const firstOnly = document.getElementById('toggleFirstOnly').checked;

    const container = document.getElementById('caseList');
    container.innerHTML = '';

    const groupField = sortMethod === 'Clinical Topic'
        ? 'Clinical Topics'
        : 'Domain';
    const grouped = cases.reduce((acc, rec) => {
        const items = rec.fields[groupField] || [];
        const toUse = firstOnly ? [items[0]] : items;
        toUse.forEach(item => {
            if (!acc[item]) acc[item] = [];
            acc[item].push(rec);
        });
        return acc;
    }, {});

    Object.keys(grouped).sort().forEach(group => {
        const header = document.createElement('button');
        header.className = 'accordion';
        header.textContent = group;

        const panel = document.createElement('div');
        panel.className = 'panel';

        grouped[group].sort((a, b) => {
            const textA = showDiagnosis ? a.fields['Name'] : a.fields['Presenting Complaint'];
            const textB = showDiagnosis ? b.fields['Name'] : b.fields['Presenting Complaint'];
            return textA.localeCompare(textB);
        }).forEach(record => {
            const div = document.createElement('div');
            div.className = 'case-entry';

            const rawCaseId =
                record.fields['Case ID'] ??
                record.fields['CaseID'] ??
                record.fields['Case Number'] ??
                record.fields['Case'];

            const trimmed = String(rawCaseId ?? '').trim();
            const n = Number(trimmed);
            if (Number.isFinite(n)) {
                div.dataset.caseId = String(n);
            }

            const linkField = showDiagnosis ? 'Link' : 'Link-nt';
            const anchor = document.createElement('a');
            anchor.href = record.fields[linkField];
            anchor.target = '_blank';
            anchor.textContent = showDiagnosis ? record.fields['Name'] : record.fields['Presenting Complaint'];
            div.appendChild(anchor);

            const actions = document.createElement('div');
            actions.className = 'case-actions';

            if (record.fields['Video Link']) {
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
                sa.href = record.fields[linkField];
                sa.target = '_blank';
                const diff = parseInt(record.fields['Difficulty'] || '0', 10);
                for (let i = 1; i <= 3; i++) {
                    const star = document.createElement('i');
                    star.className = i <= diff
                        ? 'fa-solid fa-star star-icon'
                        : 'fa-regular fa-star star-icon';
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

        container.appendChild(header);
        container.appendChild(panel);
    });

    window.addEventListener('resize', () => {
        document.querySelectorAll('.panel').forEach(p => {
            if (p.previousElementSibling.classList.contains('active')) {
                p.style.maxHeight = `${p.scrollHeight}px`;
            }
        });
    });

    window.applyCompletedStyles();
}

// Filter grouping helper
function groupCasesByField(cases, field) {
    const firstOnly = document.getElementById('toggleFirstOnly').checked;
    return cases.reduce((acc, rec) => {
        const items = rec.fields[field] || [];
        const toUse = firstOnly ? [items[0]] : items;
        toUse.forEach(item => {
            if (!acc[item]) acc[item] = [];
            acc[item].push(rec);
        });
        return acc;
    }, {});
}

// Manual data refresh
function manualRefresh() {
    console.log('Manual refresh requested');
    localStorage.removeItem('airtableData');
    fetchData();
}
// 🔁 Listen for progress updates from other pages
window.addEventListener("storage", async (e) => {
  if (e.key !== "sca-progress-updated") return;
  if (!window.SCAProgress?.getProgress) return;

  try {
    const { completed } = await window.SCAProgress.getProgress();
    window.scaCompletedSet = new Set((completed || []).map(String));
    window.applyCompletedStyles();
  } catch (err) {
    console.warn("Could not refresh progress:", err);
  }
});
// ✅ Live sync channel (more reliable than storage)
const scaProgressChannel = ("BroadcastChannel" in window)
  ? new BroadcastChannel("sca-progress")
  : null;

function scaRefreshProgress() {
  if (!window.SCAProgress?.getProgress) return;
  return window.SCAProgress.getProgress().then(({ completed }) => {
    window.scaCompletedSet = new Set((completed || []).map(String));
    window.applyCompletedStyles();
  }).catch(() => {});
}

// Receive live updates while this page is open
if (scaProgressChannel) {
  scaProgressChannel.onmessage = (e) => {
    if (e?.data?.type === "progress-updated") scaRefreshProgress();
  };
}

// Fallback: storage event (works in many cases)
window.addEventListener("storage", (e) => {
  if (e.key === "sca-progress-updated") scaRefreshProgress();
});

// ✅ Also refresh whenever you return to the tab/page (covers same-tab navigation)
window.addEventListener("focus", scaRefreshProgress);
window.addEventListener("pageshow", scaRefreshProgress);

// ✅ Toggle completion by clicking the checkbox area
document.addEventListener("click", async (e) => {
  const entry = e.target.closest(".case-entry");
  if (!entry) return;

  // Don't interfere with links
  if (e.target.closest("a")) return;

// Only toggle if click is inside the left checkbox gutter
if (e.target.closest("a")) return;

const x = e.clientX - entry.getBoundingClientRect().left;
if (x > 34) return;

e.preventDefault();
e.stopPropagation();

  const caseId = entry.dataset.caseId;
  if (!caseId || !window.SCAProgress?.setComplete) return;

  const isCompleted = entry.classList.contains("is-completed");

  // Optimistic UI update
  entry.classList.toggle("is-completed", !isCompleted);
  window.scaCompletedSet?.[isCompleted ? "delete" : "add"](String(caseId));

  try {
    await window.SCAProgress.setComplete(caseId, !isCompleted);
  } catch (err) {
    // Roll back on failure
    entry.classList.toggle("is-completed", isCompleted);
    window.scaCompletedSet?.[isCompleted ? "add" : "delete"](String(caseId));
    console.warn("Failed to toggle completion:", err);
  }
});
