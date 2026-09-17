// ============================================================
// combo.js — Customer fill-completion combo feedback
// ============================================================
// Filling a customer starts a 2-second window. Filling another
// customer inside that window extends the chain and restarts
// the window. Chain length drives escalating feedback:
//   3+  → "Cool" pops above the customer that just filled
//   6+  → "Very Cool" pops above the customer that just filled
//   9+  → big rainbow "MEGA COOL" in the funnel zone, plus
//         extra juice on that customer's completion
// The 2-second window is never shown as a timer. The player
// reads it off the rainbow glow around the conveyor: it appears
// with the first "Cool", dims as the window runs down, and
// flares back to full every time a new customer is filled. When
// the player takes longer than 2 seconds the chain breaks and
// the glow goes out.
// ============================================================

function comboReset() {
  comboCount = 0;
  comboTimer = 0;
  comboBest = 0;
  comboGlowOn = false;
  comboFlareT = 0;
  comboFadeT = 0;
  comboPops = [];
  comboRings = [];
  comboMega = null;
}

// Chain length → feedback tier. 0 = no word yet.
function comboTier(n) {
  if (n >= COMBO_TIER_MEGA) return 3;
  if (n >= COMBO_TIER_VERY) return 2;
  if (n >= COMBO_TIER_COOL) return 1;
  return 0;
}

// Called from game.js the moment a customer is fully filled.
function comboRegisterCompletion(box, colIdx, bx, by, ci) {
  comboCount++;
  comboTimer = COMBO_WINDOW;
  comboFlareT = 1;
  comboFadeT = 0;
  if (comboCount > comboBest) comboBest = comboCount;

  var tier = comboTier(comboCount);
  if (tier >= 1) comboGlowOn = true;

  comboSfx(comboCount, tier);
  comboPushRing(bx, by, COLORS[ci].fill, L.sBw * (0.7 + tier * 0.18), 0.055);

  if (tier === 1) {
    comboPushPop('Cool', bx, ci, 1);
  } else if (tier === 2) {
    comboPushPop('Very Cool', bx, ci, 2);
    comboPushRing(bx, by, '#FFD34E', L.sBw * 1.4, 0.04);
  } else if (tier === 3) {
    comboMegaCelebrate(box, bx, by, ci);
  }

  return tier;
}

// Extra juice reserved for MEGA COOL completions.
function comboMegaCelebrate(box, bx, by, ci) {
  comboMega = { t: 0, x: L.funnelCx, y: L.funnelTop + L.funnelH * 0.42 };
  if (box) box.megaT = 1;

  comboPushRing(bx, by, '#FFFFFF', L.sBw * 1.7, 0.035);
  comboPushRing(bx, by, '#FFD34E', L.sBw * 2.1, 0.026);
  spawnBurst(bx, by, '#FFFFFF', 18);
  spawnConfetti(bx, by, 30);

  // Rainbow sparkle shower around the customer.
  for (var i = 0; i < 22; i++) {
    var a = Math.PI * 2 * i / 22 + Math.random() * 0.4;
    var sp = 3 + Math.random() * 6;
    particles.push({
      x: bx, y: by,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 3 * S,
      r: (2 + Math.random() * 4) * S,
      color: 'hsl(' + ~~(Math.random() * 360) + ', 100%, 62%)',
      life: 1, decay: 0.012 + Math.random() * 0.012, grav: true
    });
  }
  // Sparkles rising out of the funnel where the banner lands.
  var fx = L.funnelCx, fy = L.funnelTop + L.funnelH * 0.42;
  for (var p = 0; p < 26; p++) {
    var a2 = Math.random() * Math.PI * 2;
    var sp2 = 2 + Math.random() * 7;
    particles.push({
      x: fx + (Math.random() - 0.5) * L.funnelH * 0.6,
      y: fy + (Math.random() - 0.5) * L.funnelH * 0.3,
      vx: Math.cos(a2) * sp2 * S, vy: Math.sin(a2) * sp2 * S,
      r: (2 + Math.random() * 4) * S,
      color: 'hsl(' + ~~(Math.random() * 360) + ', 100%, 65%)',
      life: 1, decay: 0.018 + Math.random() * 0.014, grav: false
    });
  }
}

