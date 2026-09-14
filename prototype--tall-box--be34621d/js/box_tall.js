// ============================================================
// box_tall.js — Tall box type
// Takes up ONE grid cell like every other box — the maze treats it
// no differently — but is drawn twice as high and holds twice the
// marble load (18 at the default 9 per box).
//
// It stands on its own cell, where its lip is and where the marbles
// pour from, so the extra height rises into the row above. Tall
// boxes are drawn last (see drawStock) and carry a heavier shadow,
// so they read as standing in front of whatever they overlap.
// ============================================================

// Soft shadow cast on the neighbours a tall box overlaps
function drawTallShadow(ctx, x, y, w, h, S) {
  ctx.save();
  ctx.fillStyle = 'rgba(90,74,56,0.22)';
  ctx.shadowColor = 'rgba(60,45,30,0.4)';
  ctx.shadowBlur = 9 * S;
  ctx.shadowOffsetY = 3 * S;
  rRect(x + 1.5 * S, y + 2 * S, w - 3 * S, h, 6 * S);
  ctx.fill();
  ctx.restore();
}

// ── Seam + side ribs, drawn on top of the box body so a tall box
//    reads as one reinforced crate instead of two stacked boxes ──
function drawTallSeam(ctx, x, y, w, h, ci, S, alpha) {
  var c = COLORS[ci];
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  var midY = y + h / 2;

  // Horizontal seam across the middle
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1.5 * S;
  ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * 0.45;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.06, midY);
  ctx.lineTo(x + w * 0.94, midY);
  ctx.stroke();

  // Highlight just under the seam
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1 * S;
  ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * 0.5;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.06, midY + 1.5 * S);
  ctx.lineTo(x + w * 0.94, midY + 1.5 * S);
  ctx.stroke();

  // Side ribs — short vertical marks at the seam on both edges
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 2.5 * S;
  ctx.lineCap = 'round';
  ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * 0.4;
  var ribH = h * 0.06;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.06, midY - ribH); ctx.lineTo(x + w * 0.06, midY + ribH);
  ctx.moveTo(x + w * 0.94, midY - ribH); ctx.lineTo(x + w * 0.94, midY + ribH);
  ctx.stroke();

  ctx.restore();
}

registerBoxType('tall', {
  label: 'Tall',
  editorColor: '#C97B4A',
  isTall: true,

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    drawTallShadow(ctx, x, y, w, h, S);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.16)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
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
    drawTallSeam(ctx, x, y, w, h, ci, S, 0.35);
    // Lock icon
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (w * 0.3) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔒', x + w / 2, y + h / 2);
    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.08;
    ctx.save();
    ctx.scale(popScale, popScale);
    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
      ctx.globalAlpha = phase * 2;
    }
    drawTallShadow(ctx, x, y, w, h, S);
    drawBox(x, y, w, h, ci);
    drawTallSeam(ctx, x, y, w, h, ci, S);
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarblesStack(ci, remaining, MRB_PER_BOX * TALL_CELLS, TALL_SNAKE_ORDER, 3 * TALL_CELLS);
      ctx.globalAlpha = 1;
      drawBoxLipTall(ci, h);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#C97B4A'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">' + CLR_NAMES[ci][0].toUpperCase() + '</span>' +
      '<span class="ed-tunnel-badge" style="background:#C97B4A">&times;2</span>';
  }
});
