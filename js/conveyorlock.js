// ============================================================
// conveyorlock.js — Conveyor Lock mechanic
// ============================================================
// A contiguous run of belt slots starts the level chained shut,
// so usable capacity is BELT_SLOTS - N instead of BELT_SLOTS.
//
// Locked slots are inert. They hold no marble, carry no color, are
// never matched to a sort column, and are never counted by anything
// that reads belt contents. The funnel exit skips them exactly as it
// skips an occupied slot, so marbles back up in the funnel through
// the existing "belt full" path — there is no new queueing code.
//
// Because slots never migrate on this belt, a marble never has to
// skip, pass through or jump over a locked slot. The chain is drawn
// on the locked slots themselves, so it rides the belt at tread
// speed and can never appear to slide against a moving surface.
//
// Playing the box that carries the Conveyor Key breaks the chain and
// returns the slots for the rest of the level. The chain never re-locks.
//
// Runtime safeguards (not editor validations) — see conveyorLockUpdate:
//   • capacity floor  — usable capacity never drops below BELT_LOCK_MIN_CAP
//   • key parity      — a chain with no key never starts locked
//   • key destroyed   — the unlock is bound to the key box being cleared,
//                       not to the tap, so any removal still fires it
//   • key unreachable — no legal move left unlocks the chain at once
//   • endgame release — a cleared board unlocks the chain
// ============================================================

// Chain palette — cold steel with brass hardware. Kept far from the
// grey of blocker marbles so the key reads as its own object.
var CL_STEEL = '#8C9AA8', CL_STEEL_LT = '#C7D1DA', CL_STEEL_DK = '#55616D';
var CL_BRASS = '#D9A03C', CL_BRASS_LT = '#F4D289', CL_BRASS_DK = '#96681B';

// ── Sounds ──

var conveyorLockSfx = {
  // A state, not an event: a short metallic settle, no sting.
  settle: function () {
    tone(150, 0.2, 'square', 0.035, 68);
    setTimeout(function () { tone(1050, 0.07, 'square', 0.018, 640); }, 70);
  },
  // Dull metal, clearly not the softer marble-on-marble contact.
  thunk: function () {
    tone(104, 0.12, 'triangle', 0.06, 52);
    tone(196, 0.05, 'square', 0.015, 150);
  },
  // Padlock snaps, links scatter, bright metallic release.
  snap: function () {
    tone(1750, 0.06, 'square', 0.05, 820);
    tone(140, 0.22, 'triangle', 0.05, 60);
    [988, 1319, 1760].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.13, 'square', 0.026, f * 0.7); }, 70 + i * 65);
    });
  }
};

// ── Key census ──
// Counts Conveyor Keys still to be played, on the grid and inside
// tunnels. Reaching zero means the key was played or removed, and
// either way the chain must open.
function conveyorLockCountKeys() {
  if (!stock || !stock.length) return 0;
  var n = 0;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b) continue;
    if (b.isTunnel) {
      var tc = b.tunnelContents || [];
      for (var t = 0; t < tc.length; t++) if (tc[t].type === 'key') n++;
      continue;
    }
    if (b.isWall || b.empty || b.used) continue;
    if (b.boxType === 'key') n++;
  }
  return n;
}

// ── Setup ──

