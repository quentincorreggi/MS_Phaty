// ============================================================
// heavy.js — Heavy Marbles mechanic (wrapper / box-state)
// ============================================================
//
// The "Heavy" property is a wrapper flag (`heavy: true`) applied on
// top of ANY standard box type (default / hidden / ice / blocker).
// It is the direct inverse of the Bubble Marbles Box.
//
// IDÉE 2 — INTERNAL CORE:
//   • Heavy marbles descend through the funnel markedly FASTER than
//     normal marbles and plow past (overtake) marbles already in
//     flight, reaching the conveyor first.
//   • The marble stays 100% opaque, full colour over its whole surface
//     at all times. Its weight is conveyed by a small, dense, dark
//     metallic CORE at the exact centre, seen through a transparent
//     glass window — no shell around it.
//   • On contact with the funnel floor / conveyor the core shrinks into
//     itself until it disappears (no external explosion, nothing to
//     break) — same trigger/timing as a Bubble Marbles bubble pop.
//   • A still-closed heavy box shows a neutron/atom symbol while its
//     colour stays fully visible.
//
// This file owns: tuning, the core + neutron rendering and the core-pop
// routine. Physics speed-up + overtaking live in physics.js; spawn/flag
// plumbing lives in game.js, tunnel.js and editor.js.
// ============================================================

// ── Tuning ──
var HEAVY_GRAV_MULT = 2.4;   // gravity multiplier vs. normal marbles
var HEAVY_MAX_VY    = 19;    // max downward speed (kept < radius/substep to avoid tunnelling)
var HEAVY_CORE_R    = 0.4;   // core radius as a fraction of the marble radius
var HEAVY_CORE_POP  = 0.09;  // per-frame shrink rate of the core on landing

// Set true by drawStock while rendering an OPEN heavy box so the shared
// drawBoxMarbles helper gives each preview marble its own visible core.
var heavyMarbleContext = false;

// ── The dense dark core seen through the marble's glass ──
// Drawn AFTER drawMarble (which paints the full-colour sphere), centred
// on the marble. `coreScale` (0..1) shrinks it to nothing on landing.
function drawHeavyCore(x, y, r, coreScale) {
  if (coreScale == null) coreScale = 1;
  var cr = r * HEAVY_CORE_R * coreScale;
  if (cr < 0.4) return;
  ctx.save();

  // Faint glass "window" lens around the core
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(0.5, cr * 0.18);
  ctx.beginPath(); ctx.arc(x, y, cr * 1.24, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  // Dense dark metallic core
  var g = ctx.createRadialGradient(x - cr * 0.32, y - cr * 0.36, cr * 0.1, x, y, cr);
  g.addColorStop(0, '#6A6E77');
  g.addColorStop(0.45, '#2C2E33');
  g.addColorStop(1, '#0C0D10');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();

  // Glass specular highlight
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(x - cr * 0.32, y - cr * 0.36, cr * 0.24, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── Neutron / atom symbol (three orbits + nucleus + electrons) ──
// Drawn centred at (cx, cy) with overall radius R. A soft white halo
// underneath keeps it legible on any box colour.
function drawNeutronSymbol(cx, cy, R) {
  ctx.save();
  ctx.lineCap = 'round';

  function orbits(color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    for (var k = 0; k < 3; k++) {
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(k * Math.PI / 3);
      ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  orbits('rgba(255,255,255,0.6)', Math.max(2, R * 0.17));   // halo
  orbits('rgba(18,18,22,0.92)', Math.max(1.5, R * 0.10));    // dark orbits

  // Electrons on each orbit
  ctx.fillStyle = 'rgba(18,18,22,0.92)';
  for (var k = 0; k < 3; k++) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(k * Math.PI / 3);
    ctx.beginPath(); ctx.arc(R, 0, R * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Nucleus (light halo + dark centre)
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(18,18,22,0.95)';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.18, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── A still-closed heavy box ──
// Full box colour stays visible (so the player can read it) with the
// neutron symbol on top. Hidden+heavy keeps the colour concealed.
// Box-local coordinates, origin at box centre.
function drawHeavyClosedBox(w, h, S, tick, ci, boxType) {
  var left = -w / 2, top = -h / 2, r = 6 * S;

  if (boxType === 'hidden') {
    ctx.save();
    var hg = ctx.createLinearGradient(0, top, 0, top + h);
    hg.addColorStop(0, '#4A4450'); hg.addColorStop(1, '#2A2530');
    ctx.fillStyle = hg;
    rRect(left, top, w, h, r); ctx.fill();
    ctx.strokeStyle = '#5A5460'; ctx.lineWidth = 1.5 * S;
    rRect(left, top, w, h, r); ctx.stroke();
    ctx.restore();
  } else {
    drawBox(left, top, w, h, ci);
  }

  drawNeutronSymbol(0, 0, w * 0.32);
}

// ── Soft "pop" when the core vanishes on landing ──
function heavyPopSound() {
  if (typeof tone !== 'function') return;
  tone(520, 0.09, 'sine', 0.06, 260);
}

// ── Begin the core-shrink on contact with the floor / conveyor ──
// No shell, no shards, no bounce: the core simply implodes to nothing.
// Once gone (see game.js update) the marble drops its heavy flag and
// settles onto the belt like any normal marble.
function popHeavyCore(m) {
  if (m.coreShrinking) return;
  m.coreShrinking = true;
  m.coreT = m.coreT == null ? 1 : m.coreT;
  heavyPopSound();
}
