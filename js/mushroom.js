// ============================================================
// mushroom.js — Removable Tunnel ("Mushroom"). Behaves exactly
//               like a tunnel, but once its last box has come out
//               it shrinks into the ground and leaves an empty,
//               passable slot behind.
// ============================================================

var MUSHROOM_VANISH_SPEED = 0.035;  // vanishT drop per frame (~0.5s)
var MUSHROOM_SPORE_COLORS = ['#D7332A', '#FFFFFF', '#E8E0CE', '#3A938F'];

// Soft "poof" when a mushroom disappears
sfx.poof = function () {
  tone(320, 0.28, 'sine', 0.14, 90);
  setTimeout(function () { tone(1100, 0.1, 'triangle', 0.05, 500); }, 40);
};

// ── Drawing ──

function drawMushroomOnGrid(ctx, b, x, y, w, h, S, tick) {
  var remaining = b.tunnelContents ? b.tunnelContents.length : 0;
  var active = remaining > 0;
  var vanishing = !!b.mushroomVanishing;
  var grow = vanishing ? Math.max(0, b.mushroomVanishT) : 1;

  // Empty slot shows through while the mushroom shrinks away
  if (vanishing) drawEmptySlot(x, y, w, h);

  ctx.save();
  ctx.globalAlpha = vanishing ? Math.min(1, grow * 1.4) : 1;

  // ── Mossy ground patch ──
  if (!vanishing || grow > 0.3) {
    ctx.save();
    ctx.globalAlpha *= vanishing ? (grow - 0.3) / 0.7 : 1;
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 5 * S;
    ctx.shadowOffsetY = 2 * S;
    var gg = ctx.createLinearGradient(x, y, x, y + h);
    gg.addColorStop(0, '#8DBF6A');
    gg.addColorStop(1, '#5C8F45');
    ctx.fillStyle = gg;
    rRect(x, y, w, h, 6 * S);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = active ? 'rgba(70,110,50,0.7)' : 'rgba(70,110,50,0.4)';
    ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S);
    ctx.stroke();
    // Grass tufts
    ctx.strokeStyle = 'rgba(60,110,40,0.55)';
    ctx.lineWidth = 1.2 * S;
    var tufts = [0.14, 0.28, 0.74, 0.88];
    for (var t = 0; t < tufts.length; t++) {
      var tx = x + w * tufts[t], ty = y + h * 0.93;
      ctx.beginPath();
      ctx.moveTo(tx - 2 * S, ty); ctx.lineTo(tx - 3 * S, ty - 4 * S);
      ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 5 * S);
      ctx.moveTo(tx + 2 * S, ty); ctx.lineTo(tx + 3 * S, ty - 4 * S);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Mushroom body: bell cap with a teal "mouth" rim ──
  // Drawn with the mouth facing down, then rotated so it faces
  // the tunnel's exit direction.
  var u = Math.min(w, h);
  var dirRot = { bottom: 0, top: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
  var wobble = active && !vanishing ? Math.sin(tick * 0.05 + b.idlePhase) * 0.05 : 0;
  var sq = b.mushroomSquashT || 0;
  var squash = Math.sin(sq * Math.PI);

  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((dirRot[b.tunnelDir] || 0) + wobble);
  ctx.scale(grow * (1 + squash * 0.08), grow * (1 - squash * 0.12));

  // Soft contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, u * 0.3, u * 0.42, u * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Knob on top
  ctx.fillStyle = '#E8E0CE';
  ctx.strokeStyle = 'rgba(150,135,110,0.6)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(-u * 0.07, -u * 0.3);
  ctx.quadraticCurveTo(-u * 0.1, -u * 0.4, -u * 0.06, -u * 0.43);
  ctx.quadraticCurveTo(-u * 0.03, -u * 0.38, 0, -u * 0.44);
  ctx.quadraticCurveTo(u * 0.03, -u * 0.38, u * 0.06, -u * 0.43);
  ctx.quadraticCurveTo(u * 0.1, -u * 0.4, u * 0.07, -u * 0.3);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Dome
  var dw = u * 0.33;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-dw, u * 0.2);
  ctx.lineTo(-dw, -u * 0.04);
  ctx.bezierCurveTo(-dw, -u * 0.42, dw, -u * 0.42, dw, -u * 0.04);
  ctx.lineTo(dw, u * 0.2);
  ctx.closePath();
  var dg = ctx.createLinearGradient(-dw, 0, dw, 0);
  dg.addColorStop(0, '#E4DCD6');
  dg.addColorStop(0.35, '#FFFFFF');
  dg.addColorStop(1, '#D9D0CA');
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,95,0.35)';
  ctx.lineWidth = 1 * S;
  ctx.stroke();
  ctx.clip();

  // Red spots (clipped to the dome)
  ctx.fillStyle = '#D7332A';
  var spots = [
    [-0.2, -0.22, 0.075, 0.055], [0.02, -0.29, 0.05, 0.035], [0.22, -0.18, 0.07, 0.085],
    [-0.12, -0.06, 0.035, 0.035], [0.14, -0.02, 0.04, 0.045], [-0.3, 0.02, 0.035, 0.06],
    [0.32, 0.04, 0.03, 0.06], [-0.08, 0.14, 0.07, 0.04], [0.26, 0.15, 0.03, 0.03]
  ];
  for (var sp = 0; sp < spots.length; sp++) {
    ctx.beginPath();
    ctx.ellipse(u * spots[sp][0], u * spots[sp][1], u * spots[sp][2], u * spots[sp][3], 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Glossy highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-dw * 0.45, -u * 0.2, dw * 0.18, u * 0.1, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Teal mouth rim (thick ring) — stretches open when a box pops out
  var ry = u * 0.24;
  var rimRx = u * 0.43 * (1 + squash * 0.08), rimRy = u * 0.12;
  var tg = ctx.createLinearGradient(0, ry - rimRy, 0, ry + rimRy);
  tg.addColorStop(0, '#3A938F');
  tg.addColorStop(1, '#1D5E5C');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.ellipse(0, ry, rimRx, rimRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,55,55,0.6)';
  ctx.lineWidth = 1 * S;
  ctx.stroke();

  // Dark opening inside the rim
  var holeRx = rimRx * (0.7 + squash * 0.1), holeRy = rimRy * (0.42 + squash * 0.25);
  var hg = ctx.createRadialGradient(0, ry, 0, 0, ry, holeRx);
  hg.addColorStop(0, active ? 'rgba(10,25,25,0.95)' : 'rgba(40,50,50,0.8)');
  hg.addColorStop(1, 'rgba(20,50,50,0.9)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(0, ry + rimRy * 0.1, holeRx, holeRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warm glow deep inside when boxes are waiting
  if (active) {
    var glow = Math.sin(tick * 0.06) * 0.12 + 0.3 + squash * 0.4;
    ctx.fillStyle = 'rgba(255,200,110,' + glow + ')';
    ctx.beginPath();
    ctx.ellipse(0, ry + rimRy * 0.1, holeRx * 0.5, holeRy * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Front lip highlight on the ring
  ctx.strokeStyle = 'rgba(140,210,205,0.55)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.ellipse(0, ry, rimRx * 0.86, rimRy * 0.78, 0, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  ctx.restore();

  // ── Count badge (top-right, not scaled by wobble) ──
  if (!vanishing) {
    var badgeR = Math.min(w, h) * 0.17;
    var bx = x + w - badgeR * 0.8, by = y + badgeR * 0.8;
    ctx.save();
    ctx.fillStyle = active ? 'rgba(255,255,255,0.95)' : 'rgba(220,210,200,0.6)';
    ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = active ? 'rgba(29,94,92,0.9)' : 'rgba(140,120,110,0.5)';
    ctx.lineWidth = 1.5 * S;
    ctx.stroke();
    ctx.fillStyle = active ? '#1D5E5C' : '#8A7A70';
    ctx.font = 'bold ' + (badgeR * 1.25) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(remaining, bx, by + 0.5);
    ctx.restore();
  }
}

// ── Spore particles ──

function spawnSpores(x, y, n, speed) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = (0.8 + Math.random() * 1.6) * (speed || 1);
    particles.push({
      x: x + (Math.random() - 0.5) * L.bw * 0.4, y: y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
      r: (1.5 + Math.random() * 3) * S,
      color: MUSHROOM_SPORE_COLORS[~~(Math.random() * MUSHROOM_SPORE_COLORS.length)],
      life: 0.9, decay: 0.02 + Math.random() * 0.015, grav: false
    });
  }
}

// ── Update (called every frame from game.js update) ──

function updateMushrooms() {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s.isTunnel || !s.tunnelRemovable) continue;

    var count = s.tunnelContents.length;
    var capX = s.x + L.bw / 2, capY = s.y + L.bh * 0.35;

    // A box just came out: squash-and-bounce + spore puff
    if (s.mushroomLastCount !== count) {
      if (s.mushroomLastCount !== undefined && count < s.mushroomLastCount) {
        s.mushroomSquashT = 1;
        spawnSpores(capX, capY, 8, 1);
      }
      s.mushroomLastCount = count;
    }
    if (s.mushroomSquashT > 0) s.mushroomSquashT = Math.max(0, s.mushroomSquashT - 0.05);

    // Out of boxes: start shrinking into the ground
    if (!s.mushroomVanishing && count === 0 && !s.tunnelSpawning) {
      s.mushroomVanishing = true;
      s.mushroomVanishT = 1;
    }

    if (s.mushroomVanishing) {
      s.mushroomVanishT -= MUSHROOM_VANISH_SPEED;
      if (tick % 4 === 0) spawnSpores(capX, s.y + L.bh * 0.6, 1, 0.5);
      if (s.mushroomVanishT <= 0) removeMushroom(i);
    }
  }
}

function removeMushroom(idx) {
  var s = stock[idx];
  var cx = s.x + L.bw / 2, cy = s.y + L.bh / 2;

  stock[idx] = {
    ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
    revealed: true, empty: true, boxType: 'default', isTunnel: false, isWall: false,
    iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
    x: s.x, y: s.y,
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
  };

  spawnSpores(cx, cy, 22, 2.2);
  spawnBurst(cx, cy, '#D7332A', 10);
  sfx.poof();

  // The cell is now open space — boxes behind it may have a path now
  updateBoxReveals(true);
}
