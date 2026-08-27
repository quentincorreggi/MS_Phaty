// ============================================================
// pixelart.js — "Pixel Art Customers" mechanic
// ------------------------------------------------------------
// Replaces the 4 sort columns with a pixel-art picture 16 wide.
// Each colored pixel is a one-slot customer: when a matching
// marble reaches its lane on the belt, the pixel is served and
// disappears. Clear every pixel = complete the drawing = win.
//
// The camera is zoomed OUT for these levels (cameraZoom < 1) so
// a large chunk of the drawing is visible under the belt.
// ============================================================

var PX_W = 16;              // picture is always 16 pixels wide
var PX_MATCH_WINDOW = 0.02; // belt-position tolerance for a lane
var PX_ZOOM = 0.85;         // mild camera zoom-out for pixel levels (keeps
                            // proportions close to the original game)

// ── Normalize a raw pixelArt definition into {w,h,cells} ──
// cells is a flat row-major array of color index (0..NUM_COLORS-1)
// or null for an empty pixel.
function normalizePixelArt(pa) {
  if (!pa) return null;
  var w = PX_W;
  var cells = (pa.cells || []).slice();
  var h = pa.h || Math.max(1, Math.ceil(cells.length / w));
  var out = [];
  for (var i = 0; i < w * h; i++) {
    var v = cells[i];
    if (v === null || v === undefined || v < 0 || v >= NUM_COLORS) out.push(null);
    else out.push(v | 0);
  }
  return { w: w, h: h, cells: out };
}

// ── Build the runtime pixel state from pixelArt ──
function buildPixelState() {
  pixelCells = [];
  pixelClogT = 0;
  pixelRemainingByColor = [];
  for (var c = 0; c < NUM_COLORS; c++) pixelRemainingByColor.push(0);
  if (!pixelArt) return;
  for (var i = 0; i < pixelArt.cells.length; i++) {
    var ci = pixelArt.cells[i];
    if (ci === null) { pixelCells.push(null); continue; }
    pixelCells.push({ ci: ci, served: false, reserved: false, popT: 0, shineT: 0, appearT: 0 });
    pixelRemainingByColor[ci]++;
  }
}

// ── Count colored pixels per color ──
function pixelColorCounts() {
  var counts = [];
  for (var c = 0; c < NUM_COLORS; c++) counts.push(0);
  if (!pixelArt) return counts;
  for (var i = 0; i < pixelArt.cells.length; i++) {
    var ci = pixelArt.cells[i];
    if (ci !== null) counts[ci]++;
  }
  return counts;
}

// ── Auto-generate a 7x7 stock grid that supplies enough marbles ──
// Returns an array of length 49: null or { ci }. Boxes are packed
// from the bottom row upward so each newly tappable row opens the
// one above it (standard path-to-bottom reveal behaviour).
function buildPixelStockGrid(counts, mrbPerBox) {
  // Every box always holds a FULL mrbPerBox (9) marbles — never a partial
  // box. We place ceil(need / 9) boxes per colour, so the supply covers
  // the picture with a small surplus. That surplus is the safety margin:
  // if a marble is ever lost to a funnel jam, another can still fill the
  // pixel, and once a colour is fully served its leftover marbles retire
  // themselves at the belt (see updatePixelMatching), so nothing clogs.
  // Group the boxes by colour...
  var groups = [];
  for (var c = 0; c < NUM_COLORS; c++) {
    var n = Math.ceil(counts[c] / mrbPerBox);
    if (n > 0) {
      var g = [];
      for (var k = 0; k < n; k++) g.push(c);
      groups.push(g);
    }
  }
  shuffle(groups); // random left-to-right order of the colours
  // ...then interleave them round-robin so EVERY colour is reachable from
  // the start (the bottom row holds one box of each colour). Otherwise a
  // random shuffle can bury a colour deep in the stock, leaving its pixels
  // exposed at a pole with no marble of that colour available for a while.
  var boxes = [];
  var again = true;
  while (again) {
    again = false;
    for (var gi = 0; gi < groups.length; gi++) {
      if (groups[gi].length) { boxes.push(groups[gi].shift()); again = true; }
    }
  }
  var grid = [];
  for (var i = 0; i < 49; i++) grid.push(null);
  // Fill bottom-up, left-to-right within each row.
  var placed = 0;
  for (var row = 6; row >= 0 && placed < boxes.length; row--) {
    for (var col = 0; col < 7 && placed < boxes.length; col++) {
      grid[row * 7 + col] = { ci: boxes[placed], count: mrbPerBox };
      placed++;
    }
  }
  return grid;
}

