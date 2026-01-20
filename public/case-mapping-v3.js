document.addEventListener("DOMContentLoaded", async () => {
  try {
    const r = await fetch("https://scarevision-airtable-proxy.vercel.app/api/cases-list-data", {
      cache: "no-store"
    });
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
          groups: asArray(f["Domain"] ?? f["Themes"]),  // pick the right one
          topics: asArray(f["Clinical Topics"]),
        };
      })
      .filter(Boolean)
      .sort((a,b) => a.id - b.id);

    console.log("SCA_CASE_MAP loaded from Airtable:", window.SCA_CASE_MAP.length);
  } catch (e) {
    console.warn("Failed to load SCA_CASE_MAP:", e);
    window.SCA_CASE_MAP = [];
  }
});
