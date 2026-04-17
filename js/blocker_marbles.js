// ============================================================
// blocker_marbles.js — Blocker Marbles mechanic
// ------------------------------------------------------------
// Any regular box can be TAGGED with `hasBlockers = true`.
// A tagged box holds (MRB_PER_BOX - BLOCKER_PER_BOX) regular
// marbles + BLOCKER_PER_BOX stone "blocker" marbles.
//
// TRAY:
// A lean stone bar with one slot per blocker in the level
// physically rides the belt loop, bending around the two
// pulleys. Its 9 slots are mapped to 9 consecutive belt-slot
// indices (trayStart..trayStart+N-1), so the tray advances in
// lock-step with the belt.
//
// CAPTURE:
// A blocker that exits the funnel does NOT enter a normal belt
// slot; instead it dips below the belt and resurfaces in the
// next empty tray slot, wherever that slot currently is on the
// loop. Once captured the stone stays locked to the tray.
//
// BUMP:
// Regular marbles can ride the belt through tray-slot positions
// (they visually sit on the bar). If a blocker claims a tray
// slot that currently holds a regular marble, the regular is
// bumped out to the nearest empty non-tray belt slot.
//
// SHATTER:
// When every tray slot is filled, the bar shatters in place.
// Blockers burst out and the tray respawns empty on the belt
// to catch the next round.
// ============================================================

var blocker = {
  total: 0,             // total blockers across all boxes in the level
  slots: [],            // per-slot state: { filled, fillT, shatterT, dx, dy, vx, vy, rot, rotV, shX, shY }
  trayStart: 0,         // first belt-slot index the tray occupies
  captures: [],         // active dip-to-tray animations
  bumps: [],            // active regular-marble bump-off animations
  collecting: false,    // shatter sequence active
  collectT: 0,          // 1 -> 0 countdown during shatter
  cleared: false        // flag to dedupe the clear moment
};

function initBlockerState(total) {
  blocker.total = total;
  blocker.slots = [];
  for (var i = 0; i < total; i++) {
    blocker.slots.push({
      filled: false, fillT: 0,
      shatterT: 0, dx: 0, dy: 0, vx: 0, vy: 0, rot: 0, rotV: 0,
      shX: 0, shY: 0
    });
  }
  // Start the tray somewhere visible on the bottom of the belt.
  blocker.trayStart = Math.floor(BELT_SLOTS * 0.55);
  blocker.captures = [];
  blocker.bumps = [];
  blocker.collecting = false;
  blocker.collectT = 0;
  blocker.cleared = false;
}

// Is belt-slot `i` currently one of the tray's slots?
function isBeltSlotInTray(i) {
  if (blocker.total <= 0) return false;
  for (var k = 0; k < blocker.total; k++) {
    if (((blocker.trayStart + k) % BELT_SLOTS) === i) return true;
  }
  return false;
}

// Which tray slot index (0..total-1) does belt-slot `i` correspond to, or -1.
function trayIndexOfBeltSlot(i) {
  for (var k = 0; k < blocker.total; k++) {
    if (((blocker.trayStart + k) % BELT_SLOTS) === i) return k;
  }
  return -1;
}

// Called from physics.js when a blocker marble reaches the belt entry.
// Returns true if the blocker was captured (caller should remove the
// phys marble); false if the tray is full and the blocker should fall
// through as a regular belt marble.
function captureBlocker(sx, sy) {
  if (blocker.total <= 0) return false;
  if (blocker.collecting) return false;
  var k = -1;
  for (var i = 0; i < blocker.total; i++) {
    var slot = blocker.slots[i];
    if (slot.filled) continue;
    // Check if this slot is already the target of an in-flight capture
    var alreadyTargeted = false;
    for (var c = 0; c < blocker.captures.length; c++) {
      if (blocker.captures[c].k === i) { alreadyTargeted = true; break; }
    }
    if (alreadyTargeted) continue;
    k = i; break;
  }
  if (k < 0) return false;
  blocker.captures.push({ sx: sx, sy: sy, k: k, t: 0, dur: 28 });
  if (typeof sfx !== 'undefined' && sfx.drop) sfx.drop();
  return true;
}

