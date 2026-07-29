// ============================================================
// heavy.js — Heavy Marbles mechanic (wrapper / box-state)
// ============================================================
//
// The "Heavy" property is a wrapper flag (`heavy: true`) applied on
// top of ANY standard box type (default / hidden / ice / blocker).
// It is the direct inverse of the Bubble Marbles Box:
//
//   • Heavy marbles descend through the funnel markedly FASTER than
//     normal marbles and plow past (overtake) marbles already in
//     flight, reaching the conveyor first.
//   • Each released marble is encased in an individual metal shell
//     (bottom-half metallic dome, à la a sliding Koopa shell). The
//     marble's colour stays fully visible on the exposed top half.
//   • On contact with the funnel floor / conveyor surface the shell
//     shatters in an exaggerated burst and the marble bounces
//     noticeably more than a normal marble before settling into
//     standard conveyor behaviour.
//
// This file owns: tuning constants, shell rendering, the always-on
// box indicator, and the shatter routine. Physics speed-up +
// overtaking live in physics.js; spawn/flag plumbing lives in
// game.js, tunnel.js and editor.js.
// ============================================================

// ── Tuning ──
var HEAVY_GRAV_MULT = 2.4;   // gravity multiplier vs. normal marbles
var HEAVY_MAX_VY    = 19;    // max downward speed (kept < radius/substep to avoid tunnelling)
var HEAVY_BOUNCE_VY = 9;     // upward pop applied at the shatter moment

