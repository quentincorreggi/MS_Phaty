// ============================================================
// box_firebox.js — Firebox box type
// A special box that contains no marbles. When tapped, it
// launches a firework that detonates and randomly activates
// 2-3 other revealed boxes on the grid.
// ============================================================

registerBoxType('firebox', {
  label: 'Firebox',
  editorColor: '#E8502A',

  // ── Closed state: orange-red box with rocket icon ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    ctx.save();
    // Dark silhouette box
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#C04828');
    grad.addColorStop(1, '#882010');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    // Rocket icon
    drawFireboxIcon(ctx, x + w / 2, y + h / 2, w, h, S, tick, 0.6);
    ctx.restore();
  },

  // ── Reveal animation ──
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.08;
    ctx.save();
    ctx.scale(popScale, popScale);
    // Draw the firebox body
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#FF6A3D');
    grad.addColorStop(1, '#CC3A18');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#A02810'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // Rocket icon
    if (phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawFireboxIcon(ctx, x + w / 2, y + h / 2, w, h, S, tick, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    return {
      background: 'linear-gradient(135deg, #FF6A3D, #CC3A18)',
      borderColor: '#E8502A'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="text-shadow:0 0 4px rgba(255,100,40,0.8)">&#127846;</span>';
  }
});

// ── Shared firebox icon drawing ──
function drawFireboxIcon(ctx, cx, cy, w, h, S, tick, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;

  var sz = Math.min(w, h) * 0.28;

  // Rocket body (triangle pointing up)
  ctx.fillStyle = '#FFD040';
  ctx.beginPath();
  ctx.moveTo(cx, cy - sz);
  ctx.lineTo(cx - sz * 0.5, cy + sz * 0.4);
  ctx.lineTo(cx + sz * 0.5, cy + sz * 0.4);
  ctx.closePath();
  ctx.fill();

  // Rocket nose
  ctx.fillStyle = '#FF4020';
  ctx.beginPath();
  ctx.moveTo(cx, cy - sz);
  ctx.lineTo(cx - sz * 0.2, cy - sz * 0.4);
  ctx.lineTo(cx + sz * 0.2, cy - sz * 0.4);
  ctx.closePath();
  ctx.fill();

  // Spark lines (animated)
  ctx.strokeStyle = '#FFE080';
  ctx.lineWidth = 1.5 * S;
  ctx.lineCap = 'round';
  var sparkPhase = tick * 0.12;
  for (var i = 0; i < 3; i++) {
    var angle = sparkPhase + i * Math.PI * 2 / 3;
    var sx = cx + Math.cos(angle) * sz * 0.8;
    var sy = cy + Math.sin(angle) * sz * 0.8;
    var ex = cx + Math.cos(angle) * sz * 1.2;
    var ey = cy + Math.sin(angle) * sz * 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.restore();
}
