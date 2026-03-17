// ============================================================
// tray.js — Tray mechanic: 9 belt slots blocked by a stone tray
//           Blocker marbles fill tray slots; when full, tray shatters
// ============================================================

// === TRAY INIT ===
// Called from initGame() after belt slots are created
function initTray(numBlockerMarbles, trayPos) {
  trayShattered = false;
  trayShatterT = 0;
  trayCrackT = 0;
  trayPulseSlots = [];
  trayPulseT = 0;
  trayFilledCount = 0;
  trayFilled = [];

  if (numBlockerMarbles <= 0) {
    trayActive = false;
    traySlotStart = 0;
    for (var i = 0; i < TRAY_SIZE; i++) trayFilled.push(false);
    return;
  }

  trayActive = true;
  trayPosition = trayPos;

  // Compute starting slot based on position setting
  // 0=left (slots 2-10), 1=center (slots 10-18), 2=right (slots 19-27)
  if (trayPos === 0) {
    traySlotStart = 2;
  } else if (trayPos === 2) {
    traySlotStart = 19;
  } else {
    traySlotStart = 10; // center default
  }

  for (var i = 0; i < TRAY_SIZE; i++) trayFilled.push(false);

  // Mark tray slots on the belt so regular marbles skip them
  for (var i = 0; i < TRAY_SIZE; i++) {
    var si = traySlotStart + i;
    if (si < BELT_SLOTS) {
      beltSlots[si].tray = true;
    }
  }
}

// === TRAY SLOT QUERY ===
// Is this belt slot blocked by the tray? (regular marbles can't land here)
function isTraySlot(slotIdx) {
  if (!trayActive || trayShattered) return false;
  return slotIdx >= traySlotStart && slotIdx < traySlotStart + TRAY_SIZE;
}

// Find next available tray slot for a blocker marble (-1 if full)
function getNextTraySlot() {
  if (!trayActive || trayShattered) return -1;
  for (var i = 0; i < TRAY_SIZE; i++) {
    if (!trayFilled[i]) {
      return traySlotStart + i;
    }
  }
  return -1; // all filled (shouldn't happen if counts are correct)
}

// === LOCK A BLOCKER MARBLE INTO A TRAY SLOT ===
function lockBlockerInTray(slotIdx) {
  var trayIdx = slotIdx - traySlotStart;
  if (trayIdx < 0 || trayIdx >= TRAY_SIZE) return;
  if (trayFilled[trayIdx]) return;

  trayFilled[trayIdx] = true;
  trayFilledCount++;

  // Place blocker marble visually in the belt slot
  beltSlots[slotIdx].marble = BLOCKER_CI;
  beltSlots[slotIdx].arriveAnim = 0.6;

  // Particle pop + click sound
  var pos = getSlotPos(slotIdx);
  spawnBurst(pos.x, pos.y, COLORS[BLOCKER_CI].light, 8);
  sfx.pop();
}

// === TRAY UPDATE (called each frame from game.js update) ===
function updateTray() {
  if (!trayActive || trayShattered) {
    // Animate pulse after shatter
    if (trayPulseT > 0) {
      trayPulseT = Math.max(0, trayPulseT - 0.015);
    }
    // Animate shatter flash
    if (trayShatterT > 0) {
      trayShatterT = Math.max(0, trayShatterT - 0.018);
    }
    return;
  }

  // Check if tray is full → trigger shatter
  if (trayFilledCount >= TRAY_SIZE && trayCrackT <= 0) {
    trayCrackT = 1.0;
  }

  // Crack animation before shatter
  if (trayCrackT > 0) {
    trayCrackT = Math.max(0, trayCrackT - 0.025);
    if (trayCrackT <= 0) {
      shatterTray();
    }
  }
}

