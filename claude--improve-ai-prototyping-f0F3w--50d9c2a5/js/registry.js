// ============================================================
// registry.js — Box type registration system
// ============================================================
//
// Box types register: drawClosed, drawReveal, plus editor metadata.
// The core engine calls these without knowing about specific types.
//
// To add a new box type, create js/box_yourtype.js and call:
//   registerBoxType('yourtype', { ... });
//
// Required interface:
//   label        : string — display name in editor toolbar
//   editorColor  : string — button color in editor
//   drawClosed(ctx, x, y, w, h, ci, S, tick, idlePhase)
//   drawReveal(ctx, x, y, w, h, ci, S, phase, remaining, tick)
//   editorCellStyle(ci)   — returns { background, borderColor }
//   editorCellHTML(ci)     — returns inner HTML for editor grid cell
//
// Optional lifecycle hooks (engine calls these if present):
//   defaultState()                    — returns { key: val } merged onto stock objects
//   initBox(box, ci)                  — called per box of this type during initGame
//   isBoxTappable(idx, box)           — return false to block tapping
//   onTap(idx, box)                   — return false to skip default marble spawn
//   onAdjacentTap(idx, box, tappedIdx)— called on each neighbor when any box is tapped
//   updateBox(idx, box, tick)         — per-frame update
//   drawOverlay(ctx, x, y, w, h, box, S, tick) — drawn on top of box
//   drawOpenBox(ctx, x, y, w, h, box, S, tick) — custom revealed-state rendering
//   getMarbleCi(box, spawnIdx)        — return color index per spawned marble
//   countMarbles(box)                 — return { regular: N, special: N }
// ============================================================

var BoxTypes = {};
var BoxTypeOrder = []; // insertion order for toolbar

function registerBoxType(id, def) {
  def.id = id;
  BoxTypes[id] = def;
  BoxTypeOrder.push(id);
}

function getBoxType(id) {
  return BoxTypes[id] || BoxTypes[BoxTypeOrder[0]];
}

// ── Shared neighbor helper (used by handleTap dispatch, reveal, etc.) ──
function getNeighbors(idx) {
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  var result = [];
  if (row > 0)          result.push((row - 1) * L.cols + col);
  if (row < L.rows - 1) result.push((row + 1) * L.cols + col);
  if (col > 0)          result.push(row * L.cols + (col - 1));
  if (col < L.cols - 1) result.push(row * L.cols + (col + 1));
  return result;
}

// ── Apply box-type default state to a stock object ──
function applyBoxTypeDefaults(stockObj) {
  var bt = getBoxType(stockObj.boxType);
  if (bt && bt.defaultState) {
    var ds = bt.defaultState();
    for (var k in ds) stockObj[k] = ds[k];
  }
}
