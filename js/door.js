// ============================================================
// door.js — Turn-Based Door mechanic
//
// A door is a 1x1 or 2x1 cell that flips between "open" and
// "closed" every X turns. A turn = one successful box tap.
//
//   OPEN   → behaves like an empty cell (passable in open-path)
//   CLOSED → behaves like a wall (blocks open-path)
//
// Toggling the door re-runs updateBoxReveals so boxes whose
// paths just opened/closed update their revealed state.
//
// Softlock guard: if closing would leave zero active boxes
// reachable while boxes still remain on the board, the door
// locks open for the rest of the game (counter → ∞).
//
// 2x1 doors are stored as one parent (isDoor + doorWide) at the
// left cell and one part (isDoorPart) at the right cell. Both
// cells share the parent's state through doorPartParentIdx.
// ============================================================

var turnCount = 0;

function resetDoorTurnCounter() { turnCount = 0; }

function getDoorPartnerIdx(doorIdx) {
  if (!stock || !L) return -1;
  var s = stock[doorIdx];
  if (!s || !s.isDoor || !s.doorWide) return -1;
  var col = doorIdx % L.cols;
  if (col + 1 >= L.cols) return -1;
  return doorIdx + 1;
}

function isDoorPassable(cell) {
  if (!cell) return false;
  if (cell.isDoor) return !cell.doorClosed;
  if (cell.isDoorPart) {
    var p = stock[cell.doorPartParentIdx];
    return !!(p && p.isDoor && !p.doorClosed);
  }
  return false;
}

// Called from handleTap after a successful box tap. Increments
// the global turn counter and ticks every door's timer.
function onTurnPassed() {
  turnCount++;
  var anyToggled = false;

  for (var i = 0; i < stock.length; i++) {
    var d = stock[i];
    if (!d || !d.isDoor) continue;
    if (d.doorOpenLocked) continue;

    d.doorTurnsLeft--;
    if (d.doorTurnsLeft > 0) continue;

    var wantClose = !d.doorClosed;
    if (wantClose && wouldCloseSoftlock(i)) {
      // Lock the door open forever to avoid stranding the player.
      d.doorOpenLocked = true;
      d.doorClosed = false;
      d.doorAnimT = 1;
      d.doorTurnsLeft = d.doorPeriod;
      spawnDoorLockOpenFx(d);
      if (typeof sfx !== 'undefined' && sfx.doorLock) sfx.doorLock();
      anyToggled = true;
      continue;
    }

    d.doorClosed = wantClose;
    d.doorTurnsLeft = d.doorPeriod;
    d.doorAnimT = 1;
    spawnDoorToggleFx(d);
    if (typeof sfx !== 'undefined') {
      if (d.doorClosed && sfx.doorClose) sfx.doorClose();
      else if (!d.doorClosed && sfx.doorOpen) sfx.doorOpen();
    }
    anyToggled = true;
  }

  if (anyToggled && typeof updateBoxReveals === 'function') {
    updateBoxReveals(true);
  }
}

