// ============================================================
// drill.js — Drill & Rail mechanic
// A drill sits on a rail (connected chain of boxes) and can
// destroy one wall in its pointed direction. Each box play
// moves the drill one step along the rail (ping-pong).
// Playing the box under the drill activates it.
// When activated, the drill + all rails are destroyed.
// ============================================================

var drillState = null;

// Called from initGame after stock is built
function initDrill() {
  drillState = null;
  var railIndices = [];
  var drillIdx = -1;
  var drillDir = 'up';

  for (var i = 0; i < stock.length; i++) {
    if (stock[i].isRail) {
      railIndices.push(i);
      if (stock[i].isDrill) {
        drillIdx = i;
        drillDir = stock[i].drillDir || 'up';
      }
    }
  }

  if (drillIdx < 0 || railIndices.length === 0) return;

  var ordered = drillOrderChain(railIndices, drillIdx);
  if (ordered.length === 0) return;

  var drillPos = -1;
  for (var i = 0; i < ordered.length; i++) {
    if (ordered[i] === drillIdx) { drillPos = i; break; }
  }
  if (drillPos < 0) return;

  drillState = {
    railSlots: ordered,
    drillPos: drillPos,
    dir: drillDir,
    forward: true,
    active: true,
    moveT: 0,
    moveFromGrid: -1,
    fireT: 0
  };
}

// ── Adjacency helper (4-connected, filtered to indexSet) ──
function drillGetAdj(idx, indexSet) {
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  var nbrs = [];
  if (row > 0 && indexSet[(row - 1) * L.cols + col]) nbrs.push((row - 1) * L.cols + col);
  if (row < L.rows - 1 && indexSet[(row + 1) * L.cols + col]) nbrs.push((row + 1) * L.cols + col);
  if (col > 0 && indexSet[row * L.cols + (col - 1)]) nbrs.push(row * L.cols + (col - 1));
  if (col < L.cols - 1 && indexSet[row * L.cols + (col + 1)]) nbrs.push(row * L.cols + (col + 1));
  return nbrs;
}

// ── Order rail indices as a connected chain ──
function drillOrderChain(indices, startIdx) {
  var indexSet = {};
  for (var i = 0; i < indices.length; i++) indexSet[indices[i]] = true;

  // Find an end of the chain (degree <= 1)
  var start = indices[0];
  for (var i = 0; i < indices.length; i++) {
    if (drillGetAdj(indices[i], indexSet).length <= 1) { start = indices[i]; break; }
  }

  // Walk the chain from one end
  var ordered = [start];
  var visited = {};
  visited[start] = true;
  var current = start;
  while (true) {
    var nbrs = drillGetAdj(current, indexSet);
    var next = -1;
    for (var n = 0; n < nbrs.length; n++) {
      if (!visited[nbrs[n]]) { next = nbrs[n]; break; }
    }
    if (next < 0) break;
    ordered.push(next);
    visited[next] = true;
    current = next;
  }
  return ordered;
}

// ── Move drill one step along the rail (ping-pong) ──
function drillMove() {
  if (!drillState || !drillState.active) return;
  if (drillState.railSlots.length <= 1) return;

  var oldGrid = drillState.railSlots[drillState.drillPos];

  if (drillState.forward) {
    if (drillState.drillPos >= drillState.railSlots.length - 1) {
      drillState.forward = false;
      drillState.drillPos--;
    } else {
      drillState.drillPos++;
    }
  } else {
    if (drillState.drillPos <= 0) {
      drillState.forward = true;
      drillState.drillPos++;
    } else {
      drillState.drillPos--;
    }
  }

  drillState.moveT = 1;
  drillState.moveFromGrid = oldGrid;
}

