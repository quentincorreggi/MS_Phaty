// ============================================================
// rocket_blocker.js — 2×2 Rocket Blocker mechanic
// ============================================================
// A 2×2 metallic panel sits over 4 hidden boxes.
// It shows 4 colour-coded rockets — one per required sort colour.
// When all 4 required sort columns clear, rockets fire:
//   • 4 random boxes are destroyed
//   • The 4 hidden boxes are revealed
// ============================================================

var rocketBlockers = [];
var rocketProjectiles = [];

// ── Init ─────────────────────────────────────────────────────

function initRocketBlockers() {
  rocketBlockers = [];
  rocketProjectiles = [];
}

// ── Hook: called when a sort column box of colour ci clears ──

function onSortColumnCleared(ci) {
  for (var i = 0; i < rocketBlockers.length; i++) {
    var rb = rocketBlockers[i];
    if (rb.fired || rb.fireT > 0) continue;
    for (var r = 0; r < 4; r++) {
      if (rb.colors[r] === ci && !rb.satisfied[r]) {
        rb.satisfied[r] = true;
        rb.satisfiedT[r] = 1.0;
        var pos = getRocketPanelPos(rb, r);
        spawnBurst(pos.x, pos.y, COLORS[ci].fill, 12);
        if (rb.satisfied[0] && rb.satisfied[1] && rb.satisfied[2] && rb.satisfied[3]) {
          rb.fireT = 1.0;
          rb.shakeT = 1.0;
          if (typeof sfx !== 'undefined' && sfx.win) sfx.win();
        } else {
          if (typeof sfx !== 'undefined' && sfx.sort) sfx.sort();
        }
        break;
      }
    }
  }
}

// ── Update ───────────────────────────────────────────────────

function updateRocketBlockers() {
  for (var i = 0; i < rocketBlockers.length; i++) {
    var rb = rocketBlockers[i];
    for (var r = 0; r < 4; r++) {
      if (rb.satisfiedT[r] > 0) rb.satisfiedT[r] = Math.max(0, rb.satisfiedT[r] - 0.04);
    }
    if (rb.fired) continue;
    if (rb.shakeT > 0) rb.shakeT = Math.max(0, rb.shakeT - 0.012);
    if (rb.fireT > 0) {
      rb.fireT -= 0.012;
      if (rb.fireT <= 0) {
        rb.fireT = 0;
        rb.fired = true;
        launchRockets(rb);
      }
    }
  }

  // Update in-flight projectiles
  for (var i = rocketProjectiles.length - 1; i >= 0; i--) {
    var p = rocketProjectiles[i];
    p.t += 0.02;
    if (p.t < p.delay) continue;
    p.progress = Math.min(1, p.progress + 0.024);

    // Trail particles
    if (p.progress < 1 && tick % 2 === 0) {
      var pp = getRocketProjectileXY(p);
      particles.push({ x: pp.x, y: pp.y,
        vx: (Math.random() - 0.5) * S, vy: (Math.random() - 0.5) * S,
        r: (1.5 + Math.random() * 2) * S, color: COLORS[p.ci].light,
        life: 0.5, decay: 0.055, grav: false });
    }

    if (p.progress >= 1) {
      destroyBoxByRocket(p.targetIdx, p.ci);
      rocketProjectiles.splice(i, 1);
    }
  }

  // When all projectiles have landed, reveal hidden boxes
  if (rocketProjectiles.length === 0) {
    for (var i = 0; i < rocketBlockers.length; i++) {
      var rb = rocketBlockers[i];
      if (rb.fired && !rb.revealed) {
        revealRocketBlockerHidden(rb);
      }
    }
  }
}

// ── Launch ───────────────────────────────────────────────────

function launchRockets(rb) {
  var targets = [];
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.empty || b.used || b.isWall || b.isTunnel) continue;
    if (b.isRocketBlocker || b.isRocketBlockerSlave) continue;
    targets.push(i);
  }
  shuffle(targets);
  var count = Math.min(4, targets.length);
  var cx = getRBCenterX(rb), cy = getRBCenterY(rb);
  spawnBurst(cx, cy, '#FFD700', 30);
  spawnConfetti(cx, cy, 20);
  for (var t = 0; t < count; t++) {
    var pos = getRocketPanelPos(rb, t);
    rocketProjectiles.push({
      ci: rb.colors[t], targetIdx: targets[t],
      sx: pos.x, sy: pos.y,
      delay: t * 0.22, t: 0, progress: 0
    });
  }
}

// ── Destroy box on impact ─────────────────────────────────────

function destroyBoxByRocket(idx, ci) {
  if (idx < 0 || idx >= stock.length) return;
  var b = stock[idx];
  if (!b || b.empty || b.used || b.isWall || b.isTunnel) return;
  var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
  spawnBurst(bx, by, COLORS[ci].fill, 20);
  spawnBurst(bx, by, COLORS[b.ci].fill, 14);
  spawnConfetti(bx, by, 10);
  b.used = true; b.remaining = 0; b.emptyT = 1.0;
  if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
  updateBoxReveals(true);
}

