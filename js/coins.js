// ============================================================
// coins.js — Gold coin flight (golden customer payout)
// Coins arc from a sort-box to the coin-bag HUD via cubic ease.
// Not physics; never enters physMarbles[].
// ============================================================

function spawnCoinFlight(fromX, fromY, count) {
  if (typeof L.coinBagX !== 'number') return;
  count = count || COINS_PER_GOLDEN;
  for (var i = 0; i < count; i++) {
    var jitter = (Math.random() - 0.5) * 18 * S;
    coins.push({
      sx: fromX + jitter, sy: fromY + jitter * 0.5,
      tx: L.coinBagX, ty: L.coinBagY,
      x: fromX, y: fromY,
      t: 0,
      dur: COIN_FLIGHT_MS + Math.random() * 120,
      delay: i * 32,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() * 0.3 + 0.15) * (Math.random() < 0.5 ? -1 : 1),
      arcH: -(70 + Math.random() * 40) * S
    });
  }
}

function tickCoins() {
  if (!coins.length) return;
  var dt = 1000 / 60;
  for (var i = coins.length - 1; i >= 0; i--) {
    var c = coins[i];
    if (c.delay > 0) { c.delay -= dt; continue; }
    c.t += dt / c.dur;
    if (c.t >= 1) {
      addCoinToBag();
      coins.splice(i, 1);
      continue;
    }
    var u = c.t;
    var e = u * u * (3 - 2 * u); // smoothstep
    c.x = c.sx + (c.tx - c.sx) * e;
    var arc = c.arcH * Math.sin(Math.PI * u);
    c.y = c.sy + (c.ty - c.sy) * e + arc;
    c.rot += c.rotV;
  }
}

function drawCoins() {
  if (!coins.length) return;
  for (var i = 0; i < coins.length; i++) {
    var c = coins[i];
    if (c.delay > 0) continue;
    var r = 9 * S;
    var thin = Math.abs(Math.cos(c.rot));
    ctx.save();
    ctx.translate(c.x, c.y);
    // glow
    ctx.shadowColor = GOLD_COLOR.glow;
    ctx.shadowBlur = 12 * S;
    ctx.fillStyle = GOLD_COLOR.fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * Math.max(0.25, thin), r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // rim
    ctx.lineWidth = 1.5 * S;
    ctx.strokeStyle = GOLD_COLOR.dark;
    ctx.stroke();
    // $ etched (only when face-on enough)
    if (thin > 0.55) {
      ctx.strokeStyle = GOLD_COLOR.dark;
      ctx.lineWidth = 1.6 * S;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.55);
      ctx.lineTo(0, r * 0.55);
      ctx.moveTo(-r * 0.32, -r * 0.28);
      ctx.bezierCurveTo(-r * 0.4, -r * 0.5, r * 0.4, -r * 0.5, r * 0.32, -r * 0.05);
      ctx.bezierCurveTo(-r * 0.4, r * 0.05, r * 0.4, r * 0.5, -r * 0.32, r * 0.28);
      ctx.stroke();
    }
    ctx.restore();
  }
}
