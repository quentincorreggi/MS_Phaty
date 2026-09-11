// ============================================================
// mtunnel.js — Multi Cell Tunnel ("the mushroom")
// ============================================================
// A Tunnel spin-off that occupies SEVERAL cells and has TWO mouths
// instead of one, fed by a SINGLE shared stock of boxes.
//
// Three footprints, all with exactly two mouths:
//
//   • Horizontal — 2 cells side by side, mouths LEFT and RIGHT.
//   • Vertical   — 2 cells stacked,     mouths UP and DOWN.
//   • L shape    — 3 cells: a CORNER plus one arm on each of two
//                  perpendicular sides. Each arm's mouth points on
//                  outward, so the two mouths sit at right angles
//                  instead of back to back, and the corner cell
//                  carries the counter. Four rotations.
//
// The mouths face away from each other, so the structure splits a
// region and the player decides which part gets fed — by choosing
// which side to play.
//
// The stock is common to the whole entity: the next box out is the
// next box in one ordered list, whichever mouth called for it. The
// counter shows the boxes still INSIDE the structure. When the stock
// is empty the mushroom disappears, freeing all of its cells.
//
// Grid data:
//   head → { mtunnel: true, role: 'head', orient: <shape>, contents: [{ci,type}...] }
//   arm  → { mtunnel: true, role: 'tail', orient: <shape>, dr: <int>, dc: <int> }
// where dr/dc is the arm's offset from the head. The head is the left
// or top cell of a straight footprint, and the corner of an L.
// ============================================================

var MTUNNEL_SPAWN_COOLDOWN = 40;   // ticks between spawns, per mouth
var MTUNNEL_START_COOLDOWN = 60;   // grace period at level start
var MTUNNEL_VANISH_SPEED = 0.022;  // ~45 frames for the disappearance
var MTUNNEL_LURCH_SPEED = 0.045;   // ~22 frames for the spit-out heave
var MTUNNEL_EMERGE_SPEED = 0.055;  // ~18 frames for a box to clear the muzzle
var MTUNNEL_MUZZLE_T = 0.44;       // where a slot sits, between the two cell centres
var MTUNNEL_MAX_STOCK = 6;         // hard limit, same family as Tunnel
var MTUNNEL_SOFT_STOCK = 4;        // recommended stock

var MT_CAP = { light: '#F58C70', fill: '#DE4E33', dark: '#A0301F' };
var MT_STEM = { light: '#FCF3E0', fill: '#EDDCBB', dark: '#C0A87E' };
var MT_CAP_FRONT = '#8A2514';      // the cap's edge, turned away from the light

// ── Shapes ──
// Each shape lists its cells as offsets from the head, and the
// direction that cell's mouth spawns in ([dr,dc], or null for a cell
// with no mouth). cells[0] is always the head.
var MT_SHAPES = {
  h: {
    kind: 'straight', label: 'Horizontal', glyph: '▬',
    cells: [
      { dr: 0, dc: 0, mouth: [0, -1] },
      { dr: 0, dc: 1, mouth: [0, 1] }
    ]
  },
  v: {
    kind: 'straight', label: 'Vertical', glyph: '❙',
    cells: [
      { dr: 0, dc: 0, mouth: [-1, 0] },
      { dr: 1, dc: 0, mouth: [1, 0] }
    ]
  },
  // The four rotations of the L. The glyph is the shape itself: the
  // corner sits where the two strokes meet and the arms run out along
  // them, which is also where each mouth points.
  l0: {
    kind: 'L', label: 'L up+right', glyph: '└',
    cells: [
      { dr: 0, dc: 0, mouth: null },
      { dr: -1, dc: 0, mouth: [-1, 0] },
      { dr: 0, dc: 1, mouth: [0, 1] }
    ]
  },
  l1: {
    kind: 'L', label: 'L right+down', glyph: '┌',
    cells: [
      { dr: 0, dc: 0, mouth: null },
      { dr: 0, dc: 1, mouth: [0, 1] },
      { dr: 1, dc: 0, mouth: [1, 0] }
    ]
  },
  l2: {
    kind: 'L', label: 'L down+left', glyph: '┐',
    cells: [
      { dr: 0, dc: 0, mouth: null },
      { dr: 1, dc: 0, mouth: [1, 0] },
      { dr: 0, dc: -1, mouth: [0, -1] }
    ]
  },
  l3: {
    kind: 'L', label: 'L left+up', glyph: '┘',
    cells: [
      { dr: 0, dc: 0, mouth: null },
      { dr: 0, dc: -1, mouth: [0, -1] },
      { dr: -1, dc: 0, mouth: [-1, 0] }
    ]
  }
};
var MT_SHAPE_ORDER = ['h', 'v', 'l0', 'l1', 'l2', 'l3'];
var MT_L_ORDER = ['l0', 'l1', 'l2', 'l3'];

function mtShape(orient) {
  return MT_SHAPES[orient] || MT_SHAPES.h;
}

function mtIsL(orient) {
  return mtShape(orient).kind === 'L';
}

// ── Directions ──

function mtDirName(dr, dc) {
  if (dr < 0) return 'Up';
  if (dr > 0) return 'Down';
  if (dc < 0) return 'Left';
  return 'Right';
}

function mtDirArrow(dr, dc) {
  if (dr < 0) return '▲';
  if (dr > 0) return '▼';
  if (dc < 0) return '◀';
  return '▶';
}

