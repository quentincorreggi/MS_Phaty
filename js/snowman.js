// ============================================================
// snowman.js — Snowman mechanic
// A snowman stands on one grid cell, surrounded by a zone of
// snowy cells. Each snowy cell hides a box under opaque snow.
// Playing a box melts every snowy cell orthogonally next to it
// (1 hit each). When the last snowy cell of his zone melts the
// snowman waves goodbye and leaves, revealing a box or an
// empty cell.
//
// Level data:
//   snowman cell : { snowman: true, under: { ci } | null }
//   snowy box    : { ci, type, snow: <snowman cell index> }
//
// Runtime stock fields:
//   snowman cell : isSnowman, sm = { under, zone[], leaving, leaveT, ... }
//   snowy box    : snowOf = snowman index (-1 when melted), snowMeltT
// ============================================================

var SNOW_ZONE_MIN = 2, SNOW_ZONE_MAX = 10, SNOWMEN_MAX = 3;
var SNOW_STUCK_FRAMES = 90;           // frames with no playable move before the rescue melt
var SNOWMAN_LEAVE_SPEED = 1 / 100;    // leaveT per frame
var SNOWMAN_POOF_AT = 0.62;           // leaveT at which he vanishes in sparkles
var SNOW_ZONE_TINTS = ['#7FC8FF', '#C6A6FF', '#6FDDB8'];

// ── Sounds ──

function snowNoise(dur, f0, f1, vol) {
  ensureAudio();
  var t = audioCtx.currentTime;
  var len = Math.floor(audioCtx.sampleRate * dur);
  var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  var flt = audioCtx.createBiquadFilter(); flt.type = 'bandpass'; flt.Q.value = 0.9;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  var g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur);
}

sfx.melt = function () { snowNoise(0.4, 4200, 900, 0.16); tone(1400, 0.15, 'sine', 0.03, 700); };
sfx.nope = function () { tone(220, 0.09, 'square', 0.035, 170); setTimeout(function () { tone(170, 0.12, 'square', 0.035, 130); }, 90); };
sfx.snowmanBye = function () { [784, 988, 1175, 1568].forEach(function (f, i) { setTimeout(function () { tone(f, 0.22, 'triangle', 0.09); }, i * 85); }); };
sfx.snowRescue = function () { snowNoise(0.9, 5000, 600, 0.2); [1568, 1319, 1047, 1319, 1568].forEach(function (f, i) { setTimeout(function () { tone(f, 0.18, 'sine', 0.06); }, 150 + i * 70); }); };

// ── Grid helpers ──

function snowNeighbors(idx, cols, rows) {
  var r = Math.floor(idx / cols), c = idx % cols, n = [];
  if (r > 0) n.push(idx - cols);
  if (r < rows - 1) n.push(idx + cols);
  if (c > 0) n.push(idx - 1);
  if (c < cols - 1) n.push(idx + 1);
  return n;
}

// ── Init (called from initGame after stock is built) ──

function initSnowmen() {
  snowStuckT = 0;
  var order = 0;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b.isSnowman) continue;
    var zone = [];
    for (var j = 0; j < stock.length; j++) if (stock[j].snowOf === i) zone.push(j);
    b.sm.zone = zone;
    b.sm.total = zone.length;
    b.sm.order = order++;
  }
  // Snow that points at a cell without a snowman is ignored
  for (var k = 0; k < stock.length; k++) {
    var s = stock[k];
    if (s.snowOf >= 0 && !(stock[s.snowOf] && stock[s.snowOf].isSnowman)) s.snowOf = -1;
  }
}

function makeSnowmanStock(idx, under) {
  var r = Math.floor(idx / L.cols), c = idx % L.cols;
  return {
    isSnowman: true, isWall: false, isTunnel: false,
    ci: under ? under.ci : 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
    revealed: false, empty: false, boxType: 'default',
    iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
    x: L.sx + c * (L.bw + L.bg), y: L.sy + r * (L.bh + L.bg),
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: Math.random() * Math.PI * 2,
    sm: { under: under || null, zone: [], total: 0, order: 0,
      leaving: false, leaveT: 0, poofed: false,
      lookX: 0, lookY: 0, lookTX: 0, lookTY: 0, lookHold: 0,
      shiverT: 0, smile: 0 }
  };
}

