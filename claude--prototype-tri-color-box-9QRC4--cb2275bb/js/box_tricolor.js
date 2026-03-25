// ============================================================
// box_tricolor.js — Tri-Color box type
// Contains 9 marbles across 3 distinct colors (3 of each).
// All 3 colors are visible on the box as 3 horizontal bands.
// ============================================================

registerBoxType('tricolor', {
  label: 'Tri-Color',
  editorColor: '#E8A84C',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase, box) {
    var ci2 = box && box.ci2 !== undefined ? box.ci2 : ci;
    var ci3 = box && box.ci3 !== undefined ? box.ci3 : ci;
    var colors = [ci, ci2, ci3];

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.55;

    // Clip to rounded rect and draw 3 bands
    rRect(x, y, w, h, 6 * S);
    ctx.save();
    ctx.clip();
    var bandH = h / 3;
    for (var i = 0; i < 3; i++) {
      var c = COLORS[colors[i]];
      var grad = ctx.createLinearGradient(x, y + i * bandH, x, y + (i + 1) * bandH);
      grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y + i * bandH, w, bandH + 1);
    }
    ctx.restore();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Desaturation overlay
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();

    // Border
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick, box) {
    var ci2 = box && box.ci2 !== undefined ? box.ci2 : ci;
    var ci3 = box && box.ci3 !== undefined ? box.ci3 : ci;
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);
    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0, box);
      ctx.globalAlpha = phase * 2;
    }
    drawTriColorBox(x, y, w, h, ci, ci2, ci3);
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarblesTriColor(ci, ci2, ci3, remaining);
      ctx.globalAlpha = 1;
      drawTriColorBoxLip(ci, ci2, ci3);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return { background: c.fill, borderColor: c.dark };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">T</span>';
  }
});
