// ============================================================
// crane.js — Crane mechanic
//
// A crane occupies one grid cell. It holds no marbles of its own.
// When played it reads the first two rows of customers, works out
// which colour is wanted most, finds an existing box of that colour
// somewhere else in the grid, lifts it out and sets it down in the
// crane's own cell. The source cell is left empty.
//
// Zero-sum: no marbles are created or destroyed, a box is only moved.
//
// Playability follows the same rule as a normal box — the crane must
// have a path of passable cells to the bottom of the grid. Playing
// the crane does NOT crack adjacent ice; playing the box it drops off
// does (that happens for free via the normal handleTap path).
// ============================================================

var CRANE_CUSTOMER_ROWS = 2;   // how many customer rows the crane reads
var CRANE_CARRY_TICKS = 34;    // length of the lift animation

// ── Customer reading ──

// The nth visible customer box in a sort column (0 = the one being
// served right now). Returns null when the column is that short.
function craneVisibleCustomer(colIdx, row) {
  var col = sortCols[colIdx];
  if (!col) return null;
  var seen = 0;
  for (var r = 0; r < col.length; r++) {
    if (!col[r].vis) continue;
    if (seen === row) return col[r];
    seen++;
  }
  return null;
}

// Colours wanted across the first CRANE_CUSTOMER_ROWS rows, most
// wanted first. Ties keep reading order: top row left to right, then
// the row below. Lock buttons and blocker grey are ignored.
function craneWantedColors() {
  var counts = [];
  for (var c = 0; c < NUM_COLORS; c++) counts.push(0);
  var order = [];
  for (var row = 0; row < CRANE_CUSTOMER_ROWS; row++) {
    for (var col = 0; col < sortCols.length; col++) {
      var box = craneVisibleCustomer(col, row);
      if (!box) continue;
      if (box.type === 'lock') continue;
      if (box.ci < 0 || box.ci >= NUM_COLORS) continue;
      if (counts[box.ci] === 0) order.push(box.ci);
      counts[box.ci]++;
    }
  }
  order.sort(function (a, b) { return counts[b] - counts[a]; });
  return order;
}

// ── Target picking ──

// Can this box be lifted by a crane?
function craneIsLiftable(idx, craneIdx) {
  if (idx === craneIdx) return false;
  var s = stock[idx];
  if (!s) return false;
  if (s.isTunnel || s.isWall || s.isCrane) return false;
  if (s.empty || s.used || s.spawning) return false;
  if (s.remaining <= 0) return false;
  // Iced boxes are frozen in place — the hook can't grip them. They have
  // to be cracked where they stand.
  if (s.iceHP > 0) return false;
  // The crane can only take a box whose colour it can see, so a hidden
  // box is off-limits until it has been revealed.
  if (s.boxType === 'hidden' && !s.revealed) return false;
  return true;
}

