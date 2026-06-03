// ============================================================
// halfmerge.js — Half-marble combining on the belt
// A belt slot whose `half` flag is set holds a half-marble. It
// cannot sort. When two same-color halves are riding the belt at
// once, they combine: one slides into the other, leaving a single
// full marble that sorts normally.
//
// Update hook: updateHalfMerges() — called each frame from game.js
// Draw hook:   drawHalfMerges()   — called each frame from game.js
// ============================================================

function updateHalfMerges() {
  // ── Advance in-flight merges ──
  for (var i = halfMerges.length - 1; i >= 0; i--) {
    var mg = halfMerges[i];
    mg.t += 0.06;
    if (mg.t >= 1) {
      var slot = beltSlots[mg.targetSlot];
      if (slot && slot.marble === mg.ci && slot.half) {
        // The two halves are now whole — promote to a full marble.
        slot.half = false;
        slot.merging = false;
        slot.arriveAnim = 0.6;
        var pos = getSlotPos(mg.targetSlot);
        spawnBurst(pos.x, pos.y, COLORS[mg.ci].light, 12);
        if (sfx.merge) sfx.merge();
      } else if (slot) {
        slot.merging = false;
      }
      halfMerges.splice(i, 1);
    }
  }

  // ── Pair up available halves by color ──
  var byColor = {};
  for (var s = 0; s < BELT_SLOTS; s++) {
    var sl = beltSlots[s];
    if (sl.marble < 0 || !sl.half || sl.merging) continue;
    if (!byColor[sl.marble]) byColor[sl.marble] = [];
    byColor[sl.marble].push(s);
  }
  for (var key in byColor) {
    var list = byColor[key];
    while (list.length >= 2) {
      var src = list.pop();   // slides away
      var tgt = list.pop();   // becomes the full marble
      var ci = beltSlots[tgt].marble;
      var srcPos = getSlotPos(src);
      // Free the source slot immediately so the belt ignores it.
      beltSlots[src].marble = -1;
      beltSlots[src].half = false;
      beltSlots[src].merging = false;
      // Hold the target as a (still un-sortable) half until the slide
      // finishes; `merging` keeps it from being re-paired or sorted.
      beltSlots[tgt].merging = true;
      halfMerges.push({ ci: ci, fromX: srcPos.x, fromY: srcPos.y, targetSlot: tgt, t: 0 });
    }
  }
}

function drawHalfMerges() {
  var slotR = 8 * S;
  for (var i = 0; i < halfMerges.length; i++) {
    var mg = halfMerges[i];
    var tp = getSlotPos(mg.targetSlot);
    var t = mg.t;
    var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    var x = mg.fromX + (tp.x - mg.fromX) * e;
    var y = mg.fromY + (tp.y - mg.fromY) * e;
    if (tick % 4 === 0) {
      particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 0.6 * S, vy: (Math.random() - 0.5) * 0.6 * S,
        r: (1.5 + Math.random() * 2) * S, color: COLORS[mg.ci].light, life: 0.5, decay: 0.05, grav: false });
    }
    drawHalfMarble(x, y, slotR * 0.8 * cal.marble.s, mg.ci, 1);
  }
}
