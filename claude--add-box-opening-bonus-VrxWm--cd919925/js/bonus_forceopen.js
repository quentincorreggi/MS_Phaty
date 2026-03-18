// ============================================================
// bonus_forceopen.js — Force Open bonus: tap to reveal any
//   unrevealed default box, even without adjacent empty cells
// ============================================================

// Button layout (computed in computeForceOpenLayout)
var forceOpenBtn = { x: 0, y: 0, w: 0, h: 0 };

function computeForceOpenLayout() {
  var btnW = 120 * S;
  var btnH = 36 * S;
  forceOpenBtn.w = btnW;
  forceOpenBtn.h = btnH;
  forceOpenBtn.x = W / 2 - btnW / 2;
  forceOpenBtn.y = 8 * S;
}

function isForceOpenTarget(idx) {
  var b = stock[idx];
  if (!b) return false;
  if (b.isTunnel || b.isWall || b.empty || b.used) return false;
  if (b.spawning || b.revealT > 0) return false;
  // Only unrevealed default boxes
  if (b.revealed) return false;
  if (b.boxType !== 'default' && b.boxType !== 'hidden') return false;
  return true;
}

function handleForceOpenTap(px, py) {
  // Check if the Force Open button was tapped
  var btn = forceOpenBtn;
  if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
    forceOpenActive = !forceOpenActive;
    return true;
  }

  // If force open is active, check if an unrevealed default box was tapped
  if (forceOpenActive) {
    for (var i = 0; i < stock.length; i++) {
      var b = stock[i];
      if (b.isTunnel || b.isWall || b.empty || b.used) continue;
      if (px >= b.x && px <= b.x + L.bw && py >= b.y && py <= b.y + L.bh) {
        if (isForceOpenTarget(i)) {
          // Force reveal and open the box
          b.revealed = true;
          b.revealT = 0;
          b.popT = 1;
          forceOpenFlashT = 1;
          sfx.pop();

          // Golden burst particles
          var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
          for (var p = 0; p < 24; p++) {
            var a = Math.PI * 2 * p / 24 + Math.random() * 0.3;
            var sp = 3 + Math.random() * 5;
            particles.push({
              x: bx, y: by,
              vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
              r: (2 + Math.random() * 4) * S,
              color: Math.random() > 0.5 ? '#FFD700' : '#FFA500',
              life: 1, decay: 0.02 + Math.random() * 0.015, grav: false
            });
          }

          // Spawn marbles just like a normal tap
          spawnBurst(bx, by, COLORS[b.ci].fill, 18);
          spawnPhysMarbles(b);
          damageAdjacentIce(i);

          forceOpenActive = false;
          return true;
        } else if (b.spawning || b.revealT > 0) {
          // Already animating, ignore
          return true;
        } else {
          // Not a valid target — shake it
          b.shakeT = 0.5;
          return true;
        }
      }
    }
  }

  return false;
}

function drawForceOpenButton() {
  computeForceOpenLayout();
  var btn = forceOpenBtn;
  var active = forceOpenActive;

  ctx.save();

  // Glow behind button when active
  if (active) {
    var pulse = 0.6 + Math.sin(tick * 0.1) * 0.2;
    ctx.shadowColor = 'rgba(255,215,0,' + pulse + ')';
    ctx.shadowBlur = 16 * S;
  }

  // Button background
  var grad = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
  if (active) {
    grad.addColorStop(0, '#FFD700');
    grad.addColorStop(1, '#E8A84C');
  } else {
    grad.addColorStop(0, 'rgba(180,165,145,0.85)');
    grad.addColorStop(1, 'rgba(160,140,120,0.85)');
  }
  ctx.fillStyle = grad;
  rRect(btn.x, btn.y, btn.w, btn.h, 10 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Border
  ctx.strokeStyle = active ? '#B8860B' : 'rgba(140,120,95,0.5)';
  ctx.lineWidth = 1.5 * S;
  rRect(btn.x, btn.y, btn.w, btn.h, 10 * S);
  ctx.stroke();

  // Label
  ctx.fillStyle = active ? '#5A3800' : '#5A4A38';
  ctx.font = 'bold ' + (12 * S) + 'px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Lock icon + text
  var iconSize = 8 * S;
  var textX = btn.x + btn.w / 2 + 4 * S;
  var textY = btn.y + btn.h / 2;

  // Draw a small lock/unlock icon
  var ix = btn.x + 18 * S;
  var iy = textY;
  ctx.strokeStyle = active ? '#5A3800' : '#5A4A38';
  ctx.lineWidth = 2 * S;
  ctx.lineCap = 'round';
  // Lock body
  ctx.fillStyle = active ? '#5A3800' : '#5A4A38';
  rRect(ix - iconSize * 0.5, iy - iconSize * 0.1, iconSize, iconSize * 0.7, 1.5 * S);
  ctx.fill();
  // Lock shackle
  ctx.beginPath();
  if (active) {
    // Open shackle
    ctx.arc(ix, iy - iconSize * 0.1, iconSize * 0.35, -Math.PI, -0.2);
  } else {
    // Closed shackle
    ctx.arc(ix, iy - iconSize * 0.1, iconSize * 0.35, -Math.PI, 0);
  }
  ctx.stroke();

  ctx.fillStyle = active ? '#5A3800' : '#5A4A38';
  ctx.fillText('FORCE OPEN', textX, textY);

  ctx.restore();
}

function drawForceOpenGridHighlight() {
  if (!forceOpenActive) return;

  // Draw pulsing gold border around the stock grid
  var pulse = 0.3 + Math.sin(tick * 0.08) * 0.2;
  var pad = 6 * S;
  var gx = L.sx - pad;
  var gy = L.sy - pad;
  var gw = L.cols * (L.bw + L.bg) - L.bg + pad * 2;
  var gh = L.rows * (L.bh + L.bg) - L.bg + pad * 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,215,0,' + pulse + ')';
  ctx.lineWidth = 3 * S;
  ctx.setLineDash([8 * S, 4 * S]);
  rRect(gx, gy, gw, gh, 10 * S);
  ctx.stroke();
  ctx.setLineDash([]);

  // Highlight valid targets with a subtle gold shimmer
  for (var i = 0; i < stock.length; i++) {
    if (isForceOpenTarget(i)) {
      var b = stock[i];
      var shimmer = 0.1 + Math.sin(tick * 0.06 + i * 0.5) * 0.08;
      ctx.fillStyle = 'rgba(255,215,0,' + shimmer + ')';
      rRect(b.x, b.y, L.bw, L.bh, 6 * S);
      ctx.fill();
    }
  }

  ctx.restore();
}

function updateForceOpenFlash() {
  if (forceOpenFlashT > 0) {
    forceOpenFlashT = Math.max(0, forceOpenFlashT - 0.03);
  }
}