// ── Geometry ──

// Every cell of an entity as { idx, dr, dc, mouth }, or null when any
// cell would fall outside the grid. Half a mushroom cannot exist.
function mtCellsOf(headIdx, orient, cols, rows) {
  cols = cols || 7; rows = rows || cols;
  var shape = mtShape(orient);
  var hr = Math.floor(headIdx / cols), hc = headIdx % cols;
  var out = [];
  for (var i = 0; i < shape.cells.length; i++) {
    var c = shape.cells[i];
    var r = hr + c.dr, k = hc + c.dc;
    if (r < 0 || r >= rows || k < 0 || k >= cols) return null;
    out.push({ idx: r * cols + k, dr: c.dr, dc: c.dc, mouth: c.mouth });
  }
  return out;
}

// The cell a mouth spawns into, from the cell that carries it.
function mtMouthTargetIdx(cellIdx, mouth, cols, rows) {
  if (!mouth) return -1;
  cols = cols || 7; rows = rows || cols;
  var r = Math.floor(cellIdx / cols) + mouth[0];
  var c = (cellIdx % cols) + mouth[1];
  if (r < 0 || r >= rows || c < 0 || c >= cols) return -1;
  return r * cols + c;
}

// Runtime version — reads the mouth off the stock cell.
function getMTunnelExitIdx(cellIdx) {
  var s = stock[cellIdx];
  if (!s || !s.isMTunnel || !s.mtMouth) return -1;
  return mtMouthTargetIdx(cellIdx, s.mtMouth, L.cols, L.rows);
}

function mtHeadOf(cell) {
  if (!cell || !cell.isMTunnel) return null;
  return stock[cell.mtHeadIdx] || null;
}

// The on-screen rect of every cell of an entity, plus the bounding box
// of the whole thing. One cell is L.bw by L.bh, which are equal.
function mtCellRects(head) {
  var cells = mtCellsOf(head.mtHeadIdx, head.mtOrient, L.cols, L.rows) || [];
  var cell = L.bw, step = L.bw + L.bg;
  var hr = Math.floor(head.mtHeadIdx / L.cols), hc = head.mtHeadIdx % L.cols;
  var out = [], minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    var x = L.sx + (hc + c.dc) * step;
    var y = L.sy + (hr + c.dr) * step;
    out.push({
      idx: c.idx, dr: c.dr, dc: c.dc, mouth: c.mouth,
      x: x, y: y, cx: x + cell / 2, cy: y + cell / 2
    });
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + cell > maxX) maxX = x + cell;
    if (y + cell > maxY) maxY = y + cell;
  }
  return {
    cells: out, cell: cell, step: step,
    minX: minX, minY: minY, maxX: maxX, maxY: maxY,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
  };
}

// Screen footprint of a straight entity: len along its axis, thk across.
function mtFootprint(head) {
  if (head.mtOrient === 'v') {
    var vlen = 2 * L.bh + L.bg;
    return { cx: head.x + L.bw / 2, cy: head.y + vlen / 2, len: vlen, thk: L.bw };
  }
  var hlen = 2 * L.bw + L.bg;
  return { cx: head.x + hlen / 2, cy: head.y + L.bh / 2, len: hlen, thk: L.bh };
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

// The cue is biased toward the mouth that fired: left/right pans the
// stereo field, up/down shifts the pitch, so the player feels which
// mouth responded without looking.
function mtPushSfx(mouth) {
  var pan = mouth[1] * 0.6 + 0;
  var base = 800 - mouth[0] * 90;
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

    // The mushroom heaves toward the mouth that fired, as if it were
    // spitting the box out from inside itself.
    head.mtLurchT = 1;
    head.mtLurchDR = s.mtMouth[0];
    head.mtLurchDC = s.mtMouth[1];

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
    mtPushSfx(s.mtMouth);

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

    // Wait for every mouth to finish its last push-out, so the final
    // delivery and the disappearance read as one beat.
    var busy = false;
    for (var c = 0; c < s.mtCellIdxs.length; c++) {
      var cc = stock[s.mtCellIdxs[c]];
      if (cc && cc.isMTunnel && cc.mtSpawning) { busy = true; break; }
    }
    if (busy) continue;

    mtStartVanish(s);
  }
}

function mtStartVanish(head) {
  head.mtVanishT = 1;
  var b = mtCellRects(head);
  spawnBurst(b.cx, b.cy, MT_CAP.light, 18);
  spawnBurst(b.cx, b.cy, MT_STEM.light, 12);
  for (var p = 0; p < 14; p++) {
    var a = Math.PI * 2 * p / 14 + Math.random() * 0.4;
    particles.push({
      x: b.cx + Math.cos(a) * (b.maxX - b.minX) * 0.3,
      y: b.cy + Math.sin(a) * (b.maxY - b.minY) * 0.3,
      vx: Math.cos(a) * (1 + Math.random() * 2) * S,
      vy: -(1.5 + Math.random() * 3) * S,
      r: (2 + Math.random() * 4) * S,
      color: Math.random() > 0.5 ? MT_CAP.fill : MT_STEM.fill,
      life: 1, decay: 0.014 + Math.random() * 0.012, grav: true
    });
  }
  mtVanishSfx();
}

