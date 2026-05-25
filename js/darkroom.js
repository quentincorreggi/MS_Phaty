// ============================================================
// darkroom.js — Level-wide dark mode with localized light sources
//   • Dark overlay covers whole canvas
//   • Revealed boxes emit radial light (reveal selves + half of neighbors)
//   • Sort column front rows (consumers) emit upward light
//   • Belt + funnel fully lit so marbles are visible in transit
//   • Warm tint halo layered additively over light sources
// ============================================================

var darkRoomMask = null;

function isDarkRoomLevel() {
  if (!gameActive) return false;
  if (typeof currentLevel === 'undefined' || currentLevel < 0) return false;
  var lvl = LEVELS[currentLevel];
  return !!(lvl && lvl.darkRoom);
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

  // 1. Fill mask with near-black (full canvas)
  mctx.globalCompositeOperation = 'source-over';
  mctx.clearRect(0, 0, W, H);
  mctx.fillStyle = 'rgba(6,9,18,0.94)';
  mctx.fillRect(0, 0, W, H);

  // 2. Punch holes where light exists
  mctx.globalCompositeOperation = 'destination-out';

  // 2a. Revealed boxes — radial light (tight: self + edge of neighbor)
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

  // 2b. Sort columns — front row only, tight elliptical light biased upward
  //     Hugs the first slot so second row stays in darkness
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
    // Squash vertically so light doesn't bleed into next row down
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

  // 2c. Belt — full path lit with soft edges (use shadowBlur as glow)
  mctx.save();
  mctx.shadowColor = 'rgba(255,255,255,1)';
  mctx.shadowBlur = 36 * S;
  mctx.fillStyle = 'rgba(255,255,255,1)';
  var bPadX = 22 * S, bPadY = 18 * S;
  mctx.fillRect(
    L.beltLeft - bPadX,
    L.beltTopY - bPadY,
    (L.beltRight - L.beltLeft) + bPadX * 2,
    (L.beltBotY - L.beltTopY) + bPadY * 2
  );
  mctx.restore();

  // 2d. Funnel — lit so falling marbles visible
  mctx.save();
  mctx.shadowColor = 'rgba(255,255,255,1)';
  mctx.shadowBlur = 28 * S;
  mctx.fillStyle = 'rgba(255,255,255,0.92)';
  var fPad = 8 * S;
  mctx.fillRect(
    L.funnelLeft - fPad,
    L.funnelTop - fPad,
    (L.funnelRight - L.funnelLeft) + fPad * 2,
    L.funnelH + fPad * 2
  );
  mctx.restore();

  // 2e. Back button — keep UI lit
  mctx.save();
  mctx.shadowColor = 'rgba(255,255,255,1)';
  mctx.shadowBlur = 14 * S;
  mctx.fillStyle = 'rgba(255,255,255,1)';
  mctx.fillRect(L.bkX - 4 * S, L.bkY - 4 * S, L.bkSize + 8 * S, L.bkSize + 8 * S);
  mctx.restore();

  // 3. Composite mask over scene
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkRoomMask, 0, 0);
  ctx.restore();

  // 3b. Decoration — ornate frame around stock grid
  drawDarkRoomFrame();

  // 4. Additive warm halo on box lights — adds mood without changing visibility
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

// Decorative frame around stock grid — dim warm metal look with corner ornaments
function drawDarkRoomFrame() {
  var pad = 16 * S;
  var x = L.gameLeft - pad;
  var y = L.sy - pad;
  var w = L.gameW + pad * 2;
  var h = (L.bh + L.bg) * L.rows - L.bg + pad * 2;
  var rad = 18 * S;

  ctx.save();

  // Outer dim glow (soft halo behind frame)
  ctx.shadowColor = 'rgba(180,130,60,0.45)';
  ctx.shadowBlur = 22 * S;

  // Frame band — warm metallic gradient
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(140,100,50,0.55)');
  grad.addColorStop(0.5, 'rgba(90,60,30,0.42)');
  grad.addColorStop(1, 'rgba(60,40,20,0.55)');

  ctx.strokeStyle = grad;
  ctx.lineWidth = 6 * S;
  roundRectPath(ctx, x, y, w, h, rad);
  ctx.stroke();

  // Inner thin highlight line
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,200,130,0.35)';
  ctx.lineWidth = 1.5 * S;
  roundRectPath(ctx, x + 4 * S, y + 4 * S, w - 8 * S, h - 8 * S, rad - 4 * S);
  ctx.stroke();

  // Corner ornaments — small glowing studs
  var studR = 5 * S;
  var corners = [
    { cx: x, cy: y },
    { cx: x + w, cy: y },
    { cx: x, cy: y + h },
    { cx: x + w, cy: y + h }
  ];
  for (var k = 0; k < corners.length; k++) {
    var cc = corners[k];
    var sg = ctx.createRadialGradient(cc.cx, cc.cy, 0, cc.cx, cc.cy, studR * 3.5);
    sg.addColorStop(0, 'rgba(255,210,140,0.85)');
    sg.addColorStop(0.4, 'rgba(220,150,70,0.45)');
    sg.addColorStop(1, 'rgba(220,150,70,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cc.cx, cc.cy, studR * 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,230,180,0.95)';
    ctx.beginPath();
    ctx.arc(cc.cx, cc.cy, studR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mid-edge ornaments — subtle dots on top/bottom edges
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
