// ============================================================
// frost.js — Frost Customer mechanic for sort-area boxes
// ============================================================
//
// A frost-covered sort box has frostHP > 0:
//   HP 2: opaque ice fully hides the color, blocks marbles, blocks queue
//   HP 1: cracks reveal the color, still ice-locked, still blocks marbles
//   HP 0: shattered, behaves as a normal sort box
//
// Damage: every time a neighboring column's front-row sort box completes
// filling (fills to SORT_CAP), this column's front frost loses 1 HP.
// Soft-lock safeguards run after every fill/pop:
//   1. If a column's left+right visible totals sum < 2 → break all frost here
//   2. If all 4 front-row boxes are frosted → break all of them
// ============================================================

var FROST_HP_MAX = 2;

// ── Init random frost on N non-lock sort boxes ──
function initFrostInSortCols(count) {
  if (!count || count <= 0) return;
  var candidates = [];
  for (var c = 0; c < sortCols.length; c++) {
    for (var r = 0; r < sortCols[c].length; r++) {
      var b = sortCols[c][r];
      if (b.type === 'lock') continue;
      candidates.push({ box: b, c: c, r: r });
    }
  }
  // Don't frost ALL front-row boxes; leave at least one playable front for safety.
  shuffle(candidates);
  var applied = 0;
  for (var i = 0; i < candidates.length && applied < count; i++) {
    candidates[i].box.frostHP = FROST_HP_MAX;
    candidates[i].box.frostCrackT = 0;
    candidates[i].box.frostShatterT = 0;
    applied++;
  }
}

function isFrosted(box) { return !!(box && box.frostHP > 0); }

function getSortBoxCenter(c, r) {
  if (!L || L.sBw === undefined) return null;
  var bx = L.sSx + c * (L.sBw + L.sColGap) + L.sBw / 2;
  var by = getSortBoxY(c, r) + L.sBh / 2;
  return { x: bx, y: by };
}

function frontSortIndex(c) {
  if (c < 0 || c >= sortCols.length) return -1;
  var col = sortCols[c];
  for (var r = 0; r < col.length; r++) if (col[r].vis) return r;
  return -1;
}

function countVisibleSort(c) {
  if (c < 0 || c >= sortCols.length) return 0;
  var col = sortCols[c], n = 0;
  for (var r = 0; r < col.length; r++) if (col[r].vis) n++;
  return n;
}

// ── Damage front frost in column c (called when a NEIGHBOR fills) ──
function damageFrontFrost(c) {
  if (c < 0 || c >= sortCols.length) return;
  var fr = frontSortIndex(c);
  if (fr < 0) return;
  var box = sortCols[c][fr];
  if (!box || !box.frostHP || box.frostHP <= 0) return;
  applyFrostDamage(box, c, fr);
}

function applyFrostDamage(box, c, r) {
  if (box.frostHP <= 0) return;
  box.frostHP--;
  box.squishT = 1;
  if (box.frostHP === 1) {
    box.frostCrackT = 1.0;
    spawnFrostHitParticles(c, r);
    try { tone(900, 0.08, 'sine', 0.07, 500); } catch (e) {}
  } else if (box.frostHP <= 0) {
    box.frostHP = 0;
    box.frostShatterT = 1.0;
    box.shineT = 1;
    spawnFrostShatterParticles(c, r);
    try { tone(1200, 0.12, 'triangle', 0.10, 500); } catch (e) {}
    try { setTimeout(function () { tone(1700, 0.08, 'sine', 0.06, 800); }, 60); } catch (e) {}
  }
}

function shatterFrost(box, c, r) {
  // Force to 0 HP (soft-lock safeguard path)
  if (box.frostHP > 1) box.frostHP = 1; // tick visual through crack
  applyFrostDamage(box, c, r);
}

// ── Particles ──
function spawnFrostHitParticles(c, r) {
  var pos = getSortBoxCenter(c, r);
  if (!pos) return;
  for (var p = 0; p < 10; p++) {
    var a = Math.PI * 2 * p / 10 + Math.random() * 0.4, sp = 1.5 + Math.random() * 2.2;
    particles.push({ x: pos.x, y: pos.y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1 * S,
      r: (1.6 + Math.random() * 2) * S,
      color: 'rgba(200,235,255,0.85)',
      life: 0.8, decay: 0.03, grav: false });
  }
}

function spawnFrostShatterParticles(c, r) {
  var pos = getSortBoxCenter(c, r);
  if (!pos) return;
  for (var p = 0; p < 20; p++) {
    var a = Math.PI * 2 * p / 20 + Math.random() * 0.3, sp = 2.5 + Math.random() * 4;
    particles.push({ x: pos.x, y: pos.y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
      r: (2 + Math.random() * 3) * S,
      color: Math.random() > 0.5 ? 'rgba(180,225,255,0.92)' : 'rgba(220,240,255,0.95)',
      life: 1, decay: 0.018, grav: true });
  }
  for (var p = 0; p < 8; p++) {
    var a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2;
    particles.push({ x: pos.x, y: pos.y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (3 + Math.random() * 3) * S, color: 'rgba(255,255,255,0.7)',
      life: 0.6, decay: 0.04, grav: false });
  }
}

// ── Per-frame animation tick ──
function tickFrost() {
  for (var c = 0; c < sortCols.length; c++) {
    for (var r = 0; r < sortCols[c].length; r++) {
      var b = sortCols[c][r];
      if (b.frostCrackT > 0) b.frostCrackT = Math.max(0, b.frostCrackT - 0.025);
      if (b.frostShatterT > 0) b.frostShatterT = Math.max(0, b.frostShatterT - 0.02);
    }
  }
}

