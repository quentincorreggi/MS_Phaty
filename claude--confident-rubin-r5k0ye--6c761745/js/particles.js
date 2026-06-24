// ============================================================
// particles.js — Particle spawning, updating, and drawing
// ============================================================

function spawnBurst(x, y, color, n) {
  n = n || 12;
  for (var i = 0; i < n; i++) {
    var a = Math.PI * 2 * i / n + Math.random() * 0.5, sp = 2 + Math.random() * 4;
    particles.push({ x: x, y: y, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (2 + Math.random() * 4) * S, color: color, life: 1, decay: 0.02 + Math.random() * 0.02, grav: false });
  }
}

function spawnConfetti(x, y, n) {
  n = n || 40;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 8;
    particles.push({ x: x, y: y, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 5 * S,
      r: (3 + Math.random() * 5) * S, color: COLORS[~~(Math.random() * 4)].fill, life: 1,
      decay: 0.006 + Math.random() * 0.008, grav: true });
  }
}

function tickParticles() {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    if (p.homing) {
      var dx = p.homingTx - p.x, dy = p.homingTy - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        var force = (p.homingForce || 0.55);
        p.vx += (dx / dist) * force * S;
        p.vy += (dy / dist) * force * S;
      }
      p.vx *= 0.86; p.vy *= 0.86;
      p.x += p.vx; p.y += p.vy;
      if (dist < (p.homingArriveR || 5 * S)) {
        if (p.onArrive) { try { p.onArrive(); } catch (e) {} p.onArrive = null; }
        p.life = 0;
      }
    } else {
      p.x += p.vx; p.y += p.vy;
      p.vy += p.grav ? 0.2 * S : 0.08 * S;
    }
    p.life -= p.decay; p.r *= 0.985;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
