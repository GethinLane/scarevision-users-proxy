export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;

    const { sessionId, userRecordId } = req.body;
    if (!sessionId) throw new Error("Missing sessionId");
    if (!userRecordId) throw new Error("Missing userRecordId");

    // Load session
    const sessionResp = await fetch(
      `https://api.airtable.com/v0/${baseId}/Sessions/${sessionId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const session = await sessionResp.json();
    if (!sessionResp.ok) throw new Error("Session not found");

    const max = session.fields.MaxParticipants || 3;
    const count = session.fields.AttendeeCount || 0;

    if (count >= max) {
      return res.json({ ok: false, error: "Room full" });
    }

    // Add attendee
    await fetch(`https://api.airtable.com/v0/${baseId}/SessionAttendees`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          Session: [sessionId],
          User: [userRecordId],
        },
      }),
    });

    return res.json({
      ok: true,
      meetingLink: session.fields.MeetingLink,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
