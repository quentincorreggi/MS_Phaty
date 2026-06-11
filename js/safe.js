// ============================================================
// safe.js — Color Safe mechanic
// A 2x2 cover hides 4 underlying boxes until its color counters
// are paid down by tapping matching boxes elsewhere on the maze.
// ============================================================
//
// Per-cell flags written by initSafes / openSafe:
//   safeCover: true          — cell is under a safe
//   safeAnchor: true|false   — true only on the top-left of the 2x2
//   safeAnchorIdx: <int>     — points back to the anchor stock index
//   safeOpen: false          — flips true when the safe opens
//   safeReqs: [{ci, target, count}]  — anchor only; count decrements
//   safeShakeT, safeOpenT, safeFlashT — animation timers (anchor only)
//
// Grid-level format used by editor / level JSON:
//   anchor:    { safe: true, anchor: true, anchorIdx: N, reqs: [...], inner: <box>|null }
//   sub-cell:  { safe: true, anchor: false, anchorIdx: N, inner: <box>|null }
// ============================================================

var SAFE_FRAME_COLOR_TOP = '#FF8B8B';
var SAFE_FRAME_COLOR_MID = '#E85050';
var SAFE_FRAME_COLOR_BOT = '#B83030';
var SAFE_FRAME_BORDER = '#7A2020';

// ── Geometry helpers ──

function getSafeCellIndices(anchorIdx) {
  var r = Math.floor(anchorIdx / L.cols);
  var c = anchorIdx % L.cols;
  return [
    anchorIdx,
    r * L.cols + (c + 1),
    (r + 1) * L.cols + c,
    (r + 1) * L.cols + (c + 1)
  ];
}

function getSafeAnchorRect(anchor) {
  return {
    x: anchor.x,
    y: anchor.y,
    w: L.bw * 2 + L.bg,
    h: L.bh * 2 + L.bg
  };
}

// ── Init from level grid ──
//
// Called by initGame after stock has been built. Reads safe metadata
// from lvl.grid and writes safe flags onto the corresponding stock
// cells. The "inner" box payload must already have been applied to
// stock (game.js handles that when building stock from grid).
function initSafesFromGrid(grid) {
  if (!grid) return;
  for (var i = 0; i < stock.length && i < grid.length; i++) {
    var cell = grid[i];
    if (!cell || !cell.safe) continue;
    var s = stock[i];
    s.safeCover = true;
    s.safeOpen = false;
    s.safeAnchor = !!cell.anchor;
    s.safeAnchorIdx = (cell.anchorIdx !== undefined) ? cell.anchorIdx : i;
    s.safeShakeT = 0;
    s.safeOpenT = 0;
    s.safeFlashT = 0;
    if (cell.anchor && cell.reqs) {
      s.safeReqs = [];
      for (var r = 0; r < cell.reqs.length; r++) {
        var rq = cell.reqs[r];
        s.safeReqs.push({ ci: rq.ci, target: rq.target || rq.count || 0, count: rq.target || rq.count || 0 });
      }
    }
  }
}

// ── Tap interaction: decrement counters when player taps a box ──

function decrementSafes(ci) {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s.safeAnchor || s.safeOpen || !s.safeReqs) continue;
    var changed = false;
    for (var r = 0; r < s.safeReqs.length; r++) {
      var req = s.safeReqs[r];
      if (req.ci === ci && req.count > 0) {
        req.count--;
        changed = true;
        spawnSafeTickParticles(s, r);
      }
    }
    if (changed) {
      s.safeFlashT = 1.0;
      if (typeof sfx !== 'undefined' && sfx.pop) {
        try { tone(1200 + Math.random() * 200, 0.06, 'sine', 0.05, 600); } catch (e) {}
      }
      if (isSafeSatisfied(s)) openSafe(i);
    }
  }
}

function isSafeSatisfied(anchor) {
  if (!anchor.safeReqs || anchor.safeReqs.length === 0) return false;
  for (var i = 0; i < anchor.safeReqs.length; i++) {
    if (anchor.safeReqs[i].count > 0) return false;
  }
  return true;
}

