// ============================================================
// container.js — Button Box / Container mechanic
//
// Container cells cover hidden boxes until the paired Button Box
// is tapped. Gold = pair 0, Purple = pair 1.
// ============================================================

var CONTAINER_PAIR_COLORS = [
  { fill: '#F5A623', light: '#FFD070', dark: '#C47E10', glow: 'rgba(245,166,35,0.5)', name: 'Gold' },
  { fill: '#9B59B6', light: '#C389E2', dark: '#7B4FA8', glow: 'rgba(155,89,182,0.5)', name: 'Purple' }
];

function drawContainerCellOnGrid(ctx, b, bw, bh, S, tick) {
  var pair = CONTAINER_PAIR_COLORS[b.containerId] || CONTAINER_PAIR_COLORS[0];
  var x = b.x, y = b.y;
  var unlockT = b.containerUnlockT || 0;

  ctx.save();

  if (unlockT > 0) {
    var phase = 1 - unlockT;
    ctx.globalAlpha = unlockT;
    ctx.translate(x + bw / 2, y + bh / 2);
    ctx.scale(1 + phase * 0.5, 1 + phase * 0.5);
    ctx.translate(-(x + bw / 2), -(y + bh / 2));
  }

  // Background
  var grad = ctx.createLinearGradient(x, y, x + bw, y + bh);
  grad.addColorStop(0, pair.light);
  grad.addColorStop(1, pair.fill);
  ctx.fillStyle = grad;
  rRect(x, y, bw, bh, 8 * S);
  ctx.fill();

  // Inset shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  rRect(x + 3 * S, y + 4 * S, bw - 6 * S, bh - 6 * S, 5 * S);
  ctx.fill();

  // Border
  ctx.strokeStyle = pair.dark;
  ctx.lineWidth = 2 * S;
  rRect(x, y, bw, bh, 8 * S);
  ctx.stroke();

  // Padlock icon
  var lx = x + bw / 2, ly = y + bh / 2 + 2 * S;
  var lr = Math.min(bw, bh) * 0.17;

  ctx.beginPath();
  ctx.arc(lx, ly - lr * 1.15, lr * 0.95, Math.PI, 0, false);
  ctx.strokeStyle = pair.dark;
  ctx.lineWidth = 2.5 * S;
  ctx.stroke();

  var lbw = lr * 1.7, lbh = lr * 1.25;
  ctx.fillStyle = pair.dark;
  rRect(lx - lbw / 2, ly - lr * 0.1, lbw, lbh, 3 * S);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(lx, ly + lr * 0.45, lr * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = pair.light;
  ctx.fill();

  ctx.restore();
}

// Closed/unrevealed state — center-relative coordinates (called inside ctx.translate to center)
function drawButtonBoxClosedState(ctx, x, y, w, h, S, tick, containerId) {
  var pair = CONTAINER_PAIR_COLORS[containerId] || CONTAINER_PAIR_COLORS[0];
  var cx = x + w / 2, cy = y + h / 2;

  // Dark background
  var bgGrad = ctx.createLinearGradient(x, y, x, y + h);
  bgGrad.addColorStop(0, '#3A3040');
  bgGrad.addColorStop(1, '#1E1828');
  ctx.fillStyle = bgGrad;
  rRect(x, y, w, h, 8 * S);
  ctx.fill();

  // Colored border
  ctx.strokeStyle = pair.fill;
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 8 * S);
  ctx.stroke();

  // Pulsing button circle
  var pulse = 1 + Math.sin(tick * 0.07) * 0.035;
  var r = Math.min(w, h) * 0.3 * pulse;

  ctx.beginPath();
  ctx.arc(cx, cy, r + 5 * S, 0, Math.PI * 2);
  ctx.strokeStyle = pair.glow;
  ctx.lineWidth = 2.5 * S;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  var btnGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.05, cx, cy, r);
  btnGrad.addColorStop(0, pair.light);
  btnGrad.addColorStop(0.55, pair.fill);
  btnGrad.addColorStop(1, pair.dark);
  ctx.fillStyle = btnGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx - r * 0.22, cy - r * 0.28, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();

  // Pair letter badge
  ctx.font = 'bold ' + Math.round(9 * S) + 'px sans-serif';
  ctx.fillStyle = pair.light;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(pair.name[0], x + w - 4 * S, y + h - 3 * S);
}

// Small badge drawn on the revealed/open box to identify it as the container button
function drawButtonBoxBadge(ctx, x, y, w, h, S, tick, containerId) {
  var pair = CONTAINER_PAIR_COLORS[containerId] || CONTAINER_PAIR_COLORS[0];
  var bx = x + w - 7 * S, by = y + 7 * S;
  var r = 5 * S * (1 + Math.sin(tick * 0.1) * 0.15);

  ctx.beginPath();
  ctx.arc(bx, by, r + 2 * S, 0, Math.PI * 2);
  ctx.strokeStyle = pair.glow;
  ctx.lineWidth = 2 * S;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = pair.fill;
  ctx.fill();
}

// Trigger unlock — called from handleTap
function unlockContainerPair(containerId) {
  var pair = CONTAINER_PAIR_COLORS[containerId] || CONTAINER_PAIR_COLORS[0];
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b.isContainerCell || b.containerId !== containerId) continue;
    b.containerUnlockT = 1.0;
    var bx = b.x + L.bw / 2, by2 = b.y + L.bh / 2;
    for (var p = 0; p < 14; p++) {
      var ang = Math.PI * 2 * p / 14 + Math.random() * 0.35;
      var sp = 2.5 + Math.random() * 5;
      particles.push({ x: bx, y: by2, vx: Math.cos(ang) * sp * S, vy: Math.sin(ang) * sp * S,
        r: (2 + Math.random() * 4) * S, color: pair.fill, life: 1, decay: 0.02 + Math.random() * 0.015, grav: false });
    }
    for (var p = 0; p < 5; p++) {
      var ang = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      particles.push({ x: bx, y: by2, vx: Math.cos(ang) * sp * S, vy: Math.sin(ang) * sp * S,
        r: (3 + Math.random() * 3) * S, color: pair.light, life: 0.6, decay: 0.035, grav: true });
    }
  }
}
