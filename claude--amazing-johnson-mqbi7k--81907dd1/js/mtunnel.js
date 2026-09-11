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
// THE MUSHROOM IS THE ENTITY, and its cap is a real dome.
//
// A cap in mushroom proportions is about twice as wide as it is tall,
// so it cannot fit inside a footprint that is already 2:1 — that is
// what made every flat version read as a sausage. The cap therefore
// ARCS ABOVE the footprint, by about a third of a cell, and the top
// corners of the top row are given up to the arc. The mushroom still
// occupies all of its cells; it just leans out of the grid the way a
// cap overhangs its stem.
//
// One rule sets the anatomy for every footprint:
//
//   • the CAP is the TOP ROW, crowned by the dome that arcs above it —
//     bright at the crown, dark where it falls away, with bold cream
//     spots;
//   • everything BELOW the top row is the PIED: cream stem flesh, with
//     the sides shaded so the middle reads as one round stem;
//   • between them the cap's RIM overhangs, showing a band of gills
//     with a dark contact line and a catchlight;
//   • a MOUTH is punched through each arm tip, the hole a box is fired
//     out of, with the Tunnel family's amber arrow inside.
//
// One cap, one stem, whatever the shape. Assembled in SCREEN SPACE, so
// the light always falls from the same place.

var MT_RED = { crown: '#FFBEA6', light: '#FF7E5E', fill: '#EF4A2C', dark: '#A82814' };
var MT_GILL = { light: '#FFF4DE', fill: '#EBD3A6', dark: '#BE9A69' };
var MT_STEM = { light: '#FFFCF4', fill: '#F7EBD3', dark: '#CFB48B' };
var MT_SPOT = { light: '#FFFDF7', dark: '#EFE2C8' };
var MT_CAP_R = 6;           // corner radius in board units, same as a box
var MT_DOME_RISE = 0.30;    // of a cell: how far the dome arcs above the footprint
var MT_DOME_CHORD = 0.26;   // of a cell: how much of the top row the arc takes over
var MT_FOOT = 0.36;         // of a cell: the pied, when the cap has no row below it
var MT_GILL_BAND = 0.15;    // of a cell: the gills showing under the rim

// ── Silhouette ──
// The cell union, minus the top row's top corners, plus the dome that
// arcs over the top row. Filled with nonzero, so the subpaths union and
// the internal edges between cells never show.
function mtBodyPath(ctx, b, grow) {
  grow = grow || 0;
  var cell = b.cell, r = MT_CAP_R * S, pad = r + L.bg;
  var chord = b.minY + cell * MT_DOME_CHORD;
  ctx.beginPath();

  for (var i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    var x0 = c.x - (mtHasCell(b.cells, c.dr, c.dc - 1) ? pad : 0) - grow;
    var x1 = c.x + cell + (mtHasCell(b.cells, c.dr, c.dc + 1) ? pad : 0) + grow;
    // The top row starts at the dome's chord; the dome covers above it
    var y0 = mtHasCell(b.cells, c.dr - 1, c.dc) ? c.y - pad - grow
      : (c.y === b.minY ? chord : c.y - grow);
    var y1 = c.y + cell + (mtHasCell(b.cells, c.dr + 1, c.dc) ? pad : 0) + grow;
    mtRRectSub(ctx, x0, y0, x1 - x0, y1 - y0, r + Math.max(0, grow));
  }

  // The dome, spanning the top row
  var d = mtDome(b);
  var peak = b.minY - cell * MT_DOME_RISE - grow;
  var ctrl = chord + (peak - chord) / 0.75;
  ctx.moveTo(d.x0 - grow, chord + grow);
  ctx.bezierCurveTo(d.x0 - grow, ctrl, d.x1 + grow, ctrl, d.x1 + grow, chord + grow);
  ctx.closePath();
}