// Hypothetically close door at idx and check if any active box
// would still be reachable from the bottom. Returns true if the
// close would create a softlock state.
function wouldCloseSoftlock(doorIdx) {
  var s = stock[doorIdx];
  if (!s) return false;
  var origClosed = s.doorClosed;
  s.doorClosed = true;

  var total = stock.length;
  var passable = new Array(total);
  for (var i = 0; i < total; i++) {
    var c = stock[i];
    if (!c) { passable[i] = false; continue; }
    if (c.isWall || c.isTunnel) { passable[i] = false; continue; }
    if (c.isDoor) { passable[i] = !c.doorClosed; continue; }
    if (c.isDoorPart) {
      var p = stock[c.doorPartParentIdx];
      passable[i] = !!(p && p.isDoor && !p.doorClosed);
      continue;
    }
    passable[i] = !!(c.empty || c.used);
  }

  // Flood-fill from bottom row outward.
  var reachable = new Array(total);
  for (var j = 0; j < total; j++) reachable[j] = false;
  var queue = [];
  var bottomRow = L.rows - 1;
  for (var bc = 0; bc < L.cols; bc++) {
    var bIdx = bottomRow * L.cols + bc;
    if (passable[bIdx]) { reachable[bIdx] = true; queue.push(bIdx); }
  }
  var head = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    var cr = Math.floor(cur / L.cols), cc = cur % L.cols;
    var nbrs = [];
    if (cr > 0)          nbrs.push((cr - 1) * L.cols + cc);
    if (cr < L.rows - 1) nbrs.push((cr + 1) * L.cols + cc);
    if (cc > 0)          nbrs.push(cr * L.cols + (cc - 1));
    if (cc < L.cols - 1) nbrs.push(cr * L.cols + (cc + 1));
    for (var n = 0; n < nbrs.length; n++) {
      var ni = nbrs[n];
      if (!reachable[ni] && passable[ni]) {
        reachable[ni] = true;
        queue.push(ni);
      }
    }
  }

  // Count active boxes (still in play) and how many would be reachable.
  var activeBoxCount = 0;
  var reachableBoxCount = 0;
  for (var k = 0; k < total; k++) {
    var b = stock[k];
    if (!b) continue;
    if (b.isWall || b.isTunnel || b.isDoor || b.isDoorPart) continue;
    if (b.empty || b.used) continue;
    activeBoxCount++;
    var br = Math.floor(k / L.cols), bcol = k % L.cols;
    var hasPath = false;
    if (br === L.rows - 1) {
      hasPath = true;
    } else {
      var bn = [];
      if (br > 0)          bn.push((br - 1) * L.cols + bcol);
      if (br < L.rows - 1) bn.push((br + 1) * L.cols + bcol);
      if (bcol > 0)        bn.push(br * L.cols + (bcol - 1));
      if (bcol < L.cols - 1) bn.push(br * L.cols + (bcol + 1));
      for (var m = 0; m < bn.length; m++) {
        if (reachable[bn[m]]) { hasPath = true; break; }
      }
    }
    if (hasPath) reachableBoxCount++;
  }

  // Also consider tunnels still holding boxes — their exit tile
  // needs to be reachable too, otherwise they'd be orphaned.
  var pendingTunnelBoxes = 0;
  var reachableTunnelExits = 0;
  for (var t = 0; t < total; t++) {
    var ts = stock[t];
    if (!ts || !ts.isTunnel) continue;
    if (!ts.tunnelContents || ts.tunnelContents.length === 0) continue;
    pendingTunnelBoxes += ts.tunnelContents.length;
    var ex = getTunnelExitIdx(t);
    if (ex >= 0 && reachable[ex]) reachableTunnelExits++;
  }

  s.doorClosed = origClosed;

  var anyRemaining = activeBoxCount + pendingTunnelBoxes;
  if (anyRemaining === 0) return false;            // game effectively over
  if (reachableBoxCount > 0) return false;          // can still tap something
  if (reachableTunnelExits > 0) return false;       // a tunnel can still drop a box
  return true;
}

function spawnDoorToggleFx(d) {
  if (!L) return;
  var w = d.doorWide ? L.bw * 2 + L.bg : L.bw;
  var cx = d.x + w / 2;
  var floorY = d.y + L.bh - 4 * S;
  for (var i = 0; i < 14; i++) {
    var ox = (Math.random() - 0.5) * w * 0.85;
    particles.push({
      x: cx + ox, y: floorY,
      vx: (Math.random() - 0.5) * 1.6 * S,
      vy: -(0.6 + Math.random() * 2.4) * S,
      r: (1.5 + Math.random() * 2.4) * S,
      color: 'rgba(190,180,168,0.75)',
      life: 0.7, decay: 0.025 + Math.random() * 0.02, grav: false
    });
  }
}

