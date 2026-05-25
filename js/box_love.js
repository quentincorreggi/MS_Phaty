// ============================================================
// box_love.js — Love Box: two broken heart halves that slide
// toward each other and merge into a regular playable box.
// Pair boxes by color (ci). Place love_left and love_right
// with the same ci to form a pair. Each pair contributes
// MRB_PER_BOX marbles (counted via love_left only).
// ============================================================

function drawLoveHeart(ctx, x, y, w, h, ci, S, tick, isLeft) {
  var c = COLORS[ci];
  var pulse = 1 + Math.sin(tick * 0.05) * 0.04;
  var hcx = 0, hcy = -h * 0.04;
  var hs = Math.min(w, h) * 0.38 * pulse;

  // Background box (dim color tint)
  ctx.save();
  ctx.globalAlpha = 0.45;
  var bgGrad = ctx.createLinearGradient(x, y, x, y + h);
  bgGrad.addColorStop(0, c.light); bgGrad.addColorStop(1, c.dark);
  ctx.fillStyle = bgGrad;
  rRect(x, y, w, h, 6 * S); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.dark; ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 6 * S); ctx.stroke();
  ctx.restore();

  // Clip to the correct half and draw full heart shape
  ctx.save();
  ctx.beginPath();
  if (isLeft) {
    ctx.rect(x, y, w / 2, h);
  } else {
    ctx.rect(x + w / 2, y, w / 2, h);
  }
  ctx.clip();

  ctx.beginPath();
  ctx.moveTo(hcx, hcy + hs);
  ctx.bezierCurveTo(hcx - hs * 0.5, hcy + hs * 0.5, hcx - hs * 1.2, hcy + hs * 0.1, hcx - hs * 1.2, hcy - hs * 0.3);
  ctx.bezierCurveTo(hcx - hs * 1.2, hcy - hs * 0.8, hcx - hs * 0.5, hcy - hs * 0.9, hcx, hcy - hs * 0.55);
  ctx.bezierCurveTo(hcx + hs * 0.5, hcy - hs * 0.9, hcx + hs * 1.2, hcy - hs * 0.8, hcx + hs * 1.2, hcy - hs * 0.3);
  ctx.bezierCurveTo(hcx + hs * 1.2, hcy + hs * 0.1, hcx + hs * 0.5, hcy + hs * 0.5, hcx, hcy + hs);
  ctx.closePath();

  var hGrad = ctx.createLinearGradient(hcx - hs, hcy - hs, hcx + hs, hcy + hs);
  hGrad.addColorStop(0, c.light); hGrad.addColorStop(0.5, c.fill); hGrad.addColorStop(1, c.dark);
  ctx.fillStyle = hGrad;
  ctx.shadowColor = c.glow; ctx.shadowBlur = 8 * S;
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  // Specular highlight on the bump
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  var hlx = isLeft ? (hcx - hs * 0.6) : (hcx + hs * 0.6);
  ctx.arc(hlx, hcy - hs * 0.38, hs * 0.26, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore(); // removes clip

  // Broken edge: zigzag line at the split (x=0)
  ctx.save();
  var yTop = hcy - hs * 0.85;
  var yBot = hcy + hs;
  var zigSteps = 7;
  var zigAmp = hs * 0.08;
  ctx.beginPath();
  for (var zi = 0; zi <= zigSteps; zi++) {
    var zy = yTop + (zi / zigSteps) * (yBot - yTop);
    var zx = (zi % 2 === 0) ? -zigAmp : zigAmp;
    if (zi === 0) ctx.moveTo(zx, zy); else ctx.lineTo(zx, zy);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 1.5 * S;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

registerBoxType('love_left', {
  label: 'Love ←',
  editorColor: '#FF4E8C',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawLoveHeart(ctx, x, y, w, h, ci, S, tick, true);
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    drawLoveHeart(ctx, x, y, w, h, ci, S, tick, true);
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return { background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')', borderColor: c.dark };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">♥←</span>';
  }
});

registerBoxType('love_right', {
  label: 'Love →',
  editorColor: '#FF4E8C',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawLoveHeart(ctx, x, y, w, h, ci, S, tick, false);
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    drawLoveHeart(ctx, x, y, w, h, ci, S, tick, false);
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return { background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')', borderColor: c.dark };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">♥→</span>';
  }
});
