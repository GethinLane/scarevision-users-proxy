// voice-patient.js (Option A: AudioWorklet capture + backpressure + queue cap)
(() => {
  const backendUrl = "https://voice-patient-backend.onrender.com";

  // Tune these
  const WS_BACKPRESSURE_BYTES = 300_000; // drop mic frames if ws.bufferedAmount above this
  const MAX_PLAYBACK_QUEUE = 6;          // drop oldest AI audio if we fall behind

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

  // -------------------- Playback helpers --------------------
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

  const playbackQueue = [];
  let playing = false;

  // network debug (once/sec)
  let lastNetDebugMs = 0;

  // -------------------- Playback --------------------
  async function playPcmChunk(pcmBytesB64, sampleRate) {
    if (!audioCtx) return;

    const bytes = base64ToUint8Array(pcmBytesB64);
    const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const f32 = int16ToFloat32(i16);

    const buffer = audioCtx.createBuffer(1, f32.length, sampleRate);
    buffer.copyToChannel(f32, 0);

    playbackQueue.push(buffer);

    // ✅ cap queue so audio doesn't play late if we fall behind
    if (playbackQueue.length > MAX_PLAYBACK_QUEUE) {
      playbackQueue.splice(0, playbackQueue.length - MAX_PLAYBACK_QUEUE);
    }

    if (!playing) {
      playing = true;
      while (playbackQueue.length) {
        const buf = playbackQueue.shift();
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);

        safeSetAIState("talking");
        await new Promise((resolve) => {
          src.onended = resolve;
          src.start();
        });
      }
      safeSetAIState("listening");
      playing = false;
    }
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

  // -------------------- AudioWorklet (mic -> 16k PCM16) --------------------
  function makeMicWorkletModuleUrl() {
    // Single-file deploy: we generate the worklet JS from a Blob (avoids CORS / hosting hassles).
    const workletCode = `
class MicToPcm16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false;

    // buffer of float samples at input sampleRate
    this.buf = new Float32Array(8192);
    this.writePos = 0;

    this.chunkSize = 4096;     // process in chunks
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

    // Always capture, but only emit messages when enabled
    this.ensureCapacity(ch0.length);
    this.buf.set(ch0, this.writePos);
    this.writePos += ch0.length;

    if (!this.enabled) {
      // avoid unbounded growth
      if (this.writePos > this.buf.length * 0.75) this.writePos = 0;
      return true;
    }

    // While we have a full chunk, downsample and send
    while (this.writePos >= this.chunkSize) {
      const slice = this.buf.subarray(0, this.chunkSize);
      const pcm16 = this.downsampleToPcm16(slice, sampleRate);

      // Transfer buffer to main thread (zero-copy)
      this.port.postMessage({ type: "pcm16", buffer: pcm16.buffer }, [pcm16.buffer]);

      // shift remaining samples down
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
    // Create silent sink (prevents mic being audible / reduces echo)
    silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    silentGain.connect(audioCtx.destination);

    // Create module URL + load worklet
    workletBlobUrl = makeMicWorkletModuleUrl();
    await audioCtx.audioWorklet.addModule(workletBlobUrl);

    // Create mic worklet node
    micNode = new AudioWorkletNode(audioCtx, "mic-to-pcm16");

    // Receive pcm16 buffers from worklet and forward to WS with backpressure protection
    micNode.port.onmessage = (evt) => {
      if (!evt?.data || evt.data.type !== "pcm16") return;

      if (!backendReady) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // ✅ Backpressure guard: drop if congested (prevents “lag buildup”)
      if (ws.bufferedAmount > WS_BACKPRESSURE_BYTES) return;

      ws.send(evt.data.buffer);

      // ✅ lightweight debug once per second
      const now = performance.now();
      if (now - lastNetDebugMs > 1000) {
        lastNetDebugMs = now;
        log(`[NET] ws.bufferedAmount=${ws.bufferedAmount} playbackQueue=${playbackQueue.length}`);
      }
    };

    // Connect mic -> worklet -> silent sink (keeps processing alive)
    micSource.connect(micNode);
    micNode.connect(silentGain);

    // Start disabled; enable only when backend sends "ready"
    micNode.port.postMessage({ type: "enable", enabled: false });
  }

  // -------------------- Cleanup --------------------
  function cleanup() {
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

    playbackQueue.length = 0;
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

      // AudioContext must be created on user gesture
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      const wsUrl = backendUrl.replace("https://", "wss://").replace("http://", "ws://") + "/ws";
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = async () => {
        log("[WS] connected");
        setStatus("Loading case & connecting to Vertex…");

        // Send init first (case selection)
        const sel = $("caseSelect");
        const caseId = Number(sel?.value) || 1;
        ws.send(JSON.stringify({ type: "init", caseId }));
        log(`[INIT] sent caseId=${caseId}`);

        // Get mic stream (still needs user gesture in many browsers)
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        micSource = audioCtx.createMediaStreamSource(micStream);
        await setupMicWorklet(); // sets up micNode + silent sink

        setStatus("Connected. Waiting for model ready…");
      };

      ws.onmessage = async (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }

        if (msg.type === "ready") {
          backendReady = true;
          if (msg.outputRate) outputSampleRate = msg.outputRate;
          log(`[READY] model=${msg.model}`);
          if (msg.caseTable || msg.caseId) log(`[READY] loaded ${msg.caseTable || ("Case " + msg.caseId)}`);

          // enable sending mic audio now that backend/Vertex is ready
          micNode?.port?.postMessage({ type: "enable", enabled: true });

          setStatus("Ready. Start talking!");
          safeSetAIState("listening");
          return;
        }

        if (msg.type === "transcript") log("[You] " + msg.text);
        if (msg.type === "ai_text") log("[AI] " + msg.text);

        if (msg.type === "audio") {
          await playPcmChunk(msg.data, outputSampleRate);
        }

        if (msg.type === "interrupted") {
          playbackQueue.length = 0;
          safeSetAIState("listening");
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
