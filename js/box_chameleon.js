// ============================================================
// box_chameleon.js — Chameleon box type (follows the Chameleon Box GDD)
//
// Chameleon boxes pass their colors around between themselves every
// time the player picks ANY box. Colors always follow one fixed order:
//     Red(pink) → Yellow → Green → Blue → Purple → Red ...
// using only the colors the Chameleons still on the board have.
//   • 2 Chameleons  → they swap colors every pick
//   • 3+ Chameleons → each takes the next color in the order
//   • Tapping a Chameleon releases marbles of the color it shows; that
//     color leaves the cycle and the others step among the colors left.
//   • The last Chameleon left stops changing ("settles") = normal box.
// The set of colors on the board never changes, so sort columns are
// built from the start colors like normal boxes — always solvable.
//
// Level data: cell = { ci, type: 'chameleon' }   ci = start color
// Visual: box in its current color + rotating rainbow frame showing
// the colors still in the cycle (from the team's concept art).
// ============================================================

var CHAM_SPIN_SPEED = 0.012;      // idle frame rotation (rad/frame)
var CHAM_SHIFT_SPIN = 0.22;       // extra spin during a color shift
// Fixed GDD order. The game palette has no pure red, so pink stands in for Red.
var CHAM_ORDER = [0, 3, 2, 1, 4]; // pink(Red) → yellow → green → blue → purple
var CHAM_MIN = 2, CHAM_MAX = 5;

function isChameleonColor(ci) { return CHAM_ORDER.indexOf(ci) >= 0; }

function chameleonOrderNames() {
  return CHAM_ORDER.map(function (c) { return c === 0 ? 'Red (pink)' : CLR_NAMES[c][0].toUpperCase() + CLR_NAMES[c].slice(1); }).join(' \u2192 ');
}

// Sort a list of colors into the fixed cycle order
function chameleonSortColors(cols) {
  return cols.slice().sort(function (a, b) { return CHAM_ORDER.indexOf(a) - CHAM_ORDER.indexOf(b); });
}

// Chameleon start colors in a level grid (tunnel contents are not allowed and ignored)
function chameleonStartColors(grid) {
  var out = [];
  for (var i = 0; i < grid.length; i++) {
    var cell = grid[i];
    if (cell && !cell.tunnel && !cell.wall && cell.type === 'chameleon') out.push(cell.ci);
  }
  return out;
}

function isChameleonActive(b) {
  return b && b.boxType === 'chameleon' && b.isCham && !b.isTunnel && !b.isWall &&
    !b.empty && !b.used && !b.spawning && !b.chamLocked && !b.chamSettled;
}

// Current cycle = colors of the Chameleons still on the board, in the fixed order
function chameleonActiveCycle() {
  var cols = [];
  for (var i = 0; i < stock.length; i++) if (isChameleonActive(stock[i])) cols.push(stock[i].ci);
  return chameleonSortColors(cols);
}

// Attach chameleon state to a freshly created stock object (box.ci = start color)
function chameleonInitBox(box) {
  box.isCham = true;
  box.chamRing = [box.ci];
  box.chamPrevCi = box.ci;
  box.chamShiftT = 0;
  box.chamLockT = 0;
  box.chamLocked = false;
  box.chamSettled = false;
  box.chamSettleT = 0;
  box.chamAngle = Math.random() * Math.PI * 2;
}

// Called from initGame once the whole stock exists
function chameleonInitLevel() {
  chameleonRefreshRings();
  chameleonCheckSettle(false);
}

function chameleonRefreshRings() {
  var cyc = chameleonActiveCycle();
  for (var i = 0; i < stock.length; i++) if (isChameleonActive(stock[i])) stock[i].chamRing = cyc;
}

