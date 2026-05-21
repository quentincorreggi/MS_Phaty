// ============================================================
// box_cannon.js — Cannonade mechanic
//
// Cannon blocks sit on top of hidden marble boxes. When an
// adjacent box is tapped and empties, the Cannonade fires one
// stored box from its shared pool into that empty slot.
// Adjacent Cannon blocks merge into one Cannonade (shared pool).
// The block shrinks with each fire (100% → 80% total).
// When pool is exhausted, each Cannon cell reveals its underlying
// marble box (hidden, ice, or blocker) and is removed.
// ============================================================

var cannonGroups = {};

function isCannonType(type) {
  return type === 'cannon' || type === 'cannon_hidden' || type === 'cannon_ice' || type === 'cannon_blocker';
}

// ── Group computation — call from initGame after building stock ──

function initCannonGroups() {
  cannonGroups = {};
  var visited = {};
  var groupIdCounter = 0;

  for (var startIdx = 0; startIdx < stock.length; startIdx++) {
    if (!stock[startIdx] || !stock[startIdx].isCannon || visited[startIdx]) continue;

    var groupId = groupIdCounter++;
    var component = [];
    var queue = [startIdx];
    visited[startIdx] = true;

    while (queue.length > 0) {
      var curr = queue.shift();
      component.push(curr);
      var row = Math.floor(curr / L.cols), col = curr % L.cols;
      var nbrs = [];
      if (row > 0)          nbrs.push((row - 1) * L.cols + col);
      if (row < L.rows - 1) nbrs.push((row + 1) * L.cols + col);
      if (col > 0)          nbrs.push(row * L.cols + (col - 1));
      if (col < L.cols - 1) nbrs.push(row * L.cols + (col + 1));
      for (var n = 0; n < nbrs.length; n++) {
        var ni = nbrs[n];
        if (!visited[ni] && stock[ni] && stock[ni].isCannon) {
          visited[ni] = true;
          queue.push(ni);
        }
      }
    }

    // Merge contents from all cells into one shared pool
    var combined = [];
    for (var c = 0; c < component.length; c++) {
      var cell = stock[component[c]];
      var cc = cell.cannonContents || [];
      for (var j = 0; j < cc.length; j++) combined.push(cc[j]);
    }

    cannonGroups[groupId] = {
      contents: combined,
      initialCount: combined.length,
      scale: 1.0,
      cells: component
    };

    // Assign groupId and compute outward dirs for each cell
    for (var c = 0; c < component.length; c++) {
      var ci = component[c];
      var cr = Math.floor(ci / L.cols), ccol = ci % L.cols;
      var outward = [];
      var dirs = [
        { dir: 'top',    ri: cr - 1, ci2: ccol },
        { dir: 'bottom', ri: cr + 1, ci2: ccol },
        { dir: 'left',   ri: cr,     ci2: ccol - 1 },
        { dir: 'right',  ri: cr,     ci2: ccol + 1 }
      ];
      for (var d = 0; d < dirs.length; d++) {
        var dd = dirs[d];
        if (dd.ri < 0 || dd.ri >= L.rows || dd.ci2 < 0 || dd.ci2 >= L.cols) {
          outward.push(dd.dir);
          continue;
        }
        var ni2 = dd.ri * L.cols + dd.ci2;
        if (!stock[ni2] || !stock[ni2].isCannon) outward.push(dd.dir);
      }
      stock[ci].cannonGroupId = groupId;
      stock[ci].cannonOutwardDirs = outward;
      stock[ci].cannonFlashT = 0;
      stock[ci].cannonFlashDir = null;
    }
  }
}

// ── Trigger — call when a box at emptySlotIdx becomes used ──

