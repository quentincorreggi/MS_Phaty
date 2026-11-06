// ============================================================
// snowman.js — Snowman mechanic
//
// One 2x2 snowman per level (level.snowman = top-left cell index).
// He sits ABOVE the 4 cells under him: they are hidden, untappable,
// and block paths like walls until he leaves.
//
// Snowy boxes (box_snowy.js) hide their colour. The moment one opens
// (gets a path to the bottom), its snow flies to the snowman and the
// box becomes a normal box.
//
// Build: 3 stages (base ball → middle ball → head). The snowy box count
// splits the stages evenly: 3 boxes = 1 stage each, 6 = half a stage
// each, 9 = a third each. After the last one: face, wink, goodbye —
// the 4 cells under him are freed.
// ============================================================

var snowman = null;
var snowFlyers = [];
var SNOW_STAGES = 3;

// ── Sounds (soft noise "poof" + packing thump) ──
function snowNoise(dur, vol, freq) {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var len = Math.floor(audioCtx.sampleRate * dur);
  var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  var f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  var g = audioCtx.createGain(); g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur);
}
sfx.snowPuff = function () { snowNoise(0.25, 0.18, 2200); tone(1200, 0.15, 'sine', 0.04, 1800); };
sfx.snowPack = function () { snowNoise(0.18, 0.3, 700); tone(180, 0.15, 'sine', 0.12, 90); };
sfx.snowFace = function () { [784, 988, 1175].forEach(function (f, i) { setTimeout(function () { tone(f, 0.18, 'triangle', 0.09); }, i * 70); }); };
sfx.snowWink = function () { tone(1400, 0.1, 'sine', 0.08, 2000); };
sfx.snowBye = function () { snowNoise(0.4, 0.2, 3000); [1047, 1319, 1568, 2093].forEach(function (f, i) { setTimeout(function () { tone(f, 0.22, 'sine', 0.08); }, i * 80); }); };

// ── Init (called from initGame after stock is built, before reveals) ──
function initSnowman(lvl) {
  snowman = null;
  snowFlyers = [];
  var total = 0;
  for (var i = 0; i < stock.length; i++) {
    stock[i].underSnowman = false;
    stock[i].snowPuffT = 0;
    if (!stock[i].isTunnel && !stock[i].isWall && !stock[i].empty && stock[i].boxType === 'snowy') total++;
  }
  if (lvl.snowman === undefined || lvl.snowman === null || lvl.snowman < 0) return;
  var r = Math.floor(lvl.snowman / L.cols), c = lvl.snowman % L.cols;
  if (r > L.rows - 2) r = L.rows - 2;
  if (c > L.cols - 2) c = L.cols - 2;
  var cells = [r * L.cols + c, r * L.cols + c + 1, (r + 1) * L.cols + c, (r + 1) * L.cols + c + 1];
  for (var k = 0; k < cells.length; k++) {
    var b = stock[cells[k]];
    b.underSnowman = true;
    // Anything under him stays a plain box (no snow under the snowman)
    if (b.boxType === 'snowy') { b.boxType = 'default'; total--; }
  }
  var tl = stock[cells[0]];
  snowman = {
    cells: cells,
    x: tl.x, y: tl.y,
    w: 2 * L.bw + L.bg, h: 2 * L.bh + L.bg,
    total: total, arrived: 0,
    from: 0, target: 0, shown: 0, animT: 0,
    bounceT: 0, shakeT: 0,
    phase: 'build', finT: 0,
    lastFlyTick: -1, flyStack: 0
  };
}

function isSnowmanActive() { return !!(snowman && snowman.phase !== 'gone'); }

function snowmanHitTest(px, py) {
  if (!isSnowmanActive()) return false;
  return px >= snowman.x && px <= snowman.x + snowman.w && py >= snowman.y && py <= snowman.y + snowman.h;
}

// ── Called by updateBoxReveals when a snowy box opens ──
function onSnowyRevealed(b, animate) {
  b.boxType = 'default';
  b.snowPuffT = animate ? 1 : 0;
  var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
  if (animate) {
    for (var p = 0; p < 14; p++) {
      var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      particles.push({ x: bx, y: by - L.bh * 0.2, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
        r: (2 + Math.random() * 3.5) * S, color: Math.random() > 0.4 ? '#FFFFFF' : '#D6E8F7',
        life: 0.9, decay: 0.025 + Math.random() * 0.02, grav: false });
    }
    sfx.snowPuff();
  }
  if (!isSnowmanActive() || snowman.total <= 0) return;
  // Stagger flyers launched on the same frame (one pick opening two boxes)
  if (snowman.lastFlyTick === tick) snowman.flyStack++; else { snowman.flyStack = 0; snowman.lastFlyTick = tick; }
  snowFlyers.push({ x0: bx, y0: by, t: -0.35 * snowman.flyStack, seed: Math.random() * 10 });
}

