// ============================================================
// blocker_marbles.js — Blocker Marbles mechanic
// ------------------------------------------------------------
// Any regular box can be TAGGED with `hasBlockers = true`.
// A tagged box holds (MRB_PER_BOX - BLOCKER_PER_BOX) regular
// marbles + BLOCKER_PER_BOX blocker "light bulb" marbles.
//
// BELT:
// Blocker marbles land on the belt like any other marble and
// ride it indefinitely. Sort columns ignore them.
//
// BRIGHTNESS:
// Every 3 blockers sitting on the belt bumps the shared bulb
// brightness up one step. Threshold 9 -> 3 steps, 12 -> 4 steps.
//
// CLEAR:
// When the belt holds BLOCKER_CLEAR_THRESHOLD blockers at once,
// every blocker bursts simultaneously and is wiped from the
// belt. The clear fires once and does not reset.
// ============================================================

var blocker = {
  total: 0,          // total blockers introduced across the level (informational)
  cleared: false,    // true once the threshold has fired (one-time clear)
  flashT: 0,         // 1 -> 0 white flash overlay after clear fires
  shatters: []       // { x, y, vx, vy, rot, rotV, t, dur }
};

function initBlockerState(total) {
  blocker.total = total;
  blocker.cleared = false;
  blocker.flashT = 0;
  blocker.shatters = [];
}

function countBlockersOnBelt() {
  var n = 0;
  for (var i = 0; i < BELT_SLOTS; i++) {
    if (beltSlots[i].marble === BLOCKER_CI) n++;
  }
  return n;
}

function blockerBrightnessSteps() {
  return Math.max(1, Math.ceil(BLOCKER_CLEAR_THRESHOLD / 3));
}

// 0..1 brightness for rendering — jumps in steps of 3 blockers.
function blockerBrightnessT() {
  var count = countBlockersOnBelt();
  var steps = blockerBrightnessSteps();
  if (count <= 0) return 0;
  var lvl = Math.min(steps, Math.ceil(count / 3));
  return lvl / steps;
}

function updateBlockers() {
  if (!blocker.cleared && blocker.total > 0) {
    if (countBlockersOnBelt() >= BLOCKER_CLEAR_THRESHOLD) {
      triggerBlockerClear();
    }
  }

  if (blocker.flashT > 0) blocker.flashT = Math.max(0, blocker.flashT - 0.04);

  for (var s = blocker.shatters.length - 1; s >= 0; s--) {
    var sh = blocker.shatters[s];
    sh.t++;
    sh.x += sh.vx;
    sh.y += sh.vy;
    sh.vy += 0.5;
    sh.vx *= 0.985;
    sh.rot += sh.rotV;
    if (sh.t >= sh.dur) blocker.shatters.splice(s, 1);
  }
}

function triggerBlockerClear() {
  blocker.cleared = true;
  blocker.flashT = 1;
  if (typeof sfx !== 'undefined' && sfx.stoneShatter) sfx.stoneShatter();
  for (var i = 0; i < BELT_SLOTS; i++) {
    if (beltSlots[i].marble !== BLOCKER_CI) continue;
    var pos = getSlotPos(i);
    var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    var spd = 4 + Math.random() * 6;
    blocker.shatters.push({
      x: pos.x, y: pos.y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 3,
      rot: 0, rotV: (Math.random() - 0.5) * 0.4,
      t: 0, dur: 45
    });
    spawnGlassFragments(pos.x, pos.y, 7);
    spawnBurst(pos.x, pos.y, '#FFF0A0', 10);
    beltSlots[i].marble = -1;
  }
}

function spawnGlassFragments(x, y, n) {
  n = n || 6;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 2 + Math.random() * 4;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
      r: (2 + Math.random() * 3) * S,
      color: i % 3 === 0 ? '#FFF7C0' : (i % 3 === 1 ? '#FFD060' : '#C09030'),
      life: 0.9, decay: 0.02 + Math.random() * 0.015, grav: true
    });
  }
}

// ─────────── Rendering ───────────

