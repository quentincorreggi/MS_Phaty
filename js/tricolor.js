// ============================================================
// tricolor.js — Tri-Color Customer
//   One big customer piece spanning 3 adjacent sort lanes,
//   built from TRI_ROWS rows of 3 cups (one color per lane).
//   Only the front row accepts marbles. A full cup waits until
//   its whole row is full, then the row unclips and pops away
//   and the next row slides forward.
// ============================================================

// ── Pick colors and pull their sort boxes out of the normal pool ──
// Each piece needs 3 different colors, each with at least TRI_ROWS
// sort boxes' worth of marbles. Returns the list of pieces built.
function buildTriPieces(sortPerColor, count) {
  var pieces = [];
  for (var p = 0; p < count; p++) {
    var cands = [];
    for (var c = 0; c < NUM_COLORS; c++) if (sortPerColor[c] >= TRI_ROWS) cands.push(c);
    if (cands.length < 3) break;
    shuffle(cands);
    var colors = cands.slice(0, 3);
    for (var k = 0; k < 3; k++) sortPerColor[colors[k]] -= TRI_ROWS;
    pieces.push({ colors: colors, lanes: [], rows: [] });
  }
  return pieces;
}

// ── Place pieces at the front of their lanes ──
// Returns per-lane depth taken by tri cells (so lock buttons can go after).
function insertTriPieces(pieces) {
  var depth = [0, 0, 0, 0];
  for (var p = 0; p < pieces.length; p++) {
    var piece = pieces[p];
    var start = Math.random() < 0.5 ? 0 : 1;
    piece.lanes = [start, start + 1, start + 2];
    for (var r = 0; r < TRI_ROWS; r++) {
      var row = [];
      for (var k = 0; k < 3; k++) {
        row.push({ ci: piece.colors[k], filled: 0, popT: 0, vis: true, shineT: 0, squishT: 0,
          tri: piece, triRow: r, triK: k, triLane: piece.lanes[k], snapT: 0, triDone: false });
      }
      piece.rows.push(row);
    }
    for (var k = 0; k < 3; k++) {
      var lane = piece.lanes[k];
      for (var r = 0; r < TRI_ROWS; r++) sortCols[lane].splice(depth[lane] + r, 0, piece.rows[r][k]);
      depth[lane] += TRI_ROWS;
    }
  }
  return depth;
}

function topVisibleSortBox(lane) {
  var col = sortCols[lane];
  for (var r = 0; r < col.length; r++) if (col[r].vis) return col[r];
  return null;
}

// A tri cell accepts marbles only when its whole row is at the front
// of all 3 lanes and the row isn't already detaching.
function isTriCellActive(cell) {
  if (cell.triDone) return false;
  var row = cell.tri.rows[cell.triRow];
  for (var k = 0; k < row.length; k++) {
    if (topVisibleSortBox(row[k].triLane) !== row[k]) return false;
  }
  return true;
}

// Called when a marble lands and the cup reaches SORT_CAP.
function onTriCellFilled(cell) {
  cell.shineT = 1;
  tone(1100, 0.08, 'square', 0.04);
  var row = cell.tri.rows[cell.triRow];
  for (var k = 0; k < row.length; k++) if (row[k].filled < SORT_CAP) return;

  // Whole row full → unclip like a Lego brick
  for (var k = 0; k < row.length; k++) { row[k].triDone = true; row[k].snapT = 1; row[k].shineT = 1; }
  tone(220, 0.12, 'square', 0.08, 120);
  setTimeout(function () { tone(160, 0.1, 'square', 0.07, 90); }, 90);
  setTimeout(function () {
    sfx.complete();
    for (var k = 0; k < row.length; k++) {
      var cl = row[k];
      cl.popT = 1;
      var bx = L.sSx + cl.triLane * (L.sBw + L.sColGap) + L.sBw / 2;
      var by = getSortBoxY(cl.triLane, 0) + L.sBh / 2;
      spawnBurst(bx, by, COLORS[cl.ci].fill, 16);
      spawnConfetti(bx, by, 10);
    }
  }, 350);
  setTimeout(function () {
    for (var k = 0; k < row.length; k++) row[k].vis = false;
    checkWin();
  }, 950);
}

function updateTriAnims(box) {
  if (box.snapT > 0) box.snapT = Math.max(0, box.snapT - 0.05);
}

