// ============================================================
// pin.js — Double-sided Pin mechanic
// A silver bar overlay covering 2 or 3 contiguous cells. Each
// end carries a circle that points at a "key" adjacent box.
// Play one key box → that end's circle is consumed but the
// bar stays in place. Play the second key → bar slides out
// and covered boxes become tappable.
// ============================================================

// pins[] is declared in config.js. Each pin:
//   {
//     cells:    [idx, idx, ...]   covered grid cells (2 or 3, contiguous)
//     orient:   'h' | 'v'
//     keyA:     grid idx for end-A key box
//     keyB:     grid idx for end-B key box
//     releasedA, releasedB: bool
//     sliding:  bool — slide-out animation active
//     slideT:   0..1 slide progress
//     done:     bool — pin can be reaped
//     spawnT:   0..1 spawn-in (small intro pop)
//     shakeT:   reject-shake timer
//     circleAT, circleBT: 0..1 end-release burst timers
//   }

function initPins(pinDefs) {
  pins = [];
  if (!pinDefs || !pinDefs.length) return;
  for (var i = 0; i < pinDefs.length; i++) {
    var p = pinDefs[i];
    if (!p.cells || p.cells.length < 2) continue;
    var orient = p.orient;
    if (!orient) {
      // Infer from cells[0] vs cells[1]
      orient = (Math.abs(p.cells[1] - p.cells[0]) === 1) ? 'h' : 'v';
    }
    pins.push({
      cells: p.cells.slice(),
      orient: orient,
      keyA: p.keyA,
      keyB: p.keyB,
      releasedA: false,
      releasedB: false,
      sliding: false,
      slideT: 0,
      done: false,
      spawnT: 1,
      shakeT: 0,
      circleAT: 0,
      circleBT: 0
    });
  }
}

function isCellPinned(cellIdx) {
  for (var i = 0; i < pins.length; i++) {
    var p = pins[i];
    if (p.done || p.sliding) continue;
    for (var c = 0; c < p.cells.length; c++) {
      if (p.cells[c] === cellIdx) return true;
    }
  }
  return false;
}

// Called when stock[boxIdx] just became used. Releases pin ends
// that point at this box. Triggers slide-out when both released.
function notifyPinsOfBoxUse(boxIdx) {
  for (var i = 0; i < pins.length; i++) {
    var p = pins[i];
    if (p.done || p.sliding) continue;
    var releasedThis = false;
    if (!p.releasedA && p.keyA === boxIdx) {
      p.releasedA = true;
      p.circleAT = 1;
      pinReleaseBurst(p, 0);
      releasedThis = true;
    }
    if (!p.releasedB && p.keyB === boxIdx) {
      p.releasedB = true;
      p.circleBT = 1;
      pinReleaseBurst(p, 1);
      releasedThis = true;
    }
    if (releasedThis) {
      if (typeof sfx !== 'undefined' && sfx.pinClink) sfx.pinClink();
    }
    if (p.releasedA && p.releasedB && !p.sliding) {
      p.sliding = true;
      p.slideT = 0;
      if (typeof sfx !== 'undefined' && sfx.pinSwoosh) sfx.pinSwoosh();
    }
  }
}

// Tap on a covered cell while pinned → reject-shake every pin
// that covers that cell.
function pinRejectShakeAt(cellIdx) {
  for (var i = 0; i < pins.length; i++) {
    var p = pins[i];
    if (p.done || p.sliding) continue;
    for (var c = 0; c < p.cells.length; c++) {
      if (p.cells[c] === cellIdx) { p.shakeT = 0.6; break; }
    }
  }
}

function updatePins() {
  var anyDone = false;
  for (var i = 0; i < pins.length; i++) {
    var p = pins[i];
    if (p.spawnT > 0) p.spawnT = Math.max(0, p.spawnT - 0.04);
    if (p.shakeT > 0) p.shakeT = Math.max(0, p.shakeT - 0.05);
    if (p.circleAT > 0) p.circleAT = Math.max(0, p.circleAT - 0.04);
    if (p.circleBT > 0) p.circleBT = Math.max(0, p.circleBT - 0.04);
    if (p.sliding && !p.done) {
      p.slideT += 0.04;
      if (p.slideT >= 1) {
        p.done = true;
        anyDone = true;
      }
    }
  }
  if (anyDone) {
    var fresh = [];
    for (var j = 0; j < pins.length; j++) if (!pins[j].done) fresh.push(pins[j]);
    pins = fresh;
    if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
  }
}

