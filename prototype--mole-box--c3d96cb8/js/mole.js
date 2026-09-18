// ============================================================
// mole.js — Holes and Mole boxes
// ============================================================
// A "hole" is a grid cell that marbles can pass through, just like
// an empty slot. Every hole has a place in the hop route: cells with
// an explicit `ord` come first in that order, and the rest fall in
// behind them in reading order. initGame() builds holeCells in route
// order, so everything here just walks that list.
//
// A "mole box" is a normal box (default or hidden flavour) that sits
// on a hole. Every time the player successfully opens a box anywhere
// on the grid, each mole hops to the NEXT-numbered hole, wrapping from
// the last hole back to the first. Two moles can never share a hole:
// they all advance one step in the same cycle, and moleHop() also
// skips any hole that is already claimed.
//
// A mole occupies its hole like a solid box — it blocks the path to
// the bottom for boxes above it. When emptied, the mole is gone and
// the hole underneath becomes passable again.
//
// Implementation: a mole lives in the stock cell of the hole it is
// standing on, so all the normal box code (tap, reveal, spawn,
// render) works on it unchanged. A hop simply moves the box fields
// from one hole cell to another.
// ============================================================

var holeCells = [];          // stock indices of every hole, in route order
var MOLE_HOP_SPEED = 0.05;   // moleHopT decrement per frame (~20 frames)

// Box fields that travel with a mole when it hops.
var MOLE_FIELDS = ['ci', 'boxType', 'remaining', 'used', 'spawning', 'spawnIdx',
  'revealed', 'blockerCount', 'iceHP', 'iceCrackT', 'iceShatterT',
  'popT', 'revealT', 'emptyT', 'idlePhase', 'shakeT', 'hoverT'];

function moleCapture(cell) {
  var s = {};
  for (var i = 0; i < MOLE_FIELDS.length; i++) s[MOLE_FIELDS[i]] = cell[MOLE_FIELDS[i]];
  return s;
}

function moleRestore(cell, s) {
  for (var i = 0; i < MOLE_FIELDS.length; i++) cell[MOLE_FIELDS[i]] = s[MOLE_FIELDS[i]];
  cell.empty = false;
}

// Turn a hole cell back into a plain, passable, empty hole.
function moleClearCell(cell) {
  cell.empty = true; cell.used = false; cell.spawning = false;
  cell.remaining = 0; cell.spawnIdx = 0; cell.ci = 0;
  cell.boxType = 'default'; cell.revealed = true; cell.blockerCount = 0;
  cell.iceHP = 0; cell.iceCrackT = 0; cell.iceShatterT = 0;
  cell.popT = 0; cell.revealT = 0; cell.emptyT = 0;
  cell.shakeT = 0; cell.hoverT = 0; cell.moleHopT = 0;
}

// Does this hole cell currently hold a live mole box?
function holeHasMole(cell) {
  if (!cell || !cell.isHole) return false;
  return !cell.empty && !cell.used;
}

// === THE HOP ===
// Called once per successful box opening.
function moleHop() {
  if (!holeCells || holeCells.length < 2) return;

  var movers = [];
  var staying = {};   // holes held by a mole that cannot hop right now

  for (var h = 0; h < holeCells.length; h++) {
    var idx = holeCells[h];
    var cell = stock[idx];
    if (!holeHasMole(cell)) continue;
    // A mole that is pouring out its marbles (or still mid-hop) stays put.
    if (cell.spawning || cell.moleHopT > 0) { staying[idx] = true; continue; }
    movers.push({ ord: h, from: idx, state: moleCapture(cell) });
  }
  if (!movers.length) return;

  // Pick each mole's destination: next hole in route order, skipping
  // holes that are taken.
  var claimed = {};
  for (var m = 0; m < movers.length; m++) {
    var mv = movers[m];
    var dest = -1;
    for (var step = 1; step <= holeCells.length; step++) {
      var cand = holeCells[(mv.ord + step) % holeCells.length];
      if (claimed[cand] || staying[cand]) continue;
      dest = cand; break;
    }
    if (dest < 0) dest = mv.from;   // nowhere free — stay
    claimed[dest] = true;
    mv.to = dest;
  }

  // Empty every source hole first, then drop the moles into their
  // destinations, so a mole can move into a hole another just left.
  for (var m = 0; m < movers.length; m++) moleClearCell(stock[movers[m].from]);

  var hopped = 0;
  for (var m = 0; m < movers.length; m++) {
    var mv = movers[m];
    var dst = stock[mv.to];
    moleRestore(dst, mv.state);
    if (mv.to === mv.from) continue;
    var src = stock[mv.from];
    dst.moleHopT = 1.0;
    dst.moleFromX = src.x;
    dst.moleFromY = src.y;
    moleDirtPuff(src.x + L.bw / 2, src.y + L.bh * 0.75, 10);
    (function (d) {
      setTimeout(function () {
        moleDirtPuff(d.x + L.bw / 2, d.y + L.bh * 0.75, 12);
      }, 170);
    })(dst);
    hopped++;
  }

  if (hopped > 0) {
    sfx.burrow();
    setTimeout(function () { sfx.moleUp(); }, 170);
  }

  // The grid changed shape — re-evaluate which boxes have a path out.
  updateBoxReveals(true);
}

