// ============================================================
// panel.js — 2x2 Blocking Panel mechanic
// A panel covers a 2x2 group of boxes, preventing them from
// being revealed or tapped. The player must empty all boxes
// surrounding the panel to shatter it.
// ============================================================

// Get the 4 cell indices covered by a panel anchored at (row, col)
function getPanelCells(row, col) {
  return [
    row * L.cols + col,
    row * L.cols + (col + 1),
    (row + 1) * L.cols + col,
    (row + 1) * L.cols + (col + 1)
  ];
}

// Get all neighboring cell indices surrounding a 2x2 panel (including diagonals)
function getPanelNeighbors(row, col) {
  var cellSet = {};
  var panelCells = getPanelCells(row, col);
  for (var i = 0; i < panelCells.length; i++) cellSet[panelCells[i]] = true;

  var neighbors = [];
  for (var r = row - 1; r <= row + 2; r++) {
    for (var c = col - 1; c <= col + 2; c++) {
      if (r < 0 || r >= L.rows || c < 0 || c >= L.cols) continue;
      var idx = r * L.cols + c;
      if (cellSet[idx]) continue; // skip panel cells themselves
      neighbors.push(idx);
    }
  }
  return neighbors;
}

// Check if a cell is covered by any active panel
function isCellPaneled(idx) {
  for (var i = 0; i < panels.length; i++) {
    if (panels[i].shattered) continue;
    var cells = panels[i].cells;
    for (var j = 0; j < cells.length; j++) {
      if (cells[j] === idx) return true;
    }
  }
  return false;
}

// Count how many surrounding boxes still need to be emptied for a panel
function getPanelRemainingNeighbors(panel) {
  var remaining = 0;
  for (var i = 0; i < panel.neighbors.length; i++) {
    var idx = panel.neighbors[i];
    var s = stock[idx];
    if (!s) continue;
    if (s.isWall) continue;       // walls don't count
    if (s.isTunnel) {
      // tunnels count as "done" when they have no contents left and exit is clear
      if (s.tunnelContents && s.tunnelContents.length > 0) remaining++;
      continue;
    }
    if (s.empty) continue;        // empty slots don't count
    if (s.used) continue;         // already emptied
    // Also skip cells covered by another panel (they can't be emptied yet)
    // but they still count as a requirement
    remaining++;
  }
  return remaining;
}

// Initialize panels from level data
function initPanels(lvl) {
  panels = [];
  if (!lvl.panels) return;
  for (var i = 0; i < lvl.panels.length; i++) {
    var p = lvl.panels[i];
    var row = Math.floor(p.anchor / L.cols);
    var col = p.anchor % L.cols;
    var cells = getPanelCells(row, col);
    var neighbors = getPanelNeighbors(row, col);
    panels.push({
      anchor: p.anchor,
      row: row,
      col: col,
      cells: cells,
      neighbors: neighbors,
      shattered: false,
      shatterT: 0,
      crackLevel: 0,   // 0..1, visual progress
      prevRemaining: -1 // track for crack animation
    });
  }
}

// Update panels each frame — check if they should shatter
function updatePanels() {
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.shattered) {
      if (p.shatterT > 0) p.shatterT = Math.max(0, p.shatterT - 0.025);
      continue;
    }

    var remaining = getPanelRemainingNeighbors(p);
    var total = 0;
    for (var n = 0; n < p.neighbors.length; n++) {
      var s = stock[p.neighbors[n]];
      if (!s) continue;
      if (s.isWall) continue;
      if (s.empty) continue;
      if (s.isTunnel && (!s.tunnelContents || s.tunnelContents.length === 0)) continue;
      total++;
    }

    // Update crack level based on progress
    if (total > 0) {
      p.crackLevel = 1 - (remaining / total);
    } else {
      p.crackLevel = 1;
    }

    // Shatter when all neighbors are emptied
    if (remaining <= 0) {
      shatterPanel(p);
    }
  }
}

