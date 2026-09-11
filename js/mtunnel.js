// ============================================================
// mtunnel.js — Multi Cell Tunnel ("the mushroom")
// ============================================================
// A Tunnel spin-off that occupies TWO cells and has TWO mouths
// instead of one, fed by a SINGLE shared stock of boxes.
//
//   • Horizontal footprint: 2 cells side by side.
//     Head cell = left  → its mouth spawns LEFT.
//     Tail cell = right → its mouth spawns RIGHT.
//   • Vertical footprint: 2 cells stacked.
//     Head cell = top    → its mouth spawns UP.
//     Tail cell = bottom → its mouth spawns DOWN.
//
// The mouths are back to back along the footprint axis, so the
// structure splits a region in two and the player decides which
// half gets fed — by choosing which side to play.
//
// The stock is common to the whole entity: the next box out is
// the next box in one ordered list, whichever mouth called for
// it. The counter (centred on the seam between the two cells)
// shows the boxes still INSIDE the structure. When the stock is
// empty the mushroom disappears, freeing its two cells.
//
// Grid data:
//   head → { mtunnel: true, role: 'head', orient: 'h'|'v', contents: [{ci,type}...] }
//   tail → { mtunnel: true, role: 'tail', orient: 'h'|'v' }
// The tail always sits at head+1 (horizontal) or head+7 (vertical).
// ============================================================

var MTUNNEL_SPAWN_COOLDOWN = 40;   // ticks between spawns, per mouth
var MTUNNEL_START_COOLDOWN = 60;   // grace period at level start
var MTUNNEL_VANISH_SPEED = 0.022;  // ~45 frames for the disappearance
var MTUNNEL_LURCH_SPEED = 0.045;   // ~22 frames for the spit-out heave
var MTUNNEL_EMERGE_SPEED = 0.055;  // ~18 frames for a box to clear the muzzle
var MTUNNEL_MUZZLE_T = 0.44;       // where the slot sits, between the two cell centres
var MTUNNEL_MAX_STOCK = 6;         // hard limit, same family as Tunnel
var MTUNNEL_SOFT_STOCK = 4;        // recommended stock

var MT_CAP = { light: '#F58C70', fill: '#DE4E33', dark: '#A0301F' };
var MT_STEM = { light: '#FCF3E0', fill: '#EDDCBB', dark: '#C0A87E' };

var MT_ORIENT_LABEL = { h: 'Horizontal', v: 'Vertical' };
// Mouth names per orientation, [head, tail]
var MT_MOUTH_LABEL = { h: ['Left', 'Right'], v: ['Up', 'Down'] };
var MT_MOUTH_ARROW = { h: ['◀', '▶'], v: ['▲', '▼'] };

// ── Geometry ──

// The two cells of an entity, given the head index and orientation.
function mtTailIdx(headIdx, orient, cols, rows) {
  cols = cols || 7; rows = rows || cols;
  var row = Math.floor(headIdx / cols), col = headIdx % cols;
  if (orient === 'v') {
    if (row + 1 >= rows) return -1;
    return (row + 1) * cols + col;
  }
  if (col + 1 >= cols) return -1;
  return row * cols + (col + 1);
}

// The cell a given mouth spawns into. role is 'head' or 'tail'.
function mtMouthTargetIdx(cellIdx, orient, role, cols, rows) {
  cols = cols || 7; rows = rows || cols;
  var row = Math.floor(cellIdx / cols), col = cellIdx % cols;
  var tr = row, tc = col;
  if (orient === 'v') tr = (role === 'head') ? row - 1 : row + 1;
  else tc = (role === 'head') ? col - 1 : col + 1;
  if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) return -1;
  return tr * cols + tc;
}

// Runtime version — reads orientation/role off the stock cell.
function getMTunnelExitIdx(cellIdx) {
  var s = stock[cellIdx];
  if (!s || !s.isMTunnel) return -1;
  return mtMouthTargetIdx(cellIdx, s.mtOrient, s.mtRole, L.cols, L.rows);
}

