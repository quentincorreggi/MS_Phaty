// ============================================================
// box_multiarrow.js — Multi-Arrow Box
// A box locked behind TWO perpendicular L-shape neighbors.
// Becomes tappable only when both target cells are cleared
// (used or empty). The arrow visually drops one arm as each
// target is cleared, so the remaining indicator points at the
// last box that still needs to be removed.
//
// Orientations (4 L-shapes):
//   UR  =  Up + Right  → targets (r-1,c) and (r,c+1)
//   UL  =  Up + Left   → targets (r-1,c) and (r,c-1)
//   DR  =  Down + Right→ targets (r+1,c) and (r,c+1)
//   DL  =  Down + Left → targets (r+1,c) and (r,c-1)
// ============================================================

var MULTIARROW_ORIENTS = ['UR', 'UL', 'DR', 'DL'];

// Each entry: array of 2 arms { dr, dc, name }
var MULTIARROW_ARMS = {
  'UR': [{ dr: -1, dc:  0, name: 'up'    }, { dr: 0, dc:  1, name: 'right' }],
  'UL': [{ dr: -1, dc:  0, name: 'up'    }, { dr: 0, dc: -1, name: 'left'  }],
  'DR': [{ dr:  1, dc:  0, name: 'down'  }, { dr: 0, dc:  1, name: 'right' }],
  'DL': [{ dr:  1, dc:  0, name: 'down'  }, { dr: 0, dc: -1, name: 'left'  }]
};

// Unit vector per arm name → for drawing
var MULTIARROW_ARM_VEC = {
  'up':    { x:  0, y: -1 },
  'down':  { x:  0, y:  1 },
  'left':  { x: -1, y:  0 },
  'right': { x:  1, y:  0 }
};

// ── Helpers (used by game.js and rendering.js) ──

// Returns array of arm objects ({dr,dc,name}) whose target is STILL PRESENT
// (i.e. not yet cleared by tap/empty). Out-of-bounds arms count as cleared
// (the editor blocks placement at the maze edge, but be safe at runtime).
function getMultiArrowRemainingArms(idx) {
  var b = stock[idx];
  if (!b || !b.multiArrow) return [];
  var orient = b.multiArrow.orient || 'DR';
  var arms = MULTIARROW_ARMS[orient] || MULTIARROW_ARMS['DR'];
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  var remaining = [];
  for (var i = 0; i < arms.length; i++) {
    var a = arms[i];
    var nr = row + a.dr, nc = col + a.dc;
    if (nr < 0 || nr >= L.rows || nc < 0 || nc >= L.cols) continue;
    var n = stock[nr * L.cols + nc];
    if (!n) continue;
    // Cleared if empty or a used-up box. Walls, tunnels, and active
    // boxes all keep the arm in place (target still present).
    if (n.empty) continue;
    if (n.used) continue;
    remaining.push(a);
  }
  return remaining;
}

function isMultiArrowUnlocked(idx) {
  var b = stock[idx];
  if (!b || b.boxType !== 'multiarrow') return true;
  return getMultiArrowRemainingArms(idx).length === 0;
}

