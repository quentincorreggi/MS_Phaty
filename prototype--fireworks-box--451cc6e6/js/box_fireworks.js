// ============================================================
// box_fireworks.js — Fireworks box type
// Auto-triggers when 3 adjacent boxes are opened.
// Launches 3 rockets that force-open 3 random boxes.
// Visual rendering handled specially in drawStock().
// ============================================================

registerBoxType('fireworks', {
  label: 'Fireworks',
  editorColor: '#1A1A3E',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    // Rendering is handled by drawFireworksBoxVisual in rendering.js
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    // Rendering is handled by drawFireworksBoxVisual in rendering.js
  },

  editorCellStyle: function (ci) {
    return { background: 'linear-gradient(135deg,#2A2A5E,#0D0D2E)', borderColor: '#B8860B' };
  },

  editorCellHTML: function (ci) {
    return '<span style="color:#FFD700;font-size:14px;line-height:1">&#10022;</span>';
  }
});
