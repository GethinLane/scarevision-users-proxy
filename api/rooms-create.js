import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

/**
 * Expected body:
 * {
 *   userRecordId: "recXXXX",   <-- returned from session-start
 *   start: ISO string,
 *   end: ISO string,
 *   platform: "Google Meet",
 *   meetingLink: "https://meet.google.com/xxx",
 *   maxParticipants: 3
 * }
 */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const {
      userRecordId,
      start,
      end,
      platform,
      meetingLink,
      maxParticipants,
    } = req.body || {};

    if (!userRecordId) {
      return res.status(400).json({ ok: false, error: "Missing userRecordId" });
    }

    if (!meetingLink) {
      return res.status(400).json({ ok: false, error: "Missing meetingLink" });
    }

    // 1. Create session
    const session = await base("Sessions").create({
      HostUser: [userRecordId],
      Start: start,
      End: end,
      Status: "Open",
      Platform: platform || "Google Meet",
      MeetingLink: meetingLink,
      MaxParticipants: maxParticipants || 3,
    });

    // 2. Auto-add host as attendee
    await base("SessionAttendees").create({
      Session: [session.id],
      User: [userRecordId],
    });

    return res.json({
      ok: true,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("rooms-create error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
