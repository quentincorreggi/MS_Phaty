// ============================================================
// lineopener.js — Line Opener booster
//   A one-use power that reveals all hidden boxes in a chosen row
//   with a cascading left-to-right animation.
// ============================================================

// ── Layout constants for the booster button ──
var LO_BTN_W_FACTOR = 44;   // base width in S units
var LO_BTN_H_FACTOR = 44;   // base height
var LO_BTN_MARGIN = 8;      // margin from right edge of grid

function getLineOpenerBtnRect() {
  var bw = LO_BTN_W_FACTOR * S;
  var bh = LO_BTN_H_FACTOR * S;
  var bx = L.gameRight - bw - LO_BTN_MARGIN * S;
  var by = L.sy - bh - 10 * S;
  return { x: bx, y: by, w: bw, h: bh };
}

// ── Reset state (called from initGame) ──
function lineOpenerReset(hasBooster) {
  lineOpenerAvailable = !!hasBooster;
  lineOpenerUsed = false;
  lineOpenerActive = false;
  lineOpenerHoverRow = -1;
  lineOpenerAnimating = false;
  lineOpenerAnimRow = -1;
  lineOpenerAnimCol = 0;
  lineOpenerAnimTimer = 0;
  lineOpenerBtnPulse = 0;
}

// ── Check if a row has any locked (unrevealed) boxes ──
function lineOpenerRowHasLocked(row) {
  for (var c = 0; c < L.cols; c++) {
    var b = stock[row * L.cols + c];
    if (b && !b.isTunnel && !b.isWall && !b.empty && !b.used && !b.revealed) {
      return true;
    }
  }
  return false;
}

// ── Activate: start the cascade reveal on the chosen row ──
function lineOpenerActivateRow(row) {
  // Check the row actually has locked boxes
  if (!lineOpenerRowHasLocked(row)) return false;

  lineOpenerActive = false;
  lineOpenerUsed = true;
  lineOpenerAnimating = true;
  lineOpenerAnimRow = row;
  lineOpenerAnimCol = 0;
  lineOpenerAnimTimer = 0;
  sfx.pop();
  return true;
}

// ── Update (called each frame from game update) ──
function lineOpenerUpdate() {
  if (!lineOpenerAvailable) return;

  // Button idle pulse
  if (!lineOpenerUsed && !lineOpenerActive) {
    lineOpenerBtnPulse = (lineOpenerBtnPulse + 0.03) % (Math.PI * 2);
  }

  // Cascade animation
  if (lineOpenerAnimating) {
    lineOpenerAnimTimer--;
    if (lineOpenerAnimTimer <= 0) {
      // Find the next unrevealed box in this row starting from lineOpenerAnimCol
      var revealed = false;
      while (lineOpenerAnimCol < L.cols) {
        var idx = lineOpenerAnimRow * L.cols + lineOpenerAnimCol;
        var b = stock[idx];
        lineOpenerAnimCol++;
        if (b && !b.isTunnel && !b.isWall && !b.empty && !b.used && !b.revealed) {
          // Reveal this box
          b.revealed = true;
          b.revealT = 1.0;
          b.popT = 0.8;
          // Golden particle burst
          var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
          for (var p = 0; p < 16; p++) {
            var a = Math.PI * 2 * p / 16 + Math.random() * 0.3;
            var sp = 3 + Math.random() * 4;
            particles.push({
              x: bx, y: by,
              vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
              r: (2 + Math.random() * 4) * S,
              color: Math.random() > 0.4 ? '#FFD700' : '#FFA500',
              life: 1, decay: 0.02 + Math.random() * 0.015, grav: false
            });
          }
          // Extra sparkle shimmer
          for (var p = 0; p < 6; p++) {
            var a = Math.random() * Math.PI * 2;
            var sp = 1 + Math.random() * 2;
            particles.push({
              x: bx, y: by,
              vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
              r: (1.5 + Math.random() * 2) * S,
              color: 'rgba(255,255,255,0.8)',
              life: 0.8, decay: 0.035, grav: false
            });
          }
          sfx.pop();
          revealed = true;
          lineOpenerAnimTimer = 6; // ~100ms stagger at 60fps
          break;
        }
      }
      if (!revealed) {
        // Done — cascade finished
        lineOpenerAnimating = false;
        lineOpenerAnimRow = -1;
        sfx.complete();
        // Trigger reveals around any newly revealed boxes that become empty
        for (var c = 0; c < L.cols; c++) {
          var idx = lineOpenerAnimRow * L.cols + c;
          // Not needed here since we just revealed, not used
        }
      }
    }
  }
}

