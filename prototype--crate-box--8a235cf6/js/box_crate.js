// ============================================================
// box_crate.js — Crate box type
// A block of boxes nailed shut inside a wooden crate. The crate's lock
// is a LIST of colors — one plank per entry, painted in the color that
// plank demands. Tapping an adjacent box whose color is still on the
// list knocks that plank off; any other color thuds against the wood.
// So the planks are the health bar: fewer planks, closer to bursting.
// ============================================================

registerBoxType('crate', {
  label: 'Crate',
  editorColor: '#A9743F',

  // ── Draw the wooden crate (called from drawCrates for the whole footprint) ──
  // The crate is one object spanning every cell it covers. Its planks ARE its
  // health: one plank per remaining lock, painted in the color that plank
  // wants, stacked from the top. Knock them all off and the crate bursts.
  // locks    = colors still needed, top plank first
  // contents = one color index per compartment, in reading order
  // cols/rows = footprint in grid cells
  // maxHp    = planks the crate started with, so the stack reads as a bar
  drawCrateOverlay: function (ctx, x, y, w, h, S, locks, tick, contents, cols, rows, maxHp) {
    locks = locks || [];
    cols = cols || CRATE_SIZE;
    rows = rows || CRATE_SIZE;
    ctx.save();

    // Clip everything to the crate shape
    rRect(x, y, w, h, 8 * S); ctx.clip();

    // ── Compartments: one per box sealed inside, each in its own color ──
    this.drawCompartments(ctx, x, y, w, h, S, contents, cols, rows);

    // ── Wooden cross brace, visible through and around the planks ──
    this.drawBrace(ctx, x, y, w, h, S);

    // ── One plank per remaining lock, in the color it demands ──
    // The stack is sized by the health the crate started with, so a full
    // crate is planked shut and a nearly-broken one reads as open.
    var slots = Math.max(maxHp || locks.length, 2);
    var margin = h * 0.02;
    var slotH = (h - margin * 2) / slots;
    var plankH = slotH * 0.74;

    for (var p = 0; p < locks.length; p++) {
      var py = y + margin + p * slotH;
      var pc = COLORS[locks[p]] || COLORS[0];
      this.drawPlank(ctx, x - w * 0.05, py, w * 1.1, plankH, S, tick, p, pc);
    }

    // ── Plain wooden frame ──
    ctx.strokeStyle = '#8A5B2C';
    ctx.lineWidth = 4.5 * S;
    ctx.globalAlpha = 0.95;
    rRect(x + 2 * S, y + 2 * S, w - 4 * S, h - 4 * S, 7 * S); ctx.stroke();
    ctx.strokeStyle = '#5E3C18';
    ctx.lineWidth = 1.4 * S;
    ctx.globalAlpha = 0.55;
    rRect(x + 5 * S, y + 5 * S, w - 10 * S, h - 10 * S, 5 * S); ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Iron nails in the corners ──
    var nailR = Math.min(w, h) * 0.022;
    var nails = [[0.05, 0.04], [0.95, 0.04], [0.05, 0.96], [0.95, 0.96]];
    for (var n = 0; n < nails.length; n++) {
      var nx = x + w * nails[n][0], ny = y + h * nails[n][1];
      ctx.fillStyle = 'rgba(40,26,12,0.6)';
      ctx.beginPath(); ctx.arc(nx + 0.7 * S, ny + 0.7 * S, nailR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#D8CFC2';
      ctx.beginPath(); ctx.arc(nx, ny, nailR, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  },

  // ── Diagonal cross brace holding the crate together ──
  drawBrace: function (ctx, x, y, w, h, S) {
    var thick = Math.min(w, h) * 0.1;
    ctx.save();
    var braceGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    braceGrad.addColorStop(0, '#C08A4E');
    braceGrad.addColorStop(0.5, '#9C6A38');
    braceGrad.addColorStop(1, '#7A5028');
    ctx.lineCap = 'butt';

    var arms = [[0.04, 0.03, 0.96, 0.97], [0.96, 0.03, 0.04, 0.97]];
    for (var ai = 0; ai < arms.length; ai++) {
      var a = arms[ai];
      ctx.strokeStyle = 'rgba(35,22,8,0.45)';
      ctx.lineWidth = thick * 1.2;
      ctx.beginPath();
      ctx.moveTo(x + w * a[0], y + h * a[1]);
      ctx.lineTo(x + w * a[2], y + h * a[3]);
      ctx.stroke();

      ctx.strokeStyle = braceGrad;
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.moveTo(x + w * a[0], y + h * a[1]);
      ctx.lineTo(x + w * a[2], y + h * a[3]);
      ctx.stroke();
    }
    ctx.restore();
  },

  // ── The boxes sealed inside: one colored compartment per cell ──
  drawCompartments: function (ctx, x, y, w, h, S, contents, cols, rows) {
    var cw = w / cols, ch = h / rows;
    ctx.save();

    for (var r = 0; r < rows; r++) {
      for (var col = 0; col < cols; col++) {
        var slot = r * cols + col;
        var cc = (contents && COLORS[contents[slot]]) ? COLORS[contents[slot]] : COLORS[0];
        var qx = x + cw * col, qy = y + ch * r;

        // The box filling this compartment
        var grad = ctx.createLinearGradient(qx, qy, qx, qy + ch);
        grad.addColorStop(0, cc.light);
        grad.addColorStop(1, cc.dark);
        ctx.fillStyle = grad;
        ctx.fillRect(qx, qy, cw, ch);

        // Its marbles, spread over two rows so some always land in the gaps
        // between the planks
        var mr = Math.min(cw, ch) * 0.115;
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
    for (var d = 1; d < cols; d++) {
      ctx.beginPath(); ctx.moveTo(x + cw * d, y); ctx.lineTo(x + cw * d, y + h); ctx.stroke();
    }
    for (var d = 1; d < rows; d++) {
      ctx.beginPath(); ctx.moveTo(x, y + ch * d); ctx.lineTo(x + w, y + ch * d); ctx.stroke();
    }

    ctx.restore();
  },

  // ── One plank with grain and shading ──
  // pc is the color to paint it (the crate's lock color); omit for bare wood.
  drawPlank: function (ctx, px, py, pw, ph, S, tick, seed, pc) {
    ctx.save();
    var grad = ctx.createLinearGradient(px, py, px, py + ph);
    if (pc) {
      grad.addColorStop(0, pc.light);
      grad.addColorStop(0.4, pc.fill);
      grad.addColorStop(1, pc.dark);
    } else {
      grad.addColorStop(0, '#C99055');
      grad.addColorStop(0.35, '#A9743F');
      grad.addColorStop(1, '#7C5326');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, pw, ph);

    // Top highlight + bottom shadow give the planks depth
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px, py, pw, ph * 0.14);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px, py + ph * 0.84, pw, ph * 0.16);

    // Grain lines
    ctx.strokeStyle = pc ? 'rgba(0,0,0,0.16)' : 'rgba(90,58,26,0.28)';
    ctx.lineWidth = 1 * S;
    for (var g = 0; g < 2; g++) {
      var gy = py + ph * (0.35 + g * 0.28);
      ctx.beginPath();
      ctx.moveTo(px, gy);
      ctx.bezierCurveTo(px + pw * 0.3, gy - ph * 0.08, px + pw * 0.6, gy + ph * 0.08, px + pw, gy);
      ctx.stroke();
    }

    // A small knot in the wood
    ctx.strokeStyle = pc ? 'rgba(0,0,0,0.2)' : 'rgba(80,50,22,0.3)';
    var kx = px + pw * (seed === 1 ? 0.7 : 0.3), ky = py + ph * 0.5;
    ctx.beginPath(); ctx.ellipse(kx, ky, pw * 0.035, ph * 0.16, 0.4, 0, Math.PI * 2); ctx.stroke();

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
    return { background: this.editorCrateBg([ci]), borderColor: '#7C5326' };
  },

  // Wooden tile with the crate's planks stacked on top, in their own colors
  editorCrateBg: function (locks) {
    locks = (locks && locks.length) ? locks : [0];
    var slots = Math.max(locks.length, 2);
    var bands = [];
    for (var i = 0; i < locks.length; i++) {
      var c = COLORS[locks[i]] || COLORS[0];
      var from = (i / slots * 100).toFixed(1) + '%';
      var mid = ((i + 0.74) / slots * 100).toFixed(1) + '%';
      bands.push(c.light + ' ' + from + ',' + c.dark + ' ' + mid +
        ',transparent ' + mid + ',transparent ' + ((i + 1) / slots * 100).toFixed(1) + '%');
    }
    return 'linear-gradient(180deg,' + bands.join(',') + '),' +
      'repeating-linear-gradient(180deg,#C99055 0px,#A9743F 5px,#7C5326 7px,#C99055 9px)';
  },

  editorCellHTML: function (ci) {
    var c = COLORS[ci];
    return '<span class="ed-cell-dot" style="font-size:13px;text-shadow:0 0 6px ' + c.fill +
      ',0 0 3px ' + c.fill + '">&#128230;</span>';
  },

  // Covered cells of a placed crate (everything but its top-left anchor)
  editorCoverStyle: function (ci) {
    return { background: this.editorCrateBg([ci]), borderColor: '#7C5326' };
  }
});
