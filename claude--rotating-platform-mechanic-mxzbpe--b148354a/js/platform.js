// ============================================================
// platform.js — Rotating Platform mechanic
// ============================================================
// A platform is a 2x2 footprint sitting on the maze. The plate
// itself never moves; a spinning propeller ("hélice") at its
// centre turns and pushes the four boxes riding it one cell
// around the ring on every pick.
//
// - Every pick (tap of any box anywhere) spins all live plates
//   90 degrees anti-clockwise, carrying their contents (boxes
//   AND empty gaps) to the next cell.
// - Reachability is evaluated at each box's current cell using
//   the game's normal "clear path to the bottom" rule, so boxes
//   toggle between pickable and unpickable as they rotate.
// - The plate is never directly tappable. When its last box is
//   removed the plate clears away and its cells become normal
//   empty maze space.
// - Safeguard: if spinning would strand the player with no
//   pickable box anywhere, the plates hold their positions for
//   that pick instead of turning (resumes once safe again).
//
// Cell cycle order stored per plate is [TL, BL, BR, TR] — the
// anti-clockwise ring. Content shifts forward one step each pick
// (new cells[(i+1)%4] = old cells[i]).
// ============================================================

var PLATE_SPIN_RATE = 0.055;   // spinT decrement per frame (~18 frames per turn)

function platformSmooth(t) { return t * t * (3 - 2 * t); }

// ── Build the runtime platform list from a level definition ──
function buildPlatforms(lvl) {
  platforms = [];
  if (!lvl || !lvl.platforms || !lvl.platforms.length) return;
  for (var i = 0; i < lvl.platforms.length; i++) {
    var a = lvl.platforms[i];
    var r = a.r, c = a.c;
    if (r < 0 || c < 0 || r + 1 > L.rows - 1 || c + 1 > L.cols - 1) continue;
    var TL = r * L.cols + c;
    var TR = r * L.cols + (c + 1);
    var BR = (r + 1) * L.cols + (c + 1);
    var BL = (r + 1) * L.cols + c;
    platforms.push({
      cells: [TL, BL, BR, TR],   // anti-clockwise ring order
      anchor: TL,
      spinT: 0,                  // 1 = just spun, counts down to 0 (settled)
      baseAngle: 0,              // settled propeller angle (radians)
      displayAngle: 0,           // angle actually drawn this frame
      cleared: false, clearT: 0, done: false,
      holdT: 0                   // >0 flashes when a spin was held (safeguard)
    });
    var ids = [TL, TR, BR, BL];
    for (var k = 0; k < 4; k++) { if (stock[ids[k]]) stock[ids[k]].onPlate = true; }
  }
}

function platformCellCenterX(idx) { return L.sx + (idx % L.cols) * (L.bw + L.bg) + L.bw / 2; }
function platformCellCenterY(idx) { return L.sy + Math.floor(idx / L.cols) * (L.bh + L.bg) + L.bh / 2; }

// Count of boxes still physically present on a plate (not empty, not used-up).
function platformActiveOnPlate(plate) {
  var n = 0;
  for (var k = 0; k < 4; k++) {
    var b = stock[plate.cells[k]];
    if (b && !b.empty && !b.used) n++;
  }
  return n;
}

