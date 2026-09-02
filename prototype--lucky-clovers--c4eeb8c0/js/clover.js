// ============================================================
// clover.js — Lucky Clovers mechanic
// Clovers sit on top of random boxes. Tapping the box collects
// the clover: it pops, arcs up on a rainbow trail, and lands in
// a clover-shaped slot in the tray above the grid. Filling every
// slot triggers a gold coin jackpot celebration.
// ============================================================

var CLOVER_DEFAULT_COUNT = 4;
var CLOVER_MAX = 6;
var CLOVER_REWARD = 500;

// ── Setup ──────────────────────────────────────────────────

function initClovers(lvl) {
  cloverSlots = [];
  cloverFliers = [];
  cloverCoins = [];
  cloverTotal = 0;
  cloversCollected = 0;
  cloverJackpotT = 0;
  cloverRewardT = 0;
  cloverAllDone = false;

  for (var i = 0; i < stock.length; i++) stock[i].hasClover = false;

  // Hand-painted clovers win over the random scatter.
  var painted = [];
  if (lvl && lvl.grid) {
    for (var g = 0; g < lvl.grid.length && g < stock.length; g++) {
      var cell = lvl.grid[g];
      if (!cell || cell.wall || cell.tunnel) continue;
      if (cell.clover && cell.ci >= 0) painted.push(g);
    }
  }

  var chosen = [];
  if (painted.length > 0) {
    for (var p = 0; p < painted.length && p < CLOVER_MAX; p++) chosen.push(painted[p]);
  } else {
    var want = (lvl && lvl.cloverCount !== undefined) ? lvl.cloverCount : CLOVER_DEFAULT_COUNT;
    want = Math.max(0, Math.min(CLOVER_MAX, want));
    if (want > 0) {
      var candidates = [];
      for (var s = 0; s < stock.length; s++) {
        var b = stock[s];
        if (!b || b.isWall || b.isTunnel || b.empty || b.used) continue;
        candidates.push(s);
      }
      shuffle(candidates);
      for (var c = 0; c < want && c < candidates.length; c++) chosen.push(candidates[c]);
    }
  }

  for (var k = 0; k < chosen.length; k++) {
    var box = stock[chosen[k]];
    if (!box || box.isWall || box.isTunnel || box.empty) continue;
    box.hasClover = true;
    box.cloverPhase = Math.random() * Math.PI * 2;
    cloverTotal++;
    cloverSlots.push({ filled: false, popT: 0, ringT: 0 });
  }
}

// ── Tray geometry (recomputed each frame so resize just works) ──

function cloverTrayLayout() {
  var n = Math.max(1, cloverTotal);
  var slotR = 15 * S;
  var gap = 7 * S;
  var padX = 12 * S;
  var innerW = n * slotR * 2 + (n - 1) * gap;
  var panelW = innerW + padX * 2;
  var panelH = slotR * 2 + 10 * S;
  var cy = L.sy - 24 * S;
  var cx = L.cx;
  return {
    cx: cx, cy: cy,
    x: cx - panelW / 2, y: cy - panelH / 2,
    w: panelW, h: panelH,
    slotR: slotR,
    firstX: cx - innerW / 2 + slotR,
    step: slotR * 2 + gap
  };
}

function cloverSlotPos(idx) {
  var t = cloverTrayLayout();
  return { x: t.firstX + idx * t.step, y: t.cy };
}

// ── Collection ─────────────────────────────────────────────

function tryCollectClover(idx) {
  var b = stock[idx];
  if (!b || !b.hasClover) return;
  var target = -1;
  for (var i = 0; i < cloverSlots.length; i++) {
    if (!cloverSlots[i].filled) { target = i; break; }
  }
  if (target < 0) { b.hasClover = false; return; }

  b.hasClover = false;
  var pos = cloverOnBoxPos(b);
  cloverFliers.push({
    x: pos.x, y: pos.y,
    x0: pos.x, y0: pos.y,
    slot: target,
    t: 0,
    hue: Math.random() * 360
  });
  cloverChime(cloversCollected + cloverFliers.length - 1);
}

function cloverOnBoxPos(b) {
  return { x: b.x + L.bw * 0.76, y: b.y + L.bh * 0.2 };
}

// ── Update ─────────────────────────────────────────────────

