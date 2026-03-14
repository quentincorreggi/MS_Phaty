// ============================================================
// box_double.js — Double (x2) box type
// Contains twice the marbles of a normal box (18 instead of 9).
// A gold "x2" badge shows on the box so players know it's special.
// ============================================================

var DOUBLE_MULTIPLIER = 2;

registerBoxType('double', {
  label: 'x2',
  editorColor: '#DAA520',

  defaultState: function () {
    return {
      remaining: MRB_PER_BOX * DOUBLE_MULTIPLIER,
      totalMarbles: MRB_PER_BOX * DOUBLE_MULTIPLIER
    };
  },

  countMarbles: function (box) {
    return { regular: MRB_PER_BOX * DOUBLE_MULTIPLIER };
  },

  // ── Closed state: golden-tinted box with x2 label ──
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
    // Desaturation overlay
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    // Gold border
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#DAA520'; ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // x2 label instead of lock icon
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#DAA520';
    ctx.font = 'bold ' + (h * 0.35) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('x2', x + w / 2, y + h / 2);
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
      drawBoxMarblesDouble(ci, remaining, MRB_PER_BOX * DOUBLE_MULTIPLIER);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    // Gold x2 badge during reveal
    if (phase > 0.5 && remaining > 0) {
      ctx.globalAlpha = Math.min(1, (phase - 0.5) / 0.3);
      drawDoubleBadge(ctx, x, y, w, h, S);
    }
    ctx.restore();
  },

  // ── Custom open-box rendering with double marbles + badge ──
  drawOpenBox: function (ctx, x, y, w, h, box, S, tick) {
    drawBox(x, y, w, h, box.ci);
    if (box.remaining > 0) {
      drawBoxMarblesDouble(box.ci, box.remaining, box.totalMarbles);
      drawBoxLip(box.ci);
    }
  },

  // ── Gold x2 badge overlay on revealed boxes with marbles left ──
  drawOverlay: function (ctx, x, y, w, h, box, S, tick) {
    if (box.remaining > 0 && box.revealed && box.revealT <= 0) {
      drawDoubleBadge(ctx, x, y, w, h, S);
    }
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#DAA520'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#DAA520;font-weight:bold;text-shadow:0 0 4px rgba(218,165,32,0.6)">x2</span>';
  }
});

// ── Draw the x2 badge overlay (gold pill with white text) ──
function drawDoubleBadge(ctx, x, y, w, h, S) {
  ctx.save();
  var bw = w * 0.5;
  var bh = h * 0.28;
  var bx = x + w - bw * 0.85;
  var by = y - bh * 0.15;

  // Gold pill background
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
  ctx.fillStyle = '#DAA520';
  rRect(bx, by, bw, bh, bh / 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // White border
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1 * S;
  rRect(bx, by, bw, bh, bh / 2); ctx.stroke();

  // White "x2" text
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold ' + (bh * 0.65) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('x2', bx + bw / 2, by + bh / 2);
  ctx.restore();
}

// ── Draw marbles for double box (two layers in 3x3 grid) ──
function drawBoxMarblesDouble(ci, remaining, totalMarbles) {
  if (remaining <= 0) return;
  var mr = Math.min(7 * S, L.bw / 8.5);
  var mg = Math.min(14 * S, L.bw / 4.2);
  var mgY = mg * MRB_GAP_FACTOR;
  var gone = totalMarbles - remaining;
  var mrbsToDraw = [];
  for (var si = gone; si < totalMarbles; si++) {
    mrbsToDraw.push({ r: SNAKE_ORDER[si % MRB_PER_BOX].r, c: SNAKE_ORDER[si % MRB_PER_BOX].c, layer: si < MRB_PER_BOX ? 0 : 1 });
  }
  mrbsToDraw.sort(function (a, b) { return a.r === b.r ? a.layer - b.layer : a.r - b.r; });
  for (var si = 0; si < mrbsToDraw.length; si++) {
    var sp = mrbsToDraw[si];
    var layerOffset = sp.layer === 0 ? -4 * S : -2 * S;
    var layerScale = sp.layer === 0 ? 0.8 : 1;
    drawMarble((sp.c - 1) * mg, (sp.r - 1) * mgY + layerOffset, mr * layerScale, ci);
  }
}
