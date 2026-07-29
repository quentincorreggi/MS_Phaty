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
//   • A still-closed heavy box keeps its full design + colour and shows
//     a small central WINDOW revealing the same dark core the marbles
//     will carry — a diegetic "this box is Heavy" signal.
//
// This file owns: tuning, the core + window rendering and the core-pop
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

// ── The core "window" on a closed heavy box ──
// A small recessed porthole at (cx, cy) revealing the SAME dark metallic
// core the marbles carry (matching gradient), behind a little glass lens
// with a metal rim. Discreet: it doesn't cover the box colour.
function drawCoreWindow(cx, cy, winR) {
  var cr = winR * 0.72; // the core visible inside the window
  ctx.save();

  // Recessed housing shadow around the porthole
  var hg = ctx.createRadialGradient(cx, cy, winR * 0.6, cx, cy, winR * 1.28);
  hg.addColorStop(0, 'rgba(0,0,0,0)');
  hg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(cx, cy, winR * 1.28, 0, Math.PI * 2); ctx.fill();

  // Glass base (slightly darkened tint)
  ctx.fillStyle = 'rgba(18,20,24,0.30)';
  ctx.beginPath(); ctx.arc(cx, cy, winR, 0, Math.PI * 2); ctx.fill();

  // Dark metallic core — identical language to the marbles' core
  var g = ctx.createRadialGradient(cx - cr * 0.32, cy - cr * 0.36, cr * 0.1, cx, cy, cr);
  g.addColorStop(0, '#6A6E77');
  g.addColorStop(0.45, '#2C2E33');
  g.addColorStop(1, '#0C0D10');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();

  // Glass specular highlight
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx - winR * 0.28, cy - winR * 0.3, winR * 0.3, 0, Math.PI * 2); ctx.fill();

  // Metal rim (bright inner + dark outer)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, winR * 0.1);
  ctx.beginPath(); ctx.arc(cx, cy, winR, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(18,20,24,0.6)'; ctx.lineWidth = Math.max(0.8, winR * 0.08);
  ctx.beginPath(); ctx.arc(cx, cy, winR * 1.06, 0, Math.PI * 2); ctx.stroke();

  ctx.restore();
}

// ── A still-closed heavy box ──
// Full box design + colour stay intact; a small central core window
// signals "Heavy" (same core as the marbles). Hidden+heavy keeps the
// colour concealed. Box-local coordinates, origin at box centre.
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

  drawCoreWindow(0, 0, w * 0.19);
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
