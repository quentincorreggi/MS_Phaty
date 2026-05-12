// ============================================================
// box_rocket.js — Rocket box type
// Sits on the grid pointing up. Not tappable directly — ignites
// when an adjacent tappable box is played. Once ignited, lifts
// off and flies to a random target box anywhere on the maze,
// destroying it and sending its marbles straight to their sort
// columns (magnet-style).
// ============================================================

var ROCKET_BODY_FILL = '#5566AA';
var ROCKET_BODY_DARK = '#2D3458';
var ROCKET_BODY_LIGHT = '#8A99D4';
var ROCKET_NOSE = '#FF8030';
var ROCKET_NOSE_LIGHT = '#FFC080';

registerBoxType('rocket', {
  label: 'Rocket',
  editorColor: '#5566AA',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawRocketBoxBody(ctx, x, y, w, h, S, tick, idlePhase, false, 0);
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    drawRocketBoxBody(ctx, x, y, w, h, S, tick, 0, false, 0);
  },

  editorCellStyle: function (ci) {
    return {
      background: 'linear-gradient(135deg,' + ROCKET_BODY_LIGHT + ',' + ROCKET_BODY_DARK + ')',
      borderColor: ROCKET_NOSE
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:' + ROCKET_NOSE_LIGHT + ';font-size:14px;text-shadow:0 0 4px rgba(255,128,48,0.7)">&#9650;</span>';
  }
});

// Draw the rocket sitting inside its grid box.
function drawRocketBoxBody(ctx, x, y, w, h, S, tick, idlePhase, fuseLit, fuseT) {
  ctx.save();

  // Background panel — dark sky/launch pad
  var bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, '#1F2440');
  bg.addColorStop(1, '#3A416A');
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = bg;
  rRect(x, y, w, h, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = ROCKET_BODY_DARK;
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 6 * S); ctx.stroke();

  // Faint star specks
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  var starSeed = Math.floor(idlePhase * 100) || 7;
  for (var i = 0; i < 5; i++) {
    var sx = x + ((starSeed * (i + 3) * 17) % (w - 6 * S)) + 3 * S;
    var sy = y + ((starSeed * (i + 5) * 23) % (h - 6 * S)) + 3 * S;
    var sr = (0.7 + ((i + starSeed) % 3) * 0.4) * S;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }

  // Rocket sprite, centered, pointing up
  var cx = x + w / 2;
  var cy = y + h / 2;
  var sz = Math.min(w, h) * 0.55;

  // Idle bob (when not lit) or stronger shake (when lit)
  var bobY = Math.sin(tick * 0.06 + idlePhase) * 1.2 * S;
  cy += bobY;

  // Exhaust glow under the rocket (pulses)
  var glowAlpha = 0.35 + 0.18 * Math.sin(tick * 0.18 + idlePhase);
  if (fuseLit) glowAlpha = 0.85;
  ctx.save();
  var glowG = ctx.createRadialGradient(cx, cy + sz * 0.55, 0, cx, cy + sz * 0.55, sz * 0.6);
  glowG.addColorStop(0, 'rgba(255,200,80,' + glowAlpha + ')');
  glowG.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = glowG;
  ctx.beginPath();
  ctx.ellipse(cx, cy + sz * 0.55, sz * 0.5, sz * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawRocketSprite(ctx, cx, cy, 0, sz, S, tick, fuseLit);

  ctx.restore();
}

