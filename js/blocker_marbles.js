// ============================================================
// blocker_marbles.js — Blocker Marbles mechanic
// ------------------------------------------------------------
// Any regular box can be TAGGED with `hasBlockers = true`.
// A tagged box holds (MRB_PER_BOX - BLOCKER_PER_BOX) regular
// marbles + BLOCKER_PER_BOX stone "blocker" marbles. When the
// box is tapped, all marbles fall onto the belt together.
// Regular marbles are picked up by customer trays as usual;
// blocker marbles circulate and count toward belt capacity.
//
// A stone Blocker Tray sits between the belt and sort columns
// with one slot per blocker marble in the level. Each time a
// blocker marble arrives on the belt, the next tray slot fills
// with a stone marble. When all slots are filled (= every
// blocker in the level is on the belt at the same time), the
// tray shatters and all blockers are cleared from the belt.
// ============================================================

var blocker = {
  total: 0,            // total blockers across all boxes in the level
  onBelt: 0,           // how many are currently on the belt
  slots: [],           // tray slot state: { filled, fillT, shatterT, dx, dy, vx, vy, rot, rotV }
  collecting: false,   // shatter sequence active
  collectT: 0,         // 1 -> 0 countdown during shatter
  cleared: false,      // flag to dedupe the clear moment
  belowBeltY: 0,       // y target for "dip below belt" animation
  trayY: 0,            // tray baseline y (computed per frame)
  trayCx: 0,           // tray center x
  slotR: 0,            // slot radius
  slotGap: 0           // horizontal gap between slot centers
};

function initBlockerState(total) {
  blocker.total = total;
  blocker.onBelt = 0;
  blocker.slots = [];
  for (var i = 0; i < total; i++) {
    blocker.slots.push({
      filled: false, fillT: 0,
      shatterT: 0, dx: 0, dy: 0, vx: 0, vy: 0, rot: 0, rotV: 0
    });
  }
  blocker.collecting = false;
  blocker.collectT = 0;
  blocker.cleared = false;
}

// Count blockers currently sitting on the belt
function countBlockersOnBelt() {
  var n = 0;
  for (var i = 0; i < BELT_SLOTS; i++) {
    if (beltSlots[i].marble === BLOCKER_CI) n++;
  }
  return n;
}

