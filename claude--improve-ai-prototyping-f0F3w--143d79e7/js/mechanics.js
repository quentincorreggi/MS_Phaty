// ============================================================
// mechanics.js — Game-wide mechanic registration system
// ============================================================
//
// For mechanics that aren't tied to a single box type (e.g.
// blocker belt collection, time-pressure mode).
//
// Usage:
//   registerMechanic('myMechanic', {
//     init:    function() {},            // called once at game start
//     update:  function(tick) {},        // called each frame
//     render:  function(ctx, phase) {},  // 'pre-stock', 'post-belt', 'post-sort'
//     onTap:   function(idx, box) {},    // return false to consume tap
//   });
// ============================================================

var Mechanics = {};
var MechanicOrder = [];

function registerMechanic(id, def) {
  def.id = id;
  Mechanics[id] = def;
  MechanicOrder.push(id);
}

// Called from game.js frame() at specified render phases
function _dispatchMechanicRender(phase) {
  for (var mi = 0; mi < MechanicOrder.length; mi++) {
    var mech = Mechanics[MechanicOrder[mi]];
    if (mech.render) mech.render(ctx, phase);
  }
}
