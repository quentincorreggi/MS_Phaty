// ============================================================
// soapkart.js — Soap Kart mechanic
// A kart parks over 2 vertical cells (nose down), hiding the
// boxes under it and blocking paths like a wall. A designer-drawn
// road runs from the cell under the kart to the bottom row.
// When every road cell is empty (and no tunnel can refill it),
// the kart celebrates, drives along its road and exits through
// the bottom of the board, freeing the 2 cells it covered.
//
// Level data:  level.karts = [{ top: cellIdx, road: [cellIdx...] }]
//   top  = upper cell of the kart (lower cell = top + 7)
//   road = ordered cells, road[0] = top + 14, last cell on bottom row
// ============================================================

var KART_ROAD_TINTS = [
  { line: 'rgba(255,226,150,', edge: '#E8B84A', css: '#F2C55C' },
  { line: 'rgba(150,215,255,', edge: '#4AA6E8', css: '#5BB4F0' },
  { line: 'rgba(255,170,205,', edge: '#E8609A', css: '#F07AAE' },
  { line: 'rgba(180,240,140,', edge: '#5FBF3A', css: '#76CC50' }
];
var KART_BEAT_FRAMES = 22;        // pause between last pick and celebration
var KART_CELEBRATE_FRAMES = 62;   // hop + rev
var KART_MAX_SPEED = 0.11;        // cells per frame
var KART_ACCEL = 0.004;

function kartTint(k) { return KART_ROAD_TINTS[k % KART_ROAD_TINTS.length]; }

// ── Init (called from initGame after stock is built) ──
function initKarts(lvlKarts) {
  karts = [];
  if (!lvlKarts) return;
  for (var k = 0; k < lvlKarts.length; k++) {
    var src = lvlKarts[k];
    if (!src || src.top === undefined) continue;
    var top = src.top, bot = src.top + L.cols;
    if (top < 0 || bot >= stock.length) continue;
    var road = (src.road || []).slice();
    var kart = {
      id: karts.length,
      top: top, bot: bot,
      road: road,
      roadSet: {},
      state: 'waiting',   // waiting → beat → celebrate → ready → driving → gone
      t: 0,
      dist: 0, speed: 0,
      angle: 0,
      shakeT: 0, honkT: 0, honkCd: 0,
      coverTop: true, coverBot: true,
      cellClear: [],
      markAlpha: [],
      alpha: 1,
      whooshed: false,
      blinkT: 0
    };
    for (var r = 0; r < road.length; r++) { kart.roadSet[road[r]] = true; kart.cellClear.push(false); kart.markAlpha.push(1); }
    stock[top].kartCovered = kart.id;
    stock[bot].kartCovered = kart.id;
    buildKartPath(kart);
    karts.push(kart);
  }
  for (var k2 = 0; k2 < karts.length; k2++) {
    for (var r2 = 0; r2 < karts[k2].road.length; r2++) karts[k2].cellClear[r2] = isRoadCellClear(karts[k2].road[r2]);
  }
}

function cellCenter(idx) {
  var r = Math.floor(idx / L.cols), c = idx % L.cols;
  return { x: L.sx + c * (L.bw + L.bg) + L.bw / 2, y: L.sy + r * (L.bh + L.bg) + L.bh / 2 };
}

