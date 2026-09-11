// ============================================================
// cover.js — Detonator Box mechanic (zipped Cover + Zip Box)
// ============================================================
//
// A Cover is a free-form contiguous area of grid cells, painted
// cell by cell in the level editor. While the Cover is in place
// the cells underneath are inaccessible and invisible (opaque).
//
// Exactly one box elsewhere in the maze carries the matching
// group flag — the "Zip Box" (internally: detonator). It is an
// otherwise normal box of any variant. Tapping it releases its
// marbles as usual AND unzips its linked Cover in the same tap.
//
// No counter anywhere. Up to 3 independent pairs per level.
//
// Grid data format (cells carry these as extra properties):
//   { ci, type, cover: 1|2|3 }      box under a Cover
//   { cover: 1|2|3 }                empty cell under a Cover
//   { wall: true, cover: 1|2|3 }    wall under a Cover
//   { ci, type, detonator: 1|2|3 }  a Zip Box of that group
//
// Visual direction: a zipped fabric pouch laid over the maze —
// one fill, one edge (dashed stitch), one tooth ladder, one
// silver slider. Nothing reads as a bomb or a fuse.
// Group 1 is the purple from the reference art; groups 2 and 3
// are placeholders in the same register (final palette TBD).
// Grey is deliberately unused — reserved for Locked Customers.
// ============================================================

var DET_GROUP_COUNT = 3;

// index 0 unused so a group id is never falsy
var DET_GROUPS = [
  null,
  { id: 1, name: 'Purple', fabric: '#A45FD8', light: '#C591EC', dark: '#6B3AA5', deep: '#572C8A',
    stitch: 'rgba(255,255,255,0.92)' },
  { id: 2, name: 'Teal',   fabric: '#2E9C9B', light: '#6ACBC9', dark: '#1A6A69', deep: '#125453',
    stitch: 'rgba(236,255,254,0.92)' },
  { id: 3, name: 'Ochre',  fabric: '#D9913C', light: '#F2BC77', dark: '#94601C', deep: '#774B12',
    stitch: 'rgba(255,248,232,0.92)' }
];

// Teeth and slider are the same materials in every group — the
// fabric colour alone carries the pairing.
var ZIP_TEETH = '#E8DCC4';
var ZIP_TEETH_DARK = '#B9A985';
var ZIP_METAL_HI = '#FFFFFF';
var ZIP_METAL = '#C9C9D2';
var ZIP_METAL_LO = '#83838E';
var ZIP_METAL_EDGE = '#5C5C66';

function getDetGroup(g) { return DET_GROUPS[g] || DET_GROUPS[1]; }

// The unzip duration is FIXED — a long Cover unzips faster, not
// longer — so the animation never desyncs from the audio cue.
var COVER_UNZIP_FRAMES = 42;

// ── Cover construction ─────────────────────────────────────────

function buildCovers() {
  covers = [null, null, null, null];
  if (!stock || !stock.length) return;

  for (var g = 1; g <= DET_GROUP_COUNT; g++) {
    var cells = [];
    for (var i = 0; i < stock.length; i++) {
      if (stock[i] && stock[i].coverGroup === g) cells.push(i);
    }
    if (cells.length === 0) continue;

    var setMap = {};
    for (var k = 0; k < cells.length; k++) setMap[cells[k]] = true;

    var cv = {
      group: g,
      cells: cells,
      setMap: setMap,
      active: true,
      unzipping: false,
      unzipT: 0,
      shakeT: 0
    };
    computeCoverBBox(cv);
    cv.spine = computeCoverSpine(cv, cells, setMap);

    // Run the seam from the end nearest the Zip Box, so the
    // slider visibly travels out of the box and into the Cover.
    var detIdx = findDetonatorIdx(g);
    if (detIdx >= 0) orientCoverSpine(cv, detIdx);
    assignCoverSeams(cv);
    covers[g] = cv;
  }
}

function findDetonatorIdx(group) {
  for (var i = 0; i < stock.length; i++) {
    if (stock[i] && stock[i].detGroup === group) return i;
  }
  return -1;
}

function isCoverActive(group) {
  if (!group) return false;
  var cv = covers[group];
  return !!(cv && cv.active);
}

// ── Spine: the zip's path through a free-form silhouette ────────
// Longest path through the cell-adjacency graph (double BFS), so
// the teeth read as a single zip on a block, an L, a band or a
// ring alike.

function coverCellNeighbors(idx, setMap) {
  var r = Math.floor(idx / L.cols), c = idx % L.cols, out = [];
  if (r > 0 && setMap[(r - 1) * L.cols + c]) out.push((r - 1) * L.cols + c);
  if (r < L.rows - 1 && setMap[(r + 1) * L.cols + c]) out.push((r + 1) * L.cols + c);
  if (c > 0 && setMap[r * L.cols + (c - 1)]) out.push(r * L.cols + (c - 1));
  if (c < L.cols - 1 && setMap[r * L.cols + (c + 1)]) out.push(r * L.cols + (c + 1));
  return out;
}