// ── Metallic shell drawn over a physics marble (idée 1) ──
// Bottom-half brushed-steel dome with a thick raised equator rim,
// rivets and streaks. Drawn AFTER drawMarble so the colour shows on
// the exposed top half.
function drawHeavyShell(x, y, r, ci) {
  ctx.save();

  var eqY = y - r * 0.08; // equator sits slightly above centre → rim overhang

  // Bottom-half dome
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  var grad = ctx.createLinearGradient(x, eqY, x, y + r);
  grad.addColorStop(0, '#B7BCC4');
  grad.addColorStop(0.35, '#8B9098');
  grad.addColorStop(0.75, '#565A61');
  grad.addColorStop(1, '#3A3D43');
  ctx.fillStyle = grad;
  ctx.fillRect(x - r, eqY, r * 2, (y + r) - eqY);
  // brushed-steel streaks
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#EFF2F6';
  ctx.lineWidth = Math.max(0.5, r * 0.05);
  for (var s = 0; s < 3; s++) {
    var yy = eqY + r * (0.4 + s * 0.4);
    ctx.beginPath(); ctx.moveTo(x - r, yy); ctx.lineTo(x + r, yy - r * 0.1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Thick raised equator rim
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  var rimH = r * 0.34;
  var rimGrad = ctx.createLinearGradient(x, eqY - rimH / 2, x, eqY + rimH / 2);
  rimGrad.addColorStop(0, '#E4E8ED');
  rimGrad.addColorStop(0.5, '#9AA0A8');
  rimGrad.addColorStop(1, '#4E525A');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(x - r, eqY - rimH / 2, r * 2, rimH);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.beginPath(); ctx.moveTo(x - r, eqY - rimH / 2 + r * 0.03); ctx.lineTo(x + r, eqY - rimH / 2 + r * 0.03); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.moveTo(x - r, eqY + rimH / 2 - r * 0.03); ctx.lineTo(x + r, eqY + rimH / 2 - r * 0.03); ctx.stroke();
  ctx.restore();

  // Rivets along the rim
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  var rivetR = Math.max(0.8, r * 0.11);
  for (var rv = -1; rv <= 1; rv++) {
    var rx = x + rv * r * 0.6;
    var rgrad = ctx.createRadialGradient(rx - rivetR * 0.3, eqY - rivetR * 0.3, rivetR * 0.1, rx, eqY, rivetR);
    rgrad.addColorStop(0, '#F0F3F6'); rgrad.addColorStop(1, '#5A5E65');
    ctx.fillStyle = rgrad;
    ctx.beginPath(); ctx.arc(rx, eqY, rivetR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Unifying sphere outline
  ctx.strokeStyle = 'rgba(40,42,46,0.5)';
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

  ctx.restore();
}

// ── Always-on "heavy" carapace on a box in the maze ──
// The box itself is encased in a metal shell across its LOWER half —
// the same brushed-steel language as the marble shells — with a raised
// riveted rim across the middle. Drawn in box-local coordinates
// (origin at box centre), same as the ice/blocker overlays, AFTER the
// box body + preview marbles so it reads as a carapace over the box.
function drawHeavyBoxShell(w, h, S, tick) {
  var left = -w / 2, right = w / 2, top = -h / 2, bot = h / 2;
  var eqY = h * 0.02; // rim sits just below centre → shell covers lower half

  ctx.save();
  ctx.beginPath(); rRect(left, top, w, h, 6 * S); ctx.clip();

  // Lower-half dome fill
  var grad = ctx.createLinearGradient(0, eqY, 0, bot);
  grad.addColorStop(0, '#B7BCC4');
  grad.addColorStop(0.4, '#8B9098');
  grad.addColorStop(0.8, '#565A61');
  grad.addColorStop(1, '#3A3D43');
  ctx.fillStyle = grad;
  ctx.fillRect(left, eqY, w, bot - eqY);

  // Brushed-steel streaks
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = '#EFF2F6';
  ctx.lineWidth = Math.max(0.5, h * 0.012);
  for (var s = 0; s < 3; s++) {
    var yy = eqY + (bot - eqY) * (0.32 + s * 0.28);
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy - h * 0.02); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Raised riveted rim across the middle
  var rimH = h * 0.15;
  var rimGrad = ctx.createLinearGradient(0, eqY - rimH / 2, 0, eqY + rimH / 2);
  rimGrad.addColorStop(0, '#E4E8ED');
  rimGrad.addColorStop(0.5, '#9AA0A8');
  rimGrad.addColorStop(1, '#4E525A');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(left, eqY - rimH / 2, w, rimH);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.5, h * 0.012);
  ctx.beginPath(); ctx.moveTo(left, eqY - rimH / 2 + h * 0.01); ctx.lineTo(right, eqY - rimH / 2 + h * 0.01); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.moveTo(left, eqY + rimH / 2 - h * 0.01); ctx.lineTo(right, eqY + rimH / 2 - h * 0.01); ctx.stroke();

  // Rivets along the rim
  var rivetR = Math.max(1, w * 0.05);
  for (var rv = -2; rv <= 2; rv++) {
    var rx = rv * w * 0.2;
    var rgrad = ctx.createRadialGradient(rx - rivetR * 0.3, eqY - rivetR * 0.3, rivetR * 0.1, rx, eqY, rivetR);
    rgrad.addColorStop(0, '#F0F3F6'); rgrad.addColorStop(1, '#5A5E65');
    ctx.fillStyle = rgrad;
    ctx.beginPath(); ctx.arc(rx, eqY, rivetR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Crisp box outline so the carapace stays contained
  ctx.save();
  ctx.strokeStyle = 'rgba(58,61,67,0.45)'; ctx.lineWidth = 1.5 * S;
  rRect(left, top, w, h, 6 * S); ctx.stroke();
  ctx.restore();
}

// Set true by drawStock while rendering a heavy box so the shared
// drawBoxMarbles helper gives each preview marble its own little shell.
var heavyMarbleContext = false;

// ── Metallic smash sound at the shatter moment ──
function heavyShatterSound() {
  if (typeof tone !== 'function') return;
  tone(140, 0.18, 'square', 0.16, 60);    // heavy thud
  tone(1200, 0.10, 'square', 0.06, 400);  // metallic clink
  setTimeout(function () { tone(1900, 0.06, 'triangle', 0.04, 900); }, 40);
}

// ── Shatter a heavy marble on contact with funnel floor / belt ──
// Sheds the shell, spawns blunt metal shards + a colour burst, and
// gives an exaggerated bounce. The marble then continues as a normal
// physics marble and settles onto the belt on its next descent.
function shatterHeavyMarble(m) {
  m.heavy = false;
  m.shellBroken = true;
  m.spawnT = 0;

  // Exaggerated bounce
  m.vy = -HEAVY_BOUNCE_VY * S;
  m.vx = (Math.random() - 0.5) * 3 * S;

  // Blunt metal shards
  for (var p = 0; p < 14; p++) {
    var ang = Math.random() * Math.PI * 2;
    var sp = 3 + Math.random() * 5;
    var col = Math.random() > 0.5 ? 'rgba(206,212,220,0.95)' : 'rgba(118,124,132,0.95)';
    particles.push({
      x: m.x, y: m.y,
      vx: Math.cos(ang) * sp * S, vy: Math.sin(ang) * sp * S - 2 * S,
      r: (1.5 + Math.random() * 3) * S, color: col,
      life: 1, decay: 0.02 + Math.random() * 0.02, grav: true
    });
  }
  // Impact flash + a hint of the marble's colour
  spawnBurst(m.x, m.y, 'rgba(255,255,255,0.9)', 6);
  spawnBurst(m.x, m.y, COLORS[m.ci].light, 8);
  heavyShatterSound();
}