// Draw an isolated rocket sprite at (cx, cy), rotated by angle radians
// (0 = pointing up). `sz` is the long-axis size of the rocket body.
function drawRocketSprite(ctx, cx, cy, angle, sz, S, tick, fuseLit) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  var bw = sz * 0.34;
  var bh = sz * 0.78;
  var noseH = sz * 0.32;

  // Flame (always small idle flame; bigger when lit/in flight)
  var flameH = sz * (fuseLit ? 0.7 : 0.28);
  var flameW = bw * (fuseLit ? 1.0 : 0.7);
  var flameWobble = Math.sin(tick * 0.5) * 1.5 * S;
  var flameG = ctx.createLinearGradient(0, bh * 0.5, 0, bh * 0.5 + flameH);
  flameG.addColorStop(0, 'rgba(255,240,140,0.95)');
  flameG.addColorStop(0.45, 'rgba(255,170,50,0.85)');
  flameG.addColorStop(1, 'rgba(255,40,20,0)');
  ctx.fillStyle = flameG;
  ctx.beginPath();
  ctx.moveTo(-flameW / 2, bh * 0.5);
  ctx.quadraticCurveTo(0, bh * 0.5 + flameH * 0.6, flameWobble, bh * 0.5 + flameH);
  ctx.quadraticCurveTo(0, bh * 0.5 + flameH * 0.6, flameW / 2, bh * 0.5);
  ctx.closePath();
  ctx.fill();

  // Fins
  ctx.fillStyle = ROCKET_BODY_DARK;
  ctx.beginPath();
  ctx.moveTo(-bw / 2, bh * 0.15);
  ctx.lineTo(-bw * 0.95, bh * 0.5);
  ctx.lineTo(-bw / 2, bh * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bw / 2, bh * 0.15);
  ctx.lineTo(bw * 0.95, bh * 0.5);
  ctx.lineTo(bw / 2, bh * 0.5);
  ctx.closePath(); ctx.fill();

  // Body
  var bodyG = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  bodyG.addColorStop(0, ROCKET_BODY_DARK);
  bodyG.addColorStop(0.5, ROCKET_BODY_LIGHT);
  bodyG.addColorStop(1, ROCKET_BODY_DARK);
  ctx.fillStyle = bodyG;
  rRect(-bw / 2, -bh / 2 + noseH * 0.4, bw, bh - noseH * 0.4, bw * 0.18);
  ctx.fill();

  // Body outline
  ctx.strokeStyle = ROCKET_BODY_DARK;
  ctx.lineWidth = 1 * S;
  rRect(-bw / 2, -bh / 2 + noseH * 0.4, bw, bh - noseH * 0.4, bw * 0.18);
  ctx.stroke();

  // Window/porthole
  var portR = bw * 0.22;
  var portCy = -bh * 0.1;
  var portG = ctx.createRadialGradient(-portR * 0.3, portCy - portR * 0.3, 0, 0, portCy, portR);
  portG.addColorStop(0, '#FFF6CC');
  portG.addColorStop(0.5, '#FFC050');
  portG.addColorStop(1, '#8A4A10');
  ctx.fillStyle = portG;
  ctx.beginPath(); ctx.arc(0, portCy, portR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ROCKET_BODY_DARK; ctx.lineWidth = 1 * S;
  ctx.beginPath(); ctx.arc(0, portCy, portR, 0, Math.PI * 2); ctx.stroke();

  // Nose cone
  var noseG = ctx.createLinearGradient(0, -bh / 2, 0, -bh / 2 + noseH);
  noseG.addColorStop(0, ROCKET_NOSE_LIGHT);
  noseG.addColorStop(1, ROCKET_NOSE);
  ctx.fillStyle = noseG;
  ctx.beginPath();
  ctx.moveTo(-bw / 2, -bh / 2 + noseH * 0.4);
  ctx.quadraticCurveTo(0, -bh / 2 - noseH * 0.1, bw / 2, -bh / 2 + noseH * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#A04018';
  ctx.lineWidth = 1 * S;
  ctx.stroke();

  // Tail-light pulse when fuse lit
  if (fuseLit) {
    var pulse = 0.5 + 0.5 * Math.sin(tick * 0.6);
    ctx.fillStyle = 'rgba(255,240,120,' + (0.4 + 0.5 * pulse) + ')';
    ctx.beginPath(); ctx.arc(0, bh * 0.45, bw * 0.18 * (1 + pulse * 0.3), 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}