function triggerCannonsAdjacentTo(emptySlotIdx) {
  var row = Math.floor(emptySlotIdx / L.cols), col = emptySlotIdx % L.cols;
  var nbrs = [];
  if (row > 0)          nbrs.push((row - 1) * L.cols + col);
  if (row < L.rows - 1) nbrs.push((row + 1) * L.cols + col);
  if (col > 0)          nbrs.push(row * L.cols + (col - 1));
  if (col < L.cols - 1) nbrs.push(row * L.cols + (col + 1));

  var firedGroups = {};

  for (var n = 0; n < nbrs.length; n++) {
    var ni = nbrs[n];
    if (!stock[ni] || !stock[ni].isCannon) continue;
    var groupId = stock[ni].cannonGroupId;
    if (firedGroups[groupId]) continue;
    var group = cannonGroups[groupId];
    if (!group || group.contents.length === 0) continue;

    firedGroups[groupId] = true;

    var nextBox = group.contents.shift();
    var shrinkStep = group.initialCount > 0 ? 0.20 / group.initialCount : 0;
    group.scale = Math.max(0.80, group.scale - shrinkStep);

    // Flash on the cannon cell adjacent to the target
    var nr = Math.floor(ni / L.cols), nc = ni % L.cols;
    var er = Math.floor(emptySlotIdx / L.cols), ec = emptySlotIdx % L.cols;
    var flashDir = 'bottom';
    if (er < nr) flashDir = 'top';
    else if (er > nr) flashDir = 'bottom';
    else if (ec < nc) flashDir = 'left';
    else flashDir = 'right';
    stock[ni].cannonFlashT = 1.0;
    stock[ni].cannonFlashDir = flashDir;

    // Place new box in the empty slot
    var spawnRow = Math.floor(emptySlotIdx / L.cols);
    var spawnCol = emptySlotIdx % L.cols;
    var isIce = (nextBox.type === 'ice');
    var isBlocker = (nextBox.type === 'blocker');
    stock[emptySlotIdx] = {
      ci: nextBox.ci,
      used: false, remaining: MRB_PER_BOX, spawning: false, spawnIdx: 0,
      revealed: false, empty: false,
      boxType: nextBox.type || 'default',
      isTunnel: false, isWall: false, isCannon: false,
      iceHP: isIce ? 2 : 0,
      iceCrackT: 0, iceShatterT: 0,
      blockerCount: isBlocker ? BLOCKER_PER_BOX : 0,
      x: L.sx + spawnCol * (L.bw + L.bg),
      y: L.sy + spawnRow * (L.bh + L.bg),
      shakeT: 0, hoverT: 0, popT: 0.8, revealT: 0, emptyT: 0,
      idlePhase: Math.random() * Math.PI * 2
    };

    // Particles
    spawnBurst(stock[ni].x + L.bw / 2, stock[ni].y + L.bh / 2, '#B0A898', 6);
    spawnBurst(stock[emptySlotIdx].x + L.bw / 2, stock[emptySlotIdx].y + L.bh / 2, COLORS[nextBox.ci].fill, 10);
    sfx.pop();

    updateBoxReveals(true);

    if (group.contents.length === 0) {
      (function (gid) {
        setTimeout(function () { depleteCannonade(gid); }, 400);
      })(groupId);
    }
  }
}

// ── Depletion — reveals underlying boxes for each cell ──

function depleteCannonade(groupId) {
  var group = cannonGroups[groupId];
  if (!group) return;

  for (var c = 0; c < group.cells.length; c++) {
    var ci = group.cells[c];
    if (!stock[ci] || !stock[ci].isCannon) continue;

    var cell = stock[ci];
    var underlying = cell.cannonUnderlying;
    var cellRow = Math.floor(ci / L.cols);
    var cellCol = ci % L.cols;

    spawnBurst(cell.x + L.bw / 2, cell.y + L.bh / 2, '#B0A898', 14);
    spawnConfetti(cell.x + L.bw / 2, cell.y + L.bh / 2, 8);

    var isIce = (underlying.type === 'ice');
    var isBlocker = (underlying.type === 'blocker');
    stock[ci] = {
      ci: underlying.ci,
      used: false, remaining: MRB_PER_BOX, spawning: false, spawnIdx: 0,
      revealed: isIce ? true : false, empty: false,
      boxType: underlying.type || 'default',
      isTunnel: false, isWall: false, isCannon: false,
      iceHP: isIce ? 2 : 0,
      iceCrackT: 0, iceShatterT: 0,
      blockerCount: isBlocker ? BLOCKER_PER_BOX : 0,
      x: L.sx + cellCol * (L.bw + L.bg),
      y: L.sy + cellRow * (L.bh + L.bg),
      shakeT: 0, hoverT: 0, popT: 0.5, revealT: 0, emptyT: 0,
      idlePhase: Math.random() * Math.PI * 2
    };
  }

  sfx.complete();
  delete cannonGroups[groupId];
  updateBoxReveals(true);
}