// ── Reachability helper used by the deadlock safeguard ──
// Works on an arbitrary stock ordering (arr) so we can test a
// hypothetical post-rotation board without touching the real one.
// Spawning boxes are treated as passable (they are being emptied)
// and are not counted as an available pick.
function platformCountAvailable(arr) {
  var total = arr.length;
  var passable = new Array(total);
  for (var i = 0; i < total; i++) {
    var s = arr[i];
    if (!s) { passable[i] = false; continue; }
    if (s.isWall || s.isTunnel) { passable[i] = false; continue; }
    passable[i] = !!(s.empty || s.used || s.spawning);
  }
  var reachable = new Array(total);
  for (var j = 0; j < total; j++) reachable[j] = false;
  var queue = [];
  var bottomRow = L.rows - 1;
  for (var bc = 0; bc < L.cols; bc++) {
    var bIdx = bottomRow * L.cols + bc;
    if (passable[bIdx]) { reachable[bIdx] = true; queue.push(bIdx); }
  }
  var head = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    var cr = Math.floor(cur / L.cols), cc = cur % L.cols;
    var nbrs = [];
    if (cr > 0) nbrs.push((cr - 1) * L.cols + cc);
    if (cr < L.rows - 1) nbrs.push((cr + 1) * L.cols + cc);
    if (cc > 0) nbrs.push(cr * L.cols + (cc - 1));
    if (cc < L.cols - 1) nbrs.push(cr * L.cols + (cc + 1));
    for (var n = 0; n < nbrs.length; n++) {
      var ni = nbrs[n];
      if (!reachable[ni] && passable[ni]) { reachable[ni] = true; queue.push(ni); }
    }
  }
  var avail = 0, activeRemaining = 0;
  for (var k = 0; k < total; k++) {
    var b = arr[k];
    if (!b) continue;
    if (b.isWall || b.isTunnel || b.empty || b.used || b.spawning) continue;
    activeRemaining++;
    if (b.iceHP > 0) continue;                    // ice needs an adjacent pick to break
    var br = Math.floor(k / L.cols), bcol = k % L.cols;
    var hasPath = false;
    if (br === L.rows - 1) {
      hasPath = true;
    } else {
      var bnbrs = [];
      if (br > 0) bnbrs.push((br - 1) * L.cols + bcol);
      if (br < L.rows - 1) bnbrs.push((br + 1) * L.cols + bcol);
      if (bcol > 0) bnbrs.push(br * L.cols + (bcol - 1));
      if (bcol < L.cols - 1) bnbrs.push(br * L.cols + (bcol + 1));
      for (var m = 0; m < bnbrs.length; m++) { if (reachable[bnbrs[m]]) { hasPath = true; break; } }
    }
    if (hasPath) avail++;
  }
  return { available: avail, activeRemaining: activeRemaining };
}

// ── Mutate the real stock array: cycle the 4 cells forward one step ──
function rotatePlatformCells(plate) {
  var c = plate.cells;              // [TL, BL, BR, TR]
  var saved = stock[c[3]];          // old TR
  stock[c[3]] = stock[c[2]];        // TR <- old BR
  stock[c[2]] = stock[c[1]];        // BR <- old BL
  stock[c[1]] = stock[c[0]];        // BL <- old TL
  stock[c[0]] = saved;              // TL <- old TR
  // Positions belong to the cell, so re-stamp x/y from the index.
  for (var k = 0; k < 4; k++) {
    var idx = c[k];
    stock[idx].x = L.sx + (idx % L.cols) * (L.bw + L.bg);
    stock[idx].y = L.sy + Math.floor(idx / L.cols) * (L.bh + L.bg);
  }
}

