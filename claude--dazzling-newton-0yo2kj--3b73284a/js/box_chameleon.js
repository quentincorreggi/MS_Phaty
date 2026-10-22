// ============================================================
// box_chameleon.js — Chameleon box type
// A box that shifts to the next color in its cycle every time the
// player taps ANY other box. Tapping the chameleon locks in its
// current color and releases marbles of that color.
//
// Visual: solid box in its current color, with a rainbow frame
// inside the rim made of its cycle colors, slowly rotating.
//
// Level data: { ci, type: 'chameleon', cycle: [ci, ci2, ...] }
//   ci     = starting color (sort columns are built for this color)
//   cycle  = colors it rotates through (cycle[0] === ci)
//
// Solvability: when the chameleon locks in a color different from
// its starting color, empty sort boxes reserved for the starting
// color are recolored to the locked color (deepest ones first).
// ============================================================

var CHAM_SPIN_SPEED = 0.012;      // idle frame rotation (rad/frame)
var CHAM_SHIFT_SPIN = 0.22;       // extra spin during a color shift

// Build a valid cycle array for a box: starts with ci, no dupes, >= 2 colors
function chameleonNormalizeCycle(ci, cycle) {
  var out = [ci];
  if (cycle) {
    for (var i = 0; i < cycle.length; i++) {
      var c = cycle[i];
      if (c >= 0 && c < NUM_COLORS && out.indexOf(c) < 0) out.push(c);
    }
  }
  if (out.length < 2) out.push((ci + 1) % NUM_COLORS);
  return out;
}

// Attach chameleon state to a freshly created stock object
function chameleonInitBox(box, cycle) {
  box.chamCycle = chameleonNormalizeCycle(box.ci, cycle);
  box.chamBaseCi = box.ci;
  box.chamStep = 0;
  box.chamPrevCi = box.ci;
  box.chamShiftT = 0;
  box.chamLockT = 0;
  box.chamLocked = false;
  box.chamAngle = Math.random() * Math.PI * 2;
}

function isChameleonActive(b) {
  return b && b.boxType === 'chameleon' && !b.isTunnel && !b.isWall &&
    !b.empty && !b.used && !b.spawning && !b.chamLocked;
}

// Called from handleTap after a non-chameleon-or-other box is tapped.
// Every other active chameleon on the grid shifts to its next color.
function chameleonShiftAll(tappedIdx) {
  var shifted = false;
  for (var i = 0; i < stock.length; i++) {
    if (i === tappedIdx) continue;
    var b = stock[i];
    if (!isChameleonActive(b)) continue;
    b.chamPrevCi = b.ci;
    b.chamStep = (b.chamStep + 1) % b.chamCycle.length;
    b.ci = b.chamCycle[b.chamStep];
    b.chamShiftT = 1;
    shifted = true;
    var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
    for (var p = 0; p < 10; p++) {
      var a = Math.PI * 2 * p / 10 + Math.random() * 0.3, sp = 2 + Math.random() * 2.5;
      particles.push({ x: bx + Math.cos(a) * L.bw * 0.4, y: by + Math.sin(a) * L.bh * 0.4,
        vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
        r: (1.5 + Math.random() * 2.5) * S,
        color: COLORS[b.chamCycle[p % b.chamCycle.length]].fill,
        life: 0.9, decay: 0.03 + Math.random() * 0.02, grav: false });
    }
  }
  if (shifted && audioCtx) {
    tone(520, 0.07, 'sine', 0.07, 780);
    setTimeout(function () { tone(880, 0.08, 'triangle', 0.05, 1040); }, 60);
  }
}

// Called from handleTap when the chameleon itself is tapped.
function chameleonLock(b) {
  b.chamLocked = true;
  b.chamLockT = 1;
  b.chamShiftT = 0;
  var from = b.chamBaseCi, to = b.ci;
  if (from === to) return;

  // Recolor empty sort boxes of the starting color so the level stays solvable
  var need = Math.ceil(MRB_PER_BOX / SORT_CAP);
  var cands = [];
  for (var c = 0; c < sortCols.length; c++) {
    var col = sortCols[c];
    var topVis = -1;
    for (var r = 0; r < col.length; r++) if (col[r].vis) { topVis = r; break; }
    if (topVis < 0) continue;
    var inFlight = 0;
    for (var j = 0; j < jumpers.length; j++) if (jumpers[j].targetCol === c) inFlight++;
    for (var r2 = topVis; r2 < col.length; r2++) {
      var sb = col[r2];
      if (!sb.vis || sb.type === 'lock' || sb.ci !== from || sb.filled > 0) continue;
      if (r2 === topVis && inFlight > 0) continue;
      cands.push({ box: sb, depth: r2 - topVis });
    }
  }
  cands.sort(function (a, b2) { return b2.depth - a.depth; });
  for (var k = 0; k < Math.min(need, cands.length); k++) {
    cands[k].box.ci = to;
    cands[k].box.shineT = 1;
  }
}

