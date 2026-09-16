// ============================================================
// elevator.js — Modular Elevator (free-form) + classic 2x2 Elevator
// ============================================================
// A Modular Elevator is any EDGE-CONNECTED set of cells the level
// designer paints: line, L, T, U, Z, cross, comb, blob. No preset
// footprints, no size cap. Each shape carries its own id so two
// shapes that happen to touch stay two shapes.
//
// Every cell of a shape carries a surface box the player sees and a
// deep box hidden underneath. When EVERY surface box on the shape
// has been emptied the WHOLE shape lifts at once — one coordinated
// movement, never cell by cell — the deep floor arrives on the same
// tiles, and the shape is removed from the maze. It fires once.
//
// The classic 2x2 Elevator is the same machine with a fixed 2x2
// footprint and its own colourway. Differentiation is colour only.
// ============================================================

// ── Colourways ──────────────────────────────────────────────
// Same visual language for every elevator; only the livery changes.
// Modular shapes take the cool family, the classic takes amber, and
// touching shapes are given different liveries so they read apart.
var ELEV_COLORWAYS = [
  { name: 'cyan',   trim: '#5FD4E8', f1: '#4B5866', f2: '#2B3340', lamp: '#8CEBFA', glow: 'rgba(95,212,232,' },
  { name: 'violet', trim: '#B98CF5', f1: '#57506B', f2: '#332E44', lamp: '#D5B8FF', glow: 'rgba(185,140,245,' },
  { name: 'lime',   trim: '#9BE45E', f1: '#4F5C44', f2: '#2C3626', lamp: '#C6F59B', glow: 'rgba(155,228,94,' },
  { name: 'rose',   trim: '#FF8FB1', f1: '#6A4E57', f2: '#3E2B33', lamp: '#FFC0D3', glow: 'rgba(255,143,177,' }
];
var ELEV_CLASSIC_COLORWAY =
  { name: 'amber',  trim: '#FFC048', f1: '#6B5A3E', f2: '#3E3424', lamp: '#FFDC96', glow: 'rgba(255,192,72,' };

// The deep floor carries normal and blocker boxes only (GDD rule).
var ELEV_DEEP_TYPES = ['default', 'blocker'];

var ELEV_CHARGE_SPEED = 0.035;  // "something is arriving here" beat (~28 frames)
var ELEV_RISE_SPEED   = 0.042;  // the whole shape slides up (~24 frames)
var ELEV_FADE_SPEED   = 0.06;   // frame retracts off the board (~17 frames)

// ── Grid helpers ────────────────────────────────────────────

function elevNeighbours(idx, cols, rows) {
  cols = cols || 7; rows = rows || 7;
  var r = Math.floor(idx / cols), c = idx % cols;
  var out = [];
  if (r > 0)        out.push(idx - cols);
  if (r < rows - 1) out.push(idx + cols);
  if (c > 0)        out.push(idx - 1);
  if (c < cols - 1) out.push(idx + 1);
  return out;
}

// Edge-connected components of a cell list. Diagonal contact does
// not connect — that is what splits a shape in two.
// Pass cutA/cutB to ignore the link between those two cells, which is
// how the editor's Split tool cuts a shape apart.
function elevComponents(cells, cols, rows, cutA, cutB) {
  var inSet = {};
  for (var i = 0; i < cells.length; i++) inSet[cells[i]] = true;
  var hasCut = (cutA !== undefined && cutB !== undefined);
  var seen = {}, comps = [];
  for (var k = 0; k < cells.length; k++) {
    var start = cells[k];
    if (seen[start]) continue;
    var comp = [start], queue = [start];
    seen[start] = true;
    while (queue.length) {
      var cur = queue.pop();
      var nb = elevNeighbours(cur, cols, rows);
      for (var n = 0; n < nb.length; n++) {
        if (hasCut && ((cur === cutA && nb[n] === cutB) || (cur === cutB && nb[n] === cutA))) continue;
        if (inSet[nb[n]] && !seen[nb[n]]) { seen[nb[n]] = true; comp.push(nb[n]); queue.push(nb[n]); }
      }
    }
    comp.sort(function (a, b) { return a - b; });
    comps.push(comp);
  }
  return comps;
}