function spawnDoorLockOpenFx(d) {
  if (!L) return;
  var w = d.doorWide ? L.bw * 2 + L.bg : L.bw;
  var cx = d.x + w / 2;
  var cy = d.y + L.bh / 2;
  for (var i = 0; i < 18; i++) {
    var ang = Math.PI * 2 * i / 18 + Math.random() * 0.25;
    var sp = 2 + Math.random() * 3;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * sp * S,
      vy: Math.sin(ang) * sp * S,
      r: (2 + Math.random() * 2.5) * S,
      color: 'rgba(255,215,100,0.92)',
      life: 1, decay: 0.018 + Math.random() * 0.012, grav: false
    });
  }
}

function tickDoors() {
  for (var i = 0; i < stock.length; i++) {
    var d = stock[i];
    if (!d || !d.isDoor) continue;
    if (d.doorAnimT > 0) d.doorAnimT = Math.max(0, d.doorAnimT - 0.04);
  }
}

// Called after initGame finishes its first reveal pass. If the level
// starts with a door closed in a way that orphans all boxes, force-open
// any closed doors that are needed and lock them open.
function checkInitialDoorSoftlock() {
  if (!stock || stock.length === 0 || !L) return;

  function anyTappable() {
    for (var i = 0; i < stock.length; i++) {
      if (typeof isBoxTappable === 'function' && isBoxTappable(i)) return true;
    }
    return false;
  }
  function anyActiveBoxesOrTunnels() {
    for (var i = 0; i < stock.length; i++) {
      var b = stock[i];
      if (!b) continue;
      if (b.isWall || b.isTunnel || b.isDoor || b.isDoorPart) continue;
      if (!b.empty && !b.used) return true;
    }
    for (var i = 0; i < stock.length; i++) {
      var b = stock[i];
      if (b && b.isTunnel && b.tunnelContents && b.tunnelContents.length > 0) return true;
    }
    return false;
  }

  if (anyTappable() || !anyActiveBoxesOrTunnels()) return;

  // Open every initially-closed door and lock it. Then re-evaluate
  // reveals. If at least one box is now tappable, keep the locks; else
  // restore the original closed states (something else is wrong).
  var touched = [];
  for (var i = 0; i < stock.length; i++) {
    var d = stock[i];
    if (!d || !d.isDoor) continue;
    if (!d.doorClosed) continue;
    d.doorClosed = false;
    touched.push(d);
  }
  if (touched.length === 0) return;
  if (typeof updateBoxReveals === 'function') updateBoxReveals(false);
  if (anyTappable()) {
    for (var k = 0; k < touched.length; k++) {
      touched[k].doorOpenLocked = true;
      touched[k].doorAnimT = 0;
    }
  } else {
    // No tappable boxes even with all doors open — leave doors as-is.
    for (var k = 0; k < touched.length; k++) {
      touched[k].doorClosed = true;
    }
    if (typeof updateBoxReveals === 'function') updateBoxReveals(false);
  }
}

// ── Drawing ──