function coverBFS(start, setMap) {
  var dist = {}, prev = {};
  dist[start] = 0; prev[start] = -1;
  var q = [start], head = 0, far = start;
  while (head < q.length) {
    var cur = q[head++];
    var nb = coverCellNeighbors(cur, setMap);
    for (var n = 0; n < nb.length; n++) {
      if (dist[nb[n]] === undefined) {
        dist[nb[n]] = dist[cur] + 1;
        prev[nb[n]] = cur;
        q.push(nb[n]);
        if (dist[nb[n]] > dist[far]) far = nb[n];
      }
    }
  }
  return { dist: dist, prev: prev, far: far };
}

function computeCoverSpine(cv, cells, setMap) {
  // A solid rectangle gets a straight seam down its long middle —
  // the diameter path would take an arbitrary turn at a corner.
  var straight = coverStraightSpine(cv, setMap);
  if (straight) return straight;

  var a = coverBFS(cells[0], setMap).far;
  var b = coverBFS(a, setMap);
  var path = [], cur = b.far;
  while (cur !== -1 && cur !== undefined) {
    path.push(cur);
    cur = b.prev[cur];
  }
  path.reverse();
  return path.length ? path : [cells[0]];
}

// If every cell of the bounding box is covered, the shape is a
// solid rectangle: run the seam straight along its long axis.
function coverStraightSpine(cv, setMap) {
  var b = cv.bbox;
  var rows = b.r1 - b.r0 + 1, cols = b.c1 - b.c0 + 1;
  if (rows * cols !== cv.cells.length) return null;
  for (var r = b.r0; r <= b.r1; r++) {
    for (var c = b.c0; c <= b.c1; c++) {
      if (!setMap[r * L.cols + c]) return null;
    }
  }
  var path = [];
  if (cols >= rows) {
    var mr = b.r0 + Math.floor((rows - 1) / 2);
    for (var c2 = b.c0; c2 <= b.c1; c2++) path.push(mr * L.cols + c2);
  } else {
    var mc = b.c0 + Math.floor((cols - 1) / 2);
    for (var r2 = b.r0; r2 <= b.r1; r2++) path.push(r2 * L.cols + mc);
  }
  return path;
}

function orientCoverSpine(cv, detIdx) {
  var sp = cv.spine;
  if (sp.length < 2) return;
  var dr = Math.floor(detIdx / L.cols), dc = detIdx % L.cols;
  var f = sp[0], l = sp[sp.length - 1];
  var df = Math.abs(Math.floor(f / L.cols) - dr) + Math.abs((f % L.cols) - dc);
  var dl = Math.abs(Math.floor(l / L.cols) - dr) + Math.abs((l % L.cols) - dc);
  if (dl < df) sp.reverse();
}

// Each cell gets the spine position it peels at, and the local
// seam axis ('h' = seam runs left/right, halves part up/down).
function assignCoverSeams(cv) {
  var sp = cv.spine;
  var axes = [];
  for (var s = 0; s < sp.length; s++) {
    var ref = (s < sp.length - 1) ? sp[s + 1] : (s > 0 ? sp[s - 1] : -1);
    var axis = 'h';
    if (ref >= 0) {
      axis = (Math.floor(sp[s] / L.cols) === Math.floor(ref / L.cols)) ? 'h' : 'v';
    }
    axes.push(axis);
  }
  cv.spineAxes = axes;
  cv.seam = {};
  for (var i = 0; i < cv.cells.length; i++) {
    var idx = cv.cells[i];
    var cr = Math.floor(idx / L.cols), cc = idx % L.cols;
    var best = 0, bd = Infinity;
    for (var s2 = 0; s2 < sp.length; s2++) {
      var d = Math.abs(Math.floor(sp[s2] / L.cols) - cr) + Math.abs((sp[s2] % L.cols) - cc);
      if (d < bd) { bd = d; best = s2; }
    }
    // Cells hanging off the spine peel a beat after it passes.
    cv.seam[idx] = { s: best + bd * 0.35, axis: axes[best] || 'h' };
  }
}

// The shading runs across the whole pouch, not per cell — a
// per-cell gradient bands visibly at every cell boundary.
function computeCoverBBox(cv) {
  var r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (var i = 0; i < cv.cells.length; i++) {
    var r = Math.floor(cv.cells[i] / L.cols), c = cv.cells[i] % L.cols;
    if (r < r0) r0 = r; if (r > r1) r1 = r;
    if (c < c0) c0 = c; if (c > c1) c1 = c;
  }
  cv.bbox = { r0: r0, r1: r1, c0: c0, c1: c1 };
}

