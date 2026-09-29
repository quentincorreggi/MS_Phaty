// ============================================================
// box_candy.js — Candy Box type  🍬
// A 1x1 box sealed inside a wrapped candy with a fixed 3 HP. The
// candy can only be broken from the OUTSIDE: the box itself cannot
// be tapped while any candy remains, and every pickup of an
// orthogonally adjacent box takes 1 HP off.
//
//   HP 3 — Wrapped   : pink wrapper with twisted ends, one clean
//                      cream diagonal band across it
//   HP 2 — Unwrapped : twists gone, the bare hard candy — wavy
//                      cream stripes on pink
//   HP 1 — Cracked   : the same candy split in two down a jagged
//                      crack, the halves pulled apart
//   HP 0 — Removed   : candy gone, the box's colour revealed at last
//
// Art follows the reference sheet from art direction. The box's
// colour is hidden in ALL THREE covered states — that is the point of
// the mechanic — so the cover is fully opaque and sits on a neutral
// backing plate. Nothing here may hint at what is underneath.
//
// The cover is drawn by drawCandyOverlay(), called from drawStock for
// any box with candyHP > 0 (the same arrangement ice uses).
// drawClosed / drawReveal below therefore draw only the box beneath,
// which the cover then hides completely.
// ============================================================

registerBoxType('candy', {
  label: 'Candy',
  editorColor: '#F163C4',

  // ── Palette sampled from the art-direction reference ──
  PINK_HI: '#FFA6E0',
  PINK: '#F163C4',
  PINK_DK: '#D93FA2',
  PINK_EDGE: '#B82D84',
  CREAM_HI: '#FFFBF0',
  CREAM: '#FDF4E4',
  CREAM_DK: '#EADBC0',
  CRACK: '#A02050',
  CRACK_DK: '#75143C',

  // Jagged crack down the middle, as fractions of the candy body.
  CRACK_ZIG: [[0.50, 0.00], [0.41, 0.17], [0.55, 0.33], [0.43, 0.50],
              [0.57, 0.67], [0.45, 0.84], [0.52, 1.00]],

  // ── Opaque neutral backing. Painted first in every covered state so
  //    no part of the coloured box below can ever show through. ──
  drawPlate: function (ctx, x, y, w, h, S) {
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#E7E1D6');
    grad.addColorStop(1, '#D0C8BA');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.strokeStyle = 'rgba(140,126,106,0.40)';
    ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
  },

  // ── Glossy specular highlight along the top-left, on every state ──
  drawGloss: function (ctx, bx, by, bw, bh, S) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(bx + bw * 0.31, by + bh * 0.19, bw * 0.21, bh * 0.095, -0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.ellipse(bx + bw * 0.20, by + bh * 0.34, bw * 0.10, bh * 0.05, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  // ── A pinched wrapper twist fanning out from one end of the body.
  //    dir -1 for the left end, 1 for the right. HP 3 only. ──
  drawTwist: function (ctx, ax, ay, w, h, S, dir) {
    var tw = w * 0.17, th = h * 0.46;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(dir, 1);
    var grad = ctx.createLinearGradient(0, -th / 2, tw, th / 2);
    grad.addColorStop(0, this.PINK_HI);
    grad.addColorStop(0.45, this.PINK);
    grad.addColorStop(1, this.PINK_DK);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -th * 0.26);
    ctx.quadraticCurveTo(tw * 0.88, -th * 0.64, tw, -th * 0.40);
    ctx.quadraticCurveTo(tw * 0.70, -th * 0.14, tw * 0.99, 0);
    ctx.quadraticCurveTo(tw * 0.70, th * 0.14, tw, th * 0.40);
    ctx.quadraticCurveTo(tw * 0.88, th * 0.64, 0, th * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this.PINK_EDGE;
    ctx.lineWidth = 1 * S;
    ctx.stroke();
    // Crease catching the light
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(tw * 0.12, -th * 0.18);
    ctx.lineTo(tw * 0.80, -th * 0.34);
    ctx.stroke();
    ctx.restore();
  },

  // ── HP 3: pink wrapper with a single clean cream diagonal band ──
  drawWrapped: function (ctx, cx, cy, bw, bh, S) {
    var bx = cx - bw / 2, by = cy - bh / 2, r = bw * 0.26;
    ctx.save();
    rRect(bx, by, bw, bh, r); ctx.clip();

    var grad = ctx.createLinearGradient(bx, by, bx + bw * 0.35, by + bh);
    grad.addColorStop(0, this.PINK_HI);
    grad.addColorStop(0.42, this.PINK);
    grad.addColorStop(1, this.PINK_DK);
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw, bh);

    // One wide cream band, bottom-left to top-right
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    var bandT = bh * 0.42;
    var cg = ctx.createLinearGradient(0, -bandT / 2, 0, bandT / 2);
    cg.addColorStop(0, this.CREAM_HI);
    cg.addColorStop(0.55, this.CREAM);
    cg.addColorStop(1, this.CREAM_DK);
    ctx.fillStyle = cg;
    ctx.fillRect(-bw, -bandT / 2, bw * 2, bandT);
    ctx.restore();

    this.drawGloss(ctx, bx, by, bw, bh, S);
    ctx.restore();

    ctx.strokeStyle = this.PINK_EDGE;
    ctx.lineWidth = 1.3 * S;
    rRect(bx, by, bw, bh, r); ctx.stroke();
  },

  // ── One wavy stripe along the rotated axis ──
  wavyStripe: function (ctx, span, yc, amp, thick) {
    ctx.lineWidth = thick;
    ctx.lineCap = 'butt';
    var seg = span / 4, x0 = -span / 2;
    ctx.beginPath();
    ctx.moveTo(x0, yc);
    ctx.quadraticCurveTo(x0 + seg * 0.5, yc - amp, x0 + seg, yc);
    ctx.quadraticCurveTo(x0 + seg * 1.5, yc + amp, x0 + seg * 2, yc);
    ctx.quadraticCurveTo(x0 + seg * 2.5, yc - amp, x0 + seg * 3, yc);
    ctx.quadraticCurveTo(x0 + seg * 3.5, yc + amp, x0 + seg * 4, yc);
    ctx.stroke();
  },

  // ── HP 2 / HP 1 body: the bare hard candy, wavy cream stripes on
  //    pink. Drawn without its own clip so the cracked state can clip
  //    it to each half. ──
  drawStripedBody: function (ctx, cx, cy, bw, bh, S) {
    var bx = cx - bw / 2, by = cy - bh / 2, r = bw * 0.30;
    ctx.save();
    rRect(bx, by, bw, bh, r); ctx.clip();

    var grad = ctx.createLinearGradient(bx, by, bx + bw * 0.35, by + bh);
    grad.addColorStop(0, this.PINK_HI);
    grad.addColorStop(0.42, this.PINK);
    grad.addColorStop(1, this.PINK_DK);
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw, bh);

    // Two wavy cream stripes, leaving pink at both corners and through
    // the middle — the alternating read from the reference sheet.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    var span = Math.max(bw, bh) * 2.0;
    var cg = ctx.createLinearGradient(0, -bh * 0.5, 0, bh * 0.5);
    cg.addColorStop(0, this.CREAM_HI);
    cg.addColorStop(0.5, this.CREAM);
    cg.addColorStop(1, this.CREAM_DK);
    ctx.strokeStyle = cg;
    this.wavyStripe(ctx, span, -bh * 0.29, bh * 0.075, bh * 0.30);
    this.wavyStripe(ctx, span, bh * 0.29, bh * 0.075, bh * 0.30);
    ctx.restore();

    this.drawGloss(ctx, bx, by, bw, bh, S);
    ctx.restore();

    ctx.strokeStyle = this.PINK_EDGE;
    ctx.lineWidth = 1.3 * S;
    rRect(bx, by, bw, bh, r); ctx.stroke();
  },

  // ── Clip to one side of the jagged crack ──
  clipCrackHalf: function (ctx, bx, by, bw, bh, side) {
    var z = this.CRACK_ZIG;
    ctx.beginPath();
    ctx.moveTo(bx + bw * z[0][0], by + bh * z[0][1]);
    for (var i = 1; i < z.length; i++) ctx.lineTo(bx + bw * z[i][0], by + bh * z[i][1]);
    if (side === 'left') {
      ctx.lineTo(bx - bw, by + bh * 1.2);
      ctx.lineTo(bx - bw, by - bh * 0.2);
    } else {
      ctx.lineTo(bx + bw * 2, by + bh * 1.2);
      ctx.lineTo(bx + bw * 2, by - bh * 0.2);
    }
    ctx.closePath();
    ctx.clip();
  },

  // ── Stroke the broken face so the split reads clearly ──
  strokeCrackFace: function (ctx, bx, by, bw, bh, S) {
    var z = this.CRACK_ZIG;
    ctx.strokeStyle = this.CRACK;
    ctx.lineWidth = 1.1 * S;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(bx + bw * z[0][0], by + bh * z[0][1]);
    for (var i = 1; i < z.length; i++) ctx.lineTo(bx + bw * z[i][0], by + bh * z[i][1]);
    ctx.stroke();
  },

  // ── HP 1: the candy split in two, halves pulled apart ──
  drawCracked: function (ctx, cx, cy, bw, bh, S) {
    var bx = cx - bw / 2, by = cy - bh / 2, r = bw * 0.30;
    var gap = Math.max(1.9 * S, bw * 0.075);
    var tilt = Math.max(1.0 * S, bh * 0.032);

    // Dark interior behind the split, so the gap reads as broken candy
    ctx.save();
    ctx.fillStyle = this.CRACK_DK;
    rRect(bx, by, bw, bh, r); ctx.fill();
    ctx.restore();

    // Left half — shifted up and out
    ctx.save();
    ctx.translate(-gap, -tilt);
    this.clipCrackHalf(ctx, bx, by, bw, bh, 'left');
    this.drawStripedBody(ctx, cx, cy, bw, bh, S);
    this.strokeCrackFace(ctx, bx, by, bw, bh, S);
    ctx.restore();

    // Right half — shifted down and out
    ctx.save();
    ctx.translate(gap, tilt);
    this.clipCrackHalf(ctx, bx, by, bw, bh, 'right');
    this.drawStripedBody(ctx, cx, cy, bw, bh, S);
    this.strokeCrackFace(ctx, bx, by, bw, bh, S);
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
      // Wrapper body is narrower to leave room for the twisted ends
      var bw = w * 0.64, bh = h * 0.70;
      this.drawTwist(ctx, cx - bw / 2 + 1 * S, cy, w, h, S, -1);
      this.drawTwist(ctx, cx + bw / 2 - 1 * S, cy, w, h, S, 1);
      this.drawWrapped(ctx, cx, cy, bw, bh, S);
    } else {
      // Unwrapped: no twists, so the candy fills more of the tile
      var sw = w * 0.72, sh = h * 0.72;
      if (hp === 2) this.drawStripedBody(ctx, cx, cy, sw, sh, S);
      else this.drawCracked(ctx, cx, cy, sw, sh, S);
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
      background: 'linear-gradient(135deg,' + c.light + ' 0%,' + c.dark + ' 58%,#F163C4 100%)',
      borderColor: '#F163C4'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:12px;text-shadow:0 1px 2px rgba(0,0,0,0.5)">&#127852;</span>';
  }
});