function comboBreak() {
  comboCount = 0;
  comboTimer = 0;
  if (comboGlowOn) comboFadeT = 1;
  comboGlowOn = false;
}

function comboPushPop(text, bx, ci, tier) {
  comboPops.push({
    text: text, x: bx, y: L.sTop - 14 * S,
    t: 0, spd: tier === 2 ? 0.013 : 0.016,
    tier: tier, ci: ci,
    rot: (Math.random() - 0.5) * 0.2
  });
}

function comboPushRing(x, y, color, maxR, spd) {
  if (comboRings.length > 12) comboRings.shift();
  comboRings.push({ x: x, y: y, t: 0, spd: spd, maxR: maxR, color: color });
}

// Rising ladder — every extra customer in the chain is a semitone up.
function comboSfx(n, tier) {
  if (!audioCtx) return;
  var step = Math.min(n - 1, 15);
  var f = 523 * Math.pow(2, step / 12);
  tone(f, 0.16, 'triangle', 0.08);
  setTimeout(function () { tone(f * 1.5, 0.12, 'sine', 0.05); }, 70);
  if (tier === 3) {
    [784, 988, 1175, 1568, 1976].forEach(function (mf, i) {
      setTimeout(function () { tone(mf, 0.22, 'sine', 0.1); }, 60 + i * 80);
    });
  }
}

// === UPDATE ===

function comboUpdate() {
  if (comboTimer > 0) {
    comboTimer--;
    if (comboTimer <= 0) comboBreak();
  }
  if (comboFlareT > 0) comboFlareT = Math.max(0, comboFlareT - 0.055);
  if (comboFadeT > 0) comboFadeT = Math.max(0, comboFadeT - 0.05);

  for (var i = comboPops.length - 1; i >= 0; i--) {
    comboPops[i].t += comboPops[i].spd;
    if (comboPops[i].t >= 1) comboPops.splice(i, 1);
  }
  for (var r = comboRings.length - 1; r >= 0; r--) {
    comboRings[r].t += comboRings[r].spd;
    if (comboRings[r].t >= 1) comboRings.splice(r, 1);
  }
  if (comboMega) {
    comboMega.t += 0.011;
    if (comboMega.t >= 1) comboMega = null;
  }
}

// === DRAWING ===

// Back-out easing — scales in with a little overshoot.
function comboOvershoot(t) {
  if (t >= 1) return 1;
  var p = t - 1;
  return 1 + 2.2 * p * p * p + 1.2 * p * p;
}

function comboRainbowGrad(x1, y1, x2, y2, offset, light) {
  var grad = ctx.createLinearGradient(x1, y1, x2, y2);
  for (var i = 0; i <= 6; i++) {
    var hue = (i * 60 + offset) % 360;
    grad.addColorStop(i / 6, 'hsl(' + hue.toFixed(0) + ', 100%, ' + light + '%)');
  }
  return grad;
}

// 1 = window just refreshed, → 0 as the 2 seconds run out.
function comboGlowLevel() {
  if (comboGlowOn && comboTimer > 0) return 0.22 + 0.78 * (comboTimer / COMBO_WINDOW);
  return comboFadeT * 0.22;
}

// Rainbow ring hugging the conveyor. Drawn under the belt so
// marbles stay readable on top of it.
function drawComboBeltGlow() {
  var lvl = comboGlowLevel();
  if (lvl <= 0.005) return;

  var pad = 13 * S;
  var x = L.beltLeft - pad;
  var y = L.beltTopY - pad;
  var w = (L.beltRight - L.beltLeft) + pad * 2;
  var h = L.beltGap + pad * 2;
  var rad = h / 2;
  var spin = (tick * 2.2) % 360;
  var grad = comboRainbowGrad(x, y, x + w, y + h, spin, 62);
  var flare = comboFlareT;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = grad;
  ctx.shadowColor = 'hsl(' + spin.toFixed(0) + ', 100%, 60%)';

  ctx.globalAlpha = lvl * 0.16;
  ctx.lineWidth = (15 + flare * 10) * S;
  ctx.shadowBlur = (18 + flare * 22) * S;
  rRect(x, y, w, h, rad); ctx.stroke();

  ctx.globalAlpha = lvl * 0.38;
  ctx.lineWidth = (6.5 + flare * 4) * S;
  ctx.shadowBlur = (10 + flare * 14) * S;
  rRect(x, y, w, h, rad); ctx.stroke();

  ctx.globalAlpha = Math.min(1, lvl * 0.95);
  ctx.lineWidth = 2.2 * S;
  ctx.shadowBlur = 0;
  rRect(x, y, w, h, rad); ctx.stroke();

  ctx.restore();
}

