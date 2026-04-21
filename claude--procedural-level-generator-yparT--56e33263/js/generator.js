// ============================================================
// generator.js — Procedural Level Generator
// ============================================================
//
// Design:
//   1. Silhouette pass — carve an organic shape via edge-erosion
//      from a centered rectangle, enforcing soft left-right
//      symmetry. Produces a boolean "occupied" map for the 7x7.
//   2. Role-based mechanic placement — each mechanic has a rule
//      about where it belongs (hidden = top cap, ice = mirrored
//      pairs, blocker = sparse lower, tunnel = choke crossings,
//      wall = mirrored interior). Rules give "handcrafted" feel
//      while colors remain random.
//   3. Color fill — remaining occupied cells become default
//      boxes with random colors from a 4-color palette.
//
// Public API:
//   generateLevel(opts) -> level def compatible with the editor.
//
//   opts = {
//     difficulty: 1..5               (default 3)
//     mechanics: {                   (all default true)
//       hidden, ice, blocker, tunnel, wall
//     }
//     seed: uint32                   (default Date.now())
//   }
// ============================================================

// ── Seeded PRNG (LCG — small but sufficient) ──
function genMakeRng(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function genPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function genShuffle(rng, arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function genIdx(r, c) { return r * 7 + c; }
function genR(i) { return Math.floor(i / 7); }
function genC(i) { return i % 7; }
function genMirrorIdx(i) { return genR(i) * 7 + (6 - genC(i)); }

// ────────────────────────────────────────────────────────────
// SILHOUETTE
// ────────────────────────────────────────────────────────────
// Two families, selected probabilistically:
//   • symmetric — full-width rectangle with mirrored edge-bites
//   • asymmetric — staircase/L/notched shapes (like Level 33 / 40)
// Both are constrained to feel like a single coherent shape.
//
// Difficulty primarily drives *size* (taller/wider) and mechanic
// density downstream — it does NOT over-erode the silhouette.
// ────────────────────────────────────────────────────────────
function genSilhouette(rng, difficulty) {
  var occupied = new Array(49);
  for (var i = 0; i < 49; i++) occupied[i] = false;

  // Pick a family. Roughly 55% symmetric, 45% asymmetric so variety
  // matches the real game (L33 asym, L14/L17 sym, L40 mixed).
  var asym = rng() < 0.45;

  // Footprint size. Higher difficulty = bigger shape, more cells,
  // more room for mechanics. Width stays odd for clean symmetry.
  var wMin = difficulty <= 2 ? 5 : 5;
  var wMax = difficulty <= 2 ? 5 : 7;
  var hMin = difficulty <= 2 ? 4 : 5;
  var hMax = difficulty <= 2 ? 5 : 6;
  var w = wMin + Math.floor(rng() * (wMax - wMin + 1));
  var h = hMin + Math.floor(rng() * (hMax - hMin + 1));
  if (w % 2 === 0) w = Math.min(7, w + 1); // keep odd for symmetry
  var startC = Math.floor((7 - w) / 2);
  var startR = 7 - h; // bottom-anchored

  // Seed rectangle.
  for (var r = startR; r < 7; r++) {
    for (var c = startC; c < startC + w; c++) {
      occupied[genIdx(r, c)] = true;
    }
  }

  if (asym) {
    genCarveAsymmetric(occupied, rng, startR, startC, w, h);
  } else {
    genCarveSymmetric(occupied, rng, startR, startC, w, h);
  }

  // Ensure a bottom-row anchor (tappable starting point).
  if (!genHasBottomAnchor(occupied)) {
    occupied[genIdx(6, 3)] = true;
  }

  // Remove any single-cell islands.
  genPruneIslands(occupied);

  // Minimum mass: fall back to a safe rectangle if carving overshot.
  var count = 0;
  for (var i = 0; i < 49; i++) if (occupied[i]) count++;
  if (count < 16) {
    for (var i2 = 0; i2 < 49; i2++) occupied[i2] = false;
    for (var r2 = 2; r2 < 7; r2++) for (var c2 = 1; c2 < 6; c2++) {
      occupied[genIdx(r2, c2)] = true;
    }
  }

  return occupied;
}

// Symmetric: bite the left edge 1-3 times, mirror to the right.
// Optionally a single asymmetric accent-bite at the end.
function genCarveSymmetric(occupied, rng, startR, startC, w, h) {
  var bites = 1 + Math.floor(rng() * 3); // 1..3
  for (var b = 0; b < bites; b++) {
    genBiteLeftHalf(occupied, rng);
  }
  genMirrorLeftToRight(occupied);
  if (rng() < 0.30) genBiteAny(occupied, rng);
}

// Asymmetric: pick one of a handful of structural moves — each
// produces a coherent non-symmetric silhouette.
//   • staircase — remove a triangular chunk from one top corner
//   • notch     — remove a small rectangle from one top corner
//   • offset    — shift the top portion to one side
function genCarveAsymmetric(occupied, rng, startR, startC, w, h) {
  var move = Math.floor(rng() * 3);
  var leftSide = rng() < 0.5;
  if (move === 0) genCarveStaircase(occupied, rng, startR, startC, w, h, leftSide);
  else if (move === 1) genCarveNotch(occupied, rng, startR, startC, w, h, leftSide);
  else genCarveOffset(occupied, rng, startR, startC, w, h, leftSide);

  // Optional tiny accent: single edge bite anywhere.
  if (rng() < 0.25) genBiteAny(occupied, rng);
}

function genCarveStaircase(occupied, rng, startR, startC, w, h, leftSide) {
  // Remove a right-triangle chunk from the chosen top corner.
  var depth = 2 + Math.floor(rng() * 2); // 2..3 rows
  depth = Math.min(depth, h - 2);
  var stepW = 2 + Math.floor(rng() * 2); // 2..3 cols per step
  for (var d = 0; d < depth; d++) {
    var rowW = Math.min(w - 1, stepW + (depth - 1 - d));
    for (var k = 0; k < rowW; k++) {
      var c = leftSide ? (startC + k) : (startC + w - 1 - k);
      occupied[genIdx(startR + d, c)] = false;
    }
  }
}

function genCarveNotch(occupied, rng, startR, startC, w, h, leftSide) {
  // Small rectangular corner cut.
  var notchH = 1 + Math.floor(rng() * 2); // 1..2
  var notchW = 2 + Math.floor(rng() * 2); // 2..3
  notchH = Math.min(notchH, h - 2);
  notchW = Math.min(notchW, w - 2);
  for (var r = 0; r < notchH; r++) {
    for (var k = 0; k < notchW; k++) {
      var c = leftSide ? (startC + k) : (startC + w - 1 - k);
      occupied[genIdx(startR + r, c)] = false;
    }
  }
}

function genCarveOffset(occupied, rng, startR, startC, w, h, leftSide) {
  // Shift the top band 1-2 cells inward, leaving a wider base.
  var topH = 1 + Math.floor(rng() * Math.max(1, h - 3));
  var shift = 1 + Math.floor(rng() * 2);
  shift = Math.min(shift, w - 3);
  for (var r = 0; r < topH; r++) {
    for (var k = 0; k < shift; k++) {
      var c = leftSide ? (startC + w - 1 - k) : (startC + k);
      occupied[genIdx(startR + r, c)] = false;
    }
  }
}

function genBiteLeftHalf(occupied, rng) {
  var boundary = [];
  for (var i = 0; i < 49; i++) {
    if (!occupied[i]) continue;
    if (genC(i) > 3) continue; // left half incl. center
    if (genIsBoundary(occupied, i)) boundary.push(i);
  }
  if (!boundary.length) return;
  var seed = genPick(rng, boundary);
  var size = 1 + Math.floor(rng() * 2);
  var removed = [seed];
  occupied[seed] = false;
  for (var k = 1; k < size; k++) {
    var last = removed[removed.length - 1];
    var nb = genNeighbors(last).filter(function (n) {
      return occupied[n] && genC(n) <= 3;
    });
    if (!nb.length) break;
    var pick = genPick(rng, nb);
    occupied[pick] = false;
    removed.push(pick);
  }
}

function genBiteAny(occupied, rng) {
  var boundary = [];
  for (var i = 0; i < 49; i++) {
    if (occupied[i] && genIsBoundary(occupied, i)) boundary.push(i);
  }
  if (!boundary.length) return;
  var seed = genPick(rng, boundary);
  occupied[seed] = false;
}

function genMirrorLeftToRight(occupied) {
  for (var r = 0; r < 7; r++) {
    for (var c = 0; c < 3; c++) {
      var left = genIdx(r, c);
      var right = genIdx(r, 6 - c);
      occupied[right] = occupied[left];
    }
  }
}

function genIsBoundary(occupied, i) {
  var r = genR(i), c = genC(i);
  if (r === 0 || r === 6 || c === 0 || c === 6) return true;
  var n = genNeighbors(i);
  for (var k = 0; k < n.length; k++) if (!occupied[n[k]]) return true;
  return false;
}

function genNeighbors(i) {
  var r = genR(i), c = genC(i);
  var out = [];
  if (r > 0) out.push(genIdx(r - 1, c));
  if (r < 6) out.push(genIdx(r + 1, c));
  if (c > 0) out.push(genIdx(r, c - 1));
  if (c < 6) out.push(genIdx(r, c + 1));
  return out;
}

function genHasBottomAnchor(occupied) {
  for (var c = 0; c < 7; c++) {
    for (var r = 6; r >= 0; r--) {
      if (occupied[genIdx(r, c)]) {
        if (r >= 4) return true;
        break;
      }
    }
  }
  return false;
}

function genPruneIslands(occupied) {
  // Remove any occupied cell that has zero occupied neighbors.
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < 49; i++) {
      if (!occupied[i]) continue;
      var n = genNeighbors(i);
      var hasN = false;
      for (var k = 0; k < n.length; k++) if (occupied[n[k]]) { hasN = true; break; }
      if (!hasN) { occupied[i] = false; changed = true; }
    }
  }
}