// ── Pixel-grid geometry (called at the end of computeLayout) ──
function computePixelLayout() {
  if (!pixelArt) return;
  var rows = pixelArt.h;

  // The camera is only mildly zoomed out, so the stock/funnel/belt keep
  // roughly their original proportions. The picture sits under the belt
  // at about the play-area width (like the classic sort area) rather than
  // filling the whole screen.
  var topGap = 18 * S;
  var botMargin = 14 * S;
  var areaTop = L.beltBotY + topGap;
  var availH = Math.max(40, H - areaTop - botMargin);
  // Board width tracks the game column width so the ratio stays close to
  // the original layout.
  var maxBoardW = Math.min(W * 0.92, L.gameW * 1.12);

  var size = Math.min(maxBoardW / PX_W, availH / rows);
  size = Math.max(4, size);

  var gridW = size * PX_W;
  var gridH = size * rows;

  L.pxSize = size;
  L.pxCols = PX_W;
  L.pxRows = rows;
  L.pxLeft = L.cx - gridW / 2;
  L.pxTop = areaTop + (availH - gridH) / 2;
  if (L.pxTop < areaTop) L.pxTop = areaTop;

  // Map each column to the nearest belt-path point (bottom run).
  L.pxBeltT = [];
  for (var c = 0; c < PX_W; c++) {
    var colCx = L.pxLeft + (c + 0.5) * size;
    var best = 0, bd = Infinity;
    for (var j = 0; j < beltPath.length; j++) {
      var dx = beltPath[j].x - colCx, dy = beltPath[j].y - L.beltBotY;
      var d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = j; }
    }
    L.pxBeltT.push(best / beltPath.length);
  }
}

// ── Pole position: the topmost still-open pixel in a column (nearest the
// belt). Exactly like the front slot of a classic sort column — a marble
// can ONLY serve this pixel, and only if it is the same colour. A marble
// may never reach a matching pixel that sits behind a pixel of another
// colour. Reserved pixels (a jumper already inbound) advance the pole. ──
function pixelActiveRow(c) {
  for (var r = 0; r < L.pxRows; r++) {
    var cell = pixelCells[r * PX_W + c];
    // A reserved pixel (marble already inbound) is STILL the pole until it
    // actually lands, so nothing behind it can be served first.
    if (cell && !cell.served) return r;
  }
  return -1;
}

// ── Belt → pixel matching + cleanup of marbles with no target ──
function updatePixelMatching() {
  for (var si = 0; si < BELT_SLOTS; si++) {
    var slot = beltSlots[si];
    if (slot.marble < 0) continue;
    var ci = slot.marble;

    // Blocker marbles have no home in a picture; let them ride.
    if (ci === BLOCKER_CI) continue;

    // Among the lanes the marble is currently passing, find a column whose
    // POLE pixel (top of the column) matches this marble's colour. Closest
    // belt alignment wins. Pixels behind the pole are never reachable.
    var slotT = getSlotT(si);
    var bestC = -1, bestRow = -1, bestDiff = Infinity;
    for (var c = 0; c < PX_W; c++) {
      var r = pixelActiveRow(c);
      if (r < 0) continue;
      var pole = pixelCells[r * PX_W + c];
      if (pole.reserved) continue;          // this column's front is already being served
      if (pole.ci !== ci) continue;         // only a same-colour marble serves the front
      var diff = Math.abs(slotT - L.pxBeltT[c]);
      diff = Math.min(diff, 1 - diff);
      if (diff >= PX_MATCH_WINDOW) continue;
      if (diff < bestDiff) { bestDiff = diff; bestC = c; bestRow = r; }
    }

    if (bestC >= 0) {
      var cellIdx = bestRow * PX_W + bestC;
      var cell = pixelCells[cellIdx];
      cell.reserved = true;
      var pos = getSlotPos(si);
      jumpers.push({ ci: ci, slotIdx: si, startX: pos.x, startY: pos.y,
        pixel: true, cellIdx: cellIdx, targetCol: 0, targetSlot: 0, t: 0 });
      slot.marble = -1;
      continue;
    }

    // No matching pixel remains for this color → retire the marble
    // once it loops back near the belt entry, keeping the belt tidy.
    if (pixelRemainingByColor[ci] <= 0) {
      var entryT = getBeltEntryT();
      var ed = Math.abs(slotT - entryT); ed = Math.min(ed, 1 - ed);
      if (ed < 0.02) {
        var dpos = getSlotPos(si);
        spawnBurst(dpos.x, dpos.y, COLORS[ci].light, 5);
        slot.marble = -1;
      }
    }
  }

  declogBelt();
}

