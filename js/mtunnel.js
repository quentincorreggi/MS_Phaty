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
// ONE mushroom per entity, whatever the footprint.
//
// The problem this composition solves: a single mushroom stretched to
// fill two or three cells gives a cap four times wider than it is tall,
// which reads as a sausage, and one cap per cell reads as several
// mushrooms. So the cells are not the mushroom — they are its MOUND.
//
//   • The MOUND is the body: packed earth filling the footprint, in the
//     board's own rounded-rect language, with a BURROW at each mouth
//     end — the hole a box is fired out of.
//   • THE MUSHROOM grows out of the mound, one per entity, at cell
//     scale and so in real mushroom proportions: a domed spotted cap
//     over a single cream stem. It stands where both mouths lead back
//     to — the corner cell of an L, the seam of a straight footprint —
//     and carries the counter on its cap.
//
// Everything is assembled in SCREEN SPACE, so the light always falls
// from the same place and no footprint needs a special case.

var MT_EARTH = { light: '#CDA77C', fill: '#B08251', dark: '#7C5530' };
var MT_RED = { light: '#FF9375', fill: '#F2563A', dark: '#B4301B' };
var MT_CREAM = { light: '#FFF8E8', fill: '#F1DFBD', dark: '#C3A57C' };
var MT_SPOT = { light: '#FFFDF6', dark: '#EADFC6' };
var MT_CAP_R = 6;          // corner radius in board units, same as a box

// ── Mound outline ──
// One rounded rect per cell, each stretched into its occupied
// neighbours so the roundings are buried and the mound reads as one
// continuous body. Filled with nonzero, so the subpaths union.
function mtBodyPath(ctx, b, grow) {
  grow = grow || 0;
  var r = MT_CAP_R * S, pad = r + L.bg;
  ctx.beginPath();
  for (var i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    var x0 = c.x - (mtHasCell(b.cells, c.dr, c.dc - 1) ? pad : 0) - grow;
    var x1 = c.x + b.cell + (mtHasCell(b.cells, c.dr, c.dc + 1) ? pad : 0) + grow;
    var y0 = c.y - (mtHasCell(b.cells, c.dr - 1, c.dc) ? pad : 0) - grow;
    var y1 = c.y + b.cell + (mtHasCell(b.cells, c.dr + 1, c.dc) ? pad : 0) + grow;
    mtRRectSub(ctx, x0, y0, x1 - x0, y1 - y0, r + Math.max(0, grow));
  }
}

// Appends a rounded rect to the current path without starting a new one.
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

// Where the one mushroom stands: the corner cell of an L, the seam of a
// straight footprint. Either way, the one place both mouths lead back to.
function mtStandPoint(b) {
  if (b.cells.length > 2) return { x: b.cells[0].cx, y: b.cells[0].cy };
  var a = b.cells[0], z = b.cells[b.cells.length - 1];
  return { x: (a.cx + z.cx) / 2, y: (a.cy + z.cy) / 2 };
}

// ── Entry point ──

