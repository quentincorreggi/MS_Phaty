// ============================================================
// pillar.js — Ice Pillar mechanic
// A slab of ice that covers an entire row or column.
// Adjacent box taps retract the pillar one cell at a time.
// ============================================================

var icePillars = [];

// ── Init from level data ──
function initPillars(lvl) {
  icePillars = [];
  if (!lvl.pillars) return;
  for (var i = 0; i < lvl.pillars.length; i++) {
    var p = lvl.pillars[i];
    icePillars.push({
      dir: p.dir || 'horizontal',
      index: p.index !== undefined ? p.index : 0,
      retracted: 0,
      slideT: 0
    });
  }
}

// ── Query: is a grid cell covered by any pillar? Returns pillar index or -1 ──
function isCellCoveredByAnyPillar(idx) {
  var row = Math.floor(idx / L.cols);
  var col = idx % L.cols;
  for (var p = 0; p < icePillars.length; p++) {
    var pil = icePillars[p];
    var maxCells = pil.dir === 'horizontal' ? L.cols : L.rows;
    if (pil.retracted >= maxCells) continue;
    if (pil.dir === 'horizontal') {
      if (row === pil.index && col <= L.cols - 1 - pil.retracted) return p;
    } else {
      if (col === pil.index && row <= L.rows - 1 - pil.retracted) return p;
    }
  }
  return -1;
}

// ── Query: is a specific cell covered by a specific pillar? ──
function isCellCoveredByPillar(pil, idx) {
  var row = Math.floor(idx / L.cols);
  var col = idx % L.cols;
  var maxCells = pil.dir === 'horizontal' ? L.cols : L.rows;
  if (pil.retracted >= maxCells) return false;
  if (pil.dir === 'horizontal') {
    return row === pil.index && col <= L.cols - 1 - pil.retracted;
  } else {
    return col === pil.index && row <= L.rows - 1 - pil.retracted;
  }
}

// ── After tapping a box, retract any adjacent pillars ──
function retractAdjacentPillars(idx) {
  for (var p = 0; p < icePillars.length; p++) {
    var pil = icePillars[p];
    var maxCells = pil.dir === 'horizontal' ? L.cols : L.rows;
    if (pil.retracted >= maxCells) continue;
    if (pil.slideT > 0.3) continue; // still animating

    if (isPillarAdjacentToCell(pil, idx)) {
      pil.retracted++;
      pil.slideT = 1.0;

      // Ice crack particles at the revealed edge
      var uncIdx = getPillarUncoveredCell(pil);
      if (uncIdx >= 0 && stock[uncIdx]) {
        var bx = stock[uncIdx].x + L.bw / 2;
        var by = stock[uncIdx].y + L.bh / 2;
        for (var pp = 0; pp < 14; pp++) {
          var a = Math.PI * 2 * pp / 14 + Math.random() * 0.3;
          var sp = 2 + Math.random() * 4;
          particles.push({
            x: bx, y: by,
            vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
            r: (1.5 + Math.random() * 3) * S,
            color: Math.random() > 0.4 ? 'rgba(180,225,255,0.85)' : 'rgba(220,240,255,0.9)',
            life: 0.9, decay: 0.025 + Math.random() * 0.02, grav: true
          });
        }
        sfx.pop();
      }

      // Reveal the uncovered cell after a short delay (let animation play)
      (function(pillar) {
        setTimeout(function() {
          revealPillarUncoveredCell(pillar);
        }, 150);
      })(pil);
    }
  }
}

// ── Check if a cell (the tapped box) is adjacent to any covered cell of a pillar ──
function isPillarAdjacentToCell(pil, idx) {
  var row = Math.floor(idx / L.cols);
  var col = idx % L.cols;

  // Cell must NOT be covered itself
  if (isCellCoveredByPillar(pil, idx)) return false;

  // Check 4 neighbors
  var neighbors = [];
  if (row > 0) neighbors.push((row - 1) * L.cols + col);
  if (row < L.rows - 1) neighbors.push((row + 1) * L.cols + col);
  if (col > 0) neighbors.push(row * L.cols + (col - 1));
  if (col < L.cols - 1) neighbors.push(row * L.cols + (col + 1));

  for (var n = 0; n < neighbors.length; n++) {
    if (isCellCoveredByPillar(pil, neighbors[n])) return true;
  }
  return false;
}

