// ============================================================
// carousel.js — Carousel mechanic
// A 3×3 structure: 8 outer boxes rotate clockwise each time
// any box in the level is tapped. Center cell is an inert machine.
// ============================================================

// Ring positions within a 3×3 local grid, in clockwise order:
//   0 1 2
//   3 4 5   (4 = center machine)
//   6 7 8
// CW ring: top-left → top → top-right → right → bot-right → bot → bot-left → left
var CAROUSEL_RING_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
var CAROUSEL_CENTER_LOCAL = 4;

// Grid offsets from anchor (top-left of 3×3) for each ring position, 7-col grid.
// CAROUSEL_RING_ORDER[r] gives the local 3×3 position for ring index r.
// Local pos p → row floor(p/3), col (p%3) → grid offset = floor(p/3)*7 + (p%3)
var CAROUSEL_RING_OFFSETS = [0, 1, 2, 9, 16, 15, 14, 7];  // grid offsets for ring[0..7]
var CAROUSEL_MACHINE_OFFSET = 8;   // grid offset for center (row1*7 + col1 = 8)
var CAROUSEL_ALL_OFFSETS = [0, 1, 2, 7, 8, 9, 14, 15, 16];  // all 9 cell offsets

function initCarousels() {
  carousels = [];
  for (var i = 0; i < stock.length; i++) {
    if (!stock[i].isCarouselAnchor) continue;
    var row = Math.floor(i / L.cols);
    var col = i % L.cols;
    var ringIndices = [];
    for (var r = 0; r < 8; r++) {
      var localPos = CAROUSEL_RING_ORDER[r];
      var dr = Math.floor(localPos / 3), dc = localPos % 3;
      ringIndices.push((row + dr) * L.cols + (col + dc));
    }
    carousels.push({
      anchorIdx: i,
      ringIndices: ringIndices,
      machineIdx: (row + 1) * L.cols + (col + 1),
      rotT: 0,
      animT: 0
    });
  }
}

function rotateCarousels() {
  for (var c = 0; c < carousels.length; c++) {
    var car = carousels[c];
    var hasBoxes = false;
    for (var r = 0; r < 8; r++) {
      var b = stock[car.ringIndices[r]];
      if (!b.empty && !b.used) { hasBoxes = true; break; }
    }
    if (!hasBoxes) continue;

    // Snapshot all ring cell data
    var snap = [];
    for (var r = 0; r < 8; r++) {
      var b = stock[car.ringIndices[r]];
      snap.push({
        ci: b.ci, boxType: b.boxType, remaining: b.remaining,
        spawning: b.spawning, spawnIdx: b.spawnIdx,
        used: b.used, empty: b.empty,
        iceHP: b.iceHP, iceCrackT: b.iceCrackT, iceShatterT: b.iceShatterT,
        blockerCount: b.blockerCount, idlePhase: b.idlePhase,
        revealT: b.revealT, popT: b.popT, emptyT: b.emptyT
      });
    }

    // Rotate clockwise: cell at ring index r receives data from r-1
    for (var r = 0; r < 8; r++) {
      var b = stock[car.ringIndices[r]];
      var src = snap[(r + 7) % 8];
      b.ci = src.ci;           b.boxType = src.boxType;
      b.remaining = src.remaining; b.spawning = src.spawning;
      b.spawnIdx = src.spawnIdx;   b.used = src.used;
      b.empty = src.empty;         b.iceHP = src.iceHP;
      b.iceCrackT = src.iceCrackT; b.iceShatterT = src.iceShatterT;
      b.blockerCount = src.blockerCount; b.idlePhase = src.idlePhase;
      b.revealT = src.revealT; b.popT = src.popT; b.emptyT = src.emptyT;
      b.shakeT = 0; b.hoverT = 0;
    }

    car.rotT = 1.0;
    car.animT = 1.0;
  }
}

function updateCarouselAnimations() {
  for (var c = 0; c < carousels.length; c++) {
    if (carousels[c].rotT > 0) carousels[c].rotT = Math.max(0, carousels[c].rotT - 0.04);
    if (carousels[c].animT > 0) carousels[c].animT = Math.max(0, carousels[c].animT - 0.022);
  }
}

