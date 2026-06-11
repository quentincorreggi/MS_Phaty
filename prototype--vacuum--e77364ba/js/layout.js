// ============================================================
// layout.js — Layout computation, resize, belt path, positions
// ============================================================

// VACUUM MODE — the whole playfield is flipped vertically:
// consumers (sort) at the top, belt below them, then the inverted
// vacuum funnel (nozzle up, wide mouth down) and the 7x7 box grid
// anchored to the bottom of the screen (thumb zone).
function computeLayout() {
  var cx = W / 2;

  // STOCK — 7x7 grid, anchored to the bottom edge
  var sCal = cal.stock;
  var cols = 7, rows = 7;
  var bg2 = 4 * S * sCal.s;
  var bw = Math.floor((380 * S * sCal.s - (cols - 1) * bg2) / cols);
  var bh = bw;
  var gameW = cols * bw + (cols - 1) * bg2;
  var stockCx = cx + sCal.dx * S;
  var stockLeft = stockCx - gameW / 2;
  var gridH = rows * bh + (rows - 1) * bg2;
  L.cx = cx; L.bw = bw; L.bh = bh; L.bg = bg2;
  L.cols = cols; L.rows = rows;
  L.gameW = gameW; L.gameLeft = stockLeft; L.gameRight = stockLeft + gameW;
  L.sx = stockLeft; L.sy = H - 22 * S - gridH;

  // SORT — consumers at the top
  var oCal = cal.sort;
  var sortW = gameW * oCal.s;
  var sortCx = cx + oCal.dx * S;
  L.sTop = 64 * S + oCal.dy * S;
  L.sBw = Math.floor((sortW - 3 * 7 * S * oCal.s) / 4);
  L.sBh = 32 * S * oCal.s; L.sGap = 3 * S * oCal.s; L.sColGap = 7 * S * oCal.s;
  var stw = 4 * L.sBw + 3 * L.sColGap;
  L.sSx = sortCx - stw / 2;
  L.sBot = L.sTop + SORT_VISIBLE_ROWS * (L.sBh + L.sGap) + 10 * S;

  // BELT — below the consumers
  var bCal = cal.belt;
  var beltW = gameW * bCal.sw;
  var beltCx = cx + bCal.dx * S;
  var beltLeft = beltCx - beltW / 2;
  var beltTopY = L.sBot + 16 * S;
  var beltGap = 24 * S * bCal.sh;
  var beltBotY = beltTopY + beltGap;
  var uR = beltGap / 2;
  var beltInnerLeft = beltLeft + uR;
  var beltInnerRight = beltLeft + beltW - uR;
  L.beltTopY = beltTopY; L.beltBotY = beltBotY;
  L.beltLeft = beltLeft; L.beltRight = beltLeft + beltW;
  L.beltCx = beltCx; L.beltGap = beltGap; L.uR = uR;

  beltPath = [];
  var segs = 200;
  var topLen = Math.max(1, beltInnerRight - beltInnerLeft);
  var botLen = topLen;
  var uLen = Math.PI * uR;
  var perim = topLen + botLen + 2 * uLen;
  for (var i = 0; i < segs; i++) {
    var d = (i / segs) * perim; var x, y;
    var s1 = topLen, s2 = s1 + uLen, s3 = s2 + botLen;
    if (d < s1) { x = beltInnerLeft + (d / topLen) * topLen; y = beltTopY; }
    else if (d < s2) { var a = ((d - s1) / uLen) * Math.PI; x = beltInnerRight + Math.sin(a) * uR; y = beltTopY + uR - Math.cos(a) * uR; }
    else if (d < s3) { x = beltInnerRight - ((d - s2) / botLen) * botLen; y = beltBotY; }
    else { var a = ((d - s3) / uLen) * Math.PI; x = beltInnerLeft - Math.sin(a) * uR; y = beltBotY - uR + Math.cos(a) * uR; }
    beltPath.push({ x: x, y: y });
  }

  // FUNNEL — inverted vacuum: nozzle at the top feeding the belt,
  // wide mouth at the bottom opening over the box grid
  var fCal = cal.funnel;
  var funnelW = gameW * fCal.sw;
  var funnelCx = cx + fCal.dx * S;
  var funnelLeft = funnelCx - funnelW / 2;
  var funnelRight = funnelCx + funnelW / 2;
  var stockBot = L.sy + gridH;
  L.funnelTop = beltBotY + 14 * S;
  L.funnelBot = L.sy - 8 * S;
  L.funnelH = L.funnelBot - L.funnelTop;
  L.funnelLeft = funnelLeft; L.funnelRight = funnelRight;
  L.funnelCx = funnelCx;
  L.funnelOpenW = 32 * S * fCal.sw;
  L.funnelBendY = L.funnelTop + L.funnelH * 0.35;

  funnelWalls = [];
  var exitL = funnelCx - L.funnelOpenW / 2;
  var exitR = funnelCx + L.funnelOpenW / 2;
  funnelWalls.push({ x1: funnelLeft, y1: stockBot, x2: funnelLeft, y2: L.funnelBendY });
  funnelWalls.push({ x1: funnelRight, y1: stockBot, x2: funnelRight, y2: L.funnelBendY });
  funnelWalls.push({ x1: funnelLeft, y1: L.funnelBendY, x2: exitL, y2: L.funnelTop });
  funnelWalls.push({ x1: funnelRight, y1: L.funnelBendY, x2: exitR, y2: L.funnelTop });
  funnelWalls.push({ x1: 0, y1: L.funnelTop, x2: exitL, y2: L.funnelTop });
  funnelWalls.push({ x1: exitR, y1: L.funnelTop, x2: W, y2: L.funnelTop });
  funnelWalls.push({ x1: exitL, y1: L.funnelTop, x2: exitR, y2: L.funnelTop, isPlug: true });

  // BACK BUTTON — pinned to the very top-left, above the consumers
  var bkCal = cal.back;
  var bkSize = 40 * S * bkCal.s;
  L.bkX = L.gameLeft + 8 * S + bkCal.dx * S;
  L.bkY = 10 * S;
  L.bkSize = bkSize;

  // Sort-belt alignment — consumers sit above the belt, so align
  // against the belt's top edge
  L.sortBeltT = [];
  for (var c = 0; c < 4; c++) {
    var colCx = L.sSx + c * (L.sBw + L.sColGap) + L.sBw / 2;
    var best = 0, bd = Infinity;
    for (var j = 0; j < beltPath.length; j++) {
      var dx2 = beltPath[j].x - colCx, dy2 = beltPath[j].y - L.beltTopY;
      var dist = dx2 * dx2 + dy2 * dy2;
      if (dist < bd) { bd = dist; best = j; }
    }
    L.sortBeltT.push(best / beltPath.length);
  }
}

function updateStockPositions() {
  if (!stock || !stock.length) return;
  for (var i = 0; i < stock.length; i++) {
    var r = Math.floor(i / L.cols); var c = i % L.cols;
    stock[i].x = L.sx + c * (L.bw + L.bg);
    stock[i].y = L.sy + r * (L.bh + L.bg);
  }
}

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W; canvas.height = H;
  S = H / 850;
  computeLayout();
  updateStockPositions();
}

window.addEventListener('resize', resize);
