// ============================================================
// timefreeze.js — Time Freeze Bonus mechanic
//   Button at top of grid, freezes funnel marbles for 5 seconds.
//   Frozen marbles stay in place, don't collide with new marbles.
// ============================================================

// --- Activation ---
function activateFreeze() {
  if (!freezeAvailable || freezeActive) return;
  freezeActive = true;
  freezeTimer = FREEZE_DURATION;
  freezeFlashT = 1.0;

  // Mark all current physMarbles as frozen
  for (var i = 0; i < physMarbles.length; i++) {
    physMarbles[i].frozen = true;
    // Store velocity so we can restore it later
    physMarbles[i].frozenVx = physMarbles[i].vx;
    physMarbles[i].frozenVy = physMarbles[i].vy;
    physMarbles[i].vx = 0;
    physMarbles[i].vy = 0;
  }

  // Sound: crisp freeze chime
  sfxFreeze();

  // Snowflake burst particles from funnel center
  var cx = L.funnelCx;
  var cy = (L.funnelTop + L.funnelBot) / 2;
  for (var p = 0; p < 30; p++) {
    var a = Math.PI * 2 * p / 30 + Math.random() * 0.3;
    var sp = 3 + Math.random() * 5;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp * S,
      vy: Math.sin(a) * sp * S,
      r: (2 + Math.random() * 4) * S,
      color: Math.random() > 0.5 ? 'rgba(126,200,227,0.9)' : 'rgba(200,230,255,0.9)',
      life: 1, decay: 0.015 + Math.random() * 0.01, grav: false
    });
  }
}

// --- Update (called each frame) ---
function updateFreeze() {
  if (!freezeActive) return;

  freezeTimer--;
  if (freezeFlashT > 0) freezeFlashT = Math.max(0, freezeFlashT - 0.04);

  if (freezeTimer <= 0) {
    // Unfreeze all marbles
    freezeActive = false;
    freezeTimer = 0;
    for (var i = 0; i < physMarbles.length; i++) {
      if (physMarbles[i].frozen) {
        physMarbles[i].frozen = false;
        physMarbles[i].vx = physMarbles[i].frozenVx || 0;
        physMarbles[i].vy = physMarbles[i].frozenVy || 0;
        delete physMarbles[i].frozenVx;
        delete physMarbles[i].frozenVy;
      }
    }
    // Unfreeze burst
    sfxUnfreeze();
    var cx = L.funnelCx;
    var cy = (L.funnelTop + L.funnelBot) / 2;
    for (var p = 0; p < 15; p++) {
      var a = Math.PI * 2 * p / 15 + Math.random() * 0.4;
      var sp = 2 + Math.random() * 3;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp * S,
        vy: Math.sin(a) * sp * S,
        r: (1.5 + Math.random() * 3) * S,
        color: 'rgba(200,230,255,0.7)',
        life: 0.6, decay: 0.03 + Math.random() * 0.02, grav: false
      });
    }
  }

  // Sparkle particles on frozen marbles
  if (tick % 6 === 0) {
    for (var i = 0; i < physMarbles.length; i++) {
      var m = physMarbles[i];
      if (!m.frozen) continue;
      if (Math.random() > 0.4) continue;
      particles.push({
        x: m.x + (Math.random() - 0.5) * m.r * 2,
        y: m.y + (Math.random() - 0.5) * m.r * 2,
        vx: (Math.random() - 0.5) * 0.5 * S,
        vy: -0.5 * S - Math.random() * 0.5 * S,
        r: (1 + Math.random() * 2) * S,
        color: 'rgba(200,230,255,0.8)',
        life: 0.5, decay: 0.04, grav: false
      });
    }
  }
}

// --- Sound effects ---
function sfxFreeze() {
  // High-pitched crystalline chime
  tone(1200, 0.3, 'sine', 0.12, 600);
  setTimeout(function () { tone(1600, 0.2, 'sine', 0.08, 800); }, 60);
  setTimeout(function () { tone(2000, 0.15, 'sine', 0.06, 1000); }, 120);
}

function sfxUnfreeze() {
  tone(600, 0.15, 'sine', 0.08, 1200);
  setTimeout(function () { tone(900, 0.12, 'sine', 0.06); }, 50);
}

// --- Draw freeze button ---
function drawFreezeButton() {
  if (!freezeAvailable) return;

  var bx = L.freezeBtnX;
  var by = L.freezeBtnY;
  var bw = L.freezeBtnW;
  var bh = L.freezeBtnH;
  var r = 10 * S;

  ctx.save();

  // Active or available
  var pulse = freezeActive ? 0 : Math.sin(tick * 0.06) * 0.04;
  var sc = 1 + pulse;

  ctx.translate(bx + bw / 2, by + bh / 2);
  ctx.scale(sc, sc);

  // Button background
  var grad;
  if (freezeActive) {
    grad = ctx.createLinearGradient(-bw / 2, -bh / 2, -bw / 2, bh / 2);
    grad.addColorStop(0, '#5AA8CC');
    grad.addColorStop(1, '#3878A8');
  } else {
    grad = ctx.createLinearGradient(-bw / 2, -bh / 2, -bw / 2, bh / 2);
    grad.addColorStop(0, '#A0DEFF');
    grad.addColorStop(1, '#7EC8E3');
  }
  ctx.shadowColor = 'rgba(126,200,227,0.4)';
  ctx.shadowBlur = 8 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = grad;
  rRect(-bw / 2, -bh / 2, bw, bh, r); ctx.fill();

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = freezeActive ? '#2A5880' : '#5aaac8';
  ctx.lineWidth = 1.5 * S;
  rRect(-bw / 2, -bh / 2, bw, bh, r); ctx.stroke();

  // Snowflake icon
  ctx.fillStyle = 'white';
  ctx.font = 'bold ' + (bh * 0.45) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('\u2744', 0, 0);

  // Flash overlay on activation
  if (freezeFlashT > 0) {
    ctx.globalAlpha = freezeFlashT * 0.5;
    ctx.fillStyle = 'white';
    rRect(-bw / 2, -bh / 2, bw, bh, r); ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Countdown text when active
  if (freezeActive) {
    var secsLeft = Math.ceil(freezeTimer / 60);
    ctx.save();
    ctx.fillStyle = 'rgba(42,88,128,0.85)';
    ctx.font = 'bold ' + (12 * S) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(secsLeft + 's', bx + bw / 2, by + bh + 3 * S);
    ctx.restore();
  }
}

// --- Draw freeze overlay on funnel when active ---
function drawFreezeOverlay() {
  if (!freezeActive) return;

  ctx.save();
  // Subtle blue tint over the entire funnel area
  var alpha = 0.06 + Math.sin(tick * 0.05) * 0.02;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#7EC8E3';
  ctx.fillRect(L.funnelLeft, L.funnelTop, L.funnelRight - L.funnelLeft, L.funnelBot - L.funnelTop);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// --- Check if tap hit freeze button ---
function isFreezeButtonTap(px, py) {
  if (!freezeAvailable || freezeActive) return false;
  return px >= L.freezeBtnX && px <= L.freezeBtnX + L.freezeBtnW &&
         py >= L.freezeBtnY && py <= L.freezeBtnY + L.freezeBtnH;
}
