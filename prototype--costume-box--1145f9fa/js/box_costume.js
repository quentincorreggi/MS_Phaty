// ============================================================
// box_costume.js — Costume box type (two-phase double box)
//
// Phase 1 — closed/tappable:
//   Box interior filled with ci2 color (the "inside")
//   Box outer frame drawn in ci color (the "outside")
//   Marble dots inside are ci color (shows what drops first)
//
// First tap:
//   Releases 9 ci marbles, then box transforms to phase 2
//
// Phase 2 — tappable:
//   Box is now ci2 color with ci2 marbles (normal open state)
//
// Second tap:
//   Releases 9 ci2 marbles, box done
//
// The player always sees both colors before any tap.
// ============================================================

registerBoxType('costume', {
  label: 'Costume',
  editorColor: '#7060A0',

  // drawClosed — box is locked/hidden (not yet revealed via adjacent reveal)
  // Shows: ci outer frame (greyed), ci2 inner fill (greyed), ci marble dots
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase, b) {
    var ci2 = (b && b.ci2 !== undefined && b.ci2 >= 0) ? b.ci2 : ci;
    var c  = COLORS[ci];
    var c2 = COLORS[ci2];

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;

    // ── Interior fill in ci2 (full color) ──
    var gradIn = ctx.createLinearGradient(x, y, x, y + h);
    gradIn.addColorStop(0, c2.light); gradIn.addColorStop(1, c2.dark);
    ctx.fillStyle = gradIn;
    rRect(x, y, w, h, 6 * S); ctx.fill();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // ── Outer frame in ci color (full color, thick border) ──
    ctx.strokeStyle = c.dark; ctx.lineWidth = 5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.strokeStyle = c.light; ctx.lineWidth = 2 * S;
    rRect(x + 2.5 * S, y + 2.5 * S, w - 5 * S, h - 5 * S, 4 * S); ctx.stroke();

    // ── Marble dots inside in ci color ──
    ctx.save();
    rRect(x + 4 * S, y + 4 * S, w - 8 * S, h - 8 * S, 3 * S);
    ctx.clip();

    var mr  = Math.min(4.5 * S, w / 11);
    var mg  = mr * 2.3;
    var cx0 = x + w / 2;
    var cy0 = y + h / 2 - mr * 0.3;
    var rows = [
      [{ dc: -1, dr: -1 }, { dc: 0, dr: -1 }, { dc: 1, dr: -1 }],
      [{ dc:  1, dr:  0 }, { dc: 0, dr:  0 }, { dc: -1, dr:  0 }],
      [{ dc: -1, dr:  1 }, { dc: 0, dr:  1 }, { dc:  1, dr:  1 }]
    ];
    for (var ri = 0; ri < rows.length; ri++) {
      for (var ci2i = 0; ci2i < rows[ri].length; ci2i++) {
        var pt = rows[ri][ci2i];
        var px = cx0 + pt.dc * mg;
        var py = cy0 + pt.dr * mg * 0.75;
        var g2 = ctx.createRadialGradient(px - mr * 0.25, py - mr * 0.25, mr * 0.1, px, py, mr);
        g2.addColorStop(0, c.light); g2.addColorStop(0.7, c.fill); g2.addColorStop(1, c.dark);
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(px, py, mr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.arc(px - mr * 0.25, py - mr * 0.25, mr * 0.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    ctx.restore();
  },

  // drawReveal — animation from hidden/closed → revealed open state
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick, b) {
    var ci2 = (b && b.ci2 !== undefined && b.ci2 >= 0) ? b.ci2 : ci;
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);

    if (phase < 0.5) {
      ctx.globalAlpha = 1;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0, b);
      ctx.globalAlpha = 1;
    }

    // Revealed phase 1: ci box exterior, ci2 interior tint, ci marble dots
    drawBox(x, y, w, h, ci);

    // ci2 inner tint panel — shows the "inside" color
    if (phase > 0.2) {
      ctx.globalAlpha = Math.min(0.35, (phase - 0.2) / 0.4 * 0.35);
      var ins = 4 * S;
      var c2 = COLORS[ci2];
      var inGrad = ctx.createLinearGradient(x + ins, y + ins, x + ins, y + h - ins);
      inGrad.addColorStop(0, c2.light); inGrad.addColorStop(1, c2.dark);
      ctx.fillStyle = inGrad;
      rRect(x + ins, y + ins, w - ins * 2, h - ins * 2, 3 * S); ctx.fill();
    }

    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
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
    // Show a dot in ci2 color — box is ci background, dot shows marble color inside
    return '<span class="ed-cell-dot" style="background:' + c2.fill + ';border-radius:50%;width:10px;height:10px;display:inline-block;margin:0;vertical-align:middle;border:1.5px solid rgba(0,0,0,0.2)"></span>';
  }
});
