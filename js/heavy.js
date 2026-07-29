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

// ── One metallic chain band running between two points ──
function drawChainBand(x1, y1, x2, y2, thick) {
  var ang = Math.atan2(y2 - y1, x2 - x1);
  var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
  ctx.save();
  ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
  ctx.rotate(ang);
  var g = ctx.createLinearGradient(0, -thick / 2, 0, thick / 2);
  g.addColorStop(0, '#E7EAEE');
  g.addColorStop(0.28, '#B4B9C0');
  g.addColorStop(0.5, '#82888F');
  g.addColorStop(0.72, '#4E525A');
  g.addColorStop(1, '#2E3136');
  ctx.fillStyle = g;
  rRect(-len / 2, -thick / 2, len, thick, thick * 0.5); ctx.fill();
  // link separations
  ctx.strokeStyle = 'rgba(18,20,24,0.6)'; ctx.lineWidth = Math.max(0.8, thick * 0.12); ctx.lineCap = 'round';
  var link = thick * 1.05;
  for (var d = -len / 2 + link * 0.5; d < len / 2; d += link) {
    ctx.beginPath(); ctx.moveTo(d, -thick * 0.42); ctx.lineTo(d, thick * 0.42); ctx.stroke();
  }
  // top highlight + dark outline
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.5, thick * 0.1);
  ctx.beginPath(); ctx.moveTo(-len / 2 + thick * 0.3, -thick * 0.2); ctx.lineTo(len / 2 - thick * 0.3, -thick * 0.2); ctx.stroke();
  ctx.strokeStyle = 'rgba(18,20,24,0.7)'; ctx.lineWidth = Math.max(0.8, thick * 0.1);
  rRect(-len / 2, -thick / 2, len, thick, thick * 0.5); ctx.stroke();
  ctx.restore();
}

// ── A small steel padlock at the chains' crossing ──
function drawPadlock(cx, cy, size) {
  ctx.save();
  // shackle
  ctx.strokeStyle = '#6A6E76'; ctx.lineWidth = size * 0.15; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy - size * 0.02, size * 0.26, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#3E4147'; ctx.lineWidth = size * 0.06;
  ctx.beginPath(); ctx.arc(cx, cy - size * 0.02, size * 0.26, Math.PI, Math.PI * 2); ctx.stroke();
  // body
  var bw = size * 0.74, bh = size * 0.56, bx = cx - bw / 2, by = cy - size * 0.02;
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.04;
  var g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, '#D2D7DD'); g.addColorStop(0.5, '#9298A0'); g.addColorStop(1, '#54585F');
  ctx.fillStyle = g;
  rRect(bx, by, bw, bh, size * 0.14); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(18,20,24,0.7)'; ctx.lineWidth = Math.max(0.8, size * 0.05);
  rRect(bx, by, bw, bh, size * 0.14); ctx.stroke();
  // keyhole
  ctx.fillStyle = 'rgba(20,22,26,0.85)';
  ctx.beginPath(); ctx.arc(cx, by + bh * 0.42, size * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(cx - size * 0.03, by + bh * 0.42, size * 0.06, bh * 0.34);
  ctx.restore();
}

// ── A still-closed heavy box ──
// Full box colour stays visible (so the player can read it), wrapped in
// crossed metal CHAINS with a padlock — a chained-up "heavy" box. When it
// opens the chains snap (see breakHeavyChains) and the weights spill out.
// Hidden+heavy keeps the colour concealed. Box-local coords, origin centre.
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

  // Crossed chains (X) + padlock. Colour shows in the corners.
  var thick = h * 0.15;
  var inset = w * 0.05;
  drawChainBand(left + inset, top + inset, left + w - inset, top + h - inset, thick);
  drawChainBand(left + w - inset, top + inset, left + inset, top + h - inset, thick);
  drawPadlock(0, 0, h * 0.36);
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

// ── Chains snapping when the box opens ──
// A burst of dark chain-link debris + a metallic "snap"; the heavy
// weights are then free to spill out.
function chainSnapSound() {
  if (typeof tone !== 'function') return;
  tone(220, 0.08, 'square', 0.12, 80);
  tone(1400, 0.06, 'square', 0.05, 500);
}

function breakHeavyChains(cx, cy) {
  for (var i = 0; i < 16; i++) {
    var a = Math.PI * 2 * i / 16 + Math.random() * 0.5;
    var sp = 3 + Math.random() * 5;
    var col = Math.random() > 0.5 ? 'rgba(150,156,164,0.95)' : 'rgba(70,74,80,0.95)';
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (2 + Math.random() * 3) * S, color: col,
      life: 1, decay: 0.02 + Math.random() * 0.02, grav: true
    });
  }
  spawnBurst(cx, cy, 'rgba(255,255,255,0.9)', 6);
  chainSnapSound();
}
