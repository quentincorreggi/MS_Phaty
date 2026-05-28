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
    var bob = Math.sin(tick * 0.055) * 3 * S;
    var cr = w * 0.34;
    var cy = y - cr * 0.6 + bob;

    ctx.save();
    // Outer glow
    ctx.shadowColor = 'rgba(160,220,255,0.7)';
    ctx.shadowBlur = cr * 0.8;
    var grad = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.35, cr * 0.05, cx, cy, cr);
    grad.addColorStop(0, 'rgba(255,255,255,0.90)');
    grad.addColorStop(0.3, 'rgba(210,240,255,0.55)');
    grad.addColorStop(0.75, 'rgba(185,215,255,0.30)');
    grad.addColorStop(1, 'rgba(150,200,255,0.70)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    // Iridescent edge — shifts hue with tick
    var t = tick * 0.025;
    var ir = ~~(200 + Math.sin(t) * 55);
    var ig = ~~(200 + Math.sin(t + 2.1) * 55);
    var ib = ~~(220 + Math.sin(t + 4.2) * 35);
    ctx.strokeStyle = 'rgba(' + ir + ',' + ig + ',' + ib + ',0.85)';
    ctx.lineWidth = 2.5 * S;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();

    // White specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.beginPath(); ctx.arc(cx - cr * 0.27, cy - cr * 0.30, cr * 0.26, 0, Math.PI * 2); ctx.fill();

    // Secondary highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(cx + cr * 0.28, cy + cr * 0.22, cr * 0.12, 0, Math.PI * 2); ctx.fill();

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
