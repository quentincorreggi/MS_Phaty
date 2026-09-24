// ============================================================
// mushroom.js — Removable Tunnel ("Mushroom"). Behaves exactly
//               like a tunnel, but once its last box has come out
//               it shrinks into the ground and leaves an empty,
//               passable slot behind.
// ============================================================

var MUSHROOM_VANISH_SPEED = 0.035;  // vanishT drop per frame (~0.5s)
var MUSHROOM_SPORE_COLORS = ['#E8453C', '#FFFFFF', '#F3E6C8', '#FF8A7A'];

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

  // ── Mushroom body (anchored at the base, wobbles + squashes) ──
  var cx = x + w / 2;
  var baseY = y + h * 0.9;
  var wobble = active && !vanishing ? Math.sin(tick * 0.05 + b.idlePhase) * 0.05 : 0;
  var sq = b.mushroomSquashT || 0;
  var squash = Math.sin(sq * Math.PI) * 0.18;

  ctx.translate(cx, baseY);
  ctx.rotate(wobble);
  ctx.scale(grow * (1 + squash), grow * (1 - squash));

  // Stem
  var stemTopW = w * 0.24, stemBotW = w * 0.32, stemH = h * 0.42;
  var sg = ctx.createLinearGradient(-stemBotW / 2, 0, stemBotW / 2, 0);
  sg.addColorStop(0, '#E9DBBA');
  sg.addColorStop(0.5, '#FFF6E2');
  sg.addColorStop(1, '#D8C69E');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(-stemBotW / 2, 0);
  ctx.quadraticCurveTo(-stemTopW / 2 - w * 0.03, -stemH * 0.5, -stemTopW / 2, -stemH);
  ctx.lineTo(stemTopW / 2, -stemH);
  ctx.quadraticCurveTo(stemTopW / 2 + w * 0.03, -stemH * 0.5, stemBotW / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,125,85,0.5)';
  ctx.lineWidth = 1 * S;
  ctx.stroke();

  // Direction arrow on the stem
  var ay = -stemH * 0.45, as = w * 0.09;
  var dir = b.tunnelDir;
  ctx.fillStyle = active ? 'rgba(210,120,30,0.9)' : 'rgba(150,130,100,0.5)';
  ctx.beginPath();
  if (dir === 'top') {
    ctx.moveTo(0, ay - as); ctx.lineTo(-as * 0.8, ay + as * 0.5); ctx.lineTo(as * 0.8, ay + as * 0.5);
  } else if (dir === 'bottom') {
    ctx.moveTo(0, ay + as); ctx.lineTo(-as * 0.8, ay - as * 0.5); ctx.lineTo(as * 0.8, ay - as * 0.5);
  } else if (dir === 'left') {
    ctx.moveTo(-as, ay); ctx.lineTo(as * 0.5, ay - as * 0.8); ctx.lineTo(as * 0.5, ay + as * 0.8);
  } else {
    ctx.moveTo(as, ay); ctx.lineTo(-as * 0.5, ay - as * 0.8); ctx.lineTo(-as * 0.5, ay + as * 0.8);
  }
  ctx.closePath();
  ctx.fill();

  // Cap underside (gills)
  var capY = -stemH + h * 0.02;
  var capRx = w * 0.44, capRy = h * 0.4;
  ctx.fillStyle = '#E3CFA6';
  ctx.beginPath();
  ctx.ellipse(0, capY, capRx * 0.92, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cap dome
  var cg = ctx.createRadialGradient(-capRx * 0.3, capY - capRy * 0.7, capRx * 0.1, 0, capY - capRy * 0.3, capRx * 1.1);
  cg.addColorStop(0, active ? '#FF7A6B' : '#C98A82');
  cg.addColorStop(0.55, active ? '#E8453C' : '#A86A62');
  cg.addColorStop(1, active ? '#A8231E' : '#7E4E48');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(-capRx, capY);
  ctx.bezierCurveTo(-capRx, capY - capRy * 1.3, capRx, capY - capRy * 1.3, capRx, capY);
  ctx.quadraticCurveTo(0, capY + h * 0.06, -capRx, capY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(110,20,15,0.5)';
  ctx.lineWidth = 1.2 * S;
  ctx.stroke();

  // White spots
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  var spots = [
    [-0.5, -0.45, 0.13], [0.05, -0.8, 0.15], [0.52, -0.42, 0.12],
    [-0.15, -0.3, 0.08], [0.3, -0.72, 0.07]
  ];
  for (var sp = 0; sp < spots.length; sp++) {
    ctx.beginPath();
    ctx.ellipse(capRx * spots[sp][0], capY + capRy * spots[sp][1],
      w * spots[sp][2], w * spots[sp][2] * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Glossy highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-capRx * 0.35, capY - capRy * 0.72, capRx * 0.25, capRy * 0.12, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // ── Count badge (top-right, not scaled by wobble) ──
  if (!vanishing) {
    var badgeR = Math.min(w, h) * 0.17;
    var bx = x + w - badgeR * 0.8, by = y + badgeR * 0.8;
    ctx.save();
    ctx.fillStyle = active ? 'rgba(255,255,255,0.95)' : 'rgba(220,210,200,0.6)';
    ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = active ? 'rgba(200,50,40,0.8)' : 'rgba(140,120,110,0.5)';
    ctx.lineWidth = 1.5 * S;
    ctx.stroke();
    ctx.fillStyle = active ? '#C0302A' : '#8A7A70';
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
  spawnBurst(cx, cy, '#E8453C', 10);
  sfx.poof();

  // The cell is now open space — boxes behind it may have a path now
  updateBoxReveals(true);
}
