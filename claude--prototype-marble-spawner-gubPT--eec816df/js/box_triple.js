// ============================================================
// box_triple.js — Triple box type
// Spawns 3x the normal number of marbles when tapped.
// Visually displays an "x3" badge over the marble grid.
// ============================================================

var TRIPLE_MULT = 3;

registerBoxType('triple', {
  label: 'Triple',
  editorColor: '#D4A017',

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
    // Gold tint overlay
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#D4A017';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // x3 label
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.32) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('x3', x + w / 2, y + h / 2);
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
    // Gold tint
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#D4A017';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      // Cap visual marbles at 9
      var displayRem = Math.min(remaining, MRB_PER_BOX);
      drawBoxMarbles(ci, displayRem);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
      // x3 badge
      drawTripleBadge(ctx, w, h, S);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',#D4A017,' + c.dark + ')',
      borderColor: '#B8860B'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:9px">x3</span>';
  }
});

function drawTripleBadge(ctx, w, h, S) {
  ctx.save();
  var bw = w * 0.42, bh = h * 0.22;
  var bx = -bw / 2, by = -h / 2 + 2 * S;
  ctx.fillStyle = 'rgba(212,160,23,0.85)';
  rRect(bx, by, bw, bh, 4 * S); ctx.fill();
  ctx.font = 'bold ' + (h * 0.16) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('x3', 0, by + bh / 2);
  ctx.restore();
}
