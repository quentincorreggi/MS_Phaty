// ============================================================
// curtain.js — Secret Customers curtain mechanic (multi-curtain)
// Each curtain covers 1 sort column and has a color that
// matches a key box. Tapping the matching key lifts that curtain.
// ============================================================

// Called from initGame after sort columns are built
function initCurtain(lvl) {
  curtains = [];

  if (!lvl || !lvl.curtains || !lvl.curtains.length) return;

  for (var i = 0; i < lvl.curtains.length; i++) {
    var cfg = lvl.curtains[i];
    if (!cfg.depth || cfg.depth <= 0) continue;

    var col = Math.max(0, Math.min(3, cfg.col || 0));
    var depth = Math.max(1, Math.min(5, cfg.depth));
    var colorIdx = Math.max(0, Math.min(NUM_COLORS - 1, cfg.colorIdx || 0));

    var curtain = {
      col: col,
      depth: depth,
      colorIdx: colorIdx,
      active: true,
      liftT: 0,
      keyAnim: null
    };
    var cIdx = curtains.length;
    curtains.push(curtain);

    // Mark the deepest N sort boxes in this column as curtained
    var sortCol = sortCols[col];
    if (!sortCol) continue;
    var startRow = Math.max(0, sortCol.length - depth);
    for (var r = startRow; r < sortCol.length; r++) {
      sortCol[r].curtained = true;
      sortCol[r].curtainIdx = cIdx;
    }
  }
}

// Check if a specific sort box is currently hidden by a curtain
function isSortBoxCurtained(box) {
  if (!box.curtained || box.curtainIdx === undefined) return false;
  var c = curtains[box.curtainIdx];
  return c && c.active;
}

// Get the color index of the curtain covering this box (-1 if none)
function getCurtainColorIdx(box) {
  if (!box.curtained || box.curtainIdx === undefined) return -1;
  var c = curtains[box.curtainIdx];
  if (!c) return -1;
  return c.colorIdx;
}

// Check if any curtain is active
function anyCurtainActive() {
  for (var i = 0; i < curtains.length; i++) {
    if (curtains[i].active) return true;
  }
  return false;
}

// Check if the curtain matching this color index is still active
function isCurtainActiveForColor(colorIdx) {
  for (var i = 0; i < curtains.length; i++) {
    if (curtains[i].colorIdx === colorIdx && curtains[i].active) return true;
  }
  return false;
}

// Start the curtain lift sequence for the curtain matching this box's keyColor
function triggerCurtainLift(box) {
  var matchColor = box.keyColor !== undefined ? box.keyColor : box.ci;
  for (var i = 0; i < curtains.length; i++) {
    var c = curtains[i];
    if (c.colorIdx === matchColor && c.active && !c.keyAnim) {
      var startX = box.x + L.bw / 2;
      var startY = box.y + L.bh / 2;
      var targetX = L.sSx + c.col * (L.sBw + L.sColGap) + L.sBw / 2;
      var targetY = L.sTop + L.sBh * 1.5;

      c.keyAnim = {
        startX: startX,
        startY: startY,
        targetX: targetX,
        targetY: targetY,
        t: 0
      };
      break;  // only trigger one curtain per tap
    }
  }
}

// Called every frame from update()
function updateCurtain() {
  for (var i = 0; i < curtains.length; i++) {
    var c = curtains[i];

    // Key flight animation
    if (c.keyAnim) {
      c.keyAnim.t += 0.03;
      if (c.keyAnim.t >= 1) {
        c.keyAnim = null;
        c.liftT = 1.0;
        sfx.complete();

        // Burst particles at curtain column
        var bx = L.sSx + c.col * (L.sBw + L.sColGap) + L.sBw / 2;
        var by = L.sTop + L.sBh;
        spawnBurst(bx, by, COLORS[c.colorIdx].fill, 15);
        spawnConfetti(bx, by, 12);
      }
    }

    // Curtain lift animation
    if (c.liftT > 0) {
      c.liftT = Math.max(0, c.liftT - 0.025);
      if (c.liftT <= 0) {
        c.active = false;
        // Reveal sort boxes belonging to this curtain
        for (var sc = 0; sc < sortCols.length; sc++) {
          for (var sr = 0; sr < sortCols[sc].length; sr++) {
            var box = sortCols[sc][sr];
            if (box.curtainIdx === i) {
              box.curtained = false;
              box.squishT = 1;
            }
          }
        }
      }
    }
  }
}