function openSafe(anchorIdx) {
  var anchor = stock[anchorIdx];
  if (!anchor || anchor.safeOpen) return;
  var cells = getSafeCellIndices(anchorIdx);
  for (var i = 0; i < cells.length; i++) {
    var cs = stock[cells[i]];
    if (cs) cs.safeOpen = true;
  }
  anchor.safeOpenT = 1.0;
  if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
  var rect = getSafeAnchorRect(anchor);
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;
  if (typeof spawnBurst === 'function') spawnBurst(cx, cy, '#FFD080', 28);
  if (typeof spawnConfetti === 'function') spawnConfetti(cx, cy, 24);
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

function spawnSafeTickParticles(anchor, reqIdx) {
  var rect = getSafeAnchorRect(anchor);
  var pad = 14 * S;
  var innerX = rect.x + pad, innerY = rect.y + pad;
  var innerW = rect.w - pad * 2, innerH = rect.h - pad * 2;
  var slot = chipSlotForIndex(reqIdx, anchor.safeReqs.length);
  var cx = innerX + (slot.c + 0.5) * (innerW / 2);
  var cy = innerY + (slot.r + 0.5) * (innerH / 2);
  var c = COLORS[anchor.safeReqs[reqIdx].ci];
  for (var p = 0; p < 6; p++) {
    var ang = Math.PI * 2 * p / 6 + Math.random() * 0.4;
    var sp = 1.5 + Math.random() * 2;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * sp * S, vy: Math.sin(ang) * sp * S,
      r: (1.5 + Math.random() * 2) * S, color: c.light,
      life: 0.7, decay: 0.04, grav: false
    });
  }
}

// ── Closed-safe tap on the 2x2 area: shake + locked sound ──

function tryTapClosedSafe(px, py) {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s.safeAnchor || s.safeOpen) continue;
    var rect = getSafeAnchorRect(s);
    if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
      s.safeShakeT = 0.5;
      try { tone(180, 0.1, 'square', 0.06, 110); } catch (e) {}
      return true;
    }
  }
  return false;
}

// ── Per-frame animation tick ──

function updateSafes() {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s.safeAnchor) continue;
    if (s.safeShakeT > 0) s.safeShakeT = Math.max(0, s.safeShakeT - 0.04);
    if (s.safeOpenT > 0) s.safeOpenT = Math.max(0, s.safeOpenT - 0.022);
    if (s.safeFlashT > 0) s.safeFlashT = Math.max(0, s.safeFlashT - 0.035);
  }
}

// ── Rendering ──

function drawSafes() {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s.safeAnchor) continue;
    if (!s.safeOpen) {
      drawSafeCover(s, 1.0);
    } else if (s.safeOpenT > 0) {
      var openPhase = 1 - s.safeOpenT;
      drawSafeCover(s, s.safeOpenT, openPhase);
    }
  }
}

