// ============================================================
// box_secondchance.js — 2nd Chance box type
//
// A box with two lives:
//   1st tap  → releases marbles into funnel normally, then enters
//               "waiting" state (silver shell, pulsing glow).
//   Waiting  → automatically absorbs marbles from the next box
//               tapped anywhere above it in the same column
//               (those marbles go into the shell, not the funnel).
//   Loaded   → shows stored marble color; tap again to release.
//   2nd tap  → releases stored marbles into funnel, box disappears.
//
// Strategic use: ideal for medium/hard levels where players need
// to hold back a batch of marbles and release at the right moment.
// Not recommended for easy "flow" levels.
// ============================================================

registerBoxType('secondchance', {
  label: '2nd Chance',
  editorColor: '#E8A84C',

  // ── Closed (hidden, not yet revealed) ──
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
    // Desaturation overlay
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#E8A84C'; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // Lock icon
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.3) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDD12', x + w / 2, y + h / 2);
    // Gold ↩ badge
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#FFD080';
    ctx.font = 'bold ' + (h * 0.26) + 'px sans-serif';
    ctx.fillText('\u21A9', x + w * 0.68, y + h * 0.28);
    ctx.restore();
  },

  // ── Reveal animation ──
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
      borderColor: '#E8A84C'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#FFD080;text-shadow:0 0 4px rgba(232,168,76,0.9)">\u21A9</span>';
  }
});

// ── Global rendering helpers (called from drawStock in rendering.js) ──

// Waiting state: silver hollow shell, pulsing amber border + ↩ icon
function drawSecondChanceWaiting(ctx, x, y, w, h, S, tick, hoverT) {
  ctx.save();
  var pulse = Math.sin(tick * 0.06) * 0.5 + 0.5; // 0..1

  // Silver-gray body
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(218,212,204,0.88)');
  grad.addColorStop(1, 'rgba(178,170,160,0.88)');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.10)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
  rRect(x, y, w, h, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Pulsing dashed amber border
  ctx.strokeStyle = 'rgba(232,168,76,' + (0.4 + pulse * 0.5) + ')';
  ctx.lineWidth = 1.5 * S;
  ctx.setLineDash([4 * S, 3 * S]);
  rRect(x, y, w, h, 6 * S); ctx.stroke();
  ctx.setLineDash([]);

  // ↩ icon, pulsing opacity
  ctx.globalAlpha = 0.38 + pulse * 0.28;
  ctx.fillStyle = '#B8A070';
  ctx.font = 'bold ' + (h * 0.42) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('\u21A9', x + w / 2, y + h / 2);

  // Hover highlight
  if (hoverT > 0.01) {
    ctx.globalAlpha = hoverT * 0.12;
    ctx.fillStyle = '#FFD080';
    rRect(x, y, w, h, 6 * S); ctx.fill();
  }

  ctx.restore();
}

// Loaded state: shows stored marble color tint + glowing border + ↩ + dot row
function drawSecondChanceLoaded(ctx, x, y, w, h, ci, S, tick, hoverT) {
  var c = COLORS[ci];
  ctx.save();
  var glow = Math.sin(tick * 0.08) * 0.5 + 0.5; // 0..1

  // Silver base
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(218,212,204,0.92)');
  grad.addColorStop(1, 'rgba(178,170,160,0.92)');
  ctx.fillStyle = grad;
  ctx.shadowColor = c.glow; ctx.shadowBlur = (8 + glow * 10) * S;
  rRect(x, y, w, h, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  // Color tint overlay (muted)
  ctx.globalAlpha = 0.22 + glow * 0.10;
  var tint = ctx.createLinearGradient(x, y, x, y + h);
  tint.addColorStop(0, c.light); tint.addColorStop(1, c.fill);
  ctx.fillStyle = tint;
  rRect(x, y, w, h, 6 * S); ctx.fill();

  // Glowing border
  ctx.globalAlpha = 0.65 + glow * 0.35;
  ctx.strokeStyle = c.dark; ctx.lineWidth = 2 * S;
  rRect(x, y, w, h, 6 * S); ctx.stroke();

  // ↩ icon
  ctx.globalAlpha = 0.85 + glow * 0.15;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + (h * 0.38) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('\u21A9', x + w / 2, y + h * 0.36);

  // Three marble dots at bottom row indicating stored color
  var dotR = 3.5 * S;
  var dotY = y + h * 0.74;
  ctx.shadowColor = c.glow; ctx.shadowBlur = 5 * S;
  for (var di = 0; di < 3; di++) {
    var dotX = x + w * 0.22 + di * w * 0.28;
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = c.fill;
    ctx.beginPath(); ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  // Hover highlight
  if (hoverT > 0.01) {
    ctx.globalAlpha = hoverT * 0.18;
    ctx.fillStyle = c.light;
    rRect(x, y, w, h, 6 * S); ctx.fill();
  }

  ctx.restore();
}
