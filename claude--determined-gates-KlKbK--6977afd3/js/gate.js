// ============================================================
// gate.js — Determined Gate mechanic
//           2-cell-wide paint station. Recolors marbles from
//           any box above it in the same two columns.
//           Blocks path: boxes above are revealed via side paths.
// ============================================================

// Returns the gate anchor stock object below boxIdx in the same column,
// or null if none exists or the gate is exhausted.
function findGateAnchorBelowBox(boxIdx) {
  if (!stock || !L || !L.cols) return null;
  var row = Math.floor(boxIdx / L.cols);
  var col = boxIdx % L.cols;
  for (var r = row + 1; r < L.rows; r++) {
    var ci = r * L.cols + col;
    var cell = stock[ci];
    if (!cell) continue;
    if (cell.isGate) {
      if (cell.gateAnchor) return cell;
      if (cell.gateAnchorIdx >= 0) return stock[cell.gateAnchorIdx];
    }
  }
  return null;
}

// ── Drawing ──────────────────────────────────────────────────

function drawGate(ctx, x, y, gateW, bh, S, gateColors, gateTotal, tick) {
  var active = gateColors.length > 0;

  ctx.save();

  // Background
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 3 * S;
  var bgGrad = ctx.createLinearGradient(x, y, x, y + bh);
  bgGrad.addColorStop(0, active ? '#2C2040' : '#221820');
  bgGrad.addColorStop(1, active ? '#1A1228' : '#140E10');
  ctx.fillStyle = bgGrad;
  rRect(x, y, gateW, bh, 8 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (active) {
    var c = COLORS[gateColors[0]];
    var pulse = Math.sin(tick * 0.055) * 0.18 + 0.72;

    // Color wash
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(tick * 0.04) * 0.04;
    ctx.fillStyle = c.fill;
    rRect(x + 3 * S, y + 3 * S, gateW - 6 * S, bh - 6 * S, 6 * S);
    ctx.fill();
    ctx.restore();

    // Glow border
    ctx.strokeStyle = c.fill;
    ctx.globalAlpha = pulse * 0.45;
    ctx.lineWidth = 2.5 * S;
    rRect(x, y, gateW, bh, 8 * S);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Main marble — current next color
    var cx = x + gateW * 0.35;
    var cy = y + bh / 2;
    var cr = Math.min(bh * 0.3, gateW * 0.13);

    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 12 * S * pulse;
    var cg = ctx.createRadialGradient(
      cx - cr * 0.25, cy - cr * 0.25, cr * 0.08,
      cx, cy, cr
    );
    cg.addColorStop(0, c.light);
    cg.addColorStop(0.65, c.fill);
    cg.addColorStop(1, c.dark);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath();
    ctx.arc(cx - cr * 0.28, cy - cr * 0.3, cr * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // Queue preview dots — upcoming colors
    var dotR = Math.min(bh * 0.09, gateW * 0.044);
    var qx = x + gateW * 0.6;
    var maxDots = Math.min(gateColors.length - 1, 4);
    for (var d = 0; d < maxDots; d++) {
      var dc = COLORS[gateColors[d + 1]];
      var dx2 = qx + d * (dotR * 2.75);
      var dr = dotR * (1 - d * 0.07);
      ctx.globalAlpha = 0.82 - d * 0.14;
      ctx.fillStyle = dc.fill;
      ctx.beginPath(); ctx.arc(dx2, cy, dr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.arc(dx2 - dr * 0.22, cy - dr * 0.22, dr * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Count badge (top-right)
    var br2 = bh * 0.155;
    var bbx = x + gateW - br2 * 0.85;
    var bby = y + br2 * 0.85;
    ctx.fillStyle = 'rgba(255,215,80,0.94)';
    ctx.beginPath(); ctx.arc(bbx, bby, br2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(190,148,20,0.65)';
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.arc(bbx, bby, br2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2A1800';
    ctx.font = 'bold ' + (br2 * 1.3) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(gateColors.length, bbx, bby + 0.5);

  } else {
    // Exhausted: dim cross
    var cx = x + gateW / 2, cy = y + bh / 2;
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(200,185,165,0.7)';
    ctx.lineWidth = 2 * S;
    var cs = bh * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx - cs, cy - cs); ctx.lineTo(cx + cs, cy + cs);
    ctx.moveTo(cx + cs, cy - cs); ctx.lineTo(cx - cs, cy + cs);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(80,70,65,0.3)';
    ctx.lineWidth = 1.5 * S;
    rRect(x, y, gateW, bh, 8 * S);
    ctx.stroke();

    // Empty badge
    var br2 = bh * 0.155;
    var bbx = x + gateW - br2 * 0.85;
    var bby = y + br2 * 0.85;
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = 'rgba(120,110,100,0.55)';
    ctx.beginPath(); ctx.arc(bbx, bby, br2 * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#888';
    ctx.font = 'bold ' + (br2 * 1.2) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('0', bbx, bby + 0.5);
    ctx.globalAlpha = 1;
  }

  // Pillar posts
  var pw = 5 * S;
  ctx.fillStyle = active ? 'rgba(110,90,160,0.5)' : 'rgba(70,60,55,0.38)';
  rRect(x, y, pw, bh, 4 * S); ctx.fill();
  rRect(x + gateW - pw, y, pw, bh, 4 * S); ctx.fill();

  ctx.restore();
}
