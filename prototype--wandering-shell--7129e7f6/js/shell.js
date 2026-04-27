// ============================================================
// shell.js — Wandering Shell mechanic
// A steel armor plate (HP 3→2→1→0) that sits on any box.
// Each adjacent tap deals 1 damage; on each hit the shell
// jumps to a random new active box. At 0 HP it shatters.
// ============================================================

function drawShellOverlay(ctx, x, y, w, h, S, hp, tick, hitT, jumpT, destroyT) {
  ctx.save();

  var cx = x + w / 2, cy = y + h / 2;
  var alpha = 1, scale = 1;

  if (destroyT > 0) {
    alpha = destroyT * destroyT;
    scale = 1 + (1 - destroyT) * 0.5;
  } else if (jumpT > 0) {
    scale = 1 + Math.sin(jumpT * Math.PI * 1.6) * 0.3;
  }

  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // Steel plate base
  var grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, 'rgba(95,95,108,0.94)');
  grad.addColorStop(0.5, 'rgba(62,62,74,0.96)');
  grad.addColorStop(1, 'rgba(42,42,54,0.94)');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 6 * S);
  ctx.fill();

  // Hit flash — red tint
  if (hitT > 0) {
    ctx.fillStyle = 'rgba(255,55,55,' + (hitT * 0.52) + ')';
    rRect(x, y, w, h, 6 * S);
    ctx.fill();
  }

  // Metallic border
  ctx.strokeStyle = 'rgba(145,148,168,0.8)';
  ctx.lineWidth = 2 * S;
  rRect(x, y, w, h, 6 * S);
  ctx.stroke();

  // Inner inset line
  ctx.strokeStyle = 'rgba(200,202,220,0.18)';
  ctx.lineWidth = 1 * S;
  rRect(x + 3 * S, y + 3 * S, w - 6 * S, h - 6 * S, 4 * S);
  ctx.stroke();

  // Corner rivets
  var rv = 2.8 * S, pad = 6.5 * S;
  var corners = [
    [x + pad, y + pad], [x + w - pad, y + pad],
    [x + pad, y + h - pad], [x + w - pad, y + h - pad]
  ];
  for (var i = 0; i < corners.length; i++) {
    var rx = corners[i][0], ry = corners[i][1];
    ctx.fillStyle = 'rgba(88,88,100,0.9)';
    ctx.beginPath(); ctx.arc(rx, ry, rv, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(215,215,228,0.42)';
    ctx.beginPath(); ctx.arc(rx - rv * 0.28, ry - rv * 0.28, rv * 0.42, 0, Math.PI * 2); ctx.fill();
  }

  // HP number with pulsing glow
  var numSize = Math.min(w, h) * 0.44;
  ctx.font = 'bold ' + numSize + 'px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var numColor = hp >= 3 ? '#EAEAF8' : hp === 2 ? '#FFD060' : '#FF6055';
  var glowColor = hp >= 3 ? 'rgba(175,178,255,0.65)' : hp === 2 ? 'rgba(255,198,55,0.75)' : 'rgba(255,70,50,0.85)';
  var pulse = Math.sin(tick * 0.07) * 0.28 + 0.72;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 9 * S * pulse;
  ctx.fillStyle = numColor;
  ctx.fillText(hp, cx, cy + 1 * S);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Crack marks at HP 1
  if (hp === 1) {
    ctx.strokeStyle = 'rgba(75,58,48,0.48)';
    ctx.lineWidth = 1.5 * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.22, y + h * 0.16);
    ctx.lineTo(x + w * 0.44, y + h * 0.48);
    ctx.lineTo(x + w * 0.32, y + h * 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.62, y + h * 0.22);
    ctx.lineTo(x + w * 0.56, y + h * 0.54);
    ctx.stroke();
  }

  ctx.restore();
}

function damageAdjacentShells(idx) {
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  var neighbors = [];
  if (row > 0)          neighbors.push((row - 1) * L.cols + col);
  if (row < L.rows - 1) neighbors.push((row + 1) * L.cols + col);
  if (col > 0)          neighbors.push(row * L.cols + (col - 1));
  if (col < L.cols - 1) neighbors.push(row * L.cols + (col + 1));

  for (var ni = 0; ni < neighbors.length; ni++) {
    var nb = stock[neighbors[ni]];
    if (!nb || nb.isTunnel || nb.isWall || nb.empty || nb.used) continue;
    if (nb.shellHP <= 0) continue;

    var newHP = nb.shellHP - 1;
    var bx = nb.x + L.bw / 2, by = nb.y + L.bh / 2;

    if (newHP <= 0) {
      // Shell shattered
      nb.shellHP = 0;
      nb.shellDestroyT = 1.0;
      if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
      for (var p = 0; p < 22; p++) {
        var a = Math.PI * 2 * p / 22 + Math.random() * 0.3;
        var sp = 3 + Math.random() * 5;
        particles.push({
          x: bx, y: by,
          vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
          r: (2 + Math.random() * 4) * S,
          color: Math.random() > 0.4 ? 'rgba(195,200,218,0.95)' : 'rgba(255,255,255,0.9)',
          life: 1, decay: 0.016 + Math.random() * 0.016, grav: true
        });
      }
      nb.popT = 0.8;
    } else {
      // Shell takes damage and jumps
      nb.shellHitT = 1.0;
      if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();

      // Metal sparks at old position
      for (var p = 0; p < 12; p++) {
        var a = Math.PI * 2 * p / 12 + Math.random() * 0.4;
        var sp = 2 + Math.random() * 3.5;
        particles.push({
          x: bx, y: by,
          vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
          r: (1 + Math.random() * 2.5) * S,
          color: Math.random() > 0.5 ? 'rgba(175,180,200,0.9)' : 'rgba(255,215,90,0.85)',
          life: 0.65, decay: 0.032 + Math.random() * 0.028, grav: false
        });
      }

      // Find valid jump targets
      var validTargets = [];
      for (var si = 0; si < stock.length; si++) {
        if (si === neighbors[ni]) continue;
        var s = stock[si];
        if (!s || s.isTunnel || s.isWall || s.empty || s.used || s.spawning) continue;
        if (s.shellHP > 0) continue;
        validTargets.push(si);
      }

      if (validTargets.length > 0) {
        var targetIdx = validTargets[Math.floor(Math.random() * validTargets.length)];
        var target = stock[targetIdx];
        nb.shellHP = 0;
        nb.shellHitT = 0;
        target.shellHP = newHP;
        target.shellJumpT = 1.0;
        // Landing sparks at new position
        var tx = target.x + L.bw / 2, ty = target.y + L.bh / 2;
        for (var p = 0; p < 8; p++) {
          var a2 = Math.PI * 2 * p / 8 + Math.random() * 0.5;
          particles.push({
            x: tx, y: ty,
            vx: Math.cos(a2) * (1.5 + Math.random() * 2) * S,
            vy: Math.sin(a2) * (1.5 + Math.random() * 2) * S,
            r: (1 + Math.random() * 2) * S,
            color: 'rgba(195,200,218,0.85)',
            life: 0.5, decay: 0.04, grav: false
          });
        }
      } else {
        // Nowhere to jump — shell stays in place with new HP
        nb.shellHP = newHP;
      }
    }
  }
}