// ── Activate drill: fire at wall, destroy drill + all rails ──
function drillActivate() {
  if (!drillState || !drillState.active) return;

  var drillGridIdx = drillState.railSlots[drillState.drillPos];
  var row = Math.floor(drillGridIdx / L.cols);
  var col = drillGridIdx % L.cols;

  var targetRow = row, targetCol = col;
  if (drillState.dir === 'up') targetRow--;
  else if (drillState.dir === 'down') targetRow++;
  else if (drillState.dir === 'left') targetCol--;
  else if (drillState.dir === 'right') targetCol++;

  // Fire particles from drill position
  var db = stock[drillGridIdx];
  var dx = db.x + L.bw / 2, dy = db.y + L.bh / 2;
  for (var p = 0; p < 12; p++) {
    var a = Math.PI * 2 * p / 12 + Math.random() * 0.3;
    var sp = 2 + Math.random() * 3;
    particles.push({ x: dx, y: dy, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (2 + Math.random() * 3) * S, color: '#D44', life: 0.8, decay: 0.03, grav: false });
  }
  sfx.pop();

  // Destroy target wall if present
  if (targetRow >= 0 && targetRow < L.rows && targetCol >= 0 && targetCol < L.cols) {
    var targetIdx = targetRow * L.cols + targetCol;
    if (stock[targetIdx] && stock[targetIdx].isWall) {
      stock[targetIdx].isWall = false;
      stock[targetIdx].empty = true;
      stock[targetIdx].revealed = true;

      var wx = stock[targetIdx].x + L.bw / 2;
      var wy = stock[targetIdx].y + L.bh / 2;
      for (var p = 0; p < 25; p++) {
        var a = Math.PI * 2 * p / 25 + Math.random() * 0.3;
        var sp = 3 + Math.random() * 5;
        particles.push({ x: wx, y: wy, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
          r: (2 + Math.random() * 5) * S,
          color: Math.random() > 0.5 ? '#9A8D7B' : '#6F6355',
          life: 1, decay: 0.02, grav: true });
      }
      sfx.complete();

      // Reveal boxes around the destroyed wall (creates free path)
      _revealVisited = {};
      revealAroundEmptyCell(targetIdx);
    }
  }

  // Destroy drill + all rails
  drillDestroyAll();
}

// ── Destroy drill and every rail slot ──
function drillDestroyAll() {
  if (!drillState) return;

  for (var i = 0; i < drillState.railSlots.length; i++) {
    var idx = drillState.railSlots[i];
    if (stock[idx]) {
      stock[idx].isRail = false;
      stock[idx].isDrill = false;
      var rx = stock[idx].x + L.bw / 2;
      var ry = stock[idx].y + L.bh / 2;
      for (var p = 0; p < 4; p++) {
        var a = Math.PI * 2 * p / 4 + Math.random() * 0.5;
        var sp = 1 + Math.random() * 2;
        particles.push({ x: rx, y: ry, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
          r: (1 + Math.random() * 2) * S, color: '#999', life: 0.5, decay: 0.04, grav: false });
      }
    }
  }

  drillState.fireT = 1;
  drillState.active = false;
}