// Kart-centre path: parked centre → each road cell centre → off the bottom
function buildKartPath(kart) {
  var P = L.bh + L.bg;
  var a = cellCenter(kart.top), b = cellCenter(kart.bot);
  var pts = [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }];
  for (var i = 0; i < kart.road.length; i++) pts.push(cellCenter(kart.road[i]));
  var last = pts[pts.length - 1];
  pts.push({ x: last.x, y: last.y + P * 2.4 });
  var cum = [0];
  for (var j = 1; j < pts.length; j++) {
    var dx = pts[j].x - pts[j - 1].x, dy = pts[j].y - pts[j - 1].y;
    cum.push(cum[j - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  kart.pts = pts; kart.cum = cum; kart.pathLen = cum[cum.length - 1];
  kart.gridBottomY = L.sy + L.rows * P - L.bg;
}

function kartPosAt(kart, d) {
  var pts = kart.pts, cum = kart.cum;
  if (d <= 0) return { x: pts[0].x, y: pts[0].y, dx: 0, dy: 1 };
  for (var i = 1; i < pts.length; i++) {
    if (d <= cum[i] || i === pts.length - 1) {
      var seg = cum[i] - cum[i - 1];
      var t = seg > 0 ? Math.min(1, (d - cum[i - 1]) / seg) : 0;
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: pts[i - 1].x + dx * t, y: pts[i - 1].y + dy * t, dx: dx / len, dy: dy / len };
    }
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, dx: 0, dy: 1 };
}

// ── Road state ──
function isRoadCellClear(idx) {
  var s = stock[idx];
  if (!s) return false;
  if (s.isWall || s.isTunnel) return false;
  if (!(s.empty || s.used)) return false;
  // A tunnel that still holds boxes and points at this cell can refill it
  for (var i = 0; i < stock.length; i++) {
    var t = stock[i];
    if (!t.isTunnel || !t.tunnelContents || t.tunnelContents.length === 0) continue;
    if (getTunnelExitIdx(i) === idx) return false;
  }
  return true;
}

function isKartCellCovered(idx) {
  return stock[idx] && stock[idx].kartCovered !== undefined && stock[idx].kartCovered !== null;
}

// Path distance at which a kart centre reaches road cell i's centre
function kartRoadDist(kart, i) { return kart.cum[i + 1]; }

function kartBlockedByOther(kart) {
  for (var o = 0; o < karts.length; o++) {
    var other = karts[o];
    if (other === kart) continue;
    // find last shared road cell index (in other's road)
    var lastShared = -1;
    for (var r = 0; r < other.road.length; r++) if (kart.roadSet[other.road[r]]) lastShared = r;
    if (lastShared < 0) continue;
    var P = L.bh + L.bg;
    if (other.state === 'driving') {
      if (other.dist < kartRoadDist(other, lastShared) + P * 1.1) return true;
    } else if (other.state === 'ready' || other.state === 'celebrate' || other.state === 'beat') {
      // Shorter road leaves first; ties broken by id
      if (other.road.length < kart.road.length || (other.road.length === kart.road.length && other.id < kart.id)) return true;
    }
  }
  return false;
}

// ── Update (called from game update) ──
function updateKarts() {
  if (!karts || karts.length === 0) return;
  var P = L.bh + L.bg;
  for (var k = 0; k < karts.length; k++) {
    var kart = karts[k];
    if (kart.shakeT > 0) kart.shakeT = Math.max(0, kart.shakeT - 0.03);
    if (kart.honkT > 0) kart.honkT = Math.max(0, kart.honkT - 0.02);
    if (kart.honkCd > 0) kart.honkCd--;
    if (kart.blinkT > 0) kart.blinkT--;
    else if (Math.random() < 0.006) kart.blinkT = 8;

    // Dust puff when a road cell opens up
    for (var r = 0; r < kart.road.length; r++) {
      var clear = isRoadCellClear(kart.road[r]);
      if (clear && !kart.cellClear[r] && kart.state === 'waiting') {
        var cc = cellCenter(kart.road[r]);
        for (var p = 0; p < 10; p++) {
          var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
          particles.push({ x: cc.x, y: cc.y, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1 * S,
            r: (2 + Math.random() * 3) * S, color: kartTint(kart.id).line + '0.9)',
            life: 0.8, decay: 0.03 + Math.random() * 0.02, grav: false });
        }
      }
      kart.cellClear[r] = clear;
    }

    if (kart.state === 'waiting') {
      var allClear = kart.road.length > 0;
      for (var r2 = 0; r2 < kart.road.length; r2++) if (!kart.cellClear[r2]) { allClear = false; break; }
      if (allClear) { kart.state = 'beat'; kart.t = KART_BEAT_FRAMES; }
    } else if (kart.state === 'beat') {
      if (--kart.t <= 0) {
        kart.state = 'celebrate'; kart.t = KART_CELEBRATE_FRAMES;
        sfxKartRev();
        var pc = kartPosAt(kart, 0);
        spawnConfetti(pc.x, pc.y, 18);
      }
    } else if (kart.state === 'celebrate') {
      if (kart.t % 6 === 0) spawnKartBubbles(kart, 2);
      if (--kart.t <= 0) kart.state = 'ready';
    } else if (kart.state === 'ready') {
      if (!kartBlockedByOther(kart)) { kart.state = 'driving'; kart.speed = 0; sfxKartRev(); }
    } else if (kart.state === 'driving') {
      kart.speed = Math.min(KART_MAX_SPEED * P, kart.speed + KART_ACCEL * P);
      kart.dist += kart.speed;
      var pos = kartPosAt(kart, kart.dist);
      var target = Math.atan2(-pos.dx, pos.dy);
      var diff = target - kart.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      kart.angle += diff * 0.22;

      // Engine hum + bubbles
      if (tick % 7 === 0) tone(90 + kart.speed / P * 900, 0.09, 'sawtooth', 0.018);
      if (tick % 3 === 0) spawnKartBubbles(kart, 1);

      // Free covered cells once the kart has left them
      if (kart.coverTop && kart.dist >= P * 1.0) { kart.coverTop = false; freeKartCell(kart.top); }
      if (kart.coverBot && kart.dist >= P * 2.0) { kart.coverBot = false; freeKartCell(kart.bot); }

      // Fade the marking behind the kart
      for (var r3 = 0; r3 < kart.road.length; r3++) {
        var dd = kart.dist - kartRoadDist(kart, r3);
        if (dd > 0) kart.markAlpha[r3] = Math.max(0, 1 - dd / (P * 0.9));
      }

      // Exit through the bottom
      var noseY = pos.y + P * 0.9;
      if (!kart.whooshed && noseY > kart.gridBottomY) { kart.whooshed = true; sfxKartWhoosh(); }
      var backY = pos.y - P;
      if (backY > kart.gridBottomY - P * 0.5) kart.alpha = Math.max(0, 1 - (backY - (kart.gridBottomY - P * 0.5)) / (P * 1.2));
      if (kart.dist >= kart.pathLen || kart.alpha <= 0) {
        kart.state = 'gone';
        for (var r4 = 0; r4 < kart.markAlpha.length; r4++) kart.markAlpha[r4] = 0;
        if (kart.coverTop) { kart.coverTop = false; freeKartCell(kart.top); }
        if (kart.coverBot) { kart.coverBot = false; freeKartCell(kart.bot); }
      }
    }
  }
}

function freeKartCell(idx) {
  var s = stock[idx];
  if (!s) return;
  s.kartCovered = null;
  var cc = cellCenter(idx);
  spawnBurst(cc.x, cc.y, '#FFFFFF', 10);
  spawnBurst(cc.x, cc.y, '#BFE9FF', 8);
  if (!s.empty && !s.used) s.popT = 0.8;
  updateBoxReveals(true);
}

function spawnKartBubbles(kart, n) {
  var pos = kartPosAt(kart, kart.dist);
  var P = L.bh + L.bg;
  // behind the kart (opposite the nose)
  var bx = pos.x + Math.sin(kart.angle) * P * 0.95;
  var by = pos.y - Math.cos(kart.angle) * P * 0.95;
  if (kart.state === 'celebrate') { bx = pos.x; by = pos.y - P * 0.6; }
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 1.2;
    particles.push({ x: bx + (Math.random() - 0.5) * L.bw * 0.6, y: by, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.2 * S,
      r: (2.5 + Math.random() * 4) * S, color: Math.random() < 0.5 ? 'rgba(200,235,255,0.75)' : 'rgba(255,255,255,0.8)',
      life: 0.9, decay: 0.018 + Math.random() * 0.015, grav: false });
  }
}

