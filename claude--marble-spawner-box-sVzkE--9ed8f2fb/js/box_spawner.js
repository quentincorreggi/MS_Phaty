// ============================================================
// box_spawner.js — Spawner box type
// Identical to default box but spawns 3x the marbles.
// In the editor grid, looks like a regular box with "×3" label.
// ============================================================

var SPAWNER_MULTIPLIER = 3;

registerBoxType('spawner', {
  label: 'Spawner',
  editorColor: '#7B52A0',

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
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // Lock icon
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.3) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDD12', x + w / 2, y + h / 2);
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
      drawBoxMarbles(ci, Math.min(remaining, MRB_PER_BOX));
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    // ×3 badge
    ctx.globalAlpha = Math.min(1, phase * 2);
    drawSpawnerBadge(ctx, x, y, w, h, S);
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: c.dark
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:9px">\u00D73</span>';
  }
});

// Draw the ×3 badge on a spawner box
function drawSpawnerBadge(ctx, x, y, w, h, S) {
  ctx.save();
  var bw = w * 0.45, bh = h * 0.28;
  var bx = x + w / 2 - bw / 2, by = y + h * 0.05;
  // Badge background
  ctx.fillStyle = 'rgba(123,82,160,0.85)';
  rRect(bx, by, bw, bh, 4 * S); ctx.fill();
  // Badge text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + (bh * 0.7) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('\u00D73', bx + bw / 2, by + bh / 2);
  ctx.restore();
}
