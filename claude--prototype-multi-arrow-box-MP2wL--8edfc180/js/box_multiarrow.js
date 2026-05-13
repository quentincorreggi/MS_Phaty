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
  // remainingArms is an array of arm objects from MULTIARROW_ARMS.
  // brightness: 0..1 (used to dim when fully closed / not revealed).
  drawArrowOverlay: function (ctx, x, y, w, h, ci, S, remainingArms, tick, brightness) {
    if (!remainingArms || remainingArms.length === 0) return;
    var cx = x + w / 2, cy = y + h / 2;
    var armLen = Math.min(w, h) * 0.34;
    var armW = 5 * S;
    var headLen = 9 * S;
    var headW = 11 * S;
    var pulse = 0.78 + 0.22 * Math.sin(tick * 0.10);
    var alpha = (brightness !== undefined ? brightness : 1) * pulse;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var i = 0; i < remainingArms.length; i++) {
      var arm = remainingArms[i];
      var v = MULTIARROW_ARM_VEC[arm.name];
      if (!v) continue;
      var ex = cx + v.x * armLen;
      var ey = cy + v.y * armLen;

      // Soft outline behind the white stroke so it stays readable
      // on light marble colors (yellow especially).
      ctx.strokeStyle = 'rgba(40,30,15,' + (0.55 * alpha) + ')';
      ctx.lineWidth = armW + 3 * S;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,248,225,' + (0.95 * alpha) + ')';
      ctx.lineWidth = armW;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Arrow head — filled triangle at the line tip, pointing outward.
      var tipX = ex + v.x * headLen;
      var tipY = ey + v.y * headLen;
      var perpX = -v.y, perpY = v.x;
      var bX1 = ex + perpX * (headW / 2);
      var bY1 = ey + perpY * (headW / 2);
      var bX2 = ex - perpX * (headW / 2);
      var bY2 = ey - perpY * (headW / 2);

      ctx.fillStyle = 'rgba(40,30,15,' + (0.55 * alpha) + ')';
      ctx.beginPath();
      ctx.moveTo(tipX + v.x * 1.5 * S, tipY + v.y * 1.5 * S);
      ctx.lineTo(bX1 + perpX * 1.5 * S, bY1 + perpY * 1.5 * S);
      ctx.lineTo(bX2 - perpX * 1.5 * S, bY2 - perpY * 1.5 * S);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,248,225,' + (0.98 * alpha) + ')';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(bX1, bY1);
      ctx.lineTo(bX2, bY2);
      ctx.closePath();
      ctx.fill();
    }

    // Center dot — anchors the L-shape so two arms read as one indicator
    ctx.fillStyle = 'rgba(40,30,15,' + (0.6 * alpha) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,225,' + (0.98 * alpha) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, 3 * S, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  // ── "Ready to tap" pulse — drawn over the open box when both targets
  // have just been cleared. Helps the player notice the unlock.
  drawReadyPulse: function (ctx, x, y, w, h, ci, S, tick) {
    var pulse = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(tick * 0.12));
    ctx.save();
    ctx.strokeStyle = 'rgba(255,248,225,' + pulse + ')';
    ctx.lineWidth = 2.5 * S;
    rRect(x + 2 * S, y + 2 * S, w - 4 * S, h - 4 * S, 5 * S);
    ctx.stroke();
    ctx.restore();
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
