// ============================================================
// panel.js — Colored Panel mechanic
// A colored panel covers a 3x3 area on the stock grid.
// It has an associated color and countdown number.
// Each time a sort box of the matching color clears,
// the count decreases. At 0, the panel is removed and
// the boxes underneath are revealed.
// ============================================================

var panels = [];

// Check if a stock cell is covered by an active panel.
// Returns the panel object or null.
function isCellCoveredByPanel(idx) {
  var row = Math.floor(idx / L.cols);
  var col = idx % L.cols;
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.removed) continue;
    if (row >= p.row && row < p.row + 3 && col >= p.col && col < p.col + 3) return p;
  }
  return null;
}

// Called when a sort box of color ci is cleared.
function onSortBoxCompleted(ci) {
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.removed || p.ci !== ci) continue;
    p.count--;
    p.shakeT = 0.6;
    sfx.pop();
    if (p.count <= 0) {
      p.count = 0;
      p.removeT = 1.0;
    }
  }
}

// Per-frame panel animation update.
function updatePanels() {
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.removed) continue;
    if (p.shakeT > 0) p.shakeT = Math.max(0, p.shakeT - 0.04);
    if (p.removeT > 0) {
      p.removeT = Math.max(0, p.removeT - 0.018);
      if (p.removeT <= 0) {
        p.removed = true;
        panelShatterEffect(p);
        revealPanelCells(p);
      }
    }
  }
}

// Particle burst when panel shatters.
function panelShatterEffect(panel) {
  var px = L.sx + panel.col * (L.bw + L.bg);
  var py = L.sy + panel.row * (L.bh + L.bg);
  var pw = 3 * L.bw + 2 * L.bg;
  var ph = 3 * L.bh + 2 * L.bg;
  var cx = px + pw / 2;
  var cy = py + ph / 2;
  var c = COLORS[panel.ci];

  for (var k = 0; k < 35; k++) {
    var a = Math.PI * 2 * k / 35 + Math.random() * 0.3;
    var sp = 4 + Math.random() * 6;
    particles.push({
      x: cx + (Math.random() - 0.5) * pw * 0.6,
      y: cy + (Math.random() - 0.5) * ph * 0.6,
      vx: Math.cos(a) * sp * S,
      vy: Math.sin(a) * sp * S - 2 * S,
      r: (3 + Math.random() * 5) * S,
      color: Math.random() > 0.5 ? c.fill : c.light,
      life: 1, decay: 0.015 + Math.random() * 0.01, grav: true
    });
  }
  // White flash shards
  for (var k = 0; k < 12; k++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 2 + Math.random() * 3;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp * S,
      vy: Math.sin(a) * sp * S,
      r: (2 + Math.random() * 3) * S,
      color: 'rgba(255,255,255,0.8)',
      life: 0.6, decay: 0.04, grav: false
    });
  }

  sfx.complete();
  spawnConfetti(cx, cy, 25);
}

// Reveal boxes that were hidden under a just-removed panel.
function revealPanelCells(panel) {
  var cols = L.cols;
  // Reveal non-empty boxes under the panel
  for (var dr = 0; dr < 3; dr++) {
    for (var dc = 0; dc < 3; dc++) {
      var r = panel.row + dr;
      var c = panel.col + dc;
      if (r >= L.rows || c >= cols) continue;
      var idx = r * cols + c;
      var b = stock[idx];
      if (!b || b.isTunnel || b.isWall || b.empty || b.used) continue;
      if (!b.revealed) {
        b.revealed = true;
        b.revealT = 1.0;
        b.popT = 0.6;
        var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
        var burstColor = (b.boxType === 'hidden') ? '#FFD700' : COLORS[b.ci].fill;
        for (var k = 0; k < 8; k++) {
          var a = Math.PI * 2 * k / 8 + Math.random() * 0.3, sp = 2 + Math.random() * 3;
          particles.push({ x: bx, y: by, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
            r: (2 + Math.random() * 3) * S, color: burstColor, life: 0.8, decay: 0.025, grav: false });
        }
      }
    }
  }
  // Cascade reveals from any empty cells under the panel
  for (var dr = 0; dr < 3; dr++) {
    for (var dc = 0; dc < 3; dc++) {
      var r = panel.row + dr;
      var c = panel.col + dc;
      if (r >= L.rows || c >= L.cols) continue;
      var idx = r * L.cols + c;
      if (isCellTrulyEmpty(idx)) revealAroundEmptyCell(idx);
    }
  }
}

