// ============================================================
// rocket.js — Rocket Layer-2 helper-blocker
// 1x2 footprint over two underlying Boxes (the "covers").
// Orientation up/down/left/right where the NOSE points.
// Fuse Box = cell directly past the TAIL (opposite of nose dir).
// When the fuse Box is played, the Rocket fires.
// Priority rule for target selection:
//   tier 1: regular Boxes that are NOT another Rocket's fuse
//   tier 2: another Rocket's fuse Box (drives indirect cascade)
// Effect on impact: Magnet pick — Marbles fly straight to their
//   matching sort columns.
// After firing, the Rocket destroys itself and the two underlying
// Boxes are revealed (subject to path-to-bottom).
// Ice Boxes are NEVER eligible targets.
// ============================================================

var rockets = [];              // [{ noseIdx, tailIdx, fuseIdx, dir, fired, igniting }]
var rocketFlights = [];        // active in-flight rockets
var pendingRocketMarbles = []; // marbles waiting for a sort-column slot
var ROCKET_FUSE_MS = 200;      // delay between fuse-trigger and lift-off
var ROCKET_FLIGHT_FRAMES = 42; // duration of flight animation
var ROCKET_ARC_HEIGHT = 110;   // px (pre-scale) of curve apex
var ROCKET_CASCADE_MS = 140;   // beat between chained ignitions

function resetRocketState() {
  rockets = [];
  rocketFlights = [];
  pendingRocketMarbles = [];
}

// --- Direction helpers --------------------------------------------------
// dir = where the NOSE points. Tail = one cell opposite dir from nose.
// Fuse = one cell opposite dir from tail (i.e. two cells opposite from
// the nose).

function rocketTailOffsetFromNose(dir) {
  if (dir === 'up')    return { dr:  1, dc:  0 };
  if (dir === 'down')  return { dr: -1, dc:  0 };
  if (dir === 'left')  return { dr:  0, dc:  1 };
  if (dir === 'right') return { dr:  0, dc: -1 };
  return { dr: 1, dc: 0 };
}

function gridIdx(r, c) {
  if (!L || !L.cols || !L.rows) return -1;
  if (r < 0 || r >= L.rows || c < 0 || c >= L.cols) return -1;
  return r * L.cols + c;
}

// --- Init ---------------------------------------------------------------
// Called from initGame() after stock is built. Walks the stock for
// rocket-head entries and registers each one, resolving its tail and
// fuse indices.

function initRockets() {
  rockets = [];
  if (!stock || !stock.length) return;
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s || !s.isRocket || !s.isRocketHead) continue;
    var r = Math.floor(i / L.cols), c = i % L.cols;
    var off = rocketTailOffsetFromNose(s.rocketDir);
    var tr = r + off.dr, tc = c + off.dc;
    var fr = tr + off.dr, fc = tc + off.dc;
    var rk = {
      noseIdx: i,
      tailIdx: gridIdx(tr, tc),
      fuseIdx: gridIdx(fr, fc),
      dir: s.rocketDir,
      fired: false,
      igniting: false
    };
    rockets.push(rk);
    s.rocketObj = rk;
    if (rk.tailIdx >= 0 && stock[rk.tailIdx]) {
      stock[rk.tailIdx].rocketObj = rk;
    }
  }
}

function getRocketByFuse(idx) {
  for (var i = 0; i < rockets.length; i++) {
    if (rockets[i].fuseIdx === idx) return rockets[i];
  }
  return null;
}

function isCellRocketFuse(idx) {
  for (var i = 0; i < rockets.length; i++) {
    var rk = rockets[i];
    if (rk.fired) continue;
    if (rk.fuseIdx === idx) return true;
  }
  return false;
}

// --- Ignition -----------------------------------------------------------

// Called from handleTap() after a non-rocket box has been tapped.
function tryIgniteRocketFuse(tappedIdx) {
  for (var i = 0; i < rockets.length; i++) {
    var rk = rockets[i];
    if (rk.fired || rk.igniting) continue;
    if (rk.fuseIdx === tappedIdx) {
      igniteRocket(rk);
    }
  }
}