// Screen footprint of the whole entity, measured from its head cell.
// len runs along the footprint axis, thk across it.
function mtFootprint(head) {
  if (head.mtOrient === 'v') {
    var vlen = 2 * L.bh + L.bg;
    return { cx: head.x + L.bw / 2, cy: head.y + vlen / 2, len: vlen, thk: L.bw };
  }
  var hlen = 2 * L.bw + L.bg;
  return { cx: head.x + hlen / 2, cy: head.y + L.bh / 2, len: hlen, thk: L.bh };
}

function mtHeadOf(cell) {
  if (!cell || !cell.isMTunnel) return null;
  return stock[cell.mtHeadIdx] || null;
}

// ── Sound ──
// The push-out cue carries a light spatial bias toward the side
// that fired, so the player feels which mouth responded.

function mtToneAt(freq, dur, type, vol, ramp, pan) {
  ensureAudio();
  var t = audioCtx.currentTime;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (ramp) o.frequency.exponentialRampToValueAtTime(ramp, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  if (audioCtx.createStereoPanner) {
    var p = audioCtx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan || 0)), t);
    g.connect(p); p.connect(audioCtx.destination);
  } else {
    g.connect(audioCtx.destination);
  }
  o.start(t); o.stop(t + dur);
}

// side: -1 = head mouth (left/up), +1 = tail mouth (right/down)
// horizontal biases the stereo field, vertical biases the pitch
function mtPushSfx(side, orient) {
  var pan = (orient === 'v') ? side * 0.2 : side * 0.6;
  var base = (orient === 'v') ? (side < 0 ? 880 : 720) : 800;
  mtToneAt(base, 0.13, 'sine', 0.13, base * 0.4, pan);
  // Counter decrement tick — tied to the push-out, not a separate beat
  setTimeout(function () {
    mtToneAt(1650, 0.05, 'square', 0.035, 1200, pan);
  }, 70);
}

function mtVanishSfx() {
  [740, 560, 415].forEach(function (f, i) {
    setTimeout(function () { mtToneAt(f, 0.22, 'sine', 0.09, f * 0.75, 0); }, i * 110);
  });
  setTimeout(function () { mtToneAt(180, 0.4, 'triangle', 0.05, 90, 0); }, 220);
}

// ── Spawning + lifecycle (called from update) ──