// Rings, words and the MEGA banner — drawn on top of everything.
function drawComboFX() {
  drawComboRings();
  drawComboPops();
  drawComboMega();
}

function drawComboRings() {
  ctx.save();
  for (var i = 0; i < comboRings.length; i++) {
    var g = comboRings[i];
    var e = 1 - Math.pow(1 - g.t, 3);
    ctx.globalAlpha = (1 - g.t) * 0.7;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = Math.max(0.5, 4 * S * (1 - g.t));
    ctx.beginPath();
    ctx.arc(g.x, g.y, Math.max(0.5, g.maxR * e), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawComboPops() {
  for (var i = 0; i < comboPops.length; i++) {
    var p = comboPops[i];
    var sIn = p.t < 0.22 ? comboOvershoot(p.t / 0.22) : 1;
    var alpha = p.t > 0.65 ? Math.max(0, (1 - p.t) / 0.35) : 1;
    var size = (p.tier === 2 ? 23 : 17) * S * sIn;
    if (size <= 0.5) continue;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y - p.t * 52 * S);
    ctx.rotate(p.rot * (1 - p.t));
    ctx.font = 'bold ' + size + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.26;
    ctx.strokeStyle = 'rgba(70,52,34,0.85)';
    ctx.strokeText(p.text, 0, 0);

    if (p.tier === 2) {
      var gg = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
      gg.addColorStop(0, '#FFF0A8');
      gg.addColorStop(0.5, '#FFD34E');
      gg.addColorStop(1, '#F0A32E');
      ctx.fillStyle = gg;
    } else {
      ctx.fillStyle = COLORS[p.ci].light;
    }
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}

function drawComboMega() {
  if (!comboMega) return;
  var m = comboMega;
  var sIn = m.t < 0.16 ? comboOvershoot(m.t / 0.16) : 1;
  var alpha = m.t > 0.74 ? Math.max(0, (1 - m.t) / 0.26) : 1;
  var wob = Math.sin(m.t * Math.PI * 7) * 0.06 * (1 - m.t);
  var text = 'MEGA COOL';

  var size = 46 * S;
  ctx.save();
  ctx.font = 'bold ' + size + 'px Fredoka, sans-serif';
  var maxW = (L.funnelRight - L.funnelLeft) * 0.92;
  var tw = ctx.measureText(text).width;
  if (tw > maxW && tw > 0) size *= maxW / tw;
  ctx.restore();

  size *= sIn;
  if (size <= 0.5) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(m.x, m.y);
  ctx.rotate(wob);

  // Soft white burst behind the banner.
  var flashR = size * 3.2;
  var fg = ctx.createRadialGradient(0, 0, 0, 0, 0, flashR);
  fg.addColorStop(0, 'rgba(255,255,255,' + (0.5 * (1 - m.t)) + ')');
  fg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.arc(0, 0, flashR, 0, Math.PI * 2); ctx.fill();

  ctx.font = 'bold ' + size + 'px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var halfW = ctx.measureText(text).width / 2;

  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.26;
  ctx.strokeStyle = 'rgba(58,40,24,0.9)';
  ctx.strokeText(text, 0, 0);

  ctx.shadowColor = 'rgba(255,255,255,0.7)';
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = comboRainbowGrad(-halfW, 0, halfW, 0, (tick * 5) % 360, 58);
  ctx.fillText(text, 0, 0);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - m.t)) + ')';
  ctx.fillText(text, 0, 0);

  ctx.restore();
}
