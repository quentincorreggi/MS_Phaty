// ============================================================
// treadmill.js — Treadmill mechanic: a chain of cells that
//                shifts boxes forward when gaps appear.
// ============================================================

var treadmillGroups = [];
var TREADMILL_SLIDE_SPEED = 0.07;

// ── Build treadmill groups from stock data ──

function buildTreadmillGroups() {
  treadmillGroups = [];
  var groupMap = {};
  for (var i = 0; i < stock.length; i++) {
    if (stock[i].treadmillGroup >= 0) {
      var gid = stock[i].treadmillGroup;
      if (!groupMap[gid]) groupMap[gid] = [];
      groupMap[gid].push({ idx: i, seq: stock[i].treadmillSeq });
    }
  }
  for (var gid in groupMap) {
    var cells = groupMap[gid];
    cells.sort(function (a, b) { return a.seq - b.seq; });
    var indices = [];
    for (var c = 0; c < cells.length; c++) indices.push(cells[c].idx);

    // Compute feeder: continue direction from second-to-last → last cell
    var feederIdx = -1;
    if (indices.length >= 2) {
      var last = indices[indices.length - 1];
      var prev = indices[indices.length - 2];
      var lr = Math.floor(last / L.cols), lc = last % L.cols;
      var pr = Math.floor(prev / L.cols), pc = prev % L.cols;
      var dr = lr - pr, dc = lc - pc;
      var fr = lr + dr, fc = lc + dc;
      if (fr >= 0 && fr < L.rows && fc >= 0 && fc < L.cols) {
        var fi = fr * L.cols + fc;
        var fs = stock[fi];
        if (fs && fs.treadmillGroup < 0 && !fs.isTunnel && !fs.isWall) {
          feederIdx = fi;
        }
      }
    }

    treadmillGroups.push({ cells: indices, feederIdx: feederIdx, shiftCooldown: 0 });
  }
}

// ── Check if a treadmill slot is empty (available for a box to slide into) ──

function isTreadmillSlotEmpty(idx) {
  var s = stock[idx];
  return s && (s.empty || s.used);
}

// ── Move box data from one cell to another, preserving treadmill + position ──

function treadmillMoveBox(fromIdx, toIdx) {
  var from = stock[fromIdx];
  var to = stock[toIdx];

  // Save destination treadmill data and grid position
  var tg = to.treadmillGroup, ts = to.treadmillSeq;
  var tx = to.x, ty = to.y;

  to.ci = from.ci;
  to.used = from.used;
  to.remaining = from.remaining;
  to.spawning = from.spawning;
  to.spawnIdx = from.spawnIdx;
  to.revealed = from.revealed;
  to.empty = from.empty;
  to.boxType = from.boxType;
  to.iceHP = from.iceHP;
  to.iceCrackT = from.iceCrackT;
  to.iceShatterT = from.iceShatterT;
  to.blockerCount = from.blockerCount;
  to.isTunnel = false;
  to.isWall = false;
  to.shakeT = 0;
  to.hoverT = 0;
  to.popT = 0;
  to.revealT = 0;
  to.emptyT = 0;
  to.idlePhase = from.idlePhase;

  // Restore treadmill + position
  to.treadmillGroup = tg;
  to.treadmillSeq = ts;
  to.x = tx;
  to.y = ty;

  // Slide animation
  to.slideT = 1.0;
  to.slideFromX = from.x;
  to.slideFromY = from.y;
}

// ── Clear a cell (make it empty), keeping treadmill + position ──

function treadmillClearSlot(idx) {
  var s = stock[idx];
  s.ci = 0;
  s.used = false;
  s.remaining = 0;
  s.spawning = false;
  s.spawnIdx = 0;
  s.revealed = true;
  s.empty = true;
  s.boxType = 'default';
  s.iceHP = 0;
  s.iceCrackT = 0;
  s.iceShatterT = 0;
  s.blockerCount = 0;
  s.shakeT = 0;
  s.hoverT = 0;
  s.popT = 0;
  s.revealT = 0;
  s.emptyT = 0;
  s.slideT = 0;
  // treadmillGroup, treadmillSeq, x, y are preserved
}

// ── Try to shift one box forward in a group (returns true if shifted) ──