// Which box this crane would lift right now, or -1 if there is
// nothing worth fetching. Prefers boxes the player cannot currently
// reach, then the closest one to the crane.
function cranePickTarget(craneIdx) {
  if (!stock || !L || !L.cols) return -1;
  var wanted = craneWantedColors();
  var cr = Math.floor(craneIdx / L.cols), cc = craneIdx % L.cols;
  for (var w = 0; w < wanted.length; w++) {
    var ci = wanted[w];
    var best = -1, bestBuried = -1, bestDist = Infinity;
    for (var i = 0; i < stock.length; i++) {
      if (!craneIsLiftable(i, craneIdx)) continue;
      if (stock[i].ci !== ci) continue;
      var buried = isBoxTappable(i) ? 0 : 1;
      var dist = Math.abs(Math.floor(i / L.cols) - cr) + Math.abs((i % L.cols) - cc);
      if (buried > bestBuried || (buried === bestBuried && dist < bestDist)) {
        bestBuried = buried; bestDist = dist; best = i;
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// Refresh the live preview on every crane. Runs once per frame so the
// hook marble and the target highlight always show the current pick.
function updateCranePreviews() {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s || !s.isCrane) continue;
    if (s.craneLifting || !s.revealed) {
      s.craneTarget = -1; s.cranePreviewCi = -1;
      continue;
    }
    var t = cranePickTarget(i);
    s.craneTarget = t;
    s.cranePreviewCi = (t >= 0) ? stock[t].ci : -1;
  }
}

// ── Activation ──

function craneMakeEmptyCell(idx) {
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  return {
    ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
    revealed: true, empty: true, boxType: 'default',
    isTunnel: false, isWall: false, isCrane: false,
    iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
    x: L.sx + col * (L.bw + L.bg), y: L.sy + row * (L.bh + L.bg),
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
  };
}

function craneActivate(idx) {
  var crane = stock[idx];
  var target = cranePickTarget(idx);
  if (target < 0) {
    // Nothing worth fetching — refuse the tap.
    crane.shakeT = 0.5;
    sfx.drop();
    return;
  }

  var src = stock[target];
  crane.craneLifting = true;
  crane.popT = 1;
  crane.craneTarget = -1;
  crane.cranePreviewCi = -1;
  sfx.pop();

  craneCarries.push({
    ci: src.ci,
    // A revealed hidden box travels as a plain box — its colour is known now
    boxType: (src.boxType === 'hidden') ? 'default' : (src.boxType || 'default'),
    remaining: src.remaining,
    iceHP: src.iceHP || 0,
    blockerCount: src.blockerCount || 0,
    fromX: src.x, fromY: src.y,
    toX: crane.x, toY: crane.y,
    destIdx: idx,
    t: 0
  });

  spawnBurst(src.x + L.bw / 2, src.y + L.bh / 2, COLORS[src.ci].light, 14);

  // The box leaves its cell right away, so that cell opens up.
  stock[target] = craneMakeEmptyCell(target);
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

function craneLandCarry(c) {
  var idx = c.destIdx;
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  stock[idx] = {
    ci: c.ci,
    used: false,
    remaining: c.remaining,
    spawning: false,
    spawnIdx: MRB_PER_BOX - c.remaining,
    // Start closed; updateBoxReveals opens it if this cell has a path
    // to the bottom of the grid.
    revealed: false,
    empty: false,
    boxType: c.boxType,
    isTunnel: false, isWall: false, isCrane: false,
    iceHP: c.iceHP, iceCrackT: 0, iceShatterT: 0,
    blockerCount: c.blockerCount,
    x: L.sx + col * (L.bw + L.bg), y: L.sy + row * (L.bh + L.bg),
    shakeT: 0, hoverT: 0, popT: 0.9, revealT: 0, emptyT: 0,
    idlePhase: Math.random() * Math.PI * 2
  };

  var bx = stock[idx].x + L.bw / 2, by = stock[idx].y + L.bh / 2;
  sfx.complete();
  spawnBurst(bx, by, COLORS[c.ci].fill, 16);
  for (var p = 0; p < 10; p++) {
    var a = Math.PI + Math.random() * Math.PI;
    var sp = 1.5 + Math.random() * 2.5;
    particles.push({
      x: bx + (Math.random() - 0.5) * L.bw * 0.7, y: by + L.bh * 0.4,
      vx: Math.cos(a) * sp * S * 0.6, vy: -Math.abs(Math.sin(a)) * sp * S * 0.5,
      r: (2 + Math.random() * 3) * S, color: 'rgba(190,180,165,0.7)',
      life: 0.8, decay: 0.03 + Math.random() * 0.02, grav: false
    });
  }

  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

function updateCraneCarries() {
  for (var i = craneCarries.length - 1; i >= 0; i--) {
    var c = craneCarries[i];
    c.t += 1 / CRANE_CARRY_TICKS;
    if (c.t >= 1) {
      craneLandCarry(c);
      craneCarries.splice(i, 1);
    }
  }
}

// ── Drawing ──

// The crane cell itself. Called from drawStock inside a transform
// centred on the cell, so x/y are the cell's top-left in local space.
function drawCraneOnGrid(ctx, x, y, w, h, S, tick, previewCi, playable, lifting, idlePhase) {
  ctx.save();
  if (!playable && !lifting) ctx.globalAlpha = 0.82;

  // Steel body
  ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#4A5866');
  grad.addColorStop(0.55, '#36414E');
  grad.addColorStop(1, '#232C36');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Hazard stripe along the bottom
  ctx.save();
  ctx.beginPath(); rRect(x, y, w, h, 6 * S); ctx.clip();
  var stripeH = h * 0.15;
  var stripeY = y + h - stripeH;
  ctx.fillStyle = 'rgba(255,194,74,0.8)';
  ctx.fillRect(x, stripeY, w, stripeH);
  ctx.fillStyle = 'rgba(28,34,42,0.85)';
  var sw = w * 0.17;
  for (var d = -1; d < w / sw + 1; d++) {
    ctx.beginPath();
    ctx.moveTo(x + d * sw, y + h);
    ctx.lineTo(x + d * sw + sw * 0.5, y + h);
    ctx.lineTo(x + d * sw + sw * 0.5 + stripeH, stripeY);
    ctx.lineTo(x + d * sw + stripeH, stripeY);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // Border — amber and breathing when the crane can be played
  if (playable) {
    ctx.strokeStyle = 'rgba(255,194,74,' + (0.55 + Math.sin(tick * 0.06 + idlePhase) * 0.2) + ')';
  } else {
    ctx.strokeStyle = 'rgba(120,132,146,0.5)';
  }
  ctx.lineWidth = 2 * S;
  rRect(x, y, w, h, 6 * S); ctx.stroke();

  // Gantry beam + legs
  var beamY = y + h * 0.25;
  ctx.strokeStyle = 'rgba(205,215,225,0.72)';
  ctx.lineWidth = 2.2 * S; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + w * 0.13, beamY); ctx.lineTo(x + w * 0.87, beamY); ctx.stroke();
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.moveTo(x + w * 0.19, beamY); ctx.lineTo(x + w * 0.26, y + h * 0.52); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w * 0.81, beamY); ctx.lineTo(x + w * 0.74, y + h * 0.52); ctx.stroke();

  // Cable + hook, swaying while idle, extended while lifting
  var sway = playable ? Math.sin(tick * 0.045 + idlePhase) * w * 0.05 : 0;
  var hookX = x + w * 0.5 + sway;
  var hookY = beamY + (lifting ? h * 0.4 : h * 0.24);
  ctx.strokeStyle = 'rgba(215,225,235,0.55)';
  ctx.lineWidth = 1.2 * S;
  ctx.beginPath(); ctx.moveTo(x + w * 0.5, beamY); ctx.lineTo(hookX, hookY); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,194,74,0.85)';
  ctx.lineWidth = 1.8 * S;
  ctx.beginPath(); ctx.arc(hookX, hookY + 1.5 * S, w * 0.055, Math.PI * 0.15, Math.PI * 0.95); ctx.stroke();

  // The marble it would fetch right now
  if (playable && previewCi >= 0) {
    var mr = Math.min(w * 0.17, 9 * S);
    ctx.save();
    ctx.shadowColor = COLORS[previewCi].glow;
    ctx.shadowBlur = 8 * S;
    drawMarble(hookX, hookY + mr + 2 * S, mr, previewCi);
    ctx.restore();
  } else if (playable) {
    // Playable but nothing to fetch — empty hook
    ctx.strokeStyle = 'rgba(200,210,220,0.3)';
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.arc(hookX, hookY + w * 0.19, w * 0.13, 0, Math.PI * 2); ctx.stroke();
  }

  // Dormant crane (no path to the bottom yet) reads as switched off
  if (!playable && !lifting) {
    ctx.fillStyle = 'rgba(18,24,30,0.45)';
    rRect(x, y, w, h, 6 * S); ctx.fill();
  }

  ctx.restore();
}

// Boxes currently in flight between their old cell and the crane.
function drawCraneCarries() {
  for (var i = 0; i < craneCarries.length; i++) {
    var c = craneCarries[i];
    var t = Math.max(0, Math.min(1, c.t));
    var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    var bx = c.fromX + (c.toX - c.fromX) * e;
    var by = c.fromY + (c.toY - c.fromY) * e - Math.sin(t * Math.PI) * L.bh * 0.55;
    var cx2 = bx + L.bw / 2, cy2 = by + L.bh / 2;

    // Cable running up out of the grid
    ctx.save();
    ctx.strokeStyle = 'rgba(215,225,235,0.45)';
    ctx.lineWidth = 1.4 * S;
    ctx.beginPath();
    ctx.moveTo(cx2, L.sy - L.bh * 0.45);
    ctx.lineTo(cx2, cy2 - L.bh * 0.35);
    ctx.stroke();
    ctx.restore();

    var sc = 0.86 + Math.sin(t * Math.PI) * 0.1;
    ctx.save();
    ctx.translate(cx2, cy2);
    ctx.rotate(Math.sin(t * Math.PI * 2 + 0.5) * 0.05);
    ctx.scale(sc, sc);
    drawBox(-L.bw / 2, -L.bh / 2, L.bw, L.bh, c.ci);
    if (c.remaining > 0) {
      if (c.boxType === 'blocker' && c.blockerCount > 0) {
        drawBoxMarblesWithBlockers(c.ci, c.remaining, c.blockerCount);
      } else {
        drawBoxMarbles(c.ci, c.remaining);
      }
      drawBoxLip(c.ci);
    }
    if (c.iceHP > 0) {
      var iceType = getBoxType('ice');
      if (iceType && iceType.drawIceOverlay) {
        iceType.drawIceOverlay(ctx, -L.bw / 2, -L.bh / 2, L.bw, L.bh, S, c.iceHP, tick);
      }
    }
    ctx.restore();

    if (tick % 4 === 0) {
      particles.push({
        x: cx2 + (Math.random() - 0.5) * L.bw * 0.5,
        y: cy2 + L.bh * 0.4,
        vx: (Math.random() - 0.5) * 0.6 * S, vy: 0.6 * S,
        r: (1.5 + Math.random() * 2) * S, color: 'rgba(200,190,175,0.6)',
        life: 0.6, decay: 0.045, grav: false
      });
    }
  }
}
