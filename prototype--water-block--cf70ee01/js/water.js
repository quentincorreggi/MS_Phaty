// ============================================================
// water.js — Water overlay mechanic
// Water covers a marble box, preventing it from being tapped.
// Connected water-covered boxes form a group. When a path of
// empty cells connects from the bottom row to any cell adjacent
// to a water group, the entire group drains away together.
// ============================================================

// ── Draw water overlay on top of a box (like ice overlay) ──
// Called in transformed coordinates (centered on box)
function drawWaterOverlay(ctx, x, y, w, h, S, tick, drainT) {
  ctx.save();

  var alpha = (drainT !== undefined) ? drainT : 1;
  var offsetY = (drainT !== undefined) ? (1 - drainT) * h * 0.5 : 0;

  ctx.globalAlpha = alpha * 0.65;

  // Base water fill
  var grad = ctx.createLinearGradient(x, y + offsetY, x, y + h + offsetY);
  grad.addColorStop(0, 'rgba(91,192,235,0.7)');
  grad.addColorStop(0.45, 'rgba(59,163,217,0.75)');
  grad.addColorStop(1, 'rgba(33,118,174,0.8)');
  ctx.fillStyle = grad;
  rRect(x, y + offsetY, w, h, 6 * S); ctx.fill();

  // Clip for wave effects
  ctx.save();
  ctx.beginPath();
  rRect(x, y + offsetY, w, h, 6 * S);
  ctx.clip();

  // Wave line 1
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  var waveY1 = y + offsetY + h * 0.28;
  ctx.moveTo(x - 2, waveY1 + Math.sin(tick * 0.06) * 2.5 * S);
  for (var wx = 0; wx <= w; wx += 3) {
    var wy = waveY1 + Math.sin((wx * 0.1) + tick * 0.06) * 2.5 * S;
    ctx.lineTo(x + wx, wy);
  }
  ctx.stroke();

  // Wave line 2
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  var waveY2 = y + offsetY + h * 0.58;
  ctx.moveTo(x - 2, waveY2 + Math.sin(tick * 0.05 + 2) * 2 * S);
  for (var wx = 0; wx <= w; wx += 3) {
    var wy = waveY2 + Math.sin((wx * 0.12) + tick * 0.05 + 2) * 2 * S;
    ctx.lineTo(x + wx, wy);
  }
  ctx.stroke();

  // Shimmer highlight
  ctx.globalAlpha = alpha * 0.3;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  var shimX = x + w * 0.3 + Math.sin(tick * 0.025) * w * 0.15;
  var shimY = y + offsetY + h * 0.3;
  ctx.beginPath();
  ctx.ellipse(shimX, shimY, 8 * S, 4 * S, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Bubble dots
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  var bphase = tick * 0.04;
  for (var bi = 0; bi < 3; bi++) {
    var bx = x + w * (0.2 + bi * 0.3) + Math.sin(bphase + bi * 2.1) * 4 * S;
    var by = y + offsetY + h * (0.4 + Math.sin(bphase * 0.7 + bi * 1.3) * 0.2);
    var br = (1.5 + Math.sin(bphase + bi) * 0.5) * S;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore(); // unclip

  // Border
  ctx.globalAlpha = alpha * 0.6;
  ctx.strokeStyle = 'rgba(33,118,174,0.7)';
  ctx.lineWidth = 1.5 * S;
  rRect(x, y + offsetY, w, h, 6 * S); ctx.stroke();

  // ~ symbol in center
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold ' + Math.round(18 * S) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u223C', x + w / 2, y + offsetY + h / 2);

  ctx.restore();
}

// ── Find connected water group via flood fill ──
function getWaterGroup(startIdx) {
  var group = [];
  var visited = {};
  var queue = [startIdx];
  visited[startIdx] = true;
  while (queue.length > 0) {
    var idx = queue.shift();
    group.push(idx);
    var row = Math.floor(idx / L.cols), col = idx % L.cols;
    var nbrs = [];
    if (row > 0)          nbrs.push((row - 1) * L.cols + col);
    if (row < L.rows - 1) nbrs.push((row + 1) * L.cols + col);
    if (col > 0)          nbrs.push(row * L.cols + (col - 1));
    if (col < L.cols - 1) nbrs.push(row * L.cols + (col + 1));
    for (var i = 0; i < nbrs.length; i++) {
      var ni = nbrs[i];
      if (!visited[ni] && stock[ni] && stock[ni].hasWater && !stock[ni].waterDraining) {
        visited[ni] = true;
        queue.push(ni);
      }
    }
  }
  return group;
}

// ── Check if any water groups should drain ──
function checkWaterDrain() {
  if (!stock || stock.length === 0) return;

  // BFS from bottom row through empty cells
  var reachable = {};
  var queue = [];
  for (var c = 0; c < L.cols; c++) {
    var idx = (L.rows - 1) * L.cols + c;
    if (isCellTrulyEmpty(idx)) {
      reachable[idx] = true;
      queue.push(idx);
    }
  }
  while (queue.length > 0) {
    var idx = queue.shift();
    var row = Math.floor(idx / L.cols), col = idx % L.cols;
    var nbrs = [];
    if (row > 0)          nbrs.push((row - 1) * L.cols + col);
    if (row < L.rows - 1) nbrs.push((row + 1) * L.cols + col);
    if (col > 0)          nbrs.push(row * L.cols + (col - 1));
    if (col < L.cols - 1) nbrs.push(row * L.cols + (col + 1));
    for (var i = 0; i < nbrs.length; i++) {
      var ni = nbrs[i];
      if (!reachable[ni] && isCellTrulyEmpty(ni)) {
        reachable[ni] = true;
        queue.push(ni);
      }
    }
  }

  // For each undrained water-covered box, check if any adjacent cell is reachable
  var processed = {};
  for (var i = 0; i < stock.length; i++) {
    if (!stock[i].hasWater || stock[i].waterDraining || processed[i]) continue;

    var row = Math.floor(i / L.cols), col = i % L.cols;
    var nbrs = [];
    if (row > 0)          nbrs.push((row - 1) * L.cols + col);
    if (row < L.rows - 1) nbrs.push((row + 1) * L.cols + col);
    if (col > 0)          nbrs.push(row * L.cols + (col - 1));
    if (col < L.cols - 1) nbrs.push(row * L.cols + (col + 1));

    var hasPath = false;
    for (var j = 0; j < nbrs.length; j++) {
      if (reachable[nbrs[j]]) { hasPath = true; break; }
    }

    if (hasPath) {
      var group = getWaterGroup(i);
      for (var g = 0; g < group.length; g++) {
        var gi = group[g];
        stock[gi].waterDraining = true;
        stock[gi].waterDrainT = 1.0;
        processed[gi] = true;
      }
      // Particles and sound
      sfx.complete();
      for (var g = 0; g < group.length; g++) {
        var s = stock[group[g]];
        var bx = s.x + L.bw / 2, by = s.y + L.bh / 2;
        for (var p = 0; p < 14; p++) {
          var a = Math.PI * 2 * p / 14 + Math.random() * 0.3;
          var sp = 2 + Math.random() * 4;
          particles.push({
            x: bx, y: by,
            vx: Math.cos(a) * sp * S,
            vy: Math.sin(a) * sp * S + 1.5 * S,
            r: (2 + Math.random() * 3) * S,
            color: Math.random() > 0.5 ? 'rgba(91,192,235,0.85)' : 'rgba(59,163,217,0.85)',
            life: 1, decay: 0.018 + Math.random() * 0.012, grav: true
          });
        }
        for (var p = 0; p < 6; p++) {
          var a = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.2;
          var sp = 3 + Math.random() * 3;
          particles.push({
            x: bx, y: by + L.bh * 0.4,
            vx: Math.cos(a) * sp * S,
            vy: -sp * S * 0.8,
            r: (1.5 + Math.random() * 2) * S,
            color: 'rgba(173,216,230,0.9)',
            life: 0.8, decay: 0.025, grav: true
          });
        }
      }
    }
  }
}

// ── Update water drain animation ──
function updateWaterDrain() {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s.hasWater || !s.waterDraining) continue;
    s.waterDrainT = Math.max(0, s.waterDrainT - 0.018);
    if (s.waterDrainT <= 0) {
      // Water gone — box is now accessible
      s.hasWater = false;
      s.waterDraining = false;
      s.waterDrainT = 0;
    }
  }
}
