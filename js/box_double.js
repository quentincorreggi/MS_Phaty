// ============================================================
// box_double.js — Double Marbles box type
// Spawns 2x the normal number of marbles when tapped.
// Visually shows a "x2" badge so the player can plan around it.
// ============================================================

registerBoxType('double', {
  label: 'Double',
  editorColor: '#FFD700',

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
    ctx.fillStyle = '#FFD700';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    // Desaturation overlay
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#B8960F'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // Lock icon
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.3) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDD12', x + w / 2, y + h / 2);
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
    // Gold border to distinguish from normal boxes
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  // Draw the gold border and x2 badge on a revealed, tappable double box
  drawOverlay: function (ctx, x, y, w, h, S, tick) {
    ctx.save();
    // Pulsing gold border
    var pulse = Math.sin(tick * 0.08) * 0.15 + 0.85;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // x2 badge in top-right corner
    var badgeR = w * 0.22;
    var bx = x + w - badgeR * 0.6;
    var by = y + badgeR * 0.6;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#B8960F'; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#5A3800';
    ctx.font = 'bold ' + (badgeR * 1.1) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('x2', bx, by + 1 * S);
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
    return '<span class="ed-cell-dot" style="text-shadow:0 0 4px rgba(255,215,0,0.8)">x2</span>';
  }
});
