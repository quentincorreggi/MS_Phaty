// ============================================================
// vacuum.js — Vacuum mode: suction visuals + sound
// The whole prototype plays upside down: boxes at the bottom
// (thumb zone), consumers on top, marbles sucked UP through the
// inverted funnel. The layout flip lives in layout.js, the
// suction physics in physics.js, top-edge reveal path in
// game.js. This file holds the vacuum tuning constants and the
// vacuum-specific presentation.
// ============================================================

// Suction tuning (used by physics.js)
var VAC_VIBRATE_FRAMES = 18;  // brief in-place shiver before the pull kicks in
var VAC_RAMP = 0.05;          // suction acceleration gained per frame
var VAC_MAX_ACCEL = 1.1;      // acceleration cap (PHYS_GRAVITY is 0.67 for scale)
var VAC_SPEED_CAP = 9;        // max marble speed under suction
var VAC_WALL_BOUNCE = 0.15;   // funnel walls swallow energy — no rubbery ceiling

// Animated air streams rising through the funnel toward the nozzle.
// Called from drawFunnel() while the funnel body is being drawn.
function drawVacuumStreams(exitL, exitR) {
  var n = 10;
  var dashH = 12 * S;
  ctx.save();
  ctx.lineWidth = 1.5 * S;
  ctx.lineCap = 'round';
  for (var i = 0; i < n; i++) {
    var seed = Math.sin(i * 12.9898) * 43758.5453;
    var frac = seed - Math.floor(seed);
    var phase = (tick * 0.006 * (0.7 + frac * 0.6) + frac) % 1;
    var y = L.funnelBot - phase * L.funnelH;
    // funnel narrows above the bend — squeeze the streams toward the nozzle
    var lo = L.funnelLeft, hi = L.funnelRight;
    if (y < L.funnelBendY) {
      var t = (L.funnelBendY - y) / (L.funnelBendY - L.funnelTop);
      lo = L.funnelLeft + (exitL - L.funnelLeft) * t;
      hi = L.funnelRight + (exitR - L.funnelRight) * t;
    }
    var x = lo + (0.08 + 0.84 * ((i + 0.5) / n)) * (hi - lo);
    var a = Math.sin(phase * Math.PI) * 0.22;
    ctx.strokeStyle = 'rgba(140,120,95,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(x, y + dashH / 2);
    ctx.lineTo(x, y - dashH / 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Soft glow on the nozzle, intensifying while marbles pass through.
function drawVacuumNozzleGlow(exitL, exitR) {
  var near = 0;
  for (var i = 0; i < physMarbles.length; i++) {
    if (physMarbles[i].y < L.funnelBendY) near++;
  }
  var glow = Math.min(0.45, 0.10 + Math.sin(tick * 0.05) * 0.03 + near * 0.08);
  var r = L.funnelOpenW * (1.1 + Math.min(near, 4) * 0.08);
  var g = ctx.createRadialGradient(L.funnelCx, L.funnelTop, 0, L.funnelCx, L.funnelTop, r);
  g.addColorStop(0, 'rgba(255,235,180,' + glow.toFixed(3) + ')');
  g.addColorStop(1, 'rgba(255,235,180,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(L.funnelCx, L.funnelTop, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Suck sound when a box releases its marbles into the vacuum:
// white noise swept upward through a bandpass, low sawtooth body.
function vacuumWhoosh() {
  ensureAudio();
  var t = audioCtx.currentTime;
  var dur = 0.7;
  var len = Math.floor(audioCtx.sampleRate * dur);
  var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  var src = audioCtx.createBufferSource();
  src.buffer = buf;
  var bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(250, t);
  bp.frequency.exponentialRampToValueAtTime(2200, t + dur);
  var g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur);
  tone(90, dur, 'sawtooth', 0.03, 480);
}
