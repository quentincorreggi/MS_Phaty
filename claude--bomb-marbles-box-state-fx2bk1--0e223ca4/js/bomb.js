// ============================================================
// bomb.js — Bomb Marbles Box (box-state wrapper)
// ============================================================
// A box flagged `isBomb` releases each of its marbles as a bomb in
// that marble's own colour. Bombs fall through the funnel at normal
// marble speed with no priority. On reaching the funnel neck — the
// bottleneck just above the conveyor — the bomb detonates: every
// marble inside the blast radius gets an outward impulse, scrambling
// the order in which they were about to reach the belt. The bomb's
// own marble is freed by the blast and carries on as a normal marble.
//
// Rules implemented (matching the design brief's default answers):
//   • Position-based trigger at the neck, never a timer or a tap.
//   • The blast reaches marbles in the funnel only — the belt is untouched.
//   • No chaining: a blast never sets off another bomb early.
//   • Bombs arriving together explode individually.
//   • Nothing is destroyed or recoloured, so a level's colour budget
//     and its win condition are never altered.
// ============================================================

// ── Fuse: 0 while falling normally, ramping to 1 at the neck ──
// Derived from position, not a timer, so the anticipation beat always
// lines up with where the bomb actually is.
function getBombFuse(m) {
  if (!m.isBomb) return 0;
  var top = L.funnelFuseTop, bot = L.funnelNeckY;
  if (bot <= top) return 1;
  var t = (m.y - top) / (bot - top);
  return Math.max(0, Math.min(1, t));
}

// ── Per-frame bomb bookkeeping: arm, detonate, tick down timers ──
// Called from physicsStep() after the substep loop, so detonation
// happens once per frame at the position the marble actually reached.
function updateBombMarbles() {
  for (var i = 0; i < physMarbles.length; i++) {
    var m = physMarbles[i];

    if (m.blastT > 0) m.blastT = Math.max(0, m.blastT - 0.05);
    if (m.freedT > 0) m.freedT = Math.max(0, m.freedT - 0.03);

    if (!m.isBomb) continue;

    m.fuse = getBombFuse(m);

    // Fuse crackle — one short cue as the bomb enters the neck.
    if (!m.fuseCued && m.fuse > 0.55) {
      m.fuseCued = true;
      bombSfx.fuse();
    }

    if (m.y >= L.funnelNeckY) detonateBomb(m);
  }
}

// ── Detonation ──
function detonateBomb(m) {
  if (!m.isBomb) return;
  m.isBomb = false;
  m.fuse = 0;

  var displaced = bombBlast(m.x, m.y, m);

  // The bomb's own marble is freed, not consumed. Bleed off most of its
  // momentum and keep it heading down so it continues onto the conveyor.
  m.vx *= 0.35;
  m.vy = Math.max(m.vy * 0.5, 1.6 * S);
  m.freedT = 1.0;

  spawnBombVFX(m.x, m.y, m.ci);
  bombSfx.blast();

  // The clatter tail — displaced marbles knocking into each other.
  for (var k = 0; k < Math.min(displaced, 4); k++) {
    (function (d) {
      setTimeout(function () { spawnMarbleClick(0.6); }, 90 + d * 70);
    })(k);
  }
}

// ── Blast impulse ──
// Returns how many marbles were displaced (useful for the event the
// brief asks for: "marbles displaced per explosion").
function bombBlast(cx, cy, source) {
  var R = BOMB_BLAST_RADIUS * S;
  var F = BOMB_BLAST_FORCE * S;
  var cap = BOMB_MAX_SPEED * S;
  var displaced = 0;

  for (var i = 0; i < physMarbles.length; i++) {
    var m = physMarbles[i];
    if (m === source) continue;

    var dx = m.x - cx, dy = m.y - cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > R) continue;

    var ang;
    if (d < 0.001) {
      ang = Math.random() * Math.PI * 2;
    } else {
      ang = Math.atan2(dy, dx);
    }

    // The scramble is deliberately imprecise: the player picks the
    // moment, not the outcome.
    ang += (Math.random() - 0.5) * BOMB_SCRAMBLE_JITTER;

    var falloff = 1 - d / R;
    var imp = F * (0.35 + 0.65 * falloff);
    var ix = Math.cos(ang) * imp;
    var iy = Math.sin(ang) * imp;

    // Safeguard: displacement is lateral and local. Damping the upward
    // half of the impulse keeps a blast from reversing a marble's
    // progress back up the funnel.
    if (iy < 0) iy *= BOMB_UP_DAMP;

    // The queue above the neck sits almost directly over the blast, so a
    // purely radial impulse would point straight up — and straight up is
    // what the damping above removes. Guaranteeing a minimum sideways
    // component is what actually shuffles the stack instead of just
    // lifting it, which is the whole point of the mechanic.
    var lat = ix / imp;
    if (Math.abs(lat) < BOMB_MIN_SPLAY) {
      var dir = lat >= 0 ? 1 : -1;
      if (Math.abs(lat) < 0.01) dir = Math.random() < 0.5 ? -1 : 1;
      ix = dir * BOMB_MIN_SPLAY * imp;
    }

    m.vx += ix;
    m.vy += iy;

    // Safeguard: cap the resulting speed so no marble can punch through
    // a funnel wall and end up outside the playable volume.
    var sp = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
    if (sp > cap) { m.vx = m.vx / sp * cap; m.vy = m.vy / sp * cap; }

    m.blastT = 1.0;
    displaced++;
  }

  return displaced;
}