// The extent of the top row, which is what the dome spans.
function mtDome(b) {
  var x0 = Infinity, x1 = -Infinity;
  for (var i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    if (c.y !== b.minY) continue;
    if (c.x < x0) x0 = c.x;
    if (c.x + b.cell > x1) x1 = c.x + b.cell;
  }
  return { x0: x0, x1: x1, cx: (x0 + x1) / 2 };
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

// Every contiguous column, with the height its cap reaches: down to the
// top row's foot when the column carries stem below, otherwise stopping
// short of its own foot to leave room for the pied.
function mtColumns(b) {
  var cell = b.cell, rowBot = b.minY + cell;
  // A cap is never much taller than it is wide, so however much room a
  // column has, the cap stops and the pied takes over
  var capMax = b.minY - cell * MT_DOME_RISE + cell * 1.02;
  var seen = {}, out = [];
  for (var i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    if (seen[c.dc]) continue;
    seen[c.dc] = true;
    var top = c, bot = c;
    for (var j = 0; j < b.cells.length; j++) {
      var o = b.cells[j];
      if (o.dc !== c.dc) continue;
      if (o.dr < top.dr) top = o;
      if (o.dr > bot.dr) bot = o;
    }
    var botY = bot.y + cell;
    var inTopRow = (top.y === b.minY);
    out.push({
      dc: c.dc, x: top.x, cx: top.cx, topY: top.y, botY: botY,
      inTopRow: inTopRow,
      // Where the cap ends: the top row's foot if there is stem below,
      // else short of this column's own foot.
      capBot: inTopRow
        ? Math.min(capMax, botY > rowBot ? rowBot : botY - cell * MT_FOOT)
        : top.y   // a column that starts below the top row is all pied
    });
  }
  return out;
}

// Where the counter sits: the corner cell of an L, the seam of a
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
  var cols = mtColumns(b);
  var dome = mtDome(b);
  var peak = b.minY - cell * MT_DOME_RISE;

  var vanish = head.mtVanishT > 0 ? (1 - head.mtVanishT) : 0;
  var remaining = head.mtContents ? head.mtContents.length : 0;

  // The spit: the whole mushroom heaves toward the mouth that fired —
  // a quick lunge outward, then a softer counter-settle.
  var lurch = 0;
  if (head.mtLurchT > 0) {
    var lp = 1 - head.mtLurchT;
    lurch = Math.sin(lp * Math.PI * 1.9) * Math.pow(1 - lp, 1.6);
  }
  var lx = (head.mtLurchDC || 0) * cell * 0.14 * lurch;
  var ly = (head.mtLurchDR || 0) * cell * 0.14 * lurch;

  ctx.save();
  if (vanish > 0) ctx.globalAlpha = Math.max(0, 1 - vanish * 1.05);

  ctx.translate(b.cx, b.cy);
  ctx.scale(1 + vanish * 0.4, 1 + vanish * 0.4);
  ctx.rotate(Math.sin(tick * 0.03 + (head.mtPhase || 0)) * 0.007 + vanish * 0.1);
  ctx.translate(-b.cx + lx, -b.cy + ly);

  // ── Border and drop shadow in one pass, as an OUTSET FILL of the
  // silhouette. A stroke would follow the internal edges between cells
  // too and cut the mushroom into separate tiles.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.24)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = MT_RED.dark;
  mtBodyPath(ctx, b, 1.6 * S);
  ctx.fill();
  ctx.restore();

  ctx.save();
  mtBodyPath(ctx, b);
  ctx.clip();

  var i, k, col;

  // ── Pied first: cream stem flesh under everything ──
  var pg = ctx.createLinearGradient(0, b.minY, 0, b.maxY);
  pg.addColorStop(0, MT_STEM.fill);
  pg.addColorStop(1, MT_STEM.dark);
  ctx.fillStyle = pg;
  ctx.fillRect(b.minX - L.bg, b.minY - L.bg,
    (b.maxX - b.minX) + L.bg * 2, (b.maxY - b.minY) + L.bg * 2);

  // Round the stem off by shading its flanks, so the middle stands out
  // as one column whatever the footprint below the cap looks like
  var stemCx = dome.cx;
  var fl = ctx.createLinearGradient(b.minX, 0, b.maxX, 0);
  fl.addColorStop(0, 'rgba(150,112,64,0.40)');
  fl.addColorStop(Math.max(0.02, (stemCx - cell * 0.30 - b.minX) / (b.maxX - b.minX)), 'rgba(150,112,64,0)');
  fl.addColorStop(Math.min(0.98, (stemCx + cell * 0.30 - b.minX) / (b.maxX - b.minX)), 'rgba(150,112,64,0)');
  fl.addColorStop(1, 'rgba(150,112,64,0.40)');
  ctx.fillStyle = fl;
  ctx.fillRect(b.minX - L.bg, b.minY, (b.maxX - b.minX) + L.bg * 2, b.maxY - b.minY);

  // A highlight down the front of the stem
  var hg = ctx.createLinearGradient(stemCx - cell * 0.22, 0, stemCx + cell * 0.10, 0);
  hg.addColorStop(0, 'rgba(255,255,255,0)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0.34)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(stemCx - cell * 0.22, b.minY, cell * 0.32, b.maxY - b.minY);

  // ── Cap, one dome per column of the top row ──
  for (i = 0; i < cols.length; i++) {
    col = cols[i];
    if (!col.inTopRow) continue;
    var g = ctx.createLinearGradient(0, peak, 0, col.capBot);
    g.addColorStop(0, MT_RED.crown);
    g.addColorStop(0.30, MT_RED.light);
    g.addColorStop(0.68, MT_RED.fill);
    g.addColorStop(1, MT_RED.dark);
    ctx.fillStyle = g;
    ctx.fillRect(col.x - L.bg, peak - cell * 0.2, cell + L.bg * 2,
      (col.capBot - peak) + cell * 0.2);
  }

  // ── The rim: gills under the cap's edge, with contact line + catchlight ──
  for (i = 0; i < cols.length; i++) {
    col = cols[i];
    if (!col.inTopRow) continue;
    var band = Math.min(cell * MT_GILL_BAND, col.botY - col.capBot);
    if (band > 0.5) {
      var ug = ctx.createLinearGradient(0, col.capBot, 0, col.capBot + band);
      ug.addColorStop(0, MT_GILL.dark);
      ug.addColorStop(0.45, MT_GILL.fill);
      ug.addColorStop(1, MT_GILL.light);
      ctx.fillStyle = ug;
      ctx.fillRect(col.x - L.bg, col.capBot, cell + L.bg * 2, band);

      ctx.save();
      ctx.beginPath();
      ctx.rect(col.x, col.capBot, cell, band);
      ctx.clip();
      ctx.strokeStyle = 'rgba(160,116,64,0.32)';
      ctx.lineWidth = Math.max(1, cell * 0.020);
      for (k = -4; k <= 4; k++) {
        ctx.beginPath();
        ctx.moveTo(col.cx + k * cell * 0.030, col.capBot - cell * 0.02);
        ctx.lineTo(col.cx + k * cell * 0.115, col.capBot + band);
        ctx.stroke();
      }
      ctx.restore();
    }
    // The cap's edge
    ctx.fillStyle = 'rgba(118,24,10,0.5)';
    ctx.fillRect(col.x - L.bg, col.capBot - cell * 0.035, cell + L.bg * 2, cell * 0.05);
    ctx.strokeStyle = 'rgba(255,208,180,0.55)';
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    ctx.moveTo(col.x, col.capBot - cell * 0.055);
    ctx.lineTo(col.x + cell, col.capBot - cell * 0.055);
    ctx.stroke();
  }

  // ── Bold cream spots, on the cap only ──
  var pat = [
    [-0.25, 0.16, 0.135], [0.23, 0.08, 0.115], [0.30, 0.44, 0.098],
    [-0.31, 0.46, 0.090], [0.00, 0.04, 0.122], [-0.04, 0.42, 0.104]
  ];
  for (i = 0; i < cols.length; i++) {
    col = cols[i];
    if (!col.inTopRow) continue;
    var capTop = peak, capH = col.capBot - peak;
    for (k = 0; k < 2; k++) {
      var sp = pat[(k + (col.dc + 4) * 3) % pat.length];
      var sx = col.cx + sp[0] * cell;
      var sy = capTop + sp[1] * capH + capH * 0.18;
      var sr = sp[2] * cell;
      if (sy + sr > col.capBot - cell * 0.07) sy = col.capBot - sr - cell * 0.09;
      mtDrawSpot(ctx, sx, sy, sr);
    }
  }

  // Crown sheen over the dome
  var sh = ctx.createLinearGradient(0, peak, 0, peak + cell * 0.5);
  sh.addColorStop(0, 'rgba(255,255,255,0.30)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(dome.x0 - L.bg, peak, (dome.x1 - dome.x0) + L.bg * 2, cell * 0.5);

  // ── Mouths, punched through each arm tip ──
  for (i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    if (!c.mouth) continue;
    var mc = stock[c.idx];
    mtDrawMouth(ctx, c, cell, S, (mc && mc.mtPulseT) || 0, tick);
  }

  ctx.restore();

  // Muzzle flash, over everything
  for (i = 0; i < b.cells.length; i++) {
    c = b.cells[i];
    if (!c.mouth) continue;
    var fc = stock[c.idx];
    var f = (fc && fc.mtPulseT) || 0;
    if (f <= 0) continue;
    var fx = c.cx + c.mouth[1] * cell * 0.42;
    var fy = c.cy + c.mouth[0] * cell * 0.42 - cell * 0.05;
    var fg = ctx.createRadialGradient(fx, fy, cell * 0.02, fx, fy, cell * 0.55);
    fg.addColorStop(0, 'rgba(255,214,120,' + (0.8 * f) + ')');
    fg.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(fx, fy, cell * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();

  // ── Counter, always upright, riding the lunge ──
  if (vanish < 0.4) {
    var st = mtStandPoint(b);
    mtDrawCounter(ctx, st.x + lx, st.y + ly - cell * 0.12, cell, S, remaining,
      head.mtPulseT || 0, vanish > 0 ? Math.max(0, 1 - vanish * 2.6) : 1);
  }
}

function mtDrawSpot(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(140,38,18,0.26)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.1, y + r * 0.18, r, r * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  var g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.34, r * 0.1, x, y, r);
  g.addColorStop(0, MT_SPOT.light);
  g.addColorStop(1, MT_SPOT.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ── Mouths ──
// A hole punched through the arm tip, turned to fire the way its mouth
// fires, with the Tunnel family's amber arrow inside. The caller has
// clipped to the body, so it can never spill outside the mushroom.
function mtDrawMouth(ctx, c, cell, S, fire, tick) {
  var ang = 0;
  if (c.mouth[0] > 0) ang = Math.PI / 2;
  else if (c.mouth[1] < 0) ang = Math.PI;
  else if (c.mouth[0] < 0) ang = -Math.PI / 2;

  ctx.save();
  ctx.translate(c.cx, c.cy - (c.mouth[0] === 0 ? cell * 0.04 : 0));
  ctx.rotate(ang);

  var half = cell * 0.26 * (1 + 0.05 * fire);
  var depth = cell * 0.30 * (1 + 0.10 * fire);
  var x = cell * 0.5 - depth * 0.40 + cell * 0.05 * fire;

  ctx.beginPath();
  ctx.moveTo(x + depth * 0.7, -half);
  ctx.lineTo(x - depth * 0.3 + half * 0.6, -half);
  ctx.arc(x - depth * 0.3 + half * 0.6, 0, half, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(x + depth * 0.7, half);
  ctx.closePath();
  var hg = ctx.createLinearGradient(x - depth * 0.3, 0, x + depth * 0.7, 0);
  hg.addColorStop(0, '#1B1220');
  hg.addColorStop(1, '#402E48');
  ctx.fillStyle = hg;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,228,202,0.5)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(x - depth * 0.3 + half * 0.6, -half);
  ctx.arc(x - depth * 0.3 + half * 0.6, 0, half, -Math.PI / 2, Math.PI / 2, true);
  ctx.stroke();

  var aS = cell * 0.10 * (1 + fire * 0.25);
  var ax = x - depth * 0.02;
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
// two read as family, where both mouths lead back to.
function mtDrawCounter(ctx, bx, by, cell, S, remaining, glow, alpha) {
  var R = cell * 0.19;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(bx, by);
  ctx.scale(1 + glow * 0.2, 1 + glow * 0.2);

  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 1.5 * S;
  ctx.fillStyle = remaining > 0 ? 'rgba(255,250,236,0.97)' : 'rgba(196,186,172,0.9)';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(150,44,22,0.72)';
  ctx.lineWidth = 1.6 * S;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = remaining > 0 ? '#A82814' : 'rgba(120,110,100,0.8)';
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