registerBoxType('multiarrow', {
  label: 'M.Arrow',
  editorColor: '#E8A84C',

  // ── Closed state (no path to bottom): muted box + faint L-arrow hint.
  // The hint stays visible behind blockers so the player can plan ahead.
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
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    // Same pop animation as default — once the path opens, the box
    // briefly flashes color even if the arrow constraint is still active.
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
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  // ── Locked-but-revealed: the box is in the playable area but its
  // arrow constraint isn't satisfied yet. Show a desaturated box with
  // a bright, pulsing L-arrow pointing at the remaining target(s).
  drawLockedRevealed: function (ctx, x, y, w, h, ci, S, tick) {
    var c = COLORS[ci];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Subtle desaturation overlay so it reads as "not yet usable"
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#3A322A';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
  },

  // ── Draw the L-arrow overlay showing arms whose targets remain.
  // Two arms → a chunky L-shape with arrowheads at each tip.
  // One arm  → a single straight arrow centered on the box.
  // The whole shape is white-filled with a black outline; no animation.
  drawArrowOverlay: function (ctx, x, y, w, h, ci, S, remainingArms, tick, brightness) {
    if (!remainingArms || remainingArms.length === 0) return;
    var alpha = (brightness !== undefined) ? brightness : 1;
    var cx = x + w / 2, cy = y + h / 2;
    var size = Math.min(w, h);

    // Geometry — tuned to match the reference visual
    var bodyT  = size * 0.20;   // arm body thickness
    var tipW   = size * 0.34;   // arrowhead base width (wider than body)
    var tipLen = size * 0.14;   // arrowhead length past the body
    var armLen = size * 0.30;   // distance from box-center to arrowhead base

    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (remainingArms.length >= 2) {
      this._buildLPath(ctx, remainingArms, armLen, bodyT, tipW, tipLen);
    } else {
      this._buildSingleArrowPath(ctx, remainingArms[0], size * 0.34, bodyT, tipW, tipLen);
    }

    ctx.fillStyle = 'rgba(255,255,255,' + (0.98 * alpha) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,10,' + (0.95 * alpha) + ')';
    ctx.lineWidth = 2.5 * S;
    ctx.stroke();

    ctx.restore();
  },

  // Build an L polygon for a 2-arm multi-arrow. The base polygon is the
  // DL orientation (arms going LEFT and DOWN, bend at upper-right); other
  // orientations are reflections of that template.
  _buildLPath: function (ctx, arms, L, T, Tw, tipLen) {
    var has = { up: false, down: false, left: false, right: false };
    for (var i = 0; i < arms.length; i++) has[arms[i].name] = true;
    var sx = 1, sy = 1;
    if (has.down && has.left)  { sx =  1; sy =  1; }       // DL (template)
    else if (has.down && has.right) { sx = -1; sy =  1; }  // DR
    else if (has.up   && has.left)  { sx =  1; sy = -1; }  // UL
    else if (has.up   && has.right) { sx = -1; sy = -1; }  // UR

    var verts = [
      [+T / 2,        -T / 2],
      [+T / 2,        +L],
      [+Tw / 2,       +L],
      [0,             +L + tipLen],
      [-Tw / 2,       +L],
      [-T / 2,        +L],
      [-T / 2,        +T / 2],
      [-L,            +T / 2],
      [-L,            +Tw / 2],
      [-L - tipLen,   0],
      [-L,            -Tw / 2],
      [-L,            -T / 2]
    ];

    ctx.beginPath();
    for (var v = 0; v < verts.length; v++) {
      var px = verts[v][0] * sx;
      var py = verts[v][1] * sy;
      if (v === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  },

  // Build a single straight arrow polygon centered on the box, pointing
  // in the direction of the remaining arm.
  _buildSingleArrowPath: function (ctx, arm, halfBody, T, Tw, tipLen) {
    var dir = MULTIARROW_ARM_VEC[arm.name] || { x: 1, y: 0 };
    var angle = Math.atan2(dir.y, dir.x);
    ctx.save();
    ctx.rotate(angle);
    // Rightward-arrow template (gets rotated into place).
    ctx.beginPath();
    ctx.moveTo(-halfBody,           -T / 2);
    ctx.lineTo(+halfBody,           -T / 2);
    ctx.lineTo(+halfBody,           -Tw / 2);
    ctx.lineTo(+halfBody + tipLen,  0);
    ctx.lineTo(+halfBody,           +Tw / 2);
    ctx.lineTo(+halfBody,           +T / 2);
    ctx.lineTo(-halfBody,           +T / 2);
    ctx.closePath();
    ctx.restore();
  },

  // "Ready to tap" frame — static (no pulse).
  drawReadyPulse: function (ctx, x, y, w, h, ci, S, tick) {
    // Intentionally a no-op: the unlock particle burst already signals
    // the moment the box becomes tappable; no continuous flashing.
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#E8A84C'
    };
  },

  editorCellHTML: function (ci) {
    // Orientation is per-cell, not per-color, so the toolbar swatch
    // can't preview it; the actual grid cells override this with an
    // orient-specific label in editor.js.
    return '<span class="ed-cell-dot" style="font-size:11px">↱</span>';
  }
});
