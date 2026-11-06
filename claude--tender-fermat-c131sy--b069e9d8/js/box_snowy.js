// ============================================================
// box_snowy.js — Snowy box type (Snowman mechanic)
// Closed: soft white powder with an icy tint — colour hidden.
// When the box opens (path to the bottom), its snow flies to the
// Snowman (see snowman.js) and the box becomes a normal box.
// ============================================================

// Shared snow-cover drawing, also used for the "snow lifting off" overlay.
function drawSnowCover(ctx, x, y, w, h, S, tick, seedPhase) {
  ctx.save();
  // Body — powdery white with a faint icy blue at the bottom
  ctx.shadowColor = 'rgba(60,90,130,0.18)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.55, '#EEF5FB');
  grad.addColorStop(1, '#CFE1F0');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 7 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Fluffy lumps along the top edge (puffy powder silhouette)
  ctx.fillStyle = '#FFFFFF';
  var lumps = 4;
  for (var i = 0; i < lumps; i++) {
    var lx = x + w * (0.14 + i * 0.24);
    var lr = w * (0.13 + 0.03 * Math.sin(i * 2.3 + seedPhase));
    ctx.beginPath(); ctx.arc(lx, y + h * 0.1, lr, 0, Math.PI * 2); ctx.fill();
  }

  // Soft blue shading drifts
  ctx.save();
  ctx.beginPath(); rRect(x, y, w, h, 7 * S); ctx.clip();
  ctx.fillStyle = 'rgba(160,200,235,0.22)';
  ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + h * 0.82, w * 0.35, h * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + w * 0.78, y + h * 0.66, w * 0.25, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // Powder speckles
  ctx.fillStyle = 'rgba(140,185,225,0.35)';
  var seed = Math.floor(seedPhase * 1000) + 7;
  for (var d = 0; d < 9; d++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var dx = x + w * 0.1 + (seed % 100) / 100 * w * 0.8;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var dy = y + h * 0.25 + (seed % 100) / 100 * h * 0.65;
    ctx.beginPath(); ctx.arc(dx, dy, 1.1 * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Icy rim
  ctx.strokeStyle = 'rgba(150,195,230,0.9)'; ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 7 * S); ctx.stroke();

  // Twinkling sparkles
  for (var s = 0; s < 2; s++) {
    var tw = Math.sin(tick * 0.06 + seedPhase * 3 + s * 2.5);
    if (tw <= 0.2) continue;
    var sx = x + w * (s === 0 ? 0.72 : 0.28);
    var sy = y + h * (s === 0 ? 0.38 : 0.6);
    var sr = (2 + 2 * tw) * S;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + 0.6 * tw) + ')';
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.moveTo(sx - sr, sy); ctx.lineTo(sx + sr, sy);
    ctx.moveTo(sx, sy - sr); ctx.lineTo(sx, sy + sr); ctx.stroke();
    ctx.fillStyle = 'rgba(190,225,255,' + (0.5 * tw) + ')';
    ctx.beginPath(); ctx.arc(sx, sy, 1.2 * S, 0, Math.PI * 2); ctx.fill();
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
    return { background: 'linear-gradient(180deg,#FFFFFF,#CFE1F0)', borderColor: COLORS[ci].fill };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:' + COLORS[ci].fill + ';text-shadow:none">❄</span>';
  }
});
