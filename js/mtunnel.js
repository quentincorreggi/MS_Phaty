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
var MTUNNEL_MUZZLE_T = 0.52;       // muzzle position between the two cell centres
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
// above: a spotted cap, domed by shading rather than by silhouette,
// with a snout poking out of each of its two tips — the bore the boxes
// are fired from — and the shared counter in the middle.
//
// ONE sprite serves both footprints. It is built in a local space where
// +x runs along the footprint axis and +y across it, then rotated 90°
// for the vertical footprint. A cap seen from above is still a cap when
// you turn it, so the rotation costs nothing.
//
//   local -x tip = head mouth  (left  when horizontal, up   when vertical)
//   local +x tip = tail mouth  (right when horizontal, down when vertical)
//
// Each snout is drawn UNDER the cap, so only its muzzle shows and there
// is no seam betraying a part stuck on. One cap, one counter, nothing
// dividing the two cells: the entity reads as a single thing that can
// spawn at two exits, never as two adjacent Tunnels.

// The cap outline in local space — a soft blob, wider in the middle,
// tapering toward the two tips.
function mtCapPath(ctx, HL, HT) {
  ctx.beginPath();
  ctx.moveTo(-HL * 0.99, 0);
  ctx.bezierCurveTo(-HL * 0.99, -HT * 0.86, -HL * 0.55, -HT * 0.96, 0, -HT * 0.96);
  ctx.bezierCurveTo(HL * 0.55, -HT * 0.96, HL * 0.99, -HT * 0.86, HL * 0.99, 0);
  ctx.bezierCurveTo(HL * 0.99, HT * 0.86, HL * 0.55, HT * 0.96, 0, HT * 0.96);
  ctx.bezierCurveTo(-HL * 0.55, HT * 0.96, -HL * 0.99, HT * 0.86, -HL * 0.99, 0);
  ctx.closePath();
}