// ── Drawing ──

function drawCannonOnGrid(ctx, b, stockIdx, L, S, tick) {
  var group = cannonGroups[b.cannonGroupId];
  if (!group) return;

  var scale = group.scale;
  var cx = b.x + L.bw / 2;
  var cy = b.y + L.bh / 2;
  var bw = L.bw * scale;
  var bh = L.bh * scale;
  var outward = b.cannonOutwardDirs || ['top', 'bottom', 'left', 'right'];

  var barrelW = bw * 0.28;
  var barrelH = bh * 0.22;
  var barrelDepth = Math.max(bw * 0.16, 5 * S);
  var barrelR = barrelDepth * 0.25;

  ctx.save();
  ctx.translate(cx, cy);

  // Subtle idle sway
  var sway = Math.sin(tick * 0.035 + b.idlePhase) * 0.008;
  ctx.rotate(sway);

  // ── Barrels (drawn behind body) ──
  ctx.fillStyle = '#1a202c';
  for (var d = 0; d < outward.length; d++) {
    var dir = outward[d];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 4 * S;
    ctx.shadowOffsetY = 2 * S;
    if (dir === 'top') {
      rRect(-barrelW / 2, -bh / 2 - barrelDepth + 2 * S, barrelW, barrelDepth + 3 * S, barrelR);
    } else if (dir === 'bottom') {
      rRect(-barrelW / 2, bh / 2 - 3 * S, barrelW, barrelDepth + 3 * S, barrelR);
    } else if (dir === 'left') {
      rRect(-bw / 2 - barrelDepth + 2 * S, -barrelH / 2, barrelDepth + 3 * S, barrelH, barrelR);
    } else {
      rRect(bw / 2 - 3 * S, -barrelH / 2, barrelDepth + 3 * S, barrelH, barrelR);
    }
    ctx.fill();
    ctx.restore();
  }

  // ── Body ──
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 3 * S;
  var bodyGrad = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
  bodyGrad.addColorStop(0, '#5a6880');
  bodyGrad.addColorStop(0.45, '#3d4a5c');
  bodyGrad.addColorStop(1, '#2d3748');
  ctx.fillStyle = bodyGrad;
  rRect(-bw / 2, -bh / 2, bw, bh, 6 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Body border
  ctx.strokeStyle = '#1a202c';
  ctx.lineWidth = 1.5 * S;
  rRect(-bw / 2, -bh / 2, bw, bh, 6 * S);
  ctx.stroke();

  // Inner panel detail
  var inset = Math.max(3 * S, bw * 0.07);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1 * S;
  rRect(-bw / 2 + inset, -bh / 2 + inset, bw - inset * 2, bh - inset * 2, 3 * S);
  ctx.stroke();

  // Barrel mouths — dark circles at tips
  ctx.fillStyle = '#0d1117';
  var mouthR = Math.min(barrelW, barrelH) * 0.28;
  for (var d = 0; d < outward.length; d++) {
    var dir = outward[d];
    if (dir === 'top') {
      ctx.beginPath(); ctx.arc(0, -bh / 2 - barrelDepth + mouthR * 1.2, mouthR, 0, Math.PI * 2); ctx.fill();
    } else if (dir === 'bottom') {
      ctx.beginPath(); ctx.arc(0, bh / 2 + barrelDepth - mouthR * 1.2, mouthR, 0, Math.PI * 2); ctx.fill();
    } else if (dir === 'left') {
      ctx.beginPath(); ctx.arc(-bw / 2 - barrelDepth + mouthR * 1.2, 0, mouthR, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(bw / 2 + barrelDepth - mouthR * 1.2, 0, mouthR, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Count badge ──
  var remaining = group.contents.length;
  var badgeR = Math.min(bw, bh) * 0.18;
  var badgeX = bw / 2 - badgeR * 0.65;
  var badgeY = -bh / 2 + badgeR * 0.65;

  if (remaining > 0) {
    ctx.shadowColor = 'rgba(200,120,0,0.4)'; ctx.shadowBlur = 4 * S;
    ctx.fillStyle = 'rgba(255,185,60,0.95)';
    ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(200,140,30,0.7)'; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (badgeR * 1.3) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(remaining, badgeX, badgeY + 0.5 * S);
  } else {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(100,90,80,0.5)';
    ctx.beginPath(); ctx.arc(badgeX, badgeY, badgeR * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Muzzle flash ──
  if (b.cannonFlashT > 0) {
    var fd = b.cannonFlashDir;
    var flashAlpha = b.cannonFlashT;
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = 'rgba(255,230,100,0.95)';
    ctx.shadowColor = 'rgba(255,200,0,0.9)';
    ctx.shadowBlur = 12 * S;
    var flashR = Math.max(barrelW, barrelH) * 0.55;
    if (fd === 'top') {
      ctx.beginPath(); ctx.arc(0, -bh / 2 - barrelDepth, flashR, 0, Math.PI * 2); ctx.fill();
    } else if (fd === 'bottom') {
      ctx.beginPath(); ctx.arc(0, bh / 2 + barrelDepth, flashR, 0, Math.PI * 2); ctx.fill();
    } else if (fd === 'left') {
      ctx.beginPath(); ctx.arc(-bw / 2 - barrelDepth, 0, flashR, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(bw / 2 + barrelDepth, 0, flashR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Shared editor helpers ──

function _cannonEditorCellHTML() {
  return '<span class="ed-cell-dot" style="color:rgba(255,255,255,0.65);font-size:11px">&#9883;</span>';
}

// ── Box type registrations ──

registerBoxType('cannon', {
  label: 'Cannon',
  editorColor: '#4a5568',
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#5a6880'); g.addColorStop(1, '#2d3748');
    ctx.fillStyle = g; rRect(x, y, w, h, 6 * S); ctx.fill();
  },
  drawReveal: function () {},
  editorCellStyle: function () {
    return { background: 'linear-gradient(135deg,#5a6880,#2d3748)', borderColor: '#1a202c' };
  },
  editorCellHTML: _cannonEditorCellHTML
});

registerBoxType('cannon_hidden', {
  label: 'Cannon/Hidden',
  editorColor: '#4a4860',
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#5a5878'); g.addColorStop(1, '#2d2b48');
    ctx.fillStyle = g; rRect(x, y, w, h, 6 * S); ctx.fill();
  },
  drawReveal: function () {},
  editorCellStyle: function () {
    return { background: 'linear-gradient(135deg,#5a5878,#2d2b48)', borderColor: '#FFD700' };
  },
  editorCellHTML: _cannonEditorCellHTML
});

registerBoxType('cannon_ice', {
  label: 'Cannon/Ice',
  editorColor: '#4a6880',
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#5a7a90'); g.addColorStop(1, '#2d4a60');
    ctx.fillStyle = g; rRect(x, y, w, h, 6 * S); ctx.fill();
  },
  drawReveal: function () {},
  editorCellStyle: function () {
    return { background: 'linear-gradient(135deg,#5a7a90,#2d4a60)', borderColor: '#89CFF0' };
  },
  editorCellHTML: _cannonEditorCellHTML
});

registerBoxType('cannon_blocker', {
  label: 'Cannon/Block',
  editorColor: '#5a5048',
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#6a6460'); g.addColorStop(1, '#3d3a38');
    ctx.fillStyle = g; rRect(x, y, w, h, 6 * S); ctx.fill();
  },
  drawReveal: function () {},
  editorCellStyle: function () {
    return { background: 'linear-gradient(135deg,#6a6460,#3d3a38)', borderColor: '#7A7068' };
  },
  editorCellHTML: _cannonEditorCellHTML
});
