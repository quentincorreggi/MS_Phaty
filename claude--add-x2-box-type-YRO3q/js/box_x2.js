// ============================================================
// box_x2.js — X2 box type
// Holds double the normal marble count (MRB_PER_BOX * 2).
// Visually: base color + gold border + bold "x2" label when closed.
// Strategic: floods the belt with more marbles in one tap.
// ============================================================

registerBoxType('x2', {
  label: 'X2',
  editorColor: '#D4A017',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();

    // Base color gradient (slightly desaturated like default)
    ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.5;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Desaturation overlay
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();

    // Gold border — 2.5px, pulsing slightly
    var pulse = Math.sin(tick * 0.04 + idlePhase) * 0.15 + 0.85;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#D4A017';
    ctx.lineWidth = 2.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Inner gold glow strip along top edge
    ctx.globalAlpha = 0.18 * pulse;
    var glowGrad = ctx.createLinearGradient(x, y, x, y + h * 0.45);
    glowGrad.addColorStop(0, '#FFD700');
    glowGrad.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = glowGrad;
    rRect(x, y, w, h * 0.45, 6 * S); ctx.fill();

    // Bold "x2" label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 3 * S;
    ctx.shadowOffsetY = 1 * S;
    ctx.font = 'bold ' + (h * 0.42) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x2', x + w / 2, y + h / 2);

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

    // Draw a gold border on the opened box too
    ctx.globalAlpha = Math.max(0, 1 - phase * 1.5) * 0.7;
    ctx.strokeStyle = '#D4A017';
    ctx.lineWidth = 2.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      // Map X2 remaining (0..MRB_PER_BOX*2) to visual (0..MRB_PER_BOX)
      var visualRemaining = Math.min(remaining, MRB_PER_BOX);
      drawBoxMarbles(ci, visualRemaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  // Custom marble draw for the revealed-open state in rendering.js
  drawBoxMarbles: function (ci, remaining, b) {
    // Map X2 remaining (0..MRB_PER_BOX*2) to visual (0..MRB_PER_BOX)
    var visualRemaining = Math.min(remaining, MRB_PER_BOX);
    drawBoxMarbles(ci, visualRemaining);
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#D4A017'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#FFD700;text-shadow:0 1px 3px rgba(0,0,0,0.4)">X2</span>';
  }
});