// ── Anti-clog valve ─────────────────────────────────────────────────
// With the strict pole rule the belt can jam: it fills with marbles whose
// colour isn't exposed at any pole while the colour that IS needed sits
// stuck in the funnel behind them. When that happens we send one belt
// marble back up into the funnel, freeing a slot so a useful marble can
// take its place. No marble is destroyed, the pole rule is untouched, and
// colours keep cycling until a servable one reaches the belt.
var pixelClogT = 0;
function declogBelt() {
  // Colours currently exposed at an (unreserved) pole.
  var poleColor = [];
  for (var pc = 0; pc < NUM_COLORS; pc++) poleColor.push(false);
  for (var c = 0; c < PX_W; c++) {
    var pr = pixelActiveRow(c);
    if (pr >= 0) { var pcell = pixelCells[pr * PX_W + c]; if (!pcell.reserved) poleColor[pcell.ci] = true; }
  }
  var emptySlots = 0, servable = false;
  for (var k = 0; k < BELT_SLOTS; k++) {
    var mk = beltSlots[k].marble;
    if (mk < 0) { emptySlots++; }
    else if (mk !== BLOCKER_CI && poleColor[mk]) servable = true;
  }
  if (emptySlots > 0 || servable) { pixelClogT = 0; return; }

  // Truly clogged: belt full, nothing on it can serve.
  pixelClogT++;
  if (pixelClogT < 20) return;
  pixelClogT = 0;

  // Pick the belt marble nearest the belt entry to evict.
  var entryT = getBeltEntryT();
  var worst = -1, wd = Infinity;
  for (var k2 = 0; k2 < BELT_SLOTS; k2++) {
    if (beltSlots[k2].marble < 0) continue;
    var t = getSlotT(k2);
    var d = Math.abs(t - entryT); d = Math.min(d, 1 - d);
    if (d < wd) { wd = d; worst = k2; }
  }
  if (worst < 0) return;
  var rci = beltSlots[worst].marble;
  var pos = getSlotPos(worst);

  // If a servable-colour marble is waiting in the funnel, promote it
  // straight onto the freed slot — deterministic progress. Otherwise just
  // recirculate the evicted marble so colours keep churning (and so the
  // player is prompted to release a colour that is actually at a pole).
  var fm = -1;
  for (var mi = 0; mi < physMarbles.length; mi++) {
    var pm = physMarbles[mi];
    if (pm.ci !== BLOCKER_CI && poleColor[pm.ci]) { fm = mi; break; }
  }
  if (fm >= 0) {
    beltSlots[worst].marble = physMarbles[fm].ci;
    beltSlots[worst].arriveAnim = 0.6;
    physMarbles.splice(fm, 1);
    sfx.drop();
  } else {
    beltSlots[worst].marble = -1;
  }
  physMarbles.push({
    x: L.funnelCx + (Math.random() - 0.5) * L.funnelOpenW,
    y: L.funnelTop + 30 * S,
    vx: (Math.random() - 0.5) * 2 * S, vy: 1.5 * S,
    ci: rci, r: getMR(), spawnT: 0, lowFunnelT: 0
  });
  spawnBurst(pos.x, pos.y, COLORS[rci].light, 4);
}