// ── Input ──
// Returns true if the tap hit a parked kart (tap consumed).
function handleKartTap(px, py) {
  if (!karts) return false;
  for (var k = 0; k < karts.length; k++) {
    var kart = karts[k];
    if (kart.state === 'gone' || kart.state === 'driving') continue;
    var a = stock[kart.top];
    if (px >= a.x && px <= a.x + L.bw && py >= a.y && py <= a.y + L.bh * 2 + L.bg) {
      if (kart.state === 'waiting') {
        kart.shakeT = 1;
        kart.honkT = 1;
        if (kart.honkCd <= 0) { sfxKartHonk(); kart.honkCd = 14; }
      }
      return true;
    }
  }
  return false;
}

// ── Sounds ──
function sfxKartHonk() {
  tone(620, 0.09, 'square', 0.045, 560);
  setTimeout(function () { tone(520, 0.13, 'square', 0.045, 470); }, 120);
}
function sfxKartRev() {
  tone(70, 0.45, 'sawtooth', 0.045, 260);
  setTimeout(function () { tone(110, 0.3, 'sawtooth', 0.035, 320); }, 180);
}
function sfxKartWhoosh() {
  tone(900, 0.4, 'sine', 0.07, 140);
  tone(1600, 0.25, 'triangle', 0.025, 400);
}

// ── Drawing ──

