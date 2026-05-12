// ============================================================
// rocket.js — Rocket flight + ignition mechanic
// Pairs with box_rocket.js. A rocket box ignites when ANY of its
// 4-orthogonal-neighbour boxes is tapped. After a short fuse,
// the rocket lifts off and flies to a random other box anywhere
// on the maze, destroying it on impact and sending its marbles
// straight to their sort columns (magnet-style).
// ============================================================

var rocketFlights = [];        // active in-flight rockets
var pendingRocketMarbles = []; // marbles waiting for a sort-column slot
var ROCKET_FUSE_MS = 180;      // delay between ignition and launch
var ROCKET_FLIGHT_FRAMES = 40; // duration of flight animation
var ROCKET_ARC_HEIGHT = 90;    // px (pre-scale) of curve apex

function resetRocketState() {
  rocketFlights = [];
  pendingRocketMarbles = [];
}

// Called from handleTap after a non-rocket box has been tapped.
// Ignites any rocket neighbours that haven't already fired.
function tryIgniteAdjacentRockets(idx) {
  if (!L || !L.cols) return;
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  var nbrs = [];
  if (row > 0)            nbrs.push((row - 1) * L.cols + col);
  if (row < L.rows - 1)   nbrs.push((row + 1) * L.cols + col);
  if (col > 0)            nbrs.push(row * L.cols + (col - 1));
  if (col < L.cols - 1)   nbrs.push(row * L.cols + (col + 1));
  for (var i = 0; i < nbrs.length; i++) {
    var nb = stock[nbrs[i]];
    if (!nb) continue;
    if (nb.boxType !== 'rocket') continue;
    if (nb.used || nb.empty) continue;
    if (nb.rocketFired) continue;
    igniteRocket(nbrs[i]);
  }
}

function igniteRocket(idx) {
  var r = stock[idx];
  if (!r || r.rocketFired) return;
  r.rocketFired = true;
  r.shakeT = 0.6;

  // Fuse-lit glow on the rocket box for a moment
  r.idlePhase = 0; // freeze idle bob

  // Sparkle particles around the tail
  var bx = r.x + L.bw / 2;
  var by = r.y + L.bh * 0.78;
  for (var p = 0; p < 8; p++) {
    var a = Math.random() * Math.PI - Math.PI / 2;
    var sp = 1 + Math.random() * 2;
    particles.push({
      x: bx + (Math.random() - 0.5) * L.bw * 0.3,
      y: by + (Math.random() - 0.5) * 4 * S,
      vx: Math.cos(a) * sp * S * 0.4,
      vy: -Math.abs(Math.sin(a)) * sp * S * 0.6 - 1 * S,
      r: (1.5 + Math.random() * 2) * S,
      color: Math.random() > 0.5 ? '#FFD060' : '#FF8030',
      life: 0.6, decay: 0.04, grav: false
    });
  }

  // Fuse hiss
  rocketFuseSound();

  // Schedule liftoff
  setTimeout(function () { launchRocket(idx); }, ROCKET_FUSE_MS);
}