// ── Reveal hidden boxes ───────────────────────────────────────

function revealRocketBlockerHidden(rb) {
  rb.revealed = true;
  var b0 = stock[rb.primaryIdx];
  if (!b0) return;
  var indices = [
    rb.primaryIdx,
    rb.primaryIdx + 1,
    rb.primaryIdx + L.cols,
    rb.primaryIdx + L.cols + 1
  ];
  for (var i = 0; i < 4; i++) {
    var idx = indices[i];
    if (idx >= stock.length) continue;
    var sx = stock[idx].x, sy = stock[idx].y;
    var hidden = rb.hiddenBoxes[i];
    if (!hidden || hidden.ci === undefined || hidden.ci < 0) {
      stock[idx] = makeRBEmptyCell(sx, sy);
    } else {
      stock[idx] = makeRBBoxCell(hidden.ci, hidden.type || 'default', sx, sy);
      spawnBurst(sx + L.bw / 2, sy + L.bh / 2, COLORS[hidden.ci].fill, 18);
    }
  }
  if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
  updateBoxReveals(true);
}

function makeRBEmptyCell(sx, sy) {
  return { ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
    revealed: true, empty: true, boxType: 'default', isTunnel: false, isWall: false,
    isRocketBlocker: false, isRocketBlockerSlave: false,
    iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
    x: sx, y: sy, shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0,
    idlePhase: Math.random() * Math.PI * 2 };
}

function makeRBBoxCell(ci, type, sx, sy) {
  return { ci: ci, used: false, remaining: MRB_PER_BOX, spawning: false, spawnIdx: 0,
    revealed: false, empty: false, boxType: type, isTunnel: false, isWall: false,
    isRocketBlocker: false, isRocketBlockerSlave: false,
    iceHP: type === 'ice' ? 2 : 0, iceCrackT: 0, iceShatterT: 0,
    blockerCount: type === 'blocker' ? BLOCKER_PER_BOX : 0,
    x: sx, y: sy, shakeT: 0, hoverT: 0, popT: 0, revealT: 1.0, emptyT: 0,
    idlePhase: Math.random() * Math.PI * 2 };
}

// ── Coordinate helpers ────────────────────────────────────────

function getRBCenterX(rb) {
  var b = stock[rb.primaryIdx]; if (!b) return 0;
  return b.x + L.bw + L.bg / 2;
}
function getRBCenterY(rb) {
  var b = stock[rb.primaryIdx]; if (!b) return 0;
  return b.y + L.bh + L.bg / 2;
}
function getRocketPanelPos(rb, r) {
  var b = stock[rb.primaryIdx]; if (!b) return { x: 0, y: 0 };
  var tw = 2 * L.bw + L.bg, th = 2 * L.bh + L.bg;
  return {
    x: b.x + ((r % 2) + 0.5) * (tw / 2),
    y: b.y + (Math.floor(r / 2) + 0.5) * (th / 2)
  };
}
function getRocketProjectileXY(p) {
  var tb = stock[p.targetIdx];
  if (!tb) return { x: p.sx, y: p.sy };
  var tx = tb.x + L.bw / 2, ty = tb.y + L.bh / 2;
  var t = p.progress;
  var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return {
    x: p.sx + (tx - p.sx) * e,
    y: p.sy + (ty - p.sy) * e - Math.sin(t * Math.PI) * 70 * S
  };
}

// ── Drawing ───────────────────────────────────────────────────

function drawRocketBlockers() {
  for (var i = 0; i < rocketBlockers.length; i++) {
    if (!rocketBlockers[i].revealed) drawRocketBlockerPanel(rocketBlockers[i]);
  }
  drawRocketProjectilesAll();
}