// ────────────────────────────────────────────────────────────
// MECHANIC PLACEMENT
// ────────────────────────────────────────────────────────────

// Vertical buckets split the shape by *absolute* row, so "top"
// always reads as the visual top of the grid — not per-column top.
// This matches the screenshots where hidden clusters form a
// horizontal cap across the top.
function genVerticalBuckets(occupied) {
  var top = [], mid = [], bot = [];
  // Find row range of occupied cells.
  var minR = 7, maxR = -1;
  for (var i = 0; i < 49; i++) {
    if (!occupied[i]) continue;
    var rr = genR(i);
    if (rr < minR) minR = rr;
    if (rr > maxR) maxR = rr;
  }
  if (maxR < 0) return { top: top, mid: mid, bot: bot };
  var span = maxR - minR + 1;
  var topCut = minR + Math.max(1, Math.floor(span * 0.45));
  var midCut = minR + Math.max(2, Math.floor(span * 0.75));

  for (var j = 0; j < 49; j++) {
    if (!occupied[j]) continue;
    var r = genR(j);
    if (r < topCut) top.push(j);
    else if (r < midCut) mid.push(j);
    else bot.push(j);
  }
  return { top: top, mid: mid, bot: bot };
}

// ── HIDDEN CAP ──
// Hidden boxes form a contiguous cap at the top of the silhouette.
// Density and extent scale with difficulty.
function genPlaceHidden(types, occupied, rng, difficulty) {
  var buckets = genVerticalBuckets(occupied);
  var candidates = buckets.top.slice();
  if (difficulty >= 3) {
    // At medium+ difficulty, hidden can dip into the mid band.
    var midShare = difficulty >= 4 ? 0.75 : 0.4;
    for (var i = 0; i < buckets.mid.length; i++) {
      if (rng() < midShare) candidates.push(buckets.mid[i]);
    }
  }
  // Hidden density within candidates. Capped below 1 so the player
  // always starts with a visible row they can tap.
  var hiddenFrac = [0.40, 0.55, 0.70, 0.80, 0.90][Math.max(0, Math.min(4, difficulty - 1))];
  var targetCount = Math.max(1, Math.round(candidates.length * hiddenFrac));

  // Grow a contiguous region starting from the top-most candidate, BFS-ish.
  var placed = {};
  var frontier = [];
  // Seed with a top-row occupied cell nearest center.
  var seed = -1;
  var seedRow = 7, seedDist = 99;
  for (var j = 0; j < candidates.length; j++) {
    var ci = candidates[j];
    var r = genR(ci), c = genC(ci);
    var d = Math.abs(c - 3) + r;
    if (r < seedRow || (r === seedRow && d < seedDist)) {
      seedRow = r; seedDist = d; seed = ci;
    }
  }
  if (seed < 0) return;
  frontier.push(seed);
  placed[seed] = true;

  var candSet = {};
  for (var q = 0; q < candidates.length; q++) candSet[candidates[q]] = true;

  while (Object.keys(placed).length < targetCount && frontier.length) {
    // Pop a frontier cell (prefer topmost for a cleaner cap).
    frontier.sort(function (a, b) { return genR(a) - genR(b); });
    var cur = frontier.shift();
    var nbs = genNeighbors(cur);
    genShuffle(rng, nbs);
    for (var k = 0; k < nbs.length; k++) {
      var n = nbs[k];
      if (!candSet[n] || placed[n]) continue;
      placed[n] = true;
      frontier.push(n);
      if (Object.keys(placed).length >= targetCount) break;
    }
  }

  for (var p in placed) types[p] = 'hidden';
}

