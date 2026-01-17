// case-mapping.js (PURE JS file, no <script> tag)
(function () {
  // Paste your full 1..351 tab-separated list inside these backticks:
  // Format per line: ID<TAB>Experience groups (comma-separated)<TAB>Clinical topics (comma-separated)
  const CASE_TSV = String.raw`
PASTE_YOUR_TSV_HERE
`.trim();

  // ---- Canonical lists ----
  const TOPICS = [
    "Allergy and clinical immunology",
    "Cardiovascular health",
    "Dermatology",
    "Ear, nose and throat, speech and hearing",
    "Eyes and vision",
    "Gastroenterology",
    "Genomic medicine",
    "Gynaecology and breast health",
    "Haematology",
    "Infectious diseases and travel health",
    "Learning disability",
    "Maternity and reproductive health",
    "Mental health",
    "Metabolic problems and endocrinology",
    "Musculoskeletal health",
    "Neurodevelopmental conditions and neurodiversity",
    "Neurology",
    "Renal and urology",
    "Respiratory health",
    "Sexual health",
    "Smoking, alcohol and substance misuse",
    "Urgent and unscheduled care"
  ];

  const EXPERIENCE_GROUPS = [
    "Patient less than 19 years old",
    "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast",
    "Long-term condition, including cancer, multi-morbidity, and disability",
    "Older adults, including frailty and people at the end of life",
    "Mental health, including addiction, smoking, alcohol, substance misuse",
    "Urgent and unscheduled care",
    "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties",
    "Ethnicity, culture, diversity, inclusivity",
    "New presentation of undifferentiated disease",
    "Prescribing",
    "Investigation / Results",
    "Professional conversation / Professional dilemma"
  ];

  // ---- Normalisation helpers ----
  function normKey(s) {
    return String(s ?? "")
      .trim()
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function buildLookup(canonList) {
    const m = new Map();
    for (const label of canonList) {
      m.set(normKey(label), label);
      m.set(normKey(label).replace(/,/g, ""), label);
    }
    return m;
  }

  const TOPIC_LOOKUP = buildLookup(TOPICS);
  const GROUP_LOOKUP = buildLookup(EXPERIENCE_GROUPS);

  // Split comma-separated values but respect "quoted, commas"
  function splitCsvish(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return [];

    const out = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (ch === '"') {
        inQ = !inQ;
        continue;
      }

      if (!inQ && ch === ",") {
        const t = cur.trim();
        if (t) out.push(t);
        cur = "";
        continue;
      }

      cur += ch;
    }

    const last = cur.trim();
    if (last) out.push(last);

    return out;
  }

  // Extra topic aliases you actually have in your TSV
  const TOPIC_ALIASES = new Map([
    [normKey("Cardiovascular Health"), "Cardiovascular health"],
    [normKey("Musculoskeletal Health"), "Musculoskeletal health"],
    [normKey("Mental Health"), "Mental health"],
    [normKey("Respiratory Health"), "Respiratory health"],
    [normKey("Genomic Medicine"), "Genomic medicine"],
    [normKey("Gynaecology and Breast"), "Gynaecology and breast health"],
    [normKey("Allergy and Clinical Immunology"), "Allergy and clinical immunology"],
    [normKey("Infectious Diseases and Travel Health"), "Infectious diseases and travel health"],
    [normKey("Metabolic Problems and Endocrinology"), "Metabolic problems and endocrinology"],
    [normKey("Eyes and Vision"), "Eyes and vision"],
    [normKey("Renal and Urology"), "Renal and urology"],
    [normKey("Urgent and Unscheduled Care"), "Urgent and unscheduled care"],
    [normKey("Ear, Nose and Throat, Speech and Hearing"), "Ear, nose and throat, speech and hearing"],
    [normKey("Smoking, Alcohol and Substance Misuse"), "Smoking, alcohol and substance misuse"]
  ]);

  function canonTopicOne(token) {
    const t = String(token ?? "").trim();
    if (!t) return "";
    const k = normKey(t);

    if (TOPIC_ALIASES.has(k)) return TOPIC_ALIASES.get(k);

    return (
      TOPIC_LOOKUP.get(k) ||
      TOPIC_LOOKUP.get(k.replace(/,/g, "")) ||
      t
    );
  }

  function canonGroupOne(token) {
    const t = String(token ?? "").trim();
    if (!t) return "";
    const k = normKey(t);

    // Variant that appears in your TSV
    if (k === normKey("Urgent and Unscheduled care")) return "Urgent and unscheduled care";

    return (
      GROUP_LOOKUP.get(k) ||
      GROUP_LOOKUP.get(k.replace(/,/g, "")) ||
      t
    );
  }

  function canonTopics(rawField) {
    return Array.from(
      new Set(splitCsvish(rawField).map(canonTopicOne).filter(Boolean))
    );
  }

  function canonGroups(rawField) {
    return Array.from(
      new Set(splitCsvish(rawField).map(canonGroupOne).filter(Boolean))
    );
  }

  function parseCaseTsv(tsv) {
    const lines = String(tsv || "")
      .split(/\r?\n/)
      .map(l => l.trimEnd())
      .filter(Boolean);

    const out = [];
    for (const line of lines) {
      const cols = line.split("\t");
      if (cols.length < 3) continue;

      const id = Number(String(cols[0]).trim());
      if (!Number.isFinite(id)) continue;

      const groupsRaw = cols[1];
      const topicsRaw = cols[2];

      out.push({
        id,
        groups: canonGroups(groupsRaw),
        topics: canonTopics(topicsRaw)
      });
    }
    return out;
  }

  window.SCA_CASE_MAP = parseCaseTsv(CASE_TSV);

  console.log("[case-mapping] SCA_CASE_MAP length:", window.SCA_CASE_MAP.length);
  console.log("[case-mapping] sample:", window.SCA_CASE_MAP.slice(0, 3));
})();