function pinReleaseBurst(p, endIdx) {
  var pos = pinEndCircleCenter(p, endIdx);
  for (var k = 0; k < 16; k++) {
    var a = Math.PI * 2 * Math.random();
    var sp = 1.4 + Math.random() * 3.2;
    particles.push({
      x: pos.x, y: pos.y,
      vx: Math.cos(a) * sp * S,
      vy: Math.sin(a) * sp * S - 0.8 * S,
      r: (1.2 + Math.random() * 2.4) * S,
      color: Math.random() > 0.5 ? 'rgba(245,248,255,0.95)' : 'rgba(180,195,215,0.85)',
      life: 0.9, decay: 0.03 + Math.random() * 0.02, grav: true
    });
  }
  // Soft glow ring particle
  particles.push({
    x: pos.x, y: pos.y, vx: 0, vy: 0,
    r: 8 * S, color: 'rgba(255,255,255,0.55)',
    life: 0.7, decay: 0.05, grav: false
  });
}

function pinBarBoundsRaw(p) {
  // Bar rect aligned to covered cells, with end-pad so circles sit at the cell centers.
  var first = stock[p.cells[0]];
  var last = stock[p.cells[p.cells.length - 1]];
  var x, y, w, h, thick;
  if (p.orient === 'h') {
    thick = L.bh * 0.48;
    x = first.x + L.bw * 0.10;
    y = first.y + (L.bh - thick) / 2;
    w = (last.x + L.bw - L.bw * 0.10) - x;
    h = thick;
  } else {
    thick = L.bw * 0.48;
    x = first.x + (L.bw - thick) / 2;
    y = first.y + L.bh * 0.10;
    w = thick;
    h = (last.y + L.bh - L.bh * 0.10) - y;
  }
  return { x: x, y: y, w: w, h: h };
}

function pinEndCircleCenter(p, endIdx) {
  // endIdx 0 = first cell side, 1 = last cell side
  var bar = pinBarBoundsRaw(p);
  var cx, cy, rad;
  if (p.orient === 'h') {
    rad = bar.h / 2;
    cx = (endIdx === 0) ? bar.x + rad : bar.x + bar.w - rad;
    cy = bar.y + rad;
  } else {
    rad = bar.w / 2;
    cx = bar.x + rad;
    cy = (endIdx === 0) ? bar.y + rad : bar.y + bar.h - rad;
  }
  return { x: cx, y: cy, r: rad };
}

function drawPins() {
  if (!pins || !pins.length) return;
  for (var i = 0; i < pins.length; i++) drawPin(pins[i]);
}

