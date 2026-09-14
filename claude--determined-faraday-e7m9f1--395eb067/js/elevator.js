// ============================================================
// elevator.js — Modular Elevator mechanic
// ============================================================
// A bar of 2-4 cells (1x2 / 1x3 / 1x4 lying across a row, or
// 2x1 / 3x1 / 4x1 standing in a column) that sits underneath a
// line of boxes. Every tile of the bar carries a surface box the
// player can see and a second box hidden underneath it.
//
// When EVERY surface box on the bar has been emptied, the whole
// bar lifts as one movement: the hidden floor slides up onto the
// same tiles and the elevator is removed from the maze. It fires
// once and cannot be re-triggered.
//
// While the bar is still armed its tiles are NOT passable, even
// where the surface box is already gone — the platform is still
// there with a floor on the way, so it keeps blocking the
// path-to-bottom rule that opens boxes.
// ============================================================

// Footprints offered in the editor. dir 'h' = across a row, 'v' = down a column.
var ELEV_SIZES = [
  { label: '1x2', dir: 'h', len: 2 },
  { label: '1x3', dir: 'h', len: 3 },
  { label: '1x4', dir: 'h', len: 4 },
  { label: '2x1', dir: 'v', len: 2 },
  { label: '3x1', dir: 'v', len: 3 },
  { label: '4x1', dir: 'v', len: 4 }
];

// The lifted floor carries normal and blocker boxes only (GDD rule).
var ELEV_DEEP_TYPES = ['default', 'blocker'];

var ELEV_CHARGE_SPEED = 0.035;  // "something is arriving here" beat (~28 frames)
var ELEV_RISE_SPEED   = 0.055;  // floor slides up (~18 frames)
var ELEV_FADE_SPEED   = 0.06;   // frame retracts off the board (~17 frames)

var ELEV_TRIM   = '#5FD4E8';    // cyan-teal accent — the family's own colour
var ELEV_FRAME1 = '#4B5866';
var ELEV_FRAME2 = '#2B3340';

// ── Geometry ────────────────────────────────────────────────

// Cells covered by a bar anchored at `anchor`, or null if it does
// not fit inside the grid.
function elevFootprint(anchor, dir, len, cols, rows) {
  cols = cols || 7; rows = rows || 7;
  var r = Math.floor(anchor / cols), c = anchor % cols;
  if (dir === 'h' && c + len > cols) return null;
  if (dir === 'v' && r + len > rows) return null;
  var cells = [];
  for (var k = 0; k < len; k++) {
    cells.push(dir === 'h' ? (r * cols + c + k) : ((r + k) * cols + c));
  }
  return cells;
}

function elevSizeIndex(dir, len) {
  for (var i = 0; i < ELEV_SIZES.length; i++) {
    if (ELEV_SIZES[i].dir === dir && ELEV_SIZES[i].len === len) return i;
  }
  return 0;
}

// ── Runtime state ───────────────────────────────────────────

// Is this stock cell sitting on a bar that has not delivered yet?
// Such a cell blocks the path-to-bottom rule.
function isElevBlocking(s) {
  if (!s || !s.elev) return false;
  var st = s.elev.state;
  return st === 'armed' || st === 'charging' || st === 'rising';
}

// Build the elevators array from the per-cell specs collected in
// initGame, and link every footprint cell back to its bar.
function buildElevators(elevSlots) {
  elevators = [];
  var byId = {};
  for (var key in elevSlots) {
    var idx = parseInt(key, 10);
    var spec = elevSlots[key];
    var el = byId[spec.eid];
    if (!el) {
      el = {
        id: spec.eid, dir: spec.dir, len: spec.len,
        state: 'armed', chargeT: 0, riseT: 0, fadeT: 0, shakeT: 0,
        cells: [], idxs: []
      };
      byId[spec.eid] = el;
      elevators.push(el);
    }
    el.cells.push({ idx: idx, part: spec.part });
  }
  for (var e = 0; e < elevators.length; e++) {
    var bar = elevators[e];
    bar.cells.sort(function (a, b) { return a.part - b.part; });
    for (var k = 0; k < bar.cells.length; k++) {
      var ci = bar.cells[k].idx;
      bar.idxs.push(ci);
      if (!stock[ci]) continue;
      stock[ci].isElev = true;
      stock[ci].elev = bar;
      stock[ci].elevPart = k;
    }
  }
}

// Every surface box on the bar emptied?
function elevSurfaceCleared(bar) {
  if (!bar.idxs.length) return false;
  for (var i = 0; i < bar.idxs.length; i++) {
    var s = stock[bar.idxs[i]];
    if (!s) continue;
    if (!s.used) return false;
  }
  return true;
}

// ── Lift sequence ───────────────────────────────────────────