// Per-frame timers (called from update)
function chameleonTick(b) {
  if (b.boxType !== 'chameleon' || !b.chamCycle) return;
  if (b.chamShiftT > 0) b.chamShiftT = Math.max(0, b.chamShiftT - 0.035);
  if (b.chamLockT > 0) b.chamLockT = Math.max(0, b.chamLockT - 0.04);
  var spin = b.chamLocked ? CHAM_SPIN_SPEED * 0.3 : CHAM_SPIN_SPEED;
  b.chamAngle += spin + b.chamShiftT * b.chamShiftT * CHAM_SHIFT_SPIN;
}

// ── Drawing helpers ──

// Rainbow ring inside the rim, made from the cycle colors, rotating.
function drawChameleonRing(ctx, x, y, w, h, S, cycle, angle, alpha) {
  var inset = w * 0.08;
  var lw = w * 0.09;
  var cx = x + w / 2, cy = y + h / 2;
  var n = cycle.length;
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha *= alpha;
  var grad;
  if (ctx.createConicGradient) {
    grad = ctx.createConicGradient(angle, cx, cy);
    var blend = 0.12 / n;  // soft blend between segments
    for (var i = 0; i < n; i++) {
      var col = COLORS[cycle[i]].fill;
      grad.addColorStop(i / n + blend, col);
      grad.addColorStop((i + 1) / n - blend, col);
    }
    // wrap: blend last → first
    grad.addColorStop(0, COLORS[cycle[0]].fill);
    grad.addColorStop(1, COLORS[cycle[0]].fill);
  } else {
    grad = ctx.createLinearGradient(x, y, x + w, y + h);
    for (var i2 = 0; i2 < n; i2++) grad.addColorStop(i2 / Math.max(1, n - 1), COLORS[cycle[i2]].fill);
  }
  // dark groove under the ring
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = lw + 2 * S;
  rRect(x + inset, y + inset, w - inset * 2, h - inset * 2, 5 * S); ctx.stroke();
  // the colored ring
  ctx.strokeStyle = grad;
  ctx.lineWidth = lw;
  rRect(x + inset, y + inset, w - inset * 2, h - inset * 2, 5 * S); ctx.stroke();
  // glossy highlight on top-left of ring
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = lw * 0.3;
  ctx.beginPath();
  ctx.moveTo(x + inset + 5 * S, y + inset - lw * 0.2);
  ctx.lineTo(x + w * 0.45, y + inset - lw * 0.2);
  ctx.stroke();
  ctx.restore();
}

registerBoxType('chameleon', {
  label: 'Chameleon',
  editorColor: '#7A5BD8',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    // Same greyed look as the default closed box (with lock icon)
    getBoxType('default').drawClosed(ctx, x, y, w, h, ci, S, tick, idlePhase);
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    getBoxType('default').drawReveal(ctx, x, y, w, h, ci, S, phase, remaining, tick);
  },

  // Drawn by drawStock on top of the box, in box-local coords (centered).
  drawOverlay: function (ctx, x, y, w, h, b, S, tick, state) {
    if (!b.chamCycle) return;
    // Color wipe: old color shrinks away in a circle, revealing the new one
    if (b.chamShiftT > 0 && state === 'open') {
      var t = b.chamShiftT;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(0.01, t * t * w * 0.75), 0, Math.PI * 2);
      ctx.clip();
      drawBox(x, y, w, h, b.chamPrevCi);
      if (b.remaining > 0) { drawBoxMarbles(b.chamPrevCi, b.remaining); drawBoxLip(b.chamPrevCi); }
      ctx.restore();
    }
    var ringAlpha = state === 'closed' ? 0.45 : 1;
    drawChameleonRing(ctx, x, y, w, h, S, b.chamCycle, b.chamAngle, ringAlpha);
    // Sparkle burst on the ring while shifting
    if (b.chamShiftT > 0) {
      ctx.save();
      ctx.globalAlpha = b.chamShiftT * 0.35;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 * S;
      rRect(x + 1 * S, y + 1 * S, w - 2 * S, h - 2 * S, 6 * S); ctx.stroke();
      ctx.restore();
    }
    // White flash when the color locks in
    if (b.chamLockT > 0) {
      ctx.save();
      ctx.globalAlpha = b.chamLockT * 0.6;
      ctx.fillStyle = '#fff';
      rRect(x, y, w, h, 6 * S); ctx.fill();
      ctx.restore();
    }
  },

  editorCellStyle: function (ci, cell) {
    var cyc = chameleonNormalizeCycle(ci, cell && cell.cycle);
    var stops = [];
    for (var i = 0; i < cyc.length; i++) {
      stops.push(COLORS[cyc[i]].fill + ' ' + Math.round(i / cyc.length * 100) + '% ' + Math.round((i + 1) / cyc.length * 100) + '%');
    }
    return {
      background: 'linear-gradient(' + COLORS[ci].fill + ',' + COLORS[ci].dark + ') padding-box, conic-gradient(' + stops.join(',') + ') border-box',
      borderColor: 'transparent'
    };
  },

  editorCellHTML: function (ci, cell) {
    var cyc = chameleonNormalizeCycle(ci, cell && cell.cycle);
    return '<span class="ed-cell-dot" style="font-size:9px">🦎' + cyc.length + '</span>';
  }
});