function drawSafeCover(anchor, alpha, openPhase) {
  var rect = getSafeAnchorRect(anchor);
  var x = rect.x, y = rect.y, w = rect.w, h = rect.h;

  // Shake offset
  var ox = 0;
  if (anchor.safeShakeT > 0) ox = Math.sin(anchor.safeShakeT * 32) * 5 * S * anchor.safeShakeT;

  // Opening animation: scale up + fade + slight rotation
  var oScale = 1, oRot = 0;
  if (openPhase !== undefined) {
    oScale = 1 + openPhase * 0.18;
    oRot = openPhase * 0.06;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2 + ox, y + h / 2);
  ctx.rotate(oRot);
  ctx.scale(oScale, oScale);
  var lx = -w / 2, ly = -h / 2;

  // Outer pinkish-red frame
  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur = 8 * S;
  ctx.shadowOffsetY = 4 * S;
  var fGrad = ctx.createLinearGradient(lx, ly, lx, ly + h);
  fGrad.addColorStop(0, SAFE_FRAME_COLOR_TOP);
  fGrad.addColorStop(0.55, SAFE_FRAME_COLOR_MID);
  fGrad.addColorStop(1, SAFE_FRAME_COLOR_BOT);
  ctx.fillStyle = fGrad;
  rRect(lx, ly, w, h, 16 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Inner highlight band
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1.5 * S;
  rRect(lx + 3 * S, ly + 3 * S, w - 6 * S, h - 6 * S, 13 * S); ctx.stroke();

  // Outer border
  ctx.strokeStyle = SAFE_FRAME_BORDER;
  ctx.lineWidth = 2 * S;
  rRect(lx, ly, w, h, 16 * S); ctx.stroke();

  // Inner metallic panel
  var pad = 14 * S;
  var pX = lx + pad, pY = ly + pad;
  var pW = w - pad * 2, pH = h - pad * 2;
  var pGrad = ctx.createLinearGradient(pX, pY, pX, pY + pH);
  pGrad.addColorStop(0, '#E2DDD2');
  pGrad.addColorStop(0.5, '#C8C2B6');
  pGrad.addColorStop(1, '#A39E92');
  ctx.fillStyle = pGrad;
  rRect(pX, pY, pW, pH, 8 * S); ctx.fill();
  ctx.strokeStyle = 'rgba(60,45,40,0.35)';
  ctx.lineWidth = 1.2 * S;
  rRect(pX, pY, pW, pH, 8 * S); ctx.stroke();

  // Mid divider lines (faint cross)
  ctx.strokeStyle = 'rgba(80,60,60,0.10)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath(); ctx.moveTo(pX + pW / 2, pY + 4 * S); ctx.lineTo(pX + pW / 2, pY + pH - 4 * S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pX + 4 * S, pY + pH / 2); ctx.lineTo(pX + pW - 4 * S, pY + pH / 2); ctx.stroke();

  // Flash overlay on counter change
  if (anchor.safeFlashT > 0) {
    ctx.save();
    ctx.globalAlpha = anchor.safeFlashT * 0.4;
    ctx.fillStyle = '#FFFFFF';
    rRect(pX, pY, pW, pH, 8 * S); ctx.fill();
    ctx.restore();
  }

  // Color chips with counts
  drawSafeChips(anchor, pX, pY, pW, pH);

  ctx.restore();
}

function chipSlotForIndex(idx, total) {
  // 2x2 grid placement based on total chip count
  if (total <= 2) {
    return idx === 0 ? { r: 0.5, c: 0 } : { r: 0.5, c: 1 };
  }
  if (total === 3) {
    if (idx === 0) return { r: 0, c: 0.5 };
    if (idx === 1) return { r: 1, c: 0 };
    return { r: 1, c: 1 };
  }
  // 4 reqs: full 2x2
  return [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }][idx];
}

function drawSafeChips(anchor, x, y, w, h) {
  var reqs = anchor.safeReqs || [];
  for (var i = 0; i < reqs.length && i < 4; i++) {
    var slot = chipSlotForIndex(i, reqs.length);
    var cx = x + (slot.c + 0.5) * (w / 2);
    var cy = y + (slot.r + 0.5) * (h / 2);
    var req = reqs[i];
    var c = COLORS[req.ci];
    var done = req.count <= 0;
    var chipS = Math.min(w, h) * 0.34;

    ctx.save();
    if (done) ctx.globalAlpha = 0.55;

    // Chip body (color swatch)
    var swX = cx - chipS * 0.65, swY = cy - chipS / 2;
    var sw = chipS * 0.95, sh = chipS;
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 3 * S;
    ctx.shadowOffsetY = 1.5 * S;
    var cg = ctx.createLinearGradient(swX, swY, swX, swY + sh);
    cg.addColorStop(0, c.light); cg.addColorStop(1, c.fill);
    ctx.fillStyle = cg;
    rRect(swX, swY, sw, sh, 5 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1.4 * S;
    rRect(swX, swY, sw, sh, 5 * S); ctx.stroke();
    // Tiny highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    rRect(swX + 2 * S, swY + 2 * S, sw - 4 * S, sh * 0.25, 3 * S); ctx.fill();

    // Count text to the right of the chip
    var label = done ? '✓' : String(req.count);
    var fontPx = Math.max(10, chipS * 0.72);
    ctx.fillStyle = '#3A3A3A';
    ctx.font = 'bold ' + fontPx + 'px Fredoka, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // Subtle white outline for legibility
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3 * S;
    ctx.strokeText(label, cx + chipS * 0.40, cy);
    ctx.fillText(label, cx + chipS * 0.40, cy);

    ctx.restore();
  }
}
