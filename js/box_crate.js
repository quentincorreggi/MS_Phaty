// ============================================================
// box_crate.js — Wooden Crate box type
// Covers a single box of marbles. Starts locked — cannot be
// tapped directly. When any adjacent box is opened (tapped),
// the crate breaks and becomes a normal tappable box.
// ============================================================

registerBoxType('crate', {
  label: 'Crate',
  editorColor: '#8B5E3C',

  // ── Draw the wooden crate overlay ──
  drawCrateOverlay: function (ctx, x, y, w, h, S, tick) {
    ctx.save();

    // Background wood fill
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#CE9850');
    grad.addColorStop(0.45, '#A3723C');
    grad.addColorStop(1, '#7B5228');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S);
    ctx.fill();

    // Interior clip for slats and grain
    ctx.save();
    ctx.beginPath();
    rRect(x, y, w, h, 6 * S);
    ctx.clip();

    // Horizontal slat dividers (4 equal slats)
    var numSlats = 4;
    var slatH = h / numSlats;
    ctx.strokeStyle = 'rgba(55, 28, 5, 0.58)';
    ctx.lineWidth = 2 * S;
    for (var si = 1; si < numSlats; si++) {
      var sy = y + si * slatH;
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x + w, sy);
      ctx.stroke();
    }

    // Subtle wood grain highlight per slat
    ctx.strokeStyle = 'rgba(215, 160, 80, 0.28)';
    ctx.lineWidth = 0.9 * S;
    for (var si = 0; si < numSlats; si++) {
      var gy = y + si * slatH + slatH * 0.3;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.07, gy);
      ctx.lineTo(x + w * 0.93, gy);
      ctx.stroke();
    }

    ctx.restore(); // end clip

    // Corner metal brackets
    var bSz = Math.min(w, h) * 0.20;
    ctx.strokeStyle = 'rgba(38, 18, 4, 0.78)';
    ctx.lineWidth = 2.5 * S;
    ctx.lineCap = 'square';

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x + bSz, y + 3 * S);
    ctx.lineTo(x + 3 * S, y + 3 * S);
    ctx.lineTo(x + 3 * S, y + bSz);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + w - bSz, y + 3 * S);
    ctx.lineTo(x + w - 3 * S, y + 3 * S);
    ctx.lineTo(x + w - 3 * S, y + bSz);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x + bSz, y + h - 3 * S);
    ctx.lineTo(x + 3 * S, y + h - 3 * S);
    ctx.lineTo(x + 3 * S, y + h - bSz);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w - bSz, y + h - 3 * S);
    ctx.lineTo(x + w - 3 * S, y + h - 3 * S);
    ctx.lineTo(x + w - 3 * S, y + h - bSz);
    ctx.stroke();

    // Outer border
    ctx.strokeStyle = 'rgba(45, 22, 4, 0.65)';
    ctx.lineWidth = 2 * S;
    ctx.lineCap = 'round';
    rRect(x, y, w, h, 6 * S);
    ctx.stroke();

    // Soft top-left highlight
    ctx.fillStyle = 'rgba(255, 220, 140, 0.14)';
    ctx.beginPath();
    ctx.arc(x + w * 0.28, y + h * 0.22, w * 0.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  // ── Closed state (hidden by neighbor — crate not yet revealed) ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    var c = COLORS[ci];
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
    this.drawCrateOverlay(ctx, x, y, w, h, S, tick);
  },

  // ── Reveal animation (crate popping into view) ──
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var pop = 1 + Math.sin(phase * Math.PI) * 0.08;
    ctx.save();
    ctx.scale(pop, pop);
    this.drawCrateOverlay(ctx, x, y, w, h, S, tick);
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    return {
      background: 'linear-gradient(135deg, #CE9850, #7B5228)',
      borderColor: '#45220A'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#FFD898;font-size:1.15em">&#9776;</span>';
  }
});