function conveyorLockInit(lvl) {
  beltLockActive = false;
  beltLockN = 0;
  beltLockSlots = [];
  beltLockPadIdx = -1;
  beltLockSettleT = 0;
  beltLockBreakT = 0;
  beltLockFreeT = [];
  beltLockThunkCD = 0;
  keyFlights = [];

  var n = (lvl && lvl.beltLock) ? lvl.beltLock : 0;
  if (n <= 0) return;

  // Capacity floor. Blocker marbles hold slots for the whole level too,
  // so they spend from the same budget as the chain.
  var budget = BELT_SLOTS - BELT_LOCK_MIN_CAP - totalBlockerMarbles;
  if (n > budget) n = budget;
  if (n <= 0) return;

  // Key parity. A chain with no key could never be opened by play, so
  // the level starts unlocked rather than in a blocked state.
  if (conveyorLockCountKeys() === 0) return;

  // The run is anchored at the funnel entry and extends forward along
  // the belt, padlock on the funnel-side end. Marbles are placed into
  // slots in descending index order, so the first free slot behind the
  // chain sits directly against the padlock face.
  var start = Math.floor(getBeltEntryT() * BELT_SLOTS) % BELT_SLOTS;
  beltLockN = n;
  beltLockPadIdx = start;
  for (var j = 0; j < n; j++) {
    var si = (start + j) % BELT_SLOTS;
    beltLockSlots.push(si);
    beltSlots[si].locked = true;
  }
  beltLockActive = true;
  beltLockSettleT = 1.0;
  conveyorLockSfx.settle();
}

// ── Unlock ──

function conveyorLockBreak() {
  if (!beltLockActive) return;
  beltLockActive = false;
  beltLockBreakT = 1.0;
  beltLockFreeT = [];

  for (var j = 0; j < beltLockSlots.length; j++) {
    var si = beltLockSlots[j];
    beltSlots[si].locked = false;
    // Freed slots light up in sequence from the padlock outward, so the
    // player sees exactly how much capacity came back.
    beltLockFreeT.push({ slot: si, delay: j * 3, t: 0 });

    var p = getSlotPos(si);
    for (var q = 0; q < 4; q++) {
      var a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.5;
      particles.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
        r: (1.5 + Math.random() * 2.5) * S,
        color: Math.random() > 0.45 ? CL_STEEL_LT : CL_STEEL,
        life: 1, decay: 0.02 + Math.random() * 0.02, grav: true
      });
    }
  }

  var pp = getSlotPos(beltLockPadIdx);
  spawnBurst(pp.x, pp.y, CL_BRASS_LT, 16);
  for (var q2 = 0; q2 < 8; q2++) {
    var a2 = Math.random() * Math.PI * 2, sp2 = 2 + Math.random() * 4;
    particles.push({
      x: pp.x, y: pp.y,
      vx: Math.cos(a2) * sp2 * S, vy: Math.sin(a2) * sp2 * S - 3 * S,
      r: (2 + Math.random() * 3) * S, color: CL_BRASS,
      life: 1, decay: 0.02, grav: true
    });
  }
  conveyorLockSfx.snap();
}

// Called when a Conveyor Key box is tapped. The key lifts off and
// travels to the padlock; the chain breaks when it lands. Input is
// never blocked while it flies.
function conveyorLockKeyPlayed(box) {
  if (!beltLockActive) return;
  if (keyFlights.length > 0) return;
  keyFlights.push({
    sx: box.x + L.bw / 2,
    sy: box.y + L.bh / 2,
    t: 0
  });
}

// ── Safeguard predicates ──

// True while the player still has something to do. A board mid-spawn,
// with marbles in the funnel or jumpers in flight, is still resolving
// and must not be read as a dead end.
function conveyorLockHasMove() {
  if (physMarbles.length > 0 || jumpers.length > 0) return true;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b) continue;
    if (b.isTunnel) {
      if (b.tunnelContents && b.tunnelContents.length > 0) return true;
      continue;
    }
    if (b.isWall) continue;
    if (b.spawning || b.revealT > 0) return true;
    if (isBoxTappable(i)) return true;
  }
  return false;
}

// True once the last box on the board has been played.
function conveyorLockBoardCleared() {
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b) continue;
    if (b.isTunnel) {
      if (b.tunnelContents && b.tunnelContents.length > 0) return false;
      continue;
    }
    if (b.isWall || b.empty || b.used) continue;
    return false;
  }
  return true;
}