function drawCarouselsOverlay() {
  for (var c = 0; c < carousels.length; c++) {
    var car = carousels[c];
    if (car.animT <= 0) continue;

    var anchor = stock[car.anchorIdx];
    if (!anchor) continue;

    // Bounding box of the 3×3 carousel
    var left = anchor.x;
    var top = anchor.y;
    var totalW = L.bw * 3 + L.bg * 2;
    var totalH = L.bh * 3 + L.bg * 2;
    var cx2 = left + totalW / 2;
    var cy2 = top + totalH / 2;
    var radius = Math.sqrt((totalW / 2) * (totalW / 2) + (totalH / 2) * (totalH / 2)) + 6 * S;

    var alpha = car.animT;
    // Ease out: fast appear, slow fade
    var eased = alpha < 0.7 ? 1.0 : (1.0 - alpha) / 0.3;

    ctx.save();
    ctx.globalAlpha = eased * 0.75;

    // Draw animated arc: 270° sweep, rotates slightly as it appears
    var arcProgress = 1.0 - alpha;  // 0→1 as animation plays
    var sweepAngle = Math.PI * 1.5;  // 270°
    var startAngle = -Math.PI / 2 + arcProgress * Math.PI * 0.4;
    var endAngle = startAngle + sweepAngle;

    ctx.strokeStyle = 'rgba(255,200,80,1)';
    ctx.lineWidth = 3 * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx2, cy2, radius, startAngle, endAngle);
    ctx.stroke();

    // Arrowhead at the end of the arc
    var arrowAngle = endAngle;
    var ax = cx2 + Math.cos(arrowAngle) * radius;
    var ay = cy2 + Math.sin(arrowAngle) * radius;
    var perpAngle = arrowAngle + Math.PI / 2;
    var arrowSize = 7 * S;
    ctx.fillStyle = 'rgba(255,200,80,1)';
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(arrowAngle) * arrowSize, ay + Math.sin(arrowAngle) * arrowSize);
    ctx.lineTo(ax + Math.cos(perpAngle + Math.PI) * arrowSize * 0.7, ay + Math.sin(perpAngle + Math.PI) * arrowSize * 0.7);
    ctx.lineTo(ax + Math.cos(perpAngle) * arrowSize * 0.7, ay + Math.sin(perpAngle) * arrowSize * 0.7);
    ctx.closePath();
    ctx.fill();

    // Small "SHIFT" label
    ctx.globalAlpha = eased * 0.6;
    ctx.fillStyle = 'rgba(255,200,80,1)';
    ctx.font = 'bold ' + (9 * S) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↻', cx2, cy2 - radius - 10 * S);

    ctx.restore();
  }
}

function drawCarouselMachine(x, y, w, h, S, tick, stockIdx) {
  var rotT = 0;
  for (var c = 0; c < carousels.length; c++) {
    if (carousels[c].machineIdx === stockIdx) { rotT = carousels[c].rotT; break; }
  }

  ctx.save();

  // Dark metallic background
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#3A3530');
  grad.addColorStop(0.5, '#2E2A25');
  grad.addColorStop(1, '#1E1C18');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 6 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(15,12,8,0.7)';
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 6 * S);
  ctx.stroke();

  // Gear
  var cx2 = x + w / 2, cy2 = y + h / 2;
  var gR = Math.min(w, h) * 0.26;
  var angle = tick * 0.018 + rotT * 2.0;
  var teeth = 6;
  var innerR = gR * 0.70, outerR = gR;
  var toothSpan = Math.PI * 2 / teeth;

  ctx.save();
  ctx.translate(cx2, cy2);
  ctx.rotate(angle);

  ctx.beginPath();
  for (var t = 0; t < teeth; t++) {
    var a0 = t * toothSpan;
    var a1 = a0 + toothSpan * 0.22;
    var a2 = a0 + toothSpan * 0.78;
    var a3 = a0 + toothSpan;
    if (t === 0) ctx.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    else         ctx.lineTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    ctx.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    ctx.lineTo(Math.cos(a3) * innerR, Math.sin(a3) * innerR);
  }
  ctx.closePath();

  var gGrad = ctx.createRadialGradient(-gR * 0.2, -gR * 0.2, 0, 0, 0, gR);
  gGrad.addColorStop(0, 'rgba(210,190,160,0.75)');
  gGrad.addColorStop(0.6, 'rgba(150,130,100,0.55)');
  gGrad.addColorStop(1, 'rgba(90,75,55,0.5)');
  ctx.fillStyle = gGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,55,35,0.45)';
  ctx.lineWidth = 0.8 * S;
  ctx.stroke();

  // Hub circle
  ctx.fillStyle = 'rgba(50,42,32,0.92)';
  ctx.beginPath(); ctx.arc(0, 0, gR * 0.38, 0, Math.PI * 2); ctx.fill();

  // Hub highlight
  ctx.fillStyle = 'rgba(190,170,140,0.28)';
  ctx.beginPath(); ctx.arc(-gR * 0.1, -gR * 0.12, gR * 0.14, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  // Rotation flash
  if (rotT > 0) {
    ctx.save();
    ctx.globalAlpha = rotT * 0.22;
    ctx.fillStyle = 'rgba(255,215,120,1)';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
  }

  // Top-left corner highlight
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.moveTo(x + 6 * S, y); ctx.lineTo(x + w - 6 * S, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 6 * S);
  ctx.lineTo(x + w - 4 * S, y + 4 * S); ctx.lineTo(x + 4 * S, y + 4 * S);
  ctx.lineTo(x + 4 * S, y + h * 0.28); ctx.lineTo(x, y + 6 * S);
  ctx.quadraticCurveTo(x, y, x + 6 * S, y); ctx.fill();

  ctx.restore();
}
