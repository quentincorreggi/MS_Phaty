// ============================================================
// fridge.js — The Fridge mechanic
// ------------------------------------------------------------
// A see-through panel that covers a rectangular area of boxes
// (2x2, 2x3, 3x2 or 3x3) and gates them until its counter hits 0.
//
//  • Covered boxes are visible through the glass but cannot be
//    tapped and release no marbles while the fridge is closed.
//  • The transparency rule: content is shown as-is, but a box's
//    own concealment is never overridden. A Hidden box under a
//    Fridge is visible as a Hidden "?" — its colour stays hidden.
//  • Each time a sort column completes (the "customer filled"
//    trigger), every closed fridge's counter drops by 1.
//  • At 0 the fridge opens: the cover lifts and the boxes
//    underneath re-evaluate their normal path-to-bottom reveal.
//
// Runtime state lives in the global `fridges` array (config.js).
// Each entry: { r, c, w, h, counter, counterMax, open, cells[],
//               openT, shakeT, pulseT }
// Covered stock cells carry `coveredBy` = the fridge object while
// the fridge is closed; it is cleared to null on open.
// ============================================================

// ── Build runtime fridges from a level definition ──
function buildFridges(lvl) {
  fridges = [];
  if (!lvl || !lvl.fridges || !lvl.fridges.length) return;
  for (var i = 0; i < lvl.fridges.length; i++) {
    var fd = lvl.fridges[i];
    var w = fd.w || 2, h = fd.h || 2;
    var r0 = (fd.r || 0), c0 = (fd.c || 0);
    var cells = [];
    for (var rr = 0; rr < h; rr++) {
      for (var cc = 0; cc < w; cc++) {
        var r = r0 + rr, c = c0 + cc;
        if (r < 0 || r >= L.rows || c < 0 || c >= L.cols) continue;
        cells.push(r * L.cols + c);
      }
    }
    var startCounter = (fd.counter !== undefined ? fd.counter : 5);
    var f = {
      r: r0, c: c0, w: w, h: h,
      counter: startCounter, counterMax: startCounter,
      open: false, cells: cells,
      openT: 0, shakeT: 0, pulseT: 0
    };
    fridges.push(f);
    for (var k = 0; k < cells.length; k++) {
      if (stock[cells[k]]) stock[cells[k]].coveredBy = f;
    }
  }
}

// ── Geometry helpers (pixel coords of a fridge rectangle) ──
function fridgeRect(f) {
  var left = L.sx + f.c * (L.bw + L.bg);
  var top = L.sy + f.r * (L.bh + L.bg);
  var width = f.w * L.bw + (f.w - 1) * L.bg;
  var height = f.h * L.bh + (f.h - 1) * L.bg;
  return { left: left, top: top, width: width, height: height };
}

function fridgeCenter(f) {
  var rc = fridgeRect(f);
  return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
}

// ── Trigger: a sort column completed — decrement every closed fridge ──
function decrementFridges(srcX, srcY) {
  if (!fridges || !fridges.length) return;
  for (var i = 0; i < fridges.length; i++) {
    var f = fridges[i];
    if (f.open) continue;
    f.counter = Math.max(0, f.counter - 1);
    f.pulseT = 1;
    // Particles fly from the completed column toward the fridge (as on Color Panel)
    var ctr = fridgeCenter(f);
    for (var p = 0; p < 6; p++) {
      var jx = (Math.random() - 0.5) * 3;
      var jy = (Math.random() - 0.5) * 3;
      particles.push({
        x: srcX, y: srcY,
        vx: (ctr.x - srcX) * 0.05 + jx * S,
        vy: (ctr.y - srcY) * 0.05 + jy * S,
        r: (2 + Math.random() * 3) * S,
        color: p % 2 === 0 ? 'rgba(150,220,255,0.9)' : 'rgba(215,245,255,0.9)',
        life: 1, decay: 0.028 + Math.random() * 0.01, grav: false
      });
    }
    if (f.counter <= 0) openFridge(f);
  }
}

// ── Opening: lift the cover, uncover the boxes, re-run reveals ──
function openFridge(f) {
  if (f.open) return;
  f.open = true;
  f.openT = 1;
  f.counter = 0;
  for (var k = 0; k < f.cells.length; k++) {
    if (stock[f.cells[k]]) stock[f.cells[k]].coveredBy = null;
  }
  var ctr = fridgeCenter(f);
  spawnBurst(ctr.x, ctr.y, 'rgba(190,235,255,0.95)', 24);
  spawnConfetti(ctr.x, ctr.y, 16);
  if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
  // Boxes underneath now obey the normal path-to-bottom rule.
  updateBoxReveals(true);
}

// ── Per-frame animation timers ──
function updateFridges() {
  if (!fridges || !fridges.length) return;
  for (var i = 0; i < fridges.length; i++) {
    var f = fridges[i];
    if (f.shakeT > 0) f.shakeT = Math.max(0, f.shakeT - 0.05);
    if (f.pulseT > 0) f.pulseT = Math.max(0, f.pulseT - 0.04);
    if (f.openT > 0) f.openT = Math.max(0, f.openT - 0.02);
  }
}