function coverBBoxPx(cv) {
  var b = cv.bbox;
  return {
    x0: L.sx + b.c0 * (L.bw + L.bg),
    y0: L.sy + b.r0 * (L.bh + L.bg),
    x1: L.sx + b.c1 * (L.bw + L.bg) + L.bw,
    y1: L.sy + b.r1 * (L.bh + L.bg) + L.bh
  };
}

// ── Geometry helpers ───────────────────────────────────────────

function coverHasCell(cv, r, c) {
  if (r < 0 || r >= L.rows || c < 0 || c >= L.cols) return false;
  return !!cv.setMap[r * L.cols + c];
}

// Cell rect grown into the grid gaps toward covered neighbours, so
// the fabric reads as one continuous pouch with no seams. Corner
// flags mark convex corners — those get the pouch's rounding.
function coverCellRect(cv, idx) {
  var r = Math.floor(idx / L.cols), c = idx % L.cols;
  var x = L.sx + c * (L.bw + L.bg), y = L.sy + r * (L.bh + L.bg);
  var pad = L.bg / 2 + 0.6;
  var up = !coverHasCell(cv, r - 1, c), dn = !coverHasCell(cv, r + 1, c);
  var lf = !coverHasCell(cv, r, c - 1), rt = !coverHasCell(cv, r, c + 1);
  return {
    r: r, c: c, up: up, dn: dn, lf: lf, rt: rt,
    x0: x - (lf ? 0 : pad), x1: x + L.bw + (rt ? 0 : pad),
    y0: y - (up ? 0 : pad), y1: y + L.bh + (dn ? 0 : pad)
  };
}

// Path for one cell of the pouch, grown by `grow` on every side,
// rounded only at convex corners. Adjacent cells overlap, so the
// union is a clean rounded free-form silhouette.
function coverCellPath(rect, grow, radius, roundAll) {
  var x0 = rect.x0 - grow, y0 = rect.y0 - grow;
  var x1 = rect.x1 + grow, y1 = rect.y1 + grow;
  var R = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  var tl = (roundAll || (rect.up && rect.lf)) ? R : 0;
  var tr = (roundAll || (rect.up && rect.rt)) ? R : 0;
  var br = (roundAll || (rect.dn && rect.rt)) ? R : 0;
  var bl = (roundAll || (rect.dn && rect.lf)) ? R : 0;
  ctx.beginPath();
  ctx.moveTo(x0 + tl, y0);
  ctx.lineTo(x1 - tr, y0);
  if (tr) ctx.arcTo(x1, y0, x1, y0 + tr, tr);
  ctx.lineTo(x1, y1 - br);
  if (br) ctx.arcTo(x1, y1, x1 - br, y1, br);
  ctx.lineTo(x0 + bl, y1);
  if (bl) ctx.arcTo(x0, y1, x0, y1 - bl, bl);
  ctx.lineTo(x0, y0 + tl);
  if (tl) ctx.arcTo(x0, y0, x0 + tl, y0, tl);
  ctx.closePath();
}

// The dashed stitch: only the outer edges of the silhouette, so
// it closes around any contiguous shape and never crosses it.
function coverStitchPath(rect, inset, radius) {
  var x0 = rect.x0 + inset, y0 = rect.y0 + inset;
  var x1 = rect.x1 - inset, y1 = rect.y1 - inset;
  var R = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  var up = rect.up, dn = rect.dn, lf = rect.lf, rt = rect.rt;
  ctx.beginPath();
  if (up) { ctx.moveTo(lf ? x0 + R : x0, y0); ctx.lineTo(rt ? x1 - R : x1, y0); }
  if (dn) { ctx.moveTo(lf ? x0 + R : x0, y1); ctx.lineTo(rt ? x1 - R : x1, y1); }
  if (lf) { ctx.moveTo(x0, up ? y0 + R : y0); ctx.lineTo(x0, dn ? y1 - R : y1); }
  if (rt) { ctx.moveTo(x1, up ? y0 + R : y0); ctx.lineTo(x1, dn ? y1 - R : y1); }
  if (up && lf) { ctx.moveTo(x0, y0 + R); ctx.arcTo(x0, y0, x0 + R, y0, R); }
  if (up && rt) { ctx.moveTo(x1 - R, y0); ctx.arcTo(x1, y0, x1, y0 + R, R); }
  if (dn && rt) { ctx.moveTo(x1, y1 - R); ctx.arcTo(x1, y1, x1 - R, y1, R); }
  if (dn && lf) { ctx.moveTo(x0 + R, y1); ctx.arcTo(x0, y1, x0, y1 - R, R); }
}