// ── Triggered on every successful pick ──
function rotateAllPlatforms() {
  if (!platforms || !platforms.length) return;
  var live = [];
  for (var i = 0; i < platforms.length; i++) {
    if (!platforms[i].done && !platforms[i].cleared) live.push(platforms[i]);
  }
  if (!live.length) return;

  // ── Safeguard: simulate the rotation on a virtual board ──
  var vstock = stock.slice();
  for (var p = 0; p < live.length; p++) {
    var c = live[p].cells;
    var saved = vstock[c[3]];
    vstock[c[3]] = vstock[c[2]];
    vstock[c[2]] = vstock[c[1]];
    vstock[c[1]] = vstock[c[0]];
    vstock[c[0]] = saved;
  }
  var check = platformCountAvailable(vstock);
  if (check.activeRemaining > 0 && check.available === 0) {
    // Rotating would strand the player — hold this turn.
    for (var h = 0; h < live.length; h++) { live[h].holdT = 1; }
    if (typeof sfx !== 'undefined' && sfx.hold) sfx.hold();
    return;
  }

  // ── Commit ──
  for (var q = 0; q < live.length; q++) {
    var plate = live[q];
    rotatePlatformCells(plate);
    plate.baseAngle -= Math.PI / 2;
    plate.spinT = 1;
    // Dust puff at the hub to sell the push.
    var hx = (platformCellCenterX(plate.cells[0]) + platformCellCenterX(plate.cells[2])) / 2;
    var hy = (platformCellCenterY(plate.cells[0]) + platformCellCenterY(plate.cells[2])) / 2;
    for (var d = 0; d < 8; d++) {
      var ang = Math.PI * 2 * d / 8 + Math.random() * 0.4;
      var sp = 1.5 + Math.random() * 2;
      particles.push({
        x: hx, y: hy,
        vx: Math.cos(ang) * sp * S, vy: Math.sin(ang) * sp * S,
        r: (1.5 + Math.random() * 2) * S, color: 'rgba(120,110,100,0.55)',
        life: 0.7, decay: 0.04 + Math.random() * 0.02, grav: false
      });
    }
  }
  if (typeof sfx !== 'undefined' && sfx.rotate) sfx.rotate();
  // Re-evaluate reachability now that boxes sit on new cells
  // (reveals hidden boxes that spun into reach, closes ones that spun away).
  updateBoxReveals(true);
}

function clearPlateSlides(plate) {
  for (var k = 0; k < 4; k++) {
    var b = stock[plate.cells[k]];
    if (b) { b.slideDX = 0; b.slideDY = 0; }
  }
}

function onPlateCleared(plate) {
  var hx = (platformCellCenterX(plate.cells[0]) + platformCellCenterX(plate.cells[2])) / 2;
  var hy = (platformCellCenterY(plate.cells[0]) + platformCellCenterY(plate.cells[2])) / 2;
  spawnBurst(hx, hy, 'rgba(230,220,205,0.9)', 16);
  for (var s = 0; s < 10; s++) {
    var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
    particles.push({
      x: hx, y: hy, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (1.5 + Math.random() * 3) * S, color: 'rgba(255,250,240,0.8)',
      life: 0.9, decay: 0.02, grav: false
    });
  }
  if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();
  for (var k = 0; k < 4; k++) { if (stock[plate.cells[k]]) stock[plate.cells[k]].onPlate = false; }
}

// ── Per-frame update: spin animation + clear detection ──
function updatePlatforms() {
  if (!platforms || !platforms.length) return;
  for (var p = 0; p < platforms.length; p++) {
    var plate = platforms[p];
    if (plate.done) continue;

    // Detect the last box leaving the plate.
    if (!plate.cleared && platformActiveOnPlate(plate) === 0) {
      plate.cleared = true; plate.clearT = 1;
      clearPlateSlides(plate);
      onPlateCleared(plate);
    }
    if (plate.cleared) {
      plate.clearT = Math.max(0, plate.clearT - 0.03);
      if (plate.clearT <= 0) plate.done = true;
    }
    if (plate.holdT > 0) plate.holdT = Math.max(0, plate.holdT - 0.05);

    // Spin animation — slide the four contents around the hub.
    if (plate.spinT > 0 && !plate.cleared) {
      plate.spinT = Math.max(0, plate.spinT - PLATE_SPIN_RATE);
      var e = plate.spinT <= 0 ? 1 : platformSmooth(1 - plate.spinT);
      plate.displayAngle = plate.baseAngle + (Math.PI / 2) * (1 - e);
      var hx = (platformCellCenterX(plate.cells[0]) + platformCellCenterX(plate.cells[2])) / 2;
      var hy = (platformCellCenterY(plate.cells[0]) + platformCellCenterY(plate.cells[2])) / 2;
      var theta = -(Math.PI / 2) * e;    // anti-clockwise on screen
      var cos = Math.cos(theta), sin = Math.sin(theta);
      for (var k = 0; k < 4; k++) {
        var idx = plate.cells[k];
        var oldIdx = plate.cells[(k + 3) % 4];   // where this content came from
        var ox0 = platformCellCenterX(oldIdx) - hx;
        var oy0 = platformCellCenterY(oldIdx) - hy;
        var rx = ox0 * cos - oy0 * sin;
        var ry = ox0 * sin + oy0 * cos;
        var b = stock[idx];
        if (b) {
          b.slideDX = (hx + rx) - platformCellCenterX(idx);
          b.slideDY = (hy + ry) - platformCellCenterY(idx);
        }
      }
      if (plate.spinT <= 0) clearPlateSlides(plate);
    } else if (!plate.cleared) {
      plate.displayAngle = plate.baseAngle;
    }
  }
}