function updateClovers() {
  if (cloverTotal <= 0) return;

  // Fliers arcing to the tray
  for (var i = cloverFliers.length - 1; i >= 0; i--) {
    var f = cloverFliers[i];
    f.t += 0.028;
    var dest = cloverSlotPos(f.slot);
    var e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
    f.x = f.x0 + (dest.x - f.x0) * e;
    f.y = f.y0 + (dest.y - f.y0) * e - Math.sin(f.t * Math.PI) * 70 * S;

    // Rainbow trail
    for (var q = 0; q < 2; q++) {
      var hue = (tick * 14 + q * 55 + f.hue) % 360;
      particles.push({
        x: f.x + (Math.random() - 0.5) * 5 * S,
        y: f.y + (Math.random() - 0.5) * 5 * S,
        vx: (Math.random() - 0.5) * 0.8 * S,
        vy: (Math.random() - 0.5) * 0.8 * S,
        r: (2 + Math.random() * 2.6) * S,
        color: 'hsl(' + hue + ',95%,62%)',
        life: 0.9, decay: 0.035 + Math.random() * 0.02, grav: false
      });
    }

    if (f.t >= 1) {
      var slot = cloverSlots[f.slot];
      slot.filled = true;
      slot.popT = 1;
      slot.ringT = 1;
      cloversCollected++;
      cloverLandBurst(dest.x, dest.y);
      cloverFliers.splice(i, 1);
      if (cloversCollected >= cloverTotal && !cloverAllDone) startCloverJackpot();
    }
  }

  // Slot animations
  for (var s = 0; s < cloverSlots.length; s++) {
    if (cloverSlots[s].popT > 0) cloverSlots[s].popT = Math.max(0, cloverSlots[s].popT - 0.045);
    if (cloverSlots[s].ringT > 0) cloverSlots[s].ringT = Math.max(0, cloverSlots[s].ringT - 0.03);
  }

  if (cloverJackpotT > 0) cloverJackpotT = Math.max(0, cloverJackpotT - 0.008);
  if (cloverRewardT > 0) cloverRewardT = Math.max(0, cloverRewardT - 0.009);

  updateCloverCoins();
}

function updateCloverCoins() {
  for (var i = cloverCoins.length - 1; i >= 0; i--) {
    var c = cloverCoins[i];
    c.x += c.vx; c.y += c.vy;
    c.vy += 0.26 * S;
    c.vx *= 0.995;
    c.rot += c.vr;
    c.life -= 0.006;
    if (c.life <= 0 || c.y > H + 40 * S) cloverCoins.splice(i, 1);
  }
}

// ── Jackpot ────────────────────────────────────────────────

function startCloverJackpot() {
  cloverAllDone = true;
  cloverJackpotT = 1;
  cloverRewardT = 1;
  var t = cloverTrayLayout();

  // Coin fountain out of the tray
  for (var i = 0; i < 46; i++) {
    var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
    var sp = (5 + Math.random() * 8) * S;
    cloverCoins.push({
      x: t.cx + (Math.random() - 0.5) * t.w * 0.8,
      y: t.cy,
      vx: Math.cos(a) * sp * (0.9 + Math.random() * 0.5),
      vy: Math.sin(a) * sp,
      r: (5 + Math.random() * 4) * S,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.34,
      life: 1
    });
  }

  // Gold confetti
  for (var p = 0; p < 34; p++) {
    var ang = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 6;
    particles.push({
      x: t.cx, y: t.cy,
      vx: Math.cos(ang) * spd * S, vy: Math.sin(ang) * spd * S - 4 * S,
      r: (2.5 + Math.random() * 4) * S,
      color: Math.random() > 0.5 ? '#FFD966' : '#FFF2C0',
      life: 1, decay: 0.008 + Math.random() * 0.008, grav: true
    });
  }
  cloverJackpotSfx();
}

// ── Sound ──────────────────────────────────────────────────

function cloverChime(collectedSoFar) {
  var steps = [660, 784, 880, 1047, 1175, 1319];
  var f = steps[Math.min(collectedSoFar, steps.length - 1)];
  tone(f, 0.16, 'sine', 0.11, f * 1.5);
  setTimeout(function () { tone(f * 2, 0.12, 'triangle', 0.05); }, 70);
}

function cloverJackpotSfx() {
  var notes = [523, 659, 784, 1047, 1319, 1568, 2093];
  notes.forEach(function (f, i) {
    setTimeout(function () { tone(f, 0.22, 'triangle', 0.1); }, i * 80);
  });
  for (var i = 0; i < 10; i++) {
    (function (k) {
      setTimeout(function () {
        tone(1400 + Math.random() * 1400, 0.09, 'sine', 0.045);
      }, 120 + k * 85);
    })(i);
  }
}

