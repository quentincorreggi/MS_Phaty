// ============================================================
// treadmill.js — Treadmill mechanic: a circular track of grid
//                cells that shifts boxes one position each tap.
//                Retro snake style with 90-degree corners.
// ============================================================

var treadmillPath = [];        // ordered list of stock indices (the loop)
var treadmillOpen = [];        // boolean array: true = open (revealed) position
var treadmillCellSet = {};     // { stockIdx: true } for quick lookup
var treadmillActive = false;
var treadmillPendingShifts = 0;

function initTreadmill(lvl) {
  treadmillPath = [];
  treadmillOpen = [];
  treadmillCellSet = {};
  treadmillActive = false;
  treadmillPendingShifts = 0;

  if (!lvl.treadmill || !lvl.treadmill.path || lvl.treadmill.path.length < 2) return;

  treadmillPath = lvl.treadmill.path.slice();
  treadmillActive = true;

  var openSet = {};
  if (lvl.treadmill.openSlots) {
    for (var i = 0; i < lvl.treadmill.openSlots.length; i++) {
      openSet[lvl.treadmill.openSlots[i]] = true;
    }
  }
  for (var i = 0; i < treadmillPath.length; i++) {
    treadmillOpen.push(!!openSet[i]);
    treadmillCellSet[treadmillPath[i]] = true;
  }
}

function applyTreadmillReveals() {
  if (!treadmillActive) return;
  for (var i = 0; i < treadmillPath.length; i++) {
    var b = stock[treadmillPath[i]];
    if (!b || b.isTunnel || b.isWall || b.empty) continue;
    if (!b.used) {
      b.revealed = treadmillOpen[i];
    }
    b.onTreadmill = true;
    b.slideOffX = 0;
    b.slideOffY = 0;
  }
}

function queueTreadmillShift() {
  if (!treadmillActive) return;
  treadmillPendingShifts++;
}

function canTreadmillShift() {
  for (var i = 0; i < treadmillPath.length; i++) {
    var b = stock[treadmillPath[i]];
    if (b.spawning) return false;
  }
  // Wait for slide animation to mostly finish
  for (var i = 0; i < treadmillPath.length; i++) {
    var b = stock[treadmillPath[i]];
    if (Math.abs(b.slideOffX || 0) > 2 || Math.abs(b.slideOffY || 0) > 2) return false;
  }
  return true;
}

function doTreadmillShift() {
  var len = treadmillPath.length;
  if (len < 2) return;

  // Save current box refs
  var saved = [];
  for (var i = 0; i < len; i++) {
    saved.push(stock[treadmillPath[i]]);
  }

  // Shift forward: position i gets the box from position (i-1+len)%len
  for (var i = 0; i < len; i++) {
    var srcIdx = (i - 1 + len) % len;
    var targetStockIdx = treadmillPath[i];
    var box = saved[srcIdx];

    var row = Math.floor(targetStockIdx / L.cols);
    var col = targetStockIdx % L.cols;
    var newX = L.sx + col * (L.bw + L.bg);
    var newY = L.sy + row * (L.bh + L.bg);

    // Slide offset for animation (from old position toward new)
    box.slideOffX = box.x - newX;
    box.slideOffY = box.y - newY;

    box.x = newX;
    box.y = newY;

    // Update revealed state based on new position
    if (!box.empty && !box.used) {
      var wasRevealed = box.revealed;
      box.revealed = treadmillOpen[i];
      if (box.revealed && !wasRevealed) {
        box.revealT = 0.7;
        box.popT = 0.3;
      }
    }

    stock[targetStockIdx] = box;
  }

  sfx.pop();
}

function updateTreadmill() {
  if (!treadmillActive) return;

  // Process pending shifts
  if (treadmillPendingShifts > 0 && canTreadmillShift()) {
    doTreadmillShift();
    treadmillPendingShifts--;
  }

  // Decay slide offsets
  for (var i = 0; i < treadmillPath.length; i++) {
    var b = stock[treadmillPath[i]];
    if (b.slideOffX) {
      b.slideOffX *= 0.68;
      if (Math.abs(b.slideOffX) < 0.3) b.slideOffX = 0;
    }
    if (b.slideOffY) {
      b.slideOffY *= 0.68;
      if (Math.abs(b.slideOffY) < 0.3) b.slideOffY = 0;
    }
  }
}

// ── Track drawing (called before drawStock) ──