function elevTouchesCell(idx, cells, cols, rows) {
  var nb = elevNeighbours(idx, cols, rows);
  for (var i = 0; i < nb.length; i++) {
    for (var k = 0; k < cells.length; k++) if (cells[k] === nb[i]) return true;
  }
  return false;
}

// ── Runtime state ───────────────────────────────────────────

// Is this stock cell on an elevator that has not delivered yet?
function isElevBlocking(s) {
  if (!s || !s.elev) return false;
  var st = s.elev.state;
  return st === 'armed' || st === 'charging' || st === 'rising';
}

function elevShapeByIdx(idx) {
  var s = stock[idx];
  return s ? s.elev : null;
}

// Build the elevators from the per-cell specs collected in initGame.
function buildElevators(elevSlots) {
  elevators = [];
  var byId = {};
  for (var key in elevSlots) {
    var idx = parseInt(key, 10);
    var spec = elevSlots[key];
    var shape = byId[spec.eid];
    if (!shape) {
      shape = {
        id: spec.eid, classic: !!spec.classic, label: 0,
        state: 'armed', chargeT: 0, riseT: 0, fadeT: 0, shakeT: 0,
        idxs: [], cellSet: {}, colorway: ELEV_COLORWAYS[0],
        stats: null
      };
      byId[spec.eid] = shape;
      elevators.push(shape);
    }
    if (spec.classic) shape.classic = true;
    shape.idxs.push(idx);
  }

  elevators.sort(function (a, b) { return a.id - b.id; });
  for (var e = 0; e < elevators.length; e++) {
    var shape = elevators[e];
    shape.label = e + 1;
    shape.idxs.sort(function (a, b) { return a - b; });
    for (var k = 0; k < shape.idxs.length; k++) {
      var ci = shape.idxs[k];
      shape.cellSet[ci] = true;
      if (!stock[ci]) continue;
      stock[ci].isElev = true;
      stock[ci].elev = shape;
    }
  }
  elevAssignColorways();
}

// Touching shapes must not share a livery, or the player cannot tell
// where one machine ends and the next begins.
function elevAssignColorways() {
  for (var e = 0; e < elevators.length; e++) {
    var shape = elevators[e];
    if (shape.classic) { shape.colorway = ELEV_CLASSIC_COLORWAY; continue; }
    var taken = {};
    for (var o = 0; o < e; o++) {
      var other = elevators[o];
      if (other.classic) continue;
      if (elevShapesTouch(shape, other)) taken[other.colorway.name] = true;
    }
    var pick = ELEV_COLORWAYS[e % ELEV_COLORWAYS.length];
    for (var t = 0; t < ELEV_COLORWAYS.length; t++) {
      var cand = ELEV_COLORWAYS[(e + t) % ELEV_COLORWAYS.length];
      if (!taken[cand.name]) { pick = cand; break; }
    }
    shape.colorway = pick;
  }
}

// Touching counts diagonals too — two shapes meeting at a corner
// still need to look different.
function elevShapesTouch(a, b) {
  for (var i = 0; i < a.idxs.length; i++) {
    var r = Math.floor(a.idxs[i] / L.cols), c = a.idxs[i] % L.cols;
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= L.rows || nc < 0 || nc >= L.cols) continue;
      if (b.cellSet[nr * L.cols + nc]) return true;
    }
  }
  return false;
}

// Surface boxes still sitting on this shape.
function elevRemainingBoxes(shape) {
  var n = 0;
  for (var i = 0; i < shape.idxs.length; i++) {
    var s = stock[shape.idxs[i]];
    if (s && !s.used) n++;
  }
  return n;
}

function elevSurfaceCleared(shape) {
  if (!shape.idxs.length) return false;
  return elevRemainingBoxes(shape) === 0;
}

// ── Lift sequence ───────────────────────────────────────────