// ── Draw the booster button ──
function drawLineOpenerButton() {
  if (!lineOpenerAvailable || lineOpenerUsed) return;

  var r = getLineOpenerBtnRect();
  var pulse = lineOpenerActive ? 0 : Math.sin(lineOpenerBtnPulse) * 0.04;
  var scale = 1 + pulse;

  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(scale, scale);

  // Button background
  var grad = ctx.createLinearGradient(-r.w / 2, -r.h / 2, -r.w / 2, r.h / 2);
  if (lineOpenerActive) {
    grad.addColorStop(0, '#FFE066');
    grad.addColorStop(1, '#E8A84C');
  } else {
    grad.addColorStop(0, '#FFD54F');
    grad.addColorStop(1, '#F0A030');
  }

  ctx.shadowColor = lineOpenerActive ? 'rgba(255,200,50,0.5)' : 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = lineOpenerActive ? 12 * S : 5 * S;
  ctx.shadowOffsetY = lineOpenerActive ? 0 : 2 * S;
  ctx.fillStyle = grad;
  rRect(-r.w / 2, -r.h / 2, r.w, r.h, 10 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = lineOpenerActive ? '#C48820' : 'rgba(180,130,50,0.4)';
  ctx.lineWidth = 1.5 * S;
  rRect(-r.w / 2, -r.h / 2, r.w, r.h, 10 * S);
  ctx.stroke();

  // Lightning bolt icon
  var iS = r.h * 0.32;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(-iS * 0.1, -iS * 0.55);
  ctx.lineTo(iS * 0.35, -iS * 0.55);
  ctx.lineTo(iS * 0.05, -iS * 0.05);
  ctx.lineTo(iS * 0.3, -iS * 0.05);
  ctx.lineTo(-iS * 0.2, iS * 0.6);
  ctx.lineTo(-iS * 0.0, iS * 0.1);
  ctx.lineTo(-iS * 0.3, iS * 0.1);
  ctx.closePath();
  ctx.fill();

  // Active glow ring
  if (lineOpenerActive) {
    ctx.strokeStyle = 'rgba(255,220,80,0.6)';
    ctx.lineWidth = 2 * S;
    rRect(-r.w / 2 - 3 * S, -r.h / 2 - 3 * S, r.w + 6 * S, r.h + 6 * S, 12 * S);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Draw row highlight when in selection mode ──
function drawLineOpenerRowHighlight() {
  if (!lineOpenerActive || lineOpenerHoverRow < 0) return;

  var row = lineOpenerHoverRow;
  var x = L.sx - 4 * S;
  var y = L.sy + row * (L.bh + L.bg) - 4 * S;
  var w = L.cols * (L.bw + L.bg) - L.bg + 8 * S;
  var h = L.bh + 8 * S;

  ctx.save();

  // Glow band
  ctx.fillStyle = 'rgba(255,215,0,0.12)';
  rRect(x, y, w, h, 8 * S);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255,200,50,0.5)';
  ctx.lineWidth = 2 * S;
  ctx.setLineDash([6 * S, 4 * S]);
  rRect(x, y, w, h, 8 * S);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ── Draw the cascade animation shimmer line ──
function drawLineOpenerCascade() {
  if (!lineOpenerAnimating || lineOpenerAnimRow < 0) return;

  // Draw a traveling golden shimmer across the row
  var progress = lineOpenerAnimCol / L.cols;
  var shimmerX = L.sx + progress * (L.cols * (L.bw + L.bg));
  var shimmerY = L.sy + lineOpenerAnimRow * (L.bh + L.bg) + L.bh / 2;

  ctx.save();
  var grad = ctx.createRadialGradient(shimmerX, shimmerY, 0, shimmerX, shimmerY, 30 * S);
  grad.addColorStop(0, 'rgba(255,215,0,0.35)');
  grad.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(shimmerX, shimmerY, 30 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Input: handle tap on the booster button ──
function lineOpenerHandleTap(px, py) {
  if (!lineOpenerAvailable || lineOpenerUsed || lineOpenerAnimating) return false;

  var r = getLineOpenerBtnRect();

  // Check button tap
  if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
    lineOpenerActive = !lineOpenerActive;
    lineOpenerHoverRow = -1;
    return true;
  }

  // If active, check row selection
  if (lineOpenerActive) {
    // Check if tap is within the grid area
    if (px >= L.sx && px <= L.sx + L.cols * (L.bw + L.bg) - L.bg &&
        py >= L.sy && py <= L.sy + L.rows * (L.bh + L.bg) - L.bg) {
      var row = Math.floor((py - L.sy) / (L.bh + L.bg));
      if (row >= 0 && row < L.rows) {
        if (lineOpenerActivateRow(row)) {
          return true;
        } else {
          // Row has no locked boxes — shake feedback
          // Just let it pass through
        }
      }
    }
    // Tap outside grid while active — cancel
    lineOpenerActive = false;
    lineOpenerHoverRow = -1;
    return true;
  }

  return false;
}

// ── Mouse move: update hover row ──
function lineOpenerHandleMouseMove(px, py) {
  if (!lineOpenerActive) { lineOpenerHoverRow = -1; return false; }

  if (px >= L.sx && px <= L.sx + L.cols * (L.bw + L.bg) - L.bg &&
      py >= L.sy && py <= L.sy + L.rows * (L.bh + L.bg) - L.bg) {
    var row = Math.floor((py - L.sy) / (L.bh + L.bg));
    if (row >= 0 && row < L.rows && lineOpenerRowHasLocked(row)) {
      lineOpenerHoverRow = row;
    } else {
      lineOpenerHoverRow = -1;
    }
  } else {
    lineOpenerHoverRow = -1;
  }
  return lineOpenerActive;
}
