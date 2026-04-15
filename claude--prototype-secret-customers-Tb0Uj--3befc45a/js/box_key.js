// ============================================================
// box_key.js — Key box type (Secret Customers)
// Closed: golden/amber box shell (scissors drawn by rendering.js
//   using the box's keyColor, which is independent of ci)
// Reveal: transition from golden shell to colored box
// When tapped: spawns marbles AND lifts the matching curtain
// ============================================================

registerBoxType('key', {
  label: 'Key',
  editorColor: '#E8A84C',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#FFD966'); grad.addColorStop(1, '#C4890E');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#A06A00'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // Shimmer highlight
    var shimmer = 0.08 + Math.sin(tick * 0.06 + idlePhase) * 0.04;
    ctx.globalAlpha = shimmer;
    ctx.fillStyle = '#fff';
    rRect(x + w * 0.1, y + h * 0.08, w * 0.35, h * 0.2, 3 * S); ctx.fill();
    ctx.globalAlpha = 1;
    // Sparkle (scissors drawn externally via keyColor)
    ctx.fillStyle = 'rgba(255,220,100,0.15)';
    var sparkleX = x + w * 0.75 + Math.sin(tick * 0.04) * w * 0.05;
    var sparkleY = y + h * 0.2 + Math.cos(tick * 0.05) * h * 0.05;
    ctx.beginPath(); ctx.arc(sparkleX, sparkleY, w * 0.06, 0, Math.PI * 2); ctx.fill();
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
      background: 'linear-gradient(135deg, #FFD966, #C4890E)',
      borderColor: '#A06A00'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:13px;text-shadow:0 1px 2px rgba(0,0,0,0.3)">\u2702</span>';
  }
});