function updateBlockers() {
  if (blocker.total <= 0) return;

  // Keep the filled-slot count in sync with the belt (handles both
  // "marble arrived" and "marble cleared" directions).
  if (!blocker.collecting) {
    var n = countBlockersOnBelt();
    blocker.onBelt = n;
    var fillCount = 0;
    for (var s = 0; s < blocker.slots.length; s++) if (blocker.slots[s].filled) fillCount++;
    // Fill next empty slot(s) to match onBelt
    if (fillCount < n) {
      for (var s = 0; s < blocker.slots.length && fillCount < n; s++) {
        if (!blocker.slots[s].filled) {
          blocker.slots[s].filled = true;
          blocker.slots[s].fillT = 1.0;
          fillCount++;
          if (typeof sfx !== 'undefined' && sfx.stoneClack) sfx.stoneClack();
        }
      }
    } else if (fillCount > n) {
      // A blocker left the belt somehow (e.g., booster) — unfill last
      for (var s = blocker.slots.length - 1; s >= 0 && fillCount > n; s--) {
        if (blocker.slots[s].filled) { blocker.slots[s].filled = false; blocker.slots[s].fillT = 0; fillCount--; }
      }
    }
    // Trigger shatter when all filled
    if (n >= blocker.total) {
      blocker.collecting = true;
      blocker.collectT = 1;
      blocker.cleared = false;
      if (typeof sfx !== 'undefined' && sfx.stoneCharge) sfx.stoneCharge();
    }
  }

  // Tick fill-pop animation
  for (var s = 0; s < blocker.slots.length; s++) {
    var slot = blocker.slots[s];
    if (slot.fillT > 0) slot.fillT = Math.max(0, slot.fillT - 0.04);
  }

  // Shatter sequence
  if (blocker.collecting) {
    blocker.collectT = Math.max(0, blocker.collectT - 0.02);

    // Midway through: clear blockers from belt + launch shatter fragments
    if (blocker.collectT <= 0.65 && !blocker.cleared) {
      blocker.cleared = true;
      // Clear blockers from the belt with a burst
      for (var i = 0; i < BELT_SLOTS; i++) {
        if (beltSlots[i].marble === BLOCKER_CI) {
          var pos = getSlotPos(i);
          beltSlots[i].marble = -1;
          spawnBurst(pos.x, pos.y, COLORS[BLOCKER_CI].light, 8);
          spawnStoneFragments(pos.x, pos.y, 6);
        }
      }
      // Kick every tray slot into shatter mode
      for (var s2 = 0; s2 < blocker.slots.length; s2++) {
        var sl = blocker.slots[s2];
        sl.shatterT = 1.0;
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
        var sp = 4 + Math.random() * 6;
        sl.vx = Math.cos(ang) * sp;
        sl.vy = Math.sin(ang) * sp - 3;
        sl.rotV = (Math.random() - 0.5) * 0.4;
      }
      // Tray plank fragments
      var cx = blocker.trayCx, cy = blocker.trayY;
      for (var f = 0; f < 18; f++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        var sp2 = 3 + Math.random() * 7;
        particles.push({
          x: cx + (Math.random() - 0.5) * blocker.slotGap * blocker.total,
          y: cy + (Math.random() - 0.5) * blocker.slotR * 2,
          vx: Math.cos(a) * sp2 * S,
          vy: Math.sin(a) * sp2 * S - 4 * S,
          r: (3 + Math.random() * 4) * S,
          color: f % 2 === 0 ? '#8A8078' : '#6A6058',
          life: 1, decay: 0.014 + Math.random() * 0.01, grav: true
        });
      }
      spawnBurst(cx, cy, '#C8BDB2', 20);
      spawnConfetti(cx, cy, 20);
      if (typeof sfx !== 'undefined' && sfx.stoneShatter) sfx.stoneShatter();
      blocker.onBelt = 0;
    }

    // Update shatter fragment motion
    for (var s3 = 0; s3 < blocker.slots.length; s3++) {
      var sl3 = blocker.slots[s3];
      if (sl3.shatterT > 0) {
        sl3.shatterT = Math.max(0, sl3.shatterT - 0.022);
        sl3.dx += sl3.vx;
        sl3.dy += sl3.vy;
        sl3.vy += 0.5;
        sl3.vx *= 0.985;
        sl3.rot += sl3.rotV;
      }
    }

    // Reset when done
    if (blocker.collectT <= 0) {
      blocker.collecting = false;
      blocker.collectT = 0;
      for (var s4 = 0; s4 < blocker.slots.length; s4++) {
        var sl4 = blocker.slots[s4];
        sl4.filled = false; sl4.fillT = 0; sl4.shatterT = 0;
        sl4.dx = 0; sl4.dy = 0; sl4.vx = 0; sl4.vy = 0; sl4.rot = 0; sl4.rotV = 0;
      }
    }
  }
}

function spawnStoneFragments(x, y, n) {
  n = n || 6;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 2 + Math.random() * 4;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
      r: (2 + Math.random() * 3) * S,
      color: i % 3 === 0 ? '#A89E94' : (i % 3 === 1 ? '#7A7068' : '#4A4440'),
      life: 0.9, decay: 0.02 + Math.random() * 0.015, grav: true
    });
  }
}

// ──────────── Rendering ────────────

function computeBlockerTrayLayout() {
  if (blocker.total <= 0) return;
  // Place tray horizontally between the belt bottom and sort area top.
  var cy = (L.beltBotY + L.sTop) / 2;
  var maxW = L.beltRight - L.beltLeft - 24 * S;
  var minSlot = 9 * S, maxSlot = 14 * S;
  var slotR = Math.max(minSlot, Math.min(maxSlot, (maxW / Math.max(1, blocker.total)) * 0.42));
  var slotGap = slotR * 2.4;
  // If too wide, shrink slot size
  var totalW = (blocker.total - 1) * slotGap + slotR * 2 + 32 * S;
  if (totalW > maxW) {
    var scale = maxW / totalW;
    slotR *= scale; slotGap *= scale;
  }
  blocker.trayY = cy;
  blocker.trayCx = L.beltCx;
  blocker.slotR = slotR;
  blocker.slotGap = slotGap;
  blocker.belowBeltY = L.beltBotY + 30 * S;
}

