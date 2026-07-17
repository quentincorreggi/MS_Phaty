// ============================================================
// puzzlelock.js — Puzzle Lock mechanic
// ------------------------------------------------------------
// A lock clamps a straight run of cells (a "chain"), keeping the
// boxes in it untappable and blocking the maze path below them.
// The lock is a locked gemstone; tapping a "carrier" box elsewhere
// sends a matching gemstone fragment flying into the lock, filling
// one wedge of the gem. When every wedge is filled the gem is whole,
// the lock bursts open, and the chained boxes become playable.
//
// Runtime state on stock cells:
//   .lock  = lock id this cell belongs to (chain member), else -1
//   .piece = lock id this box carries a fragment for, else -1
//
// Lock objects live in the global puzzleLocks[]; flying fragments
// live in puzzlePieces[].
// ============================================================

// ── Build lock groups from the freshly-built stock ──
function buildPuzzleLocks(lockPieces) {
  puzzleLocks = [];
  puzzlePieces = [];
  if (!stock || !stock.length || !L || !L.cols) return;

  var groups = {};
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (s && s.lock >= 0) {
      if (!groups[s.lock]) groups[s.lock] = [];
      groups[s.lock].push(i);
    }
  }

  for (var key in groups) {
    if (!groups.hasOwnProperty(key)) continue;
    var id = +key;
    var cells = groups[key];

    // Determine orientation: same row => horizontal, same col => vertical.
    var sameRow = true, sameCol = true;
    var r0 = Math.floor(cells[0] / L.cols), c0 = cells[0] % L.cols;
    for (var k = 1; k < cells.length; k++) {
      if (Math.floor(cells[k] / L.cols) !== r0) sameRow = false;
      if (cells[k] % L.cols !== c0) sameCol = false;
    }
    var orient = sameRow ? 'h' : (sameCol ? 'v' : 'h');

    // Order the cells along the run so the chain draws left→right / top→bottom.
    cells.sort(function (a, b) {
      if (orient === 'h') return (a % L.cols) - (b % L.cols);
      return Math.floor(a / L.cols) - Math.floor(b / L.cols);
    });

    // Middle cell (5 cells → index 2 → cell #3).
    var centerIdx = cells[Math.floor((cells.length - 1) / 2)];

    var reqRaw = (lockPieces && lockPieces[id] != null) ? lockPieces[id] : LOCK_PIECES_MIN;
    var required = Math.max(LOCK_PIECES_MIN, Math.min(LOCK_PIECES_MAX, reqRaw));

    puzzleLocks.push({
      id: id,
      color: LOCK_COLORS[id % LOCK_COLORS.length],
      cells: cells,
      orient: orient,
      centerIdx: centerIdx,
      required: required,
      collected: 0,
      inFlight: 0,
      opened: false,
      openT: 0,
      fillT: 0,
      shakeT: 0,
      phase: id * 1.7
    });
  }
}

function getLockById(id) {
  for (var i = 0; i < puzzleLocks.length; i++) if (puzzleLocks[i].id === id) return puzzleLocks[i];
  return null;
}

// A cell is locked (untappable + path-blocking) while its lock is unopened.
function isCellLocked(idx) {
  var s = stock[idx];
  if (!s || s.lock < 0) return false;
  var lk = getLockById(s.lock);
  return lk ? !lk.opened : false;
}

// World-space center of a lock's gem (the middle cell of its run).
function getLockGemCenter(lk) {
  var s = stock[lk.centerIdx];
  return { x: s.x + L.bw / 2, y: s.y + L.bh / 2 };
}

// ── Tapping a carrier launches its fragment ──
function launchPuzzlePiece(box) {
  if (!box || box.piece < 0) return;
  var lk = getLockById(box.piece);
  if (!lk) return;
  var gc = getLockGemCenter(lk);
  var slot = lk.collected + lk.inFlight;
  var reserved = (!lk.opened && slot < lk.required);
  if (reserved) lk.inFlight++;
  puzzlePieces.push({
    lockId: lk.id,
    sx: box.x + L.bw / 2, sy: box.y + L.bh / 2,
    tx: gc.x, ty: gc.y,
    x: box.x + L.bw / 2, y: box.y + L.bh / 2,
    t: 0, slot: slot, spin: Math.random() * Math.PI * 2,
    reserved: reserved
  });
  if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();
}