// ── See-through rendering of a covered box ──
// Non-hidden boxes show their colour (content is visible through the
// glass); Hidden boxes keep their own concealment and show the "?".
function drawCoveredBox(b, i) {
  var bt = getBoxType(b.boxType);
  ctx.save();
  ctx.translate(b.x + L.bw / 2, b.y + L.bh / 2);

  if (b.boxType === 'hidden') {
    // Concealment preserved — the player sees a Hidden box, not its colour.
    bt.drawClosed(ctx, -L.bw / 2, -L.bh / 2, L.bw, L.bh, b.ci, S, tick, b.idlePhase);
  } else {
    drawBox(-L.bw / 2, -L.bh / 2, L.bw, L.bh, b.ci);
    if (b.boxType === 'blocker' && b.blockerCount > 0) {
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.beginPath(); rRect(-L.bw / 2, -L.bh / 2, L.bw, L.bh, 6 * S); ctx.clip();
      ctx.strokeStyle = COLORS[BLOCKER_CI].fill; ctx.lineWidth = 2 * S;
      var sg = 8 * S;
      for (var d = -L.bw; d < L.bw + L.bh; d += sg) {
        ctx.beginPath(); ctx.moveTo(-L.bw / 2 + d, -L.bh / 2); ctx.lineTo(-L.bw / 2 + d - L.bh, L.bh / 2); ctx.stroke();
      }
      ctx.restore();
    }
    if (b.remaining > 0) {
      if (b.boxType === 'blocker' && b.blockerCount > 0) {
        drawBoxMarblesWithBlockers(b.ci, b.remaining, b.blockerCount);
      } else {
        drawBoxMarbles(b.ci, b.remaining);
      }
      drawBoxLip(b.ci);
    }
    if (b.iceHP > 0) {
      var iceType = getBoxType('ice');
      if (iceType && iceType.drawIceOverlay) {
        iceType.drawIceOverlay(ctx, -L.bw / 2, -L.bh / 2, L.bw, L.bh, S, b.iceHP, tick);
      }
    }
  }
  ctx.restore();
}

// ── Glass cover + frame + counter, drawn on top of the boxes ──
function drawFridges() {
  if (!fridges || !fridges.length) return;
  for (var i = 0; i < fridges.length; i++) {
    var f = fridges[i];
    if (f.open && f.openT <= 0) continue;  // fully opened — cover is gone

    var rc = fridgeRect(f);
    var frameTh = 5 * S;                    // consistent thickness across all footprints
    var rad = 10 * S;
    var openAlpha = f.open ? f.openT : 1;

    // Shake offset (rejected tap) + opening lift
    var ox = (f.shakeT > 0) ? Math.sin(f.shakeT * 42) * 4 * S * f.shakeT : 0;
    var oy = f.open ? -(1 - f.openT) * 20 * S : 0;
    var x = rc.left + ox, y = rc.top + oy, w = rc.width, h = rc.height;

    ctx.save();
    ctx.globalAlpha = openAlpha;

    // Glass fill
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(205,238,255,0.30)');
    g.addColorStop(0.5, 'rgba(228,247,255,0.15)');
    g.addColorStop(1, 'rgba(180,220,245,0.32)');
    ctx.fillStyle = g;
    rRect(x, y, w, h, rad); ctx.fill();

    // Diagonal sheen (reads as glass, not a flat tint)
    ctx.save();
    ctx.beginPath(); rRect(x, y, w, h, rad); ctx.clip();
    ctx.globalAlpha = openAlpha * 0.5;
    var sheen = ctx.createLinearGradient(x, y, x + w, y + h);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.42, 'rgba(255,255,255,0.20)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.34)');
    sheen.addColorStop(0.58, 'rgba(255,255,255,0.20)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // Rejected-tap flash
    if (f.shakeT > 0) {
      ctx.save();
      ctx.globalAlpha = openAlpha * f.shakeT * 0.5;
      ctx.fillStyle = 'rgba(255,120,120,0.6)';
      rRect(x, y, w, h, rad); ctx.fill();
      ctx.restore();
    }

    // Thin frame
    ctx.lineJoin = 'round';
    ctx.strokeStyle = (f.shakeT > 0) ? 'rgba(224,92,92,0.95)' : 'rgba(118,150,172,0.92)';
    ctx.lineWidth = frameTh;
    rRect(x + frameTh / 2, y + frameTh / 2, w - frameTh, h - frameTh, rad); ctx.stroke();
    // Inner highlight line
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5 * S;
    rRect(x + frameTh + 1 * S, y + frameTh + 1 * S,
          w - 2 * frameTh - 2 * S, h - 2 * frameTh - 2 * S, rad * 0.7); ctx.stroke();

    // Counter badge — straddles the top-left corner so it sits on the
    // frame, not over the glass / boxes. Hidden once open.
    if (!f.open) {
      var badgeR = 14 * S;
      var pulse = 1 + f.pulseT * 0.35;
      ctx.save();
      ctx.translate(x + badgeR * 0.55, y + badgeR * 0.55);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 1.5 * S;
      var bg = ctx.createLinearGradient(0, -badgeR, 0, badgeR);
      bg.addColorStop(0, '#71B9E2'); bg.addColorStop(1, '#3C7EAF');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, badgeR, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.arc(0, 0, badgeR, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + (badgeR * 1.2) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.counter, 0, 0.5 * S);
      ctx.restore();
    }

    ctx.restore();
  }
}
