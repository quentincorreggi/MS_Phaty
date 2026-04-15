// ============================================================
// curtain.js — Secret Customers curtain mechanic
// Covers a zone of the sort area with an opaque curtain.
// A key box lifts the curtain when tapped.
// ============================================================

// Called from initGame after sort columns are built
function initCurtain(lvl) {
  curtainActive = false;
  curtainConfig = null;
  curtainLiftT = 0;
  curtainKeyAnim = null;

  if (!lvl || !lvl.curtain) return;
  var cfg = lvl.curtain;
  if (!cfg.width || !cfg.depth) return;

  curtainConfig = {
    startCol: Math.max(0, Math.min(3, cfg.startCol || 0)),
    width: Math.max(1, Math.min(4, cfg.width)),
    depth: Math.max(1, Math.min(5, cfg.depth))
  };

  // Clamp width so it doesn't exceed 4 columns
  if (curtainConfig.startCol + curtainConfig.width > 4) {
    curtainConfig.width = 4 - curtainConfig.startCol;
  }

  curtainActive = true;

  // Mark the deepest N sort boxes in each covered column as curtained
  for (var c = curtainConfig.startCol; c < curtainConfig.startCol + curtainConfig.width; c++) {
    var col = sortCols[c];
    if (!col) continue;
    var startIdx = Math.max(0, col.length - curtainConfig.depth);
    for (var r = startIdx; r < col.length; r++) {
      col[r].curtained = true;
    }
  }
}

// Check if a specific sort box is currently hidden by the curtain
function isSortBoxCurtained(box) {
  return curtainActive && box.curtained;
}

// Start the curtain lift sequence — key flies from box to curtain zone
function triggerCurtainLift(box) {
  if (!curtainActive || !curtainConfig) return;

  // Start position: center of the key box
  var startX = box.x + L.bw / 2;
  var startY = box.y + L.bh / 2;

  // Target position: center of curtain zone in sort area
  var midCol = curtainConfig.startCol + curtainConfig.width / 2;
  var targetX = L.sSx + midCol * (L.sBw + L.sColGap);
  var targetY = L.sTop + L.sBh * 1.5;

  curtainKeyAnim = {
    startX: startX,
    startY: startY,
    targetX: targetX,
    targetY: targetY,
    t: 0
  };
}

// Called every frame from update()
function updateCurtain() {
  if (!curtainConfig) return;

  // Key flight animation
  if (curtainKeyAnim) {
    curtainKeyAnim.t += 0.03;
    if (curtainKeyAnim.t >= 1) {
      curtainKeyAnim = null;
      curtainLiftT = 1.0;
      sfx.complete();

      // Burst particles at curtain zone
      for (var c = curtainConfig.startCol; c < curtainConfig.startCol + curtainConfig.width; c++) {
        var bx = L.sSx + c * (L.sBw + L.sColGap) + L.sBw / 2;
        var by = L.sTop + L.sBh;
        spawnBurst(bx, by, '#FFD966', 15);
        spawnConfetti(bx, by, 10);
      }
    }
  }

  // Curtain lift animation
  if (curtainLiftT > 0) {
    curtainLiftT = Math.max(0, curtainLiftT - 0.025);
    if (curtainLiftT <= 0) {
      // Lift complete — reveal all curtained boxes
      curtainActive = false;
      for (var c = 0; c < sortCols.length; c++) {
        for (var r = 0; r < sortCols[c].length; r++) {
          if (sortCols[c][r].curtained) {
            sortCols[c][r].curtained = false;
            sortCols[c][r].squishT = 1;
          }
        }
      }
    }
  }
}

