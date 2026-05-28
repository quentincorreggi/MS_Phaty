// ============================================================
// box_double.js — Double box type
// A 2-layer box. Tap 1 spawns the top layer (color A) of 9 marbles
// and the box transforms into a single-layer box of color B.
// Tap 2 spawns the second layer (color B) and the box clears.
// The top color shows on the body. The bottom color shows as a
// colored frame around the box while both layers remain.
// ============================================================

function drawDoubleFrame(ctx, x, y, w, h, ci2, S) {
  var c2 = COLORS[ci2];
  var fp = 3 * S;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 1 * S;
  var grad = ctx.createLinearGradient(x - fp, y - fp, x - fp, y + h + fp);
  grad.addColorStop(0, c2.light);
  grad.addColorStop(1, c2.dark);
  ctx.fillStyle = grad;
  rRect(x - fp, y - fp, w + fp * 2, h + fp * 2, 8 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = c2.dark;
  ctx.lineWidth = 1.5 * S;
  rRect(x - fp, y - fp, w + fp * 2, h + fp * 2, 8 * S);
  ctx.stroke();
  ctx.restore();
}

function getDoubleCi2(b, ci) {
  if (b && b.layer2Ci != null) return b.layer2Ci;
  return (ci + 1) % NUM_COLORS;
}

registerBoxType('double', {
  label: 'Double',
  editorColor: '#D49060',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase, b) {
    var ci2 = getDoubleCi2(b, ci);
    var c = COLORS[ci];
    ctx.save();
    drawDoubleFrame(ctx, x, y, w, h, ci2, S);
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.45;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.32) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('2', x + w / 2, y + h / 2);
    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick, b) {
    var ci2 = getDoubleCi2(b, ci);
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);
    drawDoubleFrame(ctx, x, y, w, h, ci2, S);
    if (phase < 0.5) {
      var c = COLORS[ci];
      var grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
      ctx.globalAlpha = (1 - phase * 2) * 0.45;
      ctx.fillStyle = grad;
      rRect(x, y, w, h, 6 * S); ctx.fill();
      ctx.globalAlpha = (1 - phase * 2) * 0.25;
      ctx.fillStyle = '#A09888';
      rRect(x, y, w, h, 6 * S); ctx.fill();
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

  editorCellStyle: function (ci, ci2) {
    var c = COLORS[ci];
    if (ci2 == null) ci2 = (ci + 1) % NUM_COLORS;
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: COLORS[ci2].fill
    };
  },

  editorCellHTML: function (ci, ci2) {
    if (ci2 == null) ci2 = (ci + 1) % NUM_COLORS;
    var c2 = COLORS[ci2];
    return '<span class="ed-cell-dot">' + CLR_NAMES[ci][0].toUpperCase() + '</span>' +
      '<span style="position:absolute;bottom:1px;right:2px;width:9px;height:9px;border-radius:2px;background:' +
      c2.fill + ';border:1px solid rgba(0,0,0,0.25);box-shadow:0 0 0 1px rgba(255,255,255,0.4)"></span>';
  }
});
