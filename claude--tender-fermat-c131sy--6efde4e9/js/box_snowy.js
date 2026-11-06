// ============================================================
// box_snowy.js — Snowy box type (Snowman mechanic)
// Closed: soft white powder with an icy tint — colour hidden.
// When the box opens (path to the bottom), its snow flies to the
// Snowman (see snowman.js) and the box becomes a normal box.
// ============================================================

// Shared snow-cover drawing, also used for the "snow lifting off" overlay.
function drawSnowCover(ctx, x, y, w, h, S, tick, seedPhase) {
  ctx.save();
  // Pale icy-blue tile
  ctx.shadowColor = 'rgba(60,100,140,0.2)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#E4F3FC');
  grad.addColorStop(1, '#B9DCF0');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 7 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // White powder patches
  ctx.save();
  ctx.beginPath(); rRect(x, y, w, h, 7 * S); ctx.clip();
  var blobs = [
    [0.27, 0.3, 0.2, 0.15], [0.72, 0.24, 0.17, 0.12], [0.5, 0.56, 0.22, 0.14],
    [0.2, 0.78, 0.16, 0.11], [0.8, 0.74, 0.17, 0.13]
  ];
  for (var i = 0; i < blobs.length; i++) {
    var b = blobs[i];
    var bx = x + w * b[0], by = y + h * b[1];
    // soft blue shadow under each patch
    ctx.fillStyle = 'rgba(120,175,215,0.35)';
    ctx.beginPath(); ctx.ellipse(bx, by + h * 0.035, w * b[2], h * b[3], 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.ellipse(bx, by, w * b[2], h * b[3], 0, 0, Math.PI * 2); ctx.fill();
  }
  // Fluffy top edge
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (var j = 0; j < 4; j++) {
    ctx.beginPath(); ctx.arc(x + w * (0.12 + j * 0.25), y + h * 0.02, w * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Icy rim
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2 * S;
  rRect(x + 1 * S, y + 1 * S, w - 2 * S, h - 2 * S, 6 * S); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,175,215,0.8)'; ctx.lineWidth = 1 * S;
  rRect(x, y, w, h, 7 * S); ctx.stroke();

  // Twinkle
  var tw = Math.sin(tick * 0.06 + seedPhase * 3);
  if (tw > 0.3) {
    var sx = x + w * 0.74, sy = y + h * 0.45, sr = (2 + 2 * tw) * S;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * tw) + ')';
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.moveTo(sx - sr, sy); ctx.lineTo(sx + sr, sy);
    ctx.moveTo(sx, sy - sr); ctx.lineTo(sx, sy + sr); ctx.stroke();
  }
  ctx.restore();
}

registerBoxType('snowy', {
  label: 'Snowy',
  editorColor: '#9CC8E8',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawSnowCover(ctx, x, y, w, h, S, tick, idlePhase || 0);
  },

  // Normally not used in-game (the box turns 'default' the moment it
  // opens and snowman.js draws the snow lifting off), kept for completeness.
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    drawBox(x, y, w, h, ci);
    if (remaining > 0 && phase > 0.3) { drawBoxMarbles(ci, remaining); drawBoxLip(ci); }
    if (phase < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - phase;
      ctx.translate(0, -phase * h * 0.4);
      drawSnowCover(ctx, x, y, w, h, S, tick, 0);
      ctx.restore();
    }
  },

  editorCellStyle: function (ci) {
    return { background: 'linear-gradient(180deg,#E4F3FC,#B9DCF0)', borderColor: COLORS[ci].fill };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:' + COLORS[ci].fill + ';text-shadow:none">❄</span>';
  }
});