function countFilledTraySlots() {
  var n = 0;
  for (var i = 0; i < blocker.slots.length; i++) if (blocker.slots[i].filled) n++;
  return n;
}

// Bump a regular marble out of tray-slot k (if any) into the nearest
// empty non-tray belt slot.
function bumpRegularFromTraySlot(k) {
  var beltIdx = (blocker.trayStart + k) % BELT_SLOTS;
  var slot = beltSlots[beltIdx];
  if (slot.marble < 0 || slot.marble === BLOCKER_CI) return;
  var ci = slot.marble;
  // Find the nearest empty non-tray belt slot (searching both directions).
  var dest = -1;
  for (var step = 1; step < BELT_SLOTS; step++) {
    for (var dir = -1; dir <= 1; dir += 2) {
      var idx = ((beltIdx + dir * step) % BELT_SLOTS + BELT_SLOTS) % BELT_SLOTS;
      if (isBeltSlotInTray(idx)) continue;
      if (beltSlots[idx].marble >= 0) continue;
      dest = idx; break;
    }
    if (dest >= 0) break;
  }
  var srcPos = getSlotPos(beltIdx);
  slot.marble = -1; slot.arriveAnim = 0;
  if (dest >= 0) {
    beltSlots[dest].marble = ci;
    beltSlots[dest].arriveAnim = 0;
    blocker.bumps.push({
      ci: ci, sx: srcPos.x, sy: srcPos.y,
      target: dest, t: 0, dur: 22
    });
  } else {
    // No room anywhere — just sparkle it out of existence.
    spawnBurst(srcPos.x, srcPos.y, COLORS[ci].light, 8);
  }
}

