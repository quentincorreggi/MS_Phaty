// ============================================================
// box_cluster.js — Cluster box type
// A colored box that, when tapped, reveals 1-3 hidden boxes
// elsewhere on the grid that share the same color.
// Visually: shows its color with a pulsing ring + star icon.
// ============================================================

registerBoxType('cluster', {
  label: 'Cluster',
  editorColor: '#FFD700',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();

    // Pulsing outer ring
    var pulse = 0.5 + 0.5 * Math.sin(tick * 0.07 + idlePhase);
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    ctx.strokeStyle = c.fill;
    ctx.lineWidth = (3 + pulse * 2) * S;
    rRect(x - 3 * S, y - 3 * S, w + 6 * S, h + 6 * S, 9 * S);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Box background
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Border
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Star icon (✦ black four-pointed star)
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold ' + (h * 0.5) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\u2726', x + w / 2, y + h / 2);

    // Sparkle dots in corners, pulsing
    ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + pulse * 0.35) + ')';
    ctx.beginPath(); ctx.arc(x + w * 0.2, y + h * 0.18, 2.5 * S, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.8, y + h * 0.78, 2 * S, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.12;
    ctx.save();
    ctx.scale(popScale, popScale);

    drawBox(x, y, w, h, ci);

    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.4);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }

    // Star fades out as reveal progresses
    if (phase < 0.55) {
      ctx.globalAlpha = Math.max(0, (0.55 - phase) / 0.55) * 0.8;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = 'bold ' + (h * 0.5) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u2726', x + w / 2, y + h / 2);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#FFD700'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:rgba(255,255,255,0.9);text-shadow:0 0 4px #FFD700">&#10022;</span>';
  }
});