// === SHATTER THE TRAY ===
function shatterTray() {
  trayShattered = true;
  trayShatterT = 1.0;
  trayPulseT = 1.0;

  // Remove all blocker marbles from tray slots
  for (var i = 0; i < TRAY_SIZE; i++) {
    var si = traySlotStart + i;
    if (si < BELT_SLOTS) {
      var pos = getSlotPos(si);

      // Clear the blocker marble
      beltSlots[si].marble = -1;
      beltSlots[si].tray = false;

      // Stone-colored particles for each slot
      for (var p = 0; p < 5; p++) {
        var a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
        particles.push({
          x: pos.x, y: pos.y,
          vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
          r: (2 + Math.random() * 4) * S,
          color: Math.random() > 0.5 ? COLORS[BLOCKER_CI].light : COLORS[BLOCKER_CI].fill,
          life: 1, decay: 0.015 + Math.random() * 0.01, grav: true
        });
      }

      // Track for green pulse
      trayPulseSlots.push(si);
    }
  }

  // Big center burst + confetti
  var cx = 0, cy = 0, count = 0;
  for (var i = 0; i < TRAY_SIZE; i++) {
    var si = traySlotStart + i;
    if (si < BELT_SLOTS) {
      var pos = getSlotPos(si);
      cx += pos.x; cy += pos.y; count++;
    }
  }
  if (count > 0) { cx /= count; cy /= count; }
  spawnBurst(cx, cy, '#A89E94', 25);
  spawnConfetti(cx, cy, 30);

  // Celebratory sound
  sfx.complete();
}

