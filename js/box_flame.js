// ============================================================
// box_flame.js — Flamethrower box type
// A single-use utility box. Contains no marbles. When tapped,
// it thaws every frozen marble in the level (on the belt, in
// flight, and still inside un-tapped freeze boxes), and is
// consumed. Has no color — ignored for sorting.
// ============================================================

registerBoxType('flame', {
  label: 'Flame',
  editorColor: '#FF6B2E',

  // Used by drawClosed/drawReveal/open state to render the box body.
  drawFlameBody: function (ctx, x, y, w, h, S, tick, dim) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
    if (dim) ctx.globalAlpha = 0.55;
    // Hot orange/red metal body
    var bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
    bodyGrad.addColorStop(0, '#FFB07A');
    bodyGrad.addColorStop(0.5, '#FF7A3D');
    bodyGrad.addColorStop(1, '#C84A1E');
    ctx.fillStyle = bodyGrad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#8E2A12';
    ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
  },

  // Animated flame icon (used for closed reveal + open state)
  drawFlameIcon: function (ctx, cx, cy, size, S, tick, alpha) {
    if (alpha === undefined) alpha = 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Flicker
    var flick = Math.sin(tick * 0.18) * 0.06;
    var hScale = 1 + flick;

    // Outer orange flame body
    var outerGrad = ctx.createRadialGradient(cx, cy + size * 0.2, size * 0.05, cx, cy, size * 0.95);
    outerGrad.addColorStop(0, 'rgba(255,235,140,1)');
    outerGrad.addColorStop(0.45, 'rgba(255,170,60,1)');
    outerGrad.addColorStop(1, 'rgba(220,80,30,0.0)');
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * hScale);
    ctx.bezierCurveTo(cx + size * 0.7, cy - size * 0.4, cx + size * 0.55, cy + size * 0.5, cx, cy + size * 0.55);
    ctx.bezierCurveTo(cx - size * 0.55, cy + size * 0.5, cx - size * 0.7, cy - size * 0.4, cx, cy - size * hScale);
    ctx.closePath();
    ctx.fill();

    // Inner yellow core
    ctx.fillStyle = 'rgba(255,250,180,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.55 * hScale);
    ctx.bezierCurveTo(cx + size * 0.35, cy - size * 0.15, cx + size * 0.28, cy + size * 0.3, cx, cy + size * 0.35);
    ctx.bezierCurveTo(cx - size * 0.28, cy + size * 0.3, cx - size * 0.35, cy - size * 0.15, cx, cy - size * 0.55 * hScale);
    ctx.closePath();
    ctx.fill();

    // Highlight spark
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx - size * 0.05, cy + size * 0.05, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    this.drawFlameBody(ctx, x, y, w, h, S, tick, true);
    // Dim flame icon
    this.drawFlameIcon(ctx, x + w / 2, y + h / 2, h * 0.28, S, tick, 0.4);
    // Lock icon
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.22) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔒', x + w / 2, y + h * 0.78);
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
    this.drawFlameBody(ctx, x, y, w, h, S, tick, false);
    this.drawFlameIcon(ctx, x + w / 2, y + h / 2, h * 0.34, S, tick, 1);
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    return {
      background: 'linear-gradient(135deg,#FFB07A,#C84A1E)',
      borderColor: '#8E2A12'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:13px;color:#FFE8A0;text-shadow:0 0 4px rgba(255,140,40,0.8)">🔥</span>';
  }
});