// ── Get the cell that was just uncovered (the one at the retreating edge) ──
function getPillarUncoveredCell(pil) {
  if (pil.dir === 'horizontal') {
    var revealedCol = L.cols - pil.retracted;
    if (revealedCol < 0 || revealedCol >= L.cols) return -1;
    return pil.index * L.cols + revealedCol;
  } else {
    var revealedRow = L.rows - pil.retracted;
    if (revealedRow < 0 || revealedRow >= L.rows) return -1;
    return revealedRow * L.cols + pil.index;
  }
}

// ── Reveal the newly uncovered cell with proper state logic ──
function revealPillarUncoveredCell(pil) {
  var idx = getPillarUncoveredCell(pil);
  if (idx < 0) return;
  var b = stock[idx];
  if (!b || b.isTunnel || b.isWall) return;

  // If the cell is empty or used, trigger reveal propagation
  if (b.empty || b.used) {
    _revealVisited = {};
    revealAroundEmptyCell(idx);
    return;
  }

  // If the box is already revealed (e.g. ice box), nothing to do
  if (b.revealed) return;

  // Check if this box should be revealed (adjacent to a truly empty cell)
  var row = Math.floor(idx / L.cols);
  var col = idx % L.cols;
  var neighbors = [];
  if (row > 0) neighbors.push((row - 1) * L.cols + col);
  if (row < L.rows - 1) neighbors.push((row + 1) * L.cols + col);
  if (col > 0) neighbors.push(row * L.cols + (col - 1));
  if (col < L.cols - 1) neighbors.push(row * L.cols + (col + 1));

  var shouldReveal = false;
  for (var ni = 0; ni < neighbors.length; ni++) {
    if (isCellTrulyEmpty(neighbors[ni])) { shouldReveal = true; break; }
  }

  if (shouldReveal) {
    b.revealed = true;
    b.revealT = 1.0;
    var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
    var burstColor = (b.boxType === 'hidden') ? '#FFD700' : COLORS[b.ci].fill;
    for (var p = 0; p < 12; p++) {
      var a = Math.PI * 2 * p / 12 + Math.random() * 0.3;
      var sp = 3 + Math.random() * 4;
      particles.push({
        x: bx, y: by,
        vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
        r: (2 + Math.random() * 4) * S,
        color: burstColor, life: 1, decay: 0.02 + Math.random() * 0.015, grav: false
      });
    }
    sfx.pop();
  }
}

// ── Update pillar animations each frame ──
function updatePillars() {
  for (var p = 0; p < icePillars.length; p++) {
    if (icePillars[p].slideT > 0) {
      icePillars[p].slideT = Math.max(0, icePillars[p].slideT - 0.055);
    }
  }
}

// ── Draw all pillars on top of the stock grid ──
function drawPillars() {
  for (var p = 0; p < icePillars.length; p++) {
    var pil = icePillars[p];
    var maxCells = pil.dir === 'horizontal' ? L.cols : L.rows;
    if (pil.retracted >= maxCells) continue;

    var coveredCount = maxCells - pil.retracted;
    var cellW = L.bw + L.bg;
    var cellH = L.bh + L.bg;

    // Slide animation offset (pillar sliding toward device)
    var animOffset = 0;
    if (pil.slideT > 0) {
      var t = 1 - pil.slideT;
      var ease = t * (2 - t);
      var step = pil.dir === 'horizontal' ? cellW : cellH;
      animOffset = (1 - ease) * step;
    }

    ctx.save();

    if (pil.dir === 'horizontal') {
      var row = pil.index;
      var firstCell = stock[row * L.cols];
      var lastCol = coveredCount - 1;
      var lastCell = stock[row * L.cols + lastCol];

      var sx = firstCell.x - L.bg / 2;
      var sy = firstCell.y - L.bg / 2;
      var sw = (lastCell.x + L.bw) - firstCell.x + L.bg + animOffset;
      var sh = L.bh + L.bg;

      // Device on the left
      drawPillarDevice(sx - 16 * S, sy - 2 * S, 16 * S, sh + 4 * S, 'horizontal');

      // Ice slab
      drawIceSlab(sx, sy, sw, sh, 'horizontal');

    } else {
      var col = pil.index;
      var firstCell = stock[col];
      var lastRow = coveredCount - 1;
      var lastCell = stock[lastRow * L.cols + col];

      var sx = firstCell.x - L.bg / 2;
      var sy = firstCell.y - L.bg / 2;
      var sw = L.bw + L.bg;
      var sh = (lastCell.y + L.bh) - firstCell.y + L.bg + animOffset;

      // Device on top
      drawPillarDevice(sx - 2 * S, sy - 16 * S, sw + 4 * S, 16 * S, 'vertical');

      // Ice slab
      drawIceSlab(sx, sy, sw, sh, 'vertical');
    }

    ctx.restore();
  }
}