function drawPin(p) {
  var bar = pinBarBoundsRaw(p);

  var alpha = 1;
  var slideOffX = 0, slideOffY = 0;
  if (p.sliding) {
    // Ease-in cubic for the slide-out push
    var t = p.slideT;
    var eased = t * t * t;
    alpha = Math.max(0, 1 - t * 1.05);
    var push = eased * Math.max(bar.w, bar.h) * 1.4;
    if (p.orient === 'h') slideOffX = push;
    else slideOffY = push;
  }
  var shakeOff = 0;
  if (p.shakeT > 0) shakeOff = Math.sin(p.shakeT * 38) * 4 * S * p.shakeT;
  var spawnScale = 1;
  if (p.spawnT > 0) {
    var st = 1 - p.spawnT;
    spawnScale = 0.7 + 0.3 * (st < 0.5 ? 4 * st * st * st : 1 - Math.pow(-2 * st + 2, 3) / 2);
    alpha *= Math.min(1, st * 2);
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  var cx = bar.x + bar.w / 2 + slideOffX + (p.orient === 'v' ? shakeOff : 0);
  var cy = bar.y + bar.h / 2 + slideOffY + (p.orient === 'h' ? shakeOff : 0);
  ctx.translate(cx, cy);
  ctx.scale(spawnScale, spawnScale);
  ctx.translate(-bar.w / 2, -bar.h / 2);

  var x = 0, y = 0, w = bar.w, h = bar.h;

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 7 * S;
  ctx.shadowOffsetY = 3 * S;

  // Body silver gradient (perpendicular to long axis)
  var bodyGrad;
  if (p.orient === 'h') {
    bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
  } else {
    bodyGrad = ctx.createLinearGradient(x, y, x + w, y);
  }
  bodyGrad.addColorStop(0, '#F4F6FA');
  bodyGrad.addColorStop(0.35, '#CCD2DB');
  bodyGrad.addColorStop(0.55, '#A6AEB9');
  bodyGrad.addColorStop(1, '#6A7280');
  ctx.fillStyle = bodyGrad;
  var r = Math.min(w, h) / 2;
  rRect(x, y, w, h, r); ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Sheen highlight along the upper/inner half
  ctx.save();
  ctx.beginPath(); rRect(x, y, w, h, r); ctx.clip();
  var sheen;
  if (p.orient === 'h') {
    sheen = ctx.createLinearGradient(x, y, x, y + h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.55)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, h * 0.55);
  } else {
    sheen = ctx.createLinearGradient(x, y, x + w, y);
    sheen.addColorStop(0, 'rgba(255,255,255,0.55)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w * 0.55, h);
  }
  ctx.restore();

  // Outline
  ctx.strokeStyle = 'rgba(50,60,72,0.55)';
  ctx.lineWidth = 1.4 * S;
  rRect(x, y, w, h, r); ctx.stroke();

  // Segment-divider tick marks where cells join (so 3-pin reads as
  // three covered cells, not one long bar)
  ctx.strokeStyle = 'rgba(60,70,84,0.45)';
  ctx.lineWidth = 1 * S;
  for (var seg = 1; seg < p.cells.length; seg++) {
    var prev = stock[p.cells[seg - 1]];
    var cur = stock[p.cells[seg]];
    if (p.orient === 'h') {
      var mx = (prev.x + L.bw + cur.x) / 2 - bar.x;
      ctx.beginPath();
      ctx.moveTo(mx, h * 0.22);
      ctx.lineTo(mx, h * 0.78);
      ctx.stroke();
    } else {
      var my = (prev.y + L.bh + cur.y) / 2 - bar.y;
      ctx.beginPath();
      ctx.moveTo(w * 0.22, my);
      ctx.lineTo(w * 0.78, my);
      ctx.stroke();
    }
  }

  // End circles (translate back to absolute for arrows that point at
  // key cells)
  drawPinEnd(p, 0, x, y, w, h);
  drawPinEnd(p, 1, x, y, w, h);

  ctx.restore();

  // Pointer arrows from the end circles toward the key cells. Drawn
  // outside the bar's transform so they sit in canvas space and don't
  // slide with the bar.
  if (!p.sliding) {
    drawPinArrow(p, 0);
    drawPinArrow(p, 1);
  }
}

function drawPinEnd(p, endIdx, x, y, w, h) {
  var released = (endIdx === 0) ? p.releasedA : p.releasedB;
  var burstT = (endIdx === 0) ? p.circleAT : p.circleBT;
  var cx, cy, rad;
  if (p.orient === 'h') {
    rad = h / 2;
    cx = (endIdx === 0) ? x + rad : x + w - rad;
    cy = y + rad;
  } else {
    rad = w / 2;
    cx = x + rad;
    cy = (endIdx === 0) ? y + rad : y + h - rad;
  }

  if (!released) {
    // Bright silver puck
    var g = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.35, rad * 0.1, cx, cy, rad);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.45, '#E6EBF2');
    g.addColorStop(1, '#8E96A2');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rad * 0.92, 0, Math.PI * 2); ctx.fill();

    // Rim
    ctx.strokeStyle = 'rgba(58,68,82,0.65)';
    ctx.lineWidth = 1.3 * S;
    ctx.beginPath(); ctx.arc(cx, cy, rad * 0.92, 0, Math.PI * 2); ctx.stroke();

    // Inner ring
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(cx, cy, rad * 0.6, 0, Math.PI * 2); ctx.stroke();

    // Hot spot
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(cx - rad * 0.32, cy - rad * 0.32, rad * 0.22, 0, Math.PI * 2); ctx.fill();
  } else {
    // Released: dark recessed socket
    var sg = ctx.createRadialGradient(cx, cy + rad * 0.15, rad * 0.05, cx, cy, rad * 0.85);
    sg.addColorStop(0, 'rgba(28,34,44,0.92)');
    sg.addColorStop(0.7, 'rgba(72,82,96,0.55)');
    sg.addColorStop(1, 'rgba(140,148,160,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(cx, cy, rad * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,48,60,0.65)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(cx, cy, rad * 0.7, 0, Math.PI * 2); ctx.stroke();

    if (burstT > 0) {
      ctx.save();
      ctx.globalAlpha = burstT * 0.8;
      ctx.strokeStyle = 'rgba(245,250,255,0.95)';
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * (1.0 + (1 - burstT) * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawPinArrow(p, endIdx) {
  var released = (endIdx === 0) ? p.releasedA : p.releasedB;
  if (released) return;
  var keyIdx = (endIdx === 0) ? p.keyA : p.keyB;
  if (keyIdx == null || keyIdx < 0 || keyIdx >= stock.length) return;
  var keyBox = stock[keyIdx];
  if (!keyBox) return;

  var endPos = pinEndCircleCenter(p, endIdx);
  var keyCx = keyBox.x + L.bw / 2;
  var keyCy = keyBox.y + L.bh / 2;
  var dx = keyCx - endPos.x, dy = keyCy - endPos.y;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  var nx = dx / len, ny = dy / len;

  // Tail at edge of circle, head a bit inside the key cell border
  var startX = endPos.x + nx * (endPos.r + 2 * S);
  var startY = endPos.y + ny * (endPos.r + 2 * S);
  var endX = keyCx - nx * (L.bw * 0.42);
  var endY = keyCy - ny * (L.bh * 0.42);

  ctx.save();
  // pulse the alpha softly so it reads as a "linked" cue
  var pulse = 0.55 + Math.sin(tick * 0.10 + endIdx * 1.7) * 0.18;
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = '#B8C0CC';
  ctx.lineWidth = 2.2 * S;
  ctx.setLineDash([4 * S, 4 * S]);
  ctx.lineDashOffset = -tick * 0.35;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow head
  ctx.fillStyle = '#D4DAE2';
  var hs = 5 * S;
  var px = -ny, py = nx;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - nx * hs * 1.6 + px * hs * 0.9, endY - ny * hs * 1.6 + py * hs * 0.9);
  ctx.lineTo(endX - nx * hs * 1.6 - px * hs * 0.9, endY - ny * hs * 1.6 - py * hs * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(50,60,72,0.6)';
  ctx.lineWidth = 1 * S;
  ctx.stroke();

  ctx.restore();
}

// ── Editor helpers (also used at level export time) ──

// Validate a candidate pin: cells are in-grid, contiguous, same row
// or column, and each end has at least one valid key candidate.
function pinValidateCells(cells, cols, rows) {
  if (!cells || cells.length < 2 || cells.length > 3) return false;
  var rowsArr = []; var colsArr = [];
  for (var i = 0; i < cells.length; i++) {
    if (cells[i] < 0 || cells[i] >= cols * rows) return false;
    rowsArr.push(Math.floor(cells[i] / cols));
    colsArr.push(cells[i] % cols);
  }
  var sameRow = rowsArr.every(function (r) { return r === rowsArr[0]; });
  var sameCol = colsArr.every(function (c) { return c === colsArr[0]; });
  if (!sameRow && !sameCol) return false;
  var sorted = cells.slice().sort(function (a, b) { return a - b; });
  for (var k = 1; k < sorted.length; k++) {
    var step = sameRow ? 1 : cols;
    if (sorted[k] - sorted[k - 1] !== step) return false;
  }
  return true;
}

function pinEndpointNeighbors(cellIdx, orient, cols, rows, excludeSet) {
  // Cardinal neighbors of cellIdx that are not in the pin's own cells.
  var row = Math.floor(cellIdx / cols), col = cellIdx % cols;
  var cands = [];
  if (row > 0)        cands.push((row - 1) * cols + col);
  if (row < rows - 1) cands.push((row + 1) * cols + col);
  if (col > 0)        cands.push(row * cols + (col - 1));
  if (col < cols - 1) cands.push(row * cols + (col + 1));
  var out = [];
  for (var i = 0; i < cands.length; i++) {
    if (excludeSet.indexOf(cands[i]) < 0) out.push(cands[i]);
  }
  return out;
}
