// ============================================================
// unfriendly.js — Unfriendly customer (tray) mechanic
//
// An unfriendly tray accepts marbles temporarily. After collecting
// UNFRIENDLY_CAP (9) marbles of its target color, it returns them
// all as a default box flung back into a random empty grid cell,
// then becomes a regular tray that completes after SORT_CAP (3)
// more marbles.
//
// Editor toggle: per sort column. In a toggled column, every 5th
// tray (indices 0, 5, 10, ...) starts unfriendly.
// ============================================================

var UNFRIENDLY_CAP = 9;
var flyingBoxes = []; // { fromX, fromY, toX, toY, toIdx, ci, t, rot, rotV, trayRef }

// Mark every 5th tray in toggled columns as unfriendly. Called from
// initGame() AFTER sortCols has been built and any lock buttons inserted.
function applyUnfriendlyMarkers(unfriendlyCols) {
  if (!unfriendlyCols) return;
  for (var c = 0; c < 4; c++) {
    if (!unfriendlyCols[c]) continue;
    var col = sortCols[c];
    for (var r = 0; r < col.length; r += 5) {
      var t = col[r];
      if (!t || t.type === 'lock') continue;
      t.unfriendly = true;
      t.collected = 0;
      t.returning = false;
      t.shakeT = 0;
    }
  }
}

function pickRandomEmptyStockIndex() {
  var empties = [];
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (s && s.empty && !s.isWall && !s.isTunnel) empties.push(i);
  }
  if (empties.length === 0) return -1;
  return empties[Math.floor(Math.random() * empties.length)];
}

// Spit the 9 collected marbles back into the grid as a default box.
// Called when an unfriendly tray reaches UNFRIENDLY_CAP.
function triggerUnfriendlyReturn(tray, colIdx) {
  if (tray.returning) return;
  tray.returning = true;
  tray.shakeT = 1.0;
  // Source position: top visible slot of the column.
  var sx = L.sSx + colIdx * (L.sBw + L.sColGap) + L.sBw / 2;
  var sy = getSortBoxY(colIdx, 0) + L.sBh / 2;
  var toIdx = pickRandomEmptyStockIndex();
  var tx, ty;
  if (toIdx >= 0) {
    var box = stock[toIdx];
    tx = box.x + L.bw / 2;
    ty = box.y + L.bh / 2;
  } else {
    // Grid full — aim at funnel as a fallback target.
    tx = L.beltCx; ty = L.beltTopY - 40 * S;
  }
  flyingBoxes.push({
    fromX: sx, fromY: sy, toX: tx, toY: ty, toIdx: toIdx,
    ci: tray.ci, t: 0, rot: 0, rotV: (Math.random() - 0.5) * 0.3,
    trayRef: tray
  });
  if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();
  // Burst at the tray to sell the rejection.
  spawnBurst(sx, sy, COLORS[tray.ci].light, 16);
}

function updateFlyingBoxes() {
  for (var i = flyingBoxes.length - 1; i >= 0; i--) {
    var f = flyingBoxes[i];
    f.t += 0.022;
    f.rot += f.rotV;
    // Particle trail along the arc.
    if (tick % 2 === 0 && f.t < 1) {
      var e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
      var px = f.fromX + (f.toX - f.fromX) * e;
      var py = f.fromY + (f.toY - f.fromY) * e - Math.sin(f.t * Math.PI) * 140 * S;
      particles.push({
        x: px, y: py,
        vx: (Math.random() - 0.5) * 0.6 * S, vy: (Math.random() - 0.5) * 0.6 * S,
        r: (2.5 + Math.random() * 2) * S, color: COLORS[f.ci].light,
        life: 0.55, decay: 0.04, grav: false
      });
    }
    if (f.t >= 1) {
      landFlyingBox(f);
      flyingBoxes.splice(i, 1);
    }
  }
}

