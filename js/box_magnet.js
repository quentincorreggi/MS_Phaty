// ============================================================
// box_magnet.js — Magnet box type
// Starts empty. Tap to activate (attracts funnel marbles) or
// deactivate (releases captured marbles back into funnel).
// States: deactivated | activated-attracting | activated-full
// ============================================================

registerBoxType('magnet', {
  label: 'Magnet',
  editorColor: '#708090',

  // ── Closed state: steel-gray box with magnet icon ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    // Dark steel background
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#8A9BAE');
    grad.addColorStop(1, '#4A5568');
    ctx.fillStyle = grad;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 5 * S;
    ctx.shadowOffsetY = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#3A4558';
    ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();

    // Magnet U icon
    drawMagnetIcon(ctx, x + w / 2, y + h / 2, w * 0.32, S);
  },

  // ── Reveal (same as closed for magnet — always revealed) ──
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
  },

  editorCellStyle: function (ci) {
    return {
      background: 'linear-gradient(135deg, #8A9BAE, #4A5568)',
      borderColor: '#708090'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#E44; text-shadow:0 0 4px rgba(200,50,50,0.6)">U</span>';
  }
});

// ── Draw horseshoe magnet icon ──
function drawMagnetIcon(ctx, cx, cy, size, S) {
  ctx.save();
  ctx.translate(cx, cy);
  var r = size * 0.5;

  // U-shape (horseshoe) — arc at bottom, two arms up
  ctx.lineWidth = size * 0.22;
  ctx.lineCap = 'round';

  // Left arm (red)
  ctx.strokeStyle = '#E04040';
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.6);
  ctx.lineTo(-r, r * 0.1);
  ctx.stroke();

  // Right arm (blue)
  ctx.strokeStyle = '#4060D0';
  ctx.beginPath();
  ctx.moveTo(r, -r * 0.6);
  ctx.lineTo(r, r * 0.1);
  ctx.stroke();

  // Bottom arc (gray)
  ctx.strokeStyle = '#666';
  ctx.beginPath();
  ctx.arc(0, r * 0.1, r, Math.PI, 0, true);
  ctx.stroke();

  // Tips (lighter)
  ctx.fillStyle = '#FF6060';
  ctx.beginPath(); ctx.arc(-r, -r * 0.6, size * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6080E0';
  ctx.beginPath(); ctx.arc(r, -r * 0.6, size * 0.12, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── Draw magnet box on grid (called from drawStock in rendering.js) ──
function drawMagnetBox(ctx, b, bw, bh, S, tick, isTappable) {
  var activated = b.magnetActive;
  var captured = b.magnetCaptured ? b.magnetCaptured.length : 0;
  var full = captured >= MRB_PER_BOX;

  // Base box
  var grad = ctx.createLinearGradient(-bw / 2, -bh / 2, -bw / 2, bh / 2);
  if (activated) {
    grad.addColorStop(0, full ? '#9AA8B8' : '#7A8EA8');
    grad.addColorStop(1, full ? '#5A6878' : '#3A4E68');
  } else {
    grad.addColorStop(0, '#8A9BAE');
    grad.addColorStop(1, '#4A5568');
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = grad;
  rRect(-bw / 2, -bh / 2, bw, bh, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border — golden when full, purple-blue glow when attracting
  if (full) {
    ctx.strokeStyle = '#D4A030';
    ctx.lineWidth = 2 * S;
  } else if (activated) {
    ctx.strokeStyle = '#6A80D0';
    ctx.lineWidth = 2 * S;
  } else {
    ctx.strokeStyle = '#3A4558';
    ctx.lineWidth = 1.5 * S;
  }
  rRect(-bw / 2, -bh / 2, bw, bh, 6 * S); ctx.stroke();
  ctx.restore();

  // Pulsing aura when attracting
  if (activated && !full) {
    var pulse = 0.15 + Math.sin(tick * 0.1) * 0.1;
    ctx.save();
    ctx.globalAlpha = pulse;
    var auraGrad = ctx.createRadialGradient(0, 0, bw * 0.3, 0, 0, bw * 0.7);
    auraGrad.addColorStop(0, 'rgba(100,120,220,0.4)');
    auraGrad.addColorStop(1, 'rgba(100,120,220,0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath(); ctx.arc(0, 0, bw * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Steady glow when full
  if (activated && full) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    var fullGrad = ctx.createRadialGradient(0, 0, bw * 0.2, 0, 0, bw * 0.55);
    fullGrad.addColorStop(0, 'rgba(212,160,48,0.5)');
    fullGrad.addColorStop(1, 'rgba(212,160,48,0)');
    ctx.fillStyle = fullGrad;
    ctx.beginPath(); ctx.arc(0, 0, bw * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Draw captured marbles inside (3x3 grid)
  if (captured > 0) {
    var mr = Math.min(7 * S, bw / 8.5);
    var mg = Math.min(14 * S, bw / 4.2);
    var mgY = mg * MRB_GAP_FACTOR;
    var mrbsToDraw = [];
    for (var si = 0; si < captured; si++) mrbsToDraw.push(SNAKE_ORDER[si]);
    mrbsToDraw.sort(function (a, bb) { return a.r - bb.r; });
    for (var si = 0; si < mrbsToDraw.length; si++) {
      var sp = mrbsToDraw[si];
      var mci = b.magnetCaptured[si];
      drawMarble((sp.c - 1) * mg, (sp.r - 1) * mgY - 2 * S, mr, mci);
    }
    // Lip
    ctx.save();
    var lipH = bh * LIP_PCT;
    ctx.beginPath(); ctx.rect(-bw / 2, bh / 2 - lipH, bw, lipH); ctx.clip();
    ctx.fillStyle = grad;
    rRect(-bw / 2, -bh / 2, bw, bh, 6 * S); ctx.fill();
    ctx.restore();
  }

  // Magnet icon (smaller when marbles are inside)
  if (captured === 0) {
    drawMagnetIcon(ctx, 0, 0, bw * 0.32, S);
  } else {
    // Small icon in top-left corner
    drawMagnetIcon(ctx, -bw * 0.3, -bh * 0.3, bw * 0.15, S);
  }

  // Activation indicator dot
  if (activated) {
    ctx.save();
    ctx.fillStyle = full ? '#D4A030' : '#60D060';
    var dotR = 3 * S;
    ctx.beginPath(); ctx.arc(bw / 2 - dotR * 2, -bh / 2 + dotR * 2, dotR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ── Magnet attraction force — called from physicsStep ──
function applyMagnetAttraction() {
  if (physMarbles.length === 0) return;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.boxType !== 'magnet') continue;
    if (!b.magnetActive) continue;
    if (!b.magnetCaptured) b.magnetCaptured = [];
    if (b.magnetCaptured.length >= MRB_PER_BOX) continue;

    var targetX = b.x + L.bw / 2;
    var targetY = b.y + L.bh / 2;
    var attractStr = 0.35 * S;

    for (var mi = physMarbles.length - 1; mi >= 0; mi--) {
      if (b.magnetCaptured.length >= MRB_PER_BOX) break;
      var m = physMarbles[mi];
      var dx = targetX - m.x;
      var dy = targetY - m.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;

      // Apply attraction force (stronger when closer)
      var force = attractStr / Math.max(dist / (200 * S), 0.5);
      m.vx += (dx / dist) * force;
      m.vy += (dy / dist) * force;

      // Particle trail toward magnet
      if (tick % 4 === 0 && dist < 300 * S) {
        particles.push({
          x: m.x, y: m.y,
          vx: (dx / dist) * 1.5 * S, vy: (dy / dist) * 1.5 * S,
          r: (1.5 + Math.random() * 1.5) * S,
          color: 'rgba(100,120,220,0.6)', life: 0.5, decay: 0.04, grav: false
        });
      }

      // Capture marble when close enough
      if (dist < L.bw * 0.4) {
        b.magnetCaptured.push(m.ci);
        sfx.drop();
        spawnBurst(m.x, m.y, COLORS[m.ci].fill, 6);
        physMarbles.splice(mi, 1);
        b.shakeT = 0.2;
      }
    }
  }
}

// ── Release captured marbles back into funnel ──
function magnetRelease(b) {
  if (!b.magnetCaptured || b.magnetCaptured.length === 0) return;
  var cx = b.x + L.bw / 2;
  var cy = b.y + L.bh / 2;
  var MR = getMR();

  for (var i = 0; i < b.magnetCaptured.length; i++) {
    var ci = b.magnetCaptured[i];
    var angle = (Math.PI * 2 * i / b.magnetCaptured.length) + Math.random() * 0.3;
    var spd = (2 + Math.random() * 2) * S;
    var vx = Math.cos(angle) * spd;
    var vy = -Math.abs(Math.sin(angle) * spd) - 2 * S;
    physMarbles.push({ x: cx, y: cy, vx: vx, vy: vy, ci: ci, r: MR, spawnT: 1.0 });
    spawnBurst(cx, cy, COLORS[ci].fill, 4);
  }
  sfx.pop();
  spawnBurst(cx, cy, '#8A9BAE', 15);
  b.magnetCaptured = [];
  b.popT = 0.8;
}