// ── Soft-lock checks ──
function checkFrostSoftLock() {
  // Rule 2: all 4 front-row boxes frosted → break all
  var fronts = [];
  var allFrosted = true, anyExists = false;
  for (var c = 0; c < 4; c++) {
    var fr = frontSortIndex(c);
    if (fr < 0) { allFrosted = false; continue; }
    anyExists = true;
    fronts.push({ c: c, r: fr, box: sortCols[c][fr] });
    if (!isFrosted(sortCols[c][fr])) allFrosted = false;
  }
  if (anyExists && allFrosted) {
    for (var i = 0; i < fronts.length; i++) {
      var f = fronts[i];
      if (isFrosted(f.box)) shatterFrost(f.box, f.c, f.r);
    }
    return; // recheck after these break naturally on next tick
  }
  // Rule 1: neighbor visible totals < 2 → break all frost in this column
  for (var c2 = 0; c2 < 4; c2++) {
    var left = countVisibleSort(c2 - 1);
    var right = countVisibleSort(c2 + 1);
    if (left + right >= 2) continue;
    var col = sortCols[c2];
    for (var r2 = 0; r2 < col.length; r2++) {
      if (col[r2].vis && isFrosted(col[r2])) shatterFrost(col[r2], c2, r2);
    }
  }
}

// ── Rendering ──
//
// Called from drawSortArea while ctx is translated to the box center
// and pre-squished. lx/ly are the local top-left.
function drawFrostOverlay(box, lx, ly, w, h, hp, tick) {
  ctx.save();
  if (hp >= 2) {
    // Opaque frost slab — completely hides the color
    var grad = ctx.createLinearGradient(lx, ly, lx + w * 0.4, ly + h);
    grad.addColorStop(0, '#E2F4FF');
    grad.addColorStop(0.5, '#B0DDF7');
    grad.addColorStop(1, '#D8EEFF');
    ctx.fillStyle = grad;
    rRect(lx, ly, w, h, 8 * S); ctx.fill();
    // Border
    ctx.strokeStyle = 'rgba(120,180,220,0.85)';
    ctx.lineWidth = 2 * S;
    rRect(lx, ly, w, h, 8 * S); ctx.stroke();
    // Inner highlight band
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2 * S;
    rRect(lx + 2 * S, ly + 2 * S, w - 4 * S, h - 4 * S, 7 * S); ctx.stroke();

    // Shimmer highlights
    var shimmer = Math.sin(tick * 0.05) * 0.10 + 0.20;
    ctx.fillStyle = 'rgba(255,255,255,' + shimmer + ')';
    ctx.beginPath(); ctx.arc(lx + w * 0.22, ly + h * 0.30, h * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(lx + w * 0.78, ly + h * 0.55, h * 0.10, 0, Math.PI * 2); ctx.fill();

    // Ice crystal accents
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.2 * S;
    var cx1 = lx + w * 0.62, cy1 = ly + h * 0.30, cr1 = h * 0.16;
    for (var a = 0; a < 3; a++) {
      var ang = a * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(cx1 - Math.cos(ang) * cr1, cy1 - Math.sin(ang) * cr1);
      ctx.lineTo(cx1 + Math.cos(ang) * cr1, cy1 + Math.sin(ang) * cr1);
      ctx.stroke();
    }
    var cx2 = lx + w * 0.30, cy2 = ly + h * 0.70, cr2 = h * 0.12;
    for (var a2 = 0; a2 < 3; a2++) {
      var ang2 = a2 * Math.PI / 3 + 0.5;
      ctx.beginPath();
      ctx.moveTo(cx2 - Math.cos(ang2) * cr2, cy2 - Math.sin(ang2) * cr2);
      ctx.lineTo(cx2 + Math.cos(ang2) * cr2, cy2 + Math.sin(ang2) * cr2);
      ctx.stroke();
    }
  } else {
    // hp === 1 — translucent cracked overlay (color still shows through)
    var grad2 = ctx.createLinearGradient(lx, ly, lx + w * 0.4, ly + h);
    grad2.addColorStop(0, 'rgba(200,235,255,0.42)');
    grad2.addColorStop(0.5, 'rgba(140,210,255,0.28)');
    grad2.addColorStop(1, 'rgba(200,235,255,0.42)');
    ctx.fillStyle = grad2;
    rRect(lx, ly, w, h, 8 * S); ctx.fill();
    ctx.strokeStyle = 'rgba(160,210,240,0.7)';
    ctx.lineWidth = 1.8 * S;
    rRect(lx, ly, w, h, 8 * S); ctx.stroke();

    // Crack lines
    ctx.strokeStyle = 'rgba(80,90,110,0.55)';
    ctx.lineWidth = 1.4 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lx + w * 0.20, ly + h * 0.20);
    ctx.lineTo(lx + w * 0.38, ly + h * 0.50);
    ctx.lineTo(lx + w * 0.30, ly + h * 0.66);
    ctx.lineTo(lx + w * 0.55, ly + h * 0.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx + w * 0.38, ly + h * 0.50);
    ctx.lineTo(lx + w * 0.58, ly + h * 0.42);
    ctx.lineTo(lx + w * 0.78, ly + h * 0.58);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx + w * 0.55, ly + h * 0.20);
    ctx.lineTo(lx + w * 0.68, ly + h * 0.35);
    ctx.stroke();

    // White highlight on cracks
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.7 * S;
    ctx.beginPath();
    ctx.moveTo(lx + w * 0.21, ly + h * 0.19);
    ctx.lineTo(lx + w * 0.39, ly + h * 0.49);
    ctx.stroke();
  }

  ctx.restore();
}