// A marble reached the funnel exit and found nowhere to go. Sound the
// padlock only when it was the chain that turned it away, not a belt
// that happens to be full.
function conveyorLockNotifyBlocked() {
  if (!beltLockActive || beltLockThunkCD > 0) return;
  var entryT = getBeltEntryT();
  var nearest = -1, nd = Infinity;
  for (var i = 0; i < BELT_SLOTS; i++) {
    var diff = Math.abs(getSlotT(i) - entryT);
    diff = Math.min(diff, 1 - diff);
    if (diff < nd) { nd = diff; nearest = i; }
  }
  if (nearest < 0 || !beltSlots[nearest].locked) return;
  beltLockThunkCD = 16;
  conveyorLockSfx.thunk();
}

// ── Update ──

function conveyorLockUpdate() {
  if (beltLockSettleT > 0) beltLockSettleT = Math.max(0, beltLockSettleT - 0.022);
  if (beltLockThunkCD > 0) beltLockThunkCD--;

  for (var i = keyFlights.length - 1; i >= 0; i--) {
    var f = keyFlights[i];
    f.t += 0.035;
    if (f.t >= 1) {
      keyFlights.splice(i, 1);
      conveyorLockBreak();
    }
  }

  if (beltLockBreakT > 0) {
    beltLockBreakT = Math.max(0, beltLockBreakT - 0.018);
    for (var j = 0; j < beltLockFreeT.length; j++) {
      var fr = beltLockFreeT[j];
      if (fr.delay > 0) { fr.delay--; continue; }
      if (fr.t < 1 && fr.up !== true) { fr.t = Math.min(1, fr.t + 0.2); if (fr.t >= 1) fr.up = true; }
      else if (fr.up) fr.t = Math.max(0, fr.t - 0.035);
    }
    if (beltLockBreakT <= 0) {
      beltLockSlots = [];
      beltLockFreeT = [];
      beltLockPadIdx = -1;
      beltLockN = 0;
    }
  }

  if (!beltLockActive) return;
  if (keyFlights.length > 0) return;   // an unlock is already on its way

  // Key destroyed or bypassed — the effect is bound to the box being
  // cleared, by any means, not to the tap that normally clears it.
  if (conveyorLockCountKeys() === 0) { conveyorLockBreak(); return; }

  // Endgame release — a reduced belt must never be why a cleared board
  // fails to finish.
  if (conveyorLockBoardCleared()) { conveyorLockBreak(); return; }

  // Key unreachable — cheap conservative check: no legal move left while
  // the chain still holds means the key can never be reached.
  if (!conveyorLockHasMove()) { conveyorLockBreak(); return; }
}

// ── Drawing ──

