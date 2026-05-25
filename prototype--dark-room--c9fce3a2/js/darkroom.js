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

  // 2a. Revealed boxes — radial light
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || !b.revealed || b.empty || b.used) continue;
    if (b.isWall || b.isTunnel) continue;
    var cx = b.x + L.bw / 2;
    var cy = b.y + L.bh / 2;
    var r = L.bw * 1.55;
    var g = mctx.createRadialGradient(cx, cy, L.bw * 0.15, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(cx, cy, r, 0, Math.PI * 2);
    mctx.fill();
  }

  // 2b. Sort columns — front row (topmost visible) emits light
  for (var c = 0; c < sortCols.length; c++) {
    var topVis = -1;
    for (var r0 = 0; r0 < sortCols[c].length; r0++) {
      if (sortCols[c][r0].vis) { topVis = r0; break; }
    }
    if (topVis < 0) continue;
    var scx = L.sSx + c * (L.sBw + L.sColGap) + L.sBw / 2;
    var scy = getSortBoxY(c, 0) + L.sBh / 2;
    var sr = L.sBw * 1.7;
    var sg = mctx.createRadialGradient(scx, scy, L.sBw * 0.2, scx, scy, sr);
    sg.addColorStop(0, 'rgba(255,255,255,1)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = sg;
    mctx.beginPath();
    mctx.arc(scx, scy, sr, 0, Math.PI * 2);
    mctx.fill();
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

  // 4. Additive warm halo on box lights — adds mood without changing visibility
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (var i2 = 0; i2 < stock.length; i2++) {
    var b2 = stock[i2];
    if (!b2 || !b2.revealed || b2.empty || b2.used) continue;
    if (b2.isWall || b2.isTunnel) continue;
    var hx = b2.x + L.bw / 2;
    var hy = b2.y + L.bh / 2;
    var hr = L.bw * 1.7;
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
