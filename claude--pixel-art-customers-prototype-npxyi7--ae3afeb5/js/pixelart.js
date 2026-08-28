// ============================================================
// pixelart.js — "Pixel Art Customers" mechanic
// ------------------------------------------------------------
// The 4 sort columns are replaced by a pixel-art picture 16 wide.
// Each colored pixel is a one-slot customer. The FILLING uses the
// exact same rule as the normal game's sort columns:
//
//   * Each of the 16 pixel columns behaves like one sort column.
//   * Only the FRONT customer of a column (its topmost still-open
//     pixel) can be filled — never one behind it.
//   * A marble fills that front only if it is the same colour AND
//     it is passing the column's belt position (same 0.015 window
//     the normal belt→sort matching uses).
//
// There is no special "valve", no re-routing, no teleporting — it
// is the classic mechanic generalised from 4 columns to 16.
//
// The camera is mildly zoomed out so the picture fits under the belt.
// ============================================================

var PX_W = 16;              // picture is always 16 pixels wide
var PX_MATCH_WINDOW = 0.015; // belt-position tolerance (same as classic sort)
var PX_ZOOM = 0.85;         // mild camera zoom-out (keeps proportions close
                            // to the original game)

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
  pixelRemainingByColor = [];
  for (var c = 0; c < NUM_COLORS; c++) pixelRemainingByColor.push(0);
  if (!pixelArt) return;
  for (var i = 0; i < pixelArt.cells.length; i++) {
    var ci = pixelArt.cells[i];
    if (ci === null) { pixelCells.push(null); continue; }
    pixelCells.push({ ci: ci, served: false, reserved: false, popT: 0, shineT: 0 });
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

// ── Auto-generate a 7x7 stock grid that supplies the marbles ──
// Every box holds a full MRB_PER_BOX (9) marbles. ceil(count/9) boxes
// per colour, interleaved round-robin so every colour is reachable from
// the start (the bottom row holds one box of each colour), then placed
// bottom-up so each cleared row opens the one above it.
function buildPixelStockGrid(counts, mrbPerBox) {
  var groups = [];
  for (var c = 0; c < NUM_COLORS; c++) {
    var n = Math.ceil(counts[c] / mrbPerBox);
    if (n > 0) {
      var g = [];
      for (var k = 0; k < n; k++) g.push(c);
      groups.push(g);
    }
  }
  shuffle(groups);
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
// The 16 columns are laid out under the belt's bottom straight run, so
// each column maps to a distinct belt point directly above it — exactly
// how the classic 4 sort columns sit under the belt.
function computePixelLayout() {
  if (!pixelArt) return;
  var rows = pixelArt.h;

  var beltInnerLeft = L.beltLeft + L.uR;
  var beltInnerRight = L.beltRight - L.uR;
  var straightW = Math.max(40, beltInnerRight - beltInnerLeft);

  var topGap = 16 * S;
  var botMargin = 14 * S;
  var areaTop = L.beltBotY + topGap;
  var availH = Math.max(40, H - areaTop - botMargin);

  // Square pixels; width follows the belt straight (clean 1:1 lane map),
  // clamped so the whole picture fits vertically.
  var size = Math.min(straightW / PX_W, availH / rows);
  size = Math.max(4, size);

  var gridW = size * PX_W;
  var gridH = size * rows;

  L.pxSize = size;
  L.pxCols = PX_W;
  L.pxRows = rows;
  L.pxLeft = L.beltCx - gridW / 2;
  L.pxTop = areaTop + (availH - gridH) / 2;
  if (L.pxTop < areaTop) L.pxTop = areaTop;

  // Each column → nearest belt point (its "sort belt T"), exactly like
  // L.sortBeltT is built for the 4 classic columns.
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

// ── Front customer of a column: its topmost still-open (unserved) pixel.
// A reserved pixel (a marble already inbound) is still the front until it
// lands, so nothing behind it can ever be served first. ──
function pixelActiveRow(c) {
  for (var r = 0; r < L.pxRows; r++) {
    var cell = pixelCells[r * PX_W + c];
    if (cell && !cell.served) return r;
  }
  return -1;
}

// ── Belt → pixel matching — identical rule to the classic belt → sort.
function updatePixelMatching() {
  for (var si = 0; si < BELT_SLOTS; si++) {
    var slot = beltSlots[si];
    if (slot.marble < 0) continue;
    var ci = slot.marble;
    if (ci === BLOCKER_CI) continue;          // blockers just ride the belt

    var slotT = getSlotT(si);
    var matched = false;
    for (var c = 0; c < PX_W; c++) {
      var r = pixelActiveRow(c);
      if (r < 0) continue;
      var cell = pixelCells[r * PX_W + c];
      if (cell.reserved) continue;            // front already has an inbound marble (cap 1)
      if (cell.ci !== ci) continue;           // only a same-colour marble fills the front
      var bt = L.pxBeltT[c];
      var diff = Math.abs(slotT - bt); diff = Math.min(diff, 1 - diff);
      if (diff < PX_MATCH_WINDOW) {
        var pos = getSlotPos(si);
        cell.reserved = true;
        jumpers.push({ ci: ci, slotIdx: si, startX: pos.x, startY: pos.y,
          pixel: true, cellIdx: r * PX_W + c, targetCol: 0, targetSlot: 0, t: 0 });
        slot.marble = -1;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // A leftover marble whose colour has no unserved pixel left anywhere
    // (only possible from the rounding surplus of full 9-marble boxes) is
    // retired at the belt entry so it does not ride forever. In an exact
    // level (like the showcase) this never happens.
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
}

// ── Called when a pixel jumper lands (front customer filled) ──
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
// Preset pictures for the editor — every cell filled (a picture is a
// full rectangle: subject + background), generated to fit 16 wide.
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
    cells.push(edge ? 0 : 1);
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
    var ci = 1;
    if (d <= R) {
      ci = 3;
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
    var ci = 2;
    var cap = (dx * dx) / (6.8 * 6.8) + (dyc * dyc) / (4.8 * 4.8);
    if (cap <= 1 && y <= 6) {
      ci = 7;
      var s1 = Math.sqrt((x - 4.2) * (x - 4.2) + (y - 3.2) * (y - 3.2));
      var s2 = Math.sqrt((x - 10.8) * (x - 10.8) + (y - 3.6) * (y - 3.6));
      var s3 = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 1.7) * (y - 1.7));
      if (s1 < 1.5 || s2 < 1.5 || s3 < 1.3) ci = 0;
    }
    if (y >= 6 && y <= 11 && Math.abs(dx) <= 2.6 - (y - 6) * 0.12) ci = 3;
    cells.push(ci);
  }
  return { w: w, h: h, cells: cells };
}

var PIXEL_PRESETS = {
  heart: pixelPresetHeart,
  smiley: pixelPresetSmiley,
  mushroom: pixelPresetMushroom
};
