// ============================================================
// box_shockwave.js — Shockwave Box type
// On tap: releases 9 marbles normally AND emits a seismic wave
// along a designer-defined path that opens a linked target box.
// ============================================================

registerBoxType('shockwave', {
  label: 'Shockwave',
  editorColor: '#3B2D8F',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    ctx.save();

    // Deep indigo base
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#5A4AB0');
    grad.addColorStop(1, '#2A1F6F');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();

    // Pulsing orange border
    var pulse = Math.sin(tick * 0.06 + idlePhase) * 0.5 + 0.5;
    ctx.strokeStyle = 'rgba(255,150,30,' + (0.5 + pulse * 0.4) + ')';
    ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Inner glow shimmer
    var shimGrad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.35, 0, x + w * 0.5, y + h * 0.5, w * 0.6);
    shimGrad.addColorStop(0, 'rgba(120,90,220,' + (0.15 + pulse * 0.15) + ')');
    shimGrad.addColorStop(1, 'rgba(120,90,220,0)');
    ctx.fillStyle = shimGrad;
    rRect(x, y, w, h, 6 * S); ctx.fill();

    // Lightning bolt
    var boltColor = 'rgba(255,' + Math.round(140 + pulse * 60) + ',30,' + (0.8 + pulse * 0.2) + ')';
    ctx.strokeStyle = boltColor;
    ctx.lineWidth = 2.5 * S;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var cx = x + w / 2, cy = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.08,  y + h * 0.10);
    ctx.lineTo(cx - w * 0.10,  cy - h * 0.04);
    ctx.lineTo(cx + w * 0.08,  cy - h * 0.02);
    ctx.lineTo(cx - w * 0.08,  y + h * 0.90);
    ctx.stroke();

    // Ground crack lines at bottom edge
    ctx.strokeStyle = 'rgba(255,160,30,0.35)';
    ctx.lineWidth = 1 * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.12, y + h * 0.86);
    ctx.lineTo(x + w * 0.30, y + h * 0.94);
    ctx.moveTo(x + w * 0.48, y + h * 0.90);
    ctx.lineTo(x + w * 0.68, y + h * 0.83);
    ctx.moveTo(x + w * 0.65, y + h * 0.91);
    ctx.lineTo(x + w * 0.86, y + h * 0.87);
    ctx.stroke();

    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.08;
    ctx.save();
    ctx.scale(popScale, popScale);
    drawBox(x, y, w, h, ci);
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    return {
      background: 'linear-gradient(135deg,#5A4AB0,#2A1F6F)',
      borderColor: '#FF961E'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#FF961E;text-shadow:0 0 4px rgba(255,150,30,0.9)">&#9889;</span>';
  }
});
