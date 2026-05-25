// ============================================================
// darkroom.js — Level-wide dark mode with localized light sources
//   • Dark overlay covers whole canvas (cool blue-black)
//   • Revealed boxes emit radial light
//   • Sort column front rows emit tight elliptical light
//   • Belt + funnel fully lit
//   • Crescent moon top-right with subtle ambient lift
//   • Spooky decoration: ornate frame, flickering candles,
//     drifting fog, bat silhouettes
// ============================================================

var darkRoomMask = null;
var bats = [];        // active bat silhouettes
var batSpawnTimer = 0;

function isDarkRoomLevel() {
  if (!gameActive) return false;
  if (typeof currentLevel === 'undefined' || currentLevel < 0) return false;
  var lvl = LEVELS[currentLevel];
  return !!(lvl && lvl.darkRoom);
}

// Moon position — top-right
function moonPos() {
  return {
    cx: W - 80 * S,
    cy: 90 * S,
    r: 38 * S
  };
}

function drawDarkRoom() {
  if (!isDarkRoomLevel()) return;

  // Lazy-create / resize offscreen mask canvas
  if (!darkRoomMask || darkRoomMask.width !== W || darkRoomMask.height !== H) {
    darkRoomMask = document.createElement('canvas');
    darkRoomMask.width = W;
    darkRoomMask.height = H;
  }
  var mctx = darkRoomMask.getContext('2d');

  // 1. Fill mask with cool blue-black (slightly lifted from pure black for ambient feel)
  mctx.globalCompositeOperation = 'source-over';
  mctx.clearRect(0, 0, W, H);
  mctx.fillStyle = 'rgba(6,9,18,1)';
  mctx.fillRect(0, 0, W, H);

  // 2. Apply moon ambient lift FIRST (covers whole canvas)
  var mp = moonPos();
  mctx.globalCompositeOperation = 'destination-out';
  var ambR = Math.max(W, H) * 0.9;
  var amb = mctx.createRadialGradient(mp.cx, mp.cy, ambR * 0.05, mp.cx, mp.cy, ambR);
  amb.addColorStop(0, 'rgba(255,255,255,0.20)');
  amb.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  amb.addColorStop(1, 'rgba(255,255,255,0)');
  mctx.fillStyle = amb;
  mctx.fillRect(0, 0, W, H);

  // 2.5. Refill stock grid area with opaque dark to keep board pitch black
  //      (negates ambient lift inside the playing grid)
  mctx.globalCompositeOperation = 'source-over';
  var gPad = 4 * S;
  var gX = L.gameLeft - gPad;
  var gY = L.sy - gPad;
  var gW = L.gameW + gPad * 2;
  var gH = (L.bh + L.bg) * L.rows - L.bg + gPad * 2;
  mctx.fillStyle = 'rgba(6,9,18,1)';
  mctx.fillRect(gX, gY, gW, gH);

  // 3. Punch holes where light exists
  mctx.globalCompositeOperation = 'destination-out';

  // 2a. Revealed boxes — radial light
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || !b.revealed || b.empty || b.used) continue;
    if (b.isWall || b.isTunnel) continue;
    var cx = b.x + L.bw / 2;
    var cy = b.y + L.bh / 2;
    var r = L.bw * 1.05;
    var g = mctx.createRadialGradient(cx, cy, L.bw * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(cx, cy, r, 0, Math.PI * 2);
    mctx.fill();
  }

  // 2b. Sort columns — tight elliptical light on front row only
  for (var c = 0; c < sortCols.length; c++) {
    var topVis = -1;
    for (var r0 = 0; r0 < sortCols[c].length; r0++) {
      if (sortCols[c][r0].vis) { topVis = r0; break; }
    }
    if (topVis < 0) continue;
    var scx = L.sSx + c * (L.sBw + L.sColGap) + L.sBw / 2;
    var scy = getSortBoxY(c, 0) + L.sBh / 2;
    var sr = L.sBw * 0.85;
    mctx.save();
    mctx.translate(scx, scy);
    mctx.scale(1, 0.7);
    var sg = mctx.createRadialGradient(0, 0, L.sBw * 0.08, 0, 0, sr);
    sg.addColorStop(0, 'rgba(255,255,255,1)');
    sg.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = sg;
    mctx.beginPath();
    mctx.arc(0, 0, sr, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();
  }

  // 2c. Belt — soft-edged rounded rect via filter blur
  mctx.save();
  mctx.filter = 'blur(' + (18 * S).toFixed(1) + 'px)';
  mctx.fillStyle = 'rgba(255,255,255,1)';
  var bPadX = 14 * S, bPadY = 10 * S;
  roundRectPath(
    mctx,
    L.beltLeft - bPadX,
    L.beltTopY - bPadY,
    (L.beltRight - L.beltLeft) + bPadX * 2,
    (L.beltBotY - L.beltTopY) + bPadY * 2,
    20 * S
  );
  mctx.fill();
  mctx.restore();

  // 2d. Funnel — soft-edged
  mctx.save();
  mctx.filter = 'blur(' + (14 * S).toFixed(1) + 'px)';
  mctx.fillStyle = 'rgba(255,255,255,0.92)';
  var fPad = 4 * S;
  roundRectPath(
    mctx,
    L.funnelLeft - fPad,
    L.funnelTop - fPad,
    (L.funnelRight - L.funnelLeft) + fPad * 2,
    L.funnelH + fPad * 2,
    14 * S
  );
  mctx.fill();
  mctx.restore();

  // 2e. Back button — soft-edged
  mctx.save();
  mctx.filter = 'blur(' + (8 * S).toFixed(1) + 'px)';
  mctx.fillStyle = 'rgba(255,255,255,1)';
  roundRectPath(mctx, L.bkX - 2 * S, L.bkY - 2 * S, L.bkSize + 4 * S, L.bkSize + 4 * S, 10 * S);
  mctx.fill();
  mctx.restore();

  // 2g. Moon body — full erase (bright moon) + outer halo
  mctx.save();
  mctx.shadowColor = 'rgba(220,235,255,1)';
  mctx.shadowBlur = 40 * S;
  mctx.fillStyle = 'rgba(255,255,255,1)';
  mctx.beginPath();
  mctx.arc(mp.cx, mp.cy, mp.r, 0, Math.PI * 2);
  mctx.fill();
  mctx.restore();

  // 2h. Crescent bite — restore darkness on left side of moon disc
  mctx.globalCompositeOperation = 'source-over';
  mctx.fillStyle = 'rgba(6,9,18,1)';
  mctx.beginPath();
  mctx.arc(mp.cx - mp.r * 0.42, mp.cy - mp.r * 0.05, mp.r * 0.92, 0, Math.PI * 2);
  mctx.fill();

  // 3. Composite mask over scene
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkRoomMask, 0, 0);
  ctx.restore();

  // 3a. Moon tint — cool pale-blue color over moon body
  drawMoonTint(mp);

  // 3b. Stars — tiny scattered dots in dark sky
  drawStars();

  // 3c. Bats — silhouettes drifting across upper screen
  updateBats();
  drawBats();

  // 3d. Drifting fog at bottom — translucent wisps scrolling slowly
  drawFog();

  // 3e. Decorative frame around stock grid + candles
  drawDarkRoomFrame();

  // 4. Additive warm halo on box lights
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (var i2 = 0; i2 < stock.length; i2++) {
    var b2 = stock[i2];
    if (!b2 || !b2.revealed || b2.empty || b2.used) continue;
    if (b2.isWall || b2.isTunnel) continue;
    var hx = b2.x + L.bw / 2;
    var hy = b2.y + L.bh / 2;
    var hr = L.bw * 1.2;
    var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    hg.addColorStop(0, 'rgba(255,215,140,0.20)');
    hg.addColorStop(0.6, 'rgba(255,200,120,0.08)');
    hg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Moon tint: cool pale-blue layer over the bright disc
function drawMoonTint(mp) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  var g = ctx.createRadialGradient(mp.cx, mp.cy, 0, mp.cx, mp.cy, mp.r);
  g.addColorStop(0, 'rgba(225,235,250,1)');
  g.addColorStop(0.7, 'rgba(200,215,240,1)');
  g.addColorStop(1, 'rgba(180,200,230,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(mp.cx, mp.cy, mp.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Faint craters (just darker spots)
  ctx.save();
  ctx.fillStyle = 'rgba(120,135,160,0.25)';
  ctx.beginPath(); ctx.arc(mp.cx + mp.r * 0.25, mp.cy - mp.r * 0.15, mp.r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(mp.cx + mp.r * 0.10, mp.cy + mp.r * 0.30, mp.r * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(mp.cx + mp.r * 0.40, mp.cy + mp.r * 0.10, mp.r * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ── Stars: cheap deterministic scatter in upper region (skip near moon)
var starCache = null;
function drawStars() {
  if (!starCache || starCache.length === 0) {
    starCache = [];
    // Pseudo-random but stable: use a fixed seed sequence
    var seed = 12345;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 40; i++) {
      starCache.push({
        x: rnd(),
        y: rnd() * 0.45,
        r: 0.6 + rnd() * 1.0,
        phase: rnd() * Math.PI * 2
      });
    }
  }
  var mp = moonPos();
  ctx.save();
  for (var i = 0; i < starCache.length; i++) {
    var s = starCache[i];
    var sx = s.x * W;
    var sy = s.y * H;
    // Skip stars too close to moon (would clash with bright disc)
    var dx = sx - mp.cx, dy = sy - mp.cy;
    if (dx * dx + dy * dy < (mp.r * 2.5) * (mp.r * 2.5)) continue;
    var twinkle = 0.5 + 0.5 * Math.sin(tick * 0.04 + s.phase);
    ctx.fillStyle = 'rgba(220,230,255,' + (0.35 + 0.45 * twinkle).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(sx, sy, s.r * S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Bats: silhouettes drifting across upper screen
function updateBats() {
  batSpawnTimer--;
  if (batSpawnTimer <= 0 && bats.length < 3) {
    spawnBat();
    batSpawnTimer = 180 + Math.floor(Math.random() * 240); // 3-7s at 60fps
  }
  for (var i = bats.length - 1; i >= 0; i--) {
    var bat = bats[i];
    bat.x += bat.vx;
    bat.y += Math.sin(tick * 0.08 + bat.bob) * 0.3 * S;
    bat.flap += 0.35;
    if (bat.x < -50 * S || bat.x > W + 50 * S) {
      bats.splice(i, 1);
    }
  }
}

function spawnBat() {
  var fromLeft = Math.random() < 0.5;
  bats.push({
    x: fromLeft ? -30 * S : W + 30 * S,
    y: (50 + Math.random() * 200) * S,
    vx: (fromLeft ? 1 : -1) * (0.8 + Math.random() * 0.6) * S,
    flap: Math.random() * Math.PI * 2,
    bob: Math.random() * Math.PI * 2,
    size: (10 + Math.random() * 8) * S
  });
}

function drawBats() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  for (var i = 0; i < bats.length; i++) {
    var bat = bats[i];
    var wingY = Math.sin(bat.flap) * bat.size * 0.4;
    var dir = bat.vx > 0 ? 1 : -1;
    var s = bat.size;
    ctx.beginPath();
    // Body
    ctx.ellipse(bat.x, bat.y, s * 0.25, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wings
    ctx.beginPath();
    ctx.moveTo(bat.x, bat.y);
    ctx.quadraticCurveTo(bat.x - s * 0.6 * dir, bat.y - s * 0.2 + wingY, bat.x - s * 1.1 * dir, bat.y + wingY);
    ctx.quadraticCurveTo(bat.x - s * 0.7 * dir, bat.y + s * 0.1 + wingY, bat.x - s * 0.4 * dir, bat.y + s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bat.x, bat.y);
    ctx.quadraticCurveTo(bat.x + s * 0.6 * dir, bat.y - s * 0.2 + wingY, bat.x + s * 1.1 * dir, bat.y + wingY);
    ctx.quadraticCurveTo(bat.x + s * 0.7 * dir, bat.y + s * 0.1 + wingY, bat.x + s * 0.4 * dir, bat.y + s * 0.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ── Fog: slow horizontal wisps near bottom
function drawFog() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Position fog just above the 2nd sort row
  var bandY = L.sTop + L.sBh + L.sGap * 0.4;
  for (var i = 0; i < 4; i++) {
    var phase = (tick * 0.0015 + i * 0.25) % 1;
    var x = (phase * (W + 400 * S)) - 200 * S;
    var y = bandY + i * 10 * S - 10 * S;
    var rx = 220 * S;
    var ry = 22 * S;
    var g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(140,150,170,0.12)');
    g.addColorStop(0.4, 'rgba(140,150,170,0.07)');
    g.addColorStop(1, 'rgba(140,150,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Reverse-direction band for parallax
  for (var j = 0; j < 3; j++) {
    var phase2 = ((1 - (tick * 0.001 + j * 0.33)) % 1 + 1) % 1;
    var x2 = (phase2 * (W + 400 * S)) - 200 * S;
    var y2 = bandY + 14 * S + j * 12 * S;
    var rx2 = 260 * S;
    var ry2 = 28 * S;
    var g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, rx2);
    g2.addColorStop(0, 'rgba(120,135,160,0.10)');
    g2.addColorStop(1, 'rgba(120,135,160,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.ellipse(x2, y2, rx2, ry2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Frame around stock grid, with flickering candles on corners
function drawDarkRoomFrame() {
  var pad = 30 * S;   // pushed further out
  var x = L.gameLeft - pad;
  var y = L.sy - pad;
  var w = L.gameW + pad * 2;
  var h = (L.bh + L.bg) * L.rows - L.bg + pad * 2;
  var rad = 20 * S;

  ctx.save();

  // Outer dim glow
  ctx.shadowColor = 'rgba(180,130,60,0.45)';
  ctx.shadowBlur = 22 * S;

  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(140,100,50,0.55)');
  grad.addColorStop(0.5, 'rgba(90,60,30,0.42)');
  grad.addColorStop(1, 'rgba(60,40,20,0.55)');

  ctx.strokeStyle = grad;
  ctx.lineWidth = 6 * S;
  roundRectPath(ctx, x, y, w, h, rad);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,200,130,0.35)';
  ctx.lineWidth = 1.5 * S;
  roundRectPath(ctx, x + 4 * S, y + 4 * S, w - 8 * S, h - 8 * S, rad - 4 * S);
  ctx.stroke();

  // Mid-edge dots
  var midDotR = 2.2 * S;
  var midTops = [x + w * 0.33, x + w * 0.66];
  for (var m = 0; m < midTops.length; m++) {
    ctx.fillStyle = 'rgba(255,200,130,0.55)';
    ctx.beginPath();
    ctx.arc(midTops[m], y, midDotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(midTops[m], y + h, midDotR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Candles at corners — slightly offset outward from frame so they don't touch the board
  var off = 14 * S;
  var corners = [
    { cx: x - off, cy: y - off, seed: 0.0 },
    { cx: x + w + off, cy: y - off, seed: 1.7 },
    { cx: x - off, cy: y + h + off, seed: 3.1 },
    { cx: x + w + off, cy: y + h + off, seed: 4.9 }
  ];
  for (var k = 0; k < corners.length; k++) {
    drawCandle(corners[k].cx, corners[k].cy, corners[k].seed);
  }
}

function drawCandle(cx, cy, seed) {
  ctx.save();

  // Candle base (small dark cylinder)
  var bw = 6 * S;
  var bh = 10 * S;
  ctx.fillStyle = 'rgba(60,45,30,0.9)';
  ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  ctx.strokeStyle = 'rgba(20,15,10,0.8)';
  ctx.lineWidth = 1 * S;
  ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);

  // Flicker amount
  var flick = 0.85 + 0.15 * Math.sin(tick * 0.45 + seed) + 0.08 * Math.sin(tick * 1.1 + seed * 2.3);
  var flameY = cy - bh / 2 - 4 * S;
  var fH = (14 * S) * flick;
  var fW = 5 * S * flick;

  // Flame outer glow
  ctx.shadowColor = 'rgba(255,170,60,0.9)';
  ctx.shadowBlur = 18 * S * flick;
  ctx.fillStyle = 'rgba(255,200,90,0.95)';
  ctx.beginPath();
  ctx.ellipse(cx, flameY - fH * 0.3, fW * 0.7, fH * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Flame inner hot core
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,240,180,0.95)';
  ctx.beginPath();
  ctx.ellipse(cx, flameY - fH * 0.35, fW * 0.35, fH * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Additive halo around candle to lift surrounding darkness
  ctx.globalCompositeOperation = 'lighter';
  var hg = ctx.createRadialGradient(cx, flameY - fH * 0.2, 0, cx, flameY - fH * 0.2, 50 * S * flick);
  hg.addColorStop(0, 'rgba(255,180,80,0.25)');
  hg.addColorStop(0.5, 'rgba(255,150,60,0.10)');
  hg.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(cx, flameY - fH * 0.2, 50 * S * flick, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}