// ── Explosion VFX ──
function spawnBombVFX(x, y, ci) {
  shockwaves.push({ x: x, y: y, t: 1, r1: BOMB_BLAST_RADIUS * S * 1.15, ci: ci });

  // Hot core debris
  for (var i = 0; i < 16; i++) {
    var a = Math.PI * 2 * i / 16 + Math.random() * 0.4;
    var sp = 3 + Math.random() * 6;
    particles.push({
      x: x, y: y, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S * 0.7,
      r: (2 + Math.random() * 4) * S,
      color: Math.random() > 0.45 ? 'rgba(255,214,140,0.95)' : 'rgba(255,160,60,0.9)',
      life: 1, decay: 0.035 + Math.random() * 0.025, grav: false
    });
  }
  // Sparks in the bomb's own colour, so the player can tell which
  // marble just went off.
  for (var i = 0; i < 8; i++) {
    var a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
    particles.push({
      x: x, y: y, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (1.5 + Math.random() * 2.5) * S, color: COLORS[ci].light,
      life: 0.9, decay: 0.03, grav: true
    });
  }
  // Smoke puffs
  for (var i = 0; i < 5; i++) {
    var a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.4;
    particles.push({
      x: x, y: y, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 0.6 * S,
      r: (4 + Math.random() * 4) * S, color: 'rgba(120,110,100,0.35)',
      life: 0.8, decay: 0.016, grav: false
    });
  }
}

function tickShockwaves() {
  for (var i = shockwaves.length - 1; i >= 0; i--) {
    shockwaves[i].t -= 0.055;
    if (shockwaves[i].t <= 0) shockwaves.splice(i, 1);
  }
}

