// ============================================================
// snap.js — Snap Mechanic: temporary marble storage tubes
// ============================================================
// Two tubes flank the play area (index 0 = left, 1 = right).
//   • Store: tap a belt marble → all marbles of that color on the
//     belt fly into the active tube (left fills first, then right).
//     No auto-split — only what fits moves; the rest stay on the belt.
//   • Return: tap a tube → its top color group (LIFO) flies back to
//     the nearest empty belt slots, closest-first. Partial if the
//     belt lacks room.
//   • Both full → Snap is blocked: tubes shake + error buzz + a
//     first-time hint.
// Tube marbles do NOT count toward belt capacity. Gray blocker
// marbles cannot be snapped.
// ============================================================

function snapInit() {
  snapTubes = [
    { marbles: [], reservedIn: 0, shakeT: 0, settleIndex: -1, settleT: 0 },
    { marbles: [], reservedIn: 0, shakeT: 0, settleIndex: -1, settleT: 0 }
  ];
  snapFlights = [];
  snapHasStored = false;
  snapHasReturned = false;
  snapBothFullHintT = 0;
  snapBothFullShown = false;
}

function snapEase(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function snapDist2(p, q) { var dx = p.x - q.x, dy = p.y - q.y; return dx * dx + dy * dy; }

// Bottom-up position of slot i within tube `idx`.
function tubeSlotPos(idx, i) {
  var x = (idx === 0 ? L.tubeLeftX : L.tubeRightX) + L.tubeW / 2;
  var bottomY = L.tubeTop + L.tubeH - L.tubePad - L.tubeMarbleR;
  return { x: x, y: bottomY - i * L.tubeSlotGap };
}

// Which tube is currently active (has room). -1 if both full.
function snapActiveTube() {
  if (snapTubes[0].marbles.length + snapTubes[0].reservedIn < TUBE_CAP) return 0;
  if (snapTubes[1].marbles.length + snapTubes[1].reservedIn < TUBE_CAP) return 1;
  return -1;
}

// ── Input ──
// Returns true if the tap was consumed by the Snap system.
function handleSnapTap(px, py) {
  if (!snapTubes || snapTubes.length < 2) return false;

  // Tube tap → return top group.
  for (var idx = 0; idx < 2; idx++) {
    var bx = (idx === 0 ? L.tubeLeftX : L.tubeRightX);
    if (px >= bx && px <= bx + L.tubeW && py >= L.tubeTop && py <= L.tubeTop + L.tubeH) {
      snapReleaseTube(idx);
      return true;
    }
  }

  // Belt marble tap → store that color.
  var tapR = 15 * S;
  var best = -1, bestD = Infinity;
  for (var i = 0; i < BELT_SLOTS; i++) {
    var slot = beltSlots[i];
    if (slot.marble < 0 || slot.marble >= NUM_COLORS) continue; // skip empty + blockers
    var pos = getSlotPos(i);
    var d = snapDist2(pos, { x: px, y: py });
    if (d < tapR * tapR && d < bestD) { bestD = d; best = i; }
  }
  if (best >= 0) {
    snapStoreColor(beltSlots[best].marble);
    return true;
  }
  return false;
}

// ── Store: belt → active tube ──
function snapStoreColor(ci) {
  if (ci < 0 || ci >= NUM_COLORS) return;

  var slots = [];
  for (var i = 0; i < BELT_SLOTS; i++) {
    if (beltSlots[i].marble === ci) slots.push(i);
  }
  if (slots.length === 0) return;

  var active = snapActiveTube();
  if (active < 0) { snapBlocked(); return; }

  var tube = snapTubes[active];
  var space = TUBE_CAP - (tube.marbles.length + tube.reservedIn);
  var n = Math.min(space, slots.length);
  if (n <= 0) { snapBlocked(); return; }

  for (var k = 0; k < n; k++) {
    var si = slots[k];
    var pos = getSlotPos(si);
    var destIndex = tube.marbles.length + tube.reservedIn;
    tube.reservedIn++;
    var dest = tubeSlotPos(active, destIndex);
    beltSlots[si].marble = -1;
    snapFlights.push({ ci: ci, x0: pos.x, y0: pos.y, x1: dest.x, y1: dest.y,
      t: 0, dur: 15, toTube: true, tubeIdx: active });
    spawnBurst(pos.x, pos.y, COLORS[ci].fill, 4);
  }
  sfx.snapStore();
  snapHasStored = true;
}

// ── Return: tube top group → belt ──
function snapReleaseTube(idx) {
  var tube = snapTubes[idx];
  if (tube.marbles.length === 0) return;

  // Top color group (contiguous run of same color at the top).
  var topCi = tube.marbles[tube.marbles.length - 1];
  var groupCount = 0;
  for (var i = tube.marbles.length - 1; i >= 0; i--) {
    if (tube.marbles[i] === topCi) groupCount++; else break;
  }

  // Empty belt slots (not already reserved by a flight in progress).
  var empties = [];
  for (var s = 0; s < BELT_SLOTS; s++) {
    if (beltSlots[s].marble < 0 && !beltSlots[s].reserved) empties.push(s);
  }
  if (empties.length === 0) { tube.shakeT = 0.4; return; }

  var release = Math.min(groupCount, empties.length);

  // Fill closest-to-farthest from the tube's return point.
  var ref = L.tubeReturn[idx];
  empties.sort(function (a, b) {
    return snapDist2(getSlotPos(a), ref) - snapDist2(getSlotPos(b), ref);
  });

  for (var r = 0; r < release; r++) {
    tube.marbles.pop();
    var from = tubeSlotPos(idx, tube.marbles.length);
    var targetSlot = empties[r];
    beltSlots[targetSlot].reserved = true;
    var to = getSlotPos(targetSlot);
    snapFlights.push({ ci: topCi, x0: from.x, y0: from.y, x1: to.x, y1: to.y,
      t: 0, dur: 15, toTube: false, slotIdx: targetSlot });
  }
  sfx.snapReturn();
  snapHasReturned = true;
}

function snapBlocked() {
  snapTubes[0].shakeT = 0.5;
  snapTubes[1].shakeT = 0.5;
  sfx.snapBlocked();
  if (!snapBothFullShown) { snapBothFullHintT = 150; snapBothFullShown = true; }
}

// ── Per-frame update ──
function updateSnap() {
  if (!snapTubes || snapTubes.length < 2) return;

  for (var i = 0; i < 2; i++) {
    var t = snapTubes[i];
    if (t.shakeT > 0) t.shakeT = Math.max(0, t.shakeT - 0.04);
    if (t.settleT > 0) t.settleT = Math.max(0, t.settleT - 0.08);
  }

  for (var f = snapFlights.length - 1; f >= 0; f--) {
    var fl = snapFlights[f];
    fl.t += 1 / fl.dur;
    if (!fl.toTube) {
      // Belt slots drift, so track the live target position.
      var lp = getSlotPos(fl.slotIdx);
      fl.x1 = lp.x; fl.y1 = lp.y;
    }
    if (fl.t >= 1) {
      if (fl.toTube) {
        var tube = snapTubes[fl.tubeIdx];
        tube.marbles.push(fl.ci);
        tube.reservedIn = Math.max(0, tube.reservedIn - 1);
        tube.settleIndex = tube.marbles.length - 1;
        tube.settleT = 1;
      } else {
        var sl = beltSlots[fl.slotIdx];
        sl.marble = fl.ci;
        sl.reserved = false;
        sl.arriveAnim = 0.6;
        spawnBurst(fl.x1, fl.y1, COLORS[fl.ci].fill, 5);
      }
      snapFlights.splice(f, 1);
    }
  }

  if (snapBothFullHintT > 0) snapBothFullHintT--;
}

// ── Rendering ──
function drawSnapTubes() {
  if (!L.tubeReturn || !snapTubes || snapTubes.length < 2) return;
  var active = snapActiveTube();

  for (var idx = 0; idx < 2; idx++) {
    var tube = snapTubes[idx];
    var baseX = (idx === 0 ? L.tubeLeftX : L.tubeRightX);
    var ox = tube.shakeT > 0 ? Math.sin(tube.shakeT * 40) * 4 * S * tube.shakeT : 0;
    var x = baseX + ox, y = L.tubeTop, w = L.tubeW, h = L.tubeH;

    ctx.save();
    // Frosted glass body
    ctx.fillStyle = 'rgba(225,238,248,0.32)';
    rRect(x, y, w, h, w / 2); ctx.fill();

    // Border — active tube glows
    if (idx === active) {
      ctx.shadowColor = 'rgba(255,214,90,0.9)'; ctx.shadowBlur = 16 * S;
      ctx.strokeStyle = 'rgba(255,206,80,0.95)'; ctx.lineWidth = 3 * S;
      rRect(x, y, w, h, w / 2); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(150,170,190,0.55)'; ctx.lineWidth = 2 * S;
      rRect(x, y, w, h, w / 2); ctx.stroke();
    }

    // Empty-capacity pips
    for (var i = 0; i < TUBE_CAP; i++) {
      if (i < tube.marbles.length) continue;
      var p = tubeSlotPos(idx, i);
      ctx.fillStyle = 'rgba(150,170,190,0.18)';
      ctx.beginPath(); ctx.arc(p.x + ox, p.y, L.tubeMarbleR * 0.55, 0, Math.PI * 2); ctx.fill();
    }

    // Stored marbles (bottom-up)
    for (var j = 0; j < tube.marbles.length; j++) {
      var mp = tubeSlotPos(idx, j);
      var es = 1;
      if (tube.settleT > 0 && j === tube.settleIndex) es = 1 + Math.sin(tube.settleT * Math.PI) * 0.25;
      drawMarble(mp.x + ox, mp.y, L.tubeMarbleR, tube.marbles[j], es);
    }

    // Count label
    ctx.fillStyle = 'rgba(90,74,56,0.5)';
    ctx.font = 'bold ' + (9 * S) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tube.marbles.length + '/' + TUBE_CAP, x + w / 2, y - 8 * S);
    ctx.restore();
  }
}