function updateMultiTunnels() {
  var i, s;

  // 1. Timers
  for (i = 0; i < stock.length; i++) {
    s = stock[i];
    if (!s || !s.isMTunnel) continue;
    if (s.mtPulseT > 0) s.mtPulseT = Math.max(0, s.mtPulseT - 0.05);
    if (s.mtLurchT > 0) s.mtLurchT = Math.max(0, s.mtLurchT - MTUNNEL_LURCH_SPEED);
  }

  // 2. Each mouth serves itself from the shared stock
  for (i = 0; i < stock.length; i++) {
    s = stock[i];
    if (!s || !s.isMTunnel) continue;
    var head = mtHeadOf(s);
    if (!head || !head.mtContents) continue;
    if (head.mtVanishT > 0) continue;            // already going
    if (head.mtContents.length === 0) continue;
    if (s.mtSpawning) continue;
    if (s.mtCooldown > 0) { s.mtCooldown--; continue; }

    var exitIdx = getMTunnelExitIdx(i);
    if (exitIdx < 0) continue;
    if (!isTileAvailableForTunnel(exitIdx)) continue;

    // Pull the next box off the single shared list
    var nextBox = head.mtContents.shift();
    s.mtSpawning = true;
    s.mtCooldown = MTUNNEL_SPAWN_COOLDOWN;
    s.mtPulseT = 1;

    stock[exitIdx] = makeTunnelSpawnedBox(exitIdx, nextBox);

    var side = (s.mtRole === 'head') ? -1 : 1;

    // The mushroom heaves toward the barrel that fired, as if it were
    // spitting the box out from inside itself.
    head.mtLurchT = 1;
    head.mtLurchSide = side;

    // The box comes OUT OF THE MUZZLE: it starts small, at the end of
    // the barrel, and travels into its cell.
    var mx = s.x + L.bw / 2, my = s.y + L.bh / 2;
    var ex = stock[exitIdx].x + L.bw / 2, ey = stock[exitIdx].y + L.bh / 2;
    var muzX = mx + (ex - mx) * MTUNNEL_MUZZLE_T;
    var muzY = my + (ey - my) * MTUNNEL_MUZZLE_T;
    stock[exitIdx].emergeT = 1;
    stock[exitIdx].emergeFromX = muzX;
    stock[exitIdx].emergeFromY = muzY;
    stock[exitIdx].popT = 0;   // the emergence is the entrance

    // Muzzle puff, thrown along the barrel's line of fire
    spawnBurst(muzX, muzY, '#FFE7B0', 7);
    var dx = ex - mx, dy = ey - my;
    var dl = Math.sqrt(dx * dx + dy * dy) || 1;
    for (var p = 0; p < 8; p++) {
      var spd = (1.2 + Math.random() * 2.6) * S;
      particles.push({
        x: muzX, y: muzY,
        vx: (dx / dl) * spd + (Math.random() - 0.5) * 1.2 * S,
        vy: (dy / dl) * spd + (Math.random() - 0.5) * 1.2 * S,
        r: (1.5 + Math.random() * 3) * S, color: '#FFF3D2',
        life: 0.85, decay: 0.04, grav: false
      });
    }
    mtPushSfx(side, s.mtOrient);

    // Re-evaluate reveals: the new box may itself be open, and any box
    // that relied on the now-occupied cell as its path closes.
    if (typeof updateBoxReveals === 'function') updateBoxReveals(true);

    (function (cell) {
      setTimeout(function () { cell.mtSpawning = false; }, 350);
    })(s);
  }

  // 3. Spent mushrooms leave the board
  for (i = 0; i < stock.length; i++) {
    s = stock[i];
    if (!s || !s.isMTunnel || s.mtRole !== 'head') continue;

    if (s.mtVanishT > 0) {
      s.mtVanishT = Math.max(0, s.mtVanishT - MTUNNEL_VANISH_SPEED);
      if (s.mtVanishT <= 0) mtFinishVanish(s);
      continue;
    }
    if (!s.mtContents || s.mtContents.length > 0) continue;

    // Wait for both mouths to finish their last push-out, so the
    // final delivery and the disappearance read as one beat.
    var tail = stock[s.mtTailIdx];
    if (s.mtSpawning || (tail && tail.mtSpawning)) continue;

    mtStartVanish(s);
  }
}

function mtStartVanish(head) {
  head.mtVanishT = 1;
  var fp = mtFootprint(head);
  spawnBurst(fp.cx, fp.cy, MT_CAP.light, 18);
  spawnBurst(fp.cx, fp.cy, MT_STEM.light, 12);
  for (var p = 0; p < 14; p++) {
    var a = Math.PI * 2 * p / 14 + Math.random() * 0.4;
    particles.push({
      x: fp.cx + Math.cos(a) * fp.len * 0.3,
      y: fp.cy + Math.sin(a) * fp.thk * 0.3,
      vx: Math.cos(a) * (1 + Math.random() * 2) * S,
      vy: -(1.5 + Math.random() * 3) * S,
      r: (2 + Math.random() * 4) * S,
      color: Math.random() > 0.5 ? MT_CAP.fill : MT_STEM.fill,
      life: 1, decay: 0.014 + Math.random() * 0.012, grav: true
    });
  }
  mtVanishSfx();
}