// ── ICE ──
// 1-3 ice boxes as mirrored pairs (or single center) in the mid band.
function genPlaceIce(types, occupied, rng, difficulty) {
  var buckets = genVerticalBuckets(occupied);
  var pool = buckets.mid.slice();
  // Exclude already-typed cells.
  pool = pool.filter(function (i) { return !types[i]; });
  if (!pool.length) return;

  var pairs = difficulty <= 2 ? 1 : (difficulty <= 3 ? 1 + Math.floor(rng() * 2) : 2);
  var placedCount = 0;
  var tries = 0;
  while (placedCount < pairs && tries++ < 20) {
    var pick = genPick(rng, pool);
    var mirror = genMirrorIdx(pick);
    if (types[pick] || types[mirror]) continue;
    if (!occupied[pick] || !occupied[mirror]) continue;
    types[pick] = 'ice';
    if (pick !== mirror) types[mirror] = 'ice';
    placedCount++;
  }
}

// ── BLOCKER ──
// 0-2 sparse blockers in the lower band, mirrored or central.
function genPlaceBlocker(types, occupied, rng, difficulty) {
  var buckets = genVerticalBuckets(occupied);
  var pool = buckets.bot.concat(buckets.mid).filter(function (i) { return !types[i]; });
  if (!pool.length) return;
  var count = difficulty <= 2 ? (rng() < 0.3 ? 1 : 0) : (difficulty <= 3 ? 1 : (rng() < 0.5 ? 2 : 1));
  var tries = 0, placed = 0;
  while (placed < count && tries++ < 20) {
    var pick = genPick(rng, pool);
    if (types[pick]) continue;
    // Prefer centered blockers (mirror-safe) — if pick is off-center,
    // also set its mirror for symmetry.
    var mirror = genMirrorIdx(pick);
    if (pick === mirror) {
      types[pick] = 'blocker';
      placed++;
    } else if (!types[mirror] && occupied[mirror] && placed + 2 <= count) {
      types[pick] = 'blocker';
      types[mirror] = 'blocker';
      placed += 2;
    } else if (!types[mirror] && occupied[mirror]) {
      // single off-center blocker as accent.
      types[pick] = 'blocker';
      placed++;
    }
  }
}