function drawSnapFlights() {
  if (!snapFlights || snapFlights.length === 0) return;
  var arcH = 34 * S;
  for (var i = 0; i < snapFlights.length; i++) {
    var f = snapFlights[i];
    // Dotted arc trail
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = COLORS[f.ci].light;
    for (var s = 1; s <= 10; s++) {
      var tt = s / 11;
      var dx = f.x0 + (f.x1 - f.x0) * tt;
      var dy = f.y0 + (f.y1 - f.y0) * tt - Math.sin(tt * Math.PI) * arcH;
      ctx.beginPath(); ctx.arc(dx, dy, 1.7 * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Flying marble
    var e = snapEase(f.t);
    var x = f.x0 + (f.x1 - f.x0) * e;
    var y = f.y0 + (f.y1 - f.y0) * e - Math.sin(f.t * Math.PI) * arcH;
    drawMarble(x, y, L.tubeMarbleR * 0.95, f.ci, 1 + Math.sin(f.t * Math.PI) * 0.15);
  }
}

function drawSnapHints() {
  if (!snapTubes || snapTubes.length < 2) return;

  if (!snapHasStored) {
    var has = false;
    for (var i = 0; i < BELT_SLOTS; i++) {
      var m = beltSlots[i].marble;
      if (m >= 0 && m < NUM_COLORS) { has = true; break; }
    }
    if (has && snapBothFullHintT <= 0) drawSnapHintPill(L.beltCx, L.beltTopY - 16 * S, 'Tap to store marbles', 1);
  }

  if (!snapHasReturned) {
    for (var idx = 0; idx < 2; idx++) {
      if (snapTubes[idx].marbles.length > 0) {
        var bx = (idx === 0 ? L.tubeLeftX : L.tubeRightX) + L.tubeW / 2;
        drawSnapHintPill(bx, L.tubeTop - 24 * S, 'Tap to return', 1);
        break;
      }
    }
  }

  if (snapBothFullHintT > 0) {
    var a = Math.min(1, snapBothFullHintT / 30);
    drawSnapHintPill(L.cx, L.beltTopY - 16 * S, 'Both tubes are full — release one first!', a);
  }
}

function drawSnapHintPill(cx, cy, text, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 ' + (11 * S) + 'px Fredoka, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var tw = ctx.measureText(text).width;
  var padX = 12 * S, h = 22 * S, w = tw + padX * 2;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 2 * S;
  rRect(cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#5A4A38';
  ctx.fillText(text, cx, cy);
  ctx.restore();
}
