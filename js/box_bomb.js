// ============================================================
// box_bomb.js — Glue Bomb box type
// A box with a glue bomb attached. When revealed, a countdown
// starts. Each time any other box is tapped, the countdown
// decreases. If it reaches 0, the bomb auto-taps (spawns its
// marbles) and glues up to 3 adjacent boxes together.
// Tap the bomb before 0 to defuse it — no glue, normal tap.
// Glued boxes are linked: tapping one taps them all.
// ============================================================

registerBoxType('bomb', {
  label: 'Bomb',
  editorColor: '#E87040',

  // Closed state: default box look + bomb icon so the player can plan
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    BoxTypes['default'].drawClosed(ctx, x, y, w, h, ci, S, tick, idlePhase);
    // Bomb icon overlay
    var iconR = Math.min(w, h) * 0.18;
    var ix = x + w - iconR * 0.8;
    var iy = y + iconR * 0.8;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#444';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3 * S;
    ctx.beginPath();
    ctx.arc(ix, iy, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (iconR * 1.3) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDCA3', ix, iy + 1 * S);
    ctx.restore();
  },

  // Reveal animation: same as default
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    BoxTypes['default'].drawReveal.call(BoxTypes['default'], ctx, x, y, w, h, ci, S, phase, remaining, tick);
  },

  // Bomb countdown overlay drawn on revealed bomb boxes
  drawBombOverlay: function (ctx, x, y, w, h, S, countdown, pulseT, tick) {
    var badgeR = Math.min(w, h) * 0.22;
    var bx = x + w - badgeR * 0.6;
    var by = y + badgeR * 0.6;

    ctx.save();
    ctx.translate(bx, by);

    // Pulse when countdown decreases
    var ps = 1 + pulseT * 0.35;
    ctx.scale(ps, ps);

    // Shake when countdown is 1
    if (countdown <= 1) {
      ctx.translate(Math.sin(tick * 0.5) * 2 * S, 0);
    }

    // Badge background
    var bg = countdown <= 1 ? '#CC2222' : '#444';
    ctx.fillStyle = bg;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4 * S;
    ctx.beginPath();
    ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    // Badge border
    ctx.strokeStyle = countdown <= 1 ? '#FF4444' : '#666';
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
    ctx.stroke();

    // Fuse line
    ctx.strokeStyle = '#A08060';
    ctx.lineWidth = 2 * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(badgeR * 0.3, -badgeR * 0.6);
    ctx.quadraticCurveTo(badgeR * 0.7, -badgeR * 0.95, badgeR * 0.2, -badgeR * 1.05);
    ctx.stroke();

    // Spark on fuse tip
    var sparkA = (tick * 0.2) % (Math.PI * 2);
    var sparkAlpha = 0.5 + Math.sin(sparkA) * 0.5;
    ctx.fillStyle = 'rgba(255,200,50,' + sparkAlpha + ')';
    ctx.beginPath();
    ctx.arc(badgeR * 0.2, -badgeR * 1.05, 2.5 * S, 0, Math.PI * 2);
    ctx.fill();

    // Countdown number
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (badgeR * 1.3) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(countdown.toString(), 0, 1 * S);

    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#E87040'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="text-shadow:0 0 4px rgba(232,112,64,0.8)">\uD83D\uDCA3</span>';
  }
});

// ── Glue chain helpers (global functions) ──

function isInGlueChain(idx) {
  for (var g = 0; g < glueChains.length; g++) {
    for (var c = 0; c < glueChains[g].length; c++) {
      if (glueChains[g][c] === idx) return true;
    }
  }
  return false;
}

function getGlueChainFor(idx) {
  for (var g = 0; g < glueChains.length; g++) {
    var chain = glueChains[g];
    for (var c = 0; c < chain.length; c++) {
      if (chain[c] === idx) {
        var result = [];
        for (var k = 0; k < chain.length; k++) {
          if (!stock[chain[k]].used) result.push(chain[k]);
        }
        return result;
      }
    }
  }
  return [idx];
}

// ── Draw glue chain visuals ──

function drawGlueChains() {
  if (!glueChains || glueChains.length === 0) return;

  ctx.save();

  for (var g = 0; g < glueChains.length; g++) {
    var chain = glueChains[g];

    // Draw gooey connections between adjacent chain members
    for (var i = 0; i < chain.length; i++) {
      for (var j = i + 1; j < chain.length; j++) {
        var ai = chain[i], bi = chain[j];
        var sa = stock[ai], sb = stock[bi];
        if (sa.used || sb.used) continue;

        // Check adjacency
        var ar = Math.floor(ai / L.cols), ac = ai % L.cols;
        var br = Math.floor(bi / L.cols), bc = bi % L.cols;
        var dr = Math.abs(ar - br), dc = Math.abs(ac - bc);
        if (!((dr === 1 && dc === 0) || (dr === 0 && dc === 1))) continue;

        var ax = sa.x + L.bw / 2, ay = sa.y + L.bh / 2;
        var bx2 = sb.x + L.bw / 2, by2 = sb.y + L.bh / 2;

        // Thick gooey line
        ctx.strokeStyle = 'rgba(80,200,80,0.35)';
        ctx.lineWidth = 10 * S;
        ctx.lineCap = 'round';
        var mx = (ax + bx2) / 2 + (by2 - ay) * 0.08;
        var my = (ay + by2) / 2 + (ax - bx2) * 0.08;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx, my, bx2, by2);
        ctx.stroke();

        // Inner bright line
        ctx.strokeStyle = 'rgba(100,230,100,0.25)';
        ctx.lineWidth = 5 * S;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx, my, bx2, by2);
        ctx.stroke();
      }
    }

    // Green pulsing border on each glued box
    for (var i = 0; i < chain.length; i++) {
      var s = stock[chain[i]];
      if (s.used) continue;

      var pulse = Math.sin(tick * 0.06 + i * 1.5) * 0.15 + 0.55;
      ctx.strokeStyle = 'rgba(80,200,80,' + pulse + ')';
      ctx.lineWidth = 3 * S;
      rRect(s.x, s.y, L.bw, L.bh, 6 * S);
      ctx.stroke();
    }
  }

  ctx.restore();
}