function updateElevators() {
  for (var e = 0; e < elevators.length; e++) {
    var shape = elevators[e];

    if (shape.state === 'armed') {
      if (elevSurfaceCleared(shape)) elevStartCharge(shape);
    } else if (shape.state === 'charging') {
      shape.chargeT = Math.max(0, shape.chargeT - ELEV_CHARGE_SPEED);
      if (shape.chargeT <= 0) elevDeliverFloor(shape);
    } else if (shape.state === 'rising') {
      // One value drives every cell, so the whole shape moves as one.
      shape.riseT = Math.max(0, shape.riseT - ELEV_RISE_SPEED);
      for (var i = 0; i < shape.idxs.length; i++) {
        if (stock[shape.idxs[i]]) stock[shape.idxs[i]].riseT = shape.riseT;
      }
      if (shape.riseT <= 0) elevLandFloor(shape);
    } else if (shape.state === 'fading') {
      shape.fadeT = Math.max(0, shape.fadeT - ELEV_FADE_SPEED);
      if (shape.fadeT <= 0) elevFinish(shape);
    }

    if (shape.shakeT > 0) shape.shakeT = Math.max(0, shape.shakeT - 0.025);
  }
}

function elevStartCharge(shape) {
  shape.state = 'charging';
  shape.chargeT = 1;
  shape.shakeT = 1;
  // Instrumentation: what did clearing this shape cost the player?
  shape.stats = {
    cells: shape.idxs.length,
    taps: tapCount,
    beltPeak: beltPeak,
    beltJam: beltFullFrames,
    closed: 0, enclosed: 0
  };
  sfx.complete();
  var b = elevBounds(shape);
  if (b) {
    for (var i = 0; i < shape.idxs.length; i++) {
      var s = stock[shape.idxs[i]];
      if (s) spawnBurst(s.x + L.bw / 2, s.y + L.bh / 2, shape.colorway.trim, 5);
    }
  }
}

function elevDeliverFloor(shape) {
  shape.state = 'rising';
  shape.riseT = 1;
  for (var i = 0; i < shape.idxs.length; i++) {
    var idx = shape.idxs[i];
    var old = stock[idx];
    if (!old) continue;
    var deep = old.elevDeep;
    var cell = deep ? elevMakeBox(idx, deep) : elevMakeEmpty(idx);
    cell.isElev = true;
    cell.elev = shape;
    cell.elevDeep = null;
    cell.riseT = 1;
    stock[idx] = cell;
  }
  sfx.pop();
  // Dust along the whole silhouette, so the machine reads as one.
  for (var k = 0; k < shape.idxs.length; k++) {
    var s2 = stock[shape.idxs[k]];
    var below = shape.idxs[k] + L.cols;
    if (!s2) continue;
    if (shape.cellSet[below] && Math.floor(below / L.cols) < L.rows) continue;
    elevDust(s2.x + L.bw * 0.2, s2.y + L.bh, -1);
    elevDust(s2.x + L.bw * 0.8, s2.y + L.bh, 1);
  }
}

// The floor has arrived. Re-run the open/closed rule and measure what
// the arrival cost the board.
function elevLandFloor(shape) {
  shape.state = 'fading';
  shape.fadeT = 1;
  shape.shakeT = 0.6;
  for (var i = 0; i < shape.idxs.length; i++) {
    var s = stock[shape.idxs[i]];
    if (!s) continue;
    s.riseT = 0;
    s.popT = 0.7;
    if (!s.empty) spawnBurst(s.x + L.bw / 2, s.y + L.bh / 2, COLORS[s.ci].fill, 6);
  }
  sfx.pop();

  var before = elevSnapshotReachable();
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
  var after = elevSnapshotReachable();
  var enclosed = computeEnclosedBoxes();

  var closed = 0;
  for (var k = 0; k < before.length; k++) {
    if (before[k] && !after[k]) closed++;
  }
  if (!shape.stats) shape.stats = { cells: shape.idxs.length, taps: tapCount, beltPeak: beltPeak, beltJam: beltFullFrames };
  shape.stats.closed = closed;
  shape.stats.enclosed = enclosed.length;
  shape.stats.fired = true;
  elevLogFiring(shape);
}

