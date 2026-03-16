// ============================================================
// box_shifter.js — Shifter box type
// A box that changes color every 3 box taps anywhere on the
// grid. The player must time their taps to get the right color.
// ============================================================

var shifterTapCount = 0;
var SHIFTER_TAP_THRESHOLD = 3;

function onBoxTappedForShifters() {
  shifterTapCount++;
  if (shifterTapCount >= SHIFTER_TAP_THRESHOLD) {
    shifterTapCount = 0;
    shiftAllShifterColors();
  }
}

function shiftAllShifterColors() {
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.boxType !== 'shifter') continue;
    if (b.used || b.empty || b.isTunnel || b.isWall) continue;
    // Pick a new color different from current
    var newCi = b.ci;
    var attempts = 0;
    while (newCi === b.ci && attempts < 20) {
      newCi = Math.floor(Math.random() * NUM_COLORS);
      attempts++;
    }
    b.ci = newCi;
    b.shifterFlashT = 1.0;
    // Sparkle particles
    var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
    for (var p = 0; p < 14; p++) {
      var a = Math.PI * 2 * p / 14 + Math.random() * 0.3;
      var sp = 2 + Math.random() * 3;
      particles.push({
        x: bx, y: by,
        vx: Math.cos(a) * sp * S,
        vy: Math.sin(a) * sp * S,
        r: (2 + Math.random() * 3) * S,
        color: COLORS[newCi].fill,
        life: 0.8, decay: 0.025 + Math.random() * 0.02, grav: false
      });
    }
    sfx.pop();
  }
}

registerBoxType('shifter', {
  label: 'Shifter',
  editorColor: '#E040FB',

  drawClosed: function(ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.globalAlpha = 0.5;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
    // Rainbow shimmer border
    this._drawShifterOverlay(ctx, x, y, w, h, S, tick);
  },

  drawReveal: function(ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.08;
    ctx.save();
    ctx.scale(popScale, popScale);
    if (phase < 0.5) {
      ctx.globalAlpha = 1;
    }
    drawBox(x, y, w, h, ci);
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    this._drawShifterOverlay(ctx, x, y, w, h, S, tick);
    ctx.restore();
  },

  _drawShifterOverlay: function(ctx, x, y, w, h, S, tick) {
    ctx.save();
    // Animated rainbow border
    var hueShift = (tick * 3) % 360;
    var borderW = 2.5 * S;
    ctx.lineWidth = borderW;
    ctx.strokeStyle = 'hsl(' + hueShift + ',80%,60%)';
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Second offset hue for shimmer
    ctx.lineWidth = 1.5 * S;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = 'hsl(' + ((hueShift + 120) % 360) + ',80%,70%)';
    rRect(x + 1 * S, y + 1 * S, w - 2 * S, h - 2 * S, 5 * S); ctx.stroke();

    // Circular arrow icon
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.28) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\u21BB', x + w / 2, y + h / 2);
    ctx.restore();
  },

  editorCellStyle: function(ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#E040FB'
    };
  },

  editorCellHTML: function(ci) {
    return '<span class="ed-cell-dot" style="text-shadow:0 0 4px rgba(224,64,251,0.8)">\u21BB</span>';
  }
});