function updateElevators() {
  for (var e = 0; e < elevators.length; e++) {
    var bar = elevators[e];

    if (bar.state === 'armed') {
      if (elevSurfaceCleared(bar)) elevStartCharge(bar);
    } else if (bar.state === 'charging') {
      bar.chargeT = Math.max(0, bar.chargeT - ELEV_CHARGE_SPEED);
      if (bar.chargeT <= 0) elevDeliverFloor(bar);
    } else if (bar.state === 'rising') {
      bar.riseT = Math.max(0, bar.riseT - ELEV_RISE_SPEED);
      for (var i = 0; i < bar.idxs.length; i++) {
        if (stock[bar.idxs[i]]) stock[bar.idxs[i]].riseT = bar.riseT;
      }
      if (bar.riseT <= 0) elevLandFloor(bar);
    } else if (bar.state === 'fading') {
      bar.fadeT = Math.max(0, bar.fadeT - ELEV_FADE_SPEED);
      if (bar.fadeT <= 0) elevFinish(bar);
    }

    if (bar.shakeT > 0) bar.shakeT = Math.max(0, bar.shakeT - 0.025);
  }
}

// The last surface box just went: flash, shake, announce the arrival.
function elevStartCharge(bar) {
  bar.state = 'charging';
  bar.chargeT = 1;
  bar.shakeT = 1;
  sfx.complete();
  var b = elevBarRect(bar);
  if (b) {
    spawnBurst(b.x + b.w / 2, b.y + b.h / 2, ELEV_TRIM, 14);
    spawnBurst(b.x + 4 * S, b.y + b.h / 2, ELEV_TRIM, 6);
    spawnBurst(b.x + b.w - 4 * S, b.y + b.h / 2, ELEV_TRIM, 6);
  }
}

// The floor starts sliding up into the bar's tiles.
function elevDeliverFloor(bar) {
  bar.state = 'rising';
  bar.riseT = 1;
  for (var i = 0; i < bar.idxs.length; i++) {
    var idx = bar.idxs[i];
    var old = stock[idx];
    if (!old) continue;
    var deep = old.elevDeep;
    var cell = deep ? elevMakeBox(idx, deep) : elevMakeEmpty(idx);
    cell.isElev = true;
    cell.elev = bar;
    cell.elevPart = old.elevPart;
    cell.elevDeep = null;
    cell.riseT = 1;
    stock[idx] = cell;
  }
  sfx.pop();
  var b = elevBarRect(bar);
  if (b) {
    // Dust at both ends — the whole bar is one moving machine.
    elevDust(b.x + 2 * S, b.y + b.h, -1);
    elevDust(b.x + b.w - 2 * S, b.y + b.h, 1);
  }
}