function elevSnapshotReachable() {
  var out = [];
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    out.push(!!(s && !s.empty && !s.used && !s.isWall && !s.isTunnel && s.revealed));
  }
  return out;
}

function elevFinish(shape) {
  shape.state = 'done';
  for (var i = 0; i < shape.idxs.length; i++) {
    var s = stock[shape.idxs[i]];
    if (!s) continue;
    s.isElev = false;
    s.elev = null;
  }
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
  if (typeof checkNoReachableBoxes === 'function') checkNoReachableBoxes(shape);
}

function elevDust(x, y, dir) {
  for (var p = 0; p < 5; p++) {
    var sp = 1 + Math.random() * 2.5;
    particles.push({
      x: x, y: y,
      vx: dir * sp * S * (0.4 + Math.random()), vy: -(0.5 + Math.random() * 1.5) * S,
      r: (2 + Math.random() * 3) * S, color: 'rgba(190,205,215,0.8)',
      life: 0.9, decay: 0.03 + Math.random() * 0.02, grav: true
    });
  }
}

// ── Stock cell factories ────────────────────────────────────

function elevMakeBox(idx, spec) {
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  var isIce = (spec.type === 'ice');
  var isBlocker = (spec.type === 'blocker');
  return {
    ci: spec.ci, used: false, remaining: MRB_PER_BOX, spawning: false, spawnIdx: 0,
    revealed: false, empty: false,
    boxType: spec.type || 'default',
    iceHP: isIce ? 2 : 0, iceCrackT: 0, iceShatterT: 0,
    blockerCount: isBlocker ? BLOCKER_PER_BOX : 0,
    isTunnel: false, isWall: false,
    isElev: false, elev: null, elevDeep: null, riseT: 0,
    x: L.sx + col * (L.bw + L.bg), y: L.sy + row * (L.bh + L.bg),
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0,
    idlePhase: Math.random() * Math.PI * 2
  };
}

function elevMakeEmpty(idx) {
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  return {
    ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
    revealed: true, empty: true, boxType: 'default',
    iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
    isTunnel: false, isWall: false,
    isElev: false, elev: null, elevDeep: null, riseT: 0,
    x: L.sx + col * (L.bw + L.bg), y: L.sy + row * (L.bh + L.bg),
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
  };
}

// ── Drawing ─────────────────────────────────────────────────

