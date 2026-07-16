// ============================================================
// platform.js — Rotating Platform mechanic
//
// A Rotating Platform is a 2x2 turntable that sits on the grid
// beneath boxes. Every time the player picks up ANY box on the
// board, all platforms rotate 90 degrees anti-clockwise at once,
// carrying their contents (boxes AND empty gaps) one cell around.
//
// The plate is never directly tappable. When the last box riding
// a plate is removed, the plate clears away and its cells become
// normal empty grid space.
//
// A level defines platforms via `level.platforms = [anchorIdx, ...]`
// where anchorIdx is the top-left cell of the 2x2 footprint.
// ============================================================

// ── Build runtime platforms from a level definition ──
function initPlatforms(lvl) {
  platforms = [];
  if (!lvl || !lvl.platforms || !lvl.platforms.length) return;
  for (var p = 0; p < lvl.platforms.length; p++) {
    var cells = platformCells(lvl.platforms[p]);
    if (!cells) continue;
    var plat = {
      cells: cells,      // clockwise order: [TL, TR, BR, BL]
      spinT: 0,          // 1 -> 0 rotation animation timer
      heldT: 0,          // 1 -> 0 "held" (safeguard) flash timer
      clearT: 0,         // clear-away animation timer
      clearing: false,
      cleared: false,
      hadBox: false
    };
    plat.hadBox = platformBoxCount(plat) > 0;
    platforms.push(plat);
  }
}

// ── The 2x2 footprint cells (clockwise) for an anchor index ──
function platformCells(anchor) {
  if (typeof anchor !== 'number' || anchor < 0 || anchor >= stock.length) return null;
  var cols = L.cols, rows = L.rows;
  var r = Math.floor(anchor / cols), c = anchor % cols;
  if (c > cols - 2 || r > rows - 2) return null;  // must fit
  return [anchor, anchor + 1, anchor + cols + 1, anchor + cols]; // TL, TR, BR, BL
}

function platformBoxCount(plat) {
  var n = 0;
  for (var k = 0; k < plat.cells.length; k++) {
    var s = stock[plat.cells[k]];
    if (s && !s.empty && !s.used && !s.isWall && !s.isTunnel) n++;
  }
  return n;
}

function cellCenter(idx) {
  var c = idx % L.cols, r = Math.floor(idx / L.cols);
  return { x: L.sx + c * (L.bw + L.bg) + L.bw / 2, y: L.sy + r * (L.bh + L.bg) + L.bh / 2 };
}