function launchRocket(idx) {
  var r = stock[idx];
  if (!r || r.used || r.empty) return;

  // Pick a random valid target — any other active, non-rocket, non-wall,
  // non-tunnel box anywhere on the grid.
  var targets = [];
  for (var i = 0; i < stock.length; i++) {
    if (i === idx) continue;
    var b = stock[i];
    if (!b) continue;
    if (b.isWall || b.isTunnel) continue;
    if (b.empty || b.used) continue;
    if (b.spawning) continue;
    if (b.boxType === 'rocket') continue;
    targets.push(i);
  }

  // Mark the rocket cell as "used" — its sprite has left.
  r.used = true;
  r.remaining = 0;
  r.emptyT = 1.0;

  if (targets.length === 0) {
    fizzleRocket(r);
    if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
    return;
  }

  var targetIdx = targets[Math.floor(Math.random() * targets.length)];
  var target = stock[targetIdx];

  rocketFlights.push({
    startX: r.x + L.bw / 2,
    startY: r.y + L.bh / 2,
    endX: target.x + L.bw / 2,
    endY: target.y + L.bh / 2,
    targetIdx: targetIdx,
    t: 0,
    duration: ROCKET_FLIGHT_FRAMES,
    arcHeight: ROCKET_ARC_HEIGHT * S,
    smokeAccum: 0
  });

  rocketWhooshSound();

  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

function fizzleRocket(r) {
  var bx = r.x + L.bw / 2, by = r.y + L.bh / 2;
  for (var p = 0; p < 14; p++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 1 + Math.random() * 2;
    particles.push({
      x: bx, y: by,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1 * S,
      r: (3 + Math.random() * 3) * S,
      color: 'rgba(180,180,180,0.75)',
      life: 1, decay: 0.025, grav: false
    });
  }
}

// Returns { x, y, angle } for the rocket at a given progress t in [0,1].
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
      // smoke
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

  // Drain queued marbles into their sort columns as slots become free.
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

  // If target somehow became invalid mid-flight (e.g. cleared), just puff.
  if (!target || target.empty || target.used) {
    spawnBurst(bx, by, '#FFD080', 14);
    rocketImpactSound();
    return;
  }

  var ci = target.ci;
  var color = COLORS[ci] ? COLORS[ci].fill : '#FFD080';
  spawnBurst(bx, by, color, 26);
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

  // Queue each remaining marble for direct dispatch to its sort column.
  // The queue is drained each frame, so marbles wait politely for a free
  // slot instead of being lost when the column is saturated with
  // in-flight jumpers.
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

  // Account for blocker marbles being skipped (they never reach the belt
  // collection step, but their total count must still drop so the
  // blocker progress bar resolves correctly).
  if (blockerCount > 0) {
    totalBlockerMarbles = Math.max(0, totalBlockerMarbles - blockerCount);
  }

  // Mark the target destroyed.
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
}

// Try to launch a jumper of color `mc` from (sx, sy) to a matching sort
// column. Returns true if a jumper was launched, false if no slot is
// available right now (caller should retry on a later frame).
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

function drawRocketFlights() {
  for (var i = 0; i < rocketFlights.length; i++) {
    var f = rocketFlights[i];
    var pose = rocketFlightPose(f);
    var ahead = rocketFlightPose(f, Math.min(f.t + 1, f.duration));
    var angle = Math.atan2(ahead.y - pose.y, ahead.x - pose.x) + Math.PI / 2;

    // Glow under the rocket
    ctx.save();
    var glow = ctx.createRadialGradient(pose.x, pose.y, 0, pose.x, pose.y, 26 * S);
    glow.addColorStop(0, 'rgba(255,200,90,0.4)');
    glow.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(pose.x, pose.y, 26 * S, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    drawRocketSprite(ctx, pose.x, pose.y, angle, Math.min(L.bw, L.bh) * 0.55, S, tick, true);
  }
}

// === Audio helpers ===
// Uses the same `tone()` primitive defined in audio.js. We guard the
// calls in case the audio module hasn't initialised yet.

function rocketFuseSound() {
  if (typeof audioCtx === 'undefined' || !audioCtx) return;
  try {
    var t = audioCtx.currentTime;
    var n = audioCtx.createBufferSource();
    var buf = audioCtx.createBuffer(1, 0.18 * audioCtx.sampleRate, audioCtx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    n.buffer = buf;
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    var bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3500; bp.Q.value = 1.2;
    n.connect(bp); bp.connect(g); g.connect(audioCtx.destination);
    n.start(t); n.stop(t + 0.18);
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
    o.frequency.exponentialRampToValueAtTime(900, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.6);
  } catch (e) { /* ignore */ }
}

function rocketImpactSound() {
  if (typeof audioCtx === 'undefined' || !audioCtx) return;
  try {
    var t = audioCtx.currentTime;
    // Low thud
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.3);

    // High sparkle
    setTimeout(function () {
      if (typeof tone === 'function') tone(1200, 0.2, 'triangle', 0.08, 400);
    }, 30);
  } catch (e) { /* ignore */ }
}