// ── Destroy a single rail slot + prune disconnected ──
function drillDestroyRailSlot(gridIdx) {
  if (!drillState || !drillState.active) return;

  var drillGridIdx = drillState.railSlots[drillState.drillPos];

  // Remove the slot
  var newSlots = [];
  for (var i = 0; i < drillState.railSlots.length; i++) {
    if (drillState.railSlots[i] !== gridIdx) newSlots.push(drillState.railSlots[i]);
  }
  stock[gridIdx].isRail = false;

  // Particles for destroyed slot
  var rx = stock[gridIdx].x + L.bw / 2;
  var ry = stock[gridIdx].y + L.bh / 2;
  for (var p = 0; p < 6; p++) {
    var a = Math.PI * 2 * p / 6 + Math.random() * 0.3;
    var sp = 1.5 + Math.random() * 2;
    particles.push({ x: rx, y: ry, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (1.5 + Math.random() * 2) * S, color: '#888', life: 0.6, decay: 0.03, grav: false });
  }

  if (newSlots.length === 0) {
    drillState.railSlots = [];
    drillState.active = false;
    return;
  }

  // Find connected set from drill position (BFS)
  var railSet = {};
  for (var i = 0; i < newSlots.length; i++) railSet[newSlots[i]] = true;

  var connected = {};
  connected[drillGridIdx] = true;
  var queue = [drillGridIdx];
  while (queue.length > 0) {
    var cur = queue.shift();
    var nbrs = drillGetAdj(cur, railSet);
    for (var n = 0; n < nbrs.length; n++) {
      if (!connected[nbrs[n]]) {
        connected[nbrs[n]] = true;
        queue.push(nbrs[n]);
      }
    }
  }

  // Remove disconnected slots with particles
  var connectedSlots = [];
  for (var i = 0; i < newSlots.length; i++) {
    if (connected[newSlots[i]]) {
      connectedSlots.push(newSlots[i]);
    } else {
      stock[newSlots[i]].isRail = false;
      var rx2 = stock[newSlots[i]].x + L.bw / 2;
      var ry2 = stock[newSlots[i]].y + L.bh / 2;
      for (var p = 0; p < 6; p++) {
        var a = Math.PI * 2 * p / 6;
        var sp = 1 + Math.random() * 2;
        particles.push({ x: rx2, y: ry2, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
          r: (1.5 + Math.random() * 2) * S, color: '#888', life: 0.6, decay: 0.03, grav: false });
      }
    }
  }

  if (connectedSlots.length === 0) {
    drillState.railSlots = [];
    drillState.active = false;
    return;
  }

  // Re-order remaining slots as a chain
  var ordered = drillOrderChain(connectedSlots, drillGridIdx);
  drillState.railSlots = ordered;
  drillState.drillPos = -1;
  for (var i = 0; i < ordered.length; i++) {
    if (ordered[i] === drillGridIdx) { drillState.drillPos = i; break; }
  }

  if (drillState.drillPos < 0) drillState.active = false;
}

// ── Update (called each frame from game.js update) ──
function updateDrill() {
  if (!drillState) return;
  if (drillState.moveT > 0) drillState.moveT = Math.max(0, drillState.moveT - 0.08);
  if (drillState.fireT > 0) {
    drillState.fireT = Math.max(0, drillState.fireT - 0.03);
    if (drillState.fireT <= 0 && !drillState.active) drillState = null;
  }
}

// ════════════════════════════════════════════════════════════
// Drawing
// ════════════════════════════════════════════════════════════

function drawRailAndDrill() {
  if (!drillState) return;

  if (drillState.active) {
    // Build set for adjacency lookups
    var railSet = {};
    for (var i = 0; i < drillState.railSlots.length; i++) railSet[drillState.railSlots[i]] = true;

    // Draw rail tracks
    for (var i = 0; i < drillState.railSlots.length; i++) {
      var idx = drillState.railSlots[i];
      var b = stock[idx];
      drillDrawRailSlot(b.x, b.y, L.bw, L.bh, idx, railSet);
    }

    // Draw drill sprite
    var drillGridIdx = drillState.railSlots[drillState.drillPos];
    var b = stock[drillGridIdx];
    var ddx = b.x + L.bw / 2;
    var ddy = b.y + L.bh / 2;

    // Slide animation (ease in-out)
    if (drillState.moveT > 0 && drillState.moveFromGrid >= 0) {
      var fromB = stock[drillState.moveFromGrid];
      var t = 1 - drillState.moveT;
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var fx = fromB.x + L.bw / 2, fy = fromB.y + L.bh / 2;
      var tx = b.x + L.bw / 2, ty = b.y + L.bh / 2;
      ddx = fx + (tx - fx) * e;
      ddy = fy + (ty - fy) * e;
    }

    drillDrawSprite(ddx, ddy, drillState.dir);
  }
}