// Tangent of the belt path at a (possibly fractional) slot index.
function conveyorLockAngle(i) {
  var p1 = getSlotPos(i - 0.3), p2 = getSlotPos(i + 0.3);
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

// A single tank-tread link. One per covered slot, so the link cadence
// is what makes the lost capacity legible without any HUD widget.
function drawChainLink(px, py, ang, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  ctx.rotate(ang);

  // Sized so neighbouring links almost touch: the cadence of one link
  // per slot is what makes the lost capacity countable at a glance.
  var w = size * 2.0, h = size * 1.75;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 1.5 * S;
  var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, CL_STEEL_LT);
  g.addColorStop(0.42, CL_STEEL);
  g.addColorStop(1, CL_STEEL_DK);
  ctx.fillStyle = g;
  rRect(-w / 2, -h / 2, w, h, size * 0.42); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.strokeStyle = CL_STEEL_DK; ctx.lineWidth = 1.6 * S;
  rRect(-w / 2, -h / 2, w, h, size * 0.42); ctx.stroke();

  // Slot cut through the middle of the link
  ctx.fillStyle = 'rgba(38,46,55,0.6)';
  rRect(-w * 0.24, -h * 0.15, w * 0.48, h * 0.3, h * 0.15); ctx.fill();

  // Rivets
  ctx.fillStyle = CL_STEEL_LT;
  ctx.beginPath(); ctx.arc(-w * 0.35, 0, size * 0.17, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.35, 0, size * 0.17, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// The padlock closing the chain at the funnel-side end. Marbles stack
// against its face with contact, not overlap.
function drawChainPadlock(px, py, ang, size, alpha, openT) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  ctx.rotate(ang);

  // Sized a shade above a link, and centred on its slot, so it anchors
  // the end of the run without breaking the tread line.
  var bw = size * 1.95, bh = size * 1.8;

  // Shackle, arcing above the band. Springs open as the lock breaks.
  ctx.save();
  ctx.translate(0, -bh * 0.5);
  ctx.rotate(-openT * 1.6);
  ctx.strokeStyle = CL_STEEL_LT;
  ctx.lineWidth = size * 0.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.5, Math.PI * 0.95, Math.PI * 2.05);
  ctx.stroke();
  ctx.strokeStyle = CL_STEEL_DK;
  ctx.lineWidth = size * 0.11;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.5, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();

  // Body
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
  var g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  g.addColorStop(0, CL_BRASS_LT);
  g.addColorStop(0.5, CL_BRASS);
  g.addColorStop(1, CL_BRASS_DK);
  ctx.fillStyle = g;
  rRect(-bw / 2, -bh / 2, bw, bh, size * 0.34); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = CL_BRASS_DK; ctx.lineWidth = 1.5 * S;
  rRect(-bw / 2, -bh / 2, bw, bh, size * 0.34); ctx.stroke();

  // Keyhole
  ctx.fillStyle = 'rgba(52,38,14,0.8)';
  ctx.beginPath(); ctx.arc(0, -size * 0.1, size * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-size * 0.08, -size * 0.1, size * 0.16, size * 0.45);

  ctx.restore();
}