function drawRocketBlockerPanel(rb) {
  var b = stock[rb.primaryIdx]; if (!b) return;
  var x = b.x, y = b.y;
  var tw = 2 * L.bw + L.bg, th = 2 * L.bh + L.bg;

  var sox = 0, soy = 0;
  if (rb.shakeT > 0) {
    sox = Math.sin(rb.shakeT * 42) * 3 * S * rb.shakeT;
    soy = Math.cos(rb.shakeT * 38) * 2 * S * rb.shakeT;
  }

  ctx.save();
  ctx.translate(x + tw / 2 + sox, y + th / 2 + soy);

  // Panel shadow + body
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 14 * S;
  ctx.shadowOffsetY = 5 * S;
  var pg = ctx.createLinearGradient(-tw / 2, -th / 2, tw / 2, th / 2);
  pg.addColorStop(0, '#4c4f5e');
  pg.addColorStop(0.45, '#2c2f3e');
  pg.addColorStop(1, '#1c1f2e');
  ctx.fillStyle = pg;
  rRect(-tw / 2, -th / 2, tw, th, 9 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Metallic border
  ctx.strokeStyle = '#6c6f7e'; ctx.lineWidth = 2.5 * S;
  rRect(-tw / 2, -th / 2, tw, th, 9 * S); ctx.stroke();

  // Inner bevel highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1 * S;
  rRect(-tw / 2 + 3 * S, -th / 2 + 3 * S, tw - 6 * S, th - 6 * S, 7 * S); ctx.stroke();

  // Divider lines
  ctx.strokeStyle = 'rgba(100,105,125,0.55)'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(0, -th / 2 + 5 * S); ctx.lineTo(0, th / 2 - 5 * S); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-tw / 2 + 5 * S, 0); ctx.lineTo(tw / 2 - 5 * S, 0); ctx.stroke();

  // Corner rivets
  var rv = 3 * S, ro = 9 * S;
  var rivets = [[-tw/2+ro,-th/2+ro],[tw/2-ro,-th/2+ro],[-tw/2+ro,th/2-ro],[tw/2-ro,th/2-ro]];
  for (var k = 0; k < 4; k++) {
    var rg = ctx.createRadialGradient(rivets[k][0]-rv*0.3,rivets[k][1]-rv*0.3,0,rivets[k][0],rivets[k][1],rv);
    rg.addColorStop(0,'#9c9fae'); rg.addColorStop(1,'#4c4f5e');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(rivets[k][0],rivets[k][1],rv,0,Math.PI*2); ctx.fill();
  }

  // 4 rockets (one per quadrant)
  for (var r = 0; r < 4; r++) {
    var qcx = ((r % 2) - 0.5) * (tw / 2);
    var qcy = (Math.floor(r / 2) - 0.5) * (th / 2);
    var qw = tw / 2 - 6 * S, qh = th / 2 - 6 * S;
    drawRocketQuadrant(rb, r, qcx, qcy, qw, qh);
  }

  // Pre-launch flash
  if (rb.fireT > 0) {
    var fl = Math.max(0, Math.sin(rb.fireT * Math.PI * 14) * 0.35);
    ctx.fillStyle = 'rgba(255,255,180,' + fl + ')';
    rRect(-tw / 2, -th / 2, tw, th, 9 * S); ctx.fill();
  }

  ctx.restore();
}