// If only one Chameleon is left on the board it stops changing
function chameleonCheckSettle(animate) {
  var left = [];
  for (var i = 0; i < stock.length; i++) if (isChameleonActive(stock[i])) left.push(stock[i]);
  if (left.length !== 1) return;
  var b = left[0];
  b.chamSettled = true;
  b.chamSettleT = animate ? 1 : 0;
  if (!animate) return;
  b.popT = 0.8;
  spawnBurst(b.x + L.bw / 2, b.y + L.bh / 2, COLORS[b.ci].fill, 16);
  if (audioCtx) {
    tone(660, 0.12, 'sine', 0.09);
    setTimeout(function () { tone(440, 0.18, 'sine', 0.08); }, 90);
  }
}

// Called from handleTap AFTER a box is picked (tapped chameleon already locked).
// One pick = one step: every Chameleon on the board takes the next color in the cycle.
function chameleonShiftAll(tappedIdx) {
  var cyc = chameleonActiveCycle();
  var n = cyc.length;
  if (n >= 2) {
    for (var i = 0; i < stock.length; i++) {
      var b = stock[i];
      if (!isChameleonActive(b)) continue;
      b.chamPrevCi = b.ci;
      b.ci = cyc[(cyc.indexOf(b.ci) + 1) % n];
      b.chamShiftT = 1;
      b.chamRing = cyc;
      var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
      for (var p = 0; p < 10; p++) {
        var a = Math.PI * 2 * p / 10 + Math.random() * 0.3, sp = 2 + Math.random() * 2.5;
        particles.push({ x: bx + Math.cos(a) * L.bw * 0.4, y: by + Math.sin(a) * L.bh * 0.4,
          vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
          r: (1.5 + Math.random() * 2.5) * S,
          color: COLORS[cyc[p % n]].fill,
          life: 0.9, decay: 0.03 + Math.random() * 0.02, grav: false });
      }
    }
    if (audioCtx) {
      tone(520, 0.07, 'sine', 0.07, 780);
      setTimeout(function () { tone(880, 0.08, 'triangle', 0.05, 1040); }, 60);
    }
  }
  chameleonCheckSettle(true);
}

// Called from handleTap when a chameleon itself is tapped: it plays the
// color it shows right now and that color leaves the cycle.
function chameleonLock(b) {
  b.chamLocked = true;
  b.chamLockT = 1;
  b.chamShiftT = 0;
}

// Per-frame timers (called from update)
function chameleonTick(b) {
  if (b.boxType !== 'chameleon' || !b.isCham) return;
  if (b.chamShiftT > 0) b.chamShiftT = Math.max(0, b.chamShiftT - 0.035);
  if (b.chamLockT > 0) b.chamLockT = Math.max(0, b.chamLockT - 0.04);
  if (b.chamSettleT > 0) b.chamSettleT = Math.max(0, b.chamSettleT - 0.025);
  var spin = b.chamLocked ? CHAM_SPIN_SPEED * 0.3 : CHAM_SPIN_SPEED;
  b.chamAngle += spin + b.chamShiftT * b.chamShiftT * CHAM_SHIFT_SPIN + b.chamSettleT * 0.15;
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
    if (!b.isCham) return;
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
    // Ring shows the colors still in the cycle; fades out when the box settles
    var ringAlpha = state === 'closed' ? 0.45 : 1;
    if (b.chamSettled) ringAlpha *= b.chamSettleT;
    if (ringAlpha > 0.01) drawChameleonRing(ctx, x, y, w, h, S, b.chamRing, b.chamAngle, ringAlpha);
    // Settle flash
    if (b.chamSettled && b.chamSettleT > 0) {
      ctx.save();
      ctx.globalAlpha = b.chamSettleT * 0.5;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4 * S * b.chamSettleT;
      rRect(x, y, w, h, 6 * S); ctx.stroke();
      ctx.restore();
    }
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
    var cyc = (typeof editor !== 'undefined') ? chameleonSortColors(chameleonStartColors(editor.grid)) : [ci];
    if (cyc.length < 2) cyc = [ci, ci];
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
    return '<span class="ed-cell-dot" style="font-size:11px">\uD83E\uDD8E</span>';
  }
});