function drawMTunnelOnGrid(ctx, head, S, tick) {
  var fp = mtFootprint(head);
  var vert = (head.mtOrient === 'v');
  var len = fp.len, thk = fp.thk;
  var HL = len / 2, HT = thk / 2;

  var vanish = head.mtVanishT > 0 ? (1 - head.mtVanishT) : 0;
  var remaining = head.mtContents ? head.mtContents.length : 0;
  var tailCell = stock[head.mtTailIdx];
  var fireA = head.mtPulseT || 0;
  var fireB = (tailCell && tailCell.mtPulseT) || 0;

  // ── The spit: the whole thing heaves toward the barrel that fired ──
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
  ctx.translate(thk * 0.05, thk * 0.07);
  ctx.fillStyle = 'rgba(70,55,40,0.16)';
  mtCapPath(ctx, HL * 0.97, HT * 0.95);
  ctx.fill();
  ctx.restore();

  // Everything from here lunges and squash-stretches together
  ctx.translate(lurchShift, 0);
  ctx.rotate(-lside * 0.05 * lurch);
  ctx.scale(1 + 0.10 * Math.abs(lurch), 1 - 0.07 * Math.abs(lurch));

  // ── The two snouts, under the cap so only the muzzles show ──
  mtDrawBarrel(ctx, -1, HL, HT, thk, S, fireA);
  mtDrawBarrel(ctx, 1, HL, HT, thk, S, fireB);

  // ── Cap body ──
  mtCapPath(ctx, HL, HT);
  var cg = ctx.createRadialGradient(-HL * 0.20, -HT * 0.30, thk * 0.06, 0, 0, HL * 0.98);
  cg.addColorStop(0, MT_CAP.light);
  cg.addColorStop(0.62, MT_CAP.fill);
  cg.addColorStop(1, MT_CAP.dark);
  ctx.fillStyle = cg;
  ctx.fill();

  ctx.save();
  mtCapPath(ctx, HL, HT);
  ctx.clip();

  // Rim darkening — the dome falling away at the edges
  ctx.strokeStyle = 'rgba(118,34,20,0.26)';
  ctx.lineWidth = thk * 0.13;
  mtCapPath(ctx, HL, HT);
  ctx.stroke();

  // Specular sheen, up-left, as the light comes from
  var sh = ctx.createRadialGradient(-HL * 0.30, -HT * 0.40, thk * 0.02, -HL * 0.30, -HT * 0.40, thk * 0.62);
  sh.addColorStop(0, 'rgba(255,255,255,0.30)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-HL, -HT, len, thk);

  // Cream spots, each with a touch of contact shadow so they sit ON the
  // cap. Kept clear of the rim so none reads as a bite out of the edge.
  var spots = [
    [-0.64, -0.24, 0.130], [-0.35, 0.30, 0.098], [-0.04, -0.42, 0.114],
    [0.28, 0.20, 0.138], [0.54, -0.32, 0.102], [0.74, 0.26, 0.082],
    [-0.85, 0.22, 0.070]
  ];
  for (var i = 0; i < spots.length; i++) {
    var sx = spots[i][0] * HL, sy = spots[i][1] * HT, sr = spots[i][2] * thk;
    ctx.fillStyle = 'rgba(110,32,20,0.26)';
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

  // Shading where each snout leaves the cap, plus its direction chevron
  mtDrawBarrelRoot(ctx, -1, HL, HT, thk, S, fireA, tick);
  mtDrawBarrelRoot(ctx, 1, HL, HT, thk, S, fireB, tick);

  // Alive while stock remains
  if (remaining > 0 && vanish === 0) {
    ctx.globalAlpha = 0.05 + Math.sin(tick * 0.045 + (head.mtPhase || 0)) * 0.035;
    ctx.fillStyle = '#FFE7B0';
    ctx.fillRect(-HL, -HT, len, thk);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Cap outline
  ctx.strokeStyle = 'rgba(130,44,28,0.45)';
  ctx.lineWidth = 1.6 * S;
  mtCapPath(ctx, HL, HT);
  ctx.stroke();

  // Muzzles over the cap, so the bore each box is fired from is always
  // the clearest thing at the tip
  mtDrawMuzzle(ctx, -1, HL, thk, S, fireA);
  mtDrawMuzzle(ctx, 1, HL, thk, S, fireB);

  // Muzzle flash, over everything
  if (fireA > 0) mtDrawMuzzleFlash(ctx, -1, HL, thk, fireA);
  if (fireB > 0) mtDrawMuzzleFlash(ctx, 1, HL, thk, fireB);

  ctx.restore();

  // ── Counter — one badge in the middle, on the seam, always upright ──
  // It rides the lunge with the cap, but stays unrotated so it is
  // legible in both footprints.
  if (vanish < 0.35) {
    var bx = fp.cx, by = fp.cy;
    if (vert) by += lurchShift; else bx += lurchShift;
    mtDrawCounter(ctx, bx, by, thk, S, remaining, Math.max(fireA, fireB),
      vanish > 0 ? Math.max(0, 1 - vanish * 3) : 1);
  }
}

// Where the muzzle of a snout sits, along the local axis. It thrusts
// outward while firing, which is most of what sells the spit.
function mtBarrelTip(HL, thk, fire) {
  return HL * 0.97 + thk * 0.10 * fire;
}

// The tube of one snout. dirSign -1 = head tip, +1 = tail tip; drawn
// mirrored for the head so there is literally one shape. Drawn before
// the cap, so the cap hides its root and there is no seam betraying a
// part stuck on.
function mtDrawBarrel(ctx, dirSign, HL, HT, thk, S, fire) {
  var tip = mtBarrelTip(HL, thk, fire);
  var root = HL * 0.5;
  var rootW = thk * 0.16;
  var mouthW = thk * 0.26 * (1 + 0.08 * fire);

  ctx.save();
  ctx.scale(dirSign, 1);

  ctx.beginPath();
  ctx.moveTo(root, -rootW);
  ctx.quadraticCurveTo((root + tip) * 0.5, -mouthW * 0.88, tip, -mouthW);
  ctx.lineTo(tip, mouthW);
  ctx.quadraticCurveTo((root + tip) * 0.5, mouthW * 0.88, root, rootW);
  ctx.closePath();
  var bg = ctx.createLinearGradient(0, -mouthW, 0, mouthW);
  bg.addColorStop(0, MT_CAP.light);
  bg.addColorStop(0.4, MT_CAP.fill);
  bg.addColorStop(1, MT_CAP.dark);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(130,44,28,0.5)';
  ctx.lineWidth = 1.5 * S;
  ctx.stroke();

  ctx.restore();
}

// The flared rim and the bore at the end of one snout — the hole the
// box actually comes out of. Drawn after the cap.
function mtDrawMuzzle(ctx, dirSign, HL, thk, S, fire) {
  var tip = mtBarrelTip(HL, thk, fire);
  var mouthW = thk * 0.26 * (1 + 0.08 * fire);
  var rimX = thk * 0.105;

  ctx.save();
  ctx.scale(dirSign, 1);

  // Flared rim
  ctx.beginPath();
  ctx.ellipse(tip, 0, rimX, mouthW, 0, 0, Math.PI * 2);
  var rg = ctx.createLinearGradient(0, -mouthW, 0, mouthW);
  rg.addColorStop(0, MT_CAP.light);
  rg.addColorStop(0.45, MT_CAP.fill);
  rg.addColorStop(1, MT_CAP.dark);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(130,44,28,0.55)';
  ctx.lineWidth = 1.4 * S;
  ctx.stroke();

  // Lit edge on the outward side of the rim
  ctx.strokeStyle = 'rgba(255,240,214,0.55)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.ellipse(tip, 0, rimX, mouthW, 0, -Math.PI * 0.42, Math.PI * 0.42);
  ctx.stroke();

  // The bore
  ctx.beginPath();
  ctx.ellipse(tip, 0, rimX * 0.5, mouthW * 0.66, 0, 0, Math.PI * 2);
  var ig = ctx.createRadialGradient(tip - rimX * 0.2, 0, thk * 0.01, tip, 0, mouthW * 0.7);
  ig.addColorStop(0, '#0B0610');
  ig.addColorStop(1, '#31233A');
  ctx.fillStyle = ig;
  ctx.fill();

  ctx.restore();
}

// Shading inside the cap where a snout leaves it, plus the outward
// chevron — the Tunnel-family direction cue.
function mtDrawBarrelRoot(ctx, dirSign, HL, HT, thk, S, fire, tick) {
  var g = ctx.createLinearGradient(dirSign * HL * 0.60, 0, dirSign * HL, 0);
  g.addColorStop(0, 'rgba(28,16,30,0)');
  g.addColorStop(1, 'rgba(28,16,30,0.22)');
  ctx.fillStyle = g;
  if (dirSign < 0) ctx.fillRect(-HL, -HT, HL * 0.40, HT * 2);
  else ctx.fillRect(HL * 0.60, -HT, HL * 0.40, HT * 2);

  var aS = thk * 0.105 * (1 + fire * 0.32);
  var ax = dirSign * HL * 0.72;
  var pulse = 0.8 + Math.sin(tick * 0.07) * 0.1 + fire * 0.2;
  ctx.save();
  ctx.shadowColor = 'rgba(60,12,6,0.7)';
  ctx.shadowBlur = 3 * S;
  ctx.fillStyle = 'rgba(255,224,146,' + Math.min(1, pulse) + ')';
  ctx.beginPath();
  ctx.moveTo(ax + dirSign * aS, 0);
  ctx.lineTo(ax - dirSign * aS * 0.62, -aS * 0.92);
  ctx.lineTo(ax - dirSign * aS * 0.62, aS * 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function mtDrawMuzzleFlash(ctx, dirSign, HL, thk, fire) {
  var tip = dirSign * mtBarrelTip(HL, thk, fire);
  var R = thk * 0.5;
  var g = ctx.createRadialGradient(tip, 0, thk * 0.02, tip, 0, R);
  g.addColorStop(0, 'rgba(255,232,166,' + (0.8 * fire) + ')');
  g.addColorStop(1, 'rgba(255,232,166,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(tip, 0, R, 0, Math.PI * 2); ctx.fill();
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