// ── Geometry of the snowman figure at progress p (0..3) ──
function snowmanGeom(p) {
  var sm = snowman;
  var w = sm.w;
  var cx = sm.x + sm.w / 2;
  var ground = sm.y + sm.h - sm.h * 0.05;
  var Rb = w * 0.27, Rm = w * 0.2, Rh = w * 0.15;
  var kb = Math.max(0, Math.min(1, p));
  var km = Math.max(0, Math.min(1, p - 1));
  var kh = Math.max(0, Math.min(1, p - 2));
  var rb = Rb * kb, rm = Rm * km, rh = Rh * kh;
  var by = ground - rb * 0.95;
  var my = by - rb * 0.8 - rm * 0.8;
  var hy = my - rm * 0.8 - rh * 0.85;
  if (rm <= 0) hy = my;
  return { cx: cx, ground: ground, rb: rb, by: by, rm: rm, my: my, rh: rh, hy: hy, kb: kb };
}

function snowmanTopPoint() {
  var g = snowmanGeom(Math.max(snowman.target, 0.3));
  if (g.rh > 0) return { x: g.cx, y: g.hy };
  if (g.rm > 0) return { x: g.cx, y: g.my };
  return { x: g.cx, y: g.by - g.rb * 0.3 };
}

function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// ── Per-frame update (called from game.js update) ──
function updateSnowman() {
  if (!snowman) return;
  var sm = snowman;

  // Flyers
  for (var i = snowFlyers.length - 1; i >= 0; i--) {
    var f = snowFlyers[i];
    f.t += 0.028;
    if (f.t >= 1) {
      snowFlyers.splice(i, 1);
      sm.arrived++;
      sm.from = sm.shown;
      sm.target = Math.min(SNOW_STAGES, SNOW_STAGES * sm.arrived / sm.total);
      sm.animT = 1;
      sm.bounceT = 1;
      var tp = snowmanTopPoint();
      for (var p = 0; p < 16; p++) {
        var a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
        particles.push({ x: tp.x, y: tp.y, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
          r: (2 + Math.random() * 3) * S, color: Math.random() > 0.3 ? '#FFFFFF' : '#CFE1F0',
          life: 0.8, decay: 0.03 + Math.random() * 0.02, grav: true });
      }
      sfx.snowPack();
    }
  }

  // Build anim
  if (sm.animT > 0) {
    sm.animT = Math.max(0, sm.animT - 0.035);
    sm.shown = sm.from + (sm.target - sm.from) * easeOutBack(1 - sm.animT);
  } else {
    sm.shown = sm.target;
  }
  if (sm.bounceT > 0) sm.bounceT = Math.max(0, sm.bounceT - 0.04);
  if (sm.shakeT > 0) sm.shakeT = Math.max(0, sm.shakeT - 0.04);

  // Finale: face → wink → goodbye
  if (sm.phase === 'build' && sm.total > 0 && sm.arrived >= sm.total && sm.animT <= 0 && snowFlyers.length === 0) {
    sm.phase = 'finale'; sm.finT = 0;
    sfx.snowFace();
  }
  if (sm.phase === 'finale') {
    sm.finT++;
    var g = snowmanGeom(SNOW_STAGES);
    if (sm.finT === 62) sfx.snowWink();
    if (sm.finT === 100) {
      sfx.snowBye();
      spawnConfetti(g.cx, g.my, 20);
    }
    if (sm.finT >= 100 && sm.finT < 135 && sm.finT % 3 === 0) {
      for (var q = 0; q < 4; q++) {
        particles.push({ x: g.cx + (Math.random() - 0.5) * sm.w * 0.8, y: g.my + (Math.random() - 0.5) * sm.h * 0.9,
          vx: (Math.random() - 0.5) * 2 * S, vy: -(1 + Math.random() * 2) * S,
          r: (1.5 + Math.random() * 2.5) * S, color: Math.random() > 0.5 ? '#FFFFFF' : '#BFE3FF',
          life: 1, decay: 0.03, grav: false });
      }
    }
    if (sm.finT >= 135) {
      sm.phase = 'gone';
      for (var k = 0; k < sm.cells.length; k++) {
        var b = stock[sm.cells[k]];
        b.underSnowman = false;
        b.popT = 0.8;
      }
      updateBoxReveals(true);
    }
  }
}

