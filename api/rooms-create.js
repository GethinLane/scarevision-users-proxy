export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const token = process.env.AIRTABLE_USERS_TOKEN;
    const baseId = process.env.AIRTABLE_USERS_BASE_ID;

    const { userRecordId, start, end, platform, meetingLink } = req.body;

    if (!userRecordId) throw new Error("Missing userRecordId");
    if (!meetingLink) throw new Error("Missing meetingLink");

    // Create Session
    const sessionResp = await fetch(
      `https://api.airtable.com/v0/${baseId}/Sessions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            HostUser: [userRecordId],
            Start: start,
            End: end,
            Status: "Open",
            Platform: platform,
            MeetingLink: meetingLink,
            MaxParticipants: 3,
          },
        }),
      }
    );

    const sessionData = await sessionResp.json();
    if (!sessionResp.ok) throw new Error(sessionData?.error?.message);

    // Auto-add host as attendee
    await fetch(`https://api.airtable.com/v0/${baseId}/SessionAttendees`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          Session: [sessionData.id],
          User: [userRecordId],
        },
      }),
    });

    return res.json({ ok: true, sessionId: sessionData.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