// Road marking on the floor — drawn BEFORE the stock grid
function drawKartRoads() {
  if (!karts || karts.length === 0) return;
  var P = L.bh + L.bg;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (var k = 0; k < karts.length; k++) {
    var kart = karts[k];
    if (kart.state === 'gone') continue;
    var tint = kartTint(kart.id);
    var pts = kart.pts;
    // segments: pts[j] → pts[j+1], alpha = markAlpha of road cell j (exit segment uses last)
    for (var j = 0; j < pts.length - 1; j++) {
      var ai = Math.min(j, kart.road.length - 1);
      var al = kart.markAlpha[ai];
      if (j === 0) al = kart.markAlpha[0];
      if (al <= 0.01) continue;
      var x1 = pts[j].x, y1 = pts[j].y, x2 = pts[j + 1].x, y2 = pts[j + 1].y;
      if (j === 0) { y1 = cellCenter(kart.bot).y; }
      var isExit = (j === pts.length - 2);
      if (isExit) { y2 = y1 + P * 1.0; }
      // wide soft band
      ctx.globalAlpha = al;
      ctx.strokeStyle = tint.line + '0.55)';
      ctx.lineWidth = L.bw * 0.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // dashed centre line
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3 * S;
      ctx.setLineDash([7 * S, 6 * S]);
      ctx.lineDashOffset = 0;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      if (isExit) {
        // exit chevron below the grid
        ctx.fillStyle = tint.edge;
        var cy = y2 + 2 * S, cx = x2, s = L.bw * 0.16;
        ctx.beginPath(); ctx.moveTo(cx - s, cy - s * 0.6); ctx.lineTo(cx, cy + s * 0.5); ctx.lineTo(cx + s, cy - s * 0.6);
        ctx.lineWidth = 3 * S; ctx.strokeStyle = tint.edge; ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// Road outlines on top of boxes still sitting on the road + parked karts
function drawKartsOverlay() {
  if (!karts || karts.length === 0) return;
  var P = L.bh + L.bg;
  // 1. dashed tint outline around road boxes (so the road reads under boxes)
  ctx.save();
  for (var k = 0; k < karts.length; k++) {
    var kart = karts[k];
    if (kart.state === 'gone') continue;
    var tint = kartTint(kart.id);
    for (var r = 0; r < kart.road.length; r++) {
      if (kart.markAlpha[r] <= 0.01) continue;
      var s = stock[kart.road[r]];
      if (!s || s.empty || s.used || s.isWall || s.isTunnel) continue;
      ctx.globalAlpha = 0.9 * kart.markAlpha[r];
      ctx.strokeStyle = tint.edge;
      ctx.lineWidth = 2.5 * S;
      ctx.setLineDash([5 * S, 4 * S]);
      ctx.lineDashOffset = -tick * 0.25;
      rRect(s.x - 2 * S, s.y - 2 * S, L.bw + 4 * S, L.bh + 4 * S, 8 * S); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();

  // 2. parking pads under still-covered cells
  for (var k2 = 0; k2 < karts.length; k2++) {
    var kt = karts[k2];
    var cells = [];
    if (kt.coverTop) cells.push(kt.top);
    if (kt.coverBot) cells.push(kt.bot);
    for (var c = 0; c < cells.length; c++) {
      var cs = stock[cells[c]];
      ctx.save();
      ctx.fillStyle = 'rgba(150,120,85,0.35)';
      rRect(cs.x, cs.y, L.bw, L.bh, 6 * S); ctx.fill();
      ctx.restore();
    }
  }

  // 3. karts
  for (var k3 = 0; k3 < karts.length; k3++) {
    var kk = karts[k3];
    if (kk.state === 'gone') continue;
    var pos = kartPosAt(kk, kk.dist);
    var ox = 0, oy = 0, sc = 1;
    if (kk.shakeT > 0) ox = Math.sin(kk.shakeT * 30) * 5 * S * kk.shakeT;
    var face = 'idle';
    if (kk.state === 'waiting') {
      oy = Math.sin(tick * 0.05 + kk.id) * 0.8 * S;
      if (kk.honkT > 0) face = 'honk';
    } else if (kk.state === 'beat') {
      face = 'idle';
    } else if (kk.state === 'celebrate') {
      var p = 1 - kk.t / KART_CELEBRATE_FRAMES;
      oy = -Math.sin(Math.min(1, p * 1.6) * Math.PI) * P * 0.22;   // back-up
      sc = 1 + Math.abs(Math.sin(p * Math.PI * 3)) * 0.1 * (1 - p); // hops
      face = 'happy';
    } else if (kk.state === 'ready') {
      face = 'happy';
    } else if (kk.state === 'driving') {
      face = 'drive';
    }
    var w = L.bw * 0.92, h = (L.bh * 2 + L.bg) * 0.94;
    ctx.save();
    ctx.globalAlpha = kk.alpha;
    ctx.translate(pos.x + ox, pos.y + oy);
    ctx.rotate(kk.angle);
    ctx.scale(sc, sc);
    drawSoapKart(ctx, w, h, S, face, kk.blinkT > 0, kk.state === 'driving' ? kk.dist : 0, kk.honkT);
    ctx.restore();
  }
}

// Kart drawn in local coords centred at origin, nose pointing +y
function drawSoapKart(ctx, w, h, S, face, blink, wheelDist, honkT) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  rRectC(ctx, -w * 0.46 + 2 * S, -h * 0.47 + 4 * S, w * 0.92, h * 0.94, 10 * S); ctx.fill();

  // wheels
  var ww = w * 0.2, wh = h * 0.17;
  var wx = w * 0.5 - ww * 0.55, wy = h * 0.3;
  var wheelPos = [[-wx, -wy], [wx, -wy], [-wx, wy], [wx, wy]];
  for (var i = 0; i < 4; i++) {
    var cx = wheelPos[i][0], cy = wheelPos[i][1];
    ctx.fillStyle = '#3A2E2A';
    rRectC(ctx, cx - ww / 2, cy - wh / 2, ww, wh, 3 * S); ctx.fill();
    // treads
    ctx.save();
    rRectC(ctx, cx - ww / 2, cy - wh / 2, ww, wh, 3 * S); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5 * S;
    var step = wh / 4, off = (wheelDist * 0.6) % step;
    for (var t = -1; t < 6; t++) {
      var ty = cy - wh / 2 + t * step + off;
      ctx.beginPath(); ctx.moveTo(cx - ww / 2, ty); ctx.lineTo(cx + ww / 2, ty); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#C9B8A0';
    ctx.beginPath(); ctx.arc(cx, cy, ww * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  // body (wooden)
  var bw = w * 0.74, bh = h * 0.9;
  var grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  grad.addColorStop(0, '#B8743A'); grad.addColorStop(0.5, '#D99A5B'); grad.addColorStop(1, '#A9662F');
  ctx.fillStyle = grad;
  rRectC(ctx, -bw / 2, -bh / 2, bw, bh, 9 * S); ctx.fill();
  ctx.save();
  rRectC(ctx, -bw / 2, -bh / 2, bw, bh, 9 * S); ctx.clip();
  ctx.strokeStyle = 'rgba(100,55,20,0.35)'; ctx.lineWidth = 1.5 * S;
  var planks = 7;
  for (var p = 1; p < planks; p++) {
    var py = -bh / 2 + p * bh / planks;
    ctx.beginPath(); ctx.moveTo(-bw / 2, py); ctx.lineTo(bw / 2, py); ctx.stroke();
  }
  // nails
  ctx.fillStyle = 'rgba(70,40,15,0.45)';
  for (var n = 0; n < planks; n++) {
    var ny = -bh / 2 + (n + 0.5) * bh / planks;
    ctx.beginPath(); ctx.arc(-bw * 0.38, ny, 1.2 * S, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bw * 0.38, ny, 1.2 * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#7A4520'; ctx.lineWidth = 2 * S;
  rRectC(ctx, -bw / 2, -bh / 2, bw, bh, 9 * S); ctx.stroke();

  // front bumper (nose, +y) and rear bar
  ctx.fillStyle = '#8A5226';
  rRectC(ctx, -w * 0.42, h * 0.41, w * 0.84, h * 0.07, 4 * S); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rRectC(ctx, -w * 0.38, h * 0.415, w * 0.76, h * 0.02, 2 * S); ctx.fill();
  ctx.fillStyle = '#8A5226';
  rRectC(ctx, -w * 0.3, -h * 0.48, w * 0.6, h * 0.05, 3 * S); ctx.fill();

  // steering wheel
  var swy = h * 0.2;
  ctx.strokeStyle = '#3A2E2A'; ctx.lineWidth = 2.5 * S;
  ctx.beginPath(); ctx.arc(0, swy, w * 0.13, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w * 0.13, swy); ctx.lineTo(w * 0.13, swy); ctx.stroke();

  // soap driver
  var sw = w * 0.6, sh = h * 0.32, sy = -h * 0.08;
  var sg = ctx.createLinearGradient(0, sy - sh / 2, 0, sy + sh / 2);
  sg.addColorStop(0, '#D6F2FF'); sg.addColorStop(1, '#82C9F0');
  ctx.fillStyle = sg;
  rRectC(ctx, -sw / 2, sy - sh / 2, sw, sh, sw * 0.32); ctx.fill();
  ctx.strokeStyle = '#5AA9D6'; ctx.lineWidth = 1.5 * S;
  rRectC(ctx, -sw / 2, sy - sh / 2, sw, sh, sw * 0.32); ctx.stroke();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  rRectC(ctx, -sw * 0.36, sy - sh * 0.4, sw * 0.32, sh * 0.12, sh * 0.06); ctx.fill();
  // bubbles on head
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeStyle = 'rgba(120,190,230,0.6)'; ctx.lineWidth = 1 * S;
  var bub = [[sw * 0.22, sy - sh * 0.55, w * 0.07], [sw * 0.36, sy - sh * 0.45, w * 0.05], [-sw * 0.05, sy - sh * 0.58, w * 0.045]];
  for (var b = 0; b < bub.length; b++) {
    ctx.beginPath(); ctx.arc(bub[b][0], bub[b][1], bub[b][2], 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // face
  var ey = sy - sh * 0.02, ex = sw * 0.2, er = Math.max(1.5 * S, sw * 0.07);
  var my = sy + sh * 0.24;
  ctx.fillStyle = '#2A3A4A'; ctx.strokeStyle = '#2A3A4A'; ctx.lineCap = 'round';
  if (face === 'happy' || face === 'drive') {
    ctx.lineWidth = 2 * S;
    for (var e = -1; e <= 1; e += 2) {
      ctx.beginPath(); ctx.arc(e * ex, ey + er * 0.4, er, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    // big smile
    ctx.fillStyle = '#C0405A';
    ctx.beginPath(); ctx.arc(0, my - sh * 0.06, sw * 0.17, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FF8FA8';
    ctx.beginPath(); ctx.arc(0, my + sh * 0.04, sw * 0.08, 0, Math.PI); ctx.fill();
  } else if (face === 'honk') {
    // surprised / sheepish: round eyes with highlight, little "o"
    for (var e2 = -1; e2 <= 1; e2 += 2) {
      ctx.fillStyle = '#2A3A4A';
      ctx.beginPath(); ctx.arc(e2 * ex, ey, er * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(e2 * ex + er * 0.4, ey - er * 0.4, er * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#2A3A4A'; ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.arc(0, my, sw * 0.06, 0, Math.PI * 2); ctx.stroke();
    // sweat drop
    ctx.fillStyle = 'rgba(120,200,255,0.9)';
    ctx.beginPath(); ctx.arc(sw * 0.42, sy - sh * 0.1, w * 0.04, 0, Math.PI * 2); ctx.fill();
  } else {
    if (blink) {
      ctx.lineWidth = 2 * S;
      for (var e3 = -1; e3 <= 1; e3 += 2) { ctx.beginPath(); ctx.moveTo(e3 * ex - er, ey); ctx.lineTo(e3 * ex + er, ey); ctx.stroke(); }
    } else {
      for (var e4 = -1; e4 <= 1; e4 += 2) {
        ctx.fillStyle = '#2A3A4A';
        ctx.beginPath(); ctx.arc(e4 * ex, ey, er, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(e4 * ex + er * 0.35, ey - er * 0.35, er * 0.38, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#2A3A4A'; ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.arc(0, my - sh * 0.08, sw * 0.12, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  }
  // blush
  ctx.fillStyle = 'rgba(255,130,160,0.45)';
  ctx.beginPath(); ctx.arc(-sw * 0.34, my - sh * 0.08, sw * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(sw * 0.34, my - sh * 0.08, sw * 0.07, 0, Math.PI * 2); ctx.fill();

  // honk "beep" lines at the nose
  if (honkT > 0) {
    ctx.save();
    ctx.globalAlpha *= honkT;
    ctx.strokeStyle = '#F2A33A'; ctx.lineWidth = 2.5 * S; ctx.lineCap = 'round';
    var ny2 = h * 0.52, spread = (1 - honkT) * 6 * S;
    for (var l = -1; l <= 1; l++) {
      ctx.beginPath();
      ctx.moveTo(l * w * 0.22, ny2 + spread);
      ctx.lineTo(l * w * 0.32, ny2 + w * 0.16 + spread);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Rounded rect path on a given context (rRect uses the global ctx)
function rRectC(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