function platformCenter(plat) {
  var a = cellCenter(plat.cells[0]); // TL
  var b = cellCenter(plat.cells[2]); // BR
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ── Called after any successful pick: spin every live platform ──
function rotatePlatformsOnPick() {
  if (!platforms || platforms.length === 0) return;
  var active = [];
  for (var p = 0; p < platforms.length; p++) {
    if (!platforms[p].cleared) active.push(platforms[p]);
  }
  if (active.length === 0) return;

  // Safeguard, one step ahead: if this rotation would leave the player
  // with no pickable box while boxes still remain, hold positions.
  if (platformsWouldStrand(active)) {
    for (var i = 0; i < active.length; i++) active[i].heldT = 1.0;
    if (typeof sfx !== 'undefined' && sfx.locked) sfx.locked();
    return;
  }

  applyPlatformRotation(active);
  if (typeof sfx !== 'undefined' && sfx.rotate) sfx.rotate();
}

// ── Perform the logical anti-clockwise rotation + slide animation ──
function applyPlatformRotation(active) {
  for (var p = 0; p < active.length; p++) {
    var cells = active[p].cells;
    // Capture the four riders up-front so the swap can't alias.
    var objs = [stock[cells[0]], stock[cells[1]], stock[cells[2]], stock[cells[3]]];
    // Anti-clockwise: cell k receives the rider from the next clockwise cell.
    for (var k = 0; k < 4; k++) {
      var dest = cells[k];
      var rider = objs[(k + 1) % 4];
      var prevX = rider.x, prevY = rider.y;
      var newX = L.sx + (dest % L.cols) * (L.bw + L.bg);
      var newY = L.sy + Math.floor(dest / L.cols) * (L.bh + L.bg);
      stock[dest] = rider;
      rider.x = newX;
      rider.y = newY;
      // Slide from where it was to its new cell.
      rider.plateSlideX = prevX - newX;
      rider.plateSlideY = prevY - newY;
      rider.plateSlideT = 1.0;
    }
    active[p].spinT = 1.0;
  }
  // Reachability changed for everything that moved.
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

// ── Pure look-ahead: would rotating strand the player? ──
// Simulates the post-rotation board (without mutating anything) and
// returns true iff at least one un-picked box remains but none of them
// would be reachable/pickable.
function platformsWouldStrand(active) {
  var total = stock.length;
  if (!total || !L.cols) return false;
  var cols = L.cols, rows = L.rows;

  // srcOf[i] = index of the rider that WOULD sit in cell i after rotation.
  var srcOf = new Array(total);
  for (var i = 0; i < total; i++) srcOf[i] = i;
  for (var p = 0; p < active.length; p++) {
    var cs = active[p].cells;
    srcOf[cs[0]] = cs[1];
    srcOf[cs[1]] = cs[2];
    srcOf[cs[2]] = cs[3];
    srcOf[cs[3]] = cs[0];
  }

  // Passability of the rotated view.
  var passable = new Array(total);
  for (var i2 = 0; i2 < total; i2++) {
    var s = stock[srcOf[i2]];
    if (!s || s.isWall || s.isTunnel) passable[i2] = false;
    else passable[i2] = !!(s.empty || s.used);
  }

  // Flood-fill reachability from the bottom edge.
  var reachable = new Array(total);
  for (var j = 0; j < total; j++) reachable[j] = false;
  var queue = [], head = 0;
  var bottomRow = rows - 1;
  for (var bc = 0; bc < cols; bc++) {
    var bIdx = bottomRow * cols + bc;
    if (passable[bIdx]) { reachable[bIdx] = true; queue.push(bIdx); }
  }
  while (head < queue.length) {
    var cur = queue[head++];
    var cr = Math.floor(cur / cols), cc = cur % cols;
    var nb = [];
    if (cr > 0) nb.push((cr - 1) * cols + cc);
    if (cr < rows - 1) nb.push((cr + 1) * cols + cc);
    if (cc > 0) nb.push(cr * cols + (cc - 1));
    if (cc < cols - 1) nb.push(cr * cols + (cc + 1));
    for (var n = 0; n < nb.length; n++) {
      if (!reachable[nb[n]] && passable[nb[n]]) { reachable[nb[n]] = true; queue.push(nb[n]); }
    }
  }

  // Is any un-picked box tappable in the rotated view?
  var anyRemain = false, anyTappable = false;
  for (var k = 0; k < total; k++) {
    var b = stock[srcOf[k]];
    if (!b || b.isWall || b.isTunnel || b.empty || b.used) continue;
    if (b.spawning) continue;  // already picked this turn
    anyRemain = true;
    var br = Math.floor(k / cols), bcol = k % cols;
    var hasPath = false;
    if (br === rows - 1) {
      hasPath = true;
    } else {
      var bn = [];
      if (br > 0) bn.push((br - 1) * cols + bcol);
      if (br < rows - 1) bn.push((br + 1) * cols + bcol);
      if (bcol > 0) bn.push(br * cols + (bcol - 1));
      if (bcol < cols - 1) bn.push(br * cols + (bcol + 1));
      for (var m = 0; m < bn.length; m++) if (reachable[bn[m]]) { hasPath = true; break; }
    }
    if (hasPath && (b.iceHP || 0) <= 0) { anyTappable = true; break; }
  }
  return anyRemain && !anyTappable;
}

// ── Per-frame update: decay timers, clear emptied platforms ──
function updatePlatforms() {
  if (!platforms || platforms.length === 0) return;
  for (var p = 0; p < platforms.length; p++) {
    var plat = platforms[p];
    if (plat.spinT > 0) plat.spinT = Math.max(0, plat.spinT - 0.06);
    if (plat.heldT > 0) plat.heldT = Math.max(0, plat.heldT - 0.04);

    if (!plat.cleared && !plat.clearing) {
      var count = platformBoxCount(plat);
      if (count > 0) plat.hadBox = true;
      if (plat.hadBox && count === 0) {
        plat.clearing = true;
        plat.clearT = 1.0;
        var ctr = platformCenter(plat);
        if (typeof spawnBurst === 'function') spawnBurst(ctr.x, ctr.y, 'rgba(200,215,235,0.9)', 18);
        if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
      }
    }
    if (plat.clearing) {
      plat.clearT = Math.max(0, plat.clearT - 0.04);
      if (plat.clearT <= 0) { plat.clearing = false; plat.cleared = true; }
    }
  }
}

// ── Rendering (drawn under the boxes) ──
function drawPlatforms() {
  if (!platforms || platforms.length === 0) return;
  for (var p = 0; p < platforms.length; p++) {
    if (!platforms[p].cleared) drawOnePlatform(platforms[p]);
  }
}

function drawOnePlatform(plat) {
  var ctr = platformCenter(plat);
  var R = ((L.bw + L.bg) / 2 + L.bw / 2) * 1.06;

  var scale = 1, alpha = 1;
  if (plat.clearing) { scale = 0.55 + 0.45 * plat.clearT; alpha = plat.clearT; }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ctr.x, ctr.y);
  ctx.scale(scale, scale);

  // Spin: start a quarter-turn ahead and unwind anti-clockwise to rest.
  var spinEase = plat.spinT * plat.spinT;
  ctx.rotate((Math.PI / 2) * spinEase);

  // Outer metallic disc
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 3 * S;
  var g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
  g.addColorStop(0, '#CDD2D9');
  g.addColorStop(0.55, '#9AA1AB');
  g.addColorStop(1, '#6B6F78');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Rim highlights
  ctx.strokeStyle = 'rgba(66,70,78,0.7)'; ctx.lineWidth = 2.5 * S;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.88, 0, Math.PI * 2); ctx.stroke();

  // Anti-clockwise arrow motif (two opposite curved arrows)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3 * S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  var ar = R * 0.6;
  for (var s = 0; s < 2; s++) {
    var base = s * Math.PI;
    var a0 = base + 0.4, a1 = base + 1.55;
    ctx.beginPath();
    ctx.arc(0, 0, ar, a0, a1, false);
    ctx.stroke();
    // Arrowhead at the leading (a0) end, pointing anti-clockwise.
    var hx = Math.cos(a0) * ar, hy = Math.sin(a0) * ar;
    var tang = a0 - Math.PI / 2; // anti-clockwise tangent
    var hs = R * 0.16;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(tang - 0.5) * hs, hy + Math.sin(tang - 0.5) * hs);
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(tang + 0.5) * hs, hy + Math.sin(tang + 0.5) * hs);
    ctx.stroke();
  }

  // Center hub
  ctx.fillStyle = 'rgba(88,93,102,0.95)';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(38,42,48,0.6)'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2); ctx.stroke();

  ctx.restore();

  // "Held" flash (safeguard blocked the spin) — unrotated red ring.
  if (plat.heldT > 0) {
    ctx.save();
    ctx.globalAlpha = plat.heldT * 0.75;
    ctx.translate(ctr.x, ctr.y);
    ctx.strokeStyle = 'rgba(232,72,72,0.95)';
    ctx.lineWidth = 4 * S;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.03, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