// ── TUNNEL ──
// 0-2 tunnels. A tunnel occupies an occupied cell and points to an
// adjacent occupied cell (so its contents spawn inside the shape).
// We prefer "choke" positions — cells where the tunnel creates a
// meaningful shortcut across an otherwise-gated region.
function genPlaceTunnel(grid, types, occupied, rng, difficulty, palette) {
  var count = difficulty <= 2 ? 0 : (difficulty <= 3 ? 1 : (rng() < 0.5 ? 2 : 1));
  if (count <= 0) return;

  var dirMap = {
    top: [-1, 0], bottom: [1, 0], left: [0, -1], right: [0, 1]
  };
  var candidates = [];
  for (var i = 0; i < 49; i++) {
    if (!occupied[i] || types[i]) continue;
    var r = genR(i), c = genC(i);
    var dirs = ['top', 'bottom', 'left', 'right'];
    for (var d = 0; d < dirs.length; d++) {
      var off = dirMap[dirs[d]];
      var nr = r + off[0], nc = c + off[1];
      if (nr < 0 || nr > 6 || nc < 0 || nc > 6) continue;
      var ni = genIdx(nr, nc);
      if (!occupied[ni] || types[ni]) continue;
      candidates.push({ i: i, dir: dirs[d] });
    }
  }
  if (!candidates.length) return;

  var placed = 0, tries = 0;
  while (placed < count && tries++ < 30 && candidates.length) {
    var idx = Math.floor(rng() * candidates.length);
    var cand = candidates.splice(idx, 1)[0];
    if (types[cand.i]) continue;
    // Fill contents: 2-4 boxes of random palette colors.
    var n = 2 + Math.floor(rng() * 3);
    var contents = [];
    for (var k = 0; k < n; k++) {
      contents.push({ ci: genPick(rng, palette), type: 'default' });
    }
    grid[cand.i] = { tunnel: true, dir: cand.dir, contents: contents };
    types[cand.i] = '__tunnel__'; // mark so later passes skip it
    placed++;
  }
}

