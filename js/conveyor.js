// ============================================================
// conveyor.js — Conveyor lane mechanic
// Some grid rows are "conveyor lanes" with a direction (left/right).
// Whenever a box is tapped open, every conveyor row shifts one slot
// in its direction. Cells wrap around at the edges. Sliding cells
// animate from old position; wrapped cells fade in at the new edge.
// ============================================================

var conveyorRows = [];        // length L.rows: 'left' | 'right' | null
var conveyorFlashRows = [];   // per-row flash timer (0..1) when shifted

function initConveyorRows(rows) {
  conveyorRows = [];
  conveyorFlashRows = [];
  var nRows = (L && L.rows) ? L.rows : 7;
  for (var r = 0; r < nRows; r++) {
    var v = rows && rows[r];
    conveyorRows.push((v === 'left' || v === 'right') ? v : null);
    conveyorFlashRows.push(0);
  }
  if (stock && stock.length) {
    for (var i = 0; i < stock.length; i++) {
      stock[i].slideX = 0;
      stock[i].wrapFadeT = 0;
    }
  }
}

function isConveyorRow(r) {
  return !!(conveyorRows && conveyorRows[r]);
}

function getConveyorDir(r) {
  return (conveyorRows && conveyorRows[r]) || null;
}

function triggerConveyorShift() {
  if (!conveyorRows || conveyorRows.length === 0) return;
  if (!stock || stock.length === 0) return;
  if (!L || !L.rows || !L.cols) return;
  var anyShifted = false;
  var slideStep = L.bw + L.bg;
  for (var r = 0; r < L.rows; r++) {
    var dir = conveyorRows[r];
    if (!dir) continue;
    var rowStart = r * L.cols;
    var rowCells = [];
    for (var c = 0; c < L.cols; c++) rowCells.push(stock[rowStart + c]);
    var shifted;
    if (dir === 'right') {
      shifted = [rowCells[L.cols - 1]].concat(rowCells.slice(0, L.cols - 1));
    } else {
      shifted = rowCells.slice(1).concat([rowCells[0]]);
    }
    for (var c2 = 0; c2 < L.cols; c2++) {
      var b = shifted[c2];
      var wrapped = (dir === 'right' && c2 === 0) || (dir === 'left' && c2 === L.cols - 1);
      if (wrapped) {
        b.slideX = 0;
        b.wrapFadeT = 1.0;
      } else {
        b.slideX = (dir === 'right' ? -slideStep : slideStep);
        b.wrapFadeT = 0;
      }
      stock[rowStart + c2] = b;
    }
    anyShifted = true;
    conveyorFlashRows[r] = 1.0;
  }
  if (!anyShifted) return;
  updateStockPositions();
  updateBoxReveals(true);
  conveyorClickSound();
}

function conveyorClickSound() {
  if (!audioCtx) return;
  try {
    tone(440, 0.05, 'square', 0.04, 360);
    setTimeout(function () { tone(360, 0.04, 'square', 0.03, 280); }, 55);
  } catch (e) { /* ignore */ }
}

function updateConveyorAnim() {
  if (!stock || stock.length === 0) return;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.slideX) {
      b.slideX *= 0.74;
      if (Math.abs(b.slideX) < 0.5) b.slideX = 0;
    }
    if (b.wrapFadeT > 0) {
      b.wrapFadeT = Math.max(0, b.wrapFadeT - 0.06);
    }
  }
  if (conveyorFlashRows && conveyorFlashRows.length) {
    for (var r = 0; r < conveyorFlashRows.length; r++) {
      if (conveyorFlashRows[r] > 0) {
        conveyorFlashRows[r] = Math.max(0, conveyorFlashRows[r] - 0.025);
      }
    }
  }
}

function drawConveyorBackgrounds() {
  if (!conveyorRows || conveyorRows.length === 0) return;
  if (!L || !L.rows || !L.cols) return;
  var rowW = L.cols * L.bw + (L.cols - 1) * L.bg;
  var pad = Math.max(2 * S, L.bg * 0.5);
  for (var r = 0; r < L.rows; r++) {
    var dir = conveyorRows[r];
    if (!dir) continue;
    var bx = L.sx;
    var by = L.sy + r * (L.bh + L.bg);
    var flash = conveyorFlashRows[r] || 0;

    ctx.save();

    // Tinted track
    var alpha = 0.12 + flash * 0.22;
    ctx.fillStyle = 'rgba(232,148,60,' + alpha + ')';
    rRect(bx - pad, by - pad, rowW + pad * 2, L.bh + pad * 2, 6 * S);
    ctx.fill();

    // Diagonal moving stripes
    ctx.save();
    ctx.beginPath();
    rRect(bx - pad, by - pad, rowW + pad * 2, L.bh + pad * 2, 6 * S);
    ctx.clip();
    var stripeW = 14 * S;
    var dirSign = (dir === 'right') ? 1 : -1;
    var off = (tick * 0.6 * dirSign) % (stripeW * 2);
    ctx.strokeStyle = 'rgba(184,100,40,0.20)';
    ctx.lineWidth = stripeW * 0.55;
    var startX = bx - pad - L.bh - stripeW * 2;
    var endX = bx + rowW + pad + L.bh + stripeW * 2;
    for (var sx = startX; sx < endX; sx += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(sx + off, by - pad);
      ctx.lineTo(sx + off - L.bh - pad * 2, by + L.bh + pad);
      ctx.stroke();
    }
    ctx.restore();

    // Border outline
    ctx.strokeStyle = 'rgba(184,100,40,' + (0.35 + flash * 0.3) + ')';
    ctx.lineWidth = 1.5 * S;
    rRect(bx - pad, by - pad, rowW + pad * 2, L.bh + pad * 2, 6 * S);
    ctx.stroke();

    // Direction arrow on the leading edge of the row
    var arrowSize = Math.min(L.bh * 0.32, 14 * S);
    var ay = by + L.bh / 2;
    var ax;
    if (dir === 'right') {
      ax = bx + rowW + pad + arrowSize * 0.9;
    } else {
      ax = bx - pad - arrowSize * 0.9;
    }
    drawConveyorArrow(ax, ay, arrowSize, dir, flash);

    ctx.restore();
  }
}

function drawConveyorArrow(cx, cy, size, dir, flash) {
  ctx.save();
  ctx.fillStyle = 'rgba(232,148,60,' + (0.85 + flash * 0.15) + ')';
  ctx.shadowColor = 'rgba(232,148,60,' + (flash * 0.6) + ')';
  ctx.shadowBlur = 8 * S * flash;
  ctx.beginPath();
  if (dir === 'right') {
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.95, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx + size * 0.25, cy);
  } else {
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx - size * 0.95, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size * 0.25, cy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