// ── Per-frame update: advance fragments, resolve fills, open locks ──
function updatePuzzleLocks() {
  for (var i = puzzlePieces.length - 1; i >= 0; i--) {
    var p = puzzlePieces[i];
    p.t += 0.03;
    p.spin += 0.16;
    if (p.t >= 1) {
      var lk = getLockById(p.lockId);
      var col = LOCK_COLORS[p.lockId % LOCK_COLORS.length];
      if (lk && p.reserved) {
        lk.inFlight = Math.max(0, lk.inFlight - 1);
        if (!lk.opened && lk.collected < lk.required) {
          lk.collected++;
          lk.fillT = 1.0;
          lk.shakeT = 0.5;
          var gc = getLockGemCenter(lk);
          spawnBurst(gc.x, gc.y, col.light, 12);
          if (typeof sfx !== 'undefined' && sfx.sort) sfx.sort();
          if (lk.collected >= lk.required) openPuzzleLock(lk);
        }
      } else {
        spawnBurst(p.tx, p.ty, col.light, 6);
      }
      puzzlePieces.splice(i, 1);
    }
  }

  for (var j = 0; j < puzzleLocks.length; j++) {
    var lock = puzzleLocks[j];
    if (lock.fillT > 0) lock.fillT = Math.max(0, lock.fillT - 0.04);
    if (lock.shakeT > 0) lock.shakeT = Math.max(0, lock.shakeT - 0.05);
    if (lock.opened && lock.openT > 0) lock.openT = Math.max(0, lock.openT - 0.018);
  }
}

