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

// Is grid cell `idx` on a live (non-cleared) platform?
function isPlatformCell(idx) {
  if (!platforms) return false;
  for (var p = 0; p < platforms.length; p++) {
    if (platforms[p].cleared) continue;
    var cs = platforms[p].cells;
    if (cs[0] === idx || cs[1] === idx || cs[2] === idx || cs[3] === idx) return true;
  }
  return false;
}

// How much the boxes are inset so the raised seat shows around them.
var PLATFORM_BOX_INSET = 0.80;

// ── Rendering (drawn under the boxes) ──
function drawPlatforms() {
  if (!platforms || platforms.length === 0) return;
  for (var p = 0; p < platforms.length; p++) {
    if (!platforms[p].cleared) drawOnePlatform(platforms[p]);
  }
}

function drawOnePlatform(plat) {
  var ctr = platformCenter(plat);
  var footHalf = (L.bw + L.bg) / 2 + L.bw / 2;  // half-size of the 2x2 footprint
  var Rb = footHalf * 1.0;                        // gear body radius
  var Rt = footHalf * 1.16;                       // tooth-tip radius
  var seat = (L.bw + L.bg) / 2;                   // seat offset (cell-center distance)

  var scale = 1, alpha = 1;
  if (plat.clearing) { scale = 0.5 + 0.5 * plat.clearT; alpha = plat.clearT; }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ctr.x, ctr.y);
  ctx.scale(scale, scale);

  // Spin: start a quarter-turn ahead and unwind anti-clockwise to rest.
  // Only the cog mechanism spins; the compartment frame stays fixed so the
  // four cells always line up with the boxes.
  var spinEase = plat.spinT * plat.spinT;

  // ── Rotating mechanism: teeth + body + hub (spins with the pick) ──
  ctx.save();
  ctx.rotate((Math.PI / 2) * spinEase);
  ctx.lineJoin = 'round';

  // Gear teeth (drawn first, under the body)
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 7 * S; ctx.shadowOffsetY = 3 * S;
  var teeth = 12;
  var tg = ctx.createLinearGradient(-Rt, -Rt, Rt, Rt);
  tg.addColorStop(0, '#8E949E'); tg.addColorStop(1, '#5E626B');
  ctx.fillStyle = tg;
  for (var i = 0; i < teeth; i++) {
    ctx.save();
    ctx.rotate((Math.PI * 2 / teeth) * i);
    var tw = Rb * 0.22;   // half tooth width at root
    ctx.beginPath();
    ctx.moveTo(Rb * 0.94, -tw);
    ctx.lineTo(Rt, -tw * 0.62);
    ctx.lineTo(Rt, tw * 0.62);
    ctx.lineTo(Rb * 0.94, tw);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Gear body (brushed metal disc)
  var g = ctx.createRadialGradient(-Rb * 0.35, -Rb * 0.35, Rb * 0.15, 0, 0, Rb);
  g.addColorStop(0, '#C2C7CE');
  g.addColorStop(0.6, '#9096A0');
  g.addColorStop(1, '#6A6E77');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, Rb, 0, Math.PI * 2); ctx.fill();

  // Rim rings
  ctx.strokeStyle = 'rgba(60,64,72,0.8)'; ctx.lineWidth = 2.5 * S;
  ctx.beginPath(); ctx.arc(0, 0, Rb, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath(); ctx.arc(0, 0, Rb * 0.9, 0, Math.PI * 2); ctx.stroke();
  ctx.restore(); // end rotating mechanism

  // ── Fixed compartment frame: cross dividers + raised seats ──
  // A recessed cross splits the plate into four distinct cells.
  var ext = Rb * 0.98;              // divider reach
  var gh = L.bw * 0.055;            // groove half-thickness
  ctx.fillStyle = 'rgba(52,55,63,0.6)';
  rRect(-gh, -ext, gh * 2, ext * 2, gh); ctx.fill();  // vertical groove
  rRect(-ext, -gh, ext * 2, gh * 2, gh); ctx.fill();  // horizontal groove
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(-gh, -ext); ctx.lineTo(-gh, ext);
  ctx.moveTo(-ext, -gh); ctx.lineTo(ext, -gh);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(28,30,36,0.45)'; ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(gh, -ext); ctx.lineTo(gh, ext);
  ctx.moveTo(-ext, gh); ctx.lineTo(ext, gh);
  ctx.stroke();

  // A raised, beveled seat under each of the four cells so the boxes
  // read as sitting above the gear rather than flat on it.
  var pad = L.bw * 0.94;
  var seats = [
    { x: -seat, y: -seat }, { x: seat, y: -seat },
    { x: seat, y: seat }, { x: -seat, y: seat }
  ];
  for (var sI = 0; sI < seats.length; sI++) {
    var px = seats[sI].x - pad / 2, py = seats[sI].y - pad / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 4 * S;
    var sg = ctx.createLinearGradient(px, py, px + pad, py + pad);
    sg.addColorStop(0, '#C6CAD1'); sg.addColorStop(1, '#7C808A');
    ctx.fillStyle = sg;
    rRect(px, py, pad, pad, 7 * S); ctx.fill();
    ctx.restore();
    // Bevel edges
    ctx.strokeStyle = 'rgba(40,44,50,0.55)'; ctx.lineWidth = 1.5 * S;
    rRect(px, py, pad, pad, 7 * S); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(px + 7 * S, py + 1 * S); ctx.lineTo(px + pad - 7 * S, py + 1 * S);
    ctx.stroke();
  }

  // ── Center hub with anti-clockwise arrow (spins, drawn on top) ──
  ctx.save();
  ctx.rotate((Math.PI / 2) * spinEase);
  var hubR = Rb * 0.24;
  var hg = ctx.createRadialGradient(-hubR * 0.3, -hubR * 0.3, hubR * 0.1, 0, 0, hubR);
  hg.addColorStop(0, '#9AA0AA'); hg.addColorStop(1, '#565A63');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(0, 0, hubR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(40,44,50,0.7)'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.arc(0, 0, hubR, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = 'rgba(240,244,248,0.75)';
  ctx.lineWidth = 2.2 * S; ctx.lineCap = 'round';
  var ar = hubR * 0.6;
  ctx.beginPath(); ctx.arc(0, 0, ar, -2.1, 1.0, false); ctx.stroke();
  var a0 = -2.1;
  var hx = Math.cos(a0) * ar, hy = Math.sin(a0) * ar;
  var tang = a0 - Math.PI / 2;
  var hs = hubR * 0.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + Math.cos(tang - 0.5) * hs, hy + Math.sin(tang - 0.5) * hs);
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + Math.cos(tang + 0.5) * hs, hy + Math.sin(tang + 0.5) * hs);
  ctx.stroke();
  ctx.restore(); // end hub

  ctx.restore();

  // "Held" flash (safeguard blocked the spin) — unrotated red ring.
  if (plat.heldT > 0) {
    ctx.save();
    ctx.globalAlpha = plat.heldT * 0.75;
    ctx.translate(ctr.x, ctr.y);
    ctx.strokeStyle = 'rgba(232,72,72,0.95)';
    ctx.lineWidth = 4 * S;
    ctx.beginPath(); ctx.arc(0, 0, Rt * 1.02, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