// The two cells become plain empty slots — they were never playable,
// so nothing about the board's behaviour changes, they just open up.
function mtFinishVanish(head) {
  var idxs = [head.mtHeadIdx, head.mtTailIdx];
  for (var k = 0; k < idxs.length; k++) {
    var idx = idxs[k];
    if (idx < 0 || idx >= stock.length) continue;
    var row = Math.floor(idx / L.cols), col = idx % L.cols;
    stock[idx] = {
      ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
      revealed: true, empty: true, boxType: 'default',
      isTunnel: false, isMTunnel: false, isWall: false,
      iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
      x: L.sx + col * (L.bw + L.bg), y: L.sy + row * (L.bh + L.bg),
      shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
    };
  }
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

// ── Drawing ──
// The board camera looks straight down, so the mushroom is drawn from
// above. Anatomy:
//
//   • ONE cap with TWO FUSED LOBES, one over each cell. Two lobes is
//     what stops a 2:1 footprint reading as a capsule — a clump of
//     fused caps is what a mushroom actually looks like from above —
//     while the outline stays continuous, with no line dividing the
//     cells and one dome lighting the whole body.
//   • A wide dark SLOT cut into each flank, under the overhanging cap
//     tip: the mouth a box is fired out of. Wide, because a box comes
//     out of there.
//   • The shared counter flat on the waist between the lobes.
//
// ONE sprite serves both footprints. It is built in a local space where
// +x runs along the footprint axis and +y across it, then rotated 90°
// for the vertical footprint. A cap seen from above is still a cap when
// you turn it, so the rotation costs nothing.
//
//   local -x slot = head mouth  (left  when horizontal, up   when vertical)
//   local +x slot = tail mouth  (right when horizontal, down when vertical)

// The cap outline: the union of two overlapping ellipses. Both subpaths
// wind the same way, so nonzero fill and clip both give the union and
// the lobes read as one body rather than two discs.
function mtCapPath(ctx, d, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(-d + rx, 0);
  ctx.ellipse(-d, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
  ctx.moveTo(d + rx, 0);
  ctx.ellipse(d, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
}

// Where a slot sits along the local axis. It shoves outward while
// firing, which is most of what sells the spit.
function mtSlotX(HL, thk, fire) {
  return HL * 0.80 + thk * 0.07 * fire;
}

function mtSlotHalfSpan(thk, fire) {
  return thk * 0.30 * (1 + 0.06 * fire);
}

function drawMTunnelOnGrid(ctx, head, S, tick) {
  var fp = mtFootprint(head);
  var vert = (head.mtOrient === 'v');
  var len = fp.len, thk = fp.thk;
  var HL = len / 2;

  // Two lobes, each roughly over one cell, overlapping enough that the
  // waist between them stays broad.
  var capRX = HL * 0.98 / 1.55;
  var capD = capRX * 0.55;
  var capRY = thk * 0.50;
  var inner = 0.93;   // body sits just inside the rim, which draws the outline

  var vanish = head.mtVanishT > 0 ? (1 - head.mtVanishT) : 0;
  var remaining = head.mtContents ? head.mtContents.length : 0;
  var tailCell = stock[head.mtTailIdx];
  var fireA = head.mtPulseT || 0;
  var fireB = (tailCell && tailCell.mtPulseT) || 0;

  // ── The spit: the whole thing heaves toward the mouth that fired ──
  // A quick lunge outward, then a softer counter-settle.
  var lurch = 0, lside = head.mtLurchSide || -1;
  if (head.mtLurchT > 0) {
    var lp = 1 - head.mtLurchT;
    lurch = Math.sin(lp * Math.PI * 1.9) * Math.pow(1 - lp, 1.6);
  }
  var lurchShift = lside * thk * 0.17 * lurch;

  ctx.save();

  if (vanish > 0) ctx.globalAlpha = Math.max(0, 1 - vanish * 1.05);

  // Seen from above, lifting away reads as rising toward the camera
  ctx.translate(fp.cx, fp.cy);
  var vs = 1 + vanish * 0.42;
  ctx.scale(vs, vs);
  if (vert) ctx.rotate(Math.PI / 2);
  ctx.rotate(Math.sin(tick * 0.028 + (head.mtPhase || 0)) * 0.012 + vanish * 0.12);

  // ── Cast shadow on the board, which does NOT follow the lunge ──
  ctx.save();
  ctx.translate(thk * 0.06, thk * 0.08);
  ctx.fillStyle = 'rgba(70,55,40,0.16)';
  mtCapPath(ctx, capD, capRX, capRY);
  ctx.fill();
  ctx.restore();

  // Everything from here lunges and squash-stretches together
  ctx.translate(lurchShift, 0);
  ctx.rotate(-lside * 0.05 * lurch);
  ctx.scale(1 + 0.10 * Math.abs(lurch), 1 - 0.07 * Math.abs(lurch));

  // ── Outline, as a slightly larger fill of the same union ──
  mtCapPath(ctx, capD, capRX, capRY);
  ctx.fillStyle = '#8E2A1A';
  ctx.fill();

  // ── Cap body — ONE dome across both lobes ──
  mtCapPath(ctx, capD * inner, capRX * inner, capRY * inner);
  var cg = ctx.createRadialGradient(-HL * 0.18, -capRY * 0.36, thk * 0.05, 0, 0, HL * 1.02);
  cg.addColorStop(0, MT_CAP.light);
  cg.addColorStop(0.55, MT_CAP.fill);
  cg.addColorStop(1, MT_CAP.dark);
  ctx.fillStyle = cg;
  ctx.fill();

  ctx.save();
  mtCapPath(ctx, capD * inner, capRX * inner, capRY * inner);
  ctx.clip();

  // Shaded flank, down-right, opposite the light
  var fl = ctx.createLinearGradient(-HL * 0.5, -capRY * 0.6, HL * 0.9, capRY * 0.9);
  fl.addColorStop(0, 'rgba(108,28,16,0)');
  fl.addColorStop(1, 'rgba(108,28,16,0.32)');
  ctx.fillStyle = fl;
  ctx.fillRect(-HL, -capRY, HL * 2, capRY * 2);

  // A crease along the waist where the two lobes meet — enough to read
  // as fused caps, not enough to divide the body
  var cr = ctx.createLinearGradient(0, -capRY, 0, capRY);
  cr.addColorStop(0, 'rgba(120,34,20,0.12)');
  cr.addColorStop(0.5, 'rgba(120,34,20,0.02)');
  cr.addColorStop(1, 'rgba(120,34,20,0.12)');
  ctx.fillStyle = cr;
  ctx.fillRect(-thk * 0.035, -capRY, thk * 0.07, capRY * 2);

  // Specular sheen, up-left, as the light comes from
  var sh = ctx.createRadialGradient(-HL * 0.34, -capRY * 0.46, thk * 0.02, -HL * 0.34, -capRY * 0.46, thk * 0.60);
  sh.addColorStop(0, 'rgba(255,255,255,0.28)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-HL, -capRY, HL * 2, capRY * 2);

  // Cream spots, each with a touch of contact shadow so they sit ON the
  // cap. Scattered across the whole body, ignoring the lobe boundary.
  var span = capD + capRX;
  var spots = [
    [-0.50, -0.44, 0.128], [-0.17, 0.48, 0.104], [0.12, -0.52, 0.116],
    [0.47, 0.40, 0.110], [0.61, -0.34, 0.094], [-0.66, 0.20, 0.082]
  ];
  for (var i = 0; i < spots.length; i++) {
    var sx = spots[i][0] * span, sy = spots[i][1] * capRY, sr = spots[i][2] * thk;
    ctx.fillStyle = 'rgba(110,32,20,0.22)';
    ctx.beginPath();
    ctx.ellipse(sx + sr * 0.12, sy + sr * 0.16, sr, sr * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
    var sg = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.35, sr * 0.1, sx, sy, sr);
    sg.addColorStop(0, 'rgba(255,253,246,0.99)');
    sg.addColorStop(1, 'rgba(243,228,200,0.96)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(sx, sy, sr, sr * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── The two mouths, cut into the flanks under the overhanging tips ──
  mtDrawSlot(ctx, -1, HL, thk, S, fireA, tick);
  mtDrawSlot(ctx, 1, HL, thk, S, fireB, tick);

  // Alive while stock remains
  if (remaining > 0 && vanish === 0) {
    ctx.globalAlpha = 0.05 + Math.sin(tick * 0.045 + (head.mtPhase || 0)) * 0.035;
    ctx.fillStyle = '#FFE7B0';
    ctx.fillRect(-HL, -capRY, HL * 2, capRY * 2);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Muzzle flash, over everything
  if (fireA > 0) mtDrawMuzzleFlash(ctx, -1, HL, thk, fireA);
  if (fireB > 0) mtDrawMuzzleFlash(ctx, 1, HL, thk, fireB);

  ctx.restore();

  // ── Counter — one badge on the waist between the lobes, which is the
  // seam between the cells. It rides the lunge with the cap, but stays
  // unrotated so it is legible in both footprints.
  if (vanish < 0.35) {
    var bx = fp.cx, by = fp.cy;
    if (vert) by += lurchShift; else bx += lurchShift;
    mtDrawCounter(ctx, bx, by, thk, S, remaining, Math.max(fireA, fireB),
      vanish > 0 ? Math.max(0, 1 - vanish * 3) : 1);
  }
}

// One mouth: a wide dark slot in the cap's flank, plus the outward
// chevron just inside it. dirSign -1 = head side, +1 = tail side; drawn
// mirrored so there is literally one shape. The caller has clipped to
// the cap, so the slot can never spill outside the body.
function mtDrawSlot(ctx, dirSign, HL, thk, S, fire, tick) {
  var sx = mtSlotX(HL, thk, fire);
  var half = mtSlotHalfSpan(thk, fire);
  var w = thk * 0.17;

  ctx.save();
  ctx.scale(dirSign, 1);

  // Shadow the cap gathers around the opening
  var og = ctx.createLinearGradient(sx - w * 2.2, 0, sx, 0);
  og.addColorStop(0, 'rgba(30,14,30,0)');
  og.addColorStop(1, 'rgba(30,14,30,0.38)');
  ctx.fillStyle = og;
  ctx.fillRect(sx - w * 2.2, -half * 1.1, w * 2.2, half * 2.2);

  // The slot
  rRect(sx - w * 0.5, -half, w, half * 2, w * 0.5);
  var mg = ctx.createLinearGradient(0, -half, 0, half);
  mg.addColorStop(0, '#3C2B45');
  mg.addColorStop(0.45, '#1B1222');
  mg.addColorStop(1, '#0A0610');
  ctx.fillStyle = mg;
  ctx.fill();

  // Lit outer edge, so it reads as an opening rather than a painted bar
  ctx.strokeStyle = 'rgba(255,238,208,0.5)';
  ctx.lineWidth = 1.6 * S;
  ctx.beginPath();
  ctx.moveTo(sx + w * 0.5, -half + w * 0.5);
  ctx.lineTo(sx + w * 0.5, half - w * 0.5);
  ctx.stroke();

  // Depth toward the middle of the slot
  var dg = ctx.createRadialGradient(sx, 0, thk * 0.01, sx, 0, half);
  dg.addColorStop(0, 'rgba(0,0,0,0.5)');
  dg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dg;
  rRect(sx - w * 0.5, -half, w, half * 2, w * 0.5);
  ctx.fill();

  // Outward chevron — the Tunnel-family direction cue
  var aS = thk * 0.10 * (1 + fire * 0.32);
  var ax = sx - w * 1.9;
  var pulse = 0.8 + Math.sin(tick * 0.07) * 0.1 + fire * 0.2;
  ctx.shadowColor = 'rgba(50,10,4,0.75)';
  ctx.shadowBlur = 3 * S;
  ctx.fillStyle = 'rgba(255,228,154,' + Math.min(1, pulse) + ')';
  ctx.beginPath();
  ctx.moveTo(ax + aS, 0);
  ctx.lineTo(ax - aS * 0.62, -aS * 0.92);
  ctx.lineTo(ax - aS * 0.62, aS * 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.restore();
}

function mtDrawMuzzleFlash(ctx, dirSign, HL, thk, fire) {
  var sx = dirSign * mtSlotX(HL, thk, fire);
  var R = thk * 0.58;
  var g = ctx.createRadialGradient(sx, 0, thk * 0.02, sx, 0, R);
  g.addColorStop(0, 'rgba(255,232,166,' + (0.8 * fire) + ')');
  g.addColorStop(1, 'rgba(255,232,166,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, 0, R, 0, Math.PI * 2); ctx.fill();
}

function mtDrawCounter(ctx, bx, by, span, S, remaining, glow, alpha) {
  var R = span * 0.23;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  // Tick pop on decrement — the only moment the shared stock speaks
  ctx.translate(bx, by);
  var pop = 1 + glow * 0.22;
  ctx.scale(pop, pop);

  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 1.5 * S;
  var g = ctx.createLinearGradient(0, -R, 0, R);
  g.addColorStop(0, 'rgba(255,248,228,0.98)');
  g.addColorStop(1, 'rgba(246,217,164,0.98)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(150,60,40,0.7)';
  ctx.lineWidth = 2 * S;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = remaining > 0 ? '#8E2A1C' : 'rgba(140,120,100,0.75)';
  ctx.font = 'bold ' + (R * 1.35) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(remaining, 0, R * 0.06);

  ctx.restore();
}

// ── Editor validation ──
// Both mouths must have a populatable cell in front of them. A cell
// off the grid, a wall, a Tunnel or another Multi Cell Tunnel would
// strand the shared stock, so those are hard errors.

function mtValidate(grid, headIdx, orient) {
  var res = { ok: true, errors: [], hints: [], tailIdx: mtTailIdx(headIdx, orient, 7) };
  if (res.tailIdx < 0) {
    res.ok = false;
    res.errors.push('Second cell falls outside the grid');
    return res;
  }
  var cells = [{ idx: headIdx, role: 'head' }, { idx: res.tailIdx, role: 'tail' }];
  for (var k = 0; k < cells.length; k++) {
    var name = MT_MOUTH_LABEL[orient][k];
    var t = mtMouthTargetIdx(cells[k].idx, orient, cells[k].role, 7, 7);
    if (t < 0) {
      res.ok = false;
      res.errors.push(name + ' mouth points off the grid');
      continue;
    }
    var c = grid[t];
    if (c && c.wall) {
      res.ok = false;
      res.errors.push(name + ' mouth is blocked by a wall');
    } else if (c && c.tunnel) {
      res.ok = false;
      res.errors.push(name + ' mouth is blocked by a tunnel');
    } else if (c && c.mtunnel) {
      res.ok = false;
      res.errors.push(name + ' mouth is blocked by another mushroom');
    } else if (!c) {
      res.hints.push(name + ' mouth starts on an empty cell');
    }
  }
  return res;
}

// The head index of the entity a given editor-grid cell belongs to,
// or -1 if the cell is not part of a well-formed Multi Cell Tunnel.
function mtHeadIdxOfCell(grid, idx) {
  var c = grid[idx];
  if (!c || !c.mtunnel) return -1;
  var orient = c.orient || 'h';
  if (c.role === 'head') {
    var t = mtTailIdx(idx, orient, 7);
    if (t < 0) return -1;
    var tc = grid[t];
    return (tc && tc.mtunnel && tc.role === 'tail') ? idx : -1;
  }
  var h = (orient === 'v') ? idx - 7 : idx - 1;
  if (h < 0) return -1;
  if (orient !== 'v' && Math.floor(h / 7) !== Math.floor(idx / 7)) return -1;
  var hc = grid[h];
  return (hc && hc.mtunnel && hc.role === 'head') ? h : -1;
}

// Every Multi Cell Tunnel on a grid, as { headIdx, orient, contents }.
function mtCollect(grid) {
  var out = [];
  for (var i = 0; i < grid.length; i++) {
    var c = grid[i];
    if (!c || !c.mtunnel || c.role !== 'head') continue;
    var tail = mtTailIdx(i, c.orient || 'h', 7);
    if (tail < 0) continue;
    var tc = grid[tail];
    if (!tc || !tc.mtunnel || tc.role !== 'tail') continue;
    out.push({ headIdx: i, tailIdx: tail, orient: c.orient || 'h', contents: c.contents || [] });
  }
  return out;
}