function openPuzzleLock(lk) {
  lk.opened = true;
  lk.openT = 1.0;
  var gc = getLockGemCenter(lk);
  // Release every chained cell so the boxes can reveal/be tapped.
  for (var k = 0; k < lk.cells.length; k++) {
    if (stock[lk.cells[k]]) stock[lk.cells[k]].lock = -1;
  }
  if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
  spawnBurst(gc.x, gc.y, lk.color.fill, 26);
  spawnBurst(gc.x, gc.y, lk.color.light, 20);
  if (typeof spawnConfetti === 'function') spawnConfetti(gc.x, gc.y, 16);
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

// ============================================================
// Drawing
// ============================================================

// Faceted gem wedge fan. `collected` wedges are filled, the rest are
// shown as empty silhouettes. Returns nothing — draws at (cx, cy).
function drawGemWedges(cx, cy, r, required, collected, col, tick, fillT) {
  var start = -Math.PI / 2;
  var n = Math.max(1, required);
  for (var w = 0; w < n; w++) {
    var a0 = start + (w / n) * Math.PI * 2;
    var a1 = start + ((w + 1) / n) * Math.PI * 2;
    var am = (a0 + a1) / 2;
    var x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
    var x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
    var xm = cx + Math.cos(am) * r * 1.06, ym = cy + Math.sin(am) * r * 1.06;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x0, y0);
    ctx.lineTo(xm, ym);
    ctx.lineTo(x1, y1);
    ctx.closePath();
    if (w < collected) {
      // Filled facet — jewel gradient, brighter on the freshest wedge.
      var justFilled = (w === collected - 1) && fillT > 0;
      var grad = ctx.createLinearGradient(cx, cy, xm, ym);
      grad.addColorStop(0, col.light);
      grad.addColorStop(0.55, col.fill);
      grad.addColorStop(1, col.dark);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1 * S;
      ctx.stroke();
      if (justFilled) {
        ctx.save();
        ctx.globalAlpha = fillT * 0.7;
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();
      }
    } else {
      // Empty silhouette slot.
      ctx.fillStyle = 'rgba(20,15,30,0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1 * S;
      ctx.setLineDash([3 * S, 3 * S]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // Bright center table so the assembled gem sparkles.
  var tableR = r * 0.34;
  var tg = ctx.createRadialGradient(cx - tableR * 0.3, cy - tableR * 0.3, tableR * 0.1, cx, cy, tableR);
  if (collected >= required) {
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(1, col.light);
  } else {
    tg.addColorStop(0, 'rgba(255,255,255,0.25)');
    tg.addColorStop(1, 'rgba(20,15,30,0.3)');
  }
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.arc(cx, cy, tableR, 0, Math.PI * 2); ctx.fill();

  // Glint sweep when the gem is complete.
  if (collected >= required) {
    var gl = (Math.sin(tick * 0.12) * 0.5 + 0.5);
    ctx.save();
    ctx.globalAlpha = 0.25 + gl * 0.35;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
    ctx.stroke();
    ctx.restore();
  }
}

// One lock: metal band across the run, chain links, and the gem.
function drawOnePuzzleLock(lk) {
  var col = lk.color;
  var fade = lk.opened ? Math.max(0, lk.openT) : 1;
  if (lk.opened && lk.openT <= 0) return; // fully gone

  ctx.save();
  ctx.globalAlpha = fade;

  // 1) Darken each chained cell + a metal clasp band.
  for (var k = 0; k < lk.cells.length; k++) {
    var s = stock[lk.cells[k]];
    var bx = s.x, by = s.y;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
    var g = ctx.createLinearGradient(bx, by, bx, by + L.bh);
    g.addColorStop(0, 'rgba(60,55,70,0.82)');
    g.addColorStop(1, 'rgba(30,26,40,0.86)');
    ctx.fillStyle = g;
    rRect(bx, by, L.bw, L.bh, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Colored inner rim so the lock reads by color.
    ctx.strokeStyle = col.fill;
    ctx.globalAlpha = fade * 0.7;
    ctx.lineWidth = 2 * S;
    rRect(bx + 2 * S, by + 2 * S, L.bw - 4 * S, L.bh - 4 * S, 5 * S); ctx.stroke();
    ctx.globalAlpha = fade;
    ctx.restore();
  }

  // 2) Chain links running along the chain between cell centers.
  ctx.strokeStyle = 'rgba(210,205,220,0.85)';
  ctx.lineWidth = 3 * S;
  for (var c = 0; c < lk.cells.length - 1; c++) {
    var a = stock[lk.cells[c]], b = stock[lk.cells[c + 1]];
    var ax = a.x + L.bw / 2, ay = a.y + L.bh / 2;
    var bxp = b.x + L.bw / 2, byp = b.y + L.bh / 2;
    var links = 4;
    for (var li = 0; li < links; li++) {
      var t0 = li / links, t1 = (li + 0.72) / links;
      var lx0 = ax + (bxp - ax) * t0, ly0 = ay + (byp - ay) * t0;
      var lx1 = ax + (bxp - ax) * t1, ly1 = ay + (byp - ay) * t1;
      ctx.beginPath();
      ctx.moveTo(lx0, ly0); ctx.lineTo(lx1, ly1); ctx.stroke();
    }
  }

  // 3) The gem lock on the middle cell.
  var gc = getLockGemCenter(lk);
  var jitter = lk.shakeT > 0 ? Math.sin(tick * 0.9) * 3 * S * lk.shakeT : 0;
  var breathe = lk.opened ? (1 + (1 - lk.openT) * 0.9) : (1 + Math.sin(tick * 0.05 + lk.phase) * 0.03);
  var r = L.bw * 0.44 * breathe;
  ctx.save();
  ctx.translate(gc.x + jitter, gc.y);

  // Metal mounting plate behind the gem.
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 2 * S;
  var pg = ctx.createLinearGradient(0, -r, 0, r);
  pg.addColorStop(0, '#C9C4D0'); pg.addColorStop(0.5, '#9A94A6'); pg.addColorStop(1, '#6E6878');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.16, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.16, 0, Math.PI * 2); ctx.stroke();

  // Colored glow ring.
  ctx.save();
  ctx.globalAlpha = fade * (0.35 + (lk.fillT * 0.4));
  ctx.shadowColor = col.glow; ctx.shadowBlur = 16 * S;
  ctx.strokeStyle = col.fill; ctx.lineWidth = 2 * S;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.16, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // The gem wedges (progress).
  drawGemWedges(0, 0, r, lk.required, lk.collected, col, tick, lk.fillT);

  ctx.restore();

  // 4) Counter pill under the gem.
  if (!lk.opened) {
    var label = lk.collected + '/' + lk.required;
    ctx.font = 'bold ' + (11 * S) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(label).width + 12 * S;
    var py = gc.y + r * 1.16 + 9 * S;
    ctx.fillStyle = col.dark;
    rRect(gc.x - tw / 2, py - 8 * S, tw, 16 * S, 8 * S); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, gc.x, py + 0.5 * S);
  }

  ctx.restore();
}

// Small gem fragment badge sitting on a carrier box (before it's tapped).
function drawGemFragmentBadge(s) {
  if (s.piece < 0 || s.used || s.empty) return;
  var col = LOCK_COLORS[s.piece % LOCK_COLORS.length];
  var cx = s.x + L.bw * 0.76;
  var cy = s.y + L.bh * 0.24;
  var r = L.bw * 0.17;
  var bob = Math.sin(tick * 0.08 + s.piece) * 1.5 * S;
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.shadowColor = col.glow; ctx.shadowBlur = 8 * S;
  drawGemShard(0, 0, r, col, tick * 0.04 + s.piece);
  ctx.restore();
}

// A single faceted gem shard (used for badges and flying fragments).
function drawGemShard(cx, cy, r, col, rot) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  // Diamond-ish 6-point facet.
  var pts = [
    [0, -r], [r * 0.8, -r * 0.2], [r * 0.5, r], [-r * 0.5, r], [-r * 0.8, -r * 0.2]
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  var g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, col.light);
  g.addColorStop(0.5, col.fill);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1 * S;
  ctx.stroke();
  // Facet lines from top point.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.8 * S;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(0, r);
  ctx.moveTo(0, -r); ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.moveTo(0, -r); ctx.lineTo(pts[4][0], pts[4][1]);
  ctx.stroke();
  // Sparkle highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.35, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Draw all locks and carrier badges (called after drawStock).
function drawPuzzleLocks() {
  for (var i = 0; i < stock.length; i++) {
    if (stock[i] && stock[i].piece >= 0) drawGemFragmentBadge(stock[i]);
  }
  for (var j = 0; j < puzzleLocks.length; j++) drawOnePuzzleLock(puzzleLocks[j]);
}

// Flying fragments (drawn above the board for the signature snap).
function drawPuzzlePieces() {
  for (var i = 0; i < puzzlePieces.length; i++) {
    var p = puzzlePieces[i];
    var col = LOCK_COLORS[p.lockId % LOCK_COLORS.length];
    var t = p.t;
    var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    var x = p.sx + (p.tx - p.sx) * e;
    var y = p.sy + (p.ty - p.sy) * e - Math.sin(t * Math.PI) * 55 * S;
    p.x = x; p.y = y;
    var scale = 1 + Math.sin(t * Math.PI) * 0.35;
    if (tick % 2 === 0) {
      particles.push({
        x: x, y: y, vx: (Math.random() - 0.5) * 0.6 * S, vy: 0.4 * S,
        r: (1.5 + Math.random() * 2) * S, color: col.light, life: 0.6, decay: 0.05, grav: false
      });
    }
    ctx.save();
    ctx.shadowColor = col.glow; ctx.shadowBlur = 10 * S;
    drawGemShard(x, y, L.bw * 0.16 * scale, col, p.spin);
    ctx.restore();
  }
}