// ── Draw the device that the pillar extends from ──
function drawPillarDevice(x, y, w, h, dir) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 6 * S;

  var grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#3A5D6C');
  grad.addColorStop(0.5, '#4A6D7C');
  grad.addColorStop(1, '#3A5D6C');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 4 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Border
  ctx.strokeStyle = '#2A4D5C';
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 4 * S);
  ctx.stroke();

  // Opening slit
  ctx.fillStyle = '#2A4D5C';
  if (dir === 'horizontal') {
    rRect(x + w - 3 * S, y + h * 0.15, 3 * S, h * 0.7, 1.5 * S);
    ctx.fill();
  } else {
    rRect(x + w * 0.15, y + h - 3 * S, w * 0.7, 3 * S, 1.5 * S);
    ctx.fill();
  }

  // Metallic highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  if (dir === 'horizontal') {
    rRect(x + 2 * S, y + 2 * S, w * 0.3, h - 4 * S, 3 * S);
  } else {
    rRect(x + 2 * S, y + 2 * S, w - 4 * S, h * 0.3, 3 * S);
  }
  ctx.fill();

  ctx.restore();
}

// ── Draw the ice slab itself ──
function drawIceSlab(x, y, w, h, dir) {
  ctx.save();

  // Main ice body
  var grad;
  if (dir === 'horizontal') {
    grad = ctx.createLinearGradient(x, y, x, y + h);
  } else {
    grad = ctx.createLinearGradient(x, y, x + w, y);
  }
  grad.addColorStop(0, 'rgba(126,200,227,0.93)');
  grad.addColorStop(0.5, 'rgba(165,225,242,0.90)');
  grad.addColorStop(1, 'rgba(100,180,210,0.93)');

  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8 * S;
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 6 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Clip for inner details
  ctx.save();
  ctx.beginPath();
  rRect(x, y, w, h, 6 * S);
  ctx.clip();

  // Ice surface texture — frost streaks
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5 * S;
  if (dir === 'horizontal') {
    for (var sy2 = y + 4 * S; sy2 < y + h; sy2 += 7 * S) {
      ctx.beginPath();
      ctx.moveTo(x + 2 * S, sy2 + Math.sin(tick * 0.02 + sy2 * 0.1) * 1.5 * S);
      ctx.lineTo(x + w - 2 * S, sy2 + Math.sin(tick * 0.02 + sy2 * 0.1 + 1) * 1.5 * S);
      ctx.stroke();
    }
  } else {
    for (var sx2 = x + 4 * S; sx2 < x + w; sx2 += 7 * S) {
      ctx.beginPath();
      ctx.moveTo(sx2 + Math.sin(tick * 0.02 + sx2 * 0.1) * 1.5 * S, y + 2 * S);
      ctx.lineTo(sx2 + Math.sin(tick * 0.02 + sx2 * 0.1 + 1) * 1.5 * S, y + h - 2 * S);
      ctx.stroke();
    }
  }

  // Crystal sparkles
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  var sparkCount = Math.max(3, Math.floor((w + h) / (20 * S)));
  for (var sp = 0; sp < sparkCount; sp++) {
    var phase = tick * 0.04 + sp * 2.1;
    var sparkAlpha = Math.max(0, Math.sin(phase) * 0.5 + 0.2);
    ctx.globalAlpha = sparkAlpha;
    var sparkX, sparkY;
    if (dir === 'horizontal') {
      sparkX = x + ((sp * 137.5) % w);
      sparkY = y + h * (0.2 + Math.sin(sp * 1.7) * 0.3);
    } else {
      sparkX = x + w * (0.2 + Math.sin(sp * 1.7) * 0.3);
      sparkY = y + ((sp * 137.5) % h);
    }
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 1.5 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // end clip

  // Shimmer highlight
  var shimmer = Math.sin(tick * 0.03) * 0.5 + 0.5;
  ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + shimmer * 0.06) + ')';
  if (dir === 'horizontal') {
    rRect(x + 3 * S, y + 2 * S, w * 0.35, h * 0.35, 4 * S);
  } else {
    rRect(x + 2 * S, y + 3 * S, w * 0.35, h * 0.35, 4 * S);
  }
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(80,160,200,0.45)';
  ctx.lineWidth = 2 * S;
  rRect(x, y, w, h, 6 * S);
  ctx.stroke();

  // Inner highlight border
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1 * S;
  rRect(x + 2 * S, y + 2 * S, w - 4 * S, h - 4 * S, 4 * S);
  ctx.stroke();

  ctx.restore();
}