function igniteRocket(rk) {
  if (!rk || rk.fired || rk.igniting) return;
  rk.igniting = true;
  var nose = stock[rk.noseIdx];
  if (!nose) return;
  nose.shakeT = 0.6;

  // sparkle particles around the tail
  var tail = stock[rk.tailIdx];
  var sparkAt = tail || nose;
  for (var p = 0; p < 12; p++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 1 + Math.random() * 2;
    particles.push({
      x: sparkAt.x + L.bw / 2 + (Math.random() - 0.5) * L.bw * 0.4,
      y: sparkAt.y + L.bh / 2 + (Math.random() - 0.5) * L.bh * 0.4,
      vx: Math.cos(a) * sp * S * 0.5,
      vy: Math.sin(a) * sp * S * 0.5 - 1 * S,
      r: (1.5 + Math.random() * 2) * S,
      color: Math.random() > 0.5 ? '#FFD060' : '#FF8030',
      life: 0.6, decay: 0.04, grav: false
    });
  }

  rocketFuseSound();

  setTimeout(function () { launchRocket(rk); }, ROCKET_FUSE_MS);
}

// --- Target selection (priority rule) -----------------------------------

function isEligibleRocketTarget(b, idx, excludeNose, excludeTail) {
  if (!b) return false;
  if (idx === excludeNose || idx === excludeTail) return false;
  if (b.isWall || b.isTunnel) return false;
  if (b.isRocket) return false;
  if (b.empty || b.used) return false;
  if (b.spawning) return false;
  if (b.boxType === 'ice') return false;
  return true;
}

function pickRocketTarget(rk) {
  var tier1 = [], tier2 = [];
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!isEligibleRocketTarget(b, i, rk.noseIdx, rk.tailIdx)) continue;
    if (isCellRocketFuse(i)) tier2.push(i);
    else tier1.push(i);
  }
  if (tier1.length > 0) return tier1[Math.floor(Math.random() * tier1.length)];
  if (tier2.length > 0) return tier2[Math.floor(Math.random() * tier2.length)];
  return -1;
}

// --- Launch / flight ----------------------------------------------------

function launchRocket(rk) {
  var nose = stock[rk.noseIdx];
  var tail = rk.tailIdx >= 0 ? stock[rk.tailIdx] : null;
  if (!nose) return;

  rk.fired = true;
  rk.igniting = false;

  var targetIdx = pickRocketTarget(rk);

  // Position the rocket flight start at the midpoint of nose+tail cells
  var startX = nose.x + L.bw / 2;
  var startY = nose.y + L.bh / 2;
  if (tail) {
    startX = (nose.x + tail.x) / 2 + L.bw / 2;
    startY = (nose.y + tail.y) / 2 + L.bh / 2;
  }

  // Self-destruct the rocket cells now (it has launched and is no longer
  // covering them) so the underlying boxes can be revealed.
  selfDestructRocket(rk);

  if (targetIdx < 0) {
    // No eligible target — fizzle in place.
    fizzleAt(startX, startY);
    return;
  }

  var target = stock[targetIdx];
  rocketFlights.push({
    rocket: rk,
    startX: startX,
    startY: startY,
    endX: target.x + L.bw / 2,
    endY: target.y + L.bh / 2,
    targetIdx: targetIdx,
    dir: rk.dir,
    t: 0,
    duration: ROCKET_FLIGHT_FRAMES,
    arcHeight: ROCKET_ARC_HEIGHT * S,
    smokeAccum: 0
  });

  rocketWhooshSound();
}

function fizzleAt(cx, cy) {
  for (var p = 0; p < 16; p++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 1 + Math.random() * 2;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1 * S,
      r: (3 + Math.random() * 3) * S,
      color: 'rgba(180,180,180,0.75)',
      life: 1, decay: 0.025, grav: false
    });
  }
  if (typeof tone === 'function') tone(220, 0.3, 'sine', 0.05, 140);
}

// --- Self-destruct: replace nose/tail rocket cells with their covers ---