// The floor has arrived. Re-run the open/closed rule: new boxes can
// open, and boxes that relied on these tiles as their path close.
function elevLandFloor(bar) {
  bar.state = 'fading';
  bar.fadeT = 1;
  bar.shakeT = 0.6;
  for (var i = 0; i < bar.idxs.length; i++) {
    var s = stock[bar.idxs[i]];
    if (!s) continue;
    s.riseT = 0;
    s.popT = 0.7;
    if (!s.empty) spawnBurst(s.x + L.bw / 2, s.y + L.bh / 2, COLORS[s.ci].fill, 8);
  }
  sfx.pop();
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

// The bar leaves the board — the tiles become ordinary maze tiles.
function elevFinish(bar) {
  bar.state = 'done';
  for (var i = 0; i < bar.idxs.length; i++) {
    var s = stock[bar.idxs[i]];
    if (!s) continue;
    s.isElev = false;
    s.elev = null;
  }
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

function elevDust(x, y, dir) {
  for (var p = 0; p < 8; p++) {
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
    isElev: false, elev: null, elevPart: 0, elevDeep: null, riseT: 0,
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
    isElev: false, elev: null, elevPart: 0, elevDeep: null, riseT: 0,
    x: L.sx + col * (L.bw + L.bg), y: L.sy + row * (L.bh + L.bg),
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
  };
}

// ── Drawing ─────────────────────────────────────────────────

// Outer rectangle of the whole bar, frame included.
function elevBarRect(bar) {
  if (!bar.idxs.length) return null;
  var a = stock[bar.idxs[0]], b = stock[bar.idxs[bar.idxs.length - 1]];
  if (!a || !b) return null;
  var pad = 4.5 * S;  // constant frame thickness at every length
  return {
    x: a.x - pad, y: a.y - pad,
    w: (b.x + L.bw) - a.x + pad * 2,
    h: (b.y + L.bh) - a.y + pad * 2,
    pad: pad
  };
}

function drawElevators() {
  for (var e = 0; e < elevators.length; e++) {
    if (elevators[e].state === 'done') continue;
    drawElevatorBar(elevators[e]);
  }
}

function drawElevatorBar(bar) {
  var b = elevBarRect(bar);
  if (!b) return;
  var horiz = (bar.dir === 'h');
  var alpha = (bar.state === 'fading') ? bar.fadeT : 1;
  if (alpha <= 0) return;

  var ox = 0, oy = 0;
  if (bar.shakeT > 0) {
    var amp = 3 * S * bar.shakeT;
    if (horiz) oy = Math.sin(tick * 0.9) * amp;
    else ox = Math.sin(tick * 0.9) * amp;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ox, oy);
  if (bar.state === 'fading') {
    // Retract: shrink very slightly toward the middle as it leaves.
    var sc = 0.94 + 0.06 * bar.fadeT;
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
  }

  var rad = 9 * S;

  // Frame body
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 2 * S;
  var grad = horiz
    ? ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
    : ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
  grad.addColorStop(0, ELEV_FRAME1);
  grad.addColorStop(1, ELEV_FRAME2);
  ctx.fillStyle = grad;
  rRect(b.x, b.y, b.w, b.h, rad); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Shaft interior — the dark space the floor rises out of
  ctx.fillStyle = 'rgba(12,16,22,0.55)';
  rRect(b.x + b.pad * 0.55, b.y + b.pad * 0.55,
        b.w - b.pad * 1.1, b.h - b.pad * 1.1, rad * 0.7);
  ctx.fill();

  // Deck plates on tiles whose surface box is already gone
  for (var i = 0; i < bar.idxs.length; i++) {
    var s = stock[bar.idxs[i]];
    if (!s) continue;
    var showDeck = (bar.state === 'armed' || bar.state === 'charging') && (s.used || s.empty);
    if (!showDeck) continue;
    drawElevDeck(s.x, s.y, L.bw, L.bh, bar.state === 'charging');
  }

  // Cyan-teal trim — the accent that tells this machine apart
  var pulse = (bar.state === 'armed')
    ? 0.55 + Math.sin(tick * 0.05) * 0.15
    : 0.9;
  ctx.strokeStyle = 'rgba(95,212,232,' + pulse + ')';
  ctx.lineWidth = 2 * S;
  rRect(b.x + 1 * S, b.y + 1 * S, b.w - 2 * S, b.h - 2 * S, rad - 1 * S);
  ctx.stroke();

  // End caps — so a 1x4 reads as one machine, not two 1x2s
  drawElevEndCap(b, horiz, false);
  drawElevEndCap(b, horiz, true);

  // Charge flash: "something is about to arrive here"
  if (bar.state === 'charging' || bar.state === 'rising') {
    var f = (bar.state === 'charging') ? bar.chargeT : bar.riseT;
    ctx.globalAlpha = alpha * (0.15 + Math.abs(Math.sin(tick * 0.25)) * 0.3 * f);
    ctx.fillStyle = ELEV_TRIM;
    rRect(b.x, b.y, b.w, b.h, rad); ctx.fill();
    ctx.globalAlpha = alpha;
  }

  ctx.restore();
}

// A lit deck plate: the platform waiting under a cleared tile.
function drawElevDeck(x, y, w, h, charging) {
  var inset = w * 0.08;
  ctx.save();
  var g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(70,84,98,0.95)');
  g.addColorStop(1, 'rgba(38,46,58,0.95)');
  ctx.fillStyle = g;
  rRect(x + inset, y + inset, w - inset * 2, h - inset * 2, 5 * S);
  ctx.fill();

  // Tread lines
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1 * S;
  for (var t = 1; t < 4; t++) {
    var ty = y + inset + (h - inset * 2) * (t / 4);
    ctx.beginPath();
    ctx.moveTo(x + inset + 3 * S, ty);
    ctx.lineTo(x + w - inset - 3 * S, ty);
    ctx.stroke();
  }

  // Lamp — one per cleared tile, so progress toward the lift is readable
  var lr = Math.min(w, h) * 0.13;
  var glow = charging
    ? 0.75 + Math.abs(Math.sin(tick * 0.3)) * 0.25
    : 0.55 + Math.sin(tick * 0.06) * 0.12;
  ctx.fillStyle = 'rgba(95,212,232,' + (glow * 0.35) + ')';
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, lr * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(140,235,250,' + glow + ')';
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, lr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawElevEndCap(b, horiz, far) {
  var capLen = 5.5 * S;
  var cx, cy, cw, ch;
  if (horiz) {
    cw = capLen; ch = b.h;
    cx = far ? (b.x + b.w - capLen) : b.x;
    cy = b.y;
  } else {
    cw = b.w; ch = capLen;
    cx = b.x;
    cy = far ? (b.y + b.h - capLen) : b.y;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rRect(cx, cy, cw, ch, 4 * S); ctx.fill();
  ctx.strokeStyle = 'rgba(95,212,232,0.45)';
  ctx.lineWidth = 1.2 * S;
  // Three grooves across the cap
  for (var g = 1; g <= 3; g++) {
    ctx.beginPath();
    if (horiz) {
      var gy = cy + ch * (g / 4);
      ctx.moveTo(cx + 1.2 * S, gy); ctx.lineTo(cx + cw - 1.2 * S, gy);
    } else {
      var gx = cx + cw * (g / 4);
      ctx.moveTo(gx, cy + 1.2 * S); ctx.lineTo(gx, cy + ch - 1.2 * S);
    }
    ctx.stroke();
  }
  ctx.restore();
}