// Draw the curtain overlay on the sort area (one per active curtain)
function drawCurtainOverlay() {
  for (var i = 0; i < curtains.length; i++) {
    var c = curtains[i];
    if (!c.active && c.liftT <= 0) continue;

    var alpha = c.active ? 1 : c.liftT;
    if (alpha <= 0) continue;

    var cc = COLORS[c.colorIdx];

    // Find vertical range of curtained boxes that are currently visible
    var col = sortCols[c.col];
    var visibleBoxes = [];
    for (var r = 0; r < col.length; r++) if (col[r].vis) visibleBoxes.push({ box: col[r], vi: visibleBoxes.length });
    var showCount = Math.min(visibleBoxes.length, SORT_VISIBLE_ROWS);
    var minY = Infinity, maxY = -Infinity;
    for (var vi = 0; vi < showCount; vi++) {
      if (visibleBoxes[vi].box.curtainIdx === i) {
        var byy = getSortBoxY(c.col, vi);
        if (byy < minY) minY = byy;
        if (byy + L.sBh > maxY) maxY = byy + L.sBh;
      }
    }

    if (minY === Infinity) continue;

    var slideY = c.active ? 0 : (1 - c.liftT) * -(maxY - minY + 20 * S);
    var zoneX = L.sSx + c.col * (L.sBw + L.sColGap) - 4 * S;
    var zoneW = L.sBw + 8 * S;
    var zoneY = minY - 6 * S + slideY;
    var zoneH = (maxY - minY) + 12 * S;

    ctx.save();
    ctx.globalAlpha = alpha * 0.65;

    // Dark base with color tint
    var grad = ctx.createLinearGradient(zoneX, zoneY, zoneX, zoneY + zoneH);
    grad.addColorStop(0, '#2A1F3A');
    grad.addColorStop(1, '#1A1228');
    ctx.fillStyle = grad;
    rRect(zoneX, zoneY, zoneW, zoneH, 8 * S);
    ctx.fill();

    // Color tint overlay
    ctx.globalAlpha = alpha * 0.2;
    ctx.fillStyle = cc.fill;
    rRect(zoneX, zoneY, zoneW, zoneH, 8 * S);
    ctx.fill();

    // Shimmer stripes in curtain color
    ctx.globalAlpha = alpha * 0.06;
    ctx.fillStyle = cc.light;
    var stripeW = 5 * S;
    for (var sx = zoneX; sx < zoneX + zoneW; sx += stripeW * 3) {
      ctx.fillRect(sx, zoneY, stripeW, zoneH);
    }

    // Border in curtain color
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = cc.fill;
    ctx.lineWidth = 2 * S;
    rRect(zoneX, zoneY, zoneW, zoneH, 8 * S);
    ctx.stroke();

    // Scissors icon in curtain color
    if (c.active) {
      ctx.globalAlpha = 0.4 + Math.sin(tick * 0.05 + i * 1.5) * 0.12;
      ctx.fillStyle = cc.light;
      var iconSize = Math.min(zoneW, zoneH) * 0.2;
      ctx.font = 'bold ' + iconSize + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2702', zoneX + zoneW / 2, zoneY + zoneH / 2);
    }

    ctx.restore();
  }
}

// Draw all flying key animations
function drawCurtainKeyAnim() {
  for (var i = 0; i < curtains.length; i++) {
    var c = curtains[i];
    if (!c.keyAnim) continue;

    var cc = COLORS[c.colorIdx];
    var t = c.keyAnim.t;
    var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    var x = c.keyAnim.startX + (c.keyAnim.targetX - c.keyAnim.startX) * ease;
    var y = c.keyAnim.startY + (c.keyAnim.targetY - c.keyAnim.startY) * ease - Math.sin(t * Math.PI) * 80 * S;

    // Trail particles in curtain color
    if (tick % 2 === 0) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 2 * S,
        vy: (Math.random() - 0.5) * 2 * S,
        r: (2 + Math.random() * 3) * S,
        color: cc.light,
        life: 0.8,
        decay: 0.04,
        grav: false
      });
    }

    // Draw key icon
    var keySize = 20 * S * (1 + Math.sin(t * Math.PI) * 0.3);
    ctx.save();
    ctx.shadowColor = cc.glow;
    ctx.shadowBlur = 15 * S;
    ctx.fillStyle = cc.light;
    ctx.font = 'bold ' + keySize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u2702', x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