function selfDestructRocket(rk) {
  var nose = stock[rk.noseIdx];
  if (!nose) return;
  var noseCover = nose.rocketCoverNose;
  var tailCover = nose.rocketCoverTail;

  // Burst at the rocket midpoint
  var midX = nose.x + L.bw / 2;
  var midY = nose.y + L.bh / 2;
  var tail = rk.tailIdx >= 0 ? stock[rk.tailIdx] : null;
  if (tail) {
    midX = (nose.x + tail.x) / 2 + L.bw / 2;
    midY = (nose.y + tail.y) / 2 + L.bh / 2;
  }
  spawnBurst(midX, midY, '#FFD080', 18);

  replaceRocketCellWithCover(rk.noseIdx, noseCover);
  if (rk.tailIdx >= 0) replaceRocketCellWithCover(rk.tailIdx, tailCover);

  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

function replaceRocketCellWithCover(idx, cover) {
  var old = stock[idx];
  if (!old) return;
  if (!cover) {
    stock[idx] = makeEmptyStockEntry(old.x, old.y);
    if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
    return;
  }
  var ci = (cover.ci !== undefined ? cover.ci : 0);
  var type = cover.type || 'default';
  var isIce = (type === 'ice');
  var isBlocker = (type === 'blocker');
  stock[idx] = {
    ci: ci, used: false, remaining: MRB_PER_BOX, spawning: false, spawnIdx: 0,
    revealed: false, empty: false,
    boxType: type,
    isTunnel: false, isWall: false, isRocket: false, isRocketHead: false,
    rocketObj: null,
    iceHP: isIce ? 2 : 0,
    iceCrackT: 0, iceShatterT: 0,
    blockerCount: isBlocker ? BLOCKER_PER_BOX : 0,
    x: old.x, y: old.y,
    shakeT: 0, hoverT: 0, popT: 0.6, revealT: 0, emptyT: 0,
    idlePhase: Math.random() * Math.PI * 2
  };
  // Reveal puff
  var c = COLORS[ci];
  if (c) spawnBurst(old.x + L.bw / 2, old.y + L.bh / 2, c.fill, 10);
}

function makeEmptyStockEntry(x, y) {
  return {
    ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
    revealed: true, empty: true, boxType: 'default',
    isTunnel: false, isWall: false, isRocket: false, isRocketHead: false,
    rocketObj: null,
    iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
    x: x, y: y,
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0,
    idlePhase: 0
  };
}

// --- Flight animation + impact -----------------------------------------

function rocketFlightPose(f, tOverride) {
  var t = (tOverride !== undefined ? tOverride : f.t) / f.duration;
  if (t < 0) t = 0; if (t > 1) t = 1;
  var x = f.startX + (f.endX - f.startX) * t;
  var y = f.startY + (f.endY - f.startY) * t - Math.sin(t * Math.PI) * f.arcHeight;
  return { x: x, y: y, t: t };
}

function updateRockets() {
  for (var i = rocketFlights.length - 1; i >= 0; i--) {
    var f = rocketFlights[i];
    f.t++;

    var pose = rocketFlightPose(f);
    f.smokeAccum += 1;
    if (f.smokeAccum >= 1) {
      f.smokeAccum -= 1;
      particles.push({
        x: pose.x + (Math.random() - 0.5) * 6 * S,
        y: pose.y + (Math.random() - 0.5) * 6 * S,
        vx: (Math.random() - 0.5) * 0.6 * S,
        vy: 0.4 * S + Math.random() * 0.3 * S,
        r: (3.5 + Math.random() * 2.5) * S,
        color: Math.random() > 0.6 ? 'rgba(230,230,230,0.6)' : 'rgba(255,180,80,0.55)',
        life: 0.8, decay: 0.025, grav: false
      });
    }

    if (f.t >= f.duration) {
      impactRocket(f);
      rocketFlights.splice(i, 1);
    }
  }

  // Drain queued marbles into sort columns
  for (var pi = pendingRocketMarbles.length - 1; pi >= 0; pi--) {
    var pm = pendingRocketMarbles[pi];
    if (pm.delay > 0) { pm.delay--; continue; }
    if (pm.ci === BLOCKER_CI) {
      puffBlockerMarble(pm.sx, pm.sy);
      pendingRocketMarbles.splice(pi, 1);
      continue;
    }
    if (tryLaunchSortJumper(pm.ci, pm.sx, pm.sy)) {
      pendingRocketMarbles.splice(pi, 1);
    }
  }
}

function impactRocket(f) {
  var target = stock[f.targetIdx];
  var bx = f.endX, by = f.endY;

  if (!target || target.empty || target.used) {
    // Target was cleared mid-flight by something else — just puff.
    spawnBurst(bx, by, '#FFD080', 12);
    rocketImpactSound();
    return;
  }

  var ci = target.ci;
  var color = COLORS[ci] ? COLORS[ci].fill : '#FFD080';
  spawnBurst(bx, by, color, 28);
  spawnBurst(bx, by, '#FFD080', 14);
  if (typeof spawnConfetti === 'function') spawnConfetti(bx, by, 14);

  // Smoke puff
  for (var p = 0; p < 10; p++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 1 + Math.random() * 2;
    particles.push({
      x: bx, y: by,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1 * S,
      r: (4 + Math.random() * 3) * S,
      color: 'rgba(210,210,210,0.7)',
      life: 1, decay: 0.022, grav: false
    });
  }

  // Magnet-pick: dispatch every remaining marble.
  var remaining = target.remaining;
  var blockerCount = target.blockerCount || 0;
  var blockerStart = MRB_PER_BOX - blockerCount;
  for (var m = 0; m < remaining; m++) {
    var marbleIndex = (MRB_PER_BOX - remaining) + m;
    var marbleCi = (blockerCount > 0 && marbleIndex >= blockerStart) ? BLOCKER_CI : ci;
    pendingRocketMarbles.push({
      ci: marbleCi,
      sx: bx + (Math.random() - 0.5) * 8 * S,
      sy: by + (Math.random() - 0.5) * 8 * S,
      delay: m * 4
    });
  }
  if (blockerCount > 0) {
    totalBlockerMarbles = Math.max(0, totalBlockerMarbles - blockerCount);
  }

  // Cascade BEFORE marking the target used — so isCellRocketFuse() lookups
  // for the cascade still resolve correctly.
  var cascadeRocket = getRocketByFuse(f.targetIdx);

  target.remaining = 0;
  target.used = true;
  target.spawning = false;
  target.popT = 1.0;
  target.shakeT = 0.4;
  target.emptyT = 1.0;
  if (target.boxType === 'ice') {
    target.iceHP = 0;
    target.iceShatterT = 1.0;
  }

  rocketImpactSound();

  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);

  // Indirect cascade — chained rockets ignite after a short beat so the
  // player can track the chain visually.
  if (cascadeRocket && !cascadeRocket.fired && !cascadeRocket.igniting) {
    setTimeout(function () { igniteRocket(cascadeRocket); }, ROCKET_CASCADE_MS);
  }
}