// Shatter a panel — reveal the boxes underneath
function shatterPanel(panel) {
  panel.shattered = true;
  panel.shatterT = 1.0;

  // Particle burst from panel center
  var cx = stock[panel.cells[0]].x + L.bw + L.bg / 2;
  var cy = stock[panel.cells[0]].y + L.bh + L.bg / 2;

  // Wood splinter particles
  for (var p = 0; p < 24; p++) {
    var a = Math.PI * 2 * p / 24 + Math.random() * 0.3;
    var sp = 3 + Math.random() * 5;
    var color = Math.random() > 0.5 ? '#8B6914' : '#A08050';
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
      r: (2 + Math.random() * 4) * S,
      color: color,
      life: 1, decay: 0.018 + Math.random() * 0.012, grav: true
    });
  }

  // Bolt particles from corners
  for (var c = 0; c < panel.cells.length; c++) {
    var s = stock[panel.cells[c]];
    var bx = s.x + L.bw / 2;
    var by = s.y + L.bh / 2;
    for (var p = 0; p < 4; p++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 1 + Math.random() * 3;
      particles.push({
        x: bx, y: by,
        vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
        r: (1.5 + Math.random() * 2) * S,
        color: '#C0A060',
        life: 0.7, decay: 0.03, grav: false
      });
    }
  }

  sfx.complete();

  // Reveal the boxes underneath with a pop animation
  for (var c = 0; c < panel.cells.length; c++) {
    var idx = panel.cells[c];
    var b = stock[idx];
    if (b.empty || b.used || b.isTunnel || b.isWall) continue;
    b.revealed = true;
    b.revealT = 1.0;
    b.popT = 0.8;
  }

  // Also trigger reveal propagation from newly revealed cells
  for (var c = 0; c < panel.cells.length; c++) {
    revealAroundEmptyCell(panel.cells[c]);
  }
}

