// ============================================================
// switch.js — Switch cell type
// A special interactive grid cell that toggles all ColorSwap
// boxes between their primary and secondary colors when tapped.
// Switches don't contain marbles and can be tapped repeatedly.
// ============================================================

var SWITCH_DIR_ARROWS = { top: '\u25B2', bottom: '\u25BC', left: '\u25C0', right: '\u25B6' };

function drawSwitchOnGrid(ctx, x, y, w, h, S, tick, pressT) {
  ctx.save();

  // Base — dark rounded rect with metallic feel
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;

  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#5A5068');
  grad.addColorStop(0.5, '#484058');
  grad.addColorStop(1, '#3A3248');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 6 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = 'rgba(200,180,255,0.35)';
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 6 * S);
  ctx.stroke();

  // Pulsing glow ring
  var glow = 0.15 + Math.sin(tick * 0.05) * 0.1;
  ctx.strokeStyle = 'rgba(200,180,255,' + glow + ')';
  ctx.lineWidth = 2 * S;
  rRect(x + 3 * S, y + 3 * S, w - 6 * S, h - 6 * S, 4 * S);
  ctx.stroke();

  // Press animation — flash white
  if (pressT > 0) {
    ctx.fillStyle = 'rgba(200,180,255,' + pressT * 0.5 + ')';
    rRect(x, y, w, h, 6 * S);
    ctx.fill();
  }

  // Swap icon — two curved arrows
  var cx = x + w / 2;
  var cy = y + h / 2;
  var iconS = w * 0.2;

  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2 * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Top arrow (left to right)
  ctx.beginPath();
  ctx.moveTo(cx - iconS, cy - iconS * 0.5);
  ctx.lineTo(cx + iconS * 0.5, cy - iconS * 0.5);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(cx + iconS * 0.1, cy - iconS);
  ctx.lineTo(cx + iconS * 0.5, cy - iconS * 0.5);
  ctx.lineTo(cx + iconS * 0.1, cy);
  ctx.stroke();

  // Bottom arrow (right to left)
  ctx.beginPath();
  ctx.moveTo(cx + iconS, cy + iconS * 0.5);
  ctx.lineTo(cx - iconS * 0.5, cy + iconS * 0.5);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(cx - iconS * 0.1, cy);
  ctx.lineTo(cx - iconS * 0.5, cy + iconS * 0.5);
  ctx.lineTo(cx - iconS * 0.1, cy + iconS);
  ctx.stroke();

  // Label
  ctx.fillStyle = 'rgba(200,180,255,0.6)';
  ctx.font = 'bold ' + (7 * S) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('SWAP', cx, y + h - 3 * S);

  ctx.restore();
}