function treadmillTryShift(gIdx) {
  var group = treadmillGroups[gIdx];
  var cells = group.cells;

  // Scan head to tail, find first gap with a non-empty cell behind it
  for (var i = 0; i < cells.length; i++) {
    if (!isTreadmillSlotEmpty(cells[i])) continue;

    // Gap at position i — find next non-empty, non-spawning cell behind it
    for (var j = i + 1; j <= cells.length; j++) {
      var srcIdx;
      if (j < cells.length) {
        srcIdx = cells[j];
        var src = stock[srcIdx];
        if (src.spawning) return false;
        if (src.empty || src.used) continue;
      } else if (group.feederIdx >= 0) {
        srcIdx = group.feederIdx;
        var fs = stock[srcIdx];
        if (!fs || fs.empty || fs.used || fs.isTunnel || fs.isWall || fs.spawning) return false;
      } else {
        return false;
      }

      // Found a box to shift
      treadmillMoveBox(srcIdx, cells[i]);
      if (j >= cells.length) {
        treadmillClearSlot(group.feederIdx);
        revealAroundEmptyCell(group.feederIdx);
      } else {
        treadmillClearSlot(cells[j]);
        revealAroundEmptyCell(cells[j]);
      }
      return true;
    }
    return false;
  }
  return false;
}

// ── Update (called each frame from game.js) ──

function updateTreadmills() {
  // Animate slides
  for (var i = 0; i < stock.length; i++) {
    if (stock[i].slideT > 0) {
      stock[i].slideT = Math.max(0, stock[i].slideT - TREADMILL_SLIDE_SPEED);
    }
  }

  // Check for shifts
  for (var g = 0; g < treadmillGroups.length; g++) {
    var group = treadmillGroups[g];

    // Wait for slide animations to finish
    var sliding = false;
    for (var c = 0; c < group.cells.length; c++) {
      if (stock[group.cells[c]].slideT > 0) { sliding = true; break; }
    }
    if (sliding) continue;

    if (group.shiftCooldown > 0) { group.shiftCooldown--; continue; }

    if (treadmillTryShift(g)) {
      group.shiftCooldown = 4;
      tone(300, 0.15, 'sine', 0.06, 150);
    }
  }
}

// ── Draw treadmill tracks (called before drawStock) ──

function drawTreadmillTracks() {
  if (treadmillGroups.length === 0) return;
  ctx.save();

  for (var g = 0; g < treadmillGroups.length; g++) {
    var group = treadmillGroups[g];
    var cells = group.cells;
    if (cells.length < 1) continue;

    // Track connectors between cells
    for (var i = 1; i < cells.length; i++) {
      var a = stock[cells[i - 1]], b = stock[cells[i]];
      var ax = a.x + L.bw / 2, ay = a.y + L.bh / 2;
      var bx2 = b.x + L.bw / 2, by2 = b.y + L.bh / 2;

      ctx.strokeStyle = 'rgba(80,70,60,0.12)';
      ctx.lineWidth = L.bw * 0.35;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx2, by2);
      ctx.stroke();
    }

    // Grooved track on each cell
    for (var i = 0; i < cells.length; i++) {
      var s = stock[cells[i]];
      ctx.fillStyle = 'rgba(80,70,60,0.08)';
      rRect(s.x + 2, s.y + 2, L.bw - 4, L.bh - 4, 4 * S);
      ctx.fill();
    }

    // Chevron arrows pointing toward head (lower seq)
    for (var i = 1; i < cells.length; i++) {
      var curr = stock[cells[i]], prev = stock[cells[i - 1]];
      var dx = prev.x - curr.x, dy = prev.y - curr.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      dx /= len;
      dy /= len;

      var acx = curr.x + L.bw / 2 + dx * L.bw * 0.15;
      var acy = curr.y + L.bh / 2 + dy * L.bh * 0.15;
      var asize = L.bw * 0.1;

      ctx.strokeStyle = 'rgba(80,70,60,0.18)';
      ctx.lineWidth = 2 * S;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(acx - dx * asize + dy * asize, acy - dy * asize - dx * asize);
      ctx.lineTo(acx, acy);
      ctx.lineTo(acx - dx * asize - dy * asize, acy - dy * asize + dx * asize);
      ctx.stroke();
    }

    // Feeder cell dashed border
    if (group.feederIdx >= 0) {
      var fs = stock[group.feederIdx];
      ctx.strokeStyle = 'rgba(80,70,60,0.2)';
      ctx.lineWidth = 1.5 * S;
      ctx.setLineDash([3 * S, 3 * S]);
      rRect(fs.x + 1, fs.y + 1, L.bw - 2, L.bh - 2, 5 * S);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}
