// Ensure the code runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    initializeSelect2();
    loadData();
    initializeDisplaySettings();

    // ✅ NEW: load completion progress once (safe if it fails)
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
   ✅ NEW: Completion glue (completed only; no flagged yet)
   ========================================================= */

window.scaCompletedSet = window.scaCompletedSet || new Set();

window.applyCompletedStyles = window.applyCompletedStyles || function applyCompletedStyles() {
    document.querySelectorAll('.case-entry[data-case-id]').forEach(el => {
        const id = String(el.dataset.caseId || '');
        el.classList.toggle('is-completed', window.scaCompletedSet.has(id));
    });
};

let __scaProgressLoaded = false;

async function loadProgressOnce() {
    if (__scaProgressLoaded) return;
    __scaProgressLoaded = true;

    if (!window.SCAProgress?.init) return;

    try {
        const { progress } = await window.SCAProgress.init();
        // progress.completed is numbers; convert to strings for dataset matching
        window.scaCompletedSet = new Set((progress?.completed || []).map(String));
        window.applyCompletedStyles();
    } catch (e) {
        console.warn("Could not load completion progress:", e?.message || e);
    }
}

/* =========================================================
   Existing Airtable caching + fetch
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

    // IMPORTANT: paste your existing PAT token string here locally.
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

    // 1) Show-Diagnosis switch: checked = show diagnosis; default = true
    const showDiagnosis = params.has('showDiagnosis')
        ? params.get('showDiagnosis') === 'true'
        : true;
    document.getElementById('toggleDisplayType').checked = showDiagnosis;

    // 2) Content chips: default to Clinical Experience Groups (Domain)
    const sortParam = params.get('sortType');
    const isDomain = sortParam ? sortParam === 'Domain' : true;
    document.getElementById('btnClinicalTopic')
        .classList.toggle('active', !isDomain);
    document.getElementById('btnDomain')
        .classList.toggle('active', isDomain);

    // 3) Video-only via URL (?videoOnly=true, ?videoOnly=1, or ?videoOnly)
    if (params.has('videoOnly')) {
        const v = params.get('videoOnly');
        const isOn = v === 'true' || v === '1' || v === ''; // empty value counts as "on"
        document.getElementById('toggleVideoOnly').checked = isOn;
    }
    // (If the param is absent, the toggle keeps whatever default is in your HTML)

    // 4) Initial render
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

    // Video-only filter
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

            // ✅ NEW: add data-case-id (digits-only stored as text)
// Uses fallback field names just in case
const caseId =
  record.fields['Case ID'] ??
  record.fields['CaseID'] ??
  record.fields['Case Number'] ??
  record.fields['Case'];

if (caseId != null && String(caseId).trim() !== '') {
  div.dataset.caseId = String(caseId).trim();
}

            // Text link
            const linkField = showDiagnosis ? 'Link' : 'Link-nt';
            const anchor = document.createElement('a');
            anchor.href = record.fields[linkField];
            anchor.target = '_blank';
            anchor.textContent = showDiagnosis ? record.fields['Name'] : record.fields['Presenting Complaint'];
            div.appendChild(anchor);

            // Actions cluster
            const actions = document.createElement('div');
            actions.className = 'case-actions';

            // Video icon
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

            // Difficulty stars
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

    // Keep open panels on resize (same behavior; note: adds a listener each render, as in your original)
    window.addEventListener('resize', () => {
        document.querySelectorAll('.panel').forEach(p => {
            if (p.previousElementSibling.classList.contains('active')) {
                p.style.maxHeight = `${p.scrollHeight}px`;
            }
        });
    });

    // ✅ NEW: re-apply completion classes after every render
    if (typeof window.applyCompletedStyles === 'function') {
        window.applyCompletedStyles();
    }
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