// ── Draw a single rail slot's track ──
function drillDrawRailSlot(x, y, w, h, gridIdx, railSet) {
  var row = Math.floor(gridIdx / L.cols), col = gridIdx % L.cols;
  var hasUp    = row > 0          && railSet[(row - 1) * L.cols + col];
  var hasDown  = row < L.rows - 1 && railSet[(row + 1) * L.cols + col];
  var hasLeft  = col > 0          && railSet[row * L.cols + (col - 1)];
  var hasRight = col < L.cols - 1 && railSet[row * L.cols + (col + 1)];

  var cx = x + w / 2, cy = y + h / 2;
  var trackW = 4 * S;
  var tieGap = 8 * S;

  ctx.save();
  ctx.globalAlpha = 0.75;

  // Horizontal rail
  if (hasLeft || hasRight) {
    var sx = hasLeft ? x : cx;
    var ex = hasRight ? x + w : cx;

    // Rails
    ctx.strokeStyle = '#9A9490';
    ctx.lineWidth = 2.5 * S;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, cy - trackW); ctx.lineTo(ex, cy - trackW); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, cy + trackW); ctx.lineTo(ex, cy + trackW); ctx.stroke();

    // Cross ties
    ctx.strokeStyle = '#7A7470';
    ctx.lineWidth = 3 * S;
    for (var tx2 = sx + tieGap / 2; tx2 < ex; tx2 += tieGap) {
      ctx.beginPath(); ctx.moveTo(tx2, cy - trackW - 2 * S); ctx.lineTo(tx2, cy + trackW + 2 * S); ctx.stroke();
    }
  }

  // Vertical rail
  if (hasUp || hasDown) {
    var sy = hasUp ? y : cy;
    var ey = hasDown ? y + h : cy;

    ctx.strokeStyle = '#9A9490';
    ctx.lineWidth = 2.5 * S;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - trackW, sy); ctx.lineTo(cx - trackW, ey); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + trackW, sy); ctx.lineTo(cx + trackW, ey); ctx.stroke();

    ctx.strokeStyle = '#7A7470';
    ctx.lineWidth = 3 * S;
    for (var ty2 = sy + tieGap / 2; ty2 < ey; ty2 += tieGap) {
      ctx.beginPath(); ctx.moveTo(cx - trackW - 2 * S, ty2); ctx.lineTo(cx + trackW + 2 * S, ty2); ctx.stroke();
    }
  }

  // Single slot (no connections) — small circle
  if (!hasUp && !hasDown && !hasLeft && !hasRight) {
    ctx.strokeStyle = '#9A9490';
    ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.arc(cx, cy, trackW + 2 * S, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.restore();
}

// ── Draw the drill sprite ──
function drillDrawSprite(x, y, dir) {
  ctx.save();
  ctx.translate(x, y);

  // Rotate to face direction (default = right)
  var angle = 0;
  if (dir === 'up') angle = -Math.PI / 2;
  else if (dir === 'down') angle = Math.PI / 2;
  else if (dir === 'left') angle = Math.PI;
  ctx.rotate(angle);

  var sz = Math.min(L.bw, L.bh) * 0.32;

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;

  // Body
  ctx.fillStyle = '#D44';
  rRect(-sz * 0.5, -sz * 0.4, sz * 0.8, sz * 0.8, 3 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Drill bit (triangle)
  ctx.fillStyle = '#A22';
  ctx.beginPath();
  ctx.moveTo(sz * 0.3, -sz * 0.32);
  ctx.lineTo(sz * 0.75, 0);
  ctx.lineTo(sz * 0.3, sz * 0.32);
  ctx.closePath();
  ctx.fill();

  // Spinning stripes on bit
  ctx.strokeStyle = 'rgba(255,180,120,0.5)';
  ctx.lineWidth = 1.5 * S;
  var spin = tick * 0.12;
  for (var l = 0; l < 3; l++) {
    var la = spin + l * Math.PI * 2 / 3;
    var ly = Math.sin(la) * sz * 0.18;
    ctx.beginPath();
    ctx.moveTo(sz * 0.32, ly * 0.6);
    ctx.lineTo(sz * 0.6, ly);
    ctx.stroke();
  }

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  rRect(-sz * 0.45, -sz * 0.35, sz * 0.35, sz * 0.32, 2 * S);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#922';
  ctx.lineWidth = 1.5 * S;
  rRect(-sz * 0.5, -sz * 0.4, sz * 0.8, sz * 0.8, 3 * S);
  ctx.stroke();

  ctx.restore();
}
