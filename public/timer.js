// ═══════ SCA Toolbar JS ═══════
// Wrap in <script>...</script> tags and paste into
// the same Squarespace Code Block, AFTER the HTML.
// ═══════════════════════════════════════════════════

(function() {
  // Move toolbar to body so it escapes section stacking context
  var toolbar = document.getElementById("scaToolbar");
  if (toolbar) {
    document.body.appendChild(toolbar);
    toolbar.style.display = "";
  }

  // Timer config
  var TOTAL = 12 * 60 * 1000;
  var startTime = 0;
  var pausedTime = 0;
  var running = false;
  var handle = null;

  var clock = document.getElementById("scaClock");
  var startBtn = document.getElementById("scaStartStop");
  var resetBtn = document.getElementById("scaReset");
  var playIcon = document.getElementById("scaPlayIcon");
  var pauseIcon = document.getElementById("scaPauseIcon");

  function formatTime(ms) {
    var tenths = Math.floor(ms / 100) % 10;
    var totalSecs = Math.floor(ms / 1000);
    var secs = totalSecs % 60;
    var mins = Math.floor(totalSecs / 60);
    return (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs + ":" + tenths;
  }

  function tick() {
    var elapsed = pausedTime + (Date.now() - startTime);
    var left = TOTAL - elapsed;
    if (left >= 0) {
      clock.style.color = "";
      clock.textContent = formatTime(left);
    } else {
      clock.style.color = "#f87171";
      clock.textContent = "+" + formatTime(-left);
    }
    if (running) handle = setTimeout(tick, 100);
  }

  startBtn.addEventListener("click", function() {
    if (!running) {
      running = true;
      startTime = Date.now();
      playIcon.style.display = "none";
      pauseIcon.style.display = "block";
      clock.classList.add("sca-toolbar__clock--active");
      tick();
    } else {
      running = false;
      pausedTime += Date.now() - startTime;
      clearTimeout(handle);
      playIcon.style.display = "block";
      pauseIcon.style.display = "none";
      clock.classList.remove("sca-toolbar__clock--active");
    }
  });

  resetBtn.addEventListener("click", function() {
    clearTimeout(handle);
    running = false;
    startTime = 0;
    pausedTime = 0;
    clock.style.color = "";
    clock.textContent = "12:00:0";
    clock.classList.remove("sca-toolbar__clock--active");
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
  });
})();
