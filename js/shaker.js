// ============================================================
// shaker.js — Shaker booster: uplift + shuffle funnel marbles
// ============================================================

var SHAKER_COOLDOWN = 45;  // frames before button is usable again
var shakerCooldownT = 0;

function activateShaker() {
  if (shakerCooldownT > 0 || !gameActive || won) return;
  if (physMarbles.length === 0) return;  // no marbles to shake
  shakerCooldownT = SHAKER_COOLDOWN;
  shakerActiveT = 0.6;
  shakerPressT = 0.4;

  // Chaotic impulse: strong random direction per marble, biased upward
  for (var i = 0; i < physMarbles.length; i++) {
    var m = physMarbles[i];
    var angle = Math.random() * Math.PI * 2;
    var force = (10 + Math.random() * 8) * S;
    m.vx = Math.cos(angle) * force;
    m.vy = Math.sin(angle) * force - (6 + Math.random() * 6) * S;  // upward bias
  }

  // Sound effect — ascending whoosh + rattle
  sfx.shake();

  // Particle burst from button center
  var bx = L.shakerX + L.shakerW / 2;
  var by = L.shakerY + L.shakerH / 2;
  spawnBurst(bx, by, '#FF6B4A', 16);

  // Additional particles spreading into the funnel area
  for (var p = 0; p < 12; p++) {
    var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
    var sp = 3 + Math.random() * 5;
    particles.push({
      x: bx, y: by + 10 * S,
      vx: Math.cos(a) * sp * S,
      vy: Math.sin(a) * sp * S - 2 * S,
      r: (2 + Math.random() * 3) * S,
      color: Math.random() > 0.5 ? '#FF6B4A' : '#FFB545',
      life: 0.8, decay: 0.025, grav: false
    });
  }
}

function updateShaker() {
  if (shakerActiveT > 0) shakerActiveT = Math.max(0, shakerActiveT - 0.02);
  if (shakerPressT > 0) shakerPressT = Math.max(0, shakerPressT - 0.04);
  if (shakerCooldownT > 0) shakerCooldownT--;
}

function drawShakerButton() {
  var x = L.shakerX, y = L.shakerY, w = L.shakerW, h = L.shakerH;

  // Screen-shake offset when active
  var shakeOx = 0, shakeOy = 0;
  if (shakerActiveT > 0) {
    shakeOx = Math.sin(shakerActiveT * 45) * 3 * S * shakerActiveT;
    shakeOy = Math.cos(shakerActiveT * 37) * 2 * S * shakerActiveT;
  }

  ctx.save();
  ctx.translate(shakeOx, shakeOy);

  var onCooldown = shakerCooldownT > 0;

  // Button scale: press animation + idle breathing
  var pressScale = 1 - shakerPressT * 0.15;
  var breathe = onCooldown ? 0 : Math.sin(tick * 0.05) * 0.03;
  var hoverScale = shakerHover && !onCooldown ? 0.05 : 0;
  var totalScale = pressScale + breathe + hoverScale;

  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(totalScale, totalScale);

  // Button background
  var bgColor, borderColor;
  if (onCooldown) {
    bgColor = 'rgba(140,130,120,0.5)';
    borderColor = 'rgba(120,110,100,0.4)';
  } else {
    var grad = ctx.createLinearGradient(-w / 2, -h / 2, -w / 2, h / 2);
    grad.addColorStop(0, '#FF8A6A');
    grad.addColorStop(1, '#E8503A');
    bgColor = grad;
    borderColor = '#C43A28';
  }

  ctx.shadowColor = onCooldown ? 'rgba(0,0,0,0.1)' : 'rgba(255,107,74,0.4)';
  ctx.shadowBlur = onCooldown ? 3 * S : 8 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = bgColor;
  rRect(-w / 2, -h / 2, w, h, 10 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5 * S;
  rRect(-w / 2, -h / 2, w, h, 10 * S);
  ctx.stroke();

  // Vibration icon — three wavy lines
  var iconAlpha = onCooldown ? 0.3 : 0.9;
  ctx.globalAlpha = iconAlpha;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2.2 * S;
  ctx.lineCap = 'round';

  var lineSpacing = 5 * S;
  var lineH = h * 0.32;
  var waveAmp = onCooldown ? 2 * S : (2.5 + Math.sin(tick * 0.08) * 0.8) * S;

  for (var li = -1; li <= 1; li++) {
    var lx = li * lineSpacing;
    ctx.beginPath();
    ctx.moveTo(lx + Math.sin(0) * waveAmp, -lineH);
    for (var t = 0; t <= 1; t += 0.1) {
      var py = -lineH + t * lineH * 2;
      var px = lx + Math.sin(t * Math.PI * 2 + tick * 0.1) * waveAmp;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Glow ring when active
  if (shakerActiveT > 0) {
    ctx.globalAlpha = shakerActiveT * 0.4;
    ctx.strokeStyle = '#FF6B4A';
    ctx.lineWidth = 3 * S;
    var glowExpand = (1 - shakerActiveT) * 12 * S;
    rRect(-w / 2 - glowExpand, -h / 2 - glowExpand, w + glowExpand * 2, h + glowExpand * 2, 10 * S + glowExpand);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function isShakerTap(px, py) {
  return px >= L.shakerX && px <= L.shakerX + L.shakerW &&
         py >= L.shakerY && py <= L.shakerY + L.shakerH;
}

function isShakerHover(px, py) {
  return shakerCooldownT <= 0 && isShakerTap(px, py);
}