function landFlyingBox(f) {
  var idx = f.toIdx;
  if (idx < 0 || !stock[idx] || !stock[idx].empty) {
    // Original target gone — try another empty slot.
    idx = pickRandomEmptyStockIndex();
  }
  if (idx < 0) {
    // Grid is full. Bail out — just reset the tray to its regular state.
    resetTrayAfterReturn(f.trayRef);
    return;
  }
  var box = stock[idx];
  box.empty = false;
  box.used = false;
  box.ci = f.ci;
  box.boxType = 'default';
  box.remaining = MRB_PER_BOX;
  box.revealed = false;
  box.revealT = 0;
  box.popT = 1;
  box.shakeT = 0.6;
  box.spawning = false;
  box.spawnIdx = 0;
  box.iceHP = 0;
  box.iceCrackT = 0;
  box.iceShatterT = 0;
  box.blockerCount = 0;
  box.idlePhase = Math.random() * Math.PI * 2;
  box.emptyT = 0;
  // Landing burst.
  var bx = box.x + L.bw / 2, by = box.y + L.bh / 2;
  spawnBurst(bx, by, COLORS[f.ci].fill, 24);
  if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
  // Re-evaluate which boxes have a path to the bottom.
  updateBoxReveals(true);
  resetTrayAfterReturn(f.trayRef);
}

function resetTrayAfterReturn(tray) {
  tray.unfriendly = false;
  tray.returning = false;
  tray.collected = 0;
  tray.filled = 0;
  tray.popT = 1;
  tray.shineT = 1;
}

function drawFlyingBoxes() {
  for (var i = 0; i < flyingBoxes.length; i++) {
    var f = flyingBoxes[i];
    var t = f.t;
    var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    var x = f.fromX + (f.toX - f.fromX) * e;
    var y = f.fromY + (f.toY - f.fromY) * e - Math.sin(t * Math.PI) * 140 * S;
    var size = 38 * S;
    var c = COLORS[f.ci];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(f.rot);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 4 * S;
    var grad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.fill);
    ctx.fillStyle = grad;
    rRect(-size / 2, -size / 2, size, size, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 2 * S;
    rRect(-size / 2, -size / 2, size, size, 6 * S); ctx.stroke();
    // little marble dot in the center to imply contents
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(-size * 0.18, -size * 0.18, size * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Draw jagged "thorny" border + big counter on the unfriendly tray.
// Called from drawSortArea AFTER the normal tray bg has been drawn,
// with the canvas transform already translated to the tray's center
// and scaled. Width/height of tray are L.sBw / L.sBh.
function drawUnfriendlyTrayOverlay(b) {
  var w = L.sBw, h = L.sBh;
  var tooth = Math.max(4 * S, h * 0.16);
  var teethH = Math.max(3, Math.round(w / (tooth * 1.5)));
  var teethV = Math.max(2, Math.round(h / (tooth * 1.5)));
  ctx.save();
  ctx.fillStyle = '#1A1A1A';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1 * S;
  ctx.lineJoin = 'miter';

  // Top teeth
  for (var i = 0; i < teethH; i++) {
    var cx = -w / 2 + (i + 0.5) * (w / teethH);
    ctx.beginPath();
    ctx.moveTo(cx - tooth * 0.65, -h / 2 + 1);
    ctx.lineTo(cx, -h / 2 - tooth * 1.4);
    ctx.lineTo(cx + tooth * 0.65, -h / 2 + 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Bottom teeth
  for (var i = 0; i < teethH; i++) {
    var cx = -w / 2 + (i + 0.5) * (w / teethH);
    ctx.beginPath();
    ctx.moveTo(cx - tooth * 0.65, h / 2 - 1);
    ctx.lineTo(cx, h / 2 + tooth * 1.4);
    ctx.lineTo(cx + tooth * 0.65, h / 2 - 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Left teeth
  for (var i = 0; i < teethV; i++) {
    var cy = -h / 2 + (i + 0.5) * (h / teethV);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 1, cy - tooth * 0.65);
    ctx.lineTo(-w / 2 - tooth * 1.4, cy);
    ctx.lineTo(-w / 2 + 1, cy + tooth * 0.65);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Right teeth
  for (var i = 0; i < teethV; i++) {
    var cy = -h / 2 + (i + 0.5) * (h / teethV);
    ctx.beginPath();
    ctx.moveTo(w / 2 - 1, cy - tooth * 0.65);
    ctx.lineTo(w / 2 + tooth * 1.4, cy);
    ctx.lineTo(w / 2 - 1, cy + tooth * 0.65);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // Inner dark stroke around the tray to read as "mean".
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2 * S;
  rRect(-w / 2, -h / 2, w, h, 8 * S);
  ctx.stroke();

  // Big counter centered.
  var label = (b.collected || 0) + '/' + UNFRIENDLY_CAP;
  var fontPx = Math.floor(h * 0.6);
  ctx.font = 'bold ' + fontPx + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(label, 2 * S, 2 * S);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, 0, 0);
  ctx.restore();
}
