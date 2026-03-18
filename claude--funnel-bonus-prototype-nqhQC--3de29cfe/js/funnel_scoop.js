// ============================================================
// funnel_scoop.js — Funnel Scoop bonus mechanic
// Lets the player grab up to 9 marbles of one color from the
// funnel and store them in a ghost box. Tap the ghost box to
// release them back into physics.
// ============================================================

var scoopGhostBoxes = [];   // array of { ci, marbles: [{x,y,vx,vy,r}], cx, cy, popT, pulseT, releaseT, absorbT }
var scoopBtnShakeT = 0;     // shake timer when funnel is empty

// ── Layout helpers ──

function getScoopBtnRect() {
  // Place the button just to the left of the funnel top
  var size = 40 * S;
  var bx = L.funnelLeft - size - 12 * S;
  var by = L.funnelTop + 10 * S;
  return { x: bx, y: by, w: size, h: size };
}

function getScoopGhostPos(index) {
  // Ghost boxes sit at the center of the funnel, stacked slightly offset
  var cx = L.funnelCx;
  var cy = (L.funnelTop + L.funnelBendY) / 2;
  // Offset each ghost box so they don't overlap completely
  var offset = index * 20 * S;
  return { x: cx - 15 * S + offset, y: cy };
}

// ── Core logic ──

function scoopActivate() {
  if (!gameActive || won) return;
  if (physMarbles.length === 0) {
    scoopBtnShakeT = 0.5;
    return;
  }

  // Count marbles per color in the funnel
  var counts = [];
  for (var c = 0; c < NUM_COLORS; c++) counts.push(0);
  for (var i = 0; i < physMarbles.length; i++) {
    var ci = physMarbles[i].ci;
    if (ci < NUM_COLORS) counts[ci]++;
  }

  // Exclude colors already captured in ghost boxes
  for (var g = 0; g < scoopGhostBoxes.length; g++) {
    counts[scoopGhostBoxes[g].ci] = 0;
  }

  // Find the most common remaining color
  var bestCi = -1, bestCount = 0;
  for (var c = 0; c < NUM_COLORS; c++) {
    if (counts[c] > bestCount) { bestCount = counts[c]; bestCi = c; }
  }

  if (bestCi < 0 || bestCount === 0) {
    scoopBtnShakeT = 0.5;
    return;
  }

  // Grab up to 9 marbles of this color
  var grabbed = [];
  for (var i = physMarbles.length - 1; i >= 0 && grabbed.length < 9; i--) {
    if (physMarbles[i].ci === bestCi) {
      grabbed.push(physMarbles[i]);
      physMarbles.splice(i, 1);
    }
  }

  if (grabbed.length === 0) {
    scoopBtnShakeT = 0.5;
    return;
  }

  // Create a ghost box
  var pos = getScoopGhostPos(scoopGhostBoxes.length);
  var ghost = {
    ci: bestCi,
    count: grabbed.length,
    cx: pos.x,
    cy: pos.y,
    popT: 1.0,
    pulseT: 0,
    releaseT: 0,
    absorbT: 1.0
  };
  scoopGhostBoxes.push(ghost);

  // Particles: whoosh effect toward ghost box
  for (var i = 0; i < grabbed.length; i++) {
    var m = grabbed[i];
    spawnBurst(m.x, m.y, COLORS[bestCi].fill, 4);
  }
  spawnBurst(ghost.cx, ghost.cy, COLORS[bestCi].light, 10);

  // Sound: whoosh
  tone(500, 0.15, 'sine', 0.08, 800);
  setTimeout(function() { tone(700, 0.1, 'sine', 0.06); }, 80);
}

function scoopReleaseGhost(index) {
  if (index < 0 || index >= scoopGhostBoxes.length) return;
  var ghost = scoopGhostBoxes[index];
  if (ghost.releaseT > 0) return; // already releasing

  // Spawn marbles back into physics from ghost box position
  var MR = getMR();
  for (var i = 0; i < ghost.count; i++) {
    var angle = (Math.PI * 2 * i) / ghost.count;
    var speed = 2 + Math.random() * 3;
    var vx = Math.cos(angle) * speed * S;
    var vy = -(2 + Math.random() * 3) * S;
    physMarbles.push({
      x: ghost.cx + (Math.random() - 0.5) * 10 * S,
      y: ghost.cy + (Math.random() - 0.5) * 10 * S,
      vx: vx, vy: vy,
      ci: ghost.ci, r: MR, spawnT: 1.0
    });
  }

  // Particles
  spawnBurst(ghost.cx, ghost.cy, COLORS[ghost.ci].fill, 18);
  sfx.pop();

  // Remove ghost box
  scoopGhostBoxes.splice(index, 1);

  // Reposition remaining ghost boxes
  for (var g = 0; g < scoopGhostBoxes.length; g++) {
    var pos = getScoopGhostPos(g);
    scoopGhostBoxes[g].cx = pos.x;
    scoopGhostBoxes[g].cy = pos.y;
  }
}

// ── Input handling ──

function scoopHandleTap(px, py) {
  // Check ghost box taps first (reverse order so topmost gets priority)
  var ghostSize = 36 * S;
  for (var i = scoopGhostBoxes.length - 1; i >= 0; i--) {
    var ghost = scoopGhostBoxes[i];
    if (px >= ghost.cx - ghostSize / 2 && px <= ghost.cx + ghostSize / 2 &&
        py >= ghost.cy - ghostSize / 2 && py <= ghost.cy + ghostSize / 2) {
      scoopReleaseGhost(i);
      return true;
    }
  }

  // Check scoop button tap
  var btn = getScoopBtnRect();
  if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
    scoopActivate();
    return true;
  }

  return false;
}