function drawBlockerTray() {
  if (blocker.total <= 0) return;
  computeBlockerTrayLayout();

  var trayAlive = !blocker.cleared;   // tray plank intact before shatter midpoint
  var cx = blocker.trayCx;
  var cy = blocker.trayY;
  var slotR = blocker.slotR;
  var slotGap = blocker.slotGap;
  var total = blocker.total;
  var padX = 14 * S;
  var padY = slotR * 0.85;
  var planksW = (total - 1) * slotGap + slotR * 2 + padX * 2;
  var planksH = slotR * 2 + padY * 2;
  var plankLx = cx - planksW / 2;
  var plankTy = cy - planksH / 2;

  ctx.save();

  // Tray plank body (stone slab) — surface scrolls with the conveyor
  if (trayAlive) {
    var shake = 0;
    if (blocker.collecting && blocker.collectT > 0.65) {
      var wind = (1 - (blocker.collectT - 0.65) / 0.35);
      shake = Math.sin(tick * 0.8) * 2 * S * wind;
    }
    ctx.save();
    ctx.translate(shake, 0);
    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 2 * S;
    // Stone gradient base
    var gradSt = ctx.createLinearGradient(0, plankTy, 0, plankTy + planksH);
    gradSt.addColorStop(0, '#B0A598');
    gradSt.addColorStop(0.5, '#8A8078');
    gradSt.addColorStop(1, '#5A5048');
    ctx.fillStyle = gradSt;
    rRect(plankLx, plankTy, planksW, planksH, 8 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Scrolling tread pattern (tracks the belt's bottom direction: right → left)
    ctx.save();
    ctx.beginPath();
    rRect(plankLx, plankTy, planksW, planksH, 8 * S);
    ctx.clip();
    var treadGap = 14 * S;
    // perimeter the belt travels per full beltOffset cycle
    var beltPerim = (L.beltRight - L.beltLeft - 2 * L.uR) * 2 + Math.PI * 2 * L.uR;
    var treadShift = ((beltOffset * beltPerim) % treadGap + treadGap) % treadGap;
    // Dark chevron lines
    ctx.strokeStyle = 'rgba(50,42,36,0.28)';
    ctx.lineWidth = 1.4 * S;
    for (var gx = plankLx - treadGap * 2 - treadShift; gx < plankLx + planksW + treadGap; gx += treadGap) {
      ctx.beginPath();
      ctx.moveTo(gx, plankTy + planksH + 2 * S);
      ctx.lineTo(gx + planksH * 0.5, plankTy - 2 * S);
      ctx.stroke();
    }
    // Lighter companion line for 3D feel
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1 * S;
    for (var gx2 = plankLx - treadGap * 2 - treadShift + 2 * S; gx2 < plankLx + planksW + treadGap; gx2 += treadGap) {
      ctx.beginPath();
      ctx.moveTo(gx2, plankTy + planksH + 2 * S);
      ctx.lineTo(gx2 + planksH * 0.5, plankTy - 2 * S);
      ctx.stroke();
    }
    ctx.restore();

    // Inner bevel outline
    ctx.strokeStyle = 'rgba(50,42,36,0.35)';
    ctx.lineWidth = 1.2 * S;
    rRect(plankLx, plankTy, planksW, planksH, 8 * S); ctx.stroke();
    // Top highlight edge
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(plankLx + 8 * S, plankTy + 2 * S);
    ctx.lineTo(plankLx + planksW - 8 * S, plankTy + 2 * S);
    ctx.stroke();
    // End-cap drums (axles hinting the tray is driven by the belt)
    var drumR = planksH * 0.42;
    [plankLx + drumR * 0.9, plankLx + planksW - drumR * 0.9].forEach(function (dx, di) {
      var dy = plankTy + planksH / 2;
      var dg = ctx.createRadialGradient(dx - drumR * 0.3, dy - drumR * 0.3, drumR * 0.1, dx, dy, drumR);
      dg.addColorStop(0, '#9A8F82');
      dg.addColorStop(1, '#3E3832');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(dx, dy, drumR, 0, Math.PI * 2); ctx.fill();
      // Rotation spokes
      ctx.save();
      ctx.translate(dx, dy);
      var rotDir = (di === 0 ? 1 : 1); // both drums turn the same way
      ctx.rotate(beltOffset * beltPerim / drumR * rotDir);
      ctx.strokeStyle = 'rgba(30,24,18,0.55)';
      ctx.lineWidth = 1 * S;
      for (var sp = 0; sp < 4; sp++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(sp * Math.PI / 2) * drumR * 0.85, Math.sin(sp * Math.PI / 2) * drumR * 0.85);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(30,24,18,0.55)';
      ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.arc(dx, dy, drumR, 0, Math.PI * 2); ctx.stroke();
    });
    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = 'bold ' + (7 * S) + 'px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('BLOCKERS', plankLx + drumR * 2 + 2 * S, plankTy + 6 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.textAlign = 'right';
    ctx.fillText(blocker.onBelt + ' / ' + blocker.total, plankLx + planksW - drumR * 2 - 2 * S, plankTy + 6 * S);
    ctx.restore();
  }

  // Slots + stone marbles
  var startX = cx - (total - 1) * slotGap / 2;
  var bc = COLORS[BLOCKER_CI];
  for (var i = 0; i < total; i++) {
    var slot = blocker.slots[i];
    var sx = startX + i * slotGap;
    var sy = cy + slotR * 0.15;

    // Slot recess (only visible while tray intact)
    if (trayAlive) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      var rg = ctx.createRadialGradient(sx, sy, slotR * 0.2, sx, sy, slotR);
      rg.addColorStop(0, '#3E3832');
      rg.addColorStop(1, '#6A6058');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(sx, sy, slotR * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(30,24,18,0.55)'; ctx.lineWidth = 1.2 * S;
      ctx.beginPath(); ctx.arc(sx, sy, slotR * 0.9, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Stone marble
    if (slot.filled || slot.shatterT > 0) {
      ctx.save();
      var px = sx + slot.dx;
      var py = sy + slot.dy;
      var scale = 1;
      if (slot.fillT > 0) {
        // Pop-in
        scale = 0.4 + (1 - slot.fillT) * 0.7 + Math.sin((1 - slot.fillT) * Math.PI) * 0.3;
        ctx.globalAlpha = Math.min(1, (1 - slot.fillT) * 2);
      } else {
        ctx.globalAlpha = 1;
      }
      if (slot.shatterT > 0) {
        scale *= (0.4 + slot.shatterT * 0.6);
        ctx.globalAlpha = slot.shatterT;
      }
      ctx.translate(px, py);
      ctx.rotate(slot.rot);
      ctx.scale(scale, scale);

      // Stone sphere
      var rr = slotR * 0.85;
      var grd = ctx.createRadialGradient(-rr * 0.3, -rr * 0.3, rr * 0.1, 0, 0, rr);
      grd.addColorStop(0, bc.light);
      grd.addColorStop(0.55, bc.fill);
      grd.addColorStop(1, bc.dark);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      // Crack line
      ctx.strokeStyle = 'rgba(30,24,18,0.45)'; ctx.lineWidth = 0.8 * S; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-rr * 0.35, rr * 0.05);
      ctx.lineTo(-rr * 0.05, -rr * 0.2);
      ctx.lineTo(rr * 0.2, rr * 0.1);
      ctx.stroke();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(-rr * 0.3, -rr * 0.3, rr * 0.3, 0, Math.PI * 2); ctx.fill();

      // Pulse glow during wind-up
      if (blocker.collecting && blocker.collectT > 0.65 && slot.shatterT <= 0) {
        var wind = (1 - (blocker.collectT - 0.65) / 0.35);
        ctx.globalAlpha = 0.3 + Math.sin(tick * 0.25 + i * 0.4) * 0.25 * wind;
        ctx.fillStyle = bc.glow;
        ctx.beginPath(); ctx.arc(0, 0, rr * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // Empty slot hint pulse
    if (!slot.filled && !blocker.collecting && slot.shatterT <= 0) {
      ctx.save();
      ctx.globalAlpha = 0.15 + Math.sin(tick * 0.06 + i * 0.5) * 0.08;
      ctx.strokeStyle = bc.light; ctx.lineWidth = 1 * S;
      ctx.setLineDash([2 * S, 2 * S]);
      ctx.beginPath(); ctx.arc(sx, sy, slotR * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  ctx.restore();
}

