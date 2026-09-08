// ============================================================
// box_key.js — Conveyor Key box type
// ============================================================
// Releases its marbles exactly like a default box. On the same
// action it breaks the Conveyor Lock, giving the chained belt slots
// back for the rest of the level.
//
// The emblem is colour-coded to the chain (brass on steel) so the
// Conveyor Key can never be mistaken for the grey blocker marbles.
// It is drawn in every box state — closed, revealing and open — via
// the optional drawOpenOverlay hook, so the player can always spot
// which box holds the key.
// ============================================================

registerBoxType('key', {
  label: 'Key',
  editorColor: '#D9A03C',

  // Brass plate carrying the key silhouette, sized to the box.
  drawKeyPlate: function (ctx, x, y, w, h, S, alpha) {
    var cx = x + w / 2, cy = y + h * 0.34;
    var pr = w * 0.235;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;

    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1.5 * S;
    var g = ctx.createLinearGradient(cx, cy - pr, cx, cy + pr);
    g.addColorStop(0, CL_STEEL_LT);
    g.addColorStop(1, CL_STEEL_DK);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    ctx.strokeStyle = CL_STEEL_DK; ctx.lineWidth = 1.4 * S;
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.stroke();

    drawConveyorKeyGlyph(cx, cy, pr * 0.78, -Math.PI * 0.25, 1);
    ctx.restore();
  },

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
    ctx.globalAlpha = 1;
    // Emblem stays readable through the closed state — hunting the key
    // is the point of the mechanic, so it must never be hidden.
    this.drawKeyPlate(ctx, x, y, w, h, S, 0.7);
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
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    this.drawKeyPlate(ctx, x, y, w, h, S, 1);
    ctx.restore();
  },

  // Drawn on top of the open (tappable) box, after the lip.
  drawOpenOverlay: function (ctx, x, y, w, h, ci, S, tick) {
    var glow = beltLockActive ? 0.5 + Math.sin(tick * 0.07) * 0.5 : 0;
    if (glow > 0.01) {
      ctx.save();
      ctx.globalAlpha = glow * 0.5;
      ctx.fillStyle = CL_BRASS_LT;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.34, w * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.drawKeyPlate(ctx, x, y, w, h, S, 1);
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ' 55%,' + CL_BRASS + ')',
      borderColor: CL_BRASS_DK
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:9px">' + CLR_NAMES[ci][0].toUpperCase() +
      '<span style="font-size:9px">🔑</span></span>';
  }
});
