// ============================================================
// box_parachute.js — Parachute box type
// Releases marbles encased in soap bubbles that fall slowly
// with a gentle sinusoidal drift (leaf-fall physics).
// ============================================================

registerBoxType('parachute', {
  label: 'Parachute',
  editorColor: '#A8D8FF',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.5;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Iridescent shimmer overlay
    var shimmerShift = (tick * 0.015) % 1;
    var sheen = ctx.createLinearGradient(x, y, x + w, y + h);
    sheen.addColorStop(shimmerShift % 1, 'rgba(255,180,255,0.18)');
    sheen.addColorStop((shimmerShift + 0.33) % 1, 'rgba(180,240,255,0.18)');
    sheen.addColorStop((shimmerShift + 0.66) % 1, 'rgba(180,255,200,0.18)');
    ctx.fillStyle = sheen;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(160,210,255,0.75)'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
    this._drawBubbleCrown(ctx, x, y, w, h, S, tick);
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);
    drawBox(x, y, w, h, ci);
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
    var crownAlpha = Math.max(0, 1 - phase * 2);
    if (crownAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = crownAlpha;
      this._drawBubbleCrown(ctx, x, y, w, h, S, tick);
      ctx.restore();
    }
  },

  _drawBubbleCrown: function (ctx, x, y, w, h, S, tick) {
    var cx = x + w / 2;
    var bob = Math.sin(tick * 0.055) * 2.5 * S;
    var cr = w * 0.21;
    var cy = y - cr * 0.55 + bob;

    ctx.save();
    var grad = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.35, cr * 0.08, cx, cy, cr);
    grad.addColorStop(0, 'rgba(255,255,255,0.65)');
    grad.addColorStop(0.35, 'rgba(200,235,255,0.22)');
    grad.addColorStop(0.8, 'rgba(190,210,255,0.10)');
    grad.addColorStop(1, 'rgba(160,205,255,0.42)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();

    // Iridescent edge — shifts hue with tick
    var t = tick * 0.025;
    var ir = ~~(210 + Math.sin(t) * 40);
    var ig = ~~(210 + Math.sin(t + 2.1) * 40);
    var ib = ~~(220 + Math.sin(t + 4.2) * 30);
    ctx.strokeStyle = 'rgba(' + ir + ',' + ig + ',' + ib + ',0.55)';
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();

    // White specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath(); ctx.arc(cx - cr * 0.27, cy - cr * 0.30, cr * 0.22, 0, Math.PI * 2); ctx.fill();

    // Tiny secondary highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(cx + cr * 0.28, cy + cr * 0.22, cr * 0.10, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#A8D8FF'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="text-shadow:0 0 5px rgba(160,220,255,0.9)">&#11096;</span>';
  }
});