// Draws a light bulb at (cx, cy) with radius r and brightness t (0..1).
function drawBlockerBulb(cx, cy, r, t) {
  var bright = Math.max(0.18, t);

  // Outer glow
  ctx.save();
  var glowR = r * (1.3 + bright * 1.4);
  var glow = ctx.createRadialGradient(cx, cy - r * 0.1, r * 0.1, cx, cy - r * 0.1, glowR);
  glow.addColorStop(0, 'rgba(255,240,150,' + (0.55 * bright) + ')');
  glow.addColorStop(0.6, 'rgba(255,200,80,' + (0.22 * bright) + ')');
  glow.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.1, glowR, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Screw base (drawn first so the bulb sits on top)
  ctx.save();
  ctx.fillStyle = '#5A4E42';
  var baseW = r * 1.0, baseH = r * 0.45;
  ctx.beginPath();
  rRect(cx - baseW / 2, cy + r * 0.55, baseW, baseH, r * 0.12);
  ctx.fill();
  // Base grooves
  ctx.strokeStyle = 'rgba(30,24,18,0.55)';
  ctx.lineWidth = 0.9 * S;
  for (var g = 0; g < 3; g++) {
    var gy = cy + r * 0.65 + g * (baseH * 0.22);
    ctx.beginPath();
    ctx.moveTo(cx - baseW / 2 + 1 * S, gy);
    ctx.lineTo(cx + baseW / 2 - 1 * S, gy);
    ctx.stroke();
  }
  ctx.restore();

  // Bulb glass
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.1;
  // Lit vs dim color palette
  var core = bright > 0.66 ? '#FFFFF2' : (bright > 0.33 ? '#FFF2A8' : '#E8D078');
  var mid  = bright > 0.66 ? '#FFEB8A' : (bright > 0.33 ? '#F0CC50' : '#B89848');
  var edge = bright > 0.66 ? '#D4A030' : (bright > 0.33 ? '#8C6820' : '#504018');
  var grd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 1.02);
  grd.addColorStop(0, core);
  grd.addColorStop(0.55, mid);
  grd.addColorStop(1, edge);
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.05, r * 1.0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Filament squiggle
  ctx.save();
  ctx.strokeStyle = 'rgba(255,120,30,' + (0.45 + 0.4 * bright) + ')';
  ctx.lineWidth = 1.1 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.4, cy + r * 0.15);
  ctx.quadraticCurveTo(cx - r * 0.3, cy - r * 0.2, cx - r * 0.05, cy - r * 0.1);
  ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.3, cx + r * 0.4, cy + r * 0.1);
  ctx.stroke();
  // Filament posts
  ctx.strokeStyle = 'rgba(40,30,20,0.55)';
  ctx.lineWidth = 1.1 * S;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.4, cy + r * 0.55); ctx.lineTo(cx - r * 0.4, cy + r * 0.15);
  ctx.moveTo(cx + r * 0.4, cy + r * 0.55); ctx.lineTo(cx + r * 0.4, cy + r * 0.1);
  ctx.stroke();
  ctx.restore();

  // Glass highlight
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + bright * 0.35) + ')';
  ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.38, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Pulse ring when fully charged (near threshold)
  if (bright >= 1) {
    var pulse = 0.5 + Math.sin(tick * 0.2) * 0.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,240,140,' + (0.35 + 0.35 * pulse) + ')';
    ctx.lineWidth = 1.4 * S;
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.05, r * (1.1 + 0.2 * pulse), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// Kept name for game.js compatibility. Draws the post-belt overlays
// (shatter fragments + white flash). Bulbs themselves render inline
// via drawMarble's BLOCKER_CI branch.
function drawBlockerTray() {
  drawBlockerShatters();
  drawBlockerFlash();
}

function drawBlockerShatters() {
  for (var i = 0; i < blocker.shatters.length; i++) {
    var sh = blocker.shatters[i];
    var u = sh.t / sh.dur;
    ctx.save();
    ctx.globalAlpha = 1 - u;
    ctx.translate(sh.x, sh.y);
    ctx.rotate(sh.rot);
    drawBlockerBulb(0, 0, 7 * S, 1);
    ctx.restore();
  }
}

function drawBlockerFlash() {
  if (blocker.flashT <= 0) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,250,220,' + (blocker.flashT * 0.55) + ')';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