function snowLeftFor(smIdx) {
  var sm = stock[smIdx].sm, n = 0;
  for (var z = 0; z < sm.zone.length; z++) if (stock[sm.zone[z]].snowOf === smIdx) n++;
  return n;
}

function isSnowLeft() {
  for (var i = 0; i < stock.length; i++) if (stock[i].snowOf >= 0) return true;
  return false;
}

// ── Melting ──

function meltSnowCell(idx, big) {
  var b = stock[idx];
  var owner = b.snowOf;
  if (owner < 0) return;
  b.snowOf = -1;
  b.snowMeltT = 1;
  var cx = b.x + L.bw / 2, cy = b.y + L.bh / 2;
  var n = big ? 22 : 14;
  for (var p = 0; p < n; p++) {
    var a = Math.PI * 2 * p / n + Math.random() * 0.4, sp = 1.5 + Math.random() * (big ? 5 : 3.5);
    particles.push({ x: cx + (Math.random() - 0.5) * L.bw * 0.6, y: cy + (Math.random() - 0.5) * L.bh * 0.6,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
      r: (2 + Math.random() * 3.5) * S, color: Math.random() > 0.4 ? '#FFFFFF' : '#D6ECFF',
      life: 1, decay: 0.018 + Math.random() * 0.02, grav: true });
  }
  var sm = stock[owner] && stock[owner].sm;
  if (sm) {
    sm.shiverT = 1;
    sm.lookTX = Math.max(-1, Math.min(1, (b.x - stock[owner].x) / L.bw));
    sm.lookTY = Math.max(-1, Math.min(1, (b.y - stock[owner].y) / L.bh));
    sm.lookHold = 120;
  }
}

// Called when a box is played: melt every snowy cell orthogonally next to it.
function meltAdjacentSnow(idx) {
  var nb = snowNeighbors(idx, L.cols, L.rows), melted = 0;
  for (var i = 0; i < nb.length; i++) {
    if (stock[nb[i]].snowOf >= 0) { meltSnowCell(nb[i], false); melted++; }
  }
  if (melted > 0) sfx.melt();
}

// Runtime rescue: melt everything at once.
function meltAllSnow() {
  var any = false;
  for (var i = 0; i < stock.length; i++) {
    if (stock[i].snowOf >= 0) { meltSnowCell(i, true); any = true; }
  }
  if (any) sfx.snowRescue();
}

// ── Per-frame update (called from update()) ──

function updateSnowmen() {
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.snowMeltT > 0) b.snowMeltT = Math.max(0, b.snowMeltT - 0.035);
    if (!b.isSnowman) continue;
    var sm = b.sm;
    if (sm.shiverT > 0) sm.shiverT = Math.max(0, sm.shiverT - 0.03);
    if (sm.lookHold > 0) sm.lookHold--; else { sm.lookTX = 0; sm.lookTY = 0; }
    sm.lookX += (sm.lookTX - sm.lookX) * 0.12;
    sm.lookY += (sm.lookTY - sm.lookY) * 0.12;
    var left = snowLeftFor(i);
    var targetSmile = sm.total > 0 ? 1 - left / sm.total : 1;
    sm.smile += (targetSmile - sm.smile) * 0.08;

    if (!sm.leaving && left === 0) {
      sm.leaving = true; sm.leaveT = 0;
      sm.lookTX = 0; sm.lookTY = 0.3; sm.lookHold = 999;
    }
    if (sm.leaving) {
      sm.leaveT += SNOWMAN_LEAVE_SPEED;
      if (!sm.poofed && sm.leaveT >= SNOWMAN_POOF_AT) {
        sm.poofed = true;
        sfx.snowmanBye();
        var cx = b.x + L.bw / 2, cy = b.y + L.bh / 2;
        for (var p = 0; p < 30; p++) {
          var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 5;
          particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
            r: (1.5 + Math.random() * 3.5) * S,
            color: ['#FFFFFF', '#D6ECFF', '#FFF6C8', '#BFE3FF'][~~(Math.random() * 4)],
            life: 1, decay: 0.012 + Math.random() * 0.015, grav: false });
        }
      }
      if (sm.leaveT >= 1) finishSnowmanLeave(i);
    }
  }

  // Rescue: no playable move while snow is left
  var stuck = isSnowLeft() && physMarbles.length === 0;
  if (stuck) {
    for (var k = 0; k < stock.length; k++) {
      var s = stock[k];
      if ((s.isSnowman && s.sm.leaving) || s.spawning || s.revealT > 0 || isBoxTappable(k)) { stuck = false; break; }
    }
  }
  snowStuckT = stuck ? snowStuckT + 1 : 0;
  if (snowStuckT >= SNOW_STUCK_FRAMES) { snowStuckT = 0; meltAllSnow(); }
}

