// ============================================================
// box_stone.js — Stone box type
// A box encased in a granite crust (STONE_HP taps). Unlike ice,
// the player breaks stone by tapping the box ITSELF: each tap
// chips the crust, and the final tap smashes it open and
// releases the marbles in the same tap.
// HP 3 → fresh stone, HP 2 → chipped, HP 1 → badly cracked,
// HP 0 → free (boxType flips to 'default').
//
// The crust is drawn by drawStoneOverlay(), called from drawStock
// for any box with stoneHP > 0 — the same arrangement ice uses.
// drawClosed / drawReveal below therefore draw only the box
// underneath, so the crust never gets painted twice.
// ============================================================

registerBoxType('stone', {
  label: 'Stone',
  editorColor: '#8A8580',

  // Fixed fleck positions so the granite speckle is stable per box
  // (fractions of w/h, like the ice crystals in box_ice.js).
  stoneFlecks: [
    { fx: 0.18, fy: 0.22, fr: 0.055 }, { fx: 0.74, fy: 0.16, fr: 0.040 },
    { fx: 0.52, fy: 0.34, fr: 0.032 }, { fx: 0.30, fy: 0.58, fr: 0.048 },
    { fx: 0.83, fy: 0.62, fr: 0.036 }, { fx: 0.62, fy: 0.78, fr: 0.044 },
    { fx: 0.22, fy: 0.85, fr: 0.030 }, { fx: 0.45, fy: 0.13, fr: 0.026 },
    { fx: 0.88, fy: 0.40, fr: 0.024 }, { fx: 0.12, fy: 0.46, fr: 0.028 }
  ],

  // ── Crack networks. Index 0 appears at HP 2, index 1 adds at HP 1 ──
  stoneCracks: [
    [[0.14, 0.10], [0.32, 0.34], [0.27, 0.44], [0.46, 0.62], [0.40, 0.74], [0.56, 0.92]],
    [[0.92, 0.22], [0.70, 0.38], [0.76, 0.50], [0.54, 0.56], [0.58, 0.70], [0.34, 0.88]]
  ],
  stoneBranches: [
    [[0.32, 0.34], [0.56, 0.26]],
    [[0.46, 0.62], [0.72, 0.66], [0.86, 0.60]],
    [[0.70, 0.38], [0.48, 0.30], [0.36, 0.18]],
    [[0.54, 0.56], [0.30, 0.64]]
  ],

  // ── Draw the granite crust over a box (called from drawStock) ──
  drawStoneOverlay: function (ctx, x, y, w, h, S, hp, tick, ci, crackT) {
    var maxHP = (typeof STONE_HP !== 'undefined') ? STONE_HP : 3;
    if (hp > maxHP) hp = maxHP;
    // Fresh stone hides most of the colour; each chip lets more through.
    var alpha = hp >= 3 ? 0.90 : (hp === 2 ? 0.78 : 0.60);
    var c = COLORS[ci] || COLORS[0];

    ctx.save();
    rRect(x, y, w, h, 6 * S); ctx.clip();

    // ── Granite body ──
    ctx.globalAlpha = alpha;
    var grad = ctx.createLinearGradient(x, y, x + w * 0.35, y + h);
    grad.addColorStop(0, '#A29B92');
    grad.addColorStop(0.45, '#8A8580');
    grad.addColorStop(1, '#645D56');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // ── Flecks — light and dark grains in the rock ──
    for (var f = 0; f < this.stoneFlecks.length; f++) {
      var fl = this.stoneFlecks[f];
      ctx.fillStyle = (f % 2 === 0) ? 'rgba(220,214,206,0.30)' : 'rgba(58,52,46,0.30)';
      ctx.beginPath();
      ctx.arc(x + w * fl.fx, y + h * fl.fy, w * fl.fr, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Colour wash so a fresh stone box still reads as its colour
    //    (the player can plan a route before breaking it open) ──
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = c.fill;
    ctx.fillRect(x, y, w, h);

    // ── Carved bevel — lit from the top-left, shaded bottom-right ──
    ctx.globalAlpha = alpha;
    var bev = Math.max(2 * S, w * 0.07);
    ctx.strokeStyle = 'rgba(232,226,218,0.35)';
    ctx.lineWidth = bev;
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, y); ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(48,42,38,0.32)';
    ctx.beginPath();
    ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Cracks — the box colour glows out through them ──
    var networks = maxHP - hp;   // 0 fresh, 1 chipped, 2 badly cracked
    if (networks > this.stoneCracks.length) networks = this.stoneCracks.length;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var n = 0; n < networks; n++) {
      var path = this.stoneCracks[n];
      // Colour bleeding through the gap
      ctx.strokeStyle = c.glow;
      ctx.lineWidth = 3.5 * S;
      ctx.beginPath();
      ctx.moveTo(x + w * path[0][0], y + h * path[0][1]);
      for (var p = 1; p < path.length; p++) ctx.lineTo(x + w * path[p][0], y + h * path[p][1]);
      ctx.stroke();
      // Dark fissure on top
      ctx.strokeStyle = 'rgba(38,32,28,0.62)';
      ctx.lineWidth = 1.6 * S;
      ctx.beginPath();
      ctx.moveTo(x + w * path[0][0], y + h * path[0][1]);
      for (var p = 1; p < path.length; p++) ctx.lineTo(x + w * path[p][0], y + h * path[p][1]);
      ctx.stroke();
    }
    // Branch cracks — two per network
    var nBranch = Math.min(networks * 2, this.stoneBranches.length);
    ctx.strokeStyle = 'rgba(38,32,28,0.45)';
    ctx.lineWidth = 1.1 * S;
    for (var bi = 0; bi < nBranch; bi++) {
      var br = this.stoneBranches[bi];
      ctx.beginPath();
      ctx.moveTo(x + w * br[0][0], y + h * br[0][1]);
      for (var q = 1; q < br.length; q++) ctx.lineTo(x + w * br[q][0], y + h * br[q][1]);
      ctx.stroke();
    }

    // ── Impact flash right after a chip ──
    if (crackT > 0) {
      ctx.globalAlpha = crackT * 0.45;
      ctx.fillStyle = '#FFF6E8';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // ── Outer rim so the box reads as a solid block on the grid ──
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(70,63,57,0.75)';
    ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
  },

  // ── Closed state: no path to the bottom yet. Crust is added by
  //    drawStock, so only draw the dimmed box underneath here. ──
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

  // ── Reveal animation (crust is drawn over it by drawStock) ──
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
      background: 'linear-gradient(135deg,' + c.light + ' 0%,' + c.dark + ' 55%,#6E675F 100%)',
      borderColor: '#8A8580'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#E0DAD2;text-shadow:0 1px 2px rgba(0,0,0,0.55)">&#11042;</span>';
  }
});
