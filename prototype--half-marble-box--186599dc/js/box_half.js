// ============================================================
// box_half.js — Half Marble box type
// Closed: greyed box with a floating ghost icon on top.
// Reveal: brightens and reveals visibly-HALF marbles.
// The half-marbles ride the belt but cannot sort on their own.
// Two halves of the same color combine into one full marble
// (see halfmerge.js), which then sorts normally.
// ============================================================

registerBoxType('half', {
  label: 'Half',
  editorColor: '#3FB8AF',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.45;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Desaturation overlay
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // Floating ghost icon on top
    var bob = Math.sin(tick * 0.05 + (idlePhase || 0)) * h * 0.035;
    ctx.globalAlpha = 0.9;
    ctx.font = 'bold ' + (h * 0.44) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('👻', x + w / 2, y + h / 2 + bob);
    ctx.restore();
  },

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
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarblesWithHalves(ci, remaining, HALF_PER_BOX);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    // Split swatch — solid color on the left, faded on the right — to
    // signal "half", with a teal border matching the toolbar accent.
    return {
      background: 'linear-gradient(90deg,' + c.fill + ' 0%,' + c.fill + ' 50%,' + c.light + ' 50%,' + c.light + ' 100%)',
      borderColor: '#3FB8AF'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">◐</span>';
  }
});