function updateBlockers() {
  if (blocker.total <= 0) return;

  // A blocker that ended up on a regular belt slot (e.g. was placed while
  // the tray was mid-shatter) gets scooped onto the tray the moment a
  // slot frees up.
  if (!blocker.collecting) {
    for (var bi = 0; bi < BELT_SLOTS; bi++) {
      if (beltSlots[bi].marble !== BLOCKER_CI) continue;
      var bpos = getSlotPos(bi);
      if (captureBlocker(bpos.x, bpos.y)) {
        beltSlots[bi].marble = -1;
      }
    }
  }

  // Advance in-flight captures
  for (var c = blocker.captures.length - 1; c >= 0; c--) {
    var cap = blocker.captures[c];
    cap.t += 1;
    if (cap.t >= cap.dur) {
      // Land the blocker: push out any regular sitting in the slot, then fill.
      bumpRegularFromTraySlot(cap.k);
      var slot = blocker.slots[cap.k];
      slot.filled = true;
      slot.fillT = 1.0;
      if (typeof sfx !== 'undefined' && sfx.stoneClack) sfx.stoneClack();
      var pos = getBlockerSlotPos(cap.k);
      spawnBurst(pos.x, pos.y, COLORS[BLOCKER_CI].light, 6);
      blocker.captures.splice(c, 1);
    }
  }

  // Advance in-flight regular bumps
  for (var b = blocker.bumps.length - 1; b >= 0; b--) {
    blocker.bumps[b].t += 1;
    if (blocker.bumps[b].t >= blocker.bumps[b].dur) {
      blocker.bumps.splice(b, 1);
    }
  }

  // Trigger shatter when every tray slot is filled
  if (!blocker.collecting && countFilledTraySlots() >= blocker.total) {
    blocker.collecting = true;
    blocker.collectT = 1;
    blocker.cleared = false;
    if (typeof sfx !== 'undefined' && sfx.stoneCharge) sfx.stoneCharge();
  }

  // Tick fill-pop animation
  for (var s = 0; s < blocker.slots.length; s++) {
    var sl0 = blocker.slots[s];
    if (sl0.fillT > 0) sl0.fillT = Math.max(0, sl0.fillT - 0.04);
  }

  // Shatter sequence
  if (blocker.collecting) {
    blocker.collectT = Math.max(0, blocker.collectT - 0.02);

    // Midway through: freeze each slot's position and launch fragments
    if (blocker.collectT <= 0.65 && !blocker.cleared) {
      blocker.cleared = true;
      for (var s2 = 0; s2 < blocker.slots.length; s2++) {
        var sl = blocker.slots[s2];
        var sp = getBlockerSlotPos(s2);
        sl.shX = sp.x; sl.shY = sp.y;
        sl.shatterT = 1.0;
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
        var spd = 4 + Math.random() * 6;
        sl.vx = Math.cos(ang) * spd;
        sl.vy = Math.sin(ang) * spd - 3;
        sl.rotV = (Math.random() - 0.5) * 0.4;
        sl.dx = 0; sl.dy = 0; sl.rot = 0;
        // stone fragment burst at this slot
        spawnStoneFragments(sp.x, sp.y, 5);
        spawnBurst(sp.x, sp.y, '#C8BDB2', 6);
      }
      if (typeof sfx !== 'undefined' && sfx.stoneShatter) sfx.stoneShatter();
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

// ──────────── Path / position helpers ────────────

// Interpolate the belt path at a real-valued t in [0, BELT_SLOTS)
// (same conventions as getSlotPos but for a continuous parameter).
function pathAtSlot(slotT) {
  var t = ((slotT / BELT_SLOTS) + beltOffset) % 1;
  t = ((t % 1) + 1) % 1;
  var idx = t * beltPath.length;
  var i0 = Math.floor(idx) % beltPath.length;
  var i1 = (i0 + 1) % beltPath.length;
  var f = idx - Math.floor(idx);
  return {
    x: beltPath[i0].x + (beltPath[i1].x - beltPath[i0].x) * f,
    y: beltPath[i0].y + (beltPath[i1].y - beltPath[i0].y) * f
  };
}

function getBlockerSlotPos(k) {
  return pathAtSlot(blocker.trayStart + k);
}

// ──────────── Rendering ────────────

function drawBlockerTray() {
  if (blocker.total <= 0) return;
  var trayAlive = !blocker.cleared;

  // 1. Draw the bent stone bar along the belt path between slot 0 and slot N-1
  if (trayAlive) drawBlockerBar();

  // 2. Draw each tray slot (recess + stone marble / shatter fragment)
  drawBlockerSlots(trayAlive);

  // 3. Draw in-flight capture dips (blocker falling under belt → up into slot)
  drawBlockerCaptures();

  // 4. Draw in-flight bump-offs (regular marble displaced by a blocker)
  drawBlockerBumps();
}

function drawBlockerBar() {
  var thickness = 13 * S;
  // Sample the path between the first and last tray slots.
  var samples = Math.max(16, blocker.total * 6);
  var pts = [];
  for (var i = 0; i < samples; i++) {
    var slotT = blocker.trayStart + (i / (samples - 1)) * (blocker.total - 1);
    pts.push(pathAtSlot(slotT));
  }

  ctx.save();
  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 2 * S;
  // Dark underside
  ctx.strokeStyle = '#3E3832';
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokePoints(pts);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // Stone mid-tone
  ctx.strokeStyle = '#8A8078';
  ctx.lineWidth = thickness * 0.82;
  strokePoints(pts);
  // Top highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = thickness * 0.25;
  ctx.lineCap = 'round';
  strokePoints(pts, -thickness * 0.3);
  ctx.restore();
}

function strokePoints(pts, yOffset) {
  yOffset = yOffset || 0;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y + yOffset);
  for (var i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y + yOffset);
  }
  ctx.stroke();
}

function drawBlockerSlots(trayAlive) {
  var slotR = 9 * S;
  var bc = COLORS[BLOCKER_CI];
  for (var k = 0; k < blocker.total; k++) {
    var slot = blocker.slots[k];
    var pos = blocker.cleared ? { x: slot.shX, y: slot.shY } : getBlockerSlotPos(k);
    var sx = pos.x, sy = pos.y;

    // Slot recess
    if (trayAlive) {
      ctx.save();
      var rg = ctx.createRadialGradient(sx, sy, slotR * 0.2, sx, sy, slotR);
      rg.addColorStop(0, '#2E2822');
      rg.addColorStop(1, '#5A5048');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(sx, sy, slotR * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(30,24,18,0.55)'; ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.arc(sx, sy, slotR * 0.95, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Stone marble (filled or shattering)
    if (slot.filled || slot.shatterT > 0) {
      ctx.save();
      var px = sx + slot.dx;
      var py = sy + slot.dy;
      var scale = 1;
      if (slot.fillT > 0) {
        scale = 0.4 + (1 - slot.fillT) * 0.7 + Math.sin((1 - slot.fillT) * Math.PI) * 0.3;
        ctx.globalAlpha = Math.min(1, (1 - slot.fillT) * 2);
      }
      if (slot.shatterT > 0) {
        scale *= (0.4 + slot.shatterT * 0.6);
        ctx.globalAlpha = slot.shatterT;
      }
      ctx.translate(px, py);
      ctx.rotate(slot.rot);
      ctx.scale(scale, scale);
      drawStoneMarble(0, 0, slotR * 0.85, bc);

      // Wind-up glow
      if (blocker.collecting && blocker.collectT > 0.65 && slot.shatterT <= 0) {
        var wind = (1 - (blocker.collectT - 0.65) / 0.35);
        ctx.globalAlpha = 0.3 + Math.sin(tick * 0.25 + k * 0.4) * 0.25 * wind;
        ctx.fillStyle = bc.glow;
        ctx.beginPath(); ctx.arc(0, 0, slotR * 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
}

function drawStoneMarble(cx, cy, r, bc) {
  var grd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  grd.addColorStop(0, bc.light);
  grd.addColorStop(0.55, bc.fill);
  grd.addColorStop(1, bc.dark);
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // Crack
  ctx.strokeStyle = 'rgba(30,24,18,0.45)'; ctx.lineWidth = 0.8 * S; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.35, cy + r * 0.05);
  ctx.lineTo(cx - r * 0.05, cy - r * 0.2);
  ctx.lineTo(cx + r * 0.2, cy + r * 0.1);
  ctx.stroke();
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
}

function drawBlockerCaptures() {
  var bc = COLORS[BLOCKER_CI];
  var slotR = 9 * S;
  for (var c = 0; c < blocker.captures.length; c++) {
    var cap = blocker.captures[c];
    var u = cap.t / cap.dur;
    var target = getBlockerSlotPos(cap.k);
    // Straight-line X interpolation, arc-dip in Y.
    var x = cap.sx + (target.x - cap.sx) * u;
    var baseY = cap.sy + (target.y - cap.sy) * u;
    // Dip: extra y pushes the marble below the belt near u = 0.5
    var dipAmount = 42 * S;
    var y = baseY + Math.sin(u * Math.PI) * dipAmount;
    ctx.save();
    // Fade out slightly at the deepest point so it reads as "under"
    var belowness = Math.sin(u * Math.PI);
    ctx.globalAlpha = 1 - belowness * 0.35;
    drawStoneMarble(x, y, slotR * 0.85, bc);
    // small dust trail
    if ((tick + c) % 3 === 0) {
      particles.push({
        x: x, y: y, vx: (Math.random() - 0.5) * 0.4 * S, vy: 0.5 * S,
        r: (1.5 + Math.random() * 1.5) * S, color: bc.light,
        life: 0.5, decay: 0.05, grav: false
      });
    }
    ctx.restore();
  }
}

function drawBlockerBumps() {
  var slotR = 8 * S;
  for (var b = 0; b < blocker.bumps.length; b++) {
    var bu = blocker.bumps[b];
    var u = bu.t / bu.dur;
    var dest = getSlotPos(bu.target);
    var x = bu.sx + (dest.x - bu.sx) * u;
    var baseY = bu.sy + (dest.y - bu.sy) * u;
    // Arc up: regulars get popped up and over
    var y = baseY - Math.sin(u * Math.PI) * 22 * S;
    drawMarble(x, y, slotR * 0.8 * cal.marble.s, bu.ci, 1 + Math.sin(u * Math.PI) * 0.15);
  }
}
