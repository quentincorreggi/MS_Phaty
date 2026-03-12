// ============================================================
// box_colorswap.js — Color Swap box type
// A box with two colors (primary + secondary). The primary
// color determines which marbles it spawns. When a Switch cell
// is tapped, all colorswap boxes swap their primary/secondary.
// The secondary color is always visible as a small indicator
// so the player can anticipate the swap.
// ============================================================

registerBoxType('colorswap', {
  label: 'Swap',
  editorColor: '#E06090',

  // ── Draw the secondary-color indicator (corner dot + ring) ──
  drawSwapIndicator: function (ctx, x, y, w, h, ci2, S, tick) {
    if (ci2 === undefined || ci2 < 0) return;
    var c2 = COLORS[ci2];

    // Pulsing secondary ring around the box
    var pulse = 0.15 + Math.sin(tick * 0.06) * 0.05;
    ctx.save();
    ctx.strokeStyle = c2.fill;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 2.5 * S;
    ctx.setLineDash([4 * S, 3 * S]);
    rRect(x + 1.5 * S, y + 1.5 * S, w - 3 * S, h - 3 * S, 5 * S);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Corner badge with secondary color
    var badgeR = w * 0.18;
    var bx = x + w - badgeR * 0.6;
    var by = y + badgeR * 0.6;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 2 * S;
    var grad = ctx.createRadialGradient(bx - badgeR * 0.2, by - badgeR * 0.2, badgeR * 0.1, bx, by, badgeR);
    grad.addColorStop(0, c2.light);
    grad.addColorStop(0.7, c2.fill);
    grad.addColorStop(1, c2.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Highlight on badge
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(bx - badgeR * 0.2, by - badgeR * 0.2, badgeR * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Swap arrows icon on badge
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2 * S;
    ctx.lineCap = 'round';
    var as = badgeR * 0.35;
    ctx.beginPath();
    ctx.moveTo(bx - as, by - as * 0.3);
    ctx.lineTo(bx + as * 0.3, by - as * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + as, by + as * 0.3);
    ctx.lineTo(bx - as * 0.3, by + as * 0.3);
    ctx.stroke();

    ctx.restore();
  },

  // ── Closed state: show primary dimly + secondary indicator ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 3 * S;
    ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.45;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S);
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.3) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDD12', x + w / 2, y + h / 2);
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
      borderColor: '#E06090'
    };
  },

  editorCellHTML: function (ci, ci2) {
    var html = '<span class="ed-cell-dot" style="font-size:9px">\u21C4</span>';
    if (ci2 !== undefined && ci2 >= 0) {
      html += '<span style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:' + COLORS[ci2].fill + ';border:1px solid rgba(255,255,255,0.5)"></span>';
    }
    return html;
  }
});
