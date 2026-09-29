// ============================================================
// audio.js — Sound effects and rolling sounds
// ============================================================

function ensureAudio() {
  if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
}

function tone(freq, dur, type, vol, ramp) {
  ensureAudio();
  var t = audioCtx.currentTime;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (ramp) o.frequency.exponentialRampToValueAtTime(ramp, t + dur);
  g.gain.setValueAtTime(vol || 0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o.stop(t + dur);
}

// Short filtered noise burst — used for non-tonal hits (foil, sugar).
function noiseBurst(dur, vol, cutoff, cutoffEnd) {
  ensureAudio();
  var t = audioCtx.currentTime;
  var len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  var flt = audioCtx.createBiquadFilter(); flt.type = 'lowpass';
  flt.frequency.setValueAtTime(cutoff, t);
  if (cutoffEnd) flt.frequency.exponentialRampToValueAtTime(cutoffEnd, t + dur);
  var g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur);
}

var sfx = {
  pop: function () { tone(800, 0.12, 'sine', 0.13, 300); },
  // Hit 1 — the wrapper tears: light paper/foil crinkle + a small sparkle
  candyUnwrap: function () {
    noiseBurst(0.05, 0.05, 7000, 3000);
    setTimeout(function () { noiseBurst(0.04, 0.045, 9000, 4000); }, 32);
    setTimeout(function () { noiseBurst(0.05, 0.035, 6000, 2500); }, 68);
    tone(1400, 0.07, 'triangle', 0.04, 2200);
  },
  // Hit 2 — the candy cracks: hard and glassy, a step up from the wrapper
  candyCrack: function () {
    tone(900, 0.10, 'square', 0.07, 420);
    noiseBurst(0.12, 0.10, 8000, 1200);
    setTimeout(function () { tone(1600, 0.08, 'triangle', 0.05, 900); }, 40);
  },
  // Hit 3 — the candy shatters and the colour is finally revealed.
  // The loudest, most rewarding beat of the three.
  candyShatter: function () {
    noiseBurst(0.30, 0.16, 9000, 800);
    tone(600, 0.12, 'square', 0.08, 200);
    [1046, 1318, 1568].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.16, 'sine', 0.09); }, 60 + i * 70);
    });
  },
  drop: function () { tone(400, 0.08, 'sine', 0.04, 200); },
  sort: function () { tone(600, 0.1, 'triangle', 0.1); setTimeout(function () { tone(900, 0.1, 'triangle', 0.1); }, 80); },
  complete: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.2, 'sine', 0.1); }, i * 90); }); },
  win: function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { setTimeout(function () { tone(f, 0.25, 'sine', 0.12); }, i * 100); }); }
};

function spawnMarbleClick(intensity) {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  var baseFreq = 800 + Math.random() * 1200;
  o.type = 'sine';
  o.frequency.setValueAtTime(baseFreq, t);
  o.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, t + 0.12);
  var vol = 0.015 + intensity * 0.025 * (0.4 + Math.random() * 0.6);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.003);
  g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15 + Math.random() * 0.1);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + 0.3);
}

function updateRollingSound() {
  if (!audioCtx) return;
  var count = physMarbles.length;
  if (count === 0) return;
  var avgSpeed = 0;
  for (var i = 0; i < count; i++) {
    var m = physMarbles[i];
    avgSpeed += Math.sqrt(m.vx * m.vx + m.vy * m.vy);
  }
  avgSpeed /= count;
  var speedFactor = Math.min(avgSpeed / (5 * S), 1.0);
  var countFactor = Math.min(count / 8, 1.0);
  if (speedFactor < 0.05) return;
  var clickInterval = Math.max(2, Math.round(10 - 8 * countFactor * speedFactor));
  if (tick % clickInterval === 0) spawnMarbleClick(countFactor * speedFactor);
}