function coverSpinePoint(cv, s) {
  var idx = cv.spine[Math.max(0, Math.min(cv.spine.length - 1, s))];
  var r = Math.floor(idx / L.cols), c = idx % L.cols;
  return {
    x: L.sx + c * (L.bw + L.bg) + L.bw / 2,
    y: L.sy + r * (L.bh + L.bg) + L.bh / 2
  };
}

function coverSpinePointF(cv, f) {
  var sp = cv.spine;
  if (sp.length < 2) return coverSpinePoint(cv, 0);
  var fc = Math.max(0, Math.min(sp.length - 1, f));
  var i0 = Math.floor(fc), i1 = Math.min(sp.length - 1, i0 + 1), t = fc - i0;
  var p0 = coverSpinePoint(cv, i0), p1 = coverSpinePoint(cv, i1);
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
}

function coverSpineDirF(cv, f) {
  if (cv.spine.length < 2) return { x: 1, y: 0 };
  var a = coverSpinePointF(cv, f - 0.08), b = coverSpinePointF(cv, f + 0.08);
  var dx = b.x - a.x, dy = b.y - a.y;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

// The spine is always grid-orthogonal, so rungs snap to an axis —
// an averaged direction at a corner draws a diagonal wedge.
function coverRungDirF(cv, f) {
  var d = coverSpineDirF(cv, f);
  return Math.abs(d.x) >= Math.abs(d.y) ? { x: 1, y: 0 } : { x: 0, y: 1 };
}

// Zip head position along the spine, in spine-index units.
function coverZipHead(cv) {
  return cv.unzipT * (cv.spine.length + 1.2) - 0.6;
}

function coverCellPeel(cv, idx, head) {
  if (!cv.unzipping) return 0;
  return Math.max(0, Math.min(1, (head - cv.seam[idx].s) / 0.9));
}

// ── Hit testing ────────────────────────────────────────────────

function coverHitTest(px, py) {
  for (var g = 1; g <= DET_GROUP_COUNT; g++) {
    var cv = covers[g];
    if (!cv || !cv.active) continue;
    for (var i = 0; i < cv.cells.length; i++) {
      var rect = coverCellRect(cv, cv.cells[i]);
      if (px >= rect.x0 && px <= rect.x1 && py >= rect.y0 && py <= rect.y1) return cv;
    }
  }
  return null;
}

// ── Trigger + update ───────────────────────────────────────────

// Called on the FIRST tap of a Zip Box, after its marbles are
// released. Idempotent: a Cover already gone never comes back.
function triggerDetonator(idx) {
  var b = stock[idx];
  if (!b || !b.detGroup) return;
  b.detPullT = 0.001;   // one-way: 0 = parked, 1 = run off the box
  var cv = covers[b.detGroup];
  if (!cv || !cv.active || cv.unzipping) return;

  cv.unzipping = true;
  cv.unzipT = 0;
  var grp = getDetGroup(cv.group);
  if (sfx.zipPull) sfx.zipPull();
  if (sfx.zipRun) sfx.zipRun();

  // A few threads pulled from the box toward the seam start
  var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
  var sp0 = coverSpinePoint(cv, 0);
  for (var p = 0; p < 10; p++) {
    var t = p / 10;
    particles.push({
      x: bx + (sp0.x - bx) * t * 0.3, y: by + (sp0.y - by) * t * 0.3,
      vx: (sp0.x - bx) * 0.012 + (Math.random() - 0.5) * 2 * S,
      vy: (sp0.y - by) * 0.012 + (Math.random() - 0.5) * 2 * S,
      r: (1.5 + Math.random() * 2.5) * S, color: grp.light,
      life: 1, decay: 0.03, grav: false
    });
  }
}

function updateCovers() {
  for (var g = 1; g <= DET_GROUP_COUNT; g++) {
    var cv = covers[g];
    if (!cv) continue;
    if (cv.shakeT > 0) cv.shakeT = Math.max(0, cv.shakeT - 0.04);
    if (!cv.unzipping) continue;

    cv.unzipT += 1 / COVER_UNZIP_FRAMES;
    if (cv.unzipT < 1) continue;

    // ── The sweep has finished: the whole shape opens at once ──
    cv.unzipT = 1;
    cv.unzipping = false;
    cv.active = false;
    var grp = getDetGroup(cv.group);

    for (var i = 0; i < cv.cells.length; i++) {
      var s = stock[cv.cells[i]];
      if (!s) continue;
      s.coverGroup = 0;
      if (!s.empty && !s.used && !s.isWall && !s.isTunnel) s.popT = 0.85;
      var cx = s.x + L.bw / 2, cy = s.y + L.bh / 2;
      for (var p = 0; p < 5; p++) {
        var a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
        particles.push({
          x: cx, y: cy, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
          r: (1.5 + Math.random() * 3) * S,
          color: Math.random() > 0.5 ? grp.light : ZIP_TEETH,
          life: 1, decay: 0.02 + Math.random() * 0.02, grav: true
        });
      }
    }

    if (sfx.zipDone) sfx.zipDone();
    updateBoxReveals(true);
  }
}

// ── Drawing: the Cover ─────────────────────────────────────────

function drawCovers() {
  for (var g = 1; g <= DET_GROUP_COUNT; g++) {
    var cv = covers[g];
    if (!cv) continue;
    if (!cv.active && !cv.unzipping) continue;
    drawCover(cv);
  }
}

// Both derived from S and L, so they must be read per frame —
// this file loads before the first resize() sets the scale.
function coverRim() { return 3 * S; }
function coverRadius() { return Math.min(11 * S, L.bw * 0.3); }

// Runs `fn` once per visible piece of a cell — once while the cell
// is still zipped, twice (each half, slid apart) while the head is
// passing over it — with the clip and transform already applied.
function coverEachPiece(cv, idx, head, fn) {
  var local = coverCellPeel(cv, idx, head);
  if (local >= 1) return;
  var rect = coverCellRect(cv, idx);
  // A flap in motion is a loose piece of fabric, not a grid tile:
  // round every corner once it starts parting.
  rect.peeling = local > 0;
  var seam = cv.seam[idx];
  var w = rect.x1 - rect.x0, h = rect.y1 - rect.y0;
  var margin = 8 * S;
  var halves = (local <= 0)
    ? [null]
    : (seam.axis === 'h' ? ['top', 'bottom'] : ['left', 'right']);
  var slide = local * (seam.axis === 'h' ? h : w) * 0.5;

  for (var k = 0; k < halves.length; k++) {
    var half = halves[k], dx = 0, dy = 0;
    if (half === 'top') dy = -slide;
    else if (half === 'bottom') dy = slide;
    else if (half === 'left') dx = -slide;
    else if (half === 'right') dx = slide;

    ctx.save();
    ctx.globalAlpha = 1 - local * local;
    // Translate first, then clip, so the clip window travels with
    // the half and the piece is never cut off mid-slide.
    ctx.translate(dx, dy);
    ctx.beginPath();
    if (half === 'top') ctx.rect(rect.x0 - margin, rect.y0 - margin, w + margin * 2, h / 2 + margin);
    else if (half === 'bottom') ctx.rect(rect.x0 - margin, rect.y0 + h / 2, w + margin * 2, h / 2 + margin);
    else if (half === 'left') ctx.rect(rect.x0 - margin, rect.y0 - margin, w / 2 + margin, h + margin * 2);
    else if (half === 'right') ctx.rect(rect.x0 + w / 2, rect.y0 - margin, w / 2 + margin, h + margin * 2);
    else ctx.rect(rect.x0 - margin, rect.y0 - margin, w + margin * 2, h + margin * 2);
    ctx.clip();
    fn(rect);
    ctx.restore();
  }
}

function drawCover(cv) {
  var grp = getDetGroup(cv.group);
  var head = cv.unzipping ? coverZipHead(cv) : -99;
  var ox = cv.shakeT > 0 ? Math.sin(cv.shakeT * 28) * 4 * S * cv.shakeT : 0;
  var radius = coverRadius();
  var rim = coverRim();
  var i;

  ctx.save();
  ctx.translate(ox, 0);

  // Three ordered passes over the whole shape. Per-cell rims grow
  // into their neighbours, so every rim must land before any
  // fabric — otherwise the overlap shows as dark interior seams.

  // 1. Dark rim — the union of the grown cell paths is one
  //    continuous outline around any contiguous silhouette.
  for (i = 0; i < cv.cells.length; i++) {
    coverEachPiece(cv, cv.cells[i], head, function (rect) {
      coverCellPath(rect, rim, radius + rim, rect.peeling);
      ctx.fillStyle = grp.deep;
      ctx.fill();
    });
  }

  // 2. Fabric — one gradient across the whole pouch so it reads
  //    as a single piece of cloth rather than a row of tiles
  var bb = coverBBoxPx(cv);
  var fabricGrad = ctx.createLinearGradient(bb.x0, bb.y0, bb.x0, bb.y1);
  fabricGrad.addColorStop(0, grp.light);
  fabricGrad.addColorStop(0.35, grp.fabric);
  fabricGrad.addColorStop(1, grp.dark);
  for (i = 0; i < cv.cells.length; i++) {
    coverEachPiece(cv, cv.cells[i], head, function (rect) {
      coverCellPath(rect, 0, radius, rect.peeling);
      ctx.fillStyle = fabricGrad;
      ctx.fill();
    });
  }

  // 3. Dashed stitch, just inside the outer edges only
  for (i = 0; i < cv.cells.length; i++) {
    coverEachPiece(cv, cv.cells[i], head, function (rect) {
      ctx.strokeStyle = grp.stitch;
      ctx.lineWidth = 1.5 * S;
      ctx.lineCap = 'butt';
      ctx.setLineDash([3.4 * S, 3.2 * S]);
      coverStitchPath(rect, 4.4 * S, radius * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  // ── Tooth ladder along the spine + the running slider ──
  drawCoverZip(cv, head);

  ctx.restore();
}

// The zip itself: a recessed channel along the spine, a cream
// tooth ladder, and the slider. Teeth behind the head are gone.
function drawCoverZip(cv, head) {
  var grp = getDetGroup(cv.group);
  var sp = cv.spine;
  var single = sp.length < 2;
  var end = single ? 0 : sp.length - 1;
  var chanW = Math.min(14 * S, L.bw * 0.32);
  var toothLen = chanW * 0.78;
  var alpha = cv.unzipping ? Math.max(0, 1 - cv.unzipT * 1.5) : 1;
  if (alpha <= 0.01) return;

  var from = cv.unzipping ? Math.max(0, Math.min(end, head)) : 0;
  var steps = single ? 1 : Math.max(8, Math.round(end / 0.06));
  var stepF = single ? 0 : end / steps;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Recessed channel the teeth sit in
  ctx.strokeStyle = grp.deep;
  ctx.lineWidth = chanW;
  ctx.beginPath();
  if (single) {
    var pc = coverSpinePoint(cv, 0);
    ctx.moveTo(pc.x - L.bw * 0.26, pc.y);
    ctx.lineTo(pc.x + L.bw * 0.26, pc.y);
  } else {
    var p0 = coverSpinePointF(cv, from);
    ctx.moveTo(p0.x, p0.y);
    for (var f = from; f < end; f += stepF) {
      var pp = coverSpinePointF(cv, f);
      ctx.lineTo(pp.x, pp.y);
    }
    var pe = coverSpinePointF(cv, end);
    ctx.lineTo(pe.x, pe.y);
  }
  ctx.stroke();

  // Tooth ladder — rungs across the channel, tightly spaced.
  // Walked in fixed pixel steps so the spacing stays even on any
  // silhouette and at any scale.
  var rungGap = 2.7 * S;
  if (single) {
    var pc2 = coverSpinePoint(cv, 0);
    var ax = pc2.x - L.bw * 0.24, bx = pc2.x + L.bw * 0.24;
    var n = Math.max(2, Math.round((bx - ax) / rungGap));
    for (var i = 0; i <= n; i++) {
      drawZipRung(ax + (bx - ax) * (i / n), pc2.y, { x: 1, y: 0 }, toothLen);
    }
  } else {
    var walkF = from, guard = 0, acc = 0;
    var prev = coverSpinePointF(cv, from);
    drawZipRung(prev.x, prev.y, coverRungDirF(cv, from), toothLen);
    while (walkF < end && guard++ < 4000) {
      walkF = Math.min(end, walkF + stepF);
      var cur = coverSpinePointF(cv, walkF);
      acc += Math.sqrt((cur.x - prev.x) * (cur.x - prev.x) + (cur.y - prev.y) * (cur.y - prev.y));
      prev = cur;
      if (acc >= rungGap) {
        acc = 0;
        drawZipRung(cur.x, cur.y, coverRungDirF(cv, walkF), toothLen);
      }
    }
  }

  // Idle shimmer travelling the seam — the whole discoverability
  // budget, and the only thing that says "interactive" at rest.
  if (!cv.unzipping && !single) {
    var sf = (tick * 0.006) % 1.7;
    if (sf <= 1) {
      var ps = coverSpinePointF(cv, sf * end);
      ctx.globalAlpha = alpha * (0.25 + Math.sin(sf * Math.PI) * 0.45);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ps.x, ps.y, 2.8 * S, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha;
    }
  }

  // The slider lives on the Zip Box at rest — there is only ever
  // one of them — and runs the seam here while the Cover unzips.
  if (cv.unzipping) {
    var at = Math.max(0, Math.min(end, head));
    var hp = single ? coverSpinePoint(cv, 0) : coverSpinePointF(cv, at);
    var hd = single ? { x: 1, y: 0 } : coverSpineDirF(cv, at);
    ctx.globalAlpha = 1;
    drawZipSlider(hp.x, hp.y, hd, Math.min(L.bw, L.bh) * 0.36, tick);
  }

  ctx.restore();
}

// One rung of the ladder: a cream tooth with a shaded edge. Rungs
// are thicker than the gaps between them, so the track reads as a
// closed zip rather than a barcode.
function drawZipRung(x, y, dir, len) {
  var nx = -dir.y, ny = dir.x;
  var half = len / 2;
  ctx.strokeStyle = ZIP_TEETH_DARK;
  ctx.lineWidth = 2.9 * S;
  ctx.beginPath();
  ctx.moveTo(x - nx * half, y - ny * half);
  ctx.lineTo(x + nx * half, y + ny * half);
  ctx.stroke();
  ctx.strokeStyle = ZIP_TEETH;
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  ctx.moveTo(x - nx * half * 0.9, y - ny * half * 0.9);
  ctx.lineTo(x + nx * half * 0.9, y + ny * half * 0.9);
  ctx.stroke();
}

// The metal pull — shared by the Cover's running slider and the
// Zip Box's resting slider, so the two read as the same object.
function drawZipSlider(x, y, dir, size, tick) {
  var ang = Math.atan2(dir.y, dir.x);
  var w = size, h = size * 0.66;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);

  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 1.5 * S;
  var gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, ZIP_METAL_HI);
  gr.addColorStop(0.4, ZIP_METAL);
  gr.addColorStop(1, ZIP_METAL_LO);
  ctx.fillStyle = gr;
  rRect(-w / 2, -h / 2, w, h, h * 0.42);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Nose pointing into the still-zipped side
  ctx.fillStyle = ZIP_METAL;
  ctx.beginPath();
  ctx.moveTo(w * 0.34, -h * 0.34);
  ctx.lineTo(w * 0.78, 0);
  ctx.lineTo(w * 0.34, h * 0.34);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = ZIP_METAL_EDGE;
  ctx.lineWidth = 1.1 * S;
  rRect(-w / 2, -h / 2, w, h, h * 0.42);
  ctx.stroke();

  // Punched pull hole
  ctx.save();
  ctx.translate(-w * 0.14, 0);
  ctx.scale(1, 0.52);
  ctx.fillStyle = 'rgba(50,50,58,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, w * 0.19, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Looping specular sweep
  var spec = (Math.sin(tick * 0.05) + 1) / 2;
  ctx.save();
  rRect(-w / 2, -h / 2, w, h, h * 0.42);
  ctx.clip();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#fff';
  var cxs = -w / 2 + spec * w;
  ctx.beginPath();
  ctx.moveTo(cxs - w * 0.08, -h / 2);
  ctx.lineTo(cxs + w * 0.06, -h / 2);
  ctx.lineTo(cxs - w * 0.06, h / 2);
  ctx.lineTo(cxs - w * 0.2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ── Drawing: the Zip Box overlay ───────────────────────────────
//
// Deliberately a FRAME, not a full re-skin: the box's own face,
// colour and marbles stay visible, because the player needs to
// judge the conveyor cost of spending the trigger. Works on top
// of any box variant (hidden "?", ice, closed), so box variant +
// box colour + slider all survive on one cell.

function drawDetonatorBoxOverlay(ctx, x, y, w, h, S, group, tick, box, tappable) {
  var grp = getDetGroup(group);
  var band = Math.max(3.4 * S, w * 0.115);
  var pull = box ? (box.detPullT || 0) : 0;
  var radius = 7 * S;

  ctx.save();

  if (tappable) {
    ctx.shadowColor = grp.fabric;
    ctx.shadowBlur = 11 * S * (0.5 + Math.sin(tick * 0.06) * 0.25);
  }

  // Fabric band around the rim — same fill as the pouch
  var gr = ctx.createLinearGradient(x, y, x, y + h);
  gr.addColorStop(0, grp.light);
  gr.addColorStop(0.42, grp.fabric);
  gr.addColorStop(1, grp.dark);
  ctx.strokeStyle = gr;
  ctx.lineWidth = band;
  rRect(x + band / 2, y + band / 2, w - band, h - band, radius);
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Same edge treatment as the pouch: dark rim + dashed stitch
  ctx.strokeStyle = grp.deep;
  ctx.lineWidth = 1.6 * S;
  rRect(x, y, w, h, radius);
  ctx.stroke();

  ctx.strokeStyle = grp.stitch;
  ctx.lineWidth = 1.4 * S;
  ctx.setLineDash([3.2 * S, 3 * S]);
  var si = band + 1.2 * S;
  rRect(x + si, y + si, w - si * 2, h - si * 2, radius * 0.6);
  ctx.stroke();
  ctx.setLineDash([]);

  // The slider sits on the box's lower seam — big enough to be the
  // thing you notice, low enough not to hide the marbles — and runs
  // off to the side once tapped. The fabric colour alone pairs it
  // with its Cover, so there is no badge or counter to read.
  if (pull < 1) {
    var ease = pull * (2 - pull);
    drawZipSlider(x + w / 2 - (w * 0.5 - band * 0.8) * ease, y + h * 0.72,
      { x: -1, y: 0 }, w * 0.44, tick);
  }

  ctx.restore();
}

// ── Editor-side validation ─────────────────────────────────────
//
// The Cover never gates its own opening condition and the trigger
// is a single tap, so there is no runtime state that can become
// partially unreachable. Solvability is an authoring problem, so
// it is caught here instead.

function validateDetonatorSetup(grid, cols, rows) {
  var warnings = [];
  var groups = {};
  var g, i;

  function grp(gi) {
    if (!groups[gi]) groups[gi] = { cells: [], boxes: 0, dets: [] };
    return groups[gi];
  }

  for (i = 0; i < grid.length; i++) {
    var cell = grid[i];
    if (!cell) continue;
    if (cell.cover) {
      var e = grp(cell.cover);
      e.cells.push(i);
      if (cell.ci >= 0 && !cell.wall && !cell.tunnel) e.boxes++;
    }
    if (cell.detonator) grp(cell.detonator).dets.push(i);
  }

  // Which Covers can ever be opened? Fixpoint over "the Zip Box
  // is not itself locked behind a Cover that is still shut".
  var openable = {};
  var changed = true;
  while (changed) {
    changed = false;
    for (g in groups) {
      if (openable[g]) continue;
      var e2 = groups[g];
      if (e2.cells.length === 0 || e2.dets.length !== 1) continue;
      var over = grid[e2.dets[0]] ? grid[e2.dets[0]].cover : 0;
      if (!over || openable[over]) { openable[g] = true; changed = true; }
    }
  }

  for (g in groups) {
    var en = groups[g];
    var tag = 'Cover ' + g;

    if (en.cells.length === 0) {
      if (en.dets.length) warnings.push('Zip Box ' + g + ' has no Cover painted');
      continue;
    }
    if (en.cells.length < 2) warnings.push(tag + ' needs at least 2 cells');
    if (!cellsAreContiguous(en.cells, cols, rows)) {
      warnings.push(tag + ' is split into separate patches — one Cover must be a single connected area');
    }
    if (en.boxes === 0) warnings.push(tag + ' has no box underneath');
    if (en.dets.length === 0) warnings.push(tag + ' has no Zip Box to open it');
    if (en.dets.length > 1) warnings.push(tag + ' has ' + en.dets.length + ' Zip Boxes — only 1 is allowed');

    if (en.dets.length === 1) {
      var dCell = grid[en.dets[0]];
      if (dCell && dCell.cover === parseInt(g, 10)) {
        warnings.push('Zip Box ' + g + ' sits under its own Cover — it can never be tapped');
      } else if (!openable[g]) {
        warnings.push(tag + ' can never open — its Zip Box is locked behind a Cover that needs this one first');
      } else if (!detCellReachable(grid, en.dets[0], cols, rows, openable)) {
        warnings.push('Zip Box ' + g + ' has no possible route to the bottom of the grid — it can never be tapped');
      }
    }
  }

  return warnings;
}

function cellsAreContiguous(cells, cols, rows) {
  if (cells.length <= 1) return true;
  var set = {};
  for (var i = 0; i < cells.length; i++) set[cells[i]] = true;
  var seen = {}, q = [cells[0]], head = 0, n = 1;
  seen[cells[0]] = true;
  while (head < q.length) {
    var cur = q[head++];
    var r = Math.floor(cur / cols), c = cur % cols;
    var nb = [];
    if (r > 0) nb.push((r - 1) * cols + c);
    if (r < rows - 1) nb.push((r + 1) * cols + c);
    if (c > 0) nb.push(r * cols + (c - 1));
    if (c < cols - 1) nb.push(r * cols + (c + 1));
    for (var k = 0; k < nb.length; k++) {
      if (set[nb[k]] && !seen[nb[k]]) { seen[nb[k]] = true; n++; q.push(nb[k]); }
    }
  }
  return n === cells.length;
}

// Optimistic reachability: boxes can deplete, so only walls,
// tunnels and never-opening Covers are treated as permanent.
function detCellReachable(grid, detIdx, cols, rows, openable) {
  function passable(i) {
    var c = grid[i];
    if (!c) return true;
    if (c.wall || c.tunnel) return false;
    if (c.cover && !openable[c.cover]) return false;
    return true;
  }
  var seen = {}, q = [], head = 0;
  for (var bc = 0; bc < cols; bc++) {
    var bi = (rows - 1) * cols + bc;
    if (passable(bi)) { seen[bi] = true; q.push(bi); }
  }
  while (head < q.length) {
    var cur = q[head++];
    if (cur === detIdx) return true;
    var r = Math.floor(cur / cols), c2 = cur % cols;
    var nb = [];
    if (r > 0) nb.push((r - 1) * cols + c2);
    if (r < rows - 1) nb.push((r + 1) * cols + c2);
    if (c2 > 0) nb.push(r * cols + (c2 - 1));
    if (c2 < cols - 1) nb.push(r * cols + (c2 + 1));
    for (var k = 0; k < nb.length; k++) {
      if (!seen[nb[k]] && passable(nb[k])) { seen[nb[k]] = true; q.push(nb[k]); }
    }
  }
  return !!seen[detIdx];
}