// === DRAW TRAY ===
// Called from rendering — draws the tray platform on top of belt slots
function drawTrayOnBelt() {
  if (!trayActive) return;

  var slotR = 8 * S;

  // Draw shatter flash + freed slot pulse even after shatter
  if (trayShattered) {
    // Green pulse on freed slots
    if (trayPulseT > 0) {
      for (var i = 0; i < trayPulseSlots.length; i++) {
        var si = trayPulseSlots[i];
        var pos = getSlotPos(si);
        ctx.save();
        ctx.globalAlpha = trayPulseT * 0.4;
        ctx.fillStyle = 'rgba(78,230,140,0.6)';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, slotR * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // White shatter flash over tray area
    if (trayShatterT > 0.7) {
      var flashAlpha = (trayShatterT - 0.7) / 0.3;
      var firstPos = getSlotPos(traySlotStart);
      var lastPos = getSlotPos(traySlotStart + TRAY_SIZE - 1);
      var tx = Math.min(firstPos.x, lastPos.x) - slotR * 2;
      var tw = Math.abs(lastPos.x - firstPos.x) + slotR * 4;
      var ty = Math.min(firstPos.y, lastPos.y) - slotR * 2;
      var th = Math.abs(lastPos.y - firstPos.y) + slotR * 4;
      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      rRect(tx, ty, tw, th, 8 * S); ctx.fill();
      ctx.restore();
    }
    return;
  }

  // Compute tray bounding box from slot positions
  var positions = [];
  for (var i = 0; i < TRAY_SIZE; i++) {
    var si = traySlotStart + i;
    if (si < BELT_SLOTS) positions.push(getSlotPos(si));
  }
  if (positions.length === 0) return;

  // Find bounding rect of all tray slot positions
  var minX = positions[0].x, maxX = positions[0].x;
  var minY = positions[0].y, maxY = positions[0].y;
  for (var i = 1; i < positions.length; i++) {
    if (positions[i].x < minX) minX = positions[i].x;
    if (positions[i].x > maxX) maxX = positions[i].x;
    if (positions[i].y < minY) minY = positions[i].y;
    if (positions[i].y > maxY) maxY = positions[i].y;
  }

  var pad = slotR * 1.8;
  var trayX = minX - pad;
  var trayY = minY - pad;
  var trayW = (maxX - minX) + pad * 2;
  var trayH = (maxY - minY) + pad * 2;

  // Crack animation: shake + crack lines
  var shakeX = 0, shakeY = 0;
  if (trayCrackT > 0) {
    shakeX = Math.sin(trayCrackT * 40) * 3 * S * trayCrackT;
    shakeY = Math.cos(trayCrackT * 35) * 2 * S * trayCrackT;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Tray platform background — semi-transparent stone
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 3 * S;
  var trayGrad = ctx.createLinearGradient(trayX, trayY, trayX, trayY + trayH);
  trayGrad.addColorStop(0, 'rgba(168,158,148,0.45)');
  trayGrad.addColorStop(0.5, 'rgba(148,138,128,0.35)');
  trayGrad.addColorStop(1, 'rgba(128,118,108,0.45)');
  ctx.fillStyle = trayGrad;
  rRect(trayX, trayY, trayW, trayH, 8 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = 'rgba(122,112,104,0.4)';
  ctx.lineWidth = 1.5 * S;
  rRect(trayX, trayY, trayW, trayH, 8 * S); ctx.stroke();
  ctx.restore();

  // Slot outlines (dashed circles showing where blockers go)
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var filled = trayFilled[i];

    if (!filled) {
      // Empty slot — dashed outline
      ctx.save();
      ctx.strokeStyle = 'rgba(122,112,104,0.3)';
      ctx.lineWidth = 1.2 * S;
      ctx.setLineDash([3 * S, 3 * S]);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, slotR * 0.75, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else {
      // Filled slot — blocker marble is drawn by drawBelt, just add subtle glow
      ctx.save();
      ctx.globalAlpha = 0.2 + Math.sin(tick * 0.06 + i * 0.7) * 0.1;
      ctx.fillStyle = COLORS[BLOCKER_CI].glow;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, slotR * 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // Crack lines when about to shatter
  if (trayCrackT > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5 + trayCrackT * 0.5;
    ctx.strokeStyle = 'rgba(200,180,160,0.8)';
    ctx.lineWidth = 2 * S;
    var cx2 = trayX + trayW / 2;
    var cy2 = trayY + trayH / 2;
    // Random-looking crack lines radiating from center
    for (var c = 0; c < 5; c++) {
      var a = (c / 5) * Math.PI * 2 + 0.3;
      var len = (trayW / 2) * (0.5 + (1 - trayCrackT) * 0.5);
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 + Math.cos(a) * len, cy2 + Math.sin(a) * len * 0.5);
      ctx.stroke();
    }

    // Glow build-up
    ctx.globalAlpha = (1 - trayCrackT) * 0.3;
    ctx.fillStyle = 'rgba(255,230,180,0.5)';
    rRect(trayX, trayY, trayW, trayH, 8 * S); ctx.fill();
    ctx.restore();
  }

  ctx.restore(); // undo shake translate
}

// === DRAW TRAY PROGRESS ===
// Replaces the old blocker progress dots — shows tray fill status
function drawTrayProgress() {
  if (!trayActive || trayShattered) return;
  if (totalBlockerMarbles <= 0) return;

  var cx = L.beltCx;
  var cy = (L.beltBotY + L.sTop) / 2;
  var total = TRAY_SIZE;
  var filled = trayFilledCount;
  var dotR = 3.5 * S;
  var gap = dotR * 3;
  var startX = cx - (total - 1) * gap / 2;
  var pillW = Math.max((total - 1) * gap + dotR * 5, dotR * 6);
  var pillH = dotR * 3.2;

  ctx.save();

  // Pill background
  ctx.fillStyle = 'rgba(122,112,104,0.10)';
  rRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(122,112,104,0.18)'; ctx.lineWidth = 1 * S;
  rRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2); ctx.stroke();

  // Tray icon
  var iconX = cx - pillW / 2 - dotR * 2.5;
  var bc = COLORS[BLOCKER_CI];
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = bc.fill;
  rRect(iconX - dotR * 1.1, cy - dotR * 0.7, dotR * 2.2, dotR * 1.4, 2 * S);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Dots
  for (var i = 0; i < total; i++) {
    var dx = startX + i * gap;
    if (i < filled) {
      var grd = ctx.createRadialGradient(dx - dotR * 0.15, cy - dotR * 0.15, dotR * 0.1, dx, cy, dotR);
      grd.addColorStop(0, bc.light); grd.addColorStop(0.7, bc.fill); grd.addColorStop(1, bc.dark);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(dx, cy, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(dx - dotR * 0.2, cy - dotR * 0.2, dotR * 0.35, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(122,112,104,0.22)'; ctx.lineWidth = 1 * S;
      ctx.setLineDash([2 * S, 2 * S]);
      ctx.beginPath(); ctx.arc(dx, cy, dotR * 0.65, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}