// ── Called when a pixel jumper lands ──
function servePixel(cellIdx, ci) {
  var cell = pixelCells[cellIdx];
  if (!cell || cell.served) return;
  cell.served = true;
  cell.popT = 1;
  cell.shineT = 1;
  if (pixelRemainingByColor[ci] > 0) pixelRemainingByColor[ci]--;
  sfx.sort();
  var c = cellIdx % PX_W, r = (cellIdx / PX_W) | 0;
  var px = L.pxLeft + (c + 0.5) * L.pxSize;
  var py = L.pxTop + (r + 0.5) * L.pxSize;
  spawnBurst(px, py, COLORS[ci].fill, 10);
  checkWin();
}

// ── Advance pixel cell animations ──
function tickPixels() {
  for (var i = 0; i < pixelCells.length; i++) {
    var cell = pixelCells[i];
    if (!cell) continue;
    if (cell.popT > 0) cell.popT = Math.max(0, cell.popT - 0.05);
    if (cell.shineT > 0) cell.shineT = Math.max(0, cell.shineT - 0.03);
    if (cell.appearT > 0) cell.appearT = Math.max(0, cell.appearT - 0.04);
  }
}

// ── Are all pixels served? ──
function pixelArtComplete() {
  for (var i = 0; i < pixelCells.length; i++) {
    if (pixelCells[i] && !pixelCells[i].served) return false;
  }
  return pixelCells.length > 0;
}

// ============================================================
// Preset pictures — every cell is filled (a picture must be a full
// rectangle: subject + background), generated to fit 16 wide.
// ============================================================

// Heart (crimson) with a pink outline on a blue background — 3 colours.
function pixelPresetHeart() {
  var w = PX_W, h = 12;
  var isHeart = [];
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var fx = (x - 7.5) / 6.2;
    var fy = (7.0 - y) / 5.0;
    var v = Math.pow(fx * fx + fy * fy - 1, 3) - fx * fx * fy * fy * fy;
    isHeart.push(v <= 0);
  }
  var cells = [];
  for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) {
    if (isHeart[y2 * w + x2]) { cells.push(7); continue; }
    var edge = false;
    for (var dy = -1; dy <= 1 && !edge; dy++) for (var dx = -1; dx <= 1; dx++) {
      var nx = x2 + dx, ny = y2 + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (isHeart[ny * w + nx]) { edge = true; break; }
    }
    cells.push(edge ? 0 : 1); // pink outline, else blue background
  }
  return { w: w, h: h, cells: cells };
}

// Smiley: yellow face, purple features, blue background — 3 colours.
function pixelPresetSmiley() {
  var w = PX_W, h = 12, cells = [];
  var cx = 7.5, cy = 5.6, R = 5.7;
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var dx = x - cx, dy = y - cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    var ci = 1; // blue background
    if (d <= R) {
      ci = 3; // yellow face
      if ((Math.abs(dx + 2.3) < 1.0 || Math.abs(dx - 2.3) < 1.0) && dy > -2.6 && dy < -0.4) ci = 4;
      var md = Math.sqrt(dx * dx + (dy - 0.3) * (dy - 0.3));
      if (md > 2.2 && md < 3.2 && dy > 1.0) ci = 4;
    }
    cells.push(ci);
  }
  return { w: w, h: h, cells: cells };
}

// Mushroom: crimson cap, pink spots, yellow stem, green background — 4 colours.
function pixelPresetMushroom() {
  var w = PX_W, h = 12, cells = [];
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var dx = x - 7.5, dyc = y - 4.6;
    var ci = 2; // green background
    var cap = (dx * dx) / (6.8 * 6.8) + (dyc * dyc) / (4.8 * 4.8);
    if (cap <= 1 && y <= 6) {
      ci = 7; // crimson cap
      var s1 = Math.sqrt((x - 4.2) * (x - 4.2) + (y - 3.2) * (y - 3.2));
      var s2 = Math.sqrt((x - 10.8) * (x - 10.8) + (y - 3.6) * (y - 3.6));
      var s3 = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 1.7) * (y - 1.7));
      if (s1 < 1.5 || s2 < 1.5 || s3 < 1.3) ci = 0; // pink spots
    }
    if (y >= 6 && y <= 11 && Math.abs(dx) <= 2.6 - (y - 6) * 0.12) ci = 3; // yellow stem
    cells.push(ci);
  }
  return { w: w, h: h, cells: cells };
}

var PIXEL_PRESETS = {
  heart: pixelPresetHeart,
  smiley: pixelPresetSmiley,
  mushroom: pixelPresetMushroom
};
