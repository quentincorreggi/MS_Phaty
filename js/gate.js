// ============================================================
// gate.js — Pivoting blocker gate above the funnel exit
// ============================================================
// A rigid arm pivots from the center of the funnel bend point,
// blocking one half of the funnel exit. Every N box taps, the
// gate swings to the opposite side.
// ============================================================

function initGate() {
  if (!gateEnabled) { gateWalls = []; return; }
  gateSide = 'left';
  gateTapCount = 0;
  gateSwapT = 0;
  computeGateTargetAngle();
  gateAngle = gateTargetAngle;
  updateGateWalls();
}

function computeGateTargetAngle() {
  var pivotY = L.funnelBendY;
  var exitL = L.funnelCx - L.funnelOpenW / 2;
  var exitR = L.funnelCx + L.funnelOpenW / 2;
  var dy = L.funnelBot - pivotY;
  if (gateSide === 'left') {
    gateTargetAngle = Math.atan2(exitL - L.funnelCx, dy);
  } else {
    gateTargetAngle = Math.atan2(exitR - L.funnelCx, dy);
  }
}

function getGateArmLength() {
  var exitL = L.funnelCx - L.funnelOpenW / 2;
  var dx = exitL - L.funnelCx;
  var dy = L.funnelBot - L.funnelBendY;
  return Math.sqrt(dx * dx + dy * dy);
}

function updateGateWalls() {
  gateWalls = [];
  if (!gateEnabled) return;
  var pivotX = L.funnelCx;
  var pivotY = L.funnelBendY;
  var armLen = getGateArmLength();
  var endX = pivotX + Math.sin(gateAngle) * armLen;
  var endY = pivotY + Math.cos(gateAngle) * armLen;
  gateWalls.push({ x1: pivotX, y1: pivotY, x2: endX, y2: endY });
}

function updateGate() {
  if (!gateEnabled) return;
  var diff = gateTargetAngle - gateAngle;
  if (Math.abs(diff) > 0.001) {
    gateAngle += diff * 0.12;
    updateGateWalls();
  } else if (gateAngle !== gateTargetAngle) {
    gateAngle = gateTargetAngle;
    updateGateWalls();
  }
  if (gateSwapT > 0) gateSwapT = Math.max(0, gateSwapT - 0.04);
}

function gateOnBoxTap() {
  if (!gateEnabled) return;
  gateTapCount++;
  if (gateTapCount >= gateTapsToSwap) {
    gateTapCount = 0;
    gateSide = (gateSide === 'left') ? 'right' : 'left';
    computeGateTargetAngle();
    gateSwapT = 1.0;
    sfx.pop();
  }
}

function drawGate() {
  if (!gateEnabled) return;
  var pivotX = L.funnelCx;
  var pivotY = L.funnelBendY;
  var armLen = getGateArmLength();
  var endX = pivotX + Math.sin(gateAngle) * armLen;
  var endY = pivotY + Math.cos(gateAngle) * armLen;

  ctx.save();

  // Arm shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 6 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivotX + 1 * S, pivotY + 2 * S);
  ctx.lineTo(endX + 1 * S, endY + 2 * S);
  ctx.stroke();

  // Main arm
  ctx.strokeStyle = 'rgba(90,75,60,0.85)';
  ctx.lineWidth = 4 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Arm highlight
  ctx.strokeStyle = 'rgba(200,185,165,0.35)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(pivotX + 0.8 * S, pivotY - 0.5 * S);
  ctx.lineTo(endX + 0.8 * S, endY - 0.5 * S);
  ctx.stroke();

  // Pivot circle (shadow)
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.arc(pivotX + 1 * S, pivotY + 1.5 * S, 6 * S, 0, Math.PI * 2);
  ctx.fill();

  // Pivot circle
  var pivGrad = ctx.createRadialGradient(pivotX - 1 * S, pivotY - 1 * S, 1 * S, pivotX, pivotY, 6 * S);
  pivGrad.addColorStop(0, 'rgba(180,165,145,0.9)');
  pivGrad.addColorStop(1, 'rgba(90,75,60,0.9)');
  ctx.fillStyle = pivGrad;
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 5.5 * S, 0, Math.PI * 2);
  ctx.fill();

  // Pivot shine
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(pivotX - 1.5 * S, pivotY - 1.5 * S, 2 * S, 0, Math.PI * 2);
  ctx.fill();

  // Tap counter dots
  var dotR = 3 * S;
  var dotGap = dotR * 2.8;
  var dotY = pivotY - 12 * S;
  var dotStartX = pivotX - (gateTapsToSwap - 1) * dotGap / 2;

  // Counter pill background
  var pillW = (gateTapsToSwap - 1) * dotGap + dotR * 4;
  var pillH = dotR * 2.8;
  ctx.fillStyle = 'rgba(90,75,60,0.08)';
  rRect(pivotX - pillW / 2, dotY - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();

  for (var i = 0; i < gateTapsToSwap; i++) {
    var dx = dotStartX + i * dotGap;
    if (i < gateTapCount) {
      ctx.fillStyle = 'rgba(90,75,60,0.65)';
      ctx.beginPath();
      ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
      ctx.fill();
      // Shine on filled dot
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(dx - dotR * 0.2, dotY - dotR * 0.2, dotR * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(90,75,60,0.3)';
      ctx.lineWidth = 1 * S;
      ctx.setLineDash([2 * S, 2 * S]);
      ctx.beginPath();
      ctx.arc(dx, dotY, dotR * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Swap flash effect
  if (gateSwapT > 0.5) {
    var flash = (gateSwapT - 0.5) * 2;
    ctx.globalAlpha = flash * 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 14 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