function drawRocketQuadrant(rb, r, cx, cy, qw, qh) {
  var ci = rb.colors[r];
  var c = COLORS[ci];
  var sat = rb.satisfied[r];
  var pt = rb.satisfiedT[r];
  var sz = Math.min(qw, qh) * 0.52;

  ctx.save();
  ctx.translate(cx, cy);

  // Glow when satisfied
  if (sat) {
    var gp = 0.25 + Math.sin(tick * 0.1 + r) * 0.15;
    ctx.globalAlpha = gp;
    ctx.fillStyle = c.glow;
    ctx.beginPath(); ctx.arc(0, -sz * 0.05, sz * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Pop on satisfaction
  var ps = 1 + (pt > 0 ? Math.sin(pt * Math.PI) * 0.22 : 0);
  ctx.scale(ps, ps);

  var bh = sz * 0.72, bw = sz * 0.30;
  var nh = sz * 0.30, fw = sz * 0.20, fh = sz * 0.24;

  // Body gradient
  var bg;
  if (sat) {
    bg = ctx.createLinearGradient(-bw/2, -bh/2, bw/2, bh/2);
    bg.addColorStop(0, c.light); bg.addColorStop(1, c.fill);
  } else {
    bg = ctx.createLinearGradient(-bw/2, 0, bw/2, 0);
    bg.addColorStop(0, 'rgba(170,172,185,0.75)');
    bg.addColorStop(1, 'rgba(90,93,110,0.90)');
  }
  ctx.fillStyle = bg;
  rRect(-bw/2, -bh/2, bw, bh, bw * 0.38); ctx.fill();
  ctx.strokeStyle = sat ? c.dark : 'rgba(60,63,80,0.8)';
  ctx.lineWidth = 1 * S;
  rRect(-bw/2, -bh/2, bw, bh, bw * 0.38); ctx.stroke();

  // Nose cone
  ctx.fillStyle = sat ? c.dark : '#5c5f70';
  ctx.beginPath();
  ctx.moveTo(0, -bh/2 - nh);
  ctx.lineTo(-bw/2, -bh/2 + 1.5*S);
  ctx.lineTo(bw/2, -bh/2 + 1.5*S);
  ctx.closePath(); ctx.fill();

  // Fins
  ctx.fillStyle = sat ? c.dark : '#4c4f60';
  ctx.beginPath();
  ctx.moveTo(-bw/2, bh/2 - fh);
  ctx.lineTo(-bw/2 - fw, bh/2 + fh * 0.15);
  ctx.lineTo(-bw/2, bh/2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bw/2, bh/2 - fh);
  ctx.lineTo(bw/2 + fw, bh/2 + fh * 0.15);
  ctx.lineTo(bw/2, bh/2);
  ctx.closePath(); ctx.fill();

  // Porthole
  var pwR = bw * 0.20;
  ctx.fillStyle = sat ? 'rgba(255,252,200,0.55)' : 'rgba(140,145,170,0.35)';
  ctx.beginPath(); ctx.arc(0, -bh*0.12, pwR, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = sat ? 'rgba(255,255,220,0.5)' : 'rgba(160,165,190,0.35)';
  ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.arc(0, -bh*0.12, pwR, 0, Math.PI*2); ctx.stroke();

  // Colour badge (thruster nozzle area)
  var badgeY = bh/2 + nh * 0.25;
  ctx.fillStyle = c.fill;
  ctx.beginPath(); ctx.arc(0, badgeY, bw * 0.26, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = c.dark; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.arc(0, badgeY, bw * 0.26, 0, Math.PI*2); ctx.stroke();

  // Flame when satisfied (idle)
  if (sat) {
    var ffl = 0.4 + Math.sin(tick * 0.18 + r * 1.2) * 0.2;
    var flg = ctx.createLinearGradient(0, badgeY, 0, badgeY + sz * 0.35);
    flg.addColorStop(0, 'rgba(255,255,180,'+ffl+')');
    flg.addColorStop(0.4, 'rgba(255,160,0,'+(ffl*0.7)+')');
    flg.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = flg;
    ctx.beginPath();
    ctx.moveTo(-bw*0.25, badgeY);
    ctx.lineTo(bw*0.25, badgeY);
    ctx.lineTo(0, badgeY + sz * 0.35);
    ctx.closePath(); ctx.fill();
  }

  // Checkmark overlay
  if (sat) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2*S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var ck = bw * 0.16;
    ctx.beginPath();
    ctx.moveTo(-ck, badgeY);
    ctx.lineTo(-ck * 0.1, badgeY + ck * 0.65);
    ctx.lineTo(ck * 1.1, badgeY - ck * 0.55);
    ctx.stroke();
  }

  ctx.restore();
}

function drawRocketProjectilesAll() {
  for (var i = 0; i < rocketProjectiles.length; i++) {
    var p = rocketProjectiles[i];
    if (p.t < p.delay || p.progress <= 0 || p.progress >= 1) continue;
    var pos = getRocketProjectileXY(p);
    var tb = stock[p.targetIdx];
    var tx = tb ? tb.x + L.bw/2 : pos.x;
    var ty = tb ? tb.y + L.bh/2 : pos.y;
    var ang = Math.atan2(ty - p.sy, tx - p.sx) + Math.PI/2;
    drawFlyingRocket(pos.x, pos.y, p.ci, ang, 17 * S);
  }
}

function drawFlyingRocket(x, y, ci, angle, sz) {
  var c = COLORS[ci];
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  var bh = sz * 0.68, bw = sz * 0.27;

  // Flame trail
  ctx.globalAlpha = 0.65;
  var flg = ctx.createLinearGradient(0, bh/2, 0, bh * 1.5);
  flg.addColorStop(0, 'rgba(255,255,200,0.9)');
  flg.addColorStop(0.25, 'rgba(255,200,0,0.7)');
  flg.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = flg;
  ctx.beginPath();
  ctx.moveTo(-bw*0.32, bh/2); ctx.lineTo(bw*0.32, bh/2); ctx.lineTo(0, bh*1.5);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  // Body
  var bg = ctx.createLinearGradient(-bw/2, 0, bw/2, 0);
  bg.addColorStop(0, c.light); bg.addColorStop(1, c.fill);
  ctx.fillStyle = bg;
  rRect(-bw/2, -bh/2, bw, bh, bw*0.38); ctx.fill();

  // Nose
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.moveTo(0, -bh/2 - sz*0.28); ctx.lineTo(-bw/2, -bh/2+1*S); ctx.lineTo(bw/2, -bh/2+1*S);
  ctx.closePath(); ctx.fill();

  // Fins
  ctx.fillStyle = c.dark;
  ctx.beginPath(); ctx.moveTo(-bw/2, bh/2-sz*0.18); ctx.lineTo(-bw/2-sz*0.17, bh/2+sz*0.08); ctx.lineTo(-bw/2, bh/2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bw/2, bh/2-sz*0.18); ctx.lineTo(bw/2+sz*0.17, bh/2+sz*0.08); ctx.lineTo(bw/2, bh/2); ctx.closePath(); ctx.fill();

  ctx.restore();
}
