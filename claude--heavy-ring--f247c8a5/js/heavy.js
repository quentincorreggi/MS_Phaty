// ============================================================
// heavy.js — Heavy Marbles mechanic (wrapper / box-state)
// ============================================================
//
// The "Heavy" property is a wrapper flag (`heavy: true`) applied on
// top of ANY standard box type (default / hidden / ice / blocker).
// It is the direct inverse of the Bubble Marbles Box.
//
// IDÉE 3 — METAL RING:
//   • Heavy marbles descend through the funnel markedly FASTER than
//     normal marbles and plow past (overtake) marbles already in
//     flight, reaching the conveyor first.
//   • The marble stays 100% opaque, full colour. Its weight is conveyed
//     by a metal RING (a brushed-steel band) wrapped around its equator,
//     slightly tilted, Saturn-style.
//   • On contact with the funnel floor / conveyor the ring contracts to
//     nothing (no explosion, nothing to break) — same trigger/timing as
//     a Bubble Marbles bubble pop.
//   • A still-closed heavy box is encircled by a matching (but distinct)
//     metal hoop while its colour stays fully visible.
//
// NOTE: this is the idée-2 branch with the visuals swapped for rings.
// The physics/plumbing fields keep their names (core*/coreShrinking) —
// drawHeavyCore now renders the marble's ring band. Physics speed-up +
// overtaking live in physics.js; spawn/flag plumbing lives in game.js,
// tunnel.js and editor.js.
// ============================================================

// ── Tuning ──
var HEAVY_GRAV_MULT = 2.4;   // gravity multiplier vs. normal marbles
var HEAVY_MAX_VY    = 19;    // max downward speed (kept < radius/substep to avoid tunnelling)
var HEAVY_CORE_R    = 0.4;   // core radius as a fraction of the marble radius
var HEAVY_CORE_POP  = 0.09;  // per-frame shrink rate of the core on landing

// Set true by drawStock while rendering an OPEN heavy box so the shared
// drawBoxMarbles helper gives each preview marble its own visible core.
var heavyMarbleContext = false;

// ── The metal ring wrapped around the marble's equator ──
// Drawn AFTER drawMarble (which paints the full-colour sphere), a tilted
// brushed-steel band clipped to the sphere so it hugs the surface.
// `coreScale` (0..1) contracts the band to nothing on landing.
function drawHeavyCore(x, y, r, coreScale) {
  if (coreScale == null) coreScale = 1;
  var bandH = r * 0.58 * coreScale;
  if (bandH < 0.5) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-0.14); // slight Saturn-style tilt

  var g = ctx.createLinearGradient(0, -bandH / 2, 0, bandH / 2);
  g.addColorStop(0.0, '#3E4147');
  g.addColorStop(0.18, '#C8CDD4');
  g.addColorStop(0.45, '#7C828A');
  g.addColorStop(0.62, '#494D54');
  g.addColorStop(0.85, '#26282D');
  g.addColorStop(1.0, '#565A61');
  ctx.fillStyle = g;
  var ww = r * 1.35;
  ctx.fillRect(-ww, -bandH / 2, ww * 2, bandH);

  // bright top edge + dark bottom edge for a machined-metal read
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(0.5, r * 0.05);
  ctx.beginPath(); ctx.moveTo(-ww, -bandH / 2 + r * 0.03); ctx.lineTo(ww, -bandH / 2 + r * 0.03); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.moveTo(-ww, bandH / 2 - r * 0.03); ctx.lineTo(ww, bandH / 2 - r * 0.03); ctx.stroke();

  ctx.restore();
}

// ── One pass of the tilted metal band (annulus) for the box hoop ──
function drawBoxHoopBand(rx, ry, band, tilt) {
  ctx.save();
  ctx.rotate(tilt);
  var g = ctx.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, '#EEF1F5');
  g.addColorStop(0.4, '#AEB3BA');
  g.addColorStop(0.5, '#7E838B');
  g.addColorStop(0.6, '#565A61');
  g.addColorStop(1, '#2C2F34');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.ellipse(0, 0, rx - band, ry - band, 0, 0, Math.PI * 2);
  ctx.fill('evenodd');
  // outer dark rim + inner bright rim so the band reads as a round tube
  ctx.lineWidth = Math.max(1, band * 0.14);
  ctx.strokeStyle = 'rgba(18,20,24,0.75)';
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(0, 0, rx - band, ry - band, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ── A still-closed heavy box ──
// A horizontal metal ring (left→right, Saturn-style) sits across the
// box's middle — a wide, low ellipse fully contained within the box so
// it never overlaps neighbouring cells. The hole shows the box colour,
// which also stays visible above and below the ring. Hidden+heavy keeps
// the colour concealed. Box-local coords, origin at box centre.
function drawHeavyClosedBox(w, h, S, tick, ci, boxType) {
  var left = -w / 2, top = -h / 2, r = 6 * S;
  var rx = w * 0.42, ry = h * 0.22, band = Math.max(3 * S, h * 0.11), tilt = -0.08;

  // Box first (design + colour intact)
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

  // Horizontal ring across the middle (contained within the box)
  drawBoxHoopBand(rx, ry, band, tilt);
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
