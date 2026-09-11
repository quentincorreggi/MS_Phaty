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
// The mushroom seen FROM ABOVE: one soft, square, pillowy cap filling
// the whole footprint, spotted like an Amanita, with a mouth at each
// arm tip that boxes are fired out of. No stem, no gills — from
// straight above the cap hides them.
//
// One sprite, one paint, three footprints:
//
//   • Horizontal — the sprite as authored.
//   • Vertical   — THE SAME SPRITE, rotated a quarter turn. Everything
//     is painted inside a local frame whose +x runs along the
//     footprint axis, so the rotation is the only difference.
//   • L          — the same cap, just stretched around the corner:
//     a marshmallow pulled into an L.
//
// The silhouette is ONE closed rounded polygon, never a union of
// per-cell rects. That matters: with a single path the edge can be
// shaded by stroking it, which is what gives the cap its pillowy
// rolled-off edge, and no internal seam can ever show.

var MT_RED = { crown: '#FF9A7C', light: '#F86A49', fill: '#EA4526', dark: '#A82814' };
var MT_SPOT = { light: '#FFFDF7', dark: '#EDDFC4' };
var MT_ROUND = 0.26;     // of a cell: corner radius, soft but still square
var MT_EDGE = 0.20;      // of a cell: width of the rolled-off edge shading

// ── Silhouette ──
// The outline as a closed polygon in LOCAL coordinates, measured from
// the body centre. A straight footprint is a rectangle; an L is that
// rectangle with the missing cell notched out of one corner.
function mtOutlinePoints(b, frameRot) {
  var cell = b.cell, gap = L.bg;
  var pts;

  if (b.cells.length <= 2) {
    // Straight: a rectangle whose long side runs along local +x
    var half = (2 * cell + gap) / 2;
    pts = [
      [-half, -cell / 2], [half, -cell / 2], [half, cell / 2], [-half, cell / 2]
    ];
    return pts;
  }

  // L: the 2x2 bounding box with one quadrant missing. The notch lands
  // on the gap between cells, so it lines up with the grid.
  var minDr = Infinity, minDc = Infinity;
  for (var i = 0; i < b.cells.length; i++) {
    if (b.cells[i].dr < minDr) minDr = b.cells[i].dr;
    if (b.cells[i].dc < minDc) minDc = b.cells[i].dc;
  }
  var mr = -1, mc = -1;
  for (var r = 0; r < 2; r++) {
    for (var c = 0; c < 2; c++) {
      if (!mtHasCell(b.cells, minDr + r, minDc + c)) { mr = r; mc = c; }
    }
  }
  var W = 2 * cell + gap, H = W;
  var x0 = -W / 2, x1 = W / 2, y0 = -H / 2, y1 = H / 2;
  var xm = x0 + cell + gap / 2, ym = y0 + cell + gap / 2;

  if (mr === 0 && mc === 0) {
    pts = [[xm, y0], [x1, y0], [x1, y1], [x0, y1], [x0, ym], [xm, ym]];
  } else if (mr === 0 && mc === 1) {
    pts = [[x0, y0], [xm, y0], [xm, ym], [x1, ym], [x1, y1], [x0, y1]];
  } else if (mr === 1 && mc === 0) {
    pts = [[x0, y0], [x1, y0], [x1, y1], [xm, y1], [xm, ym], [x0, ym]];
  } else {
    pts = [[x0, y0], [x1, y0], [x1, ym], [xm, ym], [xm, y1], [x0, y1]];
  }
  return pts;
}

// A closed rounded polygon. arcTo clamps the radius on short sides and
// handles the L's concave corner on its own.
function mtRoundPoly(ctx, pts, r, grow) {
  var p = pts;
  if (grow) {
    // Push each vertex out along the diagonal from the centre. Good
    // enough for a 1px border on axis-aligned shapes.
    p = [];
    for (var k = 0; k < pts.length; k++) {
      var prev = pts[(k - 1 + pts.length) % pts.length];
      var next = pts[(k + 1) % pts.length];
      var sx = (pts[k][0] === prev[0]) ? Math.sign(pts[k][0] - next[0]) : Math.sign(pts[k][0] - prev[0]);
      var sy = (pts[k][1] === prev[1]) ? Math.sign(pts[k][1] - next[1]) : Math.sign(pts[k][1] - prev[1]);
      p.push([pts[k][0] + sx * grow, pts[k][1] + sy * grow]);
    }
  }
  var n = p.length;
  var mid0 = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
  ctx.beginPath();
  ctx.moveTo(mid0[0], mid0[1]);
  for (var i = 1; i <= n; i++) {
    var cur = p[i % n];
    var nxt = p[(i + 1) % n];
    ctx.arcTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2, r);
  }
  ctx.closePath();
}