function elevBounds(shape) {
  if (!shape.idxs.length) return null;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (var i = 0; i < shape.idxs.length; i++) {
    var s = stock[shape.idxs[i]];
    if (!s) continue;
    if (s.x < x0) x0 = s.x;
    if (s.y < y0) y0 = s.y;
    if (s.x + L.bw > x1) x1 = s.x + L.bw;
    if (s.y + L.bh > y1) y1 = s.y + L.bh;
  }
  if (x0 === Infinity) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// A rectangle with independent corner radii, appended to the current
// path rather than starting a new one.
function elevPathRect(x0, y0, x1, y1, rTL, rTR, rBR, rBL) {
  ctx.moveTo(x0 + rTL, y0);
  ctx.lineTo(x1 - rTR, y0);
  if (rTR > 0) ctx.quadraticCurveTo(x1, y0, x1, y0 + rTR);
  ctx.lineTo(x1, y1 - rBR);
  if (rBR > 0) ctx.quadraticCurveTo(x1, y1, x1 - rBR, y1);
  ctx.lineTo(x0 + rBL, y1);
  if (rBL > 0) ctx.quadraticCurveTo(x0, y1, x0, y1 - rBL);
  ctx.lineTo(x0, y0 + rTL);
  if (rTL > 0) ctx.quadraticCurveTo(x0, y0, x0 + rTL, y0);
  ctx.closePath();
}

// The silhouette of a whole shape, however it bends.
//
// Every cell contributes one rectangle. Sides facing a sibling cell
// are stretched to the middle of the grid gap so neighbours meet
// exactly; sides facing out are pushed out by `pad`. A corner is
// rounded only where both of its sides face out, which is what keeps
// corners, T-junctions and crossings reading as one continuous frame
// instead of a row of separate tiles.
function elevBuildPath(shape, pad, radius) {
  var half = L.bg / 2;
  ctx.beginPath();
  for (var i = 0; i < shape.idxs.length; i++) {
    var idx = shape.idxs[i];
    var s = stock[idx];
    if (!s) continue;
    var r = Math.floor(idx / L.cols), c = idx % L.cols;
    var hasL = (c > 0)            && !!shape.cellSet[idx - 1];
    var hasR = (c < L.cols - 1)   && !!shape.cellSet[idx + 1];
    var hasU = (r > 0)            && !!shape.cellSet[idx - L.cols];
    var hasD = (r < L.rows - 1)   && !!shape.cellSet[idx + L.cols];
    var x0 = s.x - (hasL ? half : pad);
    var x1 = s.x + L.bw + (hasR ? half : pad);
    var y0 = s.y - (hasU ? half : pad);
    var y1 = s.y + L.bh + (hasD ? half : pad);
    var maxR = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
    elevPathRect(
      x0, y0, x1, y1,
      (!hasL && !hasU) ? maxR : 0,
      (!hasR && !hasU) ? maxR : 0,
      (!hasR && !hasD) ? maxR : 0,
      (!hasL && !hasD) ? maxR : 0
    );
  }
}

function drawElevators() {
  for (var e = 0; e < elevators.length; e++) {
    if (elevators[e].state === 'done') continue;
    drawElevatorShape(elevators[e]);
  }
  drawElevSeams();
}

// Where two different machines are flush against each other their
// frames meet with nothing between them, and the pair can read as one
// bent object. Cut a groove along every such boundary.
function drawElevSeams() {
  var pad = 5 * S, half = L.bg / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(18,23,30,0.85)';
  ctx.lineWidth = 2.5 * S;
  ctx.lineCap = 'round';
  for (var i = 0; i < stock.length; i++) {
    var a = stock[i];
    if (!a || !a.elev || a.elev.state === 'done') continue;
    var c = i % L.cols, r = Math.floor(i / L.cols);
    // Right neighbour
    if (c < L.cols - 1) {
      var b = stock[i + 1];
      if (b && b.elev && b.elev !== a.elev && b.elev.state !== 'done') {
        var x = a.x + L.bw + half;
        ctx.beginPath();
        ctx.moveTo(x, a.y - pad); ctx.lineTo(x, a.y + L.bh + pad);
        ctx.stroke();
      }
    }
    // Bottom neighbour
    if (r < L.rows - 1) {
      var d = stock[i + L.cols];
      if (d && d.elev && d.elev !== a.elev && d.elev.state !== 'done') {
        var y = a.y + L.bh + half;
        ctx.beginPath();
        ctx.moveTo(a.x - pad, y); ctx.lineTo(a.x + L.bw + pad, y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawElevatorShape(shape) {
  if (!shape.idxs.length) return;
  var b = elevBounds(shape);
  if (!b) return;
  var cw = shape.colorway;
  var alpha = (shape.state === 'fading') ? shape.fadeT : 1;
  if (alpha <= 0) return;

  var padTrim = 5 * S;      // constant thickness whatever the cell count
  var padBody = 2.6 * S;
  var shaftPad = -L.bw * 0.09;

  var ox = 0, oy = 0;
  if (shape.shakeT > 0) {
    var amp = 2.6 * S * shape.shakeT;
    ox = Math.sin(tick * 0.9) * amp;
    oy = Math.cos(tick * 1.1) * amp * 0.6;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ox, oy);
  if (shape.state === 'fading') {
    var sc = 0.94 + 0.06 * shape.fadeT;
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
  }

  // Trim: the outermost band, the livery colour
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 7 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = cw.trim;
  elevBuildPath(shape, padTrim, 7 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Body: the machine housing
  var grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  grad.addColorStop(0, cw.f1);
  grad.addColorStop(1, cw.f2);
  ctx.fillStyle = grad;
  elevBuildPath(shape, padBody, 5 * S);
  ctx.fill();

  // Shaft: the dark space the floor rises out of
  ctx.fillStyle = 'rgba(12,16,22,0.5)';
  elevBuildPath(shape, shaftPad, 4 * S);
  ctx.fill();

  // Deck plates on cells whose surface box is gone
  for (var i = 0; i < shape.idxs.length; i++) {
    var s = stock[shape.idxs[i]];
    if (!s) continue;
    var showDeck = (shape.state === 'armed' || shape.state === 'charging') && (s.used || s.empty);
    if (!showDeck) continue;
    drawElevDeck(s.x, s.y, L.bw, L.bh, shape.state === 'charging', cw);
  }

  // Armed idle pulse along the whole silhouette
  if (shape.state === 'armed') {
    ctx.globalAlpha = alpha * (0.10 + Math.sin(tick * 0.05) * 0.06);
    ctx.fillStyle = cw.trim;
    elevBuildPath(shape, padTrim, 7 * S);
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  // Charge / rise flash — one flash for the whole machine
  if (shape.state === 'charging' || shape.state === 'rising') {
    var f = (shape.state === 'charging') ? shape.chargeT : shape.riseT;
    ctx.globalAlpha = alpha * (0.15 + Math.abs(Math.sin(tick * 0.25)) * 0.3 * f);
    ctx.fillStyle = cw.trim;
    elevBuildPath(shape, padTrim, 7 * S);
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  ctx.restore();

  if (shape.state === 'armed' || shape.state === 'charging') drawElevChip(shape, b);
}

function drawElevDeck(x, y, w, h, charging, cw) {
  var inset = w * 0.08;
  ctx.save();
  var g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(70,84,98,0.95)');
  g.addColorStop(1, 'rgba(38,46,58,0.95)');
  ctx.fillStyle = g;
  rRect(x + inset, y + inset, w - inset * 2, h - inset * 2, 5 * S);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1 * S;
  for (var t = 1; t < 4; t++) {
    var ty = y + inset + (h - inset * 2) * (t / 4);
    ctx.beginPath();
    ctx.moveTo(x + inset + 3 * S, ty);
    ctx.lineTo(x + w - inset - 3 * S, ty);
    ctx.stroke();
  }

  var lr = Math.min(w, h) * 0.13;
  var glow = charging
    ? 0.75 + Math.abs(Math.sin(tick * 0.3)) * 0.25
    : 0.55 + Math.sin(tick * 0.06) * 0.12;
  ctx.fillStyle = cw.glow + (glow * 0.35) + ')';
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, lr * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cw.lamp;
  ctx.globalAlpha = glow;
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, lr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Live readout on the machine itself: cell count and boxes to go.
function drawElevChip(shape, b) {
  if (!showElevChips) return;
  var remain = elevRemainingBoxes(shape);
  var txt = shape.idxs.length + '■ ' + remain + '○';
  ctx.save();
  ctx.font = 'bold ' + (9 * S) + 'px sans-serif';
  var wpx = ctx.measureText(txt).width + 10 * S;
  var hpx = 13 * S;
  var cx = b.x - 4 * S, cy = b.y - 10 * S;
  if (cy < L.sy - 14 * S) cy = b.y + b.h + 2 * S;
  ctx.fillStyle = 'rgba(20,26,34,0.85)';
  rRect(cx, cy, wpx, hpx, 5 * S); ctx.fill();
  ctx.strokeStyle = shape.colorway.trim; ctx.lineWidth = 1 * S;
  rRect(cx, cy, wpx, hpx, 5 * S); ctx.stroke();
  ctx.fillStyle = shape.colorway.lamp;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, cx + wpx / 2, cy + hpx / 2 + 0.5 * S);
  ctx.restore();
}
