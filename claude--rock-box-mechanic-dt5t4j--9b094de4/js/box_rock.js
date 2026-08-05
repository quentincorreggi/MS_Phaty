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

    // Clip the shell interior to the rounded box footprint.
    ctx.save();
    rRect(x, y, w, h, 6 * S); ctx.clip();

    if (hp >= 2) {
      // ── Intact rock: thick, opaque shell fully hiding the color ──
      this._fillStone(ctx, x, y, w, h, S, st);
      this._roundShade(ctx, x, y, w, h, S);
      this._facets(ctx, x, y, w, h, S, st, false);
      this._grainCracks(ctx, x, y, w, h, S, st, false);
    } else {
      // ── Cracked rock: shell mostly intact but veined with a network
      //    of fine, natural cracks through which the color glows. ──
      var c = COLORS[ci];

      // Color underneath (revealed through the cracks & chips).
      var cg = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
      cg.addColorStop(0, c.light); cg.addColorStop(1, c.dark);
      ctx.fillStyle = cg;
      ctx.fillRect(x, y, w, h);

      // Opaque stone shell still covering most of the box.
      this._fillStone(ctx, x, y, w, h, S, st);
      this._roundShade(ctx, x, y, w, h, S);
      this._facets(ctx, x, y, w, h, S, st, false);

      // A network of branching cracks. Most ROOT at the box edges and
      // run inward — clipped by the rounded frame they wrap over the
      // "pebble", instead of floating in the middle of the square.
      // (fx/fy at 0 or 1 sit on an edge.)
      var cracks = [
        // Enters from the top edge, forks toward the middle.
        [[0.36, 0.00], [0.33, 0.20], [0.45, 0.34], [0.41, 0.52], [0.50, 0.66]],
        [[0.45, 0.34], [0.62, 0.40]],
        // From the right edge, curving down.
        [[1.00, 0.28], [0.82, 0.33], [0.70, 0.45], [0.72, 0.62]],
        [[0.70, 0.45], [0.58, 0.50]],
        // From the left edge.
        [[0.00, 0.44], [0.18, 0.47], [0.31, 0.41]],
        // Up from the bottom edge.
        [[0.54, 1.00], [0.49, 0.80], [0.57, 0.66]],
        // Short one biting in from the bottom-left corner.
        [[0.16, 1.00], [0.22, 0.82], [0.15, 0.70]]
      ];
      for (var ci2 = 0; ci2 < cracks.length; ci2++) {
        this._colorVein(ctx, x, y, w, h, S, st, c, cracks[ci2], (ci2 === 0 || ci2 === 2) ? 1 : 0.82);
      }

      // A couple of hairline cracks off the edges — very subtle.
      var hairs = [
        [[0.86, 0.00], [0.80, 0.14], [0.84, 0.26]],
        [[0.00, 0.74], [0.12, 0.72], [0.20, 0.80]]
      ];
      for (var hi = 0; hi < hairs.length; hi++) {
        this._colorVein(ctx, x, y, w, h, S, st, c, hairs[hi], 0.5);
      }

      // A few tiny spall chips where flakes popped off (small color patches).
      var chips = [[0.30, 0.29, 0.05], [0.47, 0.71, 0.045], [0.66, 0.44, 0.04]];
      for (var pi = 0; pi < chips.length; pi++) {
        var chx = x + w * chips[pi][0], chy = y + h * chips[pi][1], cr = w * chips[pi][2];
        ctx.save();
        ctx.fillStyle = c.fill;
        ctx.beginPath();
        ctx.moveTo(chx - cr, chy);
        ctx.lineTo(chx + cr * 0.3, chy - cr);
        ctx.lineTo(chx + cr, chy + cr * 0.4);
        ctx.lineTo(chx - cr * 0.4, chy + cr);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(45,38,32,0.5)';
        ctx.lineWidth = 1 * S;
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore(); // drop the interior clip

    // ── Chiseled stone rim (both states) ──
    // Drawn UNCLIPPED and thick so it fully covers the base box's own
    // colored border — otherwise the color leaks around the frame and
    // the shell wouldn't hide it completely at full HP.
    ctx.lineJoin = 'round';
    ctx.strokeStyle = st.dark;
    ctx.lineWidth = 3 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    // Lighter inner bevel for a carved-stone edge.
    ctx.strokeStyle = 'rgba(183,173,162,0.5)';
    ctx.lineWidth = 1 * S;
    rRect(x + 1.2 * S, y + 1.2 * S, w - 2.4 * S, h - 2.4 * S, 5 * S); ctx.stroke();

    ctx.restore();
  },

  // Stroke a jagged crack polyline: a dark groove with a glowing color
  // vein on top, so the box color appears to seep out through the crack.
  // pts = array of [fx, fy] fractional points. strength scales width/glow.
  _colorVein: function (ctx, x, y, w, h, S, st, c, pts, strength) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function trace() {
      ctx.beginPath();
      ctx.moveTo(x + w * pts[0][0], y + h * pts[0][1]);
      for (var k = 1; k < pts.length; k++) {
        ctx.lineTo(x + w * pts[k][0], y + h * pts[k][1]);
      }
    }

    // Dark groove edges (the recessed rock walls of the crack).
    ctx.strokeStyle = 'rgba(40,34,28,0.65)';
    ctx.lineWidth = (2.6 * strength + 1.4) * S;
    trace(); ctx.stroke();

    // Wide color band filling the crack — the visible color underneath.
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 5 * strength * S;
    ctx.strokeStyle = c.fill;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = (2.0 * strength + 0.9) * S;
    trace(); ctx.stroke();

    // Bright core highlight for a glowing seam.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = c.light;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = (0.8 * strength + 0.35) * S;
    trace(); ctx.stroke();

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

  // Domed shading: brighter toward the top-left, darker at the edges,
  // so the flat square reads as a rounded pebble.
  _roundShade: function (ctx, x, y, w, h, S) {
    var rg = ctx.createRadialGradient(
      x + w * 0.40, y + h * 0.34, w * 0.05,
      x + w * 0.50, y + h * 0.52, w * 0.78);
    rg.addColorStop(0.00, 'rgba(255,250,244,0.30)');
    rg.addColorStop(0.45, 'rgba(255,250,244,0.0)');
    rg.addColorStop(0.80, 'rgba(40,34,28,0.10)');
    rg.addColorStop(1.00, 'rgba(30,25,20,0.38)');
    ctx.fillStyle = rg;
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
    // Texture grain seams rooted at the edges so they wrap the pebble.
    ctx.beginPath();
    ctx.moveTo(x + w * 0.34, y);
    ctx.lineTo(x + w * 0.44, y + h * 0.32);
    ctx.lineTo(x + w * 0.38, y + h * 0.52);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w, y + h * 0.26);
    ctx.lineTo(x + w * 0.72, y + h * 0.34);
    ctx.lineTo(x + w * 0.64, y + h * 0.50);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.24, y + h);
    ctx.lineTo(x + w * 0.32, y + h * 0.74);
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