function moleDirtPuff(x, y, n) {
  var dirt = ['rgba(120,88,58,0.9)', 'rgba(94,68,44,0.9)', 'rgba(150,116,78,0.85)'];
  for (var i = 0; i < n; i++) {
    var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    var sp = 1.5 + Math.random() * 3;
    particles.push({
      x: x + (Math.random() - 0.5) * L.bw * 0.5, y: y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (1.5 + Math.random() * 3) * S,
      color: dirt[~~(Math.random() * dirt.length)],
      life: 1, decay: 0.035 + Math.random() * 0.02, grav: true
    });
  }
}

// === DRAWING ===

// The hole itself — a dirt pit sunk into the board, with a raised rim.
function drawHoleOnGrid(ctx, x, y, w, h, S, tick) {
  var cx = x + w / 2, cy = y + h / 2;
  var rx = w * 0.38, ry = h * 0.30;

  ctx.save();

  // Mound of earth around the rim
  var mound = ctx.createRadialGradient(cx, cy, rx * 0.5, cx, cy, w * 0.62);
  mound.addColorStop(0, 'rgba(120,92,62,0.55)');
  mound.addColorStop(0.65, 'rgba(146,116,82,0.35)');
  mound.addColorStop(1, 'rgba(146,116,82,0)');
  ctx.fillStyle = mound;
  ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.04, w * 0.62, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();

  // Rim highlight
  ctx.strokeStyle = 'rgba(178,146,108,0.7)';
  ctx.lineWidth = 2.5 * S;
  ctx.beginPath(); ctx.ellipse(cx, cy - ry * 0.06, rx * 1.12, ry * 1.12, 0, 0, Math.PI * 2); ctx.stroke();

  // The pit
  var pit = ctx.createRadialGradient(cx, cy + ry * 0.3, ry * 0.15, cx, cy, rx);
  pit.addColorStop(0, '#1A1310');
  pit.addColorStop(0.6, '#2C2018');
  pit.addColorStop(1, '#4A3626');
  ctx.fillStyle = pit;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();

  // Inner shadow lip so it reads as depth
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.96, ry * 0.96, 0, 0, Math.PI * 2); ctx.stroke();

  // A couple of dirt clumps on the rim, stable per cell
  ctx.fillStyle = 'rgba(110,84,56,0.5)';
  var seed = (x * 11 + y * 17) | 0;
  for (var d = 0; d < 5; d++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var a = (seed % 360) * Math.PI / 180;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var cr = (1.5 + (seed % 3)) * S;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rx * 1.2, cy + Math.sin(a) * ry * 1.25, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Little mole badge stamped on the box so the player can tell a mole
// box apart from a normal one at a glance.
function drawMoleBadge(ctx, x, y, w, h, S, tick) {
  var bw = w * 0.40, bh = h * 0.33;
  var bx = x + w - bw - 2.5 * S, by = y + h - bh - 2.5 * S;
  var cx = bx + bw / 2, cy = by + bh / 2;

  ctx.save();

  // Dark fur pill
  ctx.fillStyle = 'rgba(58,44,36,0.9)';
  ctx.beginPath(); ctx.ellipse(cx, cy, bw * 0.5, bh * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(26,18,14,0.8)'; ctx.lineWidth = 1 * S;
  ctx.beginPath(); ctx.ellipse(cx, cy, bw * 0.5, bh * 0.5, 0, 0, Math.PI * 2); ctx.stroke();

  // Fur sheen
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.ellipse(cx - bw * 0.12, cy - bh * 0.16, bw * 0.26, bh * 0.2, 0, 0, Math.PI * 2); ctx.fill();

  // Snout
  ctx.fillStyle = '#E8879F';
  ctx.beginPath(); ctx.ellipse(cx, cy + bh * 0.14, bw * 0.2, bh * 0.16, 0, 0, Math.PI * 2); ctx.fill();

  // Eyes — blink on a slow cycle
  var blink = (tick % 190) < 8;
  ctx.fillStyle = 'rgba(12,8,6,0.95)';
  var er = bh * (blink ? 0.03 : 0.1);
  ctx.beginPath(); ctx.ellipse(cx - bw * 0.19, cy - bh * 0.12, bw * 0.07, er, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + bw * 0.19, cy - bh * 0.12, bw * 0.07, er, 0, 0, Math.PI * 2); ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'rgba(235,225,215,0.6)'; ctx.lineWidth = 0.9 * S;
  for (var s = -1; s <= 1; s += 2) {
    ctx.beginPath();
    ctx.moveTo(cx + s * bw * 0.16, cy + bh * 0.16);
    ctx.lineTo(cx + s * bw * 0.52, cy + bh * 0.02);
    ctx.stroke();
  }

  ctx.restore();
}
