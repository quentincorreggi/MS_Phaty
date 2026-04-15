// ============================================================
// box_lowgrav.js — Low-Gravity box type
// Closed: cyan/sky gradient with moon icon, gentle bob
// Reveal: soft pop with a cyan "floaty" shimmer
// Marbles from this box fall at PHYS_LOW_GRAVITY until they
// reach the belt (flag set in physics.js).
// ============================================================

var LOWGRAV_LIGHT = '#BCE7FF';
var LOWGRAV_MID   = '#7FD8FF';
var LOWGRAV_DARK  = '#3A8FD9';

registerBoxType('lowgrav', {
  label: 'Low Gravity',
  editorColor: LOWGRAV_MID,

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    var bob = Math.sin(tick * 0.05 + idlePhase) * 1.2 * S;
    ctx.save();
    ctx.translate(0, bob);

    // Soft cyan body tinted with the color ci
    ctx.shadowColor = 'rgba(60,140,210,0.35)';
    ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 2 * S;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, LOWGRAV_LIGHT);
    grad.addColorStop(1, LOWGRAV_DARK);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Color hint strip along the bottom so the player still sees which
    // color marbles are inside
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); rRect(x, y, w, h, 6 * S); ctx.clip();
    ctx.fillStyle = c.fill;
    ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    ctx.restore();

    ctx.strokeStyle = '#2B6FA8'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Floating "moon" icon
    var cx = x + w / 2, cy = y + h * 0.42;
    var mr = h * 0.22;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 6 * S;
    ctx.fillStyle = '#FBFDFF';
    ctx.beginPath(); ctx.arc(cx, cy, mr, 0, Math.PI * 2); ctx.fill();
    // Crescent cutout
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx + mr * 0.4, cy - mr * 0.15, mr * 0.92, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // Tiny drifting sparkle dots
    for (var i = 0; i < 3; i++) {
      var sp = (tick * 0.015 + idlePhase + i * 2) % 1;
      var sx = x + (0.2 + ((i * 37) % 100) / 100 * 0.6) * w;
      var sy = y + h - sp * h * 0.9;
      ctx.globalAlpha = 0.6 * (1 - sp);
      ctx.fillStyle = '#EAF6FF';
      ctx.beginPath(); ctx.arc(sx, sy, 1.2 * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    // Soft pop: fades closed cyan → normal colored box while marbles appear
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.12;
    ctx.save();
    ctx.scale(popScale, popScale);
    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
      ctx.globalAlpha = phase * 2;
    }
    drawBox(x, y, w, h, ci);
    // Thin cyan outline so the player remembers it's a low-grav box
    ctx.strokeStyle = 'rgba(127,216,255,0.85)';
    ctx.lineWidth = 2 * S;
    rRect(x + 1 * S, y + 1 * S, w - 2 * S, h - 2 * S, 5 * S); ctx.stroke();
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
      background: 'linear-gradient(135deg,' + LOWGRAV_LIGHT + ' 0%,' + LOWGRAV_MID + ' 55%,' + c.fill + ' 100%)',
      borderColor: LOWGRAV_DARK
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:11px">\u263D' + CLR_NAMES[ci][0].toUpperCase() + '</span>';
  }
});
