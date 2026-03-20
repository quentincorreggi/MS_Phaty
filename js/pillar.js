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
  var baseCell = stock[pillar.cells[0]];
  var w = L.bw, h = L.bh;
  var isHoriz = (pillar.dir === 'right' || pillar.dir === 'left');

  // Shake animation
  var ox = 0, oy = 0;
  if (pillar.crumbleT > 0.7) {
    var shake = Math.sin(pillar.crumbleT * 30) * 3 * S * (pillar.crumbleT - 0.7) / 0.3;
    if (isHoriz) ox = shake; else oy = shake;
  }

  // ── 1) Draw the stalk as two side rails with a central peek gap ──
  if (coveredCount > 1 && pillar.cells.length > 1) {
    var firstStalk = stock[pillar.cells[1]];
    var lastIdx = Math.min(pillar.remaining, pillar.cells.length - 1);
    var lastStalk = stock[pillar.cells[lastIdx]];
    var sx, sy, sw, sh;
    var gapRatio = 0.22; // central gap = 22% of cross-axis, rails cover the rest

    if (isHoriz) {
      var minX = Math.min(firstStalk.x, lastStalk.x);
      var maxX = Math.max(firstStalk.x, lastStalk.x) + w;
      if (pillar.dir === 'right') { sx = baseCell.x + w; sw = maxX - sx; }
      else { sx = minX; sw = baseCell.x - minX; }
      sy = firstStalk.y;
      sh = h;
    } else {
      var minY = Math.min(firstStalk.y, lastStalk.y);
      var maxY = Math.max(firstStalk.y, lastStalk.y) + h;
      if (pillar.dir === 'down') { sy = baseCell.y + h; sh = maxY - sy; }
      else { sy = minY; sh = baseCell.y - minY; }
      sx = firstStalk.x;
      sw = w;
    }

    // Compute two rail rects with a gap in the middle
    var rail1x, rail1y, rail1w, rail1h;
    var rail2x, rail2y, rail2w, rail2h;
    if (isHoriz) {
      // Gap runs horizontally along the stalk center
      var gapH = sh * gapRatio;
      var railH = (sh - gapH) / 2;
      rail1x = sx; rail1y = sy; rail1w = sw; rail1h = railH;
      rail2x = sx; rail2y = sy + railH + gapH; rail2w = sw; rail2h = railH;
    } else {
      // Gap runs vertically along the stalk center
      var gapW = sw * gapRatio;
      var railW = (sw - gapW) / 2;
      rail1x = sx; rail1y = sy; rail1w = railW; rail1h = sh;
      rail2x = sx + railW + gapW; rail2y = sy; rail2w = railW; rail2h = sh;
    }

    // Helper: draw one rail (body + grooves + border + highlight)
    function drawRail(rx, ry, rw, rh) {
      ctx.save();

      // Light tan rail body
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 3 * S;
      ctx.shadowOffsetY = 2 * S;
      var stalkGrad;
      if (isHoriz) {
        stalkGrad = ctx.createLinearGradient(rx + ox, ry + oy, rx + ox, ry + oy + rh);
      } else {
        stalkGrad = ctx.createLinearGradient(rx + ox, ry + oy, rx + ox + rw, ry + oy);
      }
      stalkGrad.addColorStop(0, '#E8D5A8');
      stalkGrad.addColorStop(0.4, '#DCCB98');
      stalkGrad.addColorStop(0.6, '#D0C088');
      stalkGrad.addColorStop(1, '#C4AA70');
      ctx.fillStyle = stalkGrad;
      rRect(rx + ox, ry + oy, rw, rh, 3 * S);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Subtle grooves
      ctx.save();
      ctx.beginPath();
      rRect(rx + ox, ry + oy, rw, rh, 3 * S);
      ctx.clip();
      ctx.strokeStyle = 'rgba(140,115,60,0.15)';
      ctx.lineWidth = 0.8 * S;
      if (isHoriz) {
        var gy = ry + oy + rh * 0.5;
        ctx.beginPath();
        ctx.moveTo(rx + ox, gy);
        ctx.lineTo(rx + ox + rw, gy);
        ctx.stroke();
      } else {
        var gx = rx + ox + rw * 0.5;
        ctx.beginPath();
        ctx.moveTo(gx, ry + oy);
        ctx.lineTo(gx, ry + oy + rh);
        ctx.stroke();
      }
      ctx.restore();

      // Rail border
      ctx.strokeStyle = 'rgba(160,130,70,0.45)';
      ctx.lineWidth = 1.2 * S;
      rRect(rx + ox, ry + oy, rw, rh, 3 * S);
      ctx.stroke();

      // Top-edge highlight
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      if (isHoriz) {
        rRect(rx + ox + 2 * S, ry + oy, rw - 4 * S, rh * 0.18, 2 * S);
      } else {
        rRect(rx + ox, ry + oy + 2 * S, rw * 0.18, rh - 4 * S, 2 * S);
      }
      ctx.fill();

      ctx.restore();
    }

    drawRail(rail1x, rail1y, rail1w, rail1h);
    drawRail(rail2x, rail2y, rail2w, rail2h);

    // Color hint dots for each stalk cell (visible through the gap)
    for (var i = 1; i < coveredCount && i < pillar.cells.length; i++) {
      var sc2 = stock[pillar.cells[i]];
      if (!sc2.isTunnel && !sc2.isWall && !sc2.empty && sc2.ci >= 0) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = COLORS[sc2.ci].fill;
        ctx.beginPath();
        ctx.arc(sc2.x + ox + w / 2, sc2.y + oy + h / 2, w * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  // ── 2) Draw the base (dark brown, full cell, on top) ──
  var bx = baseCell.x, by = baseCell.y;
  ctx.save();

  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;
  var baseGrad = ctx.createLinearGradient(bx + ox, by + oy, bx + ox, by + oy + h);
  baseGrad.addColorStop(0, '#6B4E2A');
  baseGrad.addColorStop(0.35, '#5C3D1E');
  baseGrad.addColorStop(0.7, '#4A3018');
  baseGrad.addColorStop(1, '#3A2510');
  ctx.fillStyle = baseGrad;
  rRect(bx + ox, by + oy, w, h, 6 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Stone brick texture on base
  ctx.save();
  ctx.beginPath();
  rRect(bx + ox, by + oy, w, h, 6 * S);
  ctx.clip();
  ctx.strokeStyle = 'rgba(20,12,5,0.22)';
  ctx.lineWidth = 1 * S;
  var brickH = h / 3;
  for (var r = 1; r < 3; r++) {
    ctx.beginPath();
    ctx.moveTo(bx + ox, by + oy + r * brickH);
    ctx.lineTo(bx + ox + w, by + oy + r * brickH);
    ctx.stroke();
  }
  for (var r = 0; r < 3; r++) {
    var offX = (r % 2 === 0) ? w * 0.5 : w * 0.25;
    ctx.beginPath();
    ctx.moveTo(bx + ox + offX, by + oy + r * brickH);
    ctx.lineTo(bx + ox + offX, by + oy + (r + 1) * brickH);
    ctx.stroke();
  }
  // Random speckle
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  var seed = (pillar.cells[0] * 11 + 7) | 0;
  for (var d = 0; d < 5; d++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var dx2 = bx + ox + (seed % 100) / 100 * w;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var dy2 = by + oy + (seed % 100) / 100 * h;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var dr2 = (1 + (seed % 2)) * S;
    ctx.beginPath(); ctx.arc(dx2, dy2, dr2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Base border
  ctx.strokeStyle = 'rgba(30,18,8,0.6)';
  ctx.lineWidth = 2 * S;
  rRect(bx + ox, by + oy, w, h, 6 * S);
  ctx.stroke();

  // Color hint on base
  if (!baseCell.isTunnel && !baseCell.isWall && !baseCell.empty && baseCell.ci >= 0) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = COLORS[baseCell.ci].fill;
    ctx.beginPath();
    ctx.arc(bx + ox + w / 2, by + oy + h / 2, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Top-left highlight
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(bx + ox + 6 * S, by + oy);
  ctx.lineTo(bx + ox + w - 6 * S, by + oy);
  ctx.quadraticCurveTo(bx + ox + w, by + oy, bx + ox + w, by + oy + 6 * S);
  ctx.lineTo(bx + ox + w - 4 * S, by + oy + 4 * S);
  ctx.lineTo(bx + ox + 4 * S, by + oy + 4 * S);
  ctx.lineTo(bx + ox + 4 * S, by + oy + h * 0.3);
  ctx.lineTo(bx + ox, by + oy + 6 * S);
  ctx.quadraticCurveTo(bx + ox, by + oy, bx + ox + 6 * S, by + oy);
  ctx.fill();

  ctx.restore();
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
