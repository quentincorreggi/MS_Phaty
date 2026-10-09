// ============================================================
// tricolor.js — Tri-Color Customer
//   A 9-marble customer that sits in one sort lane: TRI_ROWS rows
//   of 3 single-marble holes, 3 colors per row, with the color
//   order shifted one step on each row. Only the front row accepts
//   marbles (one of each color). When the row is full it unclips
//   like a Lego brick and the next row slides forward.
// ============================================================

// ── Pick colors and pull their sort boxes out of the normal pool ──
// Each piece holds TRI_ROWS marbles of each of its 3 colors, which with
// the default sort cap of 3 equals one regular customer per color.
function buildTriPieces(sortPerColor, count) {
  var pieces = [];
  var need = Math.max(1, Math.round(TRI_ROWS / SORT_CAP));
  for (var p = 0; p < count; p++) {
    var cands = [];
    for (var c = 0; c < NUM_COLORS; c++) if (sortPerColor[c] >= need) cands.push(c);
    if (cands.length < 3) break;
    shuffle(cands);
    var colors = cands.slice(0, 3);
    for (var k = 0; k < 3; k++) sortPerColor[colors[k]] -= need;
    pieces.push({ colors: colors, rows: [] });
  }
  return pieces;
}

// ── Place each piece at the front of a lane ──
// Returns per-lane depth taken by tri rows (so lock buttons can go after).
function insertTriPieces(pieces) {
  var depth = [0, 0, 0, 0];
  for (var p = 0; p < pieces.length; p++) {
    var piece = pieces[p];
    // Prefer the lane with the fewest tri rows; break ties randomly
    var lanes = [0, 1, 2, 3]; shuffle(lanes);
    var lane = lanes[0];
    for (var i = 1; i < lanes.length; i++) if (depth[lanes[i]] < depth[lane]) lane = lanes[i];
    for (var r = 0; r < TRI_ROWS; r++) {
      // Each row shifts the colors one step right, e.g.
      //   Blue / Green / Red  →  Red / Blue / Green  →  Green / Red / Blue
      var rowColors = [];
      for (var k = 0; k < 3; k++) rowColors.push(piece.colors[(k - r % 3 + 3) % 3]);
      var row = { tri: piece, triRow: r, colors: rowColors, holes: [false, false, false],
        ci: -2, filled: 0, popT: 0, vis: true, shineT: 0, squishT: 0, snapT: 0, triDone: false };
      piece.rows.push(row);
      sortCols[lane].splice(depth[lane] + r, 0, row);
    }
    depth[lane] += TRI_ROWS;
  }
  return depth;
}

// Free hole in this row for a marble of color ci, or -1.
// Holes already targeted by a marble in flight count as taken.
function triFreeHole(row, ci, lane) {
  if (row.triDone) return -1;
  for (var k = 0; k < 3; k++) {
    if (row.colors[k] !== ci || row.holes[k]) continue;
    var taken = false;
    for (var j = 0; j < jumpers.length; j++)
      if (jumpers[j].targetCol === lane && jumpers[j].targetSlot === k) { taken = true; break; }
    if (!taken) return k;
  }
  return -1;
}

// A jumping marble reached the front box of its lane, which is a tri row.
function onTriMarbleLanded(row, j, lane) {
  var k = j.targetSlot;
  if (row.triDone || row.holes[k] || row.colors[k] !== j.ci) return;
  row.holes[k] = true; row.filled++; row.squishT = 1;
  sfx.sort();
  if (row.filled < 3) return;

  // Whole row full → unclip like a Lego brick
  row.triDone = true; row.snapT = 1; row.shineT = 1;
  tone(220, 0.12, 'square', 0.08, 120);
  setTimeout(function () { tone(160, 0.1, 'square', 0.07, 90); }, 90);
  setTimeout(function () {
    sfx.complete();
    row.popT = 1;
    var x0 = L.sSx + lane * (L.sBw + L.sColGap) + L.sBw / 2;
    var by = getSortBoxY(lane, 0) + L.sBh / 2;
    for (var k2 = 0; k2 < 3; k2++) spawnBurst(x0 + (k2 - 1) * (L.sBw / 3), by, COLORS[row.colors[k2]].fill, 8);
    spawnConfetti(x0, by, 15);
  }, 350);
  setTimeout(function () { row.vis = false; checkWin(); }, 950);
}