function drawMTunnelOnGrid(ctx, head, S, tick) {
  var b = mtCellRects(head);
  if (!b.cells.length) return;
  var cell = b.cell;

  var vanish = head.mtVanishT > 0 ? (1 - head.mtVanishT) : 0;
  var remaining = head.mtContents ? head.mtContents.length : 0;

  // The spit: the whole thing heaves toward the mouth that fired — a
  // quick lunge outward, then a softer counter-settle.
  var lurch = 0;
  if (head.mtLurchT > 0) {
    var lp = 1 - head.mtLurchT;
    lurch = Math.sin(lp * Math.PI * 1.9) * Math.pow(1 - lp, 1.6);
  }
  var lx = (head.mtLurchDC || 0) * cell * 0.13 * lurch;
  var ly = (head.mtLurchDR || 0) * cell * 0.13 * lurch;

  ctx.save();
  if (vanish > 0) ctx.globalAlpha = Math.max(0, 1 - vanish * 1.05);

  // Lifting away reads as rising toward the camera
  ctx.translate(b.cx, b.cy);
  ctx.scale(1 + vanish * 0.4, 1 + vanish * 0.4);
  ctx.rotate(vanish * 0.1);
  ctx.translate(-b.cx + lx, -b.cy + ly);

  // ── Mound ──
  // Border and drop shadow in one pass, as an OUTSET FILL of the union.
  // A stroke would follow the internal edges between cells too and cut
  // the mound into separate tiles.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = MT_EARTH.dark;
  mtBodyPath(ctx, b, 1.5 * S);
  ctx.fill();
  ctx.restore();

  mtBodyPath(ctx, b);
  var mg = ctx.createLinearGradient(0, b.minY, 0, b.maxY);
  mg.addColorStop(0, MT_EARTH.light);
  mg.addColorStop(0.45, MT_EARTH.fill);
  mg.addColorStop(1, MT_EARTH.dark);
  ctx.fillStyle = mg;
  ctx.fill();

  ctx.save();
  mtBodyPath(ctx, b);
  ctx.clip();

  // Soil speckle, seeded off the footprint so it never crawls
  var seed = (b.minX * 7 + b.minY * 13) | 0;
  ctx.fillStyle = 'rgba(70,44,20,0.13)';
  for (var d = 0; d < 26; d++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var px = b.minX + (seed % 1000) / 1000 * (b.maxX - b.minX);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var py = b.minY + (seed % 1000) / 1000 * (b.maxY - b.minY);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var pr = (0.8 + (seed % 100) / 100 * 1.6) * S;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  }

  // Lit crest along every exposed top edge, the way the boxes catch light
  for (var i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    if (mtHasCell(b.cells, c.dr - 1, c.dc)) continue;
    var cg = ctx.createLinearGradient(0, c.y, 0, c.y + cell * 0.34);
    cg.addColorStop(0, 'rgba(255,236,204,0.30)');
    cg.addColorStop(1, 'rgba(255,236,204,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(c.x - L.bg, c.y, cell + L.bg * 2, cell * 0.34);
  }

  // ── Burrows, one per mouth ──
  for (i = 0; i < b.cells.length; i++) {
    c = b.cells[i];
    if (!c.mouth) continue;
    var mc = stock[c.idx];
    mtDrawBurrow(ctx, c, cell, S, (mc && mc.mtPulseT) || 0, tick);
  }

  ctx.restore();

  // ── The mushroom ──
  var st = mtStandPoint(b);
  mtDrawMushroom(ctx, st.x, st.y, cell, S, tick, head.mtPhase || 0);

  ctx.restore();

  // ── Counter, on the cap, always upright and riding the lunge ──
  if (vanish < 0.4) {
    var sp = mtStandPoint(b);
    mtDrawCounter(ctx, sp.x + lx, sp.y + ly - cell * 0.16, cell, S, remaining,
      head.mtPulseT || 0, vanish > 0 ? Math.max(0, 1 - vanish * 2.6) : 1);
  }
}

// ── The mushroom: a domed spotted cap over one cream stem ──
// Drawn at cell scale, so its proportions are a mushroom's rather than
// the footprint's.
function mtDrawMushroom(ctx, mx, my, cell, S, tick, phase) {
  var W = cell * 1.02, H = cell * 0.58;
  var cy = my - cell * 0.16;               // cap centre, high in the cell
  var sway = Math.sin(tick * 0.03 + phase) * 0.010;

  ctx.save();
  ctx.translate(mx, cy);
  ctx.rotate(sway);

  // Stem first, so the cap overlaps its top
  var sw = cell * 0.30, sTop = -H * 0.10, sBot = H * 0.10 + cell * 0.34;
  var sg = ctx.createLinearGradient(-sw * 0.6, 0, sw * 0.6, 0);
  sg.addColorStop(0, MT_CREAM.light);
  sg.addColorStop(0.5, MT_CREAM.fill);
  sg.addColorStop(1, MT_CREAM.dark);
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(-sw * 0.40, sTop);
  ctx.bezierCurveTo(-sw * 0.42, sBot * 0.5, -sw * 0.58, sBot * 0.82, -sw * 0.54, sBot);
  ctx.quadraticCurveTo(0, sBot + cell * 0.05, sw * 0.54, sBot);
  ctx.bezierCurveTo(sw * 0.58, sBot * 0.82, sw * 0.42, sBot * 0.5, sw * 0.40, sTop);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,88,50,0.45)';
  ctx.lineWidth = 1.3 * S;
  ctx.stroke();

  // Cap — a dome with an overhanging rim, which is the whole silhouette
  function capPath() {
    ctx.beginPath();
    ctx.moveTo(-W / 2, H * 0.20);
    ctx.bezierCurveTo(-W / 2, -H * 0.44, -W * 0.24, -H * 0.58, 0, -H * 0.58);
    ctx.bezierCurveTo(W * 0.24, -H * 0.58, W / 2, -H * 0.44, W / 2, H * 0.20);
    ctx.quadraticCurveTo(0, H * 0.46, -W / 2, H * 0.20);
    ctx.closePath();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(60,30,10,0.34)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2.5 * S;
  capPath();
  var cg = ctx.createLinearGradient(0, -H * 0.58, 0, H * 0.46);
  cg.addColorStop(0, MT_RED.light);
  cg.addColorStop(0.52, MT_RED.fill);
  cg.addColorStop(1, MT_RED.dark);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.restore();

  ctx.save();
  capPath();
  ctx.clip();

  // Underside of the rim, where the cap turns away from the light
  var ug = ctx.createLinearGradient(0, H * 0.04, 0, H * 0.46);
  ug.addColorStop(0, 'rgba(120,34,18,0)');
  ug.addColorStop(1, 'rgba(104,26,12,0.55)');
  ctx.fillStyle = ug;
  ctx.fillRect(-W / 2, H * 0.04, W, H * 0.46);

  // Cream spots
  mtDrawSpot(ctx, -W * 0.28, -H * 0.26, cell * 0.098);
  mtDrawSpot(ctx, W * 0.26, -H * 0.32, cell * 0.082);
  mtDrawSpot(ctx, W * 0.38, -H * 0.02, cell * 0.066);
  mtDrawSpot(ctx, -W * 0.40, H * 0.00, cell * 0.060);

  // Specular, up-left, as the light comes from
  var sp = ctx.createRadialGradient(-W * 0.22, -H * 0.36, cell * 0.01,
    -W * 0.22, -H * 0.36, cell * 0.34);
  sp.addColorStop(0, 'rgba(255,255,255,0.34)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp;
  ctx.fillRect(-W / 2, -H * 0.58, W, H * 0.6);

  ctx.restore();

  ctx.strokeStyle = 'rgba(150,44,24,0.5)';
  ctx.lineWidth = 1.4 * S;
  capPath();
  ctx.stroke();

  ctx.restore();
}

function mtDrawSpot(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(120,38,22,0.20)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.1, y + r * 0.18, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, MT_SPOT.light);
  g.addColorStop(1, MT_SPOT.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ── Burrows ──
// A hole dug into the mound's outward face, turned to fire the way its
// mouth fires: an arch, rounded at the top like a burrow mouth, with
// the Tunnel family's amber arrow inside it.
function mtDrawBurrow(ctx, c, cell, S, fire, tick) {
  var ang = 0;
  if (c.mouth[0] > 0) ang = Math.PI / 2;
  else if (c.mouth[1] < 0) ang = Math.PI;
  else if (c.mouth[0] < 0) ang = -Math.PI / 2;

  ctx.save();
  ctx.translate(c.cx, c.cy);
  ctx.rotate(ang);

  var half = cell * 0.27 * (1 + 0.05 * fire);
  var depth = cell * 0.30 * (1 + 0.10 * fire);
  var x = cell * 0.5 - depth * 0.42 + cell * 0.05 * fire;

  // Light spilling out of the burrow that just fired
  if (fire > 0) {
    var gg = ctx.createRadialGradient(x, 0, cell * 0.02, x, 0, cell * 0.52);
    gg.addColorStop(0, 'rgba(255,214,120,' + (0.75 * fire) + ')');
    gg.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(x, 0, cell * 0.52, 0, Math.PI * 2); ctx.fill();
  }

  // The hole: rounded at the back, open at the outward face
  ctx.beginPath();
  ctx.moveTo(x + depth * 0.6, -half);
  ctx.lineTo(x - depth * 0.4 + half * 0.55, -half);
  ctx.arc(x - depth * 0.4 + half * 0.55, 0, half, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(x + depth * 0.6, half);
  ctx.closePath();
  var hg = ctx.createLinearGradient(x - depth * 0.4, 0, x + depth * 0.6, 0);
  hg.addColorStop(0, '#1C1220');
  hg.addColorStop(1, '#3E2C45');
  ctx.fillStyle = hg;
  ctx.fill();

  // Earth lip catching light around the opening
  ctx.strokeStyle = 'rgba(255,226,186,0.4)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(x - depth * 0.4 + half * 0.55, -half);
  ctx.arc(x - depth * 0.4 + half * 0.55, 0, half, -Math.PI / 2, Math.PI / 2, true);
  ctx.stroke();

  // Amber arrow, the Tunnel family's direction cue
  var aS = cell * 0.10 * (1 + fire * 0.25);
  var ax = x - depth * 0.06;
  var pulse = 0.82 + Math.sin(tick * 0.06) * 0.12 + fire * 0.18;
  ctx.fillStyle = 'rgba(255,210,100,' + Math.min(1, pulse) + ')';
  ctx.beginPath();
  ctx.moveTo(ax + aS * 0.8, 0);
  ctx.lineTo(ax - aS * 0.6, -aS * 0.95);
  ctx.lineTo(ax - aS * 0.6, aS * 0.95);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ── Counter ──
// The board already has a count badge, on the Tunnel. Same one, so the
// two read as family, sitting on the cap of the one mushroom.
function mtDrawCounter(ctx, bx, by, cell, S, remaining, glow, alpha) {
  var R = cell * 0.195;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(bx, by);
  ctx.scale(1 + glow * 0.2, 1 + glow * 0.2);

  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 1.5 * S;
  ctx.fillStyle = remaining > 0 ? 'rgba(255,248,232,0.97)' : 'rgba(190,180,168,0.9)';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(150,52,28,0.7)';
  ctx.lineWidth = 1.6 * S;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = remaining > 0 ? '#A3301B' : 'rgba(120,110,100,0.8)';
  ctx.font = 'bold ' + (R * 1.3) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(remaining, 0, R * 0.06);

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
