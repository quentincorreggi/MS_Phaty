// ============================================================
// box_heavy.js — Heavy box type
// Marbles spawned from this box carry an anchor that makes
// them fall faster than normal marbles. The anchor detaches
// when the marble enters the funnel (y >= L.funnelTop).
// ============================================================

// Extra gravity multiplier applied to heavy marbles (on top of PHYS_GRAVITY).
var HEAVY_GRAVITY_MULT = 3.2;

// Shared anchor drawing helper used by closed/open boxes and by
// the in-flight heavy marbles in rendering.js.
function drawAnchorIcon(ctx, cx, cy, size, color, lineWidth) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth || Math.max(1, size * 0.14);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var r = size * 0.5;
  // Top ring
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.65, r * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  // Vertical shaft
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.45);
  ctx.lineTo(cx, cy + r * 0.6);
  ctx.stroke();
  // Crossbar
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.38, cy - r * 0.18);
  ctx.lineTo(cx + r * 0.38, cy - r * 0.18);
  ctx.stroke();
  // Bottom flukes (curving up from the tips)
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy + r * 0.25);
  ctx.quadraticCurveTo(cx - r * 0.55, cy + r * 0.75, cx, cy + r * 0.68);
  ctx.quadraticCurveTo(cx + r * 0.55, cy + r * 0.75, cx + r * 0.55, cy + r * 0.25);
  ctx.stroke();
  ctx.restore();
}

function drawBoxMarblesWithAnchors(ci, remaining, S) {
  if (remaining <= 0) return;
  var mr = Math.min(7 * S, L.bw / 8.5);
  var mg = Math.min(14 * S, L.bw / 4.2);
  var mgY = mg * MRB_GAP_FACTOR;
  var gone = MRB_PER_BOX - remaining;
  var mrbsToDraw = [];
  for (var si = gone; si < MRB_PER_BOX; si++) mrbsToDraw.push(SNAKE_ORDER[si]);
  mrbsToDraw.sort(function (a, b) { return a.r - b.r; });
  for (var si = 0; si < mrbsToDraw.length; si++) {
    var sp = mrbsToDraw[si];
    var mx = (sp.c - 1) * mg;
    var my = (sp.r - 1) * mgY - 2 * S;
    drawMarble(mx, my, mr, ci);
    // Tiny anchor mark on top of each marble
    drawAnchorIcon(ctx, mx, my, mr * 1.4, 'rgba(255,255,255,0.9)', Math.max(1, mr * 0.22));
  }
}

registerBoxType('heavy', {
  label: 'Heavy',
  editorColor: '#3D3530',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();

    // Base colored body (slightly desaturated)
    ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
    ctx.globalAlpha = 0.55;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Heavy darkening tint — makes it look weighty
    ctx.globalAlpha = 0.28;
    var darkGrad = ctx.createLinearGradient(x, y, x, y + h);
    darkGrad.addColorStop(0, 'rgba(20,16,12,0.4)');
    darkGrad.addColorStop(1, 'rgba(20,16,12,0.85)');
    ctx.fillStyle = darkGrad;
    rRect(x, y, w, h, 6 * S); ctx.fill();

    // Border
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Anchor icon centered
    ctx.globalAlpha = 0.92;
    drawAnchorIcon(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.5, '#F0EAD8',
      Math.max(1.5, Math.min(w, h) * 0.06));

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
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarblesWithAnchors(ci, remaining, S);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ' 0%,#3D3530 100%)',
      borderColor: '#1a1410'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:14px;color:#F0EAD8">⚓</span>';
  }
});
