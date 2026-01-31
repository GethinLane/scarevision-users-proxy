(async function PracticeRoomsWidget() {
  const API = "https://scarevision-users-proxy.vercel.app/api";

  // ---------- Elements ----------
  const greetEl = document.getElementById("scaGreeting");
  const myEl = document.getElementById("myRoomsList");
  const activeEl = document.getElementById("activeRoomsList");
  const scheduledEl = document.getElementById("scheduledRoomsList");

  const startBtn = document.getElementById("startRoomBtn");
  const meetingLinkInput = document.getElementById("meetingLinkInput");
  const topicInput = document.getElementById("topicInput");
  const platformSelect = document.getElementById("platformSelect");
  const durationSelect = document.getElementById("durationSelect");
  const startTimeInput = document.getElementById("startTimeInput");

  // ---------- Helpers ----------
  function fmtDateTime(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }
  function fmtTime(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
  }

  async function apiPost(path, body) {
    const r = await fetch(`${API}/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || `Request failed: ${path}`);
    return data;
  }

  // ---------- Identity: LIVE first, CACHE fallback ----------
  async function getIdentityLiveOrCached() {
    try {
      if (window.SCAProgress?.init) {
        const res = await window.SCAProgress.init();
        if (res?.identity?.id && res?.identity?.email) return res.identity;
      }
    } catch {}
    try {
      const raw = localStorage.getItem("sca_member_identity");
      const cached = raw ? JSON.parse(raw) : null;
      if (cached?.id && cached?.email) return cached;
    } catch {}
    return null;
  }

  const identity = await getIdentityLiveOrCached();
  if (!identity?.id || !identity?.email) {
    if (activeEl) activeEl.textContent = "❌ Could not detect user. Please visit Dashboard first.";
    if (scheduledEl) scheduledEl.textContent = "";
    if (myEl) myEl.textContent = "";
    return;
  }

  // Greeting
  const fullName = [identity.firstName, identity.lastName].filter(Boolean).join(" ");
  if (greetEl) greetEl.textContent = fullName ? `Hi ${fullName} 👋` : `Hi 👋`;

  // ---------- Ensure user exists + get userRecordId ----------
  let userRecordId = "";
  try {
    const sess = await fetch(`${API}/session-start-v2`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        squarespaceUserId: identity.id,
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
      }),
    }).then(r => r.json());

    if (!sess?.ok) throw new Error(sess?.error || "session-start failed");
    userRecordId = sess.userRecordId;
  } catch (e) {
    if (activeEl) activeEl.textContent = "❌ Could not start session.";
    if (scheduledEl) scheduledEl.textContent = "";
    if (myEl) myEl.textContent = "";
    return;
  }

  // ---------- State ----------
  let myCommitments = [];              // from rooms-my
  let myCommittedSessionIds = new Set();

  // ---------- Load: My scheduled sessions ----------
  async function loadMy() {
    myEl.textContent = "Loading…";

    try {
      const data = await apiPost("rooms-my", { userRecordId });

      // commitments: [{ attendeeId, sessionId, start, end, topic, platform, status, meetingLink, isHost }]
      myCommitments = Array.isArray(data.commitments) ? data.commitments : [];
      myCommittedSessionIds = new Set(myCommitments.map(c => c.sessionId).filter(Boolean));

      if (!myCommitments.length) {
        myEl.textContent = "You haven’t committed to any upcoming sessions yet.";
        return;
      }

      myEl.innerHTML = "";

      myCommitments
        .slice()
        .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0))
        .forEach((c) => {
          const div = document.createElement("div");
          div.className = "room-item";

const startStr = fmtDateTime(c.start);

const now = new Date();
const startDt = c.start ? new Date(c.start) : null;
const endDt = c.end ? new Date(c.end) : null;

const isFuture = startDt ? startDt > now : true;
const isLive = startDt && endDt ? (startDt <= now && now < endDt) : false;

const tag = c.isHost ? "Host" : "Committed";


          div.innerHTML = `
            <div class="room-topic">${c.topic || "Practice Room"} <span class="tag">${tag}</span></div>
            <div class="room-meta">
              Platform: ${c.platform || "—"}<br/>
              Starts: ${startStr}
            </div>

            ${
c.isHost && (isFuture || isLive)
  ? `
      <div class="room-actions">
        <button class="btn-update" type="button">
          <i class="fa fa-pencil"></i> Update meeting
        </button>
        <button class="btn-cancel-session" type="button">
          <i class="fa fa-times"></i> Cancel session
        </button>
      </div>
                `
                : `
                  <div class="room-actions room-actions-single">
                    <button class="btn-cancel-commit" type="button">
                      <i class="fa fa-times"></i> Cancel
                    </button>
                  </div>
                `
            }
          `;

          // Host controls
          if (c.isHost && (isFuture || isLive)) {

            div.querySelector(".btn-update").onclick = async () => {
              const newLink = prompt("Paste the NEW meeting link (leave blank to keep):", c.meetingLink || "");
              if (newLink === null) return;

              const newTopic = prompt("Update topic (optional):", c.topic || "");
              if (newTopic === null) return;

              const newPlatform = prompt("Update platform (optional):", c.platform || "");
              if (newPlatform === null) return;

              try {
                await apiPost("rooms-host-update", {
                  sessionId: c.sessionId,
                  userRecordId,
                  meetingLink: (newLink || "").trim() ? (newLink || "").trim() : undefined,
                  topic: newTopic,
                  platform: newPlatform,
                });
                alert("✅ Updated!");
                await refreshAll();
              } catch (e) {
                alert("❌ Could not update: " + e.message);
              }
            };

const cancelBtn = div.querySelector(".btn-cancel-session");

// Change label depending on state
if (cancelBtn) {
  cancelBtn.innerHTML = `<i class="fa fa-times"></i> ${isLive ? "End session" : "Cancel session"}`;

  cancelBtn.onclick = async () => {
    const msg = isLive
      ? "End this session now? This will close it on the portal and stop new joins."
      : "Cancel this session for everyone? This cannot be undone.";

    if (!confirm(msg)) return;

    try {
      await apiPost("rooms-host-cancel", { sessionId: c.sessionId, userRecordId });
      alert(isLive ? "✅ Session ended." : "✅ Session cancelled.");
      await refreshAll();
    } catch (e) {
      alert("❌ Could not update session: " + e.message);
    }
  };
}

          } else {
            // Attendee cancel commitment
            div.querySelector(".btn-cancel-commit").onclick = async () => {
              try {
                await apiPost("rooms-cancel", { attendeeId: c.attendeeId });
                await refreshAll();
              } catch (e) {
                alert("❌ Could not cancel: " + e.message);
              }
            };
          }

          myEl.appendChild(div);
        });

    } catch (e) {
      myEl.textContent = "❌ Could not load your scheduled sessions.";
      console.error(e);
    }
  }

  // ---------- Load: Rooms list (Active + Upcoming) ----------
  async function loadRooms() {
    activeEl.textContent = "Loading…";
    scheduledEl.textContent = "Loading…";

    try {
      const r = await fetch(`${API}/rooms-list`, { method: "POST", credentials: "include" });
      const data = await r.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "rooms-list failed");

      const rooms = Array.isArray(data.rooms) ? data.rooms : [];
      const now = new Date();

      const active = rooms.filter(x => x.start && new Date(x.start) <= now);
      const upcoming = rooms.filter(x => x.start && new Date(x.start) > now);

      // --- Active Now ---
      if (!active.length) {
        activeEl.textContent = "No one is practising right now.";
      } else {
        activeEl.innerHTML = "";
        active.forEach((room) => {
          const div = document.createElement("div");
          div.className = "room-item";

          div.innerHTML = `
            <div class="room-topic">${room.topic || "Practice Room"}</div>
            <div class="room-meta">
              Platform: ${room.platform || "—"}<br/>
              Spots left: ${room.spotsLeft} / ${room.maxParticipants}<br/>
              Ends: ${fmtTime(room.end)}
            </div>

            <div class="room-actions room-actions-single">
              <button class="btn-join" type="button" ${room.spotsLeft <= 0 ? "disabled" : ""}>
                <i class="fa fa-sign-in"></i> Join now
              </button>
            </div>
          `;

          div.querySelector(".btn-join").onclick = async () => {
            if (room.spotsLeft <= 0) return;
            try {
              const join = await apiPost("rooms-join", { sessionId: room.sessionId, userRecordId });
              window.open(join.meetingLink, "_blank");
              await refreshAll();
            } catch (e) {
              alert("❌ Could not join: " + e.message);
            }
          };

          activeEl.appendChild(div);
        });
      }

      // --- Upcoming ---
      if (!upcoming.length) {
        scheduledEl.textContent = "No upcoming sessions yet.";
      } else {
        scheduledEl.innerHTML = "";
        upcoming
          .slice()
          .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0))
          .forEach((room) => {
            const div = document.createElement("div");
            div.className = "room-item";

            const isCommitted = myCommittedSessionIds.has(room.sessionId);

            div.innerHTML = `
              <div class="room-topic">
                ${room.topic || "Practice Room"}
                ${isCommitted ? `<span class="tag">Committed</span>` : ""}
              </div>
              <div class="room-meta">
                Platform: ${room.platform || "—"}<br/>
                Spots left: ${room.spotsLeft} / ${room.maxParticipants}<br/>
                Starts: ${fmtDateTime(room.start)}
              </div>

              <div class="room-actions room-actions-single">
                <button class="btn-commit" type="button" ${isCommitted || room.spotsLeft <= 0 ? "disabled" : ""}>
                  <i class="fa ${isCommitted ? "fa-check" : "fa-calendar-plus-o"}"></i>
                  ${isCommitted ? "Committed" : "Commit to join"}
                </button>
              </div>
            `;

            div.querySelector(".btn-commit").onclick = async () => {
              if (isCommitted || room.spotsLeft <= 0) return;
              try {
                await apiPost("rooms-commit", { sessionId: room.sessionId, userRecordId });
                await refreshAll();
              } catch (e) {
                alert("❌ Could not commit: " + e.message);
              }
            };

            scheduledEl.appendChild(div);
          });
      }

    } catch (e) {
      console.error(e);
      activeEl.textContent = "❌ Error loading rooms.";
      scheduledEl.textContent = "";
    }
  }

  async function refreshAll() {
    await loadMy();     // loads my commitments + set
    await loadRooms();  // uses the set to mark committed sessions
  }

  // ---------- Create room ----------
  startBtn.onclick = async () => {
    const topic = (topicInput.value || "").trim();
    const platform = platformSelect.value;
    const durationMins = parseInt(durationSelect.value, 10) || 60;
    const meetingLink = (meetingLinkInput.value || "").trim();
    const startTimeRaw = startTimeInput.value;

    if (!meetingLink.startsWith("http")) {
      alert("Paste a valid meeting link.");
      return;
    }

    const start = startTimeRaw ? new Date(startTimeRaw) : new Date();
    const end = new Date(start.getTime() + durationMins * 60000);

    try {
      await apiPost("rooms-create", {
        userRecordId,
        start: start.toISOString(),
        end: end.toISOString(),
        platform,
        meetingLink,
        topic,
      });

      topicInput.value = "";
      meetingLinkInput.value = "";
      startTimeInput.value = "";

      alert("✅ Room created!");
      await refreshAll();
    } catch (e) {
      alert("❌ Could not create room: " + e.message);
    }
  };

  // ---------- Initial load + refresh ----------
  await refreshAll();
  setInterval(refreshAll, 30000);
})();

(function(){
    // Start now / schedule toggle (unchanged behaviour)
    const startNowBtn = document.getElementById('startNowBtn');
    const scheduleLaterBtn = document.getElementById('scheduleLaterBtn');
    const scheduleWrap = document.getElementById('scheduleWrap');
    const startTimeInput = document.getElementById('startTimeInput');

    if(startNowBtn && scheduleLaterBtn && scheduleWrap && startTimeInput){
      function setMode(mode){
        const now = mode === 'now';
        startNowBtn.classList.toggle('is-active', now);
        scheduleLaterBtn.classList.toggle('is-active', !now);
        scheduleWrap.style.display = now ? 'none' : 'block';

        // "Start now" = empty datetime input
        if (now) startTimeInput.value = '';
      }

      startNowBtn.addEventListener('click', () => setMode('now'));
      scheduleLaterBtn.addEventListener('click', () => setMode('later'));
      setMode('now');
    }

    // Why panel toggle
    const whyBtn = document.getElementById('whyMeetingLinkBtn');
    const whyPanel = document.getElementById('whyMeetingLinkPanel');

    if(whyBtn && whyPanel){
      whyBtn.addEventListener('click', function(){
        const isOpen = whyPanel.style.display === 'block';
        whyPanel.style.display = isOpen ? 'none' : 'block';
      });
    }
  })();
