// ============================================================
// box_rocket.js — Rocket VISUAL HELPERS
// Drawing primitives used by rocket.js (1x2 grid render) and by
// the rocket-flight code. The rocket is NOT a registered box type
// any more — it is a separate Layer-2 construct handled in
// rocket.js. See rocket.js for ignition, targeting and cascade
// logic; see drawStock() in rendering.js for the grid render call.
// ============================================================

var ROCKET_BODY_FILL = '#5566AA';
var ROCKET_BODY_DARK = '#2D3458';
var ROCKET_BODY_LIGHT = '#8A99D4';
var ROCKET_NOSE = '#FF8030';
var ROCKET_NOSE_LIGHT = '#FFC080';

// Draw an isolated rocket sprite at (cx, cy), facing in the given dir
// ('up'|'down'|'left'|'right' — where the NOSE points). `length` is
// the long-axis size; `width` is the short-axis size.
function drawRocketSpriteOriented(ctx, cx, cy, dir, length, width, S, tick, fuseLit) {
  var angle = 0;
  if (dir === 'up')    angle = 0;
  if (dir === 'down')  angle = Math.PI;
  if (dir === 'left')  angle = -Math.PI / 2;
  if (dir === 'right') angle = Math.PI / 2;
  drawRocketSpriteAngled(ctx, cx, cy, angle, length, width, S, tick, fuseLit);
}

// Draw a rocket sprite at angle radians (0 = nose-up).
function drawRocketSpriteAngled(ctx, cx, cy, angle, length, width, S, tick, fuseLit) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  var bw = width;
  var bh = length;
  var noseH = bh * 0.32;

  // Flame
  var flameH = bh * (fuseLit ? 0.75 : 0.22);
  var flameW = bw * (fuseLit ? 1.0 : 0.7);
  var flameWobble = Math.sin(tick * 0.6) * 1.5 * S;
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
  ctx.moveTo(-bw / 2, bh * 0.18);
  ctx.lineTo(-bw * 0.92, bh * 0.5);
  ctx.lineTo(-bw / 2, bh * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bw / 2, bh * 0.18);
  ctx.lineTo(bw * 0.92, bh * 0.5);
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

  // Window
  var portR = bw * 0.22;
  var portCy = -bh * 0.05;
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
  ctx.quadraticCurveTo(0, -bh / 2 - noseH * 0.15, bw / 2, -bh / 2 + noseH * 0.4);
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

// Draw the 1x2 rocket on the maze grid, given the bounding-box (the union
// of the nose cell and tail cell rectangles). `dir` is where the nose
// points. Includes the dark launch-pad panel that covers both cells.
function drawRocketOnGrid(ctx, x, y, w, h, dir, S, tick, idlePhase, fuseLit, shakeOffsetX, shakeOffsetY) {
  ctx.save();
  ctx.translate(shakeOffsetX || 0, shakeOffsetY || 0);

  // Background panel that covers both cells
  var bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, '#1F2440');
  bg.addColorStop(1, '#3A416A');
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = bg;
  rRect(x, y, w, h, 7 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = ROCKET_BODY_DARK;
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 7 * S); ctx.stroke();

  // Star specks
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  var seed = Math.floor(idlePhase * 100) || 7;
  for (var i = 0; i < 9; i++) {
    var sx = x + ((seed * (i + 3) * 17) % (w - 6 * S)) + 3 * S;
    var sy = y + ((seed * (i + 5) * 23) % (h - 6 * S)) + 3 * S;
    var sr = (0.7 + ((i + seed) % 3) * 0.4) * S;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }

  // Compute rocket sprite geometry
  var cx = x + w / 2;
  var cy = y + h / 2;
  var isVertical = (dir === 'up' || dir === 'down');
  var length = (isVertical ? h : w) * 0.78;
  var width  = (isVertical ? w : h) * 0.42;

  // Subtle idle bob along the long axis
  var bob = Math.sin(tick * 0.06 + idlePhase) * 1.2 * S;
  if (dir === 'up')    cy += bob;
  if (dir === 'down')  cy -= bob;
  if (dir === 'left')  cx += bob;
  if (dir === 'right') cx -= bob;

  // Exhaust glow behind the rocket
  var glowAlpha = 0.32 + 0.18 * Math.sin(tick * 0.18 + idlePhase);
  if (fuseLit) glowAlpha = 0.85;
  ctx.save();
  var gx = cx, gy = cy;
  var gWidth = width * 1.2, gHeight = length * 0.45;
  if (dir === 'up')    gy = cy + length * 0.45;
  if (dir === 'down')  gy = cy - length * 0.45;
  if (dir === 'left')  { gx = cx + length * 0.45; var t1 = gWidth; gWidth = gHeight; gHeight = t1; }
  if (dir === 'right') { gx = cx - length * 0.45; var t2 = gWidth; gWidth = gHeight; gHeight = t2; }
  var glowG = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(gWidth, gHeight) * 0.7);
  glowG.addColorStop(0, 'rgba(255,200,80,' + glowAlpha + ')');
  glowG.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = glowG;
  ctx.beginPath();
  ctx.ellipse(gx, gy, gWidth * 0.6, gHeight * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawRocketSpriteOriented(ctx, cx, cy, dir, length, width, S, tick, fuseLit);

  // Fuse-line marker: a short rope/wick extending out of the tail end,
  // pointing toward the fuse cell. Helps player understand "play the
  // box behind the tail".
  ctx.save();
  ctx.strokeStyle = fuseLit ? '#FFD060' : '#8A7050';
  ctx.lineWidth = 2 * S;
  ctx.lineCap = 'round';
  ctx.setLineDash([3 * S, 2 * S]);
  var fx1 = cx, fy1 = cy, fx2 = cx, fy2 = cy;
  if (dir === 'up')    { fy1 = cy + length * 0.5; fy2 = y + h - 2 * S; }
  if (dir === 'down')  { fy1 = cy - length * 0.5; fy2 = y + 2 * S; }
  if (dir === 'left')  { fx1 = cx + length * 0.5; fx2 = x + w - 2 * S; }
  if (dir === 'right') { fx1 = cx - length * 0.5; fx2 = x + 2 * S; }
  ctx.beginPath();
  ctx.moveTo(fx1, fy1);
  ctx.lineTo(fx2, fy2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.restore();
}
