// ============================================================
// box_candy.js — Candy Box type  🍬
// A 1x1 box sealed inside a wrapped candy with a fixed 3 HP. The
// candy can only be broken from the OUTSIDE: the box itself cannot
// be tapped while any candy remains, and every pickup of an
// orthogonally adjacent box takes 1 HP off.
//
//   HP 3 — Wrapped         : fully wrapped candy, twisted ends
//   HP 2 — Wrapper opened  : wrapper torn back, candy exposed
//   HP 1 — Candy cracked   : the exposed candy is fractured
//   HP 0 — Removed         : candy shatters, colour revealed at last
//
// The box's colour is hidden in ALL THREE covered states — that is
// the point of the mechanic, so the cover is fully opaque and uses a
// neutral confectionery palette (cream / toffee) that cannot be
// mistaken for any marble colour. Nothing here may hint at what is
// underneath.
//
// The cover is drawn by drawCandyOverlay(), called from drawStock for
// any box with candyHP > 0 (the same arrangement ice uses).
// drawClosed / drawReveal below therefore draw only the box beneath,
// which the cover then hides completely.
// ============================================================

registerBoxType('candy', {
  label: 'Candy',
  editorColor: '#E8C88A',

  // ── Neutral confectionery palette — deliberately no marble hues ──
  CANDY_CREAM: '#F7EBD8',
  CANDY_CREAM_MID: '#E8D4B4',
  CANDY_CREAM_DARK: '#CBB48C',
  CANDY_TOFFEE: '#A9875C',
  CANDY_TOFFEE_DARK: '#7E6440',
  CANDY_BODY: '#F0DEB8',
  CANDY_BODY_DARK: '#DCC391',
  CANDY_PLATE: '#DCD2C2',

  // ── Opaque neutral backing. Painted first in every covered state so
  //    no part of the coloured box below can ever show through. ──
  drawPlate: function (ctx, x, y, w, h, S) {
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#E6DCCC');
    grad.addColorStop(1, '#CFC4B2');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.strokeStyle = 'rgba(140,126,106,0.45)';
    ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
  },

  // ── Diagonal toffee stripes, clipped to the shape just filled ──
  drawStripes: function (ctx, x, y, w, h, S, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.CANDY_TOFFEE;
    ctx.lineWidth = 3 * S;
    var gap = 9 * S;
    for (var d = -h; d < w + h; d += gap) {
      ctx.beginPath();
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d - h, y + h);
      ctx.stroke();
    }
    ctx.restore();
  },

  // ── A pinched, fanned wrapper twist at one end (dir -1 left, 1 right) ──
  drawTwist: function (ctx, cx, cy, w, h, S, dir) {
    var tipX = cx + dir * w * 0.13;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h * 0.16);
    ctx.lineTo(tipX, cy - h * 0.22);
    ctx.lineTo(tipX, cy + h * 0.22);
    ctx.lineTo(cx, cy + h * 0.16);
    ctx.closePath();
    var grad = ctx.createLinearGradient(cx, cy, tipX, cy);
    grad.addColorStop(0, this.CANDY_CREAM_MID);
    grad.addColorStop(1, this.CANDY_CREAM_DARK);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(126,100,64,0.4)'; ctx.lineWidth = 1 * S; ctx.stroke();
    // Crease lines in the twist
    ctx.strokeStyle = 'rgba(126,100,64,0.28)';
    ctx.lineWidth = 0.9 * S;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, cy - h * 0.10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, cy + h * 0.10); ctx.stroke();
  },

  // ── The hard candy itself, exposed once the wrapper is torn open.
  //    cracked = true draws the fractured HP 1 state. ──
  drawCandy: function (ctx, cx, cy, r, S, cracked) {
    ctx.save();
    // Body
    var grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r);
    grad.addColorStop(0, '#FBF1DC');
    grad.addColorStop(0.6, this.CANDY_BODY);
    grad.addColorStop(1, this.CANDY_BODY_DARK);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(126,100,64,0.5)'; ctx.lineWidth = 1.4 * S;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    // Toffee swirl
    ctx.strokeStyle = 'rgba(169,135,92,0.55)';
    ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0.4, 3.0); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 3.4, 5.9); ctx.stroke();

    // Gloss highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.34, cy - r * 0.40, r * 0.26, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();

    if (cracked) {
      // A chunk blown out of the rim. Painted as a hollow so the candy's
      // SILHOUETTE changes, not just its surface — that keeps HP 1
      // unmistakable from HP 2 at board scale.
      ctx.save();
      ctx.fillStyle = 'rgba(146,132,112,0.92)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r * 1.08, -0.52, 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,78,50,0.7)';
      ctx.lineWidth = 1.2 * S;
      ctx.stroke();
      ctx.restore();

      // Heavy fracture lines across what is left
      ctx.strokeStyle = 'rgba(88,66,40,0.85)';
      ctx.lineWidth = 2.2 * S;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.95, cy - r * 0.18);
      ctx.lineTo(cx - r * 0.18, cy + r * 0.08);
      ctx.lineTo(cx + r * 0.14, cy - r * 0.32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.18, cy + r * 0.08);
      ctx.lineTo(cx - r * 0.02, cy + r * 0.94);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.14, cy - r * 0.32);
      ctx.lineTo(cx + r * 0.34, cy - r * 0.94);
      ctx.stroke();

      // Loose crumbs shaken off around the candy
      ctx.fillStyle = 'rgba(247,235,216,0.95)';
      var crumbs = [[-1.28, 0.52, 0.13], [1.18, -0.62, 0.10], [-0.42, -1.26, 0.09], [0.86, 1.14, 0.11]];
      for (var cb = 0; cb < crumbs.length; cb++) {
        ctx.beginPath();
        ctx.arc(cx + r * crumbs[cb][0], cy + r * crumbs[cb][1], r * crumbs[cb][2], 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  // ── Draw the candy cover over a box (called from drawStock) ──
  drawCandyOverlay: function (ctx, x, y, w, h, S, hp, tick, ci, hitT) {
    var maxHP = (typeof CANDY_HP !== 'undefined') ? CANDY_HP : 3;
    if (hp > maxHP) hp = maxHP;

    ctx.save();
    ctx.globalAlpha = 1;                    // the cover is always opaque
    this.drawPlate(ctx, x, y, w, h, S);

    var cx = x + w / 2, cy = y + h / 2;

    if (hp >= 3) {
      // ── HP 3 — fully wrapped: an opaque wrapper across the tile ──
      var bodyX = x + w * 0.15, bodyW = w * 0.70;
      var bodyY = y + h * 0.18, bodyH = h * 0.64;
      this.drawTwist(ctx, bodyX, cy, w, h, S, -1);
      this.drawTwist(ctx, bodyX + bodyW, cy, w, h, S, 1);

      var grad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
      grad.addColorStop(0, this.CANDY_CREAM);
      grad.addColorStop(0.55, this.CANDY_CREAM_MID);
      grad.addColorStop(1, this.CANDY_CREAM_DARK);
      ctx.fillStyle = grad;
      rRect(bodyX, bodyY, bodyW, bodyH, 5 * S); ctx.fill();

      ctx.save();
      rRect(bodyX, bodyY, bodyW, bodyH, 5 * S); ctx.clip();
      this.drawStripes(ctx, bodyX, bodyY, bodyW, bodyH, S, 0.5);
      // Sheen across the wrapper
      var sheen = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY + bodyH);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.45, 'rgba(255,255,255,0.45)');
      sheen.addColorStop(0.6, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
      ctx.restore();

      ctx.strokeStyle = 'rgba(126,100,64,0.45)'; ctx.lineWidth = 1.4 * S;
      rRect(bodyX, bodyY, bodyW, bodyH, 5 * S); ctx.stroke();

    } else {
      // ── HP 2 / HP 1 — wrapper torn back, candy exposed ──
      // Crumpled wrapper flaps pushed out to the tile edges
      var flapW = w * 0.20, flapH = h * 0.52;
      for (var s = 0; s < 2; s++) {
        var dir = s === 0 ? -1 : 1;
        var fx = cx + dir * w * 0.30;
        ctx.save();
        ctx.translate(fx, cy);
        ctx.rotate(dir * 0.22);
        ctx.beginPath();
        ctx.moveTo(-flapW * 0.5, -flapH * 0.5);
        ctx.lineTo(flapW * 0.5, -flapH * 0.34);
        ctx.lineTo(flapW * 0.34, flapH * 0.5);
        ctx.lineTo(-flapW * 0.5, flapH * 0.30);
        ctx.closePath();
        var fg = ctx.createLinearGradient(-flapW * 0.5, 0, flapW * 0.5, 0);
        fg.addColorStop(0, this.CANDY_CREAM);
        fg.addColorStop(1, this.CANDY_CREAM_DARK);
        ctx.fillStyle = fg; ctx.fill();
        ctx.save(); ctx.clip();
        this.drawStripes(ctx, -flapW, -flapH, flapW * 2, flapH * 2, S, 0.42);
        ctx.restore();
        ctx.strokeStyle = 'rgba(126,100,64,0.42)'; ctx.lineWidth = 1 * S; ctx.stroke();
        ctx.restore();
      }
      this.drawCandy(ctx, cx, cy, w * 0.25, S, hp <= 1);
    }

    // ── Impact flash right after a hit ──
    if (hitT > 0) {
      ctx.save();
      rRect(x, y, w, h, 6 * S); ctx.clip();
      ctx.globalAlpha = hitT * 0.5;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    ctx.restore();
  },

  // ── Closed state: no path to the bottom yet. The cover is added by
  //    drawStock and hides this completely, colour included. ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.globalAlpha = 0.5;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
  },

  // ── Reveal animation (the cover is drawn over it by drawStock) ──
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.08;
    ctx.save();
    ctx.scale(popScale, popScale);
    drawBox(x, y, w, h, ci);
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  // ── Editor cells still show the colour inside: the designer needs to
  //    know what they are placing, even though the player cannot see it. ──
  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ' 0%,' + c.dark + ' 60%,#A9875C 100%)',
      borderColor: '#E8C88A'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:12px;text-shadow:0 1px 2px rgba(0,0,0,0.5)">&#127852;</span>';
  }
});