// ── Update (called from game.js update) ──

function scoopUpdate() {
  if (scoopBtnShakeT > 0) scoopBtnShakeT = Math.max(0, scoopBtnShakeT - 0.04);

  for (var i = 0; i < scoopGhostBoxes.length; i++) {
    var ghost = scoopGhostBoxes[i];
    if (ghost.popT > 0) ghost.popT = Math.max(0, ghost.popT - 0.03);
    if (ghost.absorbT > 0) ghost.absorbT = Math.max(0, ghost.absorbT - 0.025);
    ghost.pulseT = (ghost.pulseT + 0.03) % (Math.PI * 2);
  }
}

// ── Drawing ──

function drawScoopButton() {
  var btn = getScoopBtnRect();
  var ox = 0;
  if (scoopBtnShakeT > 0) ox = Math.sin(scoopBtnShakeT * 28) * 4 * S * scoopBtnShakeT;

  ctx.save();
  ctx.translate(btn.x + btn.w / 2 + ox, btn.y + btn.h / 2);

  // Button background — rounded rect with gradient
  var pulse = 1 + Math.sin(tick * 0.05) * 0.03;
  ctx.scale(pulse, pulse);

  // Outer shadow
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 2 * S;

  // Background pill
  var grad = ctx.createLinearGradient(0, -btn.h / 2, 0, btn.h / 2);
  grad.addColorStop(0, '#FFD166');
  grad.addColorStop(1, '#E8A84C');
  ctx.fillStyle = grad;
  rRect(-btn.w / 2, -btn.h / 2, btn.w, btn.h, 10 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = '#C4841E';
  ctx.lineWidth = 1.5 * S;
  rRect(-btn.w / 2, -btn.h / 2, btn.w, btn.h, 10 * S);
  ctx.stroke();

  // Draw a funnel icon
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5 * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var iconS = btn.w * 0.28;
  ctx.beginPath();
  ctx.moveTo(-iconS, -iconS * 0.6);
  ctx.lineTo(-iconS * 0.25, iconS * 0.3);
  ctx.lineTo(-iconS * 0.25, iconS * 0.8);
  ctx.moveTo(iconS, -iconS * 0.6);
  ctx.lineTo(iconS * 0.25, iconS * 0.3);
  ctx.lineTo(iconS * 0.25, iconS * 0.8);
  ctx.stroke();

  // Small arrow pointing down into funnel
  ctx.beginPath();
  ctx.moveTo(0, -iconS * 0.9);
  ctx.lineTo(0, -iconS * 0.2);
  ctx.moveTo(-iconS * 0.3, -iconS * 0.5);
  ctx.lineTo(0, -iconS * 0.2);
  ctx.lineTo(iconS * 0.3, -iconS * 0.5);
  ctx.stroke();

  ctx.restore();
}

function drawScoopGhostBoxes() {
  var boxW = 36 * S;
  var boxH = 36 * S;

  for (var i = 0; i < scoopGhostBoxes.length; i++) {
    var ghost = scoopGhostBoxes[i];
    var c = COLORS[ghost.ci];

    ctx.save();
    ctx.translate(ghost.cx, ghost.cy);

    // Pop animation on creation
    var scale = 1;
    if (ghost.popT > 0) scale = 1 + ghost.popT * 0.3;

    // Gentle pulse
    var pulse = 1 + Math.sin(ghost.pulseT) * 0.03;
    ctx.scale(scale * pulse, scale * pulse);

    // Semi-transparent ghost box
    ctx.globalAlpha = 0.45;

    // Glow
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 12 * S;

    // Box body
    var grad = ctx.createLinearGradient(0, -boxH / 2, 0, boxH / 2);
    grad.addColorStop(0, c.light);
    grad.addColorStop(1, c.fill);
    ctx.fillStyle = grad;
    rRect(-boxW / 2, -boxH / 2, boxW, boxH, 8 * S);
    ctx.fill();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    // Border
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1.5 * S;
    rRect(-boxW / 2, -boxH / 2, boxW, boxH, 8 * S);
    ctx.stroke();

    ctx.globalAlpha = 0.7;

    // Draw marble count as small marbles inside
    var mr = Math.min(5 * S, boxW / 10);
    var cols = 3;
    var gap = (boxW - 8 * S) / cols;
    for (var m = 0; m < ghost.count; m++) {
      var row = Math.floor(m / cols);
      var col = m % cols;
      var mx = -boxW / 2 + 4 * S + gap * (col + 0.5);
      var my = -boxH / 2 + 4 * S + gap * (row + 0.5);
      drawMarble(mx, my, mr, ghost.ci);
    }

    // Absorb flash
    if (ghost.absorbT > 0) {
      ctx.globalAlpha = ghost.absorbT * 0.3;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      rRect(-boxW / 2, -boxH / 2, boxW, boxH, 8 * S);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawScoopGhostBoxHover() {
  // Show pointer cursor when hovering over ghost boxes or button
  // This is handled in the mousemove extension in game.js
}

// ── Reset (called from initGame) ──

function scoopReset() {
  scoopGhostBoxes = [];
  scoopBtnShakeT = 0;
}
