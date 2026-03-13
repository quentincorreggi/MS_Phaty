// ============================================================
// box_x2.js — X2 box type
// Spawns double the marbles (2 * MRB_PER_BOX) when tapped.
// Visually distinguished by a gold border and "x2" label.
// ============================================================

registerBoxType('x2', {
  label: 'X2',
  editorColor: '#DAA520',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];

    ctx.save();

    // Base colored box (slightly desaturated like default closed)
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.50;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Desaturation overlay
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();

    // Gold border
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#DAA520'; ctx.lineWidth = 2.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // "x2" label
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold ' + (h * 0.32) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('x2', x + w / 2, y + h / 2);

    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.12;
    ctx.save();
    ctx.scale(popScale, popScale);

    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
      ctx.globalAlpha = phase * 2;
    }

    drawBox(x, y, w, h, ci);

    // Gold border on revealed box
    ctx.globalAlpha = 0.5 * (1 - phase * 0.5);
    ctx.strokeStyle = '#DAA520'; ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarblesX2(ci, remaining, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#DAA520'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">' + CLR_NAMES[ci][0].toUpperCase() + '<span style="color:#FFD700;font-size:8px;font-weight:bold">x2</span></span>';
  }
});
