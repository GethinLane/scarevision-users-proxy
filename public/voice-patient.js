// voice-patient.js (Options 1-4: scheduled playback + lower latency mic + keepalive + AUDIO+TEXT debug)
(() => {
  const backendUrl = "https://voice-patient-backend.onrender.com";

  // Tune these
  const WS_BACKPRESSURE_BYTES = 300_000; // drop mic frames if ws.bufferedAmount above this
  const MAX_PLAYBACK_QUEUE_SEC = 2.0;    // cap scheduled audio lead (seconds) to avoid "talking late"

  function $(id) { return document.getElementById(id); }

  function log(message) {
    console.log(message);
    const logEl = $("log");
    if (!logEl) return;
    logEl.value += message + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function safeSetAIState(mode) {
    if (typeof window.setAIState === "function") window.setAIState(mode);
  }

  // -------------------- Case dropdown --------------------
  async function populateCaseDropdown() {
    const sel = $("caseSelect");
    if (!sel) return;

    sel.innerHTML = `<option>Loading cases…</option>`;

    try {
      const resp = await fetch(`${backendUrl}/cases`, { cache: "no-store" });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Failed to load cases");

      sel.innerHTML = "";
      for (const n of data.cases) {
        const opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = `Case ${n}`;
        sel.appendChild(opt);
      }

      if (data.cases.length) sel.value = String(data.cases[data.cases.length - 1]);
      log(`[CASES] loaded ${data.cases.length} cases`);
    } catch (err) {
      sel.innerHTML = `<option>Error loading cases</option>`;
      log("[CASES] error: " + (err?.message || String(err)));
    }
  }

  // -------------------- Utils --------------------
  function base64ToUint8Array(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function int16ToFloat32(int16) {
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = Math.max(-1, Math.min(1, int16[i] / 32768));
    return f32;
  }

  // -------------------- State --------------------
  let ws = null;
  let audioCtx = null;
  let micStream = null;
  let micSource = null;

  let workletBlobUrl = null;
  let micNode = null;
  let silentGain = null;

  let backendReady = false;
  let outputSampleRate = 24000;

  // scheduled playback
  let nextPlayTime = 0;
  let lastAudioReceivedAt = 0;

  // keepalive
  let pingTimer = null;

  // network debug (once/sec)
  let lastNetDebugMs = 0;

  // -------------------- Playback (Option 1: gapless scheduler) --------------------
  function playPcmChunkScheduled(pcmBytesB64, sampleRate) {
    if (!audioCtx) return;

    const bytes = base64ToUint8Array(pcmBytesB64);
    const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const f32 = int16ToFloat32(i16);

    const buffer = audioCtx.createBuffer(1, f32.length, sampleRate);
    buffer.copyToChannel(f32, 0);

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    // If we've fallen behind, reset schedule near-now
    if (nextPlayTime < now + 0.05) nextPlayTime = now + 0.05;

    // Cap how far ahead we queue audio (prevents "late talking" after hiccups)
    const lead = nextPlayTime - now;
    if (lead > MAX_PLAYBACK_QUEUE_SEC) {
      // drop this chunk by snapping schedule closer (effectively skipping backlog)
      nextPlayTime = now + 0.05;
    }

    safeSetAIState("talking");
    src.start(nextPlayTime);
    nextPlayTime += buffer.duration;

    lastAudioReceivedAt = performance.now();

    src.onended = () => {
      // if nothing else scheduled soon, return to listening
      if (!audioCtx) return;
      if (nextPlayTime <= audioCtx.currentTime + 0.1) safeSetAIState("listening");
    };
  }

  // -------------------- UI helpers --------------------
  function setUiConnected(connected) {
    const startBtn = $("startBtn");
    const stopBtn  = $("stopBtn");
    if (startBtn) startBtn.disabled = connected;
    if (stopBtn)  stopBtn.disabled  = !connected;
  }

  function setStatus(text) {
    const statusEl = $("status");
    if (statusEl) statusEl.textContent = text;
  }

  // -------------------- AudioWorklet (Option 2: smaller chunk size) --------------------
  function makeMicWorkletModuleUrl() {
    const workletCode = `
class MicToPcm16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false;

    this.buf = new Float32Array(8192);
    this.writePos = 0;

    // Option 2: smaller chunks for lower latency (was 4096)
    this.chunkSize = 1024;
    this.outRate = 16000;

    this.port.onmessage = (e) => {
      if (e?.data?.type === "enable") this.enabled = !!e.data.enabled;
      if (e?.data?.type === "reset") { this.writePos = 0; }
    };
  }

  ensureCapacity(extra) {
    const needed = this.writePos + extra;
    if (needed <= this.buf.length) return;
    let newLen = this.buf.length;
    while (newLen < needed) newLen *= 2;
    const nb = new Float32Array(newLen);
    nb.set(this.buf, 0);
    this.buf = nb;
  }

  downsampleToPcm16(input, inRate) {
    const ratio = inRate / this.outRate;
    const outLen = Math.round(input.length / ratio);
    const out = new Int16Array(outLen);

    let offset = 0;
    for (let i = 0; i < outLen; i++) {
      const nextOffset = Math.round((i + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let j = offset; j < nextOffset && j < input.length; j++) {
        sum += input[j];
        count++;
      }
      const sample = count ? (sum / count) : 0;
      const s = Math.max(-1, Math.min(1, sample));
      out[i] = (s * 32767) | 0;
      offset = nextOffset;
    }
    return out;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const ch0 = input[0];

    this.ensureCapacity(ch0.length);
    this.buf.set(ch0, this.writePos);
    this.writePos += ch0.length;

    if (!this.enabled) {
      if (this.writePos > this.buf.length * 0.75) this.writePos = 0;
      return true;
    }

    while (this.writePos >= this.chunkSize) {
      const slice = this.buf.subarray(0, this.chunkSize);
      const pcm16 = this.downsampleToPcm16(slice, sampleRate);
      this.port.postMessage({ type: "pcm16", buffer: pcm16.buffer }, [pcm16.buffer]);
      this.buf.copyWithin(0, this.chunkSize, this.writePos);
      this.writePos -= this.chunkSize;
    }

    return true;
  }
}

registerProcessor("mic-to-pcm16", MicToPcm16Processor);
`.trim();

    const blob = new Blob([workletCode], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  async function setupMicWorklet() {
    silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    silentGain.connect(audioCtx.destination);

    workletBlobUrl = makeMicWorkletModuleUrl();
    await audioCtx.audioWorklet.addModule(workletBlobUrl);

    micNode = new AudioWorkletNode(audioCtx, "mic-to-pcm16");

    micNode.port.onmessage = (evt) => {
      if (!evt?.data || evt.data.type !== "pcm16") return;

      if (!backendReady) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Backpressure guard
      if (ws.bufferedAmount > WS_BACKPRESSURE_BYTES) return;

      ws.send(evt.data.buffer);

      const now = performance.now();
      if (now - lastNetDebugMs > 1000) {
        lastNetDebugMs = now;
        log(`[NET] ws.bufferedAmount=${ws.bufferedAmount} nextPlayLead=${audioCtx ? (nextPlayTime - audioCtx.currentTime).toFixed(2) : "?"}s`);
      }
    };

    micSource.connect(micNode);
    micNode.connect(silentGain);

    micNode.port.postMessage({ type: "enable", enabled: false });
  }

  // -------------------- Cleanup --------------------
  function cleanup() {
    try {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
    } catch {}

    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop_audio" }));
        ws.close();
      }
    } catch {}

    backendReady = false;
    ws = null;

    try { micNode?.disconnect(); } catch {}
    try { micSource?.disconnect(); } catch {}
    try { silentGain?.disconnect(); } catch {}

    micNode = null;
    micSource = null;
    silentGain = null;

    if (workletBlobUrl) {
      try { URL.revokeObjectURL(workletBlobUrl); } catch {}
      workletBlobUrl = null;
    }

    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }

    if (audioCtx) {
      try { audioCtx.close(); } catch {}
      audioCtx = null;
    }

    nextPlayTime = 0;
    lastAudioReceivedAt = 0;

    safeSetAIState("listening");
    setUiConnected(false);
    setStatus("Stopped.");
  }

  // -------------------- Consultation --------------------
  async function startConsultation() {
    try {
      setUiConnected(true);
      setStatus("Connecting...");
      safeSetAIState("listening");

      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      await audioCtx.resume(); // important on Safari/iOS

      const wsUrl = backendUrl.replace("https://", "wss://").replace("http://", "ws://") + "/ws";
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = async () => {
        log("[WS] connected");
        setStatus("Loading case & connecting to Vertex…");

        const sel = $("caseSelect");
        const caseId = Number(sel?.value) || 1;
        ws.send(JSON.stringify({ type: "init", caseId }));
        log(`[INIT] sent caseId=${caseId}`);

        // Option 3: keepalive ping (client->server)
        pingTimer = setInterval(() => {
          try {
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
          } catch {}
        }, 12000);

        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        micSource = audioCtx.createMediaStreamSource(micStream);
        await setupMicWorklet();

        setStatus("Connected. Waiting for model ready…");
      };

      ws.onmessage = async (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }

        if (msg.type === "ready") {
          backendReady = true;
          if (msg.outputRate) outputSampleRate = msg.outputRate;

          // reset scheduler when ready
          nextPlayTime = audioCtx.currentTime + 0.05;

          log(`[READY] model=${msg.model}`);
          if (msg.caseTable || msg.caseId) log(`[READY] loaded ${msg.caseTable || ("Case " + msg.caseId)}`);

          micNode?.port?.postMessage({ type: "enable", enabled: true });

          setStatus("Ready. Start talking!");
          safeSetAIState("listening");
          return;
        }

        if (msg.type === "pong") return;

        if (msg.type === "transcript") log("[You] " + msg.text);
        if (msg.type === "ai_transcript") log("[AI TR] " + msg.text);
        if (msg.type === "ai_text") log("[AI] " + msg.text);

        if (msg.type === "audio") {
          playPcmChunkScheduled(msg.data, outputSampleRate);
        }

        if (msg.type === "interrupted") {
          // flush schedule
          if (audioCtx) nextPlayTime = audioCtx.currentTime + 0.05;
          safeSetAIState("listening");
          log("[INTERRUPTED]");
        }

        if (msg.type === "goaway") {
          log("[GOAWAY] " + JSON.stringify(msg.goAway || {}));
        }

        if (msg.type === "usage") {
          log("[USAGE] " + JSON.stringify(msg.usage || {}));
        }

        if (msg.type === "debug") {
          log("[DEBUG] " + (msg.raw || ""));
        }

        if (msg.type === "error") {
          log("[ERROR] " + msg.message);
          setStatus("Error: " + msg.message);
          cleanup();
        }

        if (msg.type === "closed") {
          log("[CLOSED] " + msg.message);
          cleanup();
        }
      };

      ws.onclose = (evt) => {
        log(`[WS CLOSED] code=${evt.code} reason=${evt.reason || ""}`);
        cleanup();
      };

      ws.onerror = () => {
        log("[WS ERROR] (see console)");
      };

    } catch (err) {
      log("[ERROR] " + (err?.message || String(err)));
      setStatus("Error: " + (err?.message || String(err)));
      cleanup();
    }
  }

  function stopConsultation() {
    log("Stopping consultation.");
    cleanup();
  }

  // -------------------- Init --------------------
  window.addEventListener("DOMContentLoaded", () => {
    const startBtn = $("startBtn");
    const stopBtn  = $("stopBtn");

    if (!startBtn || !stopBtn) {
      log("UI ERROR: startBtn/stopBtn not found. Check element IDs in HTML.");
      return;
    }

    startBtn.addEventListener("click", startConsultation);
    stopBtn.addEventListener("click", stopConsultation);

    populateCaseDropdown();
    setUiConnected(false);
    setStatus("Not connected");
  });
})();
