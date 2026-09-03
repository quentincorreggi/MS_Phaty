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

  // ── Draw the wooden crate (called from drawCrates for the whole footprint) ──
  // The crate is one object spanning every cell it covers. Its frame carries
  // the lock color — the only color that damages it — while each compartment
  // shows the color of the box sealed in that cell.
  // contents = one color index per compartment, in reading order.
  drawCrateOverlay: function (ctx, x, y, w, h, S, hp, ci, tick, contents) {
    var c = COLORS[ci] || COLORS[0];
    ctx.save();

    // Clip everything to the crate shape
    rRect(x, y, w, h, 8 * S); ctx.clip();

    // ── Compartments: one per box sealed inside, each in its own color ──
    this.drawCompartments(ctx, x, y, w, h, S, c, contents);

    // ── Horizontal planks, with wide gaps so the color glows through ──
    var PLANKS = 4;
    var plankH = h * 0.185;
    var gap = h * 0.077;
    var startY = y + h * 0.021;

    var brokenPlank = (hp <= 1) ? 2 : -1;   // a plank splits away at 1 HP

    for (var p = 0; p < PLANKS; p++) {
      var py = startY + p * (plankH + gap);
      if (p === brokenPlank) {
        // Broken plank — two stubs with a bite out of the middle
        this.drawPlank(ctx, x - w * 0.05, py, w * 0.40, plankH, S, tick, p);
        this.drawPlank(ctx, x + w * 0.70, py, w * 0.40, plankH, S, tick, p);
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
    ctx.lineWidth = w * 0.085;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.05, y + h * 0.05);
    ctx.lineTo(x + w * 0.95, y + h * 0.95);
    ctx.stroke();
    if (hp >= 2) {   // second brace snaps off at 1 HP
      ctx.beginPath();
      ctx.moveTo(x + w * 0.95, y + h * 0.05);
      ctx.lineTo(x + w * 0.05, y + h * 0.95);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.95, y + h * 0.05);
      ctx.lineTo(x + w * 0.60, y + h * 0.40);
      ctx.stroke();
    }
    ctx.restore();

    // ── Colored frame so the crate's color always reads at a glance ──
    ctx.strokeStyle = c.fill;
    ctx.lineWidth = 4.5 * S;
    ctx.globalAlpha = 0.95;
    rRect(x + 2 * S, y + 2 * S, w - 4 * S, h - 4 * S, 7 * S); ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = c.light;
    ctx.lineWidth = 1.4 * S;
    rRect(x + 6 * S, y + 6 * S, w - 12 * S, h - 12 * S, 5 * S); ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Nails in the corners, tinted with the crate color ──
    var nailR = w * 0.02;
    var nails = [[0.09, 0.09], [0.91, 0.09], [0.09, 0.91], [0.91, 0.91]];
    for (var n = 0; n < nails.length; n++) {
      var nx = x + w * nails[n][0], ny = y + h * nails[n][1];
      ctx.fillStyle = 'rgba(60,40,22,0.55)';
      ctx.beginPath(); ctx.arc(nx + 0.7 * S, ny + 0.7 * S, nailR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.light;
      ctx.beginPath(); ctx.arc(nx, ny, nailR, 0, Math.PI * 2); ctx.fill();
    }

    // ── Damage cracks ──
    if (hp <= 2) this.drawCracks(ctx, x, y, w, h, S, hp);

    ctx.restore();
  },

  // ── The boxes sealed inside: one colored compartment per cell ──
  drawCompartments: function (ctx, x, y, w, h, S, lockColor, contents) {
    var cw = w / CRATE_SIZE, ch = h / CRATE_SIZE;
    ctx.save();

    for (var r = 0; r < CRATE_SIZE; r++) {
      for (var col = 0; col < CRATE_SIZE; col++) {
        var slot = r * CRATE_SIZE + col;
        var cc = (contents && COLORS[contents[slot]]) ? COLORS[contents[slot]] : lockColor;
        var qx = x + cw * col, qy = y + ch * r;

        // The box filling this compartment
        var grad = ctx.createLinearGradient(qx, qy, qx, qy + ch);
        grad.addColorStop(0, cc.light);
        grad.addColorStop(1, cc.dark);
        ctx.fillStyle = grad;
        ctx.fillRect(qx, qy, cw, ch);

        // Its marbles, spread over two rows so some always land in the gaps
        // between the planks
        var mr = cw * 0.115;
        var ccx = qx + cw * 0.5, ccy = qy + ch * 0.5;
        for (var mrow = 0; mrow < 2; mrow++) {
          for (var m = 0; m < 3; m++) {
            var mx = ccx + (m - 1) * mr * 2.3;
            var my = ccy + (mrow - 0.5) * mr * 2.3;
            ctx.fillStyle = 'rgba(40,26,12,0.3)';
            ctx.beginPath(); ctx.arc(mx, my + mr * 0.25, mr, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = cc.fill;
            ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.3, mr * 0.32, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    // Divider shadows between the compartments
    ctx.strokeStyle = 'rgba(48,30,12,0.6)';
    ctx.lineWidth = 3.5 * S;
    for (var d = 1; d < CRATE_SIZE; d++) {
      ctx.beginPath(); ctx.moveTo(x + cw * d, y); ctx.lineTo(x + cw * d, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + ch * d); ctx.lineTo(x + w, y + ch * d); ctx.stroke();
    }

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
    ctx.strokeStyle = 'rgba(38,22,8,0.7)';
    ctx.lineWidth = 2.2 * S;
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

  // ── Closed state: nothing per cell ──
  // A crate spans several cells and is drawn as one piece by drawCrates(),
  // so the individual boxes it covers draw nothing of their own.
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {},

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
  },

  // Covered cells of a placed crate (everything but its top-left anchor)
  editorCoverStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,#B07E45 0%,#98673A 45%,#6E4520 100%)',
      borderColor: c.fill
    };
  }
});
