// ============================================================
// registry.js — Mechanic registration system
// ============================================================
//
// Box types register: drawClosed, drawReveal, plus editor metadata.
// The core engine calls these without knowing about specific types.
//
// To add a new box type, create js/boxes/box_yourtype.js and call:
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
// Optional interface:
//   drawOpenOverlay(ctx, x, y, w, h, ci, S, tick)
//                  — drawn on top of the open (tappable) box, after
//                    the lip. Use it for an emblem that must stay
//                    visible in every box state.
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
