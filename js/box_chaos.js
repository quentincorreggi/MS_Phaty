// ============================================================
// box_chaos.js — Chaos Funnel box type
// Tapping this box activates a 10-second chaos effect:
//   • The funnel exit point drifts left and right
//   • The funnel opening pulses wider and narrower
// The box itself spawns marbles normally.
// ============================================================

registerBoxType('chaos', {
  label: 'Chaos',
  editorColor: '#8B4DB8',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    ctx.save();
    // Deep purple gradient background
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#C080F0'); grad.addColorStop(1, '#5A22A0');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Animated shimmer
    var pulse = Math.sin(tick * 0.07 + idlePhase) * 0.12 + 0.22;
    ctx.fillStyle = 'rgba(200,120,255,' + pulse + ')';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    // Border
    ctx.strokeStyle = '#9040C0'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // Triple-wave symbol
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold ' + (h * 0.38) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\u224B', x + w / 2, y + h / 2);
    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);
    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
    }
    ctx.globalAlpha = phase < 0.5 ? phase * 2 : 1;
    // Purple box body
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#C080F0'); grad.addColorStop(1, '#5A22A0');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.strokeStyle = '#9040C0'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
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
      background: 'linear-gradient(135deg, #C080F0, #5A22A0)',
      borderColor: '#9040C0'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:white">\u224B</span>';
  }
});
