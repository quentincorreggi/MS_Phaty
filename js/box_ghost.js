// ============================================================
// box_ghost.js — Ghost box type
// Every marble it holds is a ghost: it phases straight through solid
// marbles on the way down the funnel, so it can overtake a queue jammed
// on the funnel plug and claim a free belt slot first. Ghosts still
// collide with each other and with the funnel walls, and they sort into
// their own color normally.
// Closed: pale spectral box with a wavy skirt and two faint eyes.
// ============================================================

// Rounded top, scalloped ghost skirt along the bottom. The lobes drift with
// tick so the box looks like it is floating rather than sitting still.
function ghostBoxPath(x, y, w, h, S, tick, phase) {
  var r = 6 * S;
  var waveH = h * 0.15;
  var bodyBot = y + h - waveH;
  ctx.beginPath();
  ctx.moveTo(x, bodyBot);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, bodyBot);
  var lobes = 3;
  var lw = w / lobes;
  for (var i = 0; i < lobes; i++) {
    var x0 = x + w - i * lw;
    var x1 = x + w - (i + 1) * lw;
    var drift = Math.sin(tick * 0.05 + phase + i * 1.3) * waveH * 0.3;
    ctx.quadraticCurveTo(x0 - lw / 2, bodyBot + waveH + drift, x1, bodyBot);
  }
  ctx.closePath();
}

registerBoxType('ghost', {
  label: 'Ghost',
  editorColor: '#BFD8F2',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    var bob = Math.sin(tick * 0.045 + idlePhase) * h * 0.022;

    ctx.save();
    ctx.translate(0, bob);

    // Spectral body — the box color, washed out and see-through
    ctx.shadowColor = 'rgba(120,150,190,0.28)'; ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 2 * S;
    ctx.globalAlpha = 0.62;
    ghostBoxPath(x, y, w, h, S, tick, idlePhase);
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#F4FAFF');
    grad.addColorStop(0.55, c.light);
    grad.addColorStop(1, c.fill);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Pale rim so the silhouette reads against the board
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(240,250,255,0.9)'; ctx.lineWidth = 1.6 * S;
    ghostBoxPath(x, y, w, h, S, tick, idlePhase);
    ctx.stroke();

    // Eyes
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#2A3340';
    var er = w * 0.062, ey = y + h * 0.42, egap = w * 0.165;
    ctx.beginPath(); ctx.arc(x + w / 2 - egap, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w / 2 + egap, ey, er, 0, Math.PI * 2); ctx.fill();

    // Drifting shimmer
    ctx.globalAlpha = 0.16 + Math.sin(tick * 0.07 + idlePhase) * 0.07;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.24, w * 0.1, 0, Math.PI * 2); ctx.fill();

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

    // Misty wash over the body while the reveal settles
    if (phase < 0.7) {
      ctx.save();
      ctx.globalAlpha = 0.22 * (1 - phase);
      ctx.beginPath(); rRect(x, y, w, h, 6 * S); ctx.clip();
      ctx.fillStyle = '#F0F8FF';
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      // Every marble in the box is a ghost, so the whole group fades in
      // translucent — no per-slot dispatch needed.
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5) * GHOST_ALPHA;
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,#EAF4FF 40%,' + c.light + ')',
      borderColor: '#BFD8F2'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:9px;color:#3A4450">' + CLR_NAMES[ci][0].toUpperCase() + '<span style="font-size:8px">👻</span></span>';
  }
});
