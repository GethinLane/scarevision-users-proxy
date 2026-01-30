import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // Fetch sessions that are open and not expired
    const records = await base("Sessions")
      .select({
        filterByFormula: `AND({Status}="Open", {End} > NOW())`,
        sort: [{ field: "Start", direction: "asc" }],
        maxRecords: 50,
      })
      .all();

    // Format safe room data (NO meeting link yet)
    const rooms = records.map((r) => ({
      sessionId: r.id,
      start: r.fields.Start,
      end: r.fields.End,
      platform: r.fields.Platform || null,
      maxParticipants: r.fields.MaxParticipants || 3,
      attendeeCount: r.fields.AttendeeCount || 0,
      spotsLeft: r.fields.SpotsLeft || null,

      // HostUser is a linked record array
      hostUser: r.fields.HostUser || [],
    }));

    return res.json({ ok: true, rooms });
  } catch (err) {
    console.error("rooms-list error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