// --- Sort-jumper dispatch (shared) -------------------------------------

function tryLaunchSortJumper(mc, sx, sy) {
  var targetCol = -1;
  var targetSlot = 0;
  for (var c = 0; c < 4; c++) {
    var col = sortCols[c];
    var tv = -1;
    for (var rr = 0; rr < col.length; rr++) {
      if (col[rr].vis) { tv = rr; break; }
    }
    if (tv < 0) continue;
    if (col[tv].ci !== mc) continue;
    var inFlight = 0;
    for (var jj = 0; jj < jumpers.length; jj++) {
      if (jumpers[jj].targetCol === c) inFlight++;
    }
    if (col[tv].filled + inFlight >= SORT_CAP) continue;
    targetCol = c;
    targetSlot = col[tv].filled + inFlight;
    break;
  }
  if (targetCol < 0) return false;

  jumpers.push({
    ci: mc, slotIdx: -1,
    startX: sx, startY: sy,
    targetCol: targetCol, targetSlot: targetSlot, t: 0
  });
  if (typeof sfx !== 'undefined' && sfx.sort) sfx.sort();
  return true;
}

function puffBlockerMarble(sx, sy) {
  for (var p = 0; p < 6; p++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 1 + Math.random() * 2;
    particles.push({
      x: sx, y: sy,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 0.5 * S,
      r: (2 + Math.random() * 2) * S,
      color: COLORS[BLOCKER_CI].light,
      life: 0.7, decay: 0.03, grav: false
    });
  }
}