function drawDoorOnGrid(ctx, x, y, w, h, S, d) {
  ctx.save();

  // Recessed dark interior
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetY = 2 * S;
  var bgGrad = ctx.createLinearGradient(x, y, x, y + h);
  bgGrad.addColorStop(0, '#3D4452');
  bgGrad.addColorStop(0.55, '#2F3540');
  bgGrad.addColorStop(1, '#262B33');
  ctx.fillStyle = bgGrad;
  rRect(x, y, w, h, 6 * S); ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Clip everything inside the rounded frame
  ctx.save();
  ctx.beginPath();
  rRect(x, y, w, h, 6 * S);
  ctx.clip();

  var frameInset = 2.5 * S;
  var trackW = 4 * S;

  // Side tracks (vertical rails)
  var trackGrad = ctx.createLinearGradient(0, 0, trackW * 2, 0);
  trackGrad.addColorStop(0, '#1A1E26');
  trackGrad.addColorStop(0.5, '#4A5566');
  trackGrad.addColorStop(1, '#1A1E26');

  ctx.save();
  ctx.translate(x + frameInset, 0);
  ctx.fillStyle = trackGrad;
  ctx.fillRect(0, y + frameInset, trackW, h - frameInset * 2);
  ctx.restore();

  ctx.save();
  ctx.translate(x + w - frameInset - trackW, 0);
  ctx.fillStyle = trackGrad;
  ctx.fillRect(0, y + frameInset, trackW, h - frameInset * 2);
  ctx.restore();

  // Top header (where the panel hides when open)
  var topH = 7 * S;
  var thGrad = ctx.createLinearGradient(x, y, x, y + topH);
  thGrad.addColorStop(0, '#606A80');
  thGrad.addColorStop(1, '#2D3340');
  ctx.fillStyle = thGrad;
  ctx.fillRect(x + frameInset, y + frameInset, w - frameInset * 2, topH);

  // Floor strip (counter sits here)
  var floorH = Math.max(11 * S, h * 0.18);
  var flGrad = ctx.createLinearGradient(x, y + h - floorH, x, y + h);
  flGrad.addColorStop(0, '#1E232C');
  flGrad.addColorStop(1, '#3A4252');
  ctx.fillStyle = flGrad;
  ctx.fillRect(x + frameInset, y + h - frameInset - floorH, w - frameInset * 2, floorH);

  // Floor shine
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x + frameInset, y + h - frameInset - floorH, w - frameInset * 2, 1.2 * S);

  // ── Sliding panel ──
  var innerTop = y + frameInset + topH;
  var innerBot = y + h - frameInset - floorH;
  var travelRange = innerBot - innerTop;
  var panelMinH = Math.max(6 * S, travelRange * 0.18);
  var panelMaxH = travelRange;

  // doorAnimT counts down from 1 → 0 after a toggle.
  // The panel eases from the prior settled height to the new one.
  var targetH = d.doorClosed ? panelMaxH : panelMinH;
  var fromH   = d.doorClosed ? panelMinH : panelMaxH;
  var prog = 1 - d.doorAnimT;            // 0..1 toward settled
  var eased = 1 - Math.pow(1 - prog, 3);
  var panelH = fromH + (targetH - fromH) * eased;

  var panelX = x + frameInset + trackW;
  var panelW = w - frameInset * 2 - trackW * 2;
  var panelTop = innerBot - panelH;

  var locked = !!d.doorOpenLocked;

  // Panel body
  var panelGrad = ctx.createLinearGradient(panelX, panelTop, panelX, panelTop + panelH);
  if (locked) {
    panelGrad.addColorStop(0, '#F2CE6B');
    panelGrad.addColorStop(0.55, '#D9A93D');
    panelGrad.addColorStop(1, '#A87820');
  } else {
    panelGrad.addColorStop(0, '#94A0B8');
    panelGrad.addColorStop(0.55, '#5E6A7E');
    panelGrad.addColorStop(1, '#3B4456');
  }
  ctx.fillStyle = panelGrad;
  ctx.fillRect(panelX, panelTop, panelW, panelH);

  // Panel top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(panelX, panelTop, panelW, 1.5 * S);

  // Panel bottom shadow lip
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(panelX, panelTop + panelH - 1.5 * S, panelW, 1.5 * S);

  // Rivets on the panel (only render those inside current panel)
  var rivetR = 2 * S;
  var rivetMargin = 5 * S;
  if (panelH > rivetMargin * 2 + rivetR) {
    var rivetXs = [panelX + rivetMargin, panelX + panelW - rivetMargin];
    if (d.doorWide) {
      // Two extra rivets near the center of a wide door panel
      rivetXs.push(panelX + panelW * 0.36);
      rivetXs.push(panelX + panelW * 0.64);
    }
    var rivetYs = [panelTop + rivetMargin, panelTop + panelH - rivetMargin];
    for (var ri = 0; ri < rivetXs.length; ri++) {
      for (var rj = 0; rj < rivetYs.length; rj++) {
        var rx = rivetXs[ri], ry = rivetYs[rj];
        ctx.fillStyle = 'rgba(20,25,35,0.7)';
        ctx.beginPath(); ctx.arc(rx, ry, rivetR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(rx - rivetR * 0.35, ry - rivetR * 0.35, rivetR * 0.45, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Center grip groove
  if (panelH > 14 * S) {
    var grY = panelTop + panelH * 0.5;
    ctx.fillStyle = 'rgba(20,25,35,0.55)';
    ctx.fillRect(panelX + panelW * 0.22, grY - 1 * S, panelW * 0.56, 2.2 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(panelX + panelW * 0.22, grY - 1 * S, panelW * 0.56, 0.7 * S);
  }

  // Warning telegraph on the last turn before the next toggle
  if (!locked && d.doorTurnsLeft <= 1 && d.doorAnimT <= 0.001) {
    var pulse = (Math.sin(tick * 0.18) * 0.5 + 0.5);
    if (d.doorClosed) {
      // Door about to open — soft cyan
      ctx.fillStyle = 'rgba(120,220,255,' + (pulse * 0.32) + ')';
    } else {
      // Door about to close — soft red
      ctx.fillStyle = 'rgba(255,90,90,' + (pulse * 0.42) + ')';
    }
    ctx.fillRect(panelX, panelTop, panelW, panelH);
  }

  ctx.restore(); // end clip

  // Frame border (outside clip)
  ctx.strokeStyle = locked ? 'rgba(190,140,40,0.7)' : 'rgba(40,46,56,0.85)';
  ctx.lineWidth = 1.6 * S;
  rRect(x + 0.8 * S, y + 0.8 * S, w - 1.6 * S, h - 1.6 * S, 5.5 * S);
  ctx.stroke();

  // Locked-open golden glow
  if (locked) {
    var lockPulse = Math.sin(tick * 0.05) * 0.15 + 0.5;
    ctx.strokeStyle = 'rgba(255,215,100,' + lockPulse * 0.5 + ')';
    ctx.lineWidth = 2.2 * S;
    rRect(x + 0.8 * S, y + 0.8 * S, w - 1.6 * S, h - 1.6 * S, 5.5 * S);
    ctx.stroke();
  }

  // ── Counter badge on the floor ──
  var counterCx = x + w / 2;
  var counterCy = y + h - frameInset - floorH / 2;
  var counterR = Math.min(floorH * 0.42, w * 0.13, 12 * S);

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 3 * S;
  ctx.shadowOffsetY = 1 * S;

  if (locked) {
    ctx.fillStyle = 'rgba(255,215,100,0.96)';
    ctx.beginPath(); ctx.arc(counterCx, counterCy, counterR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(140,100,40,0.7)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(counterCx, counterCy, counterR, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#5A3A10';
    ctx.font = 'bold ' + (counterR * 1.6) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('∞', counterCx, counterCy + counterR * 0.05);
  } else {
    var badgeFill = d.doorClosed ? 'rgba(120,220,255,0.96)' : 'rgba(255,180,60,0.96)';
    var badgeStroke = d.doorClosed ? 'rgba(40,100,140,0.65)' : 'rgba(180,110,30,0.65)';
    ctx.fillStyle = badgeFill;
    ctx.beginPath(); ctx.arc(counterCx, counterCy, counterR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = badgeStroke;
    ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(counterCx, counterCy, counterR, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (counterR * 1.4) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(d.doorTurnsLeft), counterCx, counterCy + counterR * 0.05);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.restore();
}

// ── Audio (attach to sfx after audio.js has loaded) ──
if (typeof sfx === 'object') {
  sfx.doorClose = function () {
    if (!audioCtx) return;
    tone(180, 0.16, 'square', 0.06, 90);
    setTimeout(function () { tone(120, 0.12, 'square', 0.05, 70); }, 70);
  };
  sfx.doorOpen = function () {
    if (!audioCtx) return;
    tone(220, 0.14, 'sine', 0.05, 520);
    setTimeout(function () { tone(420, 0.1, 'sine', 0.04, 700); }, 80);
  };
  sfx.doorLock = function () {
    if (!audioCtx) return;
    [523, 659, 880].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.18, 'triangle', 0.08); }, i * 90);
    });
  };
}