function cloverLandBurst(x, y) {
  for (var i = 0; i < 14; i++) {
    var a = Math.PI * 2 * i / 14 + Math.random() * 0.4;
    var sp = 1.5 + Math.random() * 3;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (1.8 + Math.random() * 2.6) * S,
      color: 'hsl(' + ((i * 26) % 360) + ',95%,64%)',
      life: 0.9, decay: 0.03, grav: false
    });
  }
}

// ── Clover shape ───────────────────────────────────────────
// Four heart leaves around a center point, plus a stem.

var CLOVER_LEAF_DIST = 0.44;
var CLOVER_LEAF_R = 0.38;

function drawCloverShape(cx, cy, r, rot, alpha) {
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  // Stem
  ctx.strokeStyle = '#249B57';
  ctx.lineWidth = Math.max(1, r * 0.13);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, r * 0.3);
  ctx.quadraticCurveTo(r * 0.2, r * 0.6, r * 0.06, r * 0.9);
  ctx.stroke();

  // Four round leaves
  var lr = r * CLOVER_LEAF_R;
  var lineW = Math.max(0.7, r * 0.07);
  for (var k = 0; k < 4; k++) {
    var ang = k * Math.PI / 2 + Math.PI / 4;
    var lx = Math.cos(ang) * r * CLOVER_LEAF_DIST;
    var ly = Math.sin(ang) * r * CLOVER_LEAF_DIST;
    var grad = ctx.createRadialGradient(lx - lr * 0.35, ly - lr * 0.35, lr * 0.1, lx, ly, lr);
    grad.addColorStop(0, '#9BF5C2');
    grad.addColorStop(0.6, '#4EE68C');
    grad.addColorStop(1, '#2DB866');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(24,110,60,0.8)';
    ctx.lineWidth = lineW;
    ctx.stroke();
  }

  // Center patch hides the leaf outlines meeting in the middle
  ctx.fillStyle = '#4EE68C';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-r * 0.48, -r * 0.5, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCloverOutline(cx, cy, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(110,92,72,0.45)';
  ctx.fillStyle = 'rgba(110,92,72,0.13)';
  ctx.lineWidth = 1.3 * S;
  var lr = r * CLOVER_LEAF_R;
  for (var k = 0; k < 4; k++) {
    var ang = k * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * r * CLOVER_LEAF_DIST, Math.sin(ang) * r * CLOVER_LEAF_DIST, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Draw: clovers sitting on boxes ─────────────────────────

function drawBoxClovers() {
  if (cloverTotal <= 0) return;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || !b.hasClover) continue;
    if (b.empty || b.used || b.isWall || b.isTunnel) continue;
    var pos = cloverOnBoxPos(b);
    var ph = b.cloverPhase || 0;
    var bob = Math.sin(tick * 0.06 + ph) * 2 * S;
    var rock = Math.sin(tick * 0.05 + ph) * 0.14;
    var r = L.bw * 0.25;
    var ox = 0;
    if (b.shakeT > 0) ox = Math.sin(b.shakeT * 28) * 5 * S * b.shakeT;

    // Gold shimmer behind
    ctx.save();
    var glowA = 0.18 + Math.sin(tick * 0.08 + ph) * 0.1;
    var g = ctx.createRadialGradient(pos.x + ox, pos.y + bob, 0, pos.x + ox, pos.y + bob, r * 2.1);
    g.addColorStop(0, 'rgba(255,224,130,' + glowA + ')');
    g.addColorStop(1, 'rgba(255,224,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pos.x + ox, pos.y + bob, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4 * S;
    ctx.shadowOffsetY = 1.5 * S;
    drawCloverShape(pos.x + ox, pos.y + bob, r, rock);
    ctx.restore();
  }
}

// ── Draw: tray above the grid ──────────────────────────────

function drawCloverTray() {
  if (cloverTotal <= 0) return;
  var t = cloverTrayLayout();
  ctx.save();

  // Panel
  var glowPulse = cloverAllDone ? (0.5 + Math.sin(tick * 0.07) * 0.3) : 0;
  if (glowPulse > 0) {
    ctx.shadowColor = 'rgba(255,214,102,' + (0.5 + glowPulse * 0.5) + ')';
    ctx.shadowBlur = 18 * S * (0.6 + glowPulse * 0.6);
  }
  var pg = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.h);
  pg.addColorStop(0, 'rgba(196,178,152,0.55)');
  pg.addColorStop(1, 'rgba(164,144,118,0.55)');
  ctx.fillStyle = pg;
  rRect(t.x, t.y, t.w, t.h, t.h / 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.strokeStyle = cloverAllDone ? 'rgba(255,214,102,0.85)' : 'rgba(140,120,95,0.45)';
  ctx.lineWidth = (cloverAllDone ? 2 : 1.2) * S;
  rRect(t.x, t.y, t.w, t.h, t.h / 2); ctx.stroke();

  // Slots
  for (var i = 0; i < cloverSlots.length; i++) {
    var sl = cloverSlots[i];
    var p = cloverSlotPos(i);
    if (!sl.filled) {
      drawCloverOutline(p.x, p.y, t.slotR, 0.85);
      continue;
    }
    if (sl.ringT > 0) {
      ctx.save();
      ctx.globalAlpha = sl.ringT * 0.8;
      ctx.strokeStyle = '#FFD966';
      ctx.lineWidth = 2.5 * S * sl.ringT;
      ctx.beginPath();
      ctx.arc(p.x, p.y, t.slotR * (1 + (1 - sl.ringT) * 1.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    var pop = 1 + Math.sin(sl.popT * Math.PI) * 0.35;
    var sway = Math.sin(tick * 0.04 + i) * 0.08;
    ctx.save();
    ctx.shadowColor = 'rgba(45,184,102,0.5)';
    ctx.shadowBlur = 6 * S;
    drawCloverShape(p.x, p.y, t.slotR * 0.92 * pop, sway);
    ctx.restore();
  }

  // Jackpot flash over the panel
  if (cloverJackpotT > 0.72) {
    var fa = (cloverJackpotT - 0.72) / 0.28;
    ctx.globalAlpha = fa * 0.75;
    ctx.fillStyle = 'rgba(255,248,214,0.9)';
    rRect(t.x, t.y, t.w, t.h, t.h / 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Draw: fliers, coins, reward text ───────────────────────

function drawCloverFliers() {
  for (var i = 0; i < cloverFliers.length; i++) {
    var f = cloverFliers[i];
    var pop = f.t < 0.25 ? 1 + Math.sin((f.t / 0.25) * Math.PI) * 0.4 : 1;
    var r = L.bw * 0.25 * pop;
    ctx.save();
    ctx.shadowColor = 'rgba(255,224,130,0.8)';
    ctx.shadowBlur = 10 * S;
    drawCloverShape(f.x, f.y, r, tick * 0.06);
    ctx.restore();
  }
}

function drawCloverCoins() {
  for (var i = 0; i < cloverCoins.length; i++) {
    var c = cloverCoins[i];
    var sx = Math.abs(Math.cos(c.rot)) * 0.85 + 0.15;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, c.life * 1.4));
    ctx.translate(c.x, c.y);
    ctx.scale(sx, 1);
    var g = ctx.createLinearGradient(0, -c.r, 0, c.r);
    g.addColorStop(0, '#FFF0B0');
    g.addColorStop(0.5, '#FFD24A');
    g.addColorStop(1, '#C9932A');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(160,110,20,0.7)';
    ctx.lineWidth = Math.max(0.6, c.r * 0.12);
    ctx.beginPath(); ctx.arc(0, 0, c.r * 0.98, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(-c.r * 0.28, -c.r * 0.3, c.r * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawCloverReward() {
  if (cloverRewardT <= 0) return;
  var t = cloverTrayLayout();
  var prog = 1 - cloverRewardT;
  var rise = prog * 46 * S;
  var scale = prog < 0.18 ? 0.5 + (prog / 0.18) * 0.7 : 1.2 - Math.min(0.2, (prog - 0.18) * 0.5);
  var alpha = cloverRewardT > 0.35 ? 1 : cloverRewardT / 0.35;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(t.cx, t.y - 14 * S - rise);
  ctx.scale(scale, scale);
  ctx.font = 'bold ' + (26 * S) + 'px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4 * S;
  ctx.strokeStyle = 'rgba(120,80,10,0.75)';
  ctx.strokeText('+' + CLOVER_REWARD, 0, 0);
  var tg = ctx.createLinearGradient(0, -14 * S, 0, 14 * S);
  tg.addColorStop(0, '#FFF3C4');
  tg.addColorStop(1, '#FFC42E');
  ctx.fillStyle = tg;
  ctx.fillText('+' + CLOVER_REWARD, 0, 0);
  ctx.restore();
}