// ── WALL (internal) ──
// 1-3 internal walls, mirrored, only at difficulty >= 3.
function genPlaceInternalWalls(grid, types, occupied, rng, difficulty) {
  if (difficulty < 3) return;
  var buckets = genVerticalBuckets(occupied);
  var pool = buckets.mid.filter(function (i) { return !types[i] && !grid[i]; });
  if (!pool.length) return;
  var maxWalls = difficulty <= 3 ? 1 : 2;
  var placed = 0, tries = 0;
  while (placed < maxWalls && tries++ < 15) {
    var pick = genPick(rng, pool);
    var mirror = genMirrorIdx(pick);
    if (types[pick] || grid[pick]) continue;
    // Simulate removal — don't isolate any occupied cell from the bottom.
    if (!genWallPreservesReveal(occupied, grid, types, pick, mirror)) continue;
    grid[pick] = { wall: true };
    types[pick] = '__wall__';
    if (pick !== mirror && !grid[mirror] && !types[mirror]) {
      if (genWallPreservesReveal(occupied, grid, types, mirror, mirror)) {
        grid[mirror] = { wall: true };
        types[mirror] = '__wall__';
      }
    }
    placed++;
  }
}

// Quick check: after placing walls at the given indices, do all
// occupied box cells still have a path of passable cells (empty outside
// the shape, or non-wall/non-tunnel inside) down past the bottom edge?
function genWallPreservesReveal(occupied, grid, types, wallA, wallB) {
  // Passable for reveal = cell that isn't a wall and isn't a tunnel.
  // Empty cells (not occupied) are passable.
  var blocked = {};
  blocked[wallA] = true; if (wallB !== undefined) blocked[wallB] = true;
  for (var i = 0; i < 49; i++) {
    if (grid[i] && (grid[i].wall || grid[i].tunnel)) blocked[i] = true;
  }
  // For every occupied non-wall cell, BFS down looking for a column that
  // reaches row 6 without hitting a blocked cell. If any cell fails, reject.
  function passable(i) {
    if (i < 0 || i >= 49) return true; // off-grid below = OK
    if (blocked[i]) return false;
    return true;
  }
  for (var j = 0; j < 49; j++) {
    if (!occupied[j]) continue;
    if (blocked[j]) continue;
    // BFS
    var seen = {}; var q = [j]; seen[j] = true; var found = false;
    while (q.length) {
      var cur = q.shift();
      var r = genR(cur);
      if (r === 6) { found = true; break; }
      var nbs = genNeighbors(cur);
      for (var k = 0; k < nbs.length; k++) {
        var n = nbs[k];
        if (seen[n]) continue;
        if (!passable(n)) continue;
        seen[n] = true; q.push(n);
      }
    }
    if (!found) return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────
// COLOR PALETTE + FILL
// ────────────────────────────────────────────────────────────
function genPickPalette(rng, difficulty) {
  var pool = [];
  for (var i = 0; i < NUM_COLORS; i++) pool.push(i);
  genShuffle(rng, pool);
  var k = difficulty <= 2 ? 3 : (difficulty <= 4 ? 4 : 5);
  return pool.slice(0, k);
}

function genFillColors(grid, types, occupied, rng, palette) {
  for (var i = 0; i < 49; i++) {
    if (!occupied[i]) continue;
    if (grid[i]) continue;
    var t = types[i] || 'default';
    if (t === '__tunnel__' || t === '__wall__') continue;
    grid[i] = { ci: genPick(rng, palette), type: t };
  }
}

// ────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────
function generateLevel(opts) {
  opts = opts || {};
  var difficulty = Math.max(1, Math.min(5, opts.difficulty || 3));
  // `wall` defaults off — reference levels use the silhouette boundary
  // as the structural wall rather than internal wall cells.
  var mechanics = opts.mechanics || { hidden: true, ice: true, blocker: true, tunnel: true, wall: false };
  var seed = opts.seed >>> 0;
  if (!seed) seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  var rng = genMakeRng(seed);

  var occupied = genSilhouette(rng, difficulty);

  var grid = new Array(49);
  for (var i = 0; i < 49; i++) grid[i] = null;
  var types = {}; // idx -> box type

  var palette = genPickPalette(rng, difficulty);

  // Order matters: tunnels/walls claim cells first so later passes
  // don't double-book them; hidden/ice/blocker then fill roles.
  if (mechanics.tunnel) genPlaceTunnel(grid, types, occupied, rng, difficulty, palette);
  if (mechanics.wall) genPlaceInternalWalls(grid, types, occupied, rng, difficulty);
  if (mechanics.hidden) genPlaceHidden(types, occupied, rng, difficulty);
  if (mechanics.ice) genPlaceIce(types, occupied, rng, difficulty);
  if (mechanics.blocker) genPlaceBlocker(types, occupied, rng, difficulty);

  genFillColors(grid, types, occupied, rng, palette);

  return {
    name: 'Generated #' + seed.toString(36).toUpperCase().slice(0, 6),
    desc: 'Procedurally generated — diff ' + difficulty,
    mrbPerBox: 9,
    sortCap: 3,
    lockButtons: 0,
    grid: grid,
    _seed: seed,
    _difficulty: difficulty
  };
}
