// ============================================================
// box_toggle.js — Toggle box type
// Starts every level LOCKED. Any tap on a non-toggle box
// flips all toggle boxes (locked → unlocked, unlocked → locked).
// Tap the toggle box while it's unlocked to release its marbles.
// ============================================================

registerBoxType('toggle', {
  label: 'Toggle',
  editorColor: '#E8B84C',

  // ── Overlay drawn on top of revealed toggle boxes ──
  // locked=true → dim overlay + padlock
  // locked=false → gold pulsing border + open-lock icon
  drawToggleOverlay: function (ctx, x, y, w, h, S, locked, unlockT, tick) {
    ctx.save();
    if (locked) {
      // Dim semi-transparent overlay
      ctx.fillStyle = 'rgba(40,30,20,0.58)';
      rRect(x, y, w, h, 6 * S); ctx.fill();
      // Dark border
      ctx.strokeStyle = 'rgba(60,45,25,0.65)';
      ctx.lineWidth = 2 * S;
      rRect(x, y, w, h, 6 * S); ctx.stroke();
      // Padlock icon
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold ' + (h * 0.38) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\uD83D\uDD12', x + w / 2, y + h / 2);
    } else {
      // Gold glow border pulsing
      var pulse = Math.sin(tick * 0.14) * 0.25 + 0.75;
      ctx.strokeStyle = 'rgba(255,195,50,' + pulse + ')';
      ctx.lineWidth = 3.5 * S;
      ctx.shadowColor = 'rgba(255,195,50,0.7)';
      ctx.shadowBlur = 10 * S;
      rRect(x, y, w, h, 6 * S); ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      // Unlock flash on transition
      if (unlockT > 0) {
        ctx.globalAlpha = unlockT * 0.35;
        ctx.fillStyle = 'rgba(255,220,80,1)';
        rRect(x, y, w, h, 6 * S); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Open-lock icon in corner
      ctx.globalAlpha = 0.85;
      ctx.font = 'bold ' + (h * 0.26) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,210,50,1)';
      ctx.fillText('\uD83D\uDD13', x + w * 0.78, y + h * 0.22);
    }
    ctx.restore();
  },

  // ── Fallback closed draw (toggle boxes start revealed, so rarely called) ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.globalAlpha = 0.4;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#E8B84C'; ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);
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
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#E8B84C'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#E8B84C">&#128274;</span>';
  }
});
