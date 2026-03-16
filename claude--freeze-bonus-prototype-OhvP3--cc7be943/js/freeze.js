// ============================================================
// freeze.js — Freeze Bonus mechanic
// Freezes all marbles currently in the funnel for 7 seconds.
// Frozen marbles are semi-transparent, gravity-free, and
// non-colliding with other marbles.
// ============================================================

function initFreeze() {
  freezeActive = false;
  freezeTimer = 0;
  for (var i = 0; i < physMarbles.length; i++) {
    physMarbles[i].frozen = false;
  }
}

function activateFreeze() {
  if (freezeActive || won || !gameActive) return;
  freezeActive = true;
  freezeTimer = FREEZE_DURATION;
  // Freeze all current funnel marbles in place
  for (var i = 0; i < physMarbles.length; i++) {
    physMarbles[i].frozen = true;
    physMarbles[i].frozenX = physMarbles[i].x;
    physMarbles[i].frozenY = physMarbles[i].y;
    physMarbles[i].vx = 0;
    physMarbles[i].vy = 0;
  }
  // Ice particles on each frozen marble
  for (var i = 0; i < physMarbles.length; i++) {
    spawnBurst(physMarbles[i].x, physMarbles[i].y, '#88CCFF', 8);
  }
  sfx.pop();
}

function updateFreeze() {
  if (!freezeActive) return;
  freezeTimer--;
  // Lock frozen marbles in place each frame (overrides physics)
  for (var i = 0; i < physMarbles.length; i++) {
    var m = physMarbles[i];
    if (m.frozen) {
      m.x = m.frozenX;
      m.y = m.frozenY;
      m.vx = 0;
      m.vy = 0;
    }
  }
  if (freezeTimer <= 0) {
    freezeActive = false;
    // Thaw — give marbles a tiny random nudge so they fall again
    for (var i = 0; i < physMarbles.length; i++) {
      if (physMarbles[i].frozen) {
        physMarbles[i].frozen = false;
        physMarbles[i].vx = (Math.random() - 0.5) * S;
        physMarbles[i].vy = S * 0.5;
        spawnBurst(physMarbles[i].x, physMarbles[i].y, '#FFFFFF', 5);
      }
    }
    sfx.pop();
  }
}

function getFreezeButtonRect() {
  var btnW = 110 * S;
  var btnH = 34 * S;
  return {
    x: W / 2 - btnW / 2,
    y: 8 * S,
    w: btnW,
    h: btnH
  };
}

function isFreezeButtonTap(px, py) {
  var r = getFreezeButtonRect();
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function drawFreezeButton() {
  if (!gameActive) return;
  var r = getFreezeButtonRect();
  ctx.save();

  // Background
  var alpha;
  if (freezeActive) {
    alpha = 0.75 + Math.sin(tick * 0.18) * 0.2;
    ctx.fillStyle = 'rgba(100,190,255,' + alpha + ')';
    ctx.shadowColor = 'rgba(100,190,255,0.7)';
    ctx.shadowBlur = 14 * S;
  } else {
    ctx.fillStyle = 'rgba(90,170,255,0.82)';
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 5 * S;
  }
  ctx.shadowOffsetY = 2 * S;
  rRect(r.x, r.y, r.w, r.h, 10 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Label
  ctx.fillStyle = 'white';
  ctx.font = 'bold ' + (13 * S) + 'px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var label;
  if (freezeActive) {
    var secsLeft = Math.ceil(freezeTimer / 60);
    label = '\u2744 Freeze ' + secsLeft + 's';
  } else {
    label = '\u2744 Freeze';
  }
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  ctx.restore();
}