// ── Draw the static plate tray + spinning propeller (under the boxes) ──
function drawPlatforms() {
  if (!platforms || !platforms.length) return;
  for (var p = 0; p < platforms.length; p++) {
    var plate = platforms[p];
    if (plate.done) continue;
    var alpha = plate.cleared ? plate.clearT : 1;
    if (alpha <= 0) continue;

    var TL = plate.cells[0];
    var x0 = L.sx + (TL % L.cols) * (L.bw + L.bg);
    var y0 = L.sy + Math.floor(TL / L.cols) * (L.bh + L.bg);
    var pw = 2 * L.bw + L.bg;
    var ph = 2 * L.bh + L.bg;
    var pad = 4 * S;
    var hx = x0 + pw / 2, hy = y0 + ph / 2;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Plate tray
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 3 * S;
    var trayGrad = ctx.createLinearGradient(x0, y0 - pad, x0, y0 + ph + pad);
    trayGrad.addColorStop(0, '#E6DCCB');
    trayGrad.addColorStop(1, '#CBBEA6');
    ctx.fillStyle = trayGrad;
    rRect(x0 - pad, y0 - pad, pw + pad * 2, ph + pad * 2, 12 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(60,50,38,0.85)'; ctx.lineWidth = 2.5 * S;
    rRect(x0 - pad, y0 - pad, pw + pad * 2, ph + pad * 2, 12 * S); ctx.stroke();

    // Faint cross dividing the four cells
    ctx.strokeStyle = 'rgba(90,74,56,0.18)'; ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    ctx.moveTo(hx, y0 - pad + 2 * S); ctx.lineTo(hx, y0 + ph + pad - 2 * S);
    ctx.moveTo(x0 - pad + 2 * S, hy); ctx.lineTo(x0 + pw + pad - 2 * S, hy);
    ctx.stroke();

    // Propeller ("hélice") — a 4-point compass star that spins
    var R = Math.min(pw, ph) * 0.5;   // outer reach
    var rin = R * 0.18;               // inner waist
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(plate.displayAngle || 0);
    ctx.beginPath();
    for (var s = 0; s < 4; s++) {
      var aOut = s * Math.PI / 2;
      var aIn = aOut + Math.PI / 4;
      var ox = Math.cos(aOut) * R, oy = Math.sin(aOut) * R;
      var ix = Math.cos(aIn) * rin, iy = Math.sin(aIn) * rin;
      if (s === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 4 * S;
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(40,34,28,0.9)'; ctx.lineWidth = 1.6 * S;
    ctx.stroke();

    // Central hub
    ctx.fillStyle = 'rgba(245,240,232,1)';
    ctx.beginPath(); ctx.arc(0, 0, rin * 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,34,28,0.9)'; ctx.lineWidth = 1.6 * S;
    ctx.beginPath(); ctx.arc(0, 0, rin * 1.9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(45,40,34,1)';
    ctx.beginPath(); ctx.arc(0, 0, rin * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Hold flash (safeguard prevented a spin this pick)
    if (plate.holdT > 0) {
      ctx.globalAlpha = alpha * plate.holdT * 0.55;
      ctx.strokeStyle = '#E8544C'; ctx.lineWidth = 3 * S;
      rRect(x0 - pad, y0 - pad, pw + pad * 2, ph + pad * 2, 12 * S); ctx.stroke();
    }

    ctx.restore();
  }
}
