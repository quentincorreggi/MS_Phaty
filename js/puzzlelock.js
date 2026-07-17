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

// World-space center of a lock's gem cluster — the geometric centroid of
// the run, so a 2-cell lock sits on the seam and a 5-cell lock sits on
// its middle cell.
function getLockGemCenter(lk) {
  var sx = 0, sy = 0, n = lk.cells.length;
  for (var i = 0; i < n; i++) {
    var s = stock[lk.cells[i]];
    sx += s.x + L.bw / 2;
    sy += s.y + L.bh / 2;
  }
  return { x: sx / n, y: sy / n };
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

// Organic faceted-gem outline points (a cut jewel: pointed top/bottom,
// wide shoulders). Shared by the shard and its empty silhouette so the
// filled and unfilled slots line up exactly.
function gemShardPoints(r) {
  return [
    [0, -r],
    [r * 0.66, -r * 0.4],
    [r * 0.84, r * 0.26],
    [0, r],
    [-r * 0.84, r * 0.26],
    [-r * 0.66, -r * 0.4]
  ];
}

// Cluster of gem slots — one slot per required fragment (2..4), arranged
// organically. Collected slots show a filled jewel; the rest are empty
// silhouettes. This is the whole progress display (no counter needed to
// read it, but we still show one).
function drawGemCluster(cx, cy, R, required, collected, col, tick, fillT) {
  var n = Math.max(1, Math.min(LOCK_PIECES_MAX, required));
  var d = R * 0.5;
  var layout;
  if (n === 1) layout = [[0, 0]];
  else if (n === 2) layout = [[-d, 0], [d, 0]];
  else if (n === 3) layout = [[0, -d * 0.98], [-d, d * 0.6], [d, d * 0.6]];
  else layout = [[-d, -d], [d, -d], [-d, d], [d, d]];
  var shardR = R * (n <= 2 ? 0.52 : (n === 3 ? 0.48 : 0.46));
  for (var i = 0; i < n; i++) {
    var px = cx + layout[i][0], py = cy + layout[i][1];
    if (i < collected) {
      var justFilled = (i === collected - 1) && fillT > 0;
      var scl = justFilled ? (1 + fillT * 0.4) : 1;
      var bob = Math.sin(tick * 0.05 + i * 1.4) * 0.04 + 1;
      ctx.save();
      ctx.shadowColor = col.glow; ctx.shadowBlur = 10 * S;
      drawGemShard(px, py, shardR * scl * bob, col, tick * 0.012 + i * 1.3);
      if (justFilled) {
        ctx.globalAlpha = fillT * 0.8;
        drawGemShard(px, py, shardR * scl, { fill: '#fff', light: '#fff', dark: '#fff' }, tick * 0.012 + i * 1.3);
      }
      ctx.restore();
    } else {
      drawGemSilhouette(px, py, shardR, col);
    }
  }
}

// Empty gem slot: dark hollow + faint colored dashed outline.
function drawGemSilhouette(cx, cy, r, col) {
  ctx.save();
  ctx.translate(cx, cy);
  var pts = gemShardPoints(r);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(14,11,20,0.5)';
  ctx.fill();
  ctx.strokeStyle = col.glow;
  ctx.lineWidth = 1.5 * S;
  ctx.setLineDash([3 * S, 3 * S]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// One lock: thin colored rim so the group reads, a delicate chain, and
// the gem cluster on the centroid of the run. The boxes underneath keep
// their real colors (drawn by drawStock) and are NOT covered here.
function drawOnePuzzleLock(lk) {
  var col = lk.color;
  var fade = lk.opened ? Math.max(0, lk.openT) : 1;
  if (lk.opened && lk.openT <= 0) return; // fully gone

  ctx.save();
  ctx.globalAlpha = fade;

  // 1) Thin colored rim on each chained cell — identifies the lock group
  //    without hiding the box color underneath.
  for (var k = 0; k < lk.cells.length; k++) {
    var s = stock[lk.cells[k]];
    ctx.globalAlpha = fade * 0.9;
    ctx.strokeStyle = col.fill;
    ctx.lineWidth = 2.5 * S;
    rRect(s.x + 1.5 * S, s.y + 1.5 * S, L.bw - 3 * S, L.bh - 3 * S, 6 * S);
    ctx.stroke();
    ctx.globalAlpha = fade;
  }

  // 2) A delicate chain of small links between consecutive cells.
  for (var c = 0; c < lk.cells.length - 1; c++) {
    var a = stock[lk.cells[c]], b = stock[lk.cells[c + 1]];
    var ax = a.x + L.bw / 2, ay = a.y + L.bh / 2;
    var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
    var dist = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    var links = Math.max(3, Math.round(dist / (9 * S)));
    var lr = 2.4 * S;
    for (var li = 0; li <= links; li++) {
      var t = li / links;
      var lx = ax + (bx - ax) * t, ly = ay + (by - ay) * t;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fillStyle = (li % 2 === 0) ? 'rgba(228,225,235,0.95)' : 'rgba(140,136,150,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,86,100,0.6)';
      ctx.lineWidth = 0.8 * S;
      ctx.stroke();
    }
  }

  // 3) The gem cluster on the centroid of the run.
  var gc = getLockGemCenter(lk);
  var jitter = lk.shakeT > 0 ? Math.sin(tick * 0.9) * 3 * S * lk.shakeT : 0;
  var openScale = lk.opened ? (1 + (1 - lk.openT) * 0.8) : 1;
  var R = L.bw * 0.62 * openScale;
  ctx.save();
  ctx.translate(gc.x + jitter, gc.y);

  // Small shackle above the cluster so it reads as a lock.
  if (!lk.opened) {
    ctx.strokeStyle = 'rgba(196,192,206,0.95)';
    ctx.lineWidth = 3.5 * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -R * 0.66, R * 0.34, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  drawGemCluster(0, 0, R, lk.required, lk.collected, col, tick, lk.fillT);
  ctx.restore();

  // 4) Counter pill under the cluster.
  if (!lk.opened) {
    var label = lk.collected + '/' + lk.required;
    ctx.font = 'bold ' + (11 * S) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(label).width + 12 * S;
    var py = gc.y + R * 0.92 + 7 * S;
    ctx.fillStyle = col.dark;
    rRect(gc.x - tw / 2, py - 8 * S, tw, 16 * S, 8 * S); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, gc.x, py + 0.5 * S);
  }

  ctx.restore();
}

// Bigger gem fragment sitting in the MIDDLE of a carrier box. Sized so
// the box color still shows clearly all around it.
function drawGemFragmentBadge(s) {
  if (s.piece < 0 || s.used || s.empty) return;
  var col = LOCK_COLORS[s.piece % LOCK_COLORS.length];
  var cx = s.x + L.bw / 2;
  var cy = s.y + L.bh / 2;
  var r = L.bw * 0.28;
  var bob = Math.sin(tick * 0.08 + s.piece) * 2 * S;
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.shadowColor = col.glow; ctx.shadowBlur = 12 * S;
  drawGemShard(0, 0, r, col, tick * 0.02 + s.piece);
  ctx.restore();
}

// A single faceted gem shard (used for the cluster, badges and flying
// fragments). `rot` is the absolute rotation in radians.
function drawGemShard(cx, cy, r, col, rot) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  var pts = gemShardPoints(r);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  var g = ctx.createLinearGradient(-r, -r, r * 0.6, r);
  g.addColorStop(0, col.light);
  g.addColorStop(0.5, col.fill);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1 * S;
  ctx.stroke();
  // Internal facets (organic cut).
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 0.8 * S;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(0, r);
  ctx.moveTo(pts[5][0], pts[5][1]); ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[4][0], pts[4][1]);
  ctx.stroke();
  // Sparkle highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(-r * 0.18, -r * 0.32, r * 0.15, 0, Math.PI * 2); ctx.fill();
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
    ctx.shadowColor = col.glow; ctx.shadowBlur = 12 * S;
    drawGemShard(x, y, L.bw * 0.22 * scale, col, p.spin);
    ctx.restore();
  }
}
