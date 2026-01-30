import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

/**
 * Expected body:
 * {
 *   sessionId: "recSESSIONXXX",
 *   userRecordId: "recUSERXXX"
 * }
 */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const { sessionId, userRecordId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "Missing sessionId" });
    }

    if (!userRecordId) {
      return res.status(400).json({ ok: false, error: "Missing userRecordId" });
    }

    // 1. Load session
    const session = await base("Sessions").find(sessionId);

    if (!session.fields.Status || session.fields.Status !== "Open") {
      return res.status(400).json({ ok: false, error: "Room is not open" });
    }

    const max = session.fields.MaxParticipants || 3;
    const count = session.fields.AttendeeCount || 0;

    if (count >= max) {
      // Mark full
      await base("Sessions").update(sessionId, { Status: "Full" });

      return res.status(400).json({
        ok: false,
        error: "Room is already full",
      });
    }

    // 2. Prevent duplicate joins
    const existing = await base("SessionAttendees")
      .select({
        filterByFormula: `AND(
          {Session}="${sessionId}",
          {User}="${userRecordId}"
        )`,
        maxRecords: 1,
      })
      .firstPage();

    if (existing.length > 0) {
      return res.json({
        ok: true,
        meetingLink: session.fields.MeetingLink,
        message: "Already joined",
      });
    }

    // 3. Add attendee
    await base("SessionAttendees").create({
      Session: [sessionId],
      User: [userRecordId],
    });

    // 4. Recheck count (simple)
    const updated = await base("Sessions").find(sessionId);
    const newCount = updated.fields.AttendeeCount || count + 1;

    if (newCount >= max) {
      await base("Sessions").update(sessionId, { Status: "Full" });
    }

    // 5. Return meeting link only now
    return res.json({
      ok: true,
      meetingLink: session.fields.MeetingLink,
    });
  } catch (err) {
    console.error("rooms-join error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
