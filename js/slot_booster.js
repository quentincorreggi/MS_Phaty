// ============================================================
// slot_booster.js — Slot Booster: adds 3 belt slots on use
// ============================================================

var BOOSTER_SLOTS_ADD = 3;

function initBooster(lvl) {
  if (lvl.slotBooster && lvl.slotBooster.charges > 0) {
    boosterEnabled = true;
    boosterCharges = lvl.slotBooster.charges;
    boosterMaxCharges = lvl.slotBooster.charges;
  } else {
    boosterEnabled = false;
    boosterCharges = 0;
    boosterMaxCharges = 0;
  }
  boosterPopT = 0;
  boosterShakeT = 0;
}

function useBooster() {
  if (!boosterEnabled || boosterCharges <= 0) return;
  boosterCharges--;
  boosterPopT = 1;

  // Add 3 new empty slots to the belt
  for (var i = 0; i < BOOSTER_SLOTS_ADD; i++) {
    beltSlots.push({ marble: -1, arriveAnim: 0 });
  }
  BELT_SLOTS += BOOSTER_SLOTS_ADD;

  sfx.complete();
  spawnBurst(L.boosterX + L.boosterW / 2, L.boosterY + L.boosterH / 2, '#00BCD4', 20);
  spawnConfetti(L.boosterX + L.boosterW / 2, L.boosterY + L.boosterH / 2, 12);
}

function handleBoosterTap(px, py) {
  if (!boosterEnabled) return false;
  if (px >= L.boosterX && px <= L.boosterX + L.boosterW &&
      py >= L.boosterY && py <= L.boosterY + L.boosterH) {
    if (boosterCharges > 0) {
      useBooster();
    } else {
      boosterShakeT = 0.5;
    }
    return true;
  }
  return false;
}

function updateBooster() {
  if (!boosterEnabled) return;
  if (boosterPopT > 0) boosterPopT = Math.max(0, boosterPopT - 0.03);
  if (boosterShakeT > 0) boosterShakeT = Math.max(0, boosterShakeT - 0.04);
}

function drawBooster() {
  if (!boosterEnabled) return;

  var x = L.boosterX;
  var y = L.boosterY;
  var w = L.boosterW;
  var h = L.boosterH;
  var cx = x + w / 2;
  var cy = y + h / 2;

  var active = boosterCharges > 0;
  var breathe = active ? Math.sin(tick * 0.05) * 0.015 : 0;
  var pop = 1 + boosterPopT * 0.2 + breathe;
  var ox = 0;
  if (boosterShakeT > 0) ox = Math.sin(boosterShakeT * 28) * 4 * S * boosterShakeT;

  ctx.save();
  ctx.translate(cx + ox, cy);
  ctx.scale(pop, pop);

  // Button background
  ctx.shadowColor = active ? 'rgba(0,188,212,0.35)' : 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = active ? 12 * S : 4 * S;
  ctx.shadowOffsetY = 2 * S;

  var grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  if (active) {
    grad.addColorStop(0, '#26C6DA');
    grad.addColorStop(1, '#0097A7');
  } else {
    grad.addColorStop(0, '#B0A898');
    grad.addColorStop(1, '#8A7E70');
  }
  ctx.fillStyle = grad;
  rRect(-w / 2, -h / 2, w, h, 10 * S);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = active ? '#00838F' : '#6D6358';
  ctx.lineWidth = 1.5 * S;
  rRect(-w / 2, -h / 2, w, h, 10 * S);
  ctx.stroke();

  // "+" icon
  ctx.fillStyle = active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)';
  ctx.font = 'bold ' + (h * 0.45) + 'px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('+3', -w * 0.12, 0);

  // Belt icon (small oval to right of text)
  var iconX = w * 0.22;
  var iconR = h * 0.12;
  ctx.fillStyle = active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(iconX, -iconR * 0.3, iconR * 1.8, iconR, 0, 0, Math.PI * 2);
  ctx.fill();
  // Three dots on the oval to represent belt slots
  ctx.fillStyle = active ? 'rgba(0,150,136,0.6)' : 'rgba(100,90,80,0.4)';
  for (var di = -1; di <= 1; di++) {
    ctx.beginPath();
    ctx.arc(iconX + di * iconR * 0.9, -iconR * 0.3, iconR * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // Charge counter
  ctx.fillStyle = active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)';
  ctx.font = 'bold ' + (h * 0.28) + 'px Fredoka, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('x' + boosterCharges, w / 2 - 6 * S, h * 0.01);

  // Highlight shine when active
  if (active && boosterPopT > 0) {
    ctx.globalAlpha = boosterPopT * 0.4;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    rRect(-w / 2, -h / 2, w, h, 10 * S);
    ctx.fill();
  }

  ctx.restore();
}