function drawShockwaves() {
  for (var i = 0; i < shockwaves.length; i++) {
    var s = shockwaves[i];
    var p = 1 - s.t;                       // 0 at detonation → 1 at the end
    var r = s.r1 * (0.15 + p * 0.85);
    ctx.save();

    // Flash core, only in the first instant
    if (p < 0.35) {
      var fa = (1 - p / 0.35);
      var fg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 0.7);
      fg.addColorStop(0, 'rgba(255,245,210,' + (0.8 * fa) + ')');
      fg.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }

    // Expanding ring
    ctx.globalAlpha = Math.max(0, s.t) * 0.85;
    ctx.strokeStyle = 'rgba(255,205,130,0.9)';
    ctx.lineWidth = Math.max(1, 3.5 * S * s.t);
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();

    ctx.globalAlpha = Math.max(0, s.t) * 0.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(0.5, 1.2 * S);
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.82, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ── Bomb marble ──
// A sphere in the marble's own colour with a dark mesh over it, so the
// colour stays the dominant read while it falls. No trail, no weight
// cue: a bomb arrives at exactly the same speed as anything else.
function drawBombMarble(x, y, r, ci, es, m) {
  var rs = r * (es || 1);
  var fuse = m ? (m.fuse || 0) : 0;

  // Anticipation glow as the fuse burns down
  if (fuse > 0.25) {
    var g = (fuse - 0.25) / 0.75;
    var pulse = 0.55 + Math.sin(tick * 0.5) * 0.45;
    ctx.save();
    ctx.globalAlpha = g * pulse * 0.55;
    var gg = ctx.createRadialGradient(x, y, rs * 0.6, x, y, rs * (1.7 + g * 0.9));
    gg.addColorStop(0, 'rgba(255,200,110,0.9)');
    gg.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(x, y, rs * (1.7 + g * 0.9), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawMarble(x, y, rs, ci);

  // Mesh shell
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, rs, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = 'rgba(38,30,24,0.42)';
  ctx.lineWidth = Math.max(0.6, rs * 0.09);
  for (var k = -2; k <= 2; k++) {
    var off = (k / 3) * rs;
    // Longitude
    ctx.beginPath();
    ctx.moveTo(x + off, y - rs);
    ctx.quadraticCurveTo(x + off * 1.5, y, x + off, y + rs);
    ctx.stroke();
    // Latitude
    ctx.beginPath();
    ctx.moveTo(x - rs, y + off);
    ctx.quadraticCurveTo(x, y + off * 1.5, x + rs, y + off);
    ctx.stroke();
  }
  // Rim darkening so the sphere still reads as metal
  ctx.strokeStyle = 'rgba(30,24,18,0.45)';
  ctx.lineWidth = Math.max(0.8, rs * 0.16);
  ctx.beginPath(); ctx.arc(x, y, rs, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // Fuse stem + spark
  ctx.save();
  ctx.strokeStyle = 'rgba(70,58,44,0.9)';
  ctx.lineWidth = Math.max(0.8, rs * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + rs * 0.42, y - rs * 0.72);
  ctx.quadraticCurveTo(x + rs * 1.0, y - rs * 1.05, x + rs * 0.78, y - rs * 1.45);
  ctx.stroke();

  var sparkR = rs * (0.2 + fuse * 0.22) * (0.8 + Math.sin(tick * 0.6) * 0.2);
  var sx = x + rs * 0.78, sy = y - rs * 1.45;
  var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sparkR * 2.2);
  sg.addColorStop(0, 'rgba(255,255,230,0.95)');
  sg.addColorStop(0.4, 'rgba(255,190,80,0.8)');
  sg.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(sx, sy, sparkR * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ── The freed marble coming out of the blast ──
// A short bright ring so the player reads "it survived", not "it was destroyed".
function drawFreedHalo(m) {
  if (!m.freedT || m.freedT <= 0) return;
  ctx.save();
  ctx.globalAlpha = m.freedT * 0.85;
  ctx.strokeStyle = COLORS[m.ci].light;
  ctx.lineWidth = Math.max(1, 2.2 * S * m.freedT);
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.r * (1.25 + (1 - m.freedT) * 1.1), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ── The white knock highlight on a marble that was just shoved ──
function drawBlastHighlight(m) {
  if (!m.blastT || m.blastT <= 0) return;
  ctx.save();
  ctx.globalAlpha = m.blastT * 0.55;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(0.8, 1.6 * S);
  ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 1.05, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ── Maze-side box indicator ──
// Drawn on top of any box flagged isBomb, in every state, so the player
// can plan tap order around it. Warm amber rather than red: tapping a
// bomb box is a normal play action, not something to avoid.
function drawBombBoxOverlay(ctx, x, y, w, h, S, tick, dim) {
  ctx.save();
  if (dim) ctx.globalAlpha = 0.6;

  // Reinforced frame
  ctx.strokeStyle = 'rgba(52,42,34,0.55)';
  ctx.lineWidth = 2.2 * S;
  rRect(x + 1.5 * S, y + 1.5 * S, w - 3 * S, h - 3 * S, 5 * S);
  ctx.stroke();

  // Corner rivets
  ctx.fillStyle = 'rgba(52,42,34,0.4)';
  var rv = Math.max(1, w * 0.028);
  var inset = w * 0.11;
  var pts = [[x + inset, y + inset], [x + w - inset, y + inset],
             [x + inset, y + h - inset], [x + w - inset, y + h - inset]];
  for (var i = 0; i < pts.length; i++) {
    ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], rv, 0, Math.PI * 2); ctx.fill();
  }

  // Bomb badge, top-right
  var br = w * 0.17;
  var bx = x + w - br * 1.05, by = y + br * 1.05;

  ctx.fillStyle = 'rgba(246,238,226,0.92)';
  ctx.beginPath(); ctx.arc(bx, by, br * 1.28, 0, Math.PI * 2); ctx.fill();

  var bg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
  bg.addColorStop(0, '#5C4F44');
  bg.addColorStop(1, '#2E2620');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();

  // Badge fuse
  ctx.strokeStyle = '#5C4F44';
  ctx.lineWidth = Math.max(0.8, br * 0.24);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx + br * 0.5, by - br * 0.62);
  ctx.quadraticCurveTo(bx + br * 1.15, by - br * 0.95, bx + br * 0.95, by - br * 1.4);
  ctx.stroke();

  // Badge spark — a slow warm blink, not an alarm
  var blink = 0.6 + Math.sin(tick * 0.12) * 0.4;
  var spx = bx + br * 0.95, spy = by - br * 1.4;
  var sg = ctx.createRadialGradient(spx, spy, 0, spx, spy, br * 0.7);
  sg.addColorStop(0, 'rgba(255,250,225,' + blink + ')');
  sg.addColorStop(0.45, 'rgba(255,190,90,' + (blink * 0.85) + ')');
  sg.addColorStop(1, 'rgba(255,150,50,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(spx, spy, br * 0.7, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── Sound ──
function bombNoiseBurst(dur, vol, cutoff) {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  }
  var src = audioCtx.createBufferSource();
  src.buffer = buf;
  var flt = audioCtx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(cutoff || 1200, t);
  flt.frequency.exponentialRampToValueAtTime(180, t + dur);
  var g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur);
}

var bombSfx = {
  // Release cue when a bomb box is tapped
  release: function () {
    tone(220, 0.16, 'square', 0.05, 520);
    setTimeout(function () { bombNoiseBurst(0.22, 0.05, 3000); }, 40);
  },
  // Rising tension tick as the bomb enters the neck
  fuse: function () {
    tone(520, 0.14, 'triangle', 0.05, 980);
  },
  // The blast itself
  blast: function () {
    bombNoiseBurst(0.34, 0.20, 2400);
    tone(140, 0.30, 'sawtooth', 0.13, 38);
    setTimeout(function () { tone(90, 0.22, 'sine', 0.09, 30); }, 25);
  }
};