function finishSnowmanLeave(idx) {
  var b = stock[idx], under = b.sm.under;
  if (under) {
    stock[idx] = { ci: under.ci, used: false, remaining: MRB_PER_BOX, spawning: false, spawnIdx: 0,
      revealed: false, empty: false, boxType: 'default', isTunnel: false, isWall: false,
      iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
      x: b.x, y: b.y, shakeT: 0, hoverT: 0, popT: 0.6, revealT: 0, emptyT: 0,
      idlePhase: Math.random() * Math.PI * 2 };
  } else {
    stock[idx] = { ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
      revealed: true, empty: true, boxType: 'default', isTunnel: false, isWall: false,
      iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
      x: b.x, y: b.y, shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0 };
  }
  updateBoxReveals(true);
}

// ── Drawing ──

// Draws every zone: frost outlines on melted cells, a snow block
// over each snowy cell (each box keeps its own outline), melting
// cells sliding off, then the snowmen on top.
function drawSnowLayer() {
  var pad = L.bg / 2 + 1 * S;
  var rad = 9 * S;
  for (var i = 0; i < stock.length; i++) {
    var sb = stock[i];
    if (!sb.isSnowman) continue;
    var sm = sb.sm;
    var fade = sm.leaving ? Math.max(0, 1 - sm.leaveT / SNOWMAN_POOF_AT) : 1;

    // Intact snowy cells
    var inSet = {};
    var cells = [];
    for (var z = 0; z < sm.zone.length; z++) {
      if (stock[sm.zone[z]].snowOf === i) { cells.push(sm.zone[z]); inSet[sm.zone[z]] = true; }
    }

    // Frost outline on melted cells (keeps the zone shape readable)
    ctx.save();
    for (var z2 = 0; z2 < sm.zone.length; z2++) {
      var zc = stock[sm.zone[z2]];
      if (inSet[sm.zone[z2]]) continue;
      var a = fade * (zc.snowMeltT > 0 ? 1 - zc.snowMeltT : 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = 'rgba(190,228,255,0.95)';
      ctx.lineWidth = 2.5 * S;
      ctx.setLineDash([5 * S, 3.5 * S]);
      rRect(zc.x - pad * 0.6, zc.y - pad * 0.6, L.bw + pad * 1.2, L.bh + pad * 1.2, rad);
      ctx.stroke();
      ctx.setLineDash([]);
      // frost crystals in the corners
      ctx.fillStyle = 'rgba(235,248,255,0.95)';
      var cs = [[zc.x, zc.y], [zc.x + L.bw, zc.y], [zc.x, zc.y + L.bh], [zc.x + L.bw, zc.y + L.bh]];
      for (var q = 0; q < 4; q++) drawSnowflake(cs[q][0], cs[q][1], 3.2 * S, 1.2 * S);
    }
    ctx.restore();

    if (fade <= 0) { drawSnowman(sb, i); continue; }

    // One snow block per snowy cell, each with its own outline
    ctx.save();
    ctx.globalAlpha = fade;
    for (var c1 = 0; c1 < cells.length; c1++) {
      var cb = stock[cells[c1]];
      var ox = cb.shakeT > 0 ? Math.sin(cb.shakeT * 28) * 5 * S * cb.shakeT : 0;
      var bx = cb.x + ox, by = cb.y;
      // drop shadow
      ctx.fillStyle = 'rgba(90,120,160,0.25)';
      rRect(bx, by + 2.5 * S, L.bw, L.bh, 6 * S); ctx.fill();
      // body
      var g = ctx.createLinearGradient(bx, by, bx, by + L.bh);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.7, '#F1F7FD'); g.addColorStop(1, '#D8E8F6');
      ctx.fillStyle = g;
      rRect(bx, by, L.bw, L.bh, 6 * S); ctx.fill();
      // snow cap bumps hanging over the top edge
      ctx.fillStyle = '#FFFFFF';
      for (var bmp = 0; bmp < 3; bmp++) {
        ctx.beginPath();
        ctx.arc(bx + L.bw * (0.2 + bmp * 0.3), by + 2 * S, L.bw * 0.12, Math.PI, Math.PI * 2);
        ctx.fill();
      }
      // outline so every box reads on its own
      ctx.strokeStyle = 'rgba(120,160,205,0.9)';
      ctx.lineWidth = 1.8 * S;
      rRect(bx, by, L.bw, L.bh, 6 * S); ctx.stroke();
      // faint snowflake + sparkles
      var tw = 0.5 + 0.5 * Math.sin(tick * 0.06 + cells[c1] * 1.7);
      ctx.fillStyle = 'rgba(160,200,240,' + (0.35 + 0.25 * tw) + ')';
      drawSnowflake(bx + L.bw / 2, by + L.bh / 2, L.bw * 0.16, 1.6 * S);
      ctx.fillStyle = 'rgba(255,255,255,' + tw + ')';
      ctx.beginPath(); ctx.arc(bx + L.bw * 0.25, by + L.bh * 0.3, 1.6 * S, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + L.bw * 0.78, by + L.bh * 0.72, 1.3 * S, 0, Math.PI * 2); ctx.fill();
    }
    // small snow mound under the snowman
    ctx.fillStyle = '#F4F9FF';
    ctx.beginPath();
    ctx.ellipse(sb.x + L.bw / 2, sb.y + L.bh * 0.9, L.bw * 0.42, L.bh * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Melting cells: snow slides off and fades
    for (var z3 = 0; z3 < sm.zone.length; z3++) {
      var mc = stock[sm.zone[z3]];
      if (!(mc.snowMeltT > 0)) continue;
      var t = mc.snowMeltT;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.fillStyle = '#F7FBFF';
      var slide = (1 - t) * L.bh * 0.45;
      var sq = 0.6 + 0.4 * t;
      rRect(mc.x, mc.y + slide + (1 - sq) * L.bh, L.bw, L.bh * sq, 6 * S);
      ctx.fill();
      ctx.restore();
    }

    drawSnowman(sb, i);
  }
}

function drawSnowflake(x, y, r, lw) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  for (var k = 0; k < 3; k++) {
    var a = k * Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnowman(b, idx) {
  var sm = b.sm;
  var w = L.bw, h = L.bh;
  var scale = 1, alpha = 1, hop = 0, waveA = 0;
  if (sm.leaving) {
    var t = sm.leaveT;
    if (t < SNOWMAN_POOF_AT) {
      var wt = t / SNOWMAN_POOF_AT;
      hop = Math.abs(Math.sin(wt * Math.PI * 3)) * 4 * S;
      waveA = 1;
    } else {
      var pt = (t - SNOWMAN_POOF_AT) / (1 - SNOWMAN_POOF_AT);
      scale = Math.max(0, 1 - pt * 1.6) * (1 + pt * 0.4);
      alpha = Math.max(0, 1 - pt * 1.8);
      waveA = 1;
    }
  }
  if (alpha <= 0) return;

  var shake = b.shakeT > 0 ? Math.sin(b.shakeT * 28) * 4 * S * b.shakeT : 0;
  var shiver = sm.shiverT > 0 ? Math.sin(tick * 1.3) * 1.8 * S * sm.shiverT : 0;
  var bob = Math.sin(tick * 0.05 + b.idlePhase) * 0.8 * S;

  var cx = b.x + w / 2 + shake + shiver;
  var base = b.y + h * 0.95 - hop;
  var r1 = w * 0.23, r2 = w * 0.17, r3 = w * 0.135;
  var cy1 = base - r1;
  var cy2 = cy1 - r1 * 0.82 - r2 * 0.7 + bob * 0.4;
  var cy3 = cy2 - r2 * 0.8 - r3 * 0.75 + bob;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, base); ctx.scale(scale, scale); ctx.translate(-cx, -base);

  // ground shadow
  ctx.fillStyle = 'rgba(90,120,160,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, base - 1 * S + hop, r1 * 1.15, r1 * 0.28, 0, 0, Math.PI * 2); ctx.fill();

  // arms (twigs) — behind the middle ball
  ctx.strokeStyle = '#7A5230'; ctx.lineWidth = 2.2 * S; ctx.lineCap = 'round';
  var lA = Math.PI + 0.35 + Math.sin(tick * 0.04 + b.idlePhase) * 0.06;
  var rA = waveA > 0 ? -1.1 + Math.sin(tick * 0.35) * 0.45 : -0.35 - Math.sin(tick * 0.04 + b.idlePhase) * 0.06;
  drawTwigArm(cx - r2 * 0.85, cy2, lA, r2 * 1.5);
  drawTwigArm(cx + r2 * 0.85, cy2, rA, r2 * 1.5);

  // balls
  drawSnowBall(cx, cy1, r1);
  drawSnowBall(cx, cy2, r2);
  drawSnowBall(cx, cy3, r3);

  // coal buttons
  ctx.fillStyle = '#2E2A2A';
  for (var k = 0; k < 2; k++) { ctx.beginPath(); ctx.arc(cx, cy2 - r2 * 0.05 + k * r2 * 0.45, 1.6 * S, 0, Math.PI * 2); ctx.fill(); }

  // scarf
  ctx.fillStyle = '#E2453C';
  ctx.beginPath(); ctx.ellipse(cx, cy3 + r3 * 0.88, r3 * 1.05, r3 * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  var tailSwing = Math.sin(tick * 0.08) * 0.08 + sm.shiverT * Math.sin(tick * 0.9) * 0.15;
  ctx.save();
  ctx.translate(cx + r3 * 0.45, cy3 + r3 * 0.95); ctx.rotate(0.15 + tailSwing);
  rRect(-r3 * 0.18, 0, r3 * 0.38, r3 * 0.95, 2 * S); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-r3 * 0.18, r3 * 0.3, r3 * 0.38, r3 * 0.12);
  ctx.restore();

  // face — eyes and nose follow lookX / lookY
  var lx = sm.lookX * r3 * 0.25, ly = sm.lookY * r3 * 0.18;
  var blink = ((tick + Math.floor(b.idlePhase * 50)) % 200) < 6;
  ctx.fillStyle = '#2E2A2A';
  for (var e = -1; e <= 1; e += 2) {
    ctx.beginPath();
    if (blink) ctx.ellipse(cx + e * r3 * 0.36 + lx, cy3 - r3 * 0.18 + ly, 2 * S, 0.6 * S, 0, 0, Math.PI * 2);
    else ctx.arc(cx + e * r3 * 0.36 + lx, cy3 - r3 * 0.18 + ly, 1.9 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  // carrot nose
  var nx = cx + lx * 1.2, ny = cy3 + r3 * 0.08 + ly;
  var dir = sm.lookX < -0.15 ? -1 : 1;
  ctx.fillStyle = '#FF8A2A';
  ctx.beginPath();
  ctx.moveTo(nx, ny - 2.2 * S); ctx.lineTo(nx + dir * r3 * 0.8, ny + 0.6 * S); ctx.lineTo(nx, ny + 2.2 * S);
  ctx.closePath(); ctx.fill();
  // smile: grows as his zone shrinks
  var sml = 0.2 + sm.smile * 0.8;
  ctx.strokeStyle = '#2E2A2A'; ctx.lineWidth = 1.5 * S; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r3 * 0.42 + lx, cy3 + r3 * 0.42 + ly);
  ctx.quadraticCurveTo(cx + lx, cy3 + r3 * (0.42 + 0.4 * sml) + ly, cx + r3 * 0.42 + lx, cy3 + r3 * 0.42 + ly);
  ctx.stroke();
  if (sm.smile > 0.5) {
    ctx.fillStyle = 'rgba(255,140,160,' + ((sm.smile - 0.5) * 0.9) + ')';
    for (var ch = -1; ch <= 1; ch += 2) {
      ctx.beginPath(); ctx.arc(cx + ch * r3 * 0.62 + lx, cy3 + r3 * 0.22 + ly, r3 * 0.16, 0, Math.PI * 2); ctx.fill();
    }
  }

  // knitted hat
  var hy = cy3 - r3 * 0.55;
  ctx.fillStyle = '#E2453C';
  ctx.beginPath();
  ctx.moveTo(cx - r3 * 0.95, hy);
  ctx.quadraticCurveTo(cx - r3 * 0.9, hy - r3 * 1.15, cx, hy - r3 * 1.05);
  ctx.quadraticCurveTo(cx + r3 * 0.9, hy - r3 * 1.15, cx + r3 * 0.95, hy);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  rRect(cx - r3 * 1.0, hy - r3 * 0.22, r3 * 2.0, r3 * 0.34, 3 * S); ctx.fill();
  ctx.strokeStyle = 'rgba(160,30,30,0.45)'; ctx.lineWidth = 1 * S;
  for (var st = -2; st <= 2; st++) {
    ctx.beginPath(); ctx.moveTo(cx + st * r3 * 0.32, hy - r3 * 0.3); ctx.lineTo(cx + st * r3 * 0.32, hy - r3 * 0.9); ctx.stroke();
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(cx, hy - r3 * 1.1, r3 * 0.24, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

function drawSnowBall(x, y, r) {
  var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.75, '#F0F6FC'); g.addColorStop(1, '#C9DCEE');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,150,190,0.45)'; ctx.lineWidth = 1 * S;
  ctx.stroke();
}

function drawTwigArm(x, y, ang, len) {
  var ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  var mx = x + Math.cos(ang) * len * 0.65, my = y + Math.sin(ang) * len * 0.65;
  ctx.beginPath(); ctx.moveTo(mx, my);
  ctx.lineTo(mx + Math.cos(ang - 0.7) * len * 0.3, my + Math.sin(ang - 0.7) * len * 0.3); ctx.stroke();
}

// ── Editor validation (works on the raw 7x7 level grid) ──
// Returns a list of plain-language problems.
function validateSnowmen(grid, cols, rows) {
  cols = cols || 7; rows = rows || 7;
  var out = [];
  var men = [];
  for (var i = 0; i < grid.length; i++) if (grid[i] && grid[i].snowman) men.push(i);
  if (men.length > SNOWMEN_MAX) out.push('Too many snowmen: ' + men.length + ' (max ' + SNOWMEN_MAX + ')');

  // tunnel exit cells
  var exits = {};
  for (var t = 0; t < grid.length; t++) {
    var tc = grid[t];
    if (!tc || !tc.tunnel) continue;
    var r = Math.floor(t / cols), c = t % cols;
    if (tc.dir === 'top') r--; else if (tc.dir === 'left') c--; else if (tc.dir === 'right') c++; else r++;
    if (r >= 0 && r < rows && c >= 0 && c < cols) exits[r * cols + c] = true;
  }

  for (var m = 0; m < men.length; m++) {
    var sIdx = men[m];
    var name = 'Snowman ' + (m + 1);
    var zone = [], inZone = {};
    for (var j = 0; j < grid.length; j++) {
      if (grid[j] && grid[j].snow === sIdx && grid[j].ci >= 0) { zone.push(j); inZone[j] = true; }
    }
    if (zone.length < SNOW_ZONE_MIN || zone.length > SNOW_ZONE_MAX) {
      out.push(name + ': has ' + zone.length + ' snowy cell' + (zone.length === 1 ? '' : 's') + ' (needs ' + SNOW_ZONE_MIN + '–' + SNOW_ZONE_MAX + ')');
    }
    // connected + touching the snowman: flood from the snowman through the zone
    var seen = {}, q = [sIdx], reached = 0;
    seen[sIdx] = true;
    while (q.length) {
      var cur = q.shift();
      var nb = snowNeighbors(cur, cols, rows);
      for (var n = 0; n < nb.length; n++) {
        if (!seen[nb[n]] && inZone[nb[n]]) { seen[nb[n]] = true; reached++; q.push(nb[n]); }
      }
    }
    if (zone.length > 0 && reached < zone.length) out.push(name + ': snow must be one connected patch touching him');

    var bottom = false, badType = false, onExit = !!exits[sIdx], openable = false;
    if (Math.floor(sIdx / cols) === rows - 1) bottom = true;
    for (var z = 0; z < zone.length; z++) {
      var zc = grid[zone[z]];
      if (Math.floor(zone[z] / cols) === rows - 1) bottom = true;
      if (zc.type === 'ice' || zc.type === 'hidden') badType = true;
      if (exits[zone[z]]) onExit = true;
      var zn = snowNeighbors(zone[z], cols, rows);
      for (var k = 0; k < zn.length; k++) {
        var o = grid[zn[k]];
        if (inZone[zn[k]] || !o) continue;
        if (o.ci >= 0 || o.tunnel) openable = true;
      }
    }
    if (bottom) out.push(name + ': no snow or snowman on the bottom row');
    if (badType) out.push(name + ': Ice and "?" boxes can\'t go under snow');
    if (onExit) out.push(name + ': no snow or snowman on a tunnel exit');
    if (zone.length > 0 && !openable) out.push(name + ': zone is walled in — no box next to it from outside');
  }
  return out;
}
