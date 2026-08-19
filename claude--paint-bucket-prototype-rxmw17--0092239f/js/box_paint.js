// ============================================================
// box_paint.js — Paint Bucket box type
// A normal box full of marbles, but marked with a paint bucket.
// When tapped it pours its marbles like any box; the moment the
// first marble lands on the belt, a paint splash randomly recolors
// PAINT_REPAINT_COUNT other boxes and their matching customers
// (the colored order slots in the sort columns).
// ============================================================

registerBoxType('paint', {
  label: 'Paint',
  editorColor: '#E84393',

  // ── Little bucket + multicolor drip drawn on top of a box ──
  drawBucketIcon: function (ctx, x, y, w, h, S, tick) {
    ctx.save();
    var cx = x + w / 2;
    var cy = y + h / 2;
    var bw = w * 0.46, bh = h * 0.34;
    var topY = cy - bh * 0.35;

    // Colorful paint rim behind the bucket lip
    var rimR = bw * 0.62;
    for (var k = 0; k < NUM_COLORS; k++) {
      var a0 = Math.PI + (k / NUM_COLORS) * Math.PI;
      var a1 = Math.PI + ((k + 1) / NUM_COLORS) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.arc(cx, topY, rimR, a0, a1);
      ctx.closePath();
      ctx.fillStyle = COLORS[k].fill;
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Bucket body (trapezoid, metal grey)
    var halfTop = bw / 2, halfBot = bw * 0.34;
    var bodyGrad = ctx.createLinearGradient(cx - halfTop, topY, cx + halfTop, topY + bh);
    bodyGrad.addColorStop(0, '#8A8078');
    bodyGrad.addColorStop(0.5, '#C9C0B6');
    bodyGrad.addColorStop(1, '#6E655D');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(cx - halfTop, topY);
    ctx.lineTo(cx + halfTop, topY);
    ctx.lineTo(cx + halfBot, topY + bh);
    ctx.lineTo(cx - halfBot, topY + bh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4A4440';
    ctx.lineWidth = 1.4 * S;
    ctx.stroke();

    // Bucket lip
    ctx.fillStyle = '#B7ADA2';
    ctx.beginPath();
    ctx.ellipse(cx, topY, halfTop, bh * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4A4440';
    ctx.lineWidth = 1 * S;
    ctx.stroke();

    // Handle
    ctx.strokeStyle = '#4A4440';
    ctx.lineWidth = 1.6 * S;
    ctx.beginPath();
    ctx.arc(cx, topY, halfTop * 0.92, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();

    // A drip dribbling down the front, cycling color slowly
    var dripCi = (Math.floor(tick / 40)) % NUM_COLORS;
    ctx.fillStyle = COLORS[dripCi].fill;
    var dx = cx - halfBot * 0.4;
    ctx.beginPath();
    ctx.moveTo(dx - w * 0.03, topY + bh * 0.55);
    ctx.lineTo(dx + w * 0.03, topY + bh * 0.55);
    ctx.lineTo(dx + w * 0.02, topY + bh + h * 0.1);
    ctx.arc(dx, topY + bh + h * 0.1, w * 0.032, 0, Math.PI * 2);
    ctx.lineTo(dx - w * 0.02, topY + bh + h * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.45;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#A09888';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
    // Bucket icon (dimmed) so it reads as a paint box even when locked
    ctx.save();
    ctx.globalAlpha = 0.5;
    this.drawBucketIcon(ctx, x, y, w, h, S, tick);
    ctx.restore();
  },

  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);
    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
      ctx.globalAlpha = phase * 2;
    }
    drawBox(x, y, w, h, ci);
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    if (phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      this.drawBucketIcon(ctx, x, y, w, h, S, tick);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  // ── Overlay drawn on top of the open/tappable box ──
  drawOpenOverlay: function (ctx, x, y, w, h, ci, S, tick) {
    this.drawBucketIcon(ctx, x, y, w, h, S, tick);
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#E84393'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">🪣</span>';
  }
});

// ============================================================
// Paint splash game logic (global helpers).
// Called from physics.js when a paint marble lands on the belt.
// ============================================================

// Fired by the first paint marble to reach the belt after a paint
// box is tapped. Recolors random eligible boxes + matching customers.
function onPaintMarbleLanded(x, y) {
  if (!paintSplashPending) return;
  paintSplashPending = false;
  triggerPaintSplash(x, y);
}

// Recolor up to PAINT_REPAINT_COUNT untouched boxes to the paint
// bucket's OWN color, mirroring each change onto matching customer
// slots so the level stays balanced. Visible (revealed) boxes are
// preferred so the splash is easy to see. Fires a splash at (x, y).
function triggerPaintSplash(x, y) {
  var newCi = paintSplashCi;

  // Big paint splash at the landing point, tinted the bucket's color.
  paintSplashBurst(x, y);
  if (typeof sfx !== 'undefined' && sfx.splash) sfx.splash();

  // Collect eligible target boxes: untouched, colored, plain-ish boxes
  // that are not already the bucket's color (so every pick is a real
  // visible change).
  var eligible = [];
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || b.isTunnel || b.isWall) continue;
    if (b.empty || b.used || b.spawning) continue;
    if (b.iceHP > 0) continue;                 // frozen — paint can't reach it
    if (b.boxType === 'blocker') continue;      // blockers keep their identity
    if (b.boxType === 'paint') continue;        // don't repaint other buckets
    if (b.remaining !== MRB_PER_BOX) continue;  // only untouched boxes
    if (b.ci === newCi) continue;               // already this color
    eligible.push(b);
  }
  shuffle(eligible);
  // Prefer boxes the player can actually see change (revealed first).
  eligible.sort(function (a, b) { return (b.revealed ? 1 : 0) - (a.revealed ? 1 : 0); });

  var n = Math.min(PAINT_REPAINT_COUNT, eligible.length);
  for (var k = 0; k < n; k++) {
    var box = eligible[k];
    var oldCi = box.ci;
    box.ci = newCi;
    box.shakeT = 0.5;
    box.popT = 1;
    var bx = box.x + L.bw / 2, by = box.y + L.bh / 2;
    paintSplashBurst(bx, by);
    // Mirror the recolor onto matching customers so supply ↔ demand
    // stays in step (keeps the level solvable).
    repaintMatchingCustomers(oldCi, newCi);
  }
}

// Flip up to ceil(MRB_PER_BOX / SORT_CAP) still-open customer slots
// from oldCi to newCi, preferring untouched slots so no in-progress
// stacks get stranded.
function repaintMatchingCustomers(oldCi, newCi) {
  var need = Math.max(1, Math.ceil(MRB_PER_BOX / SORT_CAP));
  var matches = [];
  for (var c = 0; c < sortCols.length; c++) {
    var col = sortCols[c];
    for (var r = 0; r < col.length; r++) {
      var slot = col[r];
      if (!slot.vis || slot.type === 'lock') continue;
      if (slot.ci !== oldCi) continue;
      matches.push(slot);
    }
  }
  // Prefer untouched slots first, then any remaining matches.
  matches.sort(function (a, b) { return a.filled - b.filled; });
  var flipped = 0;
  for (var m = 0; m < matches.length && flipped < need; m++) {
    matches[m].ci = newCi;
    matches[m].filled = 0;
    matches[m].squishT = 1;
    matches[m].shineT = 1;
    flipped++;
  }
}

// Paint-splatter particle burst, mostly the bucket's color with a
// few stray droplets for flair.
function paintSplashBurst(x, y) {
  for (var i = 0; i < 22; i++) {
    var a = Math.PI * 2 * i / 22 + Math.random() * 0.5;
    var sp = 3 + Math.random() * 6;
    var col = (Math.random() < 0.75) ? COLORS[paintSplashCi].fill : COLORS[~~(Math.random() * NUM_COLORS)].fill;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
      r: (2 + Math.random() * 5) * S,
      color: col,
      life: 1, decay: 0.02 + Math.random() * 0.02, grav: true
    });
  }
}
