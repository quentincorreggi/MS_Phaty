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

    treadmillGroups.push({ cells: indices, feederIdx: feederIdx, shiftCooldown: 0, needsReveal: false });
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
      } else {
        treadmillClearSlot(cells[j]);
      }
      group.needsReveal = true;
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
    } else if (group.needsReveal) {
      // Group is fully settled — now do reveals
      group.needsReveal = false;
      for (var c = 0; c < group.cells.length; c++) {
        if (isTreadmillSlotEmpty(group.cells[c])) {
          revealAroundEmptyCell(group.cells[c]);
        }
      }
      if (group.feederIdx >= 0 && isTreadmillSlotEmpty(group.feederIdx)) {
        revealAroundEmptyCell(group.feederIdx);
      }
    }
  }
}

// ── Draw treadmill tracks (called AFTER drawStock, drawn on top) ──

function drawTreadmillTracks() {
  if (treadmillGroups.length === 0) return;
  ctx.save();

  for (var g = 0; g < treadmillGroups.length; g++) {
    var group = treadmillGroups[g];
    var cells = group.cells;
    if (cells.length < 2) continue;

    // Compute path positions (center of each cell)
    var pts = [];
    for (var i = 0; i < cells.length; i++) {
      var s = stock[cells[i]];
      pts.push({ x: s.x + L.bw / 2, y: s.y + L.bh / 2 });
    }

    // Draw track rail — a thick line alongside the cells, offset to the side
    // Determine perpendicular offset for each segment
    var railW = 3 * S;
    var railOffset = L.bw * 0.42;

    for (var side = -1; side <= 1; side += 2) {
      ctx.strokeStyle = 'rgba(90,80,65,0.35)';
      ctx.lineWidth = railW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var px, py;
        if (i < pts.length - 1) {
          var dx = pts[i + 1].x - pts[i].x;
          var dy = pts[i + 1].y - pts[i].y;
          var len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) { dx /= len; dy /= len; }
          px = pts[i].x + (-dy) * side * railOffset;
          py = pts[i].y + dx * side * railOffset;
        } else {
          var dx = pts[i].x - pts[i - 1].x;
          var dy = pts[i].y - pts[i - 1].y;
          var len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) { dx /= len; dy /= len; }
          px = pts[i].x + (-dy) * side * railOffset;
          py = pts[i].y + dx * side * railOffset;
        }
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Draw bold arrows between cells pointing toward head
    for (var i = 1; i < cells.length; i++) {
      var dx = pts[i - 1].x - pts[i].x;
      var dy = pts[i - 1].y - pts[i].y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      dx /= len;
      dy /= len;

      // Arrow at midpoint between cells
      var mx = (pts[i].x + pts[i - 1].x) / 2;
      var my = (pts[i].y + pts[i - 1].y) / 2;
      var asize = L.bw * 0.18;

      ctx.fillStyle = 'rgba(70,60,50,0.45)';
      ctx.beginPath();
      ctx.moveTo(mx + dx * asize, my + dy * asize);
      ctx.lineTo(mx - dx * asize * 0.5 + dy * asize * 0.6, my - dy * asize * 0.5 - dx * asize * 0.6);
      ctx.lineTo(mx - dx * asize * 0.5 - dy * asize * 0.6, my - dy * asize * 0.5 + dx * asize * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    // Feeder cell dashed border + arrow into treadmill
    if (group.feederIdx >= 0) {
      var fs = stock[group.feederIdx];
      ctx.strokeStyle = 'rgba(90,80,65,0.35)';
      ctx.lineWidth = 2 * S;
      ctx.setLineDash([4 * S, 4 * S]);
      rRect(fs.x + 1, fs.y + 1, L.bw - 2, L.bh - 2, 5 * S);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small arrow from feeder toward the tail
      var tail = pts[pts.length - 1];
      var fcx = fs.x + L.bw / 2, fcy = fs.y + L.bh / 2;
      var fdx = tail.x - fcx, fdy = tail.y - fcy;
      var flen = Math.sqrt(fdx * fdx + fdy * fdy);
      if (flen > 0) {
        fdx /= flen; fdy /= flen;
        var fmx = (fcx + tail.x) / 2;
        var fmy = (fcy + tail.y) / 2;
        var fas = L.bw * 0.13;
        ctx.fillStyle = 'rgba(70,60,50,0.3)';
        ctx.beginPath();
        ctx.moveTo(fmx + fdx * fas, fmy + fdy * fas);
        ctx.lineTo(fmx - fdx * fas * 0.5 + fdy * fas * 0.6, fmy - fdy * fas * 0.5 - fdx * fas * 0.6);
        ctx.lineTo(fmx - fdx * fas * 0.5 - fdy * fas * 0.6, fmy - fdy * fas * 0.5 + fdx * fas * 0.6);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
