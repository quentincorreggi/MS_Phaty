// ============================================================
// pillar.js — Removable Pillar mechanic
// Multi-cell directional overlay that hides boxes underneath.
// Shrinks from tip toward base when adjacent boxes are tapped.
// ============================================================

var pillars = [];

// Compute cell indices for a pillar (base to tip order)
function getPillarCells(baseRow, baseCol, dir, length) {
  var cells = [];
  var dr = 0, dc = 0;
  if (dir === 'up') dr = -1;
  else if (dir === 'down') dr = 1;
  else if (dir === 'left') dc = -1;
  else if (dir === 'right') dc = 1;
  cells.push(baseRow * L.cols + baseCol);
  for (var i = 1; i <= length; i++) {
    var r = baseRow + dr * i;
    var c = baseCol + dc * i;
    if (r < 0 || r >= L.rows || c < 0 || c >= L.cols) break;
    cells.push(r * L.cols + c);
  }
  return cells;
}

// Initialize pillars from level data — call after stock is built
function initPillars(lvl) {
  pillars = [];
  if (!lvl || !lvl.pillars) return;
  for (var p = 0; p < lvl.pillars.length; p++) {
    var def = lvl.pillars[p];
    var cells = getPillarCells(def.row, def.col, def.dir, def.length);
    var pillar = {
      id: p,
      baseIdx: cells[0],
      dir: def.dir,
      length: def.length,
      remaining: def.length,
      cells: cells,
      crumbleT: 0,
      crumbleIdx: -1,
      removed: false
    };
    pillars.push(pillar);
    for (var ci = 0; ci < cells.length; ci++) {
      var idx = cells[ci];
      if (idx >= 0 && idx < stock.length) {
        stock[idx].pillarId = p;
        if (!stock[idx].isTunnel && !stock[idx].isWall) {
          stock[idx].revealed = false;
        }
      }
    }
  }
}

// Check if cell is covered by an active pillar
function isPillarCovered(idx) {
  if (idx < 0 || idx >= stock.length) return false;
  var s = stock[idx];
  if (!s || s.pillarId === undefined || s.pillarId < 0) return false;
  var pillar = pillars[s.pillarId];
  if (!pillar || pillar.removed) return false;
  var coveredCount = pillar.remaining + 1;
  for (var i = 0; i < coveredCount && i < pillar.cells.length; i++) {
    if (pillar.cells[i] === idx) return true;
  }
  return false;
}

// Damage all pillars adjacent to tapped cell idx
function damageAdjacentPillars(idx) {
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  var neighbors = [];
  if (row > 0)          neighbors.push((row - 1) * L.cols + col);
  if (row < L.rows - 1) neighbors.push((row + 1) * L.cols + col);
  if (col > 0)          neighbors.push(row * L.cols + (col - 1));
  if (col < L.cols - 1) neighbors.push(row * L.cols + (col + 1));
  var damaged = {};
  for (var ni = 0; ni < neighbors.length; ni++) {
    var nIdx = neighbors[ni];
    if (isPillarCovered(nIdx)) {
      damaged[stock[nIdx].pillarId] = true;
    }
  }
  for (var pid in damaged) {
    var pillar = pillars[pid];
    if (pillar.removed || pillar.remaining <= 0) continue;
    // Remove tip (farthest from base)
    var tipIdx = pillar.cells[pillar.remaining];
    pillar.remaining--;
    pillar.crumbleT = 1.0;
    pillar.crumbleIdx = tipIdx;
    // Reveal box at tip
    var tipCell = stock[tipIdx];
    tipCell.pillarId = -1;
    if (!tipCell.isTunnel && !tipCell.isWall && !tipCell.empty && !tipCell.used) {
      tipCell.revealed = true;
      tipCell.revealT = 1.0;
      tipCell.popT = 0.8;
      var bx = tipCell.x + L.bw / 2, by = tipCell.y + L.bh / 2;
      for (var pp = 0; pp < 15; pp++) {
        var a = Math.PI * 2 * pp / 15 + Math.random() * 0.3;
        var sp = 2 + Math.random() * 4;
        particles.push({
          x: bx, y: by,
          vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
          r: (2 + Math.random() * 3) * S,
          color: Math.random() > 0.5 ? '#C4A46C' : '#8B7345',
          life: 1, decay: 0.02 + Math.random() * 0.015, grav: true
        });
      }
      sfx.pop();
    }
    // If stalk fully removed, auto-remove base
    if (pillar.remaining <= 0) {
      pillar.removed = true;
      var baseIdx = pillar.cells[0];
      var baseCell = stock[baseIdx];
      baseCell.pillarId = -1;
      if (!baseCell.isTunnel && !baseCell.isWall && !baseCell.empty && !baseCell.used) {
        baseCell.revealed = true;
        baseCell.revealT = 1.0;
        baseCell.popT = 0.8;
        var bx2 = baseCell.x + L.bw / 2, by2 = baseCell.y + L.bh / 2;
        for (var pp = 0; pp < 15; pp++) {
          var a = Math.PI * 2 * pp / 15 + Math.random() * 0.3;
          var sp = 2 + Math.random() * 4;
          particles.push({
            x: bx2, y: by2,
            vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
            r: (2 + Math.random() * 3) * S,
            color: Math.random() > 0.5 ? '#C4A46C' : '#8B7345',
            life: 1, decay: 0.02 + Math.random() * 0.015, grav: true
          });
        }
        sfx.complete();
      }
      _revealVisited = {};
      for (var ci2 = 0; ci2 < pillar.cells.length; ci2++) {
        revealAroundEmptyCell(pillar.cells[ci2]);
      }
    } else {
      _revealVisited = {};
      revealAroundEmptyCell(tipIdx);
    }
  }
}

