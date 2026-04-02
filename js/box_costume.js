// ============================================================
// box_costume.js — Costume box type
// Two colors: box shell is ci (box color), marbles inside are ci2 (marble color).
// Closed: box drawn in ci color (desaturated), circles inside shown in ci2.
// Revealed/open: box in ci color, marble dots in ci2.
// When tapped: spawns marbles of ci2 color.
// ============================================================

registerBoxType('costume', {
  label: 'Costume',
  editorColor: '#7060A0',

  // drawClosed — receives box object as 10th argument (b) so we can read ci2
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase, b) {
    var ci2 = (b && b.ci2 !== undefined && b.ci2 >= 0) ? b.ci2 : ci;
    var c = COLORS[ci];
    var c2 = COLORS[ci2];
    ctx.save();

    // Draw greyed box body in ci color
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
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Clip to box for marble dots
    ctx.globalAlpha = 1;
    ctx.save();
    rRect(x + 2 * S, y + 2 * S, w - 4 * S, h - 4 * S, 4 * S);
    ctx.clip();

    // Draw mini marble circles inside showing ci2 color
    var mr = Math.min(5 * S, w / 10);
    var mg = mr * 2.2;
    var cx0 = x + w / 2;
    var cy0 = y + h / 2 - mr * 0.5;
    var positions = [
      { dc: -1, dr: -1 }, { dc: 0, dr: -1 }, { dc: 1, dr: -1 },
      { dc: 1, dr:  0 }, { dc: 0, dr:  0 }, { dc: -1, dr:  0 },
      { dc: -1, dr:  1 }, { dc: 0, dr:  1 }, { dc: 1, dr:  1 }
    ];
    for (var pi = 0; pi < positions.length; pi++) {
      var px = cx0 + positions[pi].dc * mg;
      var py = cy0 + positions[pi].dr * mg * 0.75;
      var grad2 = ctx.createRadialGradient(px - mr * 0.25, py - mr * 0.25, mr * 0.1, px, py, mr);
      grad2.addColorStop(0, c2.light); grad2.addColorStop(0.7, c2.fill); grad2.addColorStop(1, c2.dark);
      ctx.fillStyle = grad2;
      ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.arc(px, py, mr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  },

  // drawReveal — receives box object as 11th argument (b) so we can read ci2
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick, b) {
    var ci2 = (b && b.ci2 !== undefined && b.ci2 >= 0) ? b.ci2 : ci;
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);

    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0, b);
      ctx.globalAlpha = phase * 2;
    }

    // Draw revealed box in ci color
    drawBox(x, y, w, h, ci);
    ctx.globalAlpha = 1;

    // Draw marble dots in ci2 color
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci2, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }

    ctx.restore();
  },

  editorCellStyle: function (ci, v) {
    var c = COLORS[ci];
    return { background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')', borderColor: c.dark };
  },

  editorCellHTML: function (ci, v) {
    var ci2 = (v && v.ci2 !== undefined && v.ci2 >= 0) ? v.ci2 : ci;
    var c2 = COLORS[ci2];
    // Show a small colored dot representing the marble color inside
    return '<span class="ed-cell-dot" style="background:' + c2.fill + ';border-radius:50%;width:10px;height:10px;display:inline-block;margin:0;vertical-align:middle"></span>';
  }
});