function mtHasCell(cells, dr, dc) {
  for (var i = 0; i < cells.length; i++) {
    if (cells[i].dr === dr && cells[i].dc === dc) return true;
  }
  return false;
}

// Rotate a vector into the local frame.
function mtToLocal(x, y, rot) {
  if (!rot) return [x, y];
  var c = Math.cos(-rot), s = Math.sin(-rot);
  return [x * c - y * s, x * s + y * c];
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

  // The vertical footprint is the horizontal sprite turned a quarter
  // turn; the L is painted upright.
  var frameRot = (head.mtOrient === 'v') ? Math.PI / 2 : 0;
  var pts = mtOutlinePoints(b, frameRot);

  var vanish = head.mtVanishT > 0 ? (1 - head.mtVanishT) : 0;
  var remaining = head.mtContents ? head.mtContents.length : 0;

  // The spit: the whole cap heaves toward the mouth that fired — a
  // quick lunge outward, then a softer counter-settle.
  var lurch = 0;
  if (head.mtLurchT > 0) {
    var lp = 1 - head.mtLurchT;
    lurch = Math.sin(lp * Math.PI * 1.9) * Math.pow(1 - lp, 1.6);
  }
  var lx = (head.mtLurchDC || 0) * cell * 0.14 * lurch;
  var ly = (head.mtLurchDR || 0) * cell * 0.14 * lurch;

  // Mouths, brought into the local frame
  var mouths = [];
  for (var i = 0; i < b.cells.length; i++) {
    var c = b.cells[i];
    if (!c.mouth) continue;
    var p = mtToLocal(c.cx - b.cx, c.cy - b.cy, frameRot);
    var d = mtToLocal(c.mouth[1], c.mouth[0], frameRot);
    var mc = stock[c.idx];
    mouths.push({ x: p[0], y: p[1], dx: d[0], dy: d[1], fire: (mc && mc.mtPulseT) || 0 });
  }

  ctx.save();
  if (vanish > 0) ctx.globalAlpha = Math.max(0, 1 - vanish * 1.05);

  ctx.translate(b.cx + lx, b.cy + ly);
  ctx.scale(1 + vanish * 0.4, 1 + vanish * 0.4);
  ctx.rotate(Math.sin(tick * 0.03 + (head.mtPhase || 0)) * 0.007 + vanish * 0.1);
  ctx.rotate(frameRot);

  var r = cell * MT_ROUND;

  // ── Border and drop shadow, as an outset fill of the outline ──
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.24)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = MT_RED.dark;
  mtRoundPoly(ctx, pts, r + 1.6 * S, 1.6 * S);
  ctx.fill();
  ctx.restore();

  // ── The cap: inflated from the middle, rolling off at every edge ──
  mtRoundPoly(ctx, pts, r);
  var span = Math.max(2 * cell + L.bg, cell) * 0.62;
  var cg = ctx.createRadialGradient(-cell * 0.22, -cell * 0.26, cell * 0.05, 0, 0, span);
  cg.addColorStop(0, MT_RED.crown);
  cg.addColorStop(0.42, MT_RED.light);
  cg.addColorStop(0.80, MT_RED.fill);
  cg.addColorStop(1, MT_RED.dark);
  ctx.fillStyle = cg;
  ctx.fill();

  ctx.save();
  mtRoundPoly(ctx, pts, r);
  ctx.clip();

  // The rolled-off edge. Stroking the outline from inside is what makes
  // the cap read as a soft pillow rather than a flat tile — and it only
  // works because the outline is a single path with no internal edges.
  ctx.strokeStyle = 'rgba(146,34,16,0.38)';
  ctx.lineWidth = cell * MT_EDGE;
  mtRoundPoly(ctx, pts, r);
  ctx.stroke();

  // Soft sheen where the light lands
  var sh = ctx.createRadialGradient(-cell * 0.34, -cell * 0.34, cell * 0.02,
    -cell * 0.34, -cell * 0.34, cell * 0.72);
  sh.addColorStop(0, 'rgba(255,255,255,0.26)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-span * 2, -span * 2, span * 4, span * 4);

  // Cream spots, two per cell, offset per cell so the pattern never
  // repeats side by side
  var pat = [
    [-0.22, -0.20, 0.150], [0.20, 0.18, 0.124], [0.24, -0.24, 0.108],
    [-0.24, 0.22, 0.116], [0.02, -0.06, 0.132], [-0.02, 0.26, 0.100]
  ];
  for (i = 0; i < b.cells.length; i++) {
    c = b.cells[i];
    var lc = mtToLocal(c.cx - b.cx, c.cy - b.cy, frameRot);
    for (var k = 0; k < 2; k++) {
      var sp = pat[(k + i * 3) % pat.length];
      mtDrawSpot(ctx, lc[0] + sp[0] * cell, lc[1] + sp[1] * cell, sp[2] * cell);
    }
  }

  // ── Mouths ──
  for (i = 0; i < mouths.length; i++) mtDrawMouth(ctx, mouths[i], cell, S, tick);

  ctx.restore();

  // Muzzle flash, over everything
  for (i = 0; i < mouths.length; i++) {
    var m = mouths[i];
    if (m.fire <= 0) continue;
    var fx = m.x + m.dx * cell * 0.44, fy = m.y + m.dy * cell * 0.44;
    var fg = ctx.createRadialGradient(fx, fy, cell * 0.02, fx, fy, cell * 0.55);
    fg.addColorStop(0, 'rgba(255,214,120,' + (0.8 * m.fire) + ')');
    fg.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(fx, fy, cell * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();

  // ── Counter, always upright, riding the lunge ──
  if (vanish < 0.4) {
    var st = mtStandPoint(b);
    mtDrawCounter(ctx, st.x + lx, st.y + ly, cell, S, remaining,
      head.mtPulseT || 0, vanish > 0 ? Math.max(0, 1 - vanish * 2.6) : 1);
  }
}

function mtDrawSpot(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(140,38,18,0.24)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.1, y + r * 0.16, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  var g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.34, r * 0.1, x, y, r);
  g.addColorStop(0, MT_SPOT.light);
  g.addColorStop(1, MT_SPOT.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ── Mouths ──
// The hole a box is fired out of, set into the cap's edge at an arm tip
// and turned to face the way that mouth fires. The caller has clipped
// to the cap, so it can never spill outside it.
function mtDrawMouth(ctx, m, cell, S, tick) {
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(Math.atan2(m.dy, m.dx));

  var fire = m.fire;
  var half = cell * 0.27 * (1 + 0.05 * fire);
  var depth = cell * 0.32 * (1 + 0.10 * fire);
  var x = cell * 0.5 - depth * 0.38 + cell * 0.05 * fire;

  // The hole: rounded at the back, open at the outward face
  ctx.beginPath();
  ctx.moveTo(x + depth * 0.7, -half);
  ctx.lineTo(x - depth * 0.3 + half * 0.62, -half);
  ctx.arc(x - depth * 0.3 + half * 0.62, 0, half, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(x + depth * 0.7, half);
  ctx.closePath();
  var hg = ctx.createLinearGradient(x - depth * 0.3, 0, x + depth * 0.7, 0);
  hg.addColorStop(0, '#1B1220');
  hg.addColorStop(1, '#402E48');
  ctx.fillStyle = hg;
  ctx.fill();

  // Cap flesh catching light around the opening
  ctx.strokeStyle = 'rgba(255,226,198,0.5)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(x - depth * 0.3 + half * 0.62, -half);
  ctx.arc(x - depth * 0.3 + half * 0.62, 0, half, -Math.PI / 2, Math.PI / 2, true);
  ctx.stroke();

  // Amber arrow, the Tunnel family's direction cue
  var aS = cell * 0.105 * (1 + fire * 0.25);
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
  var R = cell * 0.20;
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
  ctx.font = 'bold ' + (R * 1.32) + 'px sans-serif';
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