// Draw all active panels
function drawPanels() {
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.shattered && p.shatterT <= 0) continue;

    var topLeft = stock[p.cells[0]];
    var px = topLeft.x;
    var py = topLeft.y;
    var pw = L.bw * 2 + L.bg;
    var ph = L.bh * 2 + L.bg;

    ctx.save();

    if (p.shattered) {
      // Shatter animation — scale down and fade
      var st = p.shatterT;
      var cx = px + pw / 2;
      var cy = py + ph / 2;
      ctx.translate(cx, cy);
      ctx.scale(1 + (1 - st) * 0.3, 1 + (1 - st) * 0.3);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = st * 0.8;
    }

    // Panel base — dark wooden plank
    var grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, '#6B5020');
    grad.addColorStop(0.3, '#8B6914');
    grad.addColorStop(0.5, '#7A5A18');
    grad.addColorStop(0.7, '#8B6914');
    grad.addColorStop(1, '#5A4010');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8 * S;
    ctx.shadowOffsetY = 3 * S;
    rRect(px, py, pw, ph, 8 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Wood grain lines
    ctx.save();
    ctx.beginPath();
    rRect(px, py, pw, ph, 8 * S); ctx.clip();
    ctx.strokeStyle = 'rgba(90,60,20,0.2)';
    ctx.lineWidth = 1 * S;
    for (var g = 0; g < 6; g++) {
      var gy = py + (g + 0.5) * ph / 6 + Math.sin(g * 2.3) * 3 * S;
      ctx.beginPath();
      ctx.moveTo(px, gy);
      for (var gx = 0; gx < pw; gx += 8 * S) {
        ctx.lineTo(px + gx, gy + Math.sin(gx * 0.02 + g) * 2 * S);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Cracks based on progress
    if (p.crackLevel > 0 && !p.shattered) {
      ctx.save();
      ctx.beginPath();
      rRect(px, py, pw, ph, 8 * S); ctx.clip();
      ctx.strokeStyle = 'rgba(40,25,5,0.4)';
      ctx.lineWidth = 1.5 * S;
      ctx.lineCap = 'round';

      if (p.crackLevel > 0.15) {
        // First crack
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.2, py + ph * 0.1);
        ctx.lineTo(px + pw * 0.35, py + ph * 0.35);
        ctx.lineTo(px + pw * 0.3, py + ph * 0.5);
        ctx.stroke();
      }
      if (p.crackLevel > 0.4) {
        // Second crack
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.7, py + ph * 0.15);
        ctx.lineTo(px + pw * 0.55, py + ph * 0.4);
        ctx.lineTo(px + pw * 0.6, py + ph * 0.65);
        ctx.stroke();
      }
      if (p.crackLevel > 0.65) {
        // Third crack + branching
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.4, py + ph * 0.6);
        ctx.lineTo(px + pw * 0.5, py + ph * 0.8);
        ctx.lineTo(px + pw * 0.45, py + ph * 0.95);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.5, py + ph * 0.8);
        ctx.lineTo(px + pw * 0.7, py + ph * 0.85);
        ctx.stroke();
      }

      // White highlight cracks
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.8 * S;
      if (p.crackLevel > 0.15) {
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.21, py + ph * 0.09);
        ctx.lineTo(px + pw * 0.36, py + ph * 0.34);
        ctx.stroke();
      }
      if (p.crackLevel > 0.65) {
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.41, py + ph * 0.59);
        ctx.lineTo(px + pw * 0.51, py + ph * 0.79);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Border
    ctx.strokeStyle = 'rgba(60,40,10,0.5)';
    ctx.lineWidth = 2 * S;
    rRect(px, py, pw, ph, 8 * S); ctx.stroke();

    // Bolts/rivets at corners
    var boltR = 3.5 * S;
    var boltInset = 7 * S;
    var boltPositions = [
      { x: px + boltInset, y: py + boltInset },
      { x: px + pw - boltInset, y: py + boltInset },
      { x: px + boltInset, y: py + ph - boltInset },
      { x: px + pw - boltInset, y: py + ph - boltInset }
    ];
    for (var b = 0; b < boltPositions.length; b++) {
      var bp = boltPositions[b];
      var bGrad = ctx.createRadialGradient(bp.x - boltR * 0.2, bp.y - boltR * 0.2, 0, bp.x, bp.y, boltR);
      bGrad.addColorStop(0, '#B0A080');
      bGrad.addColorStop(0.6, '#8A7050');
      bGrad.addColorStop(1, '#604830');
      ctx.fillStyle = bGrad;
      ctx.beginPath(); ctx.arc(bp.x, bp.y, boltR, 0, Math.PI * 2); ctx.fill();
      // Bolt cross
      ctx.strokeStyle = 'rgba(40,30,10,0.4)';
      ctx.lineWidth = 1 * S;
      ctx.beginPath();
      ctx.moveTo(bp.x - boltR * 0.5, bp.y);
      ctx.lineTo(bp.x + boltR * 0.5, bp.y);
      ctx.moveTo(bp.x, bp.y - boltR * 0.5);
      ctx.lineTo(bp.x, bp.y + boltR * 0.5);
      ctx.stroke();
    }

    // Panel progress indicator — small dots showing remaining neighbors
    if (!p.shattered) {
      var total = 0;
      var done = 0;
      for (var n = 0; n < p.neighbors.length; n++) {
        var s = stock[p.neighbors[n]];
        if (!s) continue;
        if (s.isWall || s.empty) continue;
        if (s.isTunnel && (!s.tunnelContents || s.tunnelContents.length === 0)) continue;
        total++;
        if (s.used || (s.isTunnel && s.tunnelContents && s.tunnelContents.length === 0)) done++;
      }
      if (total > 0) {
        var dotR2 = 2.5 * S;
        var dotGap = dotR2 * 2.8;
        var dotsW = (total - 1) * dotGap;
        var dotStartX = px + pw / 2 - dotsW / 2;
        var dotY = py + ph - 5 * S;
        for (var d = 0; d < total; d++) {
          var dx = dotStartX + d * dotGap;
          if (d < done) {
            ctx.fillStyle = 'rgba(120,200,100,0.8)';
            ctx.beginPath(); ctx.arc(dx, dotY, dotR2, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(200,180,140,0.4)';
            ctx.beginPath(); ctx.arc(dx, dotY, dotR2 * 0.7, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    ctx.restore();
  }
}
