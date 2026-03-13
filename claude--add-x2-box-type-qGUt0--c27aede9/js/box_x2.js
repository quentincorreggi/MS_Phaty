// ============================================================
// box_x2.js — X2 box type
// Holds double the marbles of a regular box (MRB_PER_BOX * 2).
// Displays a bold "x2" label and gold border to stand out.
// ============================================================

registerBoxType('x2', {
  label: 'X2',
  editorColor: '#DAA520',

  // ── Closed state: gold-bordered box with "x2" label ──
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
    // Gold border
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#DAA520'; ctx.lineWidth = 4 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // "x2" label
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.35) + 'px sans-serif';
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
    // Gold border accent on revealed box
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#DAA520'; ctx.lineWidth = 3.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarblesX2(ci, remaining);
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
    return '<span class="ed-cell-dot" style="text-shadow:0 0 4px rgba(218,165,32,0.8);font-size:10px">x2</span>';
  }
});
