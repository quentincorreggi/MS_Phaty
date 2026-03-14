// ============================================================
// box_double.js — Double box type
// Spawns 2x marbles (18 instead of 9). Gold/amber appearance
// with a "x2" badge so players know it's special.
// ============================================================

registerBoxType('double', {
  label: 'Double',
  editorColor: '#D4A017',

  // ── Closed: gold-tinted with shimmer and x2 label ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.50;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Gold overlay
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#D4A017';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    // Shimmer
    var shimmer = Math.sin(tick * 0.06 + idlePhase) * 0.08 + 0.12;
    ctx.globalAlpha = shimmer;
    ctx.fillStyle = '#FFD700';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    // Border
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // x2 label
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.3) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('x2', x + w / 2, y + h / 2);
    ctx.restore();
  },

  // ── Reveal animation ──
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);
    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
      ctx.globalAlpha = phase * 2;
    }
    drawBox(x, y, w, h, ci);
    // Gold tint on open box
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#FFD700';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      var visualRemaining = Math.ceil(remaining / 2);
      drawBoxMarbles(ci, visualRemaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#D4A017'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="text-shadow:0 0 4px rgba(212,160,23,0.8)">x2</span>';
  }
});
