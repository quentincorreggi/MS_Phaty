// ============================================================
// box_crate.js — Crate box type
// A box nailed shut inside a wooden crate (3 HP). The crate only
// takes damage when an ADJACENT box OF THE SAME COLOR is tapped.
// Any other color just thuds against the wood.
// HP 3 → pristine crate, HP 2 → cracked, HP 1 → plank broken,
// HP 0 → crate bursts and the box becomes tappable.
// ============================================================

registerBoxType('crate', {
  label: 'Crate',
  editorColor: '#A9743F',

  // ── Draw wooden crate overlay (called from drawStock after the base box) ──
  // The crate color shows through the gaps between the planks so the
  // player can tell which color has to be tapped next to it.
  drawCrateOverlay: function (ctx, x, y, w, h, S, hp, ci, tick) {
    var c = COLORS[ci] || COLORS[0];
    ctx.save();

    // Clip everything to the box shape
    rRect(x, y, w, h, 6 * S); ctx.clip();

    // ── Colored light seeping out from behind the planks ──
    ctx.fillStyle = c.fill;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;

    // ── Three horizontal planks, with wide gaps so the color glows through ──
    var plankH = h * 0.235;
    var gap = h * 0.105;
    var startY = y + h * 0.045;

    // Bright seams of colored light in the gaps
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = c.light;
    for (var s2 = 0; s2 < 2; s2++) {
      var sy = startY + plankH + s2 * (plankH + gap);
      ctx.fillRect(x, sy + gap * 0.2, w, gap * 0.6);
    }
    ctx.restore();
    var brokenPlank = (hp <= 1) ? 1 : -1;   // middle plank splits at 1 HP

    for (var p = 0; p < 3; p++) {
      var py = startY + p * (plankH + gap);
      if (p === brokenPlank) {
        // Broken plank — two stubs with a jagged bite out of the middle
        this.drawPlank(ctx, x - w * 0.05, py, w * 0.42, plankH, S, tick, p);
        this.drawPlank(ctx, x + w * 0.68, py, w * 0.42, plankH, S, tick, p);
      } else {
        this.drawPlank(ctx, x - w * 0.05, py, w * 1.1, plankH, S, tick, p);
      }
    }

    // ── Diagonal brace (the crate "X") ──
    ctx.save();
    ctx.globalAlpha = 0.9;
    var braceGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    braceGrad.addColorStop(0, '#C08A4E');
    braceGrad.addColorStop(0.5, '#9C6A38');
    braceGrad.addColorStop(1, '#7A5028');
    ctx.strokeStyle = braceGrad;
    ctx.lineWidth = w * 0.105;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.06, y + h * 0.06);
    ctx.lineTo(x + w * 0.94, y + h * 0.94);
    ctx.stroke();
    if (hp >= 2) {   // second brace snaps off at 1 HP
      ctx.beginPath();
      ctx.moveTo(x + w * 0.94, y + h * 0.06);
      ctx.lineTo(x + w * 0.06, y + h * 0.94);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.94, y + h * 0.06);
      ctx.lineTo(x + w * 0.58, y + h * 0.42);
      ctx.stroke();
    }
    ctx.restore();

    // ── Colored frame so the crate's color always reads at a glance ──
    ctx.strokeStyle = c.fill;
    ctx.lineWidth = 3.5 * S;
    ctx.globalAlpha = 0.95;
    rRect(x + 1.5 * S, y + 1.5 * S, w - 3 * S, h - 3 * S, 5 * S); ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = c.light;
    ctx.lineWidth = 1.2 * S;
    rRect(x + 4.5 * S, y + 4.5 * S, w - 9 * S, h - 9 * S, 4 * S); ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Nails in the corners, tinted with the crate color ──
    var nailR = w * 0.028;
    var nails = [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]];
    for (var n = 0; n < nails.length; n++) {
      var nx = x + w * nails[n][0], ny = y + h * nails[n][1];
      ctx.fillStyle = 'rgba(60,40,22,0.55)';
      ctx.beginPath(); ctx.arc(nx + 0.6 * S, ny + 0.6 * S, nailR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.light;
      ctx.beginPath(); ctx.arc(nx, ny, nailR, 0, Math.PI * 2); ctx.fill();
    }

    // ── Damage cracks ──
    if (hp <= 2) this.drawCracks(ctx, x, y, w, h, S, hp);

    ctx.restore();
  },

  // ── One wooden plank with grain and shading ──
  drawPlank: function (ctx, px, py, pw, ph, S, tick, seed) {
    ctx.save();
    var grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, '#C99055');
    grad.addColorStop(0.35, '#A9743F');
    grad.addColorStop(1, '#7C5326');
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, pw, ph);

    // Top highlight + bottom shadow give the planks depth
    ctx.fillStyle = 'rgba(255,225,180,0.22)';
    ctx.fillRect(px, py, pw, ph * 0.14);
    ctx.fillStyle = 'rgba(50,30,14,0.28)';
    ctx.fillRect(px, py + ph * 0.84, pw, ph * 0.16);

    // Wood grain lines
    ctx.strokeStyle = 'rgba(90,58,26,0.28)';
    ctx.lineWidth = 1 * S;
    for (var g = 0; g < 2; g++) {
      var gy = py + ph * (0.35 + g * 0.28);
      ctx.beginPath();
      ctx.moveTo(px, gy);
      ctx.bezierCurveTo(px + pw * 0.3, gy - ph * 0.08, px + pw * 0.6, gy + ph * 0.08, px + pw, gy);
      ctx.stroke();
    }

    // A small knot in the wood
    ctx.strokeStyle = 'rgba(80,50,22,0.3)';
    var kx = px + pw * (seed === 1 ? 0.7 : 0.3), ky = py + ph * 0.5;
    ctx.beginPath(); ctx.ellipse(kx, ky, pw * 0.035, ph * 0.16, 0.4, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();
  },

  // ── Cracks that deepen as the crate takes hits ──
  drawCracks: function (ctx, x, y, w, h, S, hp) {
    ctx.save();
    ctx.strokeStyle = 'rgba(32,18,6,0.85)';
    ctx.lineWidth = 2.6 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // First split — appears at 2 HP, runs right across the top plank
    ctx.beginPath();
    ctx.moveTo(x - w * 0.02, y + h * 0.10);
    ctx.lineTo(x + w * 0.26, y + h * 0.20);
    ctx.lineTo(x + w * 0.46, y + h * 0.11);
    ctx.lineTo(x + w * 0.68, y + h * 0.22);
    ctx.lineTo(x + w * 1.02, y + h * 0.13);
    ctx.stroke();
    // A crack running down out of the split
    ctx.beginPath();
    ctx.moveTo(x + w * 0.26, y + h * 0.20);
    ctx.lineTo(x + w * 0.20, y + h * 0.34);
    ctx.lineTo(x + w * 0.34, y + h * 0.48);
    ctx.stroke();

    if (hp <= 1) {
      // Second wave of cracks — the crate is one hit from bursting
      ctx.beginPath();
      ctx.moveTo(x + w * 0.86, y + h * 0.22);
      ctx.lineTo(x + w * 0.70, y + h * 0.44);
      ctx.lineTo(x + w * 0.78, y + h * 0.56);
      ctx.lineTo(x + w * 0.62, y + h * 0.78);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.70, y + h * 0.44);
      ctx.lineTo(x + w * 0.52, y + h * 0.60);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.20, y + h * 0.70);
      ctx.lineTo(x + w * 0.40, y + h * 0.88);
      ctx.stroke();
    }

    // Light edge along the split so it reads on dark wood
    ctx.strokeStyle = 'rgba(255,225,180,0.35)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.02, y + h * 0.085);
    ctx.lineTo(x + w * 0.26, y + h * 0.185);
    ctx.lineTo(x + w * 0.46, y + h * 0.095);
    ctx.lineTo(x + w * 0.68, y + h * 0.205);
    ctx.lineTo(x + w * 1.02, y + h * 0.115);
    ctx.stroke();

    ctx.restore();
  },

  // ── Closed state: crate over a dim version of the box ──
  // The crate overlay itself is drawn by drawStock, so we only lay
  // down the colored box underneath here.
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    var c = COLORS[ci];
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
  },

  // ── Reveal animation (box under the crate opens up) ──
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

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,#C99055 0%,#A9743F 45%,#7C5326 100%)',
      borderColor: c.fill
    };
  },

  editorCellHTML: function (ci) {
    var c = COLORS[ci];
    return '<span class="ed-cell-dot" style="font-size:13px;text-shadow:0 0 6px ' + c.fill +
      ',0 0 3px ' + c.fill + '">&#128230;</span>';
  }
});
