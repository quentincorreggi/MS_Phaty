// ============================================================
// box_rock.js — Rock box type
// A normal box encased in a thick rock shell (2 HP). The rock
// fully hides the box's color and makes it untappable. Each time
// an ADJACENT box (orthogonal neighbor) is played, the rock takes
// 1 HP of damage.
//   HP 2 → intact rock (color fully hidden, untappable)
//   HP 1 → cracked rock (color visible underneath, still untappable)
//   HP 0 → rock crumbles → normal, tappable box of that color
//
// Shares the "hidden color, crack-then-break" language of Rock Trays,
// and the adjacency / 2-HP behavior of the Ice box.
//
// The rock appearance is drawn as an OVERLAY (drawRockOverlay) on top
// of the base box by rendering.js — mirroring the ice overlay — so the
// same visual is used whether the box is path-revealed or not.
// ============================================================

registerBoxType('rock', {
  label: 'Rock',
  editorColor: '#8A817A',

  // ── Rock stone palette ──
  _stone: {
    hi:   '#B7ADA2',
    mid:  '#8A7F73',
    low:  '#5E554C',
    dark: '#413A33',
    line: 'rgba(45,38,32,0.55)'
  },

  // ── Draw rock overlay (called from drawStock after the base box) ──
  // hp 2 → fully covers (color hidden); hp 1 → cracked open (color shows).
  drawRockOverlay: function (ctx, x, y, w, h, ci, S, hp, tick) {
    var st = this._stone;
    ctx.save();

    // Clip everything to the rounded box footprint.
    rRect(x, y, w, h, 6 * S); ctx.clip();

    if (hp >= 2) {
      // ── Intact rock: thick, opaque shell fully hiding the color ──
      this._fillStone(ctx, x, y, w, h, S, st);
      this._facets(ctx, x, y, w, h, S, st, false);
      this._grainCracks(ctx, x, y, w, h, S, st, false);
    } else {
      // ── Cracked rock: shell split by a fissure, color visible ──
      // Paint the revealed color underneath first (guaranteed visible).
      var c = COLORS[ci];
      var cg = ctx.createLinearGradient(x, y, x, y + h);
      cg.addColorStop(0, c.light); cg.addColorStop(1, c.dark);
      ctx.fillStyle = cg;
      ctx.fillRect(x, y, w, h);

      // Two stone chunks separated by a jagged fissure gap.
      var mid = x + w * 0.50;
      var jag = [
        { t: 0.00, o: 0.02 },
        { t: 0.28, o: -0.06 },
        { t: 0.52, o: 0.07 },
        { t: 0.76, o: -0.05 },
        { t: 1.00, o: 0.03 }
      ];
      var gap = w * 0.11;

      // Left chunk
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(mid + jag[0].o * w - gap / 2, y);
      for (var i = 1; i < jag.length; i++) {
        ctx.lineTo(mid + jag[i].o * w - gap / 2, y + h * jag[i].t);
      }
      ctx.lineTo(x, y + h);
      ctx.closePath();
      this._fillStonePath(ctx, x, y, w, h, S, st);
      this._facets(ctx, x, y, w * 0.5, h, S, st, true);

      // Right chunk
      ctx.beginPath();
      ctx.moveTo(mid + jag[0].o * w + gap / 2, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(mid + jag[jag.length - 1].o * w + gap / 2, y + h);
      for (var i2 = jag.length - 2; i2 >= 0; i2--) {
        ctx.lineTo(mid + jag[i2].o * w + gap / 2, y + h * jag[i2].t);
      }
      ctx.closePath();
      this._fillStonePath(ctx, x, y, w, h, S, st);

      // Glow of color spilling out of the fissure.
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = c.light;
      ctx.lineWidth = 3 * S;
      ctx.beginPath();
      ctx.moveTo(mid + jag[0].o * w, y);
      for (var g = 1; g < jag.length; g++) {
        ctx.lineTo(mid + jag[g].o * w, y + h * jag[g].t);
      }
      ctx.stroke();
      ctx.restore();

      // Dark fissure edges for definition.
      ctx.strokeStyle = st.dark;
      ctx.lineWidth = 1.5 * S;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        ctx.moveTo(mid + jag[0].o * w + side * gap / 2, y);
        for (var e = 1; e < jag.length; e++) {
          ctx.lineTo(mid + jag[e].o * w + side * gap / 2, y + h * jag[e].t);
        }
        ctx.stroke();
      }

      // A few rubble bits clinging near the fissure.
      ctx.fillStyle = st.low;
      var bits = [[0.36, 0.30], [0.62, 0.44], [0.40, 0.66], [0.58, 0.80]];
      for (var bi = 0; bi < bits.length; bi++) {
        ctx.beginPath();
        ctx.arc(x + w * bits[bi][0], y + h * bits[bi][1], 1.6 * S, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Chiseled outline (both states) ──
    ctx.strokeStyle = st.dark;
    ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    ctx.restore();
  },

  // Solid opaque stone fill across the whole cell.
  _fillStone: function (ctx, x, y, w, h, S, st) {
    var g = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
    g.addColorStop(0, st.hi);
    g.addColorStop(0.45, st.mid);
    g.addColorStop(1, st.low);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  },

  // Fill the current path with the stone gradient (opaque).
  _fillStonePath: function (ctx, x, y, w, h, S, st) {
    var g = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
    g.addColorStop(0, st.hi);
    g.addColorStop(0.45, st.mid);
    g.addColorStop(1, st.low);
    ctx.fillStyle = g;
    ctx.fill();
  },

  // Chiseled facets for a chunky stone look.
  _facets: function (ctx, x, y, w, h, S, st, small) {
    ctx.save();
    // Top-left light facet
    ctx.fillStyle = 'rgba(220,212,202,0.35)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h * 0.10);
    ctx.lineTo(x + w * 0.46, y + h * 0.16);
    ctx.lineTo(x + w * 0.30, y + h * 0.42);
    ctx.lineTo(x + w * 0.12, y + h * 0.34);
    ctx.closePath(); ctx.fill();
    // Lower-right dark facet
    ctx.fillStyle = 'rgba(50,43,36,0.28)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.58, y + h * 0.58);
    ctx.lineTo(x + w * 0.90, y + h * 0.66);
    ctx.lineTo(x + w * 0.82, y + h * 0.92);
    ctx.lineTo(x + w * 0.52, y + h * 0.84);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  // Fine grain cracks (texture only — do not reveal color).
  _grainCracks: function (ctx, x, y, w, h, S, st) {
    ctx.save();
    ctx.strokeStyle = st.line;
    ctx.lineWidth = 1 * S;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.30, y + h * 0.12);
    ctx.lineTo(x + w * 0.44, y + h * 0.40);
    ctx.lineTo(x + w * 0.38, y + h * 0.58);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.70, y + h * 0.22);
    ctx.lineTo(x + w * 0.60, y + h * 0.46);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.20, y + h * 0.72);
    ctx.lineTo(x + w * 0.40, y + h * 0.80);
    ctx.stroke();
    ctx.restore();
  },

  // ── Closed state (no path yet): base box sits under the overlay ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    // Draw the real box as the base; the rock overlay (added by
    // rendering.js) hides or cracks-open the color depending on HP.
    drawBox(x, y, w, h, ci);
  },

  // ── Reveal animation (path opened while still encased) ──
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.06;
    ctx.save();
    ctx.scale(popScale, popScale);
    drawBox(x, y, w, h, ci);
    ctx.restore();
    // Rock overlay is drawn on top by rendering.js.
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#8A817A'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="text-shadow:0 0 4px rgba(65,58,51,0.9)">&#129703;</span>';
  }
});
