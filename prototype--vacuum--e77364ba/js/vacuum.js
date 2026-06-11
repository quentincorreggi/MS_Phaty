// ============================================================
// vacuum.js — Vacuum mode: suction visuals + sound
// The whole prototype plays upside down: boxes at the bottom
// (thumb zone), consumers on top, marbles sucked UP through the
// inverted funnel. The layout flip lives in layout.js, inverted
// gravity in physics.js, top-edge reveal path in game.js. This
// file holds only the vacuum-specific presentation.
// ============================================================

// Animated air streams rising through the funnel toward the nozzle.
// Called from drawFunnel() while the funnel body is being drawn.
function drawVacuumStreams(exitL, exitR) {
  var n = 10;
  var dashH = 12 * S;
  ctx.save();
  ctx.lineWidth = 1.5 * S;
  ctx.lineCap = 'round';
  for (var i = 0; i < n; i++) {
    var seed = Math.sin(i * 12.9898) * 43758.5453;
    var frac = seed - Math.floor(seed);
    var phase = (tick * 0.006 * (0.7 + frac * 0.6) + frac) % 1;
    var y = L.funnelBot - phase * L.funnelH;
    // funnel narrows above the bend — squeeze the streams toward the nozzle
    var lo = L.funnelLeft, hi = L.funnelRight;
    if (y < L.funnelBendY) {
      var t = (L.funnelBendY - y) / (L.funnelBendY - L.funnelTop);
      lo = L.funnelLeft + (exitL - L.funnelLeft) * t;
      hi = L.funnelRight + (exitR - L.funnelRight) * t;
    }
    var x = lo + (0.08 + 0.84 * ((i + 0.5) / n)) * (hi - lo);
    var a = Math.sin(phase * Math.PI) * 0.22;
    ctx.strokeStyle = 'rgba(140,120,95,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(x, y + dashH / 2);
    ctx.lineTo(x, y - dashH / 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Soft glow on the nozzle, intensifying while marbles pass through.
function drawVacuumNozzleGlow(exitL, exitR) {
  var near = 0;
  for (var i = 0; i < physMarbles.length; i++) {
    if (physMarbles[i].y < L.funnelBendY) near++;
  }
  var glow = Math.min(0.45, 0.10 + Math.sin(tick * 0.05) * 0.03 + near * 0.08);
  var r = L.funnelOpenW * (1.1 + Math.min(near, 4) * 0.08);
  var g = ctx.createRadialGradient(L.funnelCx, L.funnelTop, 0, L.funnelCx, L.funnelTop, r);
  g.addColorStop(0, 'rgba(255,235,180,' + glow.toFixed(3) + ')');
  g.addColorStop(1, 'rgba(255,235,180,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(L.funnelCx, L.funnelTop, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Rising whoosh when a box releases its marbles into the vacuum.
function vacuumWhoosh() {
  tone(140, 0.45, 'sawtooth', 0.035, 950);
  setTimeout(function () { tone(320, 0.3, 'sine', 0.05, 1400); }, 70);
}