// Update pillar animation timers
function updatePillars() {
  for (var p = 0; p < pillars.length; p++) {
    if (pillars[p].crumbleT > 0) {
      pillars[p].crumbleT = Math.max(0, pillars[p].crumbleT - 0.04);
    }
  }
}

// Draw all active pillars (called after drawStock)
function drawPillars() {
  for (var p = 0; p < pillars.length; p++) {
    if (pillars[p].removed) continue;
    drawPillarOverlay(pillars[p]);
  }
}

function drawPillarOverlay(pillar) {
  var coveredCount = pillar.remaining + 1;

  // Draw connectors first (behind cells)
  for (var i = 0; i < coveredCount - 1 && i + 1 < pillar.cells.length; i++) {
    var idx = pillar.cells[i];
    var cell = stock[idx];
    var x = cell.x, y = cell.y;
    var w = L.bw, h = L.bh;
    ctx.save();
    ctx.fillStyle = '#B8984A';
    if (pillar.dir === 'right') {
      ctx.fillRect(x + w, y + 3 * S, L.bg, h - 6 * S);
    } else if (pillar.dir === 'left') {
      ctx.fillRect(x - L.bg, y + 3 * S, L.bg, h - 6 * S);
    } else if (pillar.dir === 'down') {
      ctx.fillRect(x + 3 * S, y + h, w - 6 * S, L.bg);
    } else if (pillar.dir === 'up') {
      ctx.fillRect(x + 3 * S, y - L.bg, w - 6 * S, L.bg);
    }
    ctx.restore();
  }

  // Draw each cell overlay
  for (var i = 0; i < coveredCount && i < pillar.cells.length; i++) {
    var idx = pillar.cells[i];
    var cell = stock[idx];
    var x = cell.x, y = cell.y;
    var w = L.bw, h = L.bh;
    var isBase = (i === 0);

    ctx.save();

    // Shake on crumble
    var ox = 0;
    if (pillar.crumbleT > 0.7) {
      ox = Math.sin(pillar.crumbleT * 30) * 3 * S * (pillar.crumbleT - 0.7) / 0.3;
    }

    // Sandstone fill
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 4 * S;
    ctx.shadowOffsetY = 2 * S;
    var grad = ctx.createLinearGradient(x + ox, y, x + ox, y + h);
    grad.addColorStop(0, '#D4B87A');
    grad.addColorStop(0.3, '#C4A46C');
    grad.addColorStop(0.7, '#A8894F');
    grad.addColorStop(1, '#8B7345');
    ctx.fillStyle = grad;
    rRect(x + ox, y, w, h, 6 * S);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Stone texture
    ctx.save();
    ctx.beginPath();
    rRect(x + ox, y, w, h, 6 * S);
    ctx.clip();
    ctx.strokeStyle = 'rgba(60,50,35,0.15)';
    ctx.lineWidth = 1 * S;
    var brickH = h / 3;
    for (var r = 1; r < 3; r++) {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + r * brickH);
      ctx.lineTo(x + ox + w, y + r * brickH);
      ctx.stroke();
    }
    for (var r = 0; r < 3; r++) {
      var offX = (r % 2 === 0) ? w * 0.5 : w * 0.25;
      ctx.beginPath();
      ctx.moveTo(x + ox + offX, y + r * brickH);
      ctx.lineTo(x + ox + offX, y + (r + 1) * brickH);
      ctx.stroke();
    }
    // Random texture dots
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    var seed = (idx * 7 + 13) | 0;
    for (var d = 0; d < 6; d++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var dx2 = x + ox + (seed % 100) / 100 * w;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var dy2 = y + (seed % 100) / 100 * h;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var dr2 = (1 + (seed % 2)) * S;
      ctx.beginPath(); ctx.arc(dx2, dy2, dr2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Border — thicker for base
    ctx.strokeStyle = isBase ? 'rgba(100,70,30,0.6)' : 'rgba(80,60,35,0.45)';
    ctx.lineWidth = isBase ? 2.5 * S : 1.5 * S;
    rRect(x + ox, y, w, h, 6 * S);
    ctx.stroke();

    // Base pedestal indicator
    if (isBase) {
      ctx.fillStyle = 'rgba(100,70,30,0.2)';
      var pedH = h * 0.12;
      ctx.beginPath();
      ctx.rect(x + ox + 3 * S, y + h - pedH, w - 6 * S, pedH);
      ctx.fill();
    }

    // Color hint circle
    if (!cell.isTunnel && !cell.isWall && !cell.empty && !cell.used && cell.ci >= 0) {
      ctx.globalAlpha = 0.3;
      var cc = COLORS[cell.ci];
      ctx.fillStyle = cc.fill;
      ctx.beginPath();
      ctx.arc(x + ox + w / 2, y + h / 2, w * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(x + ox + 6 * S, y);
    ctx.lineTo(x + ox + w - 6 * S, y);
    ctx.quadraticCurveTo(x + ox + w, y, x + ox + w, y + 6 * S);
    ctx.lineTo(x + ox + w - 4 * S, y + 4 * S);
    ctx.lineTo(x + ox + 4 * S, y + 4 * S);
    ctx.lineTo(x + ox + 4 * S, y + h * 0.3);
    ctx.lineTo(x + ox, y + 6 * S);
    ctx.quadraticCurveTo(x + ox, y, x + ox + 6 * S, y);
    ctx.fill();

    ctx.restore();
  }
}

// ── Editor helpers for pillar placement ──

function getEditorPillarCells(def) {
  var cells = [];
  var dr = 0, dc = 0;
  if (def.dir === 'up') dr = -1;
  else if (def.dir === 'down') dr = 1;
  else if (def.dir === 'left') dc = -1;
  else if (def.dir === 'right') dc = 1;
  cells.push(def.row * 7 + def.col);
  for (var i = 1; i <= def.length; i++) {
    var r = def.row + dr * i;
    var c = def.col + dc * i;
    if (r < 0 || r >= 7 || c < 0 || c >= 7) break;
    cells.push(r * 7 + c);
  }
  return cells;
}

function getEditorPillarAtCell(idx) {
  if (typeof editor === 'undefined' || !editor.pillars) return null;
  for (var p = 0; p < editor.pillars.length; p++) {
    var cells = getEditorPillarCells(editor.pillars[p]);
    for (var c = 0; c < cells.length; c++) {
      if (cells[c] === idx) {
        return { pillarIdx: p, isBase: (c === 0), cellPos: c };
      }
    }
  }
  return null;
}

function getEditorPillarWarnings(pillarIdx) {
  var warnings = [];
  var def = editor.pillars[pillarIdx];
  var cells = getEditorPillarCells(def);

  // Check if extends outside grid
  var expectedLen = def.length + 1;
  if (cells.length < expectedLen) {
    warnings.push('Pillar extends outside the grid! Reduce length or change direction.');
  }

  // Check overlap with walls, tunnels, other pillars
  for (var c = 0; c < cells.length; c++) {
    var idx = cells[c];
    var gridCell = editor.grid[idx];
    if (gridCell && gridCell.wall) {
      warnings.push('Cell ' + (idx + 1) + ' overlaps with a wall');
    }
    if (gridCell && gridCell.tunnel) {
      warnings.push('Cell ' + (idx + 1) + ' overlaps with a tunnel');
    }
    // Check other pillars
    for (var p2 = 0; p2 < editor.pillars.length; p2++) {
      if (p2 === pillarIdx) continue;
      var otherCells = getEditorPillarCells(editor.pillars[p2]);
      for (var oc = 0; oc < otherCells.length; oc++) {
        if (otherCells[oc] === idx) {
          warnings.push('Overlaps with Pillar #' + (p2 + 1));
          break;
        }
      }
    }
  }

  return warnings;
}
