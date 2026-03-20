// ============================================================
// box_blocker.js — Blocker modifier drawing helpers
// Blocker is a MODIFIER on any box type (default, hidden, ice),
// not a separate type. Boxes with blocker: true contain
// BLOCKER_PER_BOX yellow/black striped marbles that can only
// land on dedicated blocker belt slots.
// ============================================================

function drawBlockerMarble(x, y, r, es) {
  var rs = r * (es || 1);
  var bc = COLORS[BLOCKER_CI];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = rs * 0.6; ctx.shadowOffsetY = rs * 0.15;
  var grad = ctx.createRadialGradient(x - rs * 0.25, y - rs * 0.25, rs * 0.1, x, y, rs);
  grad.addColorStop(0, bc.light); grad.addColorStop(0.7, bc.fill); grad.addColorStop(1, bc.dark);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, rs, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Black diagonal stripes
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, rs * 0.92, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = 'rgba(20,20,10,0.55)';
  ctx.lineWidth = rs * 0.25;
  var gap = rs * 0.6;
  for (var d = -rs * 2; d < rs * 2; d += gap) {
    ctx.beginPath();
    ctx.moveTo(x + d, y - rs);
    ctx.lineTo(x + d - rs * 1.4, y + rs);
    ctx.stroke();
  }
  ctx.restore();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.arc(x - rs * 0.25, y - rs * 0.25, rs * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBlockerBoxOverlay(x, y, w, h, S) {
  // Yellow/black cross-hatch overlay on box
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  rRect(x, y, w, h, 6 * S);
  ctx.clip();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2.5 * S;
  var gap = 8 * S;
  for (var d = -w; d < w + h; d += gap) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d - h, y + h);
    ctx.stroke();
  }
  ctx.restore();

  // 3 small yellow/black dot indicators at bottom
  ctx.save();
  ctx.globalAlpha = 0.7;
  var dotR = w * 0.07;
  var dotY2 = y + h * 0.78;
  var dotGap = w * 0.22;
  var dotCx = x + w / 2;
  for (var d = -1; d <= 1; d++) {
    var dx = dotCx + d * dotGap;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(dx, dotY2, dotR, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(dx, dotY2, dotR * 0.85, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(20,20,10,0.5)';
    ctx.lineWidth = dotR * 0.45;
    ctx.beginPath();
    ctx.moveTo(dx - dotR, dotY2 - dotR * 0.5);
    ctx.lineTo(dx + dotR, dotY2 + dotR * 0.5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawBlockerBeltSlot(x, y, r, tick, filled, openPhase) {
  ctx.save();

  var displayR = r;
  if (openPhase > 0 && openPhase < 1) {
    // Shake during phase 1
    if (openPhase > 0.5) {
      var shake = Math.sin(openPhase * 40) * 2 * S * (openPhase - 0.5);
      x += shake;
    }
  }

  // Base yellow circle
  ctx.fillStyle = filled ? 'rgba(255,215,0,0.45)' : 'rgba(255,215,0,0.2)';
  ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
  ctx.beginPath(); ctx.arc(x, y, displayR, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Black/yellow hazard stripes inside slot
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, displayR * 0.92, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = 'rgba(20,20,10,0.25)';
  ctx.lineWidth = displayR * 0.35;
  var gap = displayR * 0.7;
  for (var d = -displayR * 2; d < displayR * 2; d += gap) {
    ctx.beginPath();
    ctx.moveTo(x + d, y - displayR);
    ctx.lineTo(x + d - displayR * 1.2, y + displayR);
    ctx.stroke();
  }
  ctx.restore();

  // Border
  ctx.strokeStyle = filled ? 'rgba(180,150,0,0.5)' : 'rgba(180,150,0,0.3)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.arc(x, y, displayR, 0, Math.PI * 2); ctx.stroke();

  ctx.restore();
}
