// ============================================================
// box_key.js — Key box type (Secret Customers)
// Closed: golden/amber box with scissors icon
// Reveal: transition from golden shell to colored box
// When tapped: spawns marbles AND lifts the curtain
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
    // Scissors icon
    var iconS = Math.min(w, h) * 0.22;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold ' + (iconS * 2) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\u2702', x + w / 2, y + h / 2);
    // Subtle sparkle
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
      // Golden shell fading out
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
      ctx.globalAlpha = phase * 2;
    }
    // Colored box fading in
    drawBox(x, y, w, h, ci);
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    // Key badge persists during reveal
    if (phase > 0.4) {
      ctx.globalAlpha = Math.min(0.7, (phase - 0.4) / 0.3 * 0.7);
      var badgeR = Math.min(w, h) * 0.15;
      ctx.fillStyle = 'rgba(255,200,50,0.85)';
      ctx.beginPath(); ctx.arc(x + w - badgeR * 0.8, y + badgeR * 0.8, badgeR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold ' + (badgeR * 1.2) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u2702', x + w - badgeR * 0.8, y + badgeR * 0.8);
      ctx.globalAlpha = 1;
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
    var c = COLORS[ci];
    return '<span class="ed-cell-dot" style="font-size:13px;text-shadow:0 1px 2px rgba(0,0,0,0.3)">\u2702</span>' +
      '<span style="position:absolute;bottom:1px;right:2px;width:8px;height:8px;border-radius:50%;background:' + c.fill + ';border:1px solid rgba(255,255,255,0.5)"></span>';
  }
});
