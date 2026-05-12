// ============================================================
// coinbag.js — Coin-bag HUD; receives coins, shows running total
// ============================================================

function initCoinBag(anyGolden) {
  coinBag.count = 0;
  coinBag.squishT = 0;
  coinBag.sparkleT = 0;
  coinBag.bobPhase = Math.random() * Math.PI * 2;
  coinBag.visible = !!anyGolden;
}

function updateCoinBag() {
  if (!coinBag.visible) return;
  coinBag.bobPhase += 0.04;
  if (coinBag.squishT > 0) coinBag.squishT = Math.max(0, coinBag.squishT - 0.06);
  if (coinBag.sparkleT > 0) coinBag.sparkleT = Math.max(0, coinBag.sparkleT - 0.03);
}

function addCoinToBag() {
  coinBag.count += 1;
  coinBag.squishT = 1;
  sfx.coinLand();
  if (coinBag.count % 10 === 0) {
    coinBag.sparkleT = 1;
    spawnBurst(L.coinBagX, L.coinBagY, GOLD_COLOR.light, 14);
  }
}

function drawCoinBag() {
  if (!coinBag.visible) return;
  var cx = L.coinBagX;
  var cy = L.coinBagY + Math.sin(coinBag.bobPhase) * 2 * S;
  var w = L.coinBagW;
  var h = L.coinBagH;

  // squish: vertical compress, horizontal expand
  var sq = coinBag.squishT;
  var sxS = 1 + sq * 0.15;
  var syS = 1 - sq * 0.12;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sxS, syS);

  // sack shadow
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 10 * S;
  ctx.shadowOffsetY = 4 * S;

  // sack body — pear-ish shape
  var bx = -w / 2;
  var by = -h / 2 + 12 * S;
  var bw = w;
  var bh = h - 12 * S;
  var grad = ctx.createLinearGradient(bx, by, bx, by + bh);
  grad.addColorStop(0, '#A0805C');
  grad.addColorStop(0.5, '#8C6A45');
  grad.addColorStop(1, '#5C4528');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(bx + bw * 0.25, by);
  ctx.bezierCurveTo(bx, by + bh * 0.15, bx - 4 * S, by + bh * 0.85, bx + bw * 0.18, by + bh);
  ctx.lineTo(bx + bw * 0.82, by + bh);
  ctx.bezierCurveTo(bx + bw + 4 * S, by + bh * 0.85, bx + bw, by + bh * 0.15, bx + bw * 0.75, by);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // drawstring neck
  ctx.fillStyle = '#6B4F2E';
  rRect(bx + bw * 0.18, by - 6 * S, bw * 0.64, 10 * S, 3 * S);
  ctx.fill();
  // tie ridges
  ctx.strokeStyle = '#3F2E1B';
  ctx.lineWidth = 1.2 * S;
  ctx.beginPath();
  for (var k = 0; k < 4; k++) {
    var lx = bx + bw * 0.22 + k * (bw * 0.18);
    ctx.moveTo(lx, by - 6 * S); ctx.lineTo(lx, by + 4 * S);
  }
  ctx.stroke();

  // gold $ tag
  ctx.fillStyle = GOLD_COLOR.fill;
  ctx.strokeStyle = GOLD_COLOR.dark;
  ctx.lineWidth = 1.5 * S;
  var tagR = 11 * S;
  ctx.beginPath(); ctx.arc(0, by + bh * 0.45, tagR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = GOLD_COLOR.dark;
  ctx.font = 'bold ' + Math.floor(14 * S) + "px 'Comic Sans MS', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', 0, by + bh * 0.46);

  // sparkle ring on threshold
  if (coinBag.sparkleT > 0) {
    ctx.globalAlpha = coinBag.sparkleT;
    ctx.strokeStyle = GOLD_COLOR.light;
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.arc(0, 0, (w * 0.6) * (1 + (1 - coinBag.sparkleT) * 0.3), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // count chip below bag
  ctx.save();
  var chipW = 50 * S, chipH = 22 * S;
  var chipX = cx - chipW / 2;
  var chipY = cy + h / 2 + 4 * S;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rRect(chipX, chipY, chipW, chipH, 11 * S);
  ctx.fill();
  ctx.fillStyle = GOLD_COLOR.fill;
  ctx.font = 'bold ' + Math.floor(13 * S) + "px 'Comic Sans MS', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('x ' + coinBag.count, cx, chipY + chipH / 2 + 1 * S);
  ctx.restore();
}