// ── Drawing ──
function drawSnowBall(cx, cy, r) {
  if (r <= 0.5) return;
  var grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.65, '#F1F6FB');
  grad.addColorStop(1, '#C9DCEC');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(130,170,205,0.55)'; ctx.lineWidth = 1.2 * S;
  ctx.stroke();
  // packed-snow texture
  ctx.fillStyle = 'rgba(150,190,225,0.25)';
  for (var i = 0; i < 4; i++) {
    var a = i * 1.7 + r * 0.01;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.5, r * 0.07, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSnowman() {
  if (!isSnowmanActive()) return;
  var sm = snowman;
  var g = snowmanGeom(sm.shown);
  var ox = sm.shakeT > 0 ? Math.sin(sm.shakeT * 28) * 5 * S * sm.shakeT : 0;

  var exitK = 0;
  if (sm.phase === 'finale' && sm.finT > 100) exitK = Math.min(1, (sm.finT - 100) / 35);

  ctx.save();
  ctx.translate(ox, 0);
  ctx.globalAlpha = 1 - exitK;

  // Ground: a lumpy snow patch covering all 4 cells
  ctx.save();
  ctx.shadowColor = 'rgba(60,90,130,0.2)'; ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 2 * S;
  var gg = ctx.createLinearGradient(sm.x, sm.y, sm.x, sm.y + sm.h);
  gg.addColorStop(0, '#F7FBFF'); gg.addColorStop(1, '#D3E4F2');
  ctx.fillStyle = gg;
  rRect(sm.x, sm.y, sm.w, sm.h, 12 * S); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(140,185,220,0.8)'; ctx.lineWidth = 1.5 * S;
  rRect(sm.x, sm.y, sm.w, sm.h, 12 * S); ctx.stroke();

  // Squash-and-grow bounce, anchored on the ground
  var bt = sm.bounceT;
  var sq = Math.sin(bt * Math.PI) * 0.12;
  ctx.translate(g.cx, g.ground);
  ctx.scale((1 + sq) * (1 + exitK * 0.25), (1 - sq) * (1 + exitK * 0.25));
  ctx.translate(-g.cx, -g.ground);

  // Lumpy mound — shrinks away as the base ball forms
  var moundK = 1 - g.kb;
  if (moundK > 0.01) {
    ctx.save();
    ctx.beginPath(); rRect(sm.x, sm.y - sm.h, sm.w, sm.h * 2, 12 * S); ctx.clip();
    var lumps = [
      [-0.28, -0.12, 0.2], [0.27, -0.1, 0.21], [0, -0.2, 0.26], [-0.12, -0.32, 0.17],
      [0.15, -0.34, 0.16], [-0.34, -0.03, 0.13], [0.36, -0.02, 0.12]
    ];
    for (var i = 0; i < lumps.length; i++) {
      var L0 = lumps[i];
      var lr = sm.w * L0[2] * 1.3 * (0.45 + 0.55 * moundK);
      drawSnowBall(g.cx + sm.w * L0[0] * (0.5 + 0.5 * moundK), g.ground + sm.h * L0[1] * (0.4 + 0.6 * moundK) + sm.h * 0.04, lr);
    }
    ctx.restore();
  }

  // Ground shadow
  if (g.rb > 0) {
    ctx.fillStyle = 'rgba(90,130,170,0.18)';
    ctx.beginPath(); ctx.ellipse(g.cx, g.ground, g.rb * 1.05, g.rb * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }
  drawSnowBall(g.cx, g.by, g.rb);
  drawSnowBall(g.cx, g.my, g.rm);

  // Head (with face pop-in at the finale)
  var headPop = 0;
  if (sm.phase === 'finale') headPop = Math.sin(Math.min(1, sm.finT / 20) * Math.PI) * 0.15;
  ctx.save();
  ctx.translate(g.cx, g.hy); ctx.scale(1 + headPop, 1 + headPop); ctx.translate(-g.cx, -g.hy);
  drawSnowBall(g.cx, g.hy, g.rh);
  if (sm.phase === 'finale' && g.rh > 0) drawSnowmanFace(g.cx, g.hy, g.rh, sm.finT);
  ctx.restore();

  ctx.restore();

  // Progress pips (one per snowy box) under the snowman
  if (sm.total > 0 && sm.phase === 'build') {
    var pipR = 2.6 * S, gap = 8 * S;
    var startX = sm.x + sm.w / 2 - (sm.total - 1) * gap / 2;
    var py = sm.y + sm.h - 6 * S;
    // Soft pill behind the pips so they read over the snow
    ctx.fillStyle = 'rgba(90,140,190,0.18)';
    rRect(startX - gap * 0.75, py - pipR * 1.9, (sm.total - 1) * gap + gap * 1.5, pipR * 3.8, pipR * 1.9); ctx.fill();
    for (var k = 0; k < sm.total; k++) {
      ctx.fillStyle = k < sm.arrived ? '#FFFFFF' : 'rgba(120,160,200,0.45)';
      ctx.beginPath(); ctx.arc(startX + k * gap, py, pipR, 0, Math.PI * 2); ctx.fill();
      if (k < sm.arrived) { ctx.strokeStyle = 'rgba(110,160,210,0.9)'; ctx.lineWidth = 1 * S; ctx.stroke(); }
    }
  }
}

function drawSnowmanFace(cx, cy, r, finT) {
  var a = Math.min(1, finT / 18);
  ctx.save();
  ctx.globalAlpha *= a;
  var eyeY = cy - r * 0.18, eyeDX = r * 0.36, eyeR = r * 0.12;
  // Left eye
  ctx.fillStyle = '#2A2A33';
  ctx.beginPath(); ctx.arc(cx - eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
  // Right eye — winks between frames 55 and 80
  var winking = finT >= 55 && finT <= 80;
  if (winking) {
    ctx.strokeStyle = '#2A2A33'; ctx.lineWidth = eyeR * 0.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx + eyeDX, eyeY + eyeR * 0.3, eyeR * 1.1, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(cx + eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
  }
  // Eye shine
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(cx - eyeDX + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.3, 0, Math.PI * 2); ctx.fill();
  if (!winking) { ctx.beginPath(); ctx.arc(cx + eyeDX + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.3, 0, Math.PI * 2); ctx.fill(); }
  // Carrot nose
  var noseY = cy + r * 0.08;
  var ng = ctx.createLinearGradient(cx, noseY, cx + r * 0.75, noseY);
  ng.addColorStop(0, '#FF8A2A'); ng.addColorStop(1, '#E85D10');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.02, noseY - r * 0.1);
  ctx.lineTo(cx + r * 0.72, noseY + r * 0.06);
  ctx.lineTo(cx - r * 0.02, noseY + r * 0.12);
  ctx.closePath(); ctx.fill();
  // Coal smile
  ctx.fillStyle = '#2A2A33';
  for (var i = 0; i < 5; i++) {
    var ang = Math.PI * (0.2 + i * 0.15);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * r * 0.5, cy + r * 0.12 + Math.sin(ang) * r * 0.42, r * 0.065, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Snow puffs flying from a revealed box to the snowman
function drawSnowFlyers() {
  if (!snowman || snowFlyers.length === 0) return;
  var tp = snowmanTopPoint();
  for (var i = 0; i < snowFlyers.length; i++) {
    var f = snowFlyers[i];
    if (f.t <= 0) continue;
    var cx1 = (f.x0 + tp.x) / 2, cy1 = Math.min(f.y0, tp.y) - snowman.h * 0.8;
    for (var k = 0; k < 6; k++) {
      var t = Math.max(0, f.t - k * 0.035);
      var u = 1 - t;
      var x = u * u * f.x0 + 2 * u * t * cx1 + t * t * tp.x;
      var y = u * u * f.y0 + 2 * u * t * cy1 + t * t * tp.y;
      var r = (8 - k * 1.1) * S * (1 + 0.15 * Math.sin(f.seed + k + f.t * 10));
      ctx.globalAlpha = 1 - k * 0.14;
      ctx.fillStyle = k === 0 ? '#FFFFFF' : (k % 2 ? '#EAF4FC' : '#FFFFFF');
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (k === 0) { ctx.strokeStyle = 'rgba(150,195,230,0.7)'; ctx.lineWidth = 1 * S; ctx.stroke(); }
    }
  }
  ctx.globalAlpha = 1;
}