// Initialize panels from level data.
function initPanels(lvl) {
  panels = [];
  if (!lvl.panels) return;
  for (var i = 0; i < lvl.panels.length; i++) {
    var p = lvl.panels[i];
    panels.push({
      row: p.row, col: p.col, ci: p.ci, count: p.count,
      shakeT: 0, removeT: 0, removed: false
    });
  }
}

// Draw all active panels on top of the stock grid.
function drawPanels() {
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.removed) continue;

    var px = L.sx + p.col * (L.bw + L.bg);
    var py = L.sy + p.row * (L.bh + L.bg);
    var pw = 3 * L.bw + 2 * L.bg;
    var ph = 3 * L.bh + 2 * L.bg;

    var alpha = 1;
    var scale = 1;
    if (p.removeT > 0 && p.count <= 0) {
      alpha = p.removeT;
      scale = 1 + (1 - p.removeT) * 0.12;
    }

    var ox = 0;
    if (p.shakeT > 0) ox = Math.sin(p.shakeT * 30) * 5 * S * p.shakeT;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px + pw / 2 + ox, py + ph / 2);
    ctx.scale(scale, scale);

    var c = COLORS[p.ci];

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10 * S;
    ctx.shadowOffsetY = 4 * S;

    // Panel body
    var grad = ctx.createLinearGradient(-pw / 2, -ph / 2, -pw / 2, ph / 2);
    grad.addColorStop(0, c.light);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    ctx.globalAlpha = alpha * 0.88;
    rRect(-pw / 2, -ph / 2, pw, ph, 12 * S);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Border
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 2.5 * S;
    rRect(-pw / 2, -ph / 2, pw, ph, 12 * S);
    ctx.stroke();

    // Inner highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5 * S;
    rRect(-pw / 2 + 4 * S, -ph / 2 + 4 * S, pw - 8 * S, ph - 8 * S, 9 * S);
    ctx.stroke();

    // Diagonal pattern
    ctx.save();
    ctx.globalAlpha = alpha * 0.07;
    ctx.beginPath();
    rRect(-pw / 2, -ph / 2, pw, ph, 12 * S);
    ctx.clip();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2 * S;
    var sg = 14 * S;
    for (var d = -pw; d < pw + ph; d += sg) {
      ctx.beginPath();
      ctx.moveTo(-pw / 2 + d, -ph / 2);
      ctx.lineTo(-pw / 2 + d - ph, ph / 2);
      ctx.stroke();
    }
    ctx.restore();

    // Count number
    ctx.globalAlpha = alpha;
    var numPulse = p.shakeT > 0 ? 1 + Math.sin(p.shakeT * 20) * 0.15 : 1;
    ctx.save();
    ctx.scale(numPulse, numPulse);
    ctx.fillStyle = 'white';
    ctx.font = 'bold ' + Math.round(pw * 0.32) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * S;
    ctx.shadowOffsetY = 2 * S;
    ctx.fillText(p.count.toString(), 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.restore();

    // Small color marble indicator in top-right
    var indicatorR = 8 * S;
    var ix = pw / 2 - indicatorR - 6 * S;
    var iy = -ph / 2 + indicatorR + 6 * S;
    drawMarble(ix, iy, indicatorR, p.ci);

    ctx.restore();
  }
}
