// ============================================================
// box_tricolor.js — Tricolor box type
// Contains 9 marbles of 3 different colors (3 each), arranged
// in a 3x3 grid with same colors in vertical columns.
// The box displays 3 vertical color stripes in both states.
// ============================================================

// Helper: compute the 3 colors for a tricolor box
function tricolorColors(box) {
  if (box.triColors) return box.triColors;
  var ci = box.ci;
  return [ci, (ci + 1) % NUM_COLORS, (ci + 2) % NUM_COLORS];
}

// Helper: draw a tricolor box (3 vertical color stripes)
function drawTricolorBox(x, y, w, h, triColors, alpha) {
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;

  // Shadow on base shape
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;
  var midC = COLORS[triColors[1]];
  var baseGrad = ctx.createLinearGradient(x, y, x, y + h);
  baseGrad.addColorStop(0, midC.light);
  baseGrad.addColorStop(1, midC.dark);
  ctx.fillStyle = baseGrad;
  rRect(x, y, w, h, 6 * S);
  ctx.fill();

  // Turn off shadow, clip, then paint 3 stripes
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.save();
  rRect(x, y, w, h, 6 * S);
  ctx.clip();
  var sw = w / 3;
  for (var i = 0; i < 3; i++) {
    var c = COLORS[triColors[i]];
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    ctx.fillRect(x + i * sw, y, sw + 1, h);
  }
  ctx.restore();

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 6 * S);
  ctx.stroke();

  // Subtle divider lines between stripes
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1 * S;
  for (var i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * sw, y + 3 * S);
    ctx.lineTo(x + i * sw, y + h - 3 * S);
    ctx.stroke();
  }

  ctx.restore();
}

// Helper: draw tricolor box lip
function drawTricolorBoxLip(triColors) {
  ctx.save();
  var lipH = L.bh * LIP_PCT;
  ctx.beginPath();
  ctx.rect(-L.bw / 2, L.bh / 2 - lipH, L.bw, lipH);
  ctx.clip();
  drawTricolorBox(-L.bw / 2, -L.bh / 2, L.bw, L.bh, triColors);
  ctx.restore();
}

// Helper: draw 3x3 marbles with per-column colors
function drawBoxMarblesTricolor(triColors, remaining) {
  if (remaining <= 0) return;
  var mr = Math.min(7 * S, L.bw / 8.5);
  var mg = Math.min(14 * S, L.bw / 4.2);
  var mgY = mg * MRB_GAP_FACTOR;
  var gone = MRB_PER_BOX - remaining;
  var mrbsToDraw = [];
  for (var si = gone; si < MRB_PER_BOX; si++) {
    mrbsToDraw.push({ r: SNAKE_ORDER[si].r, c: SNAKE_ORDER[si].c });
  }
  mrbsToDraw.sort(function (a, b) { return a.r - b.r; });
  for (var si = 0; si < mrbsToDraw.length; si++) {
    var sp = mrbsToDraw[si];
    var mci = triColors[sp.c];
    drawMarble((sp.c - 1) * mg, (sp.r - 1) * mgY - 2 * S, mr, mci);
  }
}

registerBoxType('tricolor', {
  label: 'Tricolor',
  editorColor: '#E8B84C',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase, box) {
    var tc = box ? tricolorColors(box) : [ci, (ci + 1) % NUM_COLORS, (ci + 2) % NUM_COLORS];

    ctx.save();
    ctx.globalAlpha = 0.65;
    drawTricolorBox(x, y, w, h, tc);
    ctx.globalAlpha = 1;

    // Lock icon
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.28) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDD12', x + w / 2, y + h * 0.5);
    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick, box) {
    var tc = box ? tricolorColors(box) : [ci, (ci + 1) % NUM_COLORS, (ci + 2) % NUM_COLORS];
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);

    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0, box);
      ctx.globalAlpha = phase * 2;
    }

    drawTricolorBox(x, y, w, h, tc);

    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarblesTricolor(tc, remaining);
      ctx.globalAlpha = 1;
      drawTricolorBoxLip(tc);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c0 = COLORS[ci];
    var c1 = COLORS[(ci + 1) % NUM_COLORS];
    var c2 = COLORS[(ci + 2) % NUM_COLORS];
    return {
      background: 'linear-gradient(90deg,' + c0.fill + ' 0%,' + c0.fill + ' 33%,' + c1.fill + ' 33%,' + c1.fill + ' 66%,' + c2.fill + ' 66%,' + c2.fill + ' 100%)',
      borderColor: '#E8B84C'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:9px">\u2503</span>';
  }
});