// Every cell becomes a plain empty slot — they were never playable, so
// nothing about the board's behaviour changes, they just open up.
function mtFinishVanish(head) {
  var idxs = head.mtCellIdxs;
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
// The board camera looks down but slightly from the front, the same
// three-quarter view the boxes are drawn in. So the mushroom shows:
//
//   • a square-cornered CAP SLAB spanning both cells, in the board's
//     own rounded-rect language, with a lit top face and a darker
//     front face below the cap's edge — that edge is what makes the
//     view read as three-quarter rather than straight down;
//   • a sliver of STEM peeking out under the middle of the cap;
//   • a wide dark SLOT at each END of the slab: the mouth a box is
//     fired out of, sized for the box that comes out of it;
//   • the shared counter on the top face, over the seam.
//
// ONE sprite serves both footprints. It is built in a local space where
// +x runs along the footprint axis and +y across it, then rotated 90°
// for the vertical footprint, so the two orientations are literally the
// same drawing. One slab, one stem, one counter, nothing dividing the
// two cells: the entity reads as a single thing that spawns at two
// exits, never as two adjacent Tunnels.
//
//   local -x slot = head mouth  (left  when horizontal, up   when vertical)
//   local +x slot = tail mouth  (right when horizontal, down when vertical)

// The cap slab, in the board's rounded-rect language.
function mtCapPath(ctx, HL, HT, thk, k) {
  k = k || 1;
  var x = -HL * 0.99 * k, w = HL * 1.98 * k;
  var top = -HT * 1.0 * k, h = HT * 1.60 * k;
  rRect(x, top, w, h, thk * 0.18 * k);
}

// Where a slot sits along the local axis. It shoves outward while
// firing, which is most of what sells the spit.
function mtSlotX(HL, thk, fire) {
  return HL * 0.99 - thk * 0.14 + thk * 0.07 * fire;
}

// Dispatch on footprint kind: the straight shapes are one sprite
// rotated, the L is laid out in screen space because its four
// rotations each sit differently under the light.
function drawMTunnelOnGrid(ctx, head, S, tick) {
  if (mtIsL(head.mtOrient)) mtDrawL(ctx, head, S, tick);
  else mtDrawStraight(ctx, head, S, tick);
}

function mtDrawStraight(ctx, head, S, tick) {
  var fp = mtFootprint(head);
  var vert = (head.mtOrient === 'v');
  var len = fp.len, thk = fp.thk;
  var HL = len / 2, HT = thk / 2;

  var capTop = -HT * 1.0, capBot = HT * 0.62;
  var faceY = HT * 0.30;            // where the top face turns into the edge

  var vanish = head.mtVanishT > 0 ? (1 - head.mtVanishT) : 0;
  var remaining = head.mtContents ? head.mtContents.length : 0;
  var tailCell = stock[head.mtCellIdxs[1]];
  var fireA = head.mtPulseT || 0;
  var fireB = (tailCell && tailCell.mtPulseT) || 0;

  // ── The spit: the whole thing heaves toward the mouth that fired ──
  // A quick lunge outward, then a softer counter-settle.
  var lurch = 0;
  var lside = (vert ? head.mtLurchDR : head.mtLurchDC) || -1;
  if (head.mtLurchT > 0) {
    var lp = 1 - head.mtLurchT;
    lurch = Math.sin(lp * Math.PI * 1.9) * Math.pow(1 - lp, 1.6);
  }
  var lurchShift = lside * thk * 0.17 * lurch;

  ctx.save();

  if (vanish > 0) ctx.globalAlpha = Math.max(0, 1 - vanish * 1.05);

  ctx.translate(fp.cx, fp.cy);
  var vs = 1 + vanish * 0.42;
  ctx.scale(vs, vs);
  if (vert) ctx.rotate(Math.PI / 2);
  ctx.rotate(Math.sin(tick * 0.028 + (head.mtPhase || 0)) * 0.012 + vanish * 0.12);

  // ── Cast shadow, which does NOT follow the lunge ──
  ctx.save();
  ctx.translate(thk * 0.05, thk * 0.10);
  ctx.fillStyle = 'rgba(70,55,40,0.16)';
  mtCapPath(ctx, HL, HT, thk, 0.97);
  ctx.fill();
  ctx.restore();

  // Everything from here lunges and squash-stretches together
  ctx.translate(lurchShift, 0);
  ctx.rotate(-lside * 0.05 * lurch);
  ctx.scale(1 + 0.10 * Math.abs(lurch), 1 - 0.07 * Math.abs(lurch));

  // ── Stem, behind the slab: only the sliver below the cap shows ──
  mtDrawStem(ctx, thk, HT, S);

  // ── Cap slab ──
  mtCapPath(ctx, HL, HT, thk);
  var cg = ctx.createLinearGradient(0, capTop, 0, capBot);
  cg.addColorStop(0, '#FBA58A');
  cg.addColorStop(0.34, MT_CAP.light);
  cg.addColorStop(0.70, MT_CAP.fill);
  cg.addColorStop(0.92, MT_CAP.dark);
  cg.addColorStop(1, MT_CAP_FRONT);
  ctx.fillStyle = cg;
  ctx.fill();

  ctx.save();
  mtCapPath(ctx, HL, HT, thk);
  ctx.clip();

  // The cap's front edge: a darker band below the turn
  var ff = ctx.createLinearGradient(0, faceY, 0, capBot);
  ff.addColorStop(0, 'rgba(120,32,18,0)');
  ff.addColorStop(0.45, 'rgba(120,32,18,0.18)');
  ff.addColorStop(1, 'rgba(96,24,13,0.40)');
  ctx.fillStyle = ff;
  ctx.fillRect(-HL, faceY, len, capBot - faceY);

  // Light catching the turn itself
  ctx.strokeStyle = 'rgba(255,214,180,0.30)';
  ctx.lineWidth = Math.max(1, thk * 0.028);
  ctx.beginPath();
  ctx.moveTo(-HL * 0.94, faceY);
  ctx.lineTo(HL * 0.94, faceY);
  ctx.stroke();

  // Shaded flank, down-right, opposite the light
  var fl = ctx.createLinearGradient(-HL * 0.6, capTop, HL * 0.95, capBot);
  fl.addColorStop(0, 'rgba(108,28,16,0)');
  fl.addColorStop(1, 'rgba(108,28,16,0.13)');
  ctx.fillStyle = fl;
  ctx.fillRect(-HL, capTop, len, capBot - capTop);

  // Sheen on the top face, up-left, as the light comes from
  var sh = ctx.createRadialGradient(-HL * 0.32, capTop + HT * 0.18, thk * 0.02,
    -HL * 0.32, capTop + HT * 0.18, thk * 0.62);
  sh.addColorStop(0, 'rgba(255,255,255,0.26)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-HL, capTop, len, faceY - capTop);

  // Cream spots on the top face, squashed the way a flat-on surface
  // squashes them at this angle
  var spots = [
    [-0.66, -0.54, 0.122], [-0.44, 0.16, 0.100], [-0.30, -0.66, 0.088],
    [0.32, -0.66, 0.094], [0.46, 0.14, 0.104], [0.68, -0.50, 0.118]
  ];
  for (var i = 0; i < spots.length; i++) {
    var sx = spots[i][0] * HL, sy = spots[i][1] * HT, sr = spots[i][2] * thk;
    ctx.fillStyle = 'rgba(110,32,20,0.22)';
    ctx.beginPath();
    ctx.ellipse(sx + sr * 0.1, sy + sr * 0.18, sr, sr * 0.84, 0, 0, Math.PI * 2);
    ctx.fill();
    var sg = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, sr * 0.1, sx, sy, sr);
    sg.addColorStop(0, 'rgba(255,253,246,0.99)');
    sg.addColorStop(1, 'rgba(243,228,200,0.96)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(sx, sy, sr, sr * 0.84, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── The two mouths, at the ends of the slab ──
  mtDrawSlot(ctx, -1, HL, HT, thk, S, fireA, tick);
  mtDrawSlot(ctx, 1, HL, HT, thk, S, fireB, tick);

  // Alive while stock remains
  if (remaining > 0 && vanish === 0) {
    ctx.globalAlpha = 0.05 + Math.sin(tick * 0.045 + (head.mtPhase || 0)) * 0.035;
    ctx.fillStyle = '#FFE7B0';
    ctx.fillRect(-HL, capTop, len, capBot - capTop);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Slab outline
  ctx.strokeStyle = 'rgba(126,36,21,0.55)';
  ctx.lineWidth = 1.6 * S;
  mtCapPath(ctx, HL, HT, thk);
  ctx.stroke();

  // Top-edge highlight
  ctx.strokeStyle = 'rgba(255,232,206,0.24)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(-HL * 0.76, capTop + 1.6 * S);
  ctx.lineTo(HL * 0.76, capTop + 1.6 * S);
  ctx.stroke();

  // Muzzle flash, over everything
  if (fireA > 0) mtDrawMuzzleFlash(ctx, -1, HL, HT, thk, fireA);
  if (fireB > 0) mtDrawMuzzleFlash(ctx, 1, HL, HT, thk, fireB);

  ctx.restore();

  // ── Counter — one badge on the top face, over the seam, always
  // upright. It rides the lunge with the slab.
  if (vanish < 0.35) {
    var bx = fp.cx, by = fp.cy;
    var along = lurchShift, across = -thk * 0.16;
    if (vert) { bx -= across; by += along; } else { bx += along; by += across; }
    mtDrawCounter(ctx, bx, by, thk, S, remaining, Math.max(fireA, fireB),
      vanish > 0 ? Math.max(0, 1 - vanish * 3) : 1);
  }
}

// The stem, glimpsed under the middle of the cap. Drawn before the
// slab, so only the part below the cap's front edge shows.
function mtDrawStem(ctx, thk, HT, S) {
  var w = thk * 0.60, top = -HT * 0.1, bot = HT * 0.94;
  var foot = w * 0.26;

  var g = ctx.createLinearGradient(-w * 0.6, 0, w * 0.6, 0);
  g.addColorStop(0, MT_STEM.light);
  g.addColorStop(0.46, MT_STEM.fill);
  g.addColorStop(1, MT_STEM.dark);
  ctx.fillStyle = g;

  // A column that widens a little toward a rounded foot
  ctx.beginPath();
  ctx.moveTo(-w * 0.40, top);
  ctx.bezierCurveTo(-w * 0.42, HT * 0.45, -w * 0.50, HT * 0.80, -w * 0.50, bot - foot);
  ctx.quadraticCurveTo(-w * 0.50, bot, -w * 0.50 + foot, bot);
  ctx.lineTo(w * 0.50 - foot, bot);
  ctx.quadraticCurveTo(w * 0.50, bot, w * 0.50, bot - foot);
  ctx.bezierCurveTo(w * 0.50, HT * 0.80, w * 0.42, HT * 0.45, w * 0.40, top);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,118,76,0.45)';
  ctx.lineWidth = 1.4 * S;
  ctx.stroke();

  // Shadow the cap casts down onto its own stem
  var sg = ctx.createLinearGradient(0, HT * 0.30, 0, bot);
  sg.addColorStop(0, 'rgba(118,74,36,0.42)');
  sg.addColorStop(1, 'rgba(118,74,36,0)');
  ctx.fillStyle = sg;
  ctx.fill();
}

// One mouth: a wide dark slot at the end of the slab, plus the outward
// chevron just inside it. dirSign -1 = head side, +1 = tail side; drawn
// mirrored so there is literally one shape. The caller has clipped to
// the slab, so the slot can never spill outside the body.
function mtDrawSlot(ctx, dirSign, HL, HT, thk, S, fire, tick) {
  var sx = mtSlotX(HL, thk, fire);
  var top = -HT * 0.74, bot = HT * 0.44;
  var w = thk * 0.17 * (1 + 0.06 * fire);

  ctx.save();
  ctx.scale(dirSign, 1);

  // Shadow the cap gathers around the opening
  var og = ctx.createLinearGradient(sx - w * 2.4, 0, sx, 0);
  og.addColorStop(0, 'rgba(30,14,30,0)');
  og.addColorStop(1, 'rgba(30,14,30,0.34)');
  ctx.fillStyle = og;
  ctx.fillRect(sx - w * 2.4, top - HT * 0.1, w * 2.4, (bot - top) + HT * 0.2);

  // The slot
  rRect(sx - w * 0.5, top, w, bot - top, w * 0.46);
  var mg = ctx.createLinearGradient(0, top, 0, bot);
  mg.addColorStop(0, '#3C2B45');
  mg.addColorStop(0.4, '#1B1222');
  mg.addColorStop(1, '#0A0610');
  ctx.fillStyle = mg;
  ctx.fill();

  // Lit outer edge, so it reads as an opening rather than a painted bar
  ctx.strokeStyle = 'rgba(255,238,208,0.5)';
  ctx.lineWidth = 1.6 * S;
  ctx.beginPath();
  ctx.moveTo(sx + w * 0.5, top + w * 0.5);
  ctx.lineTo(sx + w * 0.5, bot - w * 0.5);
  ctx.stroke();

  // Depth toward the middle of the slot
  var dg = ctx.createRadialGradient(sx, (top + bot) * 0.5, thk * 0.01, sx, (top + bot) * 0.5, (bot - top) * 0.5);
  dg.addColorStop(0, 'rgba(0,0,0,0.5)');
  dg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dg;
  rRect(sx - w * 0.5, top, w, bot - top, w * 0.46);
  ctx.fill();

  // Outward chevron — the Tunnel-family direction cue
  var aS = thk * 0.10 * (1 + fire * 0.32);
  var ax = sx - w * 1.9;
  var pulse = 0.8 + Math.sin(tick * 0.07) * 0.1 + fire * 0.2;
  ctx.shadowColor = 'rgba(50,10,4,0.75)';
  ctx.shadowBlur = 3 * S;
  ctx.fillStyle = 'rgba(255,228,154,' + Math.min(1, pulse) + ')';
  ctx.beginPath();
  ctx.moveTo(ax + aS, -HT * 0.12);
  ctx.lineTo(ax - aS * 0.62, -HT * 0.12 - aS * 0.92);
  ctx.lineTo(ax - aS * 0.62, -HT * 0.12 + aS * 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.restore();
}

function mtDrawMuzzleFlash(ctx, dirSign, HL, HT, thk, fire) {
  var sx = dirSign * mtSlotX(HL, thk, fire);
  var cy = -HT * 0.15;
  var R = thk * 0.58;
  var g = ctx.createRadialGradient(sx, cy, thk * 0.02, sx, cy, R);
  g.addColorStop(0, 'rgba(255,232,166,' + (0.8 * fire) + ')');
  g.addColorStop(1, 'rgba(255,232,166,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, cy, R, 0, Math.PI * 2); ctx.fill();
}

function mtDrawCounter(ctx, bx, by, span, S, remaining, glow, alpha) {
  var R = span * 0.205;
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


// ── L footprint ──
// The L cannot be one sprite rotated: its four rotations each sit
// differently under the light, and the stem has to hang below whatever
// the lowest exposed edge happens to be. So it is laid out directly in
// screen space — the lit top face, the darker front strip along every
// exposed bottom edge, and the stem all stay where the light wants
// them, whichever way the L is turned.
//
// The counter goes in the CORNER cell, which is the one cell with no
// mouth of its own and the one both arms lead back to.

// Appends a rounded rect to the current path without starting a new one,
// so several can be unioned in a single fill or clip.
function mtRRectSub(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function mtHasCell(cells, dr, dc) {
  for (var i = 0; i < cells.length; i++) {
    if (cells[i].dr === dr && cells[i].dc === dc) return true;
  }
  return false;
}

// The body outline: one rounded rect per cell, each stretched into its
// occupied neighbours so the roundings are buried and the L reads as a
// single continuous slab. Every edge with no neighbour behind it stops
// short at the bottom, leaving room for the cap's front face.
var MT_BODY_BOT = 0.82;   // how far down its cell an exposed bottom edge reaches

function mtBodyPath(ctx, b, grow) {
  grow = grow || 0;
  var cell = b.cell, r = cell * 0.18, pad = r;
  ctx.beginPath();
  for (var i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    var down = mtHasCell(b.cells, c.dr + 1, c.dc);
    var x0 = c.x + (mtHasCell(b.cells, c.dr, c.dc - 1) ? -(L.bg + pad) : cell * 0.01);
    var x1 = c.x + cell - (mtHasCell(b.cells, c.dr, c.dc + 1) ? -(L.bg + pad) : cell * 0.01);
    var y0 = c.y + (mtHasCell(b.cells, c.dr - 1, c.dc) ? -(L.bg + pad) : 0);
    var y1 = c.y + (down ? cell + L.bg + pad : cell * MT_BODY_BOT);
    mtRRectSub(ctx, x0 - grow, y0 - grow,
      (x1 - x0) + grow * 2, (y1 - y0) + grow * 2, r + Math.max(0, grow));
  }
}

// The cell the stem hangs under: the lowest cell of the shape and,
// among those, the one closest to the corner.
function mtStemCell(b) {
  var best = null;
  for (var i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    if (mtHasCell(b.cells, c.dr + 1, c.dc)) continue;   // something below it
    if (c.mouth && c.mouth[0] > 0) continue;            // its mouth owns that edge
    if (!best) { best = c; continue; }
    if (c.dr > best.dr) { best = c; continue; }
    if (c.dr === best.dr &&
        Math.abs(c.dr) + Math.abs(c.dc) < Math.abs(best.dr) + Math.abs(best.dc)) best = c;
  }
  return best || b.cells[0];
}

function mtDrawL(ctx, head, S, tick) {
  var b = mtCellRects(head);
  if (!b.cells.length) return;
  var cell = b.cell;

  var vanish = head.mtVanishT > 0 ? (1 - head.mtVanishT) : 0;
  var remaining = head.mtContents ? head.mtContents.length : 0;

  // ── The spit: the whole thing heaves toward the mouth that fired ──
  var lurch = 0;
  var ldr = head.mtLurchDR || 0, ldc = head.mtLurchDC || 0;
  if (head.mtLurchT > 0) {
    var lp = 1 - head.mtLurchT;
    lurch = Math.sin(lp * Math.PI * 1.9) * Math.pow(1 - lp, 1.6);
  }
  var lx = ldc * cell * 0.17 * lurch, ly = ldr * cell * 0.17 * lurch;

  ctx.save();
  if (vanish > 0) ctx.globalAlpha = Math.max(0, 1 - vanish * 1.05);

  // Lifting away reads as rising toward the camera
  ctx.translate(b.cx, b.cy);
  var vs = 1 + vanish * 0.42;
  ctx.scale(vs, vs);
  ctx.rotate(Math.sin(tick * 0.028 + (head.mtPhase || 0)) * 0.010 + vanish * 0.12);
  ctx.translate(-b.cx, -b.cy);

  // ── Cast shadow, which does NOT follow the lunge ──
  ctx.save();
  ctx.translate(cell * 0.05, cell * 0.10);
  ctx.fillStyle = 'rgba(70,55,40,0.16)';
  mtBodyPath(ctx, b, -cell * 0.02);
  ctx.fill();
  ctx.restore();

  // Everything from here lunges with the mouth that fired
  ctx.save();
  ctx.translate(lx, ly);

  // ── Stem, behind the body: only the sliver below the cap shows ──
  var sc = mtStemCell(b);
  ctx.save();
  ctx.translate(sc.cx, sc.y + cell * 0.5);
  mtDrawStem(ctx, cell, cell / 2, S);
  ctx.restore();

  // ── Body ──
  // Outline first, as an outset fill of the same union: stroking the
  // union would also trace its internal edges and break the L into
  // separate slabs.
  mtBodyPath(ctx, b, 1.7 * S);
  ctx.fillStyle = '#7E2415';
  ctx.fill();

  mtBodyPath(ctx, b);
  ctx.fillStyle = MT_CAP.fill;
  ctx.fill();

  ctx.save();
  mtBodyPath(ctx, b);
  ctx.clip();

  var i, c;

  // The lit top face, one gradient per column run
  for (i = 0; i < b.cells.length; i++) {
    c = b.cells[i];
    if (mtHasCell(b.cells, c.dr - 1, c.dc)) continue;   // not the top of its run
    var n = 1;
    while (mtHasCell(b.cells, c.dr + n, c.dc)) n++;
    var runH = n * cell + (n - 1) * L.bg;
    var tg = ctx.createLinearGradient(0, c.y, 0, c.y + runH * 0.7);
    tg.addColorStop(0, '#FBA58A');
    tg.addColorStop(0.30, MT_CAP.light);
    tg.addColorStop(1, 'rgba(222,78,51,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(c.x - L.bg, c.y, cell + L.bg * 2, runH * 0.7);
  }

  // Per-cell shading, so every cell keeps its own lit face whichever
  // way the L is turned
  for (i = 0; i < b.cells.length; i++) {
    c = b.cells[i];
    var faceY = c.y + cell * 0.65;
    var exposed = !mtHasCell(b.cells, c.dr + 1, c.dc);

    // Sheen on the top face, up-left, as the light comes from
    var sh = ctx.createRadialGradient(c.x + cell * 0.28, c.y + cell * 0.22, cell * 0.02,
      c.x + cell * 0.28, c.y + cell * 0.22, cell * 0.62);
    sh.addColorStop(0, 'rgba(255,255,255,0.22)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(c.x - L.bg, c.y, cell + L.bg * 2, cell);

    if (exposed) {
      // The cap's front edge: a darker strip below the turn
      var ff = ctx.createLinearGradient(0, faceY, 0, c.y + cell * MT_BODY_BOT);
      ff.addColorStop(0, 'rgba(120,32,18,0)');
      ff.addColorStop(0.45, 'rgba(120,32,18,0.20)');
      ff.addColorStop(1, 'rgba(96,24,13,0.44)');
      ctx.fillStyle = ff;
      ctx.fillRect(c.x - L.bg, faceY, cell + L.bg * 2, cell * MT_BODY_BOT - cell * 0.65);

      // Light catching the turn itself
      ctx.strokeStyle = 'rgba(255,214,180,0.26)';
      ctx.lineWidth = Math.max(1, cell * 0.028);
      ctx.beginPath();
      ctx.moveTo(c.x + cell * 0.06, faceY);
      ctx.lineTo(c.x + cell * 0.94, faceY);
      ctx.stroke();
    }
  }

  // Shaded flank, down-right, opposite the light
  var fl = ctx.createLinearGradient(b.minX, b.minY, b.maxX, b.maxY);
  fl.addColorStop(0, 'rgba(108,28,16,0)');
  fl.addColorStop(1, 'rgba(108,28,16,0.16)');
  ctx.fillStyle = fl;
  ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);

  // Cream spots on the lit faces. Three per cell, offset per cell so
  // the pattern does not repeat, and kept off the corner cell's middle
  // where the counter sits.
  var pat = [
    [-0.27, -0.24, 0.116], [0.24, -0.28, 0.096], [0.06, 0.10, 0.086],
    [-0.30, 0.08, 0.078], [0.31, 0.06, 0.104]
  ];
  for (i = 0; i < b.cells.length; i++) {
    c = b.cells[i];
    var isCorner = (c.dr === 0 && c.dc === 0);
    for (var k = 0; k < pat.length; k++) {
      var pick = (k + i * 2) % pat.length;
      if (k >= (isCorner ? 2 : 3)) break;
      var sp = pat[pick];
      var sx = c.cx + sp[0] * cell, sy = c.cy + sp[1] * cell, sr = sp[2] * cell;
      if (isCorner && Math.abs(sp[0]) < 0.28 && Math.abs(sp[1] + 0.16) < 0.30) continue;
      ctx.fillStyle = 'rgba(110,32,20,0.22)';
      ctx.beginPath();
      ctx.ellipse(sx + sr * 0.1, sy + sr * 0.18, sr, sr * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
      var sg = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, sr * 0.1, sx, sy, sr);
      sg.addColorStop(0, 'rgba(255,253,246,0.99)');
      sg.addColorStop(1, 'rgba(243,228,200,0.96)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sr, sr * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── The two mouths, one at the tip of each arm ──
  for (i = 0; i < b.cells.length; i++) {
    c = b.cells[i];
    if (!c.mouth) continue;
    var mc = stock[c.idx];
    mtDrawSlotAt(ctx, c, cell, S, (mc && mc.mtPulseT) || 0, tick);
  }

  // Alive while stock remains
  if (remaining > 0 && vanish === 0) {
    ctx.globalAlpha = 0.05 + Math.sin(tick * 0.045 + (head.mtPhase || 0)) * 0.035;
    ctx.fillStyle = '#FFE7B0';
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Muzzle flash, over everything
  for (i = 0; i < b.cells.length; i++) {
    c = b.cells[i];
    if (!c.mouth) continue;
    var fc = stock[c.idx];
    var f = (fc && fc.mtPulseT) || 0;
    if (f <= 0) continue;
    var sx2 = c.cx + c.mouth[1] * (cell * 0.36 + cell * 0.07 * f);
    var sy2 = c.cy + c.mouth[0] * (cell * 0.36 + cell * 0.07 * f) - cell * 0.07;
    var g = ctx.createRadialGradient(sx2, sy2, cell * 0.02, sx2, sy2, cell * 0.58);
    g.addColorStop(0, 'rgba(255,232,166,' + (0.8 * f) + ')');
    g.addColorStop(1, 'rgba(255,232,166,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx2, sy2, cell * 0.58, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();   // lunge
  ctx.restore();   // entity

  // ── Counter — in the CORNER cell, the one cell with no mouth, which
  // both arms lead back to. Always upright; rides the lunge.
  if (vanish < 0.35) {
    var corner = b.cells[0];
    mtDrawCounter(ctx, corner.cx + lx, corner.cy - cell * 0.16 + ly, cell, S,
      remaining, head.mtPulseT || 0,
      vanish > 0 ? Math.max(0, 1 - vanish * 3) : 1);
  }
}

// One mouth on an L: a wide dark slot on the outward face of an arm
// cell, turned to face the way that mouth spawns. The caller has
// clipped to the body, so the slot can never spill outside it.
function mtDrawSlotAt(ctx, c, cell, S, fire, tick) {
  var ang = 0;
  if (c.mouth[0] > 0) ang = Math.PI / 2;          // down
  else if (c.mouth[1] < 0) ang = Math.PI;         // left
  else if (c.mouth[0] < 0) ang = -Math.PI / 2;    // up

  ctx.save();
  // Slots on a left/right mouth ride a little high, the way the cap's
  // front face sits; an up/down mouth stays centred on its cell.
  ctx.translate(c.cx, c.cy + (c.mouth[0] === 0 ? -cell * 0.07 : 0));
  ctx.rotate(ang);

  var sx = cell * 0.36 + cell * 0.07 * fire;
  var half = cell * 0.29 * (1 + 0.06 * fire);
  var w = cell * 0.17 * (1 + 0.06 * fire);

  // Shadow the cap gathers around the opening
  var og = ctx.createLinearGradient(sx - w * 2.4, 0, sx, 0);
  og.addColorStop(0, 'rgba(30,14,30,0)');
  og.addColorStop(1, 'rgba(30,14,30,0.34)');
  ctx.fillStyle = og;
  ctx.fillRect(sx - w * 2.4, -half * 1.1, w * 2.4, half * 2.2);

  // The slot
  rRect(sx - w * 0.5, -half, w, half * 2, w * 0.46);
  var mg = ctx.createLinearGradient(0, -half, 0, half);
  mg.addColorStop(0, '#3C2B45');
  mg.addColorStop(0.4, '#1B1222');
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
  var dg = ctx.createRadialGradient(sx, 0, cell * 0.01, sx, 0, half);
  dg.addColorStop(0, 'rgba(0,0,0,0.5)');
  dg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dg;
  rRect(sx - w * 0.5, -half, w, half * 2, w * 0.46);
  ctx.fill();

  // Outward chevron — the Tunnel-family direction cue
  var aS = cell * 0.10 * (1 + fire * 0.32);
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

// ── Editor validation ──
// Every cell must be on the grid, and every mouth must have a
// populatable cell in front of it. A cell off the grid, a wall, a
// Tunnel or another Multi Cell Tunnel would strand the shared stock,
// so those are hard errors.

function mtValidate(grid, headIdx, orient) {
  var res = { ok: true, errors: [], hints: [], cells: null };
  var cells = mtCellsOf(headIdx, orient, 7, 7);
  if (!cells) {
    res.ok = false;
    res.errors.push('Part of the footprint falls outside the grid');
    return res;
  }
  res.cells = cells;

  // A cell of this entity never blocks its own mouth
  var own = {};
  for (var i = 0; i < cells.length; i++) own[cells[i].idx] = true;

  for (var k = 0; k < cells.length; k++) {
    if (!cells[k].mouth) continue;
    var name = mtDirName(cells[k].mouth[0], cells[k].mouth[1]);
    var t = mtMouthTargetIdx(cells[k].idx, cells[k].mouth, 7, 7);
    if (t < 0) {
      res.ok = false;
      res.errors.push(name + ' mouth points off the grid');
      continue;
    }
    if (own[t]) {
      res.ok = false;
      res.errors.push(name + ' mouth points back into the mushroom');
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

// The head index of the entity a given editor-grid cell belongs to, or
// -1 if the cell is not part of a well-formed Multi Cell Tunnel. An arm
// stores its own offset from the head, so this is a lookup rather than
// a guess; arms written before offsets existed derive theirs from the
// straight shapes.
function mtHeadIdxOfCell(grid, idx) {
  var c = grid[idx];
  if (!c || !c.mtunnel) return -1;
  var orient = c.orient || 'h';
  if (c.role === 'head') return mtIsWellFormed(grid, idx, orient) ? idx : -1;

  var dr = c.dr, dc = c.dc;
  if (dr === undefined || dc === undefined) {
    if (orient === 'v') { dr = 1; dc = 0; } else { dr = 0; dc = 1; }
  }
  var row = Math.floor(idx / 7) - dr, col = (idx % 7) - dc;
  if (row < 0 || row >= 7 || col < 0 || col >= 7) return -1;
  var h = row * 7 + col;
  var hc = grid[h];
  if (!hc || !hc.mtunnel || hc.role !== 'head') return -1;
  return mtIsWellFormed(grid, h, hc.orient || 'h') ? h : -1;
}

// True when every cell the shape needs is present on the grid and
// belongs to this same entity.
function mtIsWellFormed(grid, headIdx, orient) {
  var cells = mtCellsOf(headIdx, orient, 7, 7);
  if (!cells) return false;
  for (var i = 0; i < cells.length; i++) {
    var g = grid[cells[i].idx];
    if (!g || !g.mtunnel) return false;
    if (i === 0) { if (g.role !== 'head') return false; }
    else if (g.role === 'head') return false;
  }
  return true;
}

// Every Multi Cell Tunnel on a grid, as { headIdx, orient, cells, contents }.
function mtCollect(grid) {
  var out = [];
  for (var i = 0; i < grid.length; i++) {
    var c = grid[i];
    if (!c || !c.mtunnel || c.role !== 'head') continue;
    var orient = c.orient || 'h';
    if (!mtIsWellFormed(grid, i, orient)) continue;
    out.push({
      headIdx: i, orient: orient,
      cells: mtCellsOf(i, orient, 7, 7),
      contents: c.contents || []
    });
  }
  return out;
}