// Draw the curtain overlay on the sort area
function drawCurtainOverlay() {
  if (!curtainConfig) return;
  if (!curtainActive && curtainLiftT <= 0 && !curtainKeyAnim) return;

  var alpha = curtainActive ? 1 : curtainLiftT;
  if (alpha <= 0) return;

  // Calculate curtain zone bounds
  var leftCol = curtainConfig.startCol;
  var rightCol = curtainConfig.startCol + curtainConfig.width - 1;
  var zoneX = L.sSx + leftCol * (L.sBw + L.sColGap) - 4 * S;
  var zoneW = (rightCol - leftCol) * (L.sBw + L.sColGap) + L.sBw + 8 * S;

  // Find the vertical range of curtained boxes that are currently visible
  var minY = Infinity, maxY = -Infinity;
  for (var c = leftCol; c <= rightCol; c++) {
    var col = sortCols[c];
    var visibleBoxes = [];
    for (var r = 0; r < col.length; r++) if (col[r].vis) visibleBoxes.push({ box: col[r], vi: visibleBoxes.length });
    var showCount = Math.min(visibleBoxes.length, SORT_VISIBLE_ROWS);
    for (var vi = 0; vi < showCount; vi++) {
      if (visibleBoxes[vi].box.curtained) {
        var byy = getSortBoxY(c, vi);
        if (byy < minY) minY = byy;
        if (byy + L.sBh > maxY) maxY = byy + L.sBh;
      }
    }
  }

  if (minY === Infinity) return; // no visible curtained boxes

  // Slide up during lift
  var slideY = curtainActive ? 0 : (1 - curtainLiftT) * -(maxY - minY + 20 * S);

  ctx.save();
  ctx.globalAlpha = alpha * 0.7;

  // Main curtain fabric
  var zoneY = minY - 6 * S + slideY;
  var zoneH = (maxY - minY) + 12 * S;
  var grad = ctx.createLinearGradient(zoneX, zoneY, zoneX, zoneY + zoneH);
  grad.addColorStop(0, '#3D2E5E');
  grad.addColorStop(0.5, '#2A1F44');
  grad.addColorStop(1, '#1E1533');
  ctx.fillStyle = grad;
  rRect(zoneX, zoneY, zoneW, zoneH, 10 * S);
  ctx.fill();

  // Fabric shimmer stripes
  ctx.globalAlpha = alpha * 0.08;
  ctx.fillStyle = '#8B6FC0';
  var stripeW = 6 * S;
  for (var sx = zoneX; sx < zoneX + zoneW; sx += stripeW * 3) {
    ctx.fillRect(sx, zoneY, stripeW, zoneH);
  }

  // Border
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = '#6B4FA8';
  ctx.lineWidth = 2 * S;
  rRect(zoneX, zoneY, zoneW, zoneH, 10 * S);
  ctx.stroke();

  // Scissors icon in center of curtain
  if (curtainActive) {
    ctx.globalAlpha = 0.4 + Math.sin(tick * 0.05) * 0.1;
    ctx.fillStyle = '#FFD966';
    var iconSize = Math.min(zoneW, zoneH) * 0.18;
    ctx.font = 'bold ' + iconSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u2702', zoneX + zoneW / 2, zoneY + zoneH / 2);
  }

  ctx.restore();
}

// Draw the flying key animation
function drawCurtainKeyAnim() {
  if (!curtainKeyAnim) return;

  var t = curtainKeyAnim.t;
  var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  var x = curtainKeyAnim.startX + (curtainKeyAnim.targetX - curtainKeyAnim.startX) * ease;
  var y = curtainKeyAnim.startY + (curtainKeyAnim.targetY - curtainKeyAnim.startY) * ease - Math.sin(t * Math.PI) * 80 * S;

  // Trail particles
  if (tick % 2 === 0) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 2 * S,
      vy: (Math.random() - 0.5) * 2 * S,
      r: (2 + Math.random() * 3) * S,
      color: '#FFD966',
      life: 0.8,
      decay: 0.04,
      grav: false
    });
  }

  // Draw key icon
  var keySize = 20 * S * (1 + Math.sin(t * Math.PI) * 0.3);
  ctx.save();
  ctx.globalAlpha = 1;
  // Golden glow
  ctx.shadowColor = 'rgba(255,217,102,0.6)';
  ctx.shadowBlur = 15 * S;
  ctx.fillStyle = '#FFD966';
  ctx.font = 'bold ' + keySize + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u2702', x, y);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.restore();
}