// ── Drawing ──
// Called from drawSortArea with the context already translated to the
// cell's center (and scaled for pop / squish).
function drawTriCell(b, vi) {
  var w = L.sBw, h = L.sBh;
  var sc = COLORS[b.ci];
  var active = isTriCellActive(b) || b.triDone;

  if (b.snapT > 0) {
    var wob = Math.sin(b.snapT * Math.PI * 4) * b.snapT;
    ctx.rotate(wob * 0.06);
    ctx.translate(0, -wob * 3 * S);
  }

  // Extend into the gaps toward neighbouring cups so the piece looks joined
  var gx = L.sColGap / 2 + 0.5;
  var left = -w / 2 - (b.triK > 0 ? gx : 0);
  var right = w / 2 + (b.triK < 2 ? gx : 0);
  var top = -h / 2, bodyH = h;

  // Hinge to the row in front (drawn by the rear row so it sits on top).
  // Disappears once the front row has detached.
  var hinged = b.triRow > 0 && b.tri.rows[b.triRow - 1][b.triK].vis;
  if (hinged) {
    var hh = L.sGap + 2;
    ctx.fillStyle = sc.dark;
    ctx.fillRect(left, -h / 2 - hh, right - left, hh + 1);
    ctx.fillStyle = sc.fill;
    ctx.fillRect(left, -h / 2 - hh * 0.7, right - left, hh * 0.4);
  }

  // Body
  ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 3 * S;
  var g = ctx.createLinearGradient(0, top, 0, top + bodyH);
  g.addColorStop(0, sc.light); g.addColorStop(0.45, sc.fill); g.addColorStop(1, sc.dark);
  ctx.fillStyle = g;
  rRect(left, top, right - left, bodyH, 5 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Gloss highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rRect(left + 3 * S, top + 2 * S, (right - left) * 0.45, h * 0.18, 3 * S); ctx.fill();

  // Recessed cup
  var cw = w * 0.84, ch = h * 0.66;
  var cg = ctx.createLinearGradient(0, -ch / 2, 0, ch / 2);
  cg.addColorStop(0, sc.dark); cg.addColorStop(1, sc.fill);
  ctx.fillStyle = cg;
  rRect(-cw / 2, -ch / 2, cw, ch, ch / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2 * S;
  rRect(-cw / 2, -ch / 2, cw, ch, ch / 2); ctx.stroke();

  // Marbles / empty holes
  var sp = w / 4, mrr = 6 * S * cal.sort.s * cal.marble.s;
  for (var j = 0; j < b.filled; j++) drawMarble((j - 1) * sp, 0, mrr, b.ci);
  for (var j = b.filled; j < SORT_CAP; j++) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc((j - 1) * sp, 0, mrr * 0.6, 0, Math.PI * 2); ctx.fill();
  }

  // Hinge stud (sits over the hinge strip)
  if (hinged) {
    var sy = -h / 2 - L.sGap / 2, sr = Math.max(3 * S, L.sGap * 1.4);
    ctx.fillStyle = sc.dark; ctx.beginPath(); ctx.arc(0, sy + 0.5 * S, sr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sc.fill; ctx.beginPath(); ctx.arc(0, sy, sr * 0.82, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(-sr * 0.25, sy - sr * 0.3, sr * 0.3, 0, Math.PI * 2); ctx.fill();
  }

  // Full cup waiting for its row-mates: pulsing glow + check
  if (b.filled >= SORT_CAP && !b.triDone) {
    var pul = 0.5 + Math.sin(tick * 0.15) * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + pul * 0.5) + ')'; ctx.lineWidth = 2 * S;
    rRect(left + 1 * S, top + 1 * S, right - left - 2 * S, bodyH - 2 * S, 5 * S); ctx.stroke();
    var cs = h * 0.18, cx = w / 2 - cs * 1.4, cy = -h / 2 + cs * 1.3;
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, cs, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = sc.dark; ctx.lineWidth = 1.6 * S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - cs * 0.45, cy); ctx.lineTo(cx - cs * 0.1, cy + cs * 0.4); ctx.lineTo(cx + cs * 0.5, cy - cs * 0.35); ctx.stroke();
  }

  if (b.shineT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + b.shineT * 0.4 + ')';
    rRect(left, top, right - left, bodyH, 5 * S); ctx.fill();
  }

  // Rows that aren't live yet are washed out
  if (!active) {
    ctx.fillStyle = 'rgba(245,235,225,0.45)';
    rRect(left, top, right - left, bodyH, 5 * S); ctx.fill();
  }
}