function drawTreadmillTrack() {
  if (!treadmillActive) return;

  var len = treadmillPath.length;
  var trackColor = 'rgba(55, 48, 42, 0.85)';
  var trackInset = L.bg * 0.1;

  ctx.save();

  // Draw connecting segments between consecutive cells (fill the gap)
  for (var i = 0; i < len; i++) {
    var currIdx = treadmillPath[i];
    var nextIdx = treadmillPath[(i + 1) % len];

    var cr = Math.floor(currIdx / L.cols), cc = currIdx % L.cols;
    var nr = Math.floor(nextIdx / L.cols), nc = nextIdx % L.cols;

    ctx.fillStyle = trackColor;

    if (nc > cc && nr === cr) {
      // Next is to the right
      ctx.fillRect(
        L.sx + cc * (L.bw + L.bg) + L.bw,
        L.sy + cr * (L.bh + L.bg) + trackInset,
        L.bg,
        L.bh - trackInset * 2
      );
    } else if (nc < cc && nr === cr) {
      // Next is to the left
      ctx.fillRect(
        L.sx + nc * (L.bw + L.bg) + L.bw,
        L.sy + nr * (L.bh + L.bg) + trackInset,
        L.bg,
        L.bh - trackInset * 2
      );
    } else if (nr > cr && nc === cc) {
      // Next is below
      ctx.fillRect(
        L.sx + cc * (L.bw + L.bg) + trackInset,
        L.sy + cr * (L.bh + L.bg) + L.bh,
        L.bw - trackInset * 2,
        L.bg
      );
    } else if (nr < cr && nc === cc) {
      // Next is above
      ctx.fillRect(
        L.sx + nc * (L.bw + L.bg) + trackInset,
        L.sy + nr * (L.bh + L.bg) + L.bh,
        L.bw - trackInset * 2,
        L.bg
      );
    }
  }

  // Draw cell backgrounds and indicators
  for (var i = 0; i < len; i++) {
    var idx = treadmillPath[i];
    var row = Math.floor(idx / L.cols), col = idx % L.cols;
    var x = L.sx + col * (L.bw + L.bg);
    var y = L.sy + row * (L.bh + L.bg);
    var isOpen = treadmillOpen[i];

    // Track bed
    ctx.fillStyle = trackColor;
    rRect(x, y, L.bw, L.bh, 6 * S);
    ctx.fill();

    // Open: warm amber glow / Closed: dim border
    if (isOpen) {
      ctx.fillStyle = 'rgba(255, 190, 80, 0.12)';
      rRect(x, y, L.bw, L.bh, 6 * S);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 190, 80, 0.35)';
      ctx.lineWidth = 2 * S;
      rRect(x, y, L.bw, L.bh, 6 * S);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(100, 90, 80, 0.25)';
      ctx.lineWidth = 1.5 * S;
      rRect(x, y, L.bw, L.bh, 6 * S);
      ctx.stroke();
    }

    // Direction chevron (pointing to next cell)
    var nextIdx = treadmillPath[(i + 1) % len];
    var nextRow = Math.floor(nextIdx / L.cols), nextCol = nextIdx % L.cols;
    var dx = nextCol - col, dy = nextRow - row;

    var ax = x + L.bw / 2;
    var ay = y + L.bh / 2;
    var as = L.bw * 0.11;

    ctx.strokeStyle = isOpen ? 'rgba(255, 210, 120, 0.3)' : 'rgba(160, 150, 140, 0.15)';
    ctx.lineWidth = 1.5 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (dx > 0) {
      ctx.moveTo(ax - as * 0.4, ay - as); ctx.lineTo(ax + as * 0.6, ay); ctx.lineTo(ax - as * 0.4, ay + as);
    } else if (dx < 0) {
      ctx.moveTo(ax + as * 0.4, ay - as); ctx.lineTo(ax - as * 0.6, ay); ctx.lineTo(ax + as * 0.4, ay + as);
    } else if (dy > 0) {
      ctx.moveTo(ax - as, ay - as * 0.4); ctx.lineTo(ax, ay + as * 0.6); ctx.lineTo(ax + as, ay - as * 0.4);
    } else if (dy < 0) {
      ctx.moveTo(ax - as, ay + as * 0.4); ctx.lineTo(ax, ay - as * 0.6); ctx.lineTo(ax + as, ay + as * 0.4);
    }
    ctx.stroke();
  }

  ctx.restore();
}
