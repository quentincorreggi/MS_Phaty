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

// ── The metal shell that ENCASES a still-closed heavy box ──
// Like the bubble that wraps a Bubble Box: while the heavy box has no
// path to the bottom yet, it sits inside a rounded metallic shell/pod
// (glossy highlight, seams, corner rivets, beveled rim). The moment
// the box opens the shell explodes (see explodeHeavyShell) and this is
// no longer drawn. Box-local coordinates, origin at box centre.
function drawHeavyClosedShell(w, h, S, tick) {
  var left = -w / 2, top = -h / 2, r = 6 * S;

  ctx.save();
  ctx.beginPath(); rRect(left, top, w, h, r); ctx.clip();

  // Metallic spherical body
  var g = ctx.createRadialGradient(-w * 0.22, -h * 0.28, w * 0.1, 0, 0, w * 0.85);
  g.addColorStop(0, '#EDF0F4');
  g.addColorStop(0.35, '#C2C7CE');
  g.addColorStop(0.7, '#878C94');
  g.addColorStop(1, '#4A4E56');
  ctx.fillStyle = g;
  ctx.fillRect(left, top, w, h);

  // Seams (vertical + equator)
  ctx.strokeStyle = 'rgba(40,42,46,0.25)'; ctx.lineWidth = Math.max(0.6, w * 0.02);
  ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(0, top + h); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = Math.max(0.6, w * 0.02);
  ctx.beginPath(); ctx.moveTo(left, 0); ctx.lineTo(left + w, 0); ctx.stroke();

  // Glossy highlight
  ctx.globalAlpha = 0.5;
  var hg = ctx.createRadialGradient(-w * 0.2, -h * 0.25, 0, -w * 0.2, -h * 0.25, w * 0.42);
  hg.addColorStop(0, 'rgba(255,255,255,0.9)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg; ctx.fillRect(left, top, w, h);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Corner rivets
  var rivetR = Math.max(1.2, w * 0.05);
  var pad = w * 0.16;
  var pts = [[left + pad, top + pad], [left + w - pad, top + pad], [left + pad, top + h - pad], [left + w - pad, top + h - pad]];
  ctx.save();
  for (var i = 0; i < 4; i++) {
    var px = pts[i][0], py = pts[i][1];
    var rg = ctx.createRadialGradient(px - rivetR * 0.3, py - rivetR * 0.3, rivetR * 0.1, px, py, rivetR);
    rg.addColorStop(0, '#F2F4F7'); rg.addColorStop(1, '#5A5E65');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(px, py, rivetR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Beveled rim
  ctx.save();
  ctx.strokeStyle = 'rgba(60,63,69,0.7)'; ctx.lineWidth = 2 * S;
  rRect(left, top, w, h, r); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1 * S;
  rRect(left + 1.5 * S, top + 1.5 * S, w - 3 * S, h - 3 * S, r); ctx.stroke();
  ctx.restore();
}

// ── The shell exploding when the box opens ──
// Fired once at the reveal moment (world coordinates): a ring of blunt
// metal shards + a bright flash + the metallic smash sound.
function explodeHeavyShell(cx, cy) {
  var n = 20;
  for (var i = 0; i < n; i++) {
    var a = Math.PI * 2 * i / n + Math.random() * 0.4;
    var sp = 3 + Math.random() * 6;
    var col = Math.random() > 0.5 ? 'rgba(210,216,224,0.95)' : 'rgba(120,126,134,0.95)';
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (2 + Math.random() * 3.5) * S, color: col,
      life: 1, decay: 0.02 + Math.random() * 0.02, grav: true
    });
  }
  spawnBurst(cx, cy, 'rgba(255,255,255,0.9)', 8);
  heavyShatterSound();
}

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