function updateTriAnims(box) {
  if (box.snapT > 0) box.snapT = Math.max(0, box.snapT - 0.05);
}

// ── Drawing ──
// Called from drawSortArea with the context already translated to the
// row's center (and scaled for pop / squish). vi = position in lane.
function drawTriCell(b, vi) {
  var w = L.sBw, h = L.sBh, sw = w / 3;
  var active = (vi === 0);
  var front = b.triRow > 0 ? b.tri.rows[b.triRow - 1] : null;
  var hinged = front && front.vis;

  if (b.snapT > 0) {
    var wob = Math.sin(b.snapT * Math.PI * 4) * b.snapT;
    ctx.rotate(wob * 0.05);
    ctx.translate(0, -wob * 3 * S);
  }

  // Hinge strip to the row in front (drawn by the rear row so it sits on top)
  if (hinged) {
    var hh = L.sGap + 2;
    for (var k = 0; k < 3; k++) {
      var hc = COLORS[b.colors[k]], hx = -w / 2 + k * sw;
      ctx.fillStyle = hc.dark; ctx.fillRect(hx, -h / 2 - hh, sw + 0.5, hh + 1);
      ctx.fillStyle = hc.fill; ctx.fillRect(hx, -h / 2 - hh * 0.7, sw + 0.5, hh * 0.4);
    }
  }

  // Body shadow
  ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 3 * S;
  ctx.fillStyle = '#000';
  rRect(-w / 2, -h / 2, w, h, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Three vertical color strips, clipped to the rounded body
  ctx.save();
  rRect(-w / 2, -h / 2, w, h, 6 * S); ctx.clip();
  var holeR = Math.min(sw, h) * 0.36;
  var mrr = Math.min(6 * S * cal.sort.s * cal.marble.s, holeR * 0.95);
  for (var k = 0; k < 3; k++) {
    var sc = COLORS[b.colors[k]], x0 = -w / 2 + k * sw, cx = (k - 1) * sw;
    var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, sc.light); g.addColorStop(0.45, sc.fill); g.addColorStop(1, sc.dark);
    ctx.fillStyle = g; ctx.fillRect(x0, -h / 2, sw + 0.5, h);
    // seam between strips
    if (k > 0) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x0, -h / 2, 1 * S, h); }
    // gloss
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rRect(x0 + 2 * S, -h / 2 + 2 * S, sw * 0.5, h * 0.16, 2 * S); ctx.fill();
    // recessed hole
    var hg = ctx.createRadialGradient(cx, -holeR * 0.3, holeR * 0.2, cx, 0, holeR);
    hg.addColorStop(0, sc.fill); hg.addColorStop(1, sc.dark);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, 0, holeR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.arc(cx, 0, holeR, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    if (b.holes[k]) drawMarble(cx, 0, mrr, b.colors[k]);
  }
  ctx.restore();

  // Hinge studs (one per strip, over the hinge strip)
  if (hinged) {
    var sy = -h / 2 - L.sGap / 2, sr = Math.max(2.5 * S, L.sGap * 1.2);
    for (var k = 0; k < 3; k++) {
      var sc2 = COLORS[b.colors[k]], cx2 = (k - 1) * sw;
      ctx.fillStyle = sc2.dark; ctx.beginPath(); ctx.arc(cx2, sy + 0.5 * S, sr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sc2.fill; ctx.beginPath(); ctx.arc(cx2, sy, sr * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(cx2 - sr * 0.25, sy - sr * 0.3, sr * 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Outline: live row gets a soft pulsing white edge
  if (active && !b.triDone) {
    var pul = 0.5 + Math.sin(tick * 0.12) * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + pul * 0.4) + ')'; ctx.lineWidth = 1.6 * S;
    rRect(-w / 2 + 0.8 * S, -h / 2 + 0.8 * S, w - 1.6 * S, h - 1.6 * S, 6 * S); ctx.stroke();
  }

  if (b.shineT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + b.shineT * 0.4 + ')';
    rRect(-w / 2, -h / 2, w, h, 6 * S); ctx.fill();
  }

  // Rows that aren't live yet are washed out
  if (!active) {
    ctx.fillStyle = 'rgba(245,235,225,0.45)';
    rRect(-w / 2, -h / 2, w, h, 6 * S); ctx.fill();
  }
}