// The Conveyor Key silhouette. Shared by the box emblem and the
// in-flight key so the two read as the same object.
function drawConveyorKeyGlyph(px, py, size, ang, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.translate(px, py);
  ctx.rotate(ang || 0);

  ctx.strokeStyle = CL_STEEL_DK;
  ctx.lineWidth = size * 0.16;
  ctx.lineJoin = 'round';

  // Bow
  ctx.beginPath(); ctx.arc(-size * 0.55, 0, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  var g = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
  g.addColorStop(0, CL_BRASS_LT); g.addColorStop(1, CL_BRASS_DK);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(-size * 0.55, 0, size * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(52,38,14,0.7)';
  ctx.beginPath(); ctx.arc(-size * 0.55, 0, size * 0.15, 0, Math.PI * 2); ctx.fill();

  // Shaft and teeth
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, 0); ctx.lineTo(size * 0.85, 0);
  ctx.strokeStyle = CL_STEEL_DK; ctx.lineWidth = size * 0.34; ctx.stroke();
  ctx.strokeStyle = CL_BRASS; ctx.lineWidth = size * 0.2; ctx.stroke();

  ctx.strokeStyle = CL_BRASS; ctx.lineWidth = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(size * 0.45, 0); ctx.lineTo(size * 0.45, size * 0.4);
  ctx.moveTo(size * 0.78, 0); ctx.lineTo(size * 0.78, size * 0.32);
  ctx.stroke();

  ctx.restore();
}

function drawConveyorLock() {
  var slotR = 8 * S;

  if (beltLockSlots.length) {
    var n = beltLockSlots.length;
    var breaking = beltLockBreakT > 0;
    var bp = breaking ? 1 - beltLockBreakT : 0;

    // Freed slots light up in sequence from the padlock outward.
    if (breaking) {
      for (var f = 0; f < beltLockFreeT.length; f++) {
        var fr = beltLockFreeT[f];
        if (fr.t <= 0) continue;
        var fpos = getSlotPos(fr.slot);
        var rr = slotR * (1.2 + (1 - fr.t) * 1.3);
        ctx.save();
        ctx.globalAlpha = fr.t * 0.6;
        var fg = ctx.createRadialGradient(fpos.x, fpos.y, 0, fpos.x, fpos.y, rr);
        fg.addColorStop(0, 'rgba(255,255,255,0.95)');
        fg.addColorStop(0.5, CL_BRASS_LT);
        fg.addColorStop(1, 'rgba(217,160,60,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(fpos.x, fpos.y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    // Settle-in at level start: the chain drops the last few pixels.
    var drop = beltLockSettleT > 0 ? beltLockSettleT * beltLockSettleT * 9 * S : 0;
    var alpha = breaking ? Math.max(0, 1 - bp * 1.7) : 1;

    if (alpha > 0.01) {
      // Backing band, so the covered run reads as one heavy object. The
      // belt underneath stays fully drawn and moving — no gap, no
      // truncated rail, nothing that looks switched off.
      ctx.save();
      ctx.globalAlpha = alpha * 0.92;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      var steps = (n - 1) * 4;
      for (var s = 0; s <= steps; s++) {
        var fi = beltLockSlots[0] + (n > 1 ? s / 4 : 0);
        var p = getSlotPos(fi);
        if (s === 0) ctx.moveTo(p.x, p.y + drop); else ctx.lineTo(p.x, p.y + drop);
      }
      if (n === 1) { var p1 = getSlotPos(beltLockSlots[0]); ctx.lineTo(p1.x, p1.y + drop); }
      // Brass edge rail under the steel, so the covered run reads as one
      // heavy object rather than a row of loose parts.
      ctx.strokeStyle = CL_BRASS_DK;
      ctx.lineWidth = slotR * 2.35;
      ctx.stroke();
      ctx.strokeStyle = CL_STEEL_DK;
      ctx.lineWidth = slotR * 1.95;
      ctx.stroke();
      ctx.restore();

      // One piece of hardware per covered slot: a link everywhere, and
      // the padlock on the funnel-side end, where waiting marbles come
      // to rest against its face.
      for (var j = 1; j < n; j++) {
        var si = beltLockSlots[j];
        var pos = getSlotPos(si);
        var ang = conveyorLockAngle(si);
        var ox = 0, oy = drop;
        if (breaking) {
          // Links scatter and fall away.
          var spread = bp * 26 * S * (0.4 + j / n);
          ox = Math.cos(ang + Math.PI / 2) * spread * (j % 2 ? 1 : -1);
          oy += bp * bp * 40 * S;
        }
        drawChainLink(pos.x + ox, pos.y + oy, ang + (breaking ? bp * 1.4 * (j % 2 ? 1 : -1) : 0), slotR, alpha);
      }

      var ppos = getSlotPos(beltLockPadIdx);
      var pang = conveyorLockAngle(beltLockPadIdx);
      drawChainPadlock(
        ppos.x, ppos.y + drop + (breaking ? bp * bp * 34 * S : 0),
        pang + (breaking ? bp * 0.9 : 0),
        slotR, alpha, breaking ? Math.min(1, bp * 3) : 0
      );
    }
  }

  // Key in flight, drawn over the chain it is heading for.
  for (var k = 0; k < keyFlights.length; k++) {
    var fl = keyFlights[k];
    var target = getSlotPos(beltLockPadIdx >= 0 ? beltLockPadIdx : 0);
    var t = fl.t;
    var ease = t * t * (3 - 2 * t);
    var kx = fl.sx + (target.x - fl.sx) * ease;
    var ky = fl.sy + (target.y - fl.sy) * ease - Math.sin(t * Math.PI) * 46 * S;
    var size = 11 * S * (1 + Math.sin(t * Math.PI) * 0.25);
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - t);
    ctx.fillStyle = CL_BRASS_LT;
    ctx.beginPath(); ctx.arc(kx, ky, size * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawConveyorKeyGlyph(kx, ky, size, t * Math.PI * 2.5, 1);
  }
}