// --- Drawing -----------------------------------------------------------

// Called from drawStock() in rendering.js when we encounter a rocket-head
// stock entry. Draws the 1x2 sprite spanning from the nose cell to the
// tail cell.
function drawRocketHeadOnGrid(headStock) {
  var rk = headStock.rocketObj;
  if (!rk) return;
  var tail = rk.tailIdx >= 0 ? stock[rk.tailIdx] : null;

  var x = headStock.x;
  var y = headStock.y;
  var w = L.bw;
  var h = L.bh;
  if (tail) {
    x = Math.min(headStock.x, tail.x);
    y = Math.min(headStock.y, tail.y);
    var rx = Math.max(headStock.x, tail.x) + L.bw;
    var ry = Math.max(headStock.y, tail.y) + L.bh;
    w = rx - x;
    h = ry - y;
  }

  var ox = 0, oy = 0;
  if (headStock.shakeT > 0) {
    ox = Math.sin(headStock.shakeT * 28) * 4 * S * headStock.shakeT;
    oy = Math.cos(headStock.shakeT * 32) * 3 * S * headStock.shakeT;
  }

  var fuseLit = !!rk.igniting;
  drawRocketOnGrid(ctx, x, y, w, h, rk.dir, S, tick, headStock.idlePhase, fuseLit, ox, oy);

  // Highlight the fuse cell so the player can see where to play
  if (rk.fuseIdx >= 0) {
    var fc = stock[rk.fuseIdx];
    if (fc && !fc.used && !fc.empty && !fc.isRocket) {
      var fx = fc.x, fy = fc.y;
      var pulse = 0.4 + 0.25 * Math.sin(tick * 0.12 + headStock.idlePhase);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,200,80,' + (0.55 + pulse * 0.25) + ')';
      ctx.lineWidth = 2.5 * S;
      ctx.setLineDash([5 * S, 4 * S]);
      rRect(fx + 2 * S, fy + 2 * S, L.bw - 4 * S, L.bh - 4 * S, 6 * S);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

function drawRocketFlights() {
  for (var i = 0; i < rocketFlights.length; i++) {
    var f = rocketFlights[i];
    var pose = rocketFlightPose(f);
    var ahead = rocketFlightPose(f, Math.min(f.t + 1, f.duration));
    var angle = Math.atan2(ahead.y - pose.y, ahead.x - pose.x) + Math.PI / 2;

    // Underglow
    ctx.save();
    var glow = ctx.createRadialGradient(pose.x, pose.y, 0, pose.x, pose.y, 30 * S);
    glow.addColorStop(0, 'rgba(255,200,90,0.4)');
    glow.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(pose.x, pose.y, 30 * S, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    var length = Math.min(L.bw, L.bh) * 1.1;
    var width = Math.min(L.bw, L.bh) * 0.45;
    drawRocketSpriteAngled(ctx, pose.x, pose.y, angle, length, width, S, tick, true);
  }
}

// === Audio helpers ===

function rocketFuseSound() {
  if (typeof audioCtx === 'undefined' || !audioCtx) return;
  try {
    var t = audioCtx.currentTime;
    var n = audioCtx.createBufferSource();
    var buf = audioCtx.createBuffer(1, 0.2 * audioCtx.sampleRate, audioCtx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    n.buffer = buf;
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    var bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3500; bp.Q.value = 1.2;
    n.connect(bp); bp.connect(g); g.connect(audioCtx.destination);
    n.start(t); n.stop(t + 0.2);
  } catch (e) { /* ignore */ }
}

function rocketWhooshSound() {
  if (typeof audioCtx === 'undefined' || !audioCtx) return;
  try {
    var t = audioCtx.currentTime;
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.55);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.65);
  } catch (e) { /* ignore */ }
}

function rocketImpactSound() {
  if (typeof audioCtx === 'undefined' || !audioCtx) return;
  try {
    var t = audioCtx.currentTime;
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.3);
    setTimeout(function () {
      if (typeof tone === 'function') tone(1200, 0.2, 'triangle', 0.08, 400);
    }, 30);
  } catch (e) { /* ignore */ }
}
