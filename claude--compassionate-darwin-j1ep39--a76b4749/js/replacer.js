// ============================================================
// replacer.js — Box Replacer mechanic
// A 1-cell cover that hides one box underneath. Has a fixed color
// and a counter. Each time a box of that color is played anywhere
// on the board, the counter decreases by 1 and a fresh Normal box
// of that color materializes in the exact cell that was just
// tapped. When the counter hits 0, the cover is removed and the
// box hidden underneath becomes accessible.
// ============================================================

var REPLACER_REMOVE_FRAMES = 38;     // frames to play the lift/reveal anim
var REPLACER_SPAWN_FRAMES  = 36;     // frames for the flying marble + pop-in
var replacerSpawnAnims = [];

// ── Drawing: the single-cell cover ──
function drawReplacerCover(ctx, primary, S, tick) {
  if (!primary || !primary.isReplacer) return;
  var x = primary.x, y = primary.y, w = L.bw, h = L.bh;

  // Lift/exit animation
  var liftAlpha = 1, liftScale = 1, liftDy = 0;
  if (primary.replacerRemovingT > 0) {
    var t = 1 - primary.replacerRemovingT;
    liftAlpha = Math.max(0, 1 - t);
    liftScale = 1 + t * 0.18;
    liftDy = -t * 22 * S;
  }

  // Shake
  var ox = 0;
  if (primary.replacerShakeT > 0) {
    ox = Math.sin(primary.replacerShakeT * 28) * 4 * S * primary.replacerShakeT;
  }

  ctx.save();
  ctx.globalAlpha = liftAlpha;
  ctx.translate(x + w / 2 + ox, y + h / 2 + liftDy);
  ctx.scale(liftScale, liftScale);
  var px = -w / 2, py = -h / 2;

  // Base slate plate
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 3 * S;
  var grad = ctx.createLinearGradient(px, py, px, py + h);
  grad.addColorStop(0, '#52525E');
  grad.addColorStop(0.5, '#3F3F4A');
  grad.addColorStop(1, '#2C2C36');
  ctx.fillStyle = grad;
  rRect(px, py, w, h, 7 * S);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Inner bevel
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1.5 * S;
  rRect(px + 2 * S, py + 2 * S, w - 4 * S, h - 4 * S, 5 * S);
  ctx.stroke();

  // Colored band stripe along the bottom (reads the color at a glance)
  var c = COLORS[primary.replacerCi];
  ctx.save();
  ctx.beginPath();
  rRect(px, py, w, h, 7 * S);
  ctx.clip();
  var bandH = h * 0.22;
  var bandY = py + h - bandH;
  var bg = ctx.createLinearGradient(px, bandY, px, bandY + bandH);
  bg.addColorStop(0, c.fill);
  bg.addColorStop(1, c.dark);
  ctx.fillStyle = bg;
  ctx.fillRect(px, bandY, w, bandH);
  // notched edge
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  var notchW = 3 * S;
  for (var nx = px; nx < px + w; nx += notchW * 2) {
    ctx.fillRect(nx, bandY - 1 * S, notchW, 1.5 * S);
  }
  ctx.restore();

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5 * S;
  rRect(px, py, w, h, 7 * S);
  ctx.stroke();

  // Flash overlay on tick beat
  if (primary.replacerFlashT > 0) {
    ctx.save();
    ctx.globalAlpha = primary.replacerFlashT * 0.55;
    var flashGrad = ctx.createLinearGradient(px, py, px, py + h);
    flashGrad.addColorStop(0, c.light);
    flashGrad.addColorStop(1, c.fill);
    ctx.fillStyle = flashGrad;
    rRect(px, py, w, h, 7 * S);
    ctx.fill();
    ctx.restore();
  }

  // Counter (big, centered slightly above middle to leave room for the band)
  var counterScale = 1 + primary.replacerCounterPopT * 0.45;
  ctx.save();
  ctx.translate(0, -h * 0.08);
  ctx.scale(counterScale, counterScale);
  var fontPx = h * 0.52;
  ctx.font = 'bold ' + fontPx + 'px "Fredoka", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('' + primary.replacerCount, 0, 2 * S);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('' + primary.replacerCount, 0, 0);
  ctx.restore();

  // Small marble icon in the top-right corner
  var mr = h * 0.14;
  var icx = w / 2 - mr * 1.4;
  var icy = -h / 2 + mr * 1.4;
  drawMarble(icx, icy, mr, primary.replacerCi);

  // Corner pegs
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  var pegR = 2 * S;
  ctx.beginPath(); ctx.arc(px + 5 * S, py + 5 * S, pegR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + w - 5 * S, py + 5 * S, pegR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + 5 * S, py + h - 5 * S, pegR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + w - 5 * S, py + h - 5 * S, pegR, 0, Math.PI * 2); ctx.fill();

  // Idle pulse halo for the matching color
  if (primary.replacerCount > 0 && primary.replacerRemovingT <= 0) {
    var pulse = 0.10 + Math.sin(tick * 0.05 + primary.replacerIdlePhase) * 0.05;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = c.glow;
    ctx.lineWidth = 3 * S;
    rRect(px + 1 * S, py + 1 * S, w - 2 * S, h - 2 * S, 7 * S);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawAllReplacerCovers() {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (s && s.isReplacer) drawReplacerCover(ctx, s, S, tick);
  }
}

// ── Fly-out animation (marble flying from cover to the tapped cell,
//    then hovering at the cell until it's free) ──
function drawReplacerSpawnAnims() {
  var mr = 7 * S * cal.marble.s;
  for (var i = 0; i < replacerSpawnAnims.length; i++) {
    var a = replacerSpawnAnims[i];
    if (a.t < REPLACER_SPAWN_FRAMES) {
      var t = a.t / REPLACER_SPAWN_FRAMES;
      if (t < 0) t = 0; if (t > 1) t = 1;
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var x = a.startX + (a.endX - a.startX) * e;
      var y = a.startY + (a.endY - a.startY) * e - Math.sin(t * Math.PI) * 40 * S;
      var sc = 1 + Math.sin(t * Math.PI) * 0.25;
      if (tick % 3 === 0) {
        particles.push({
          x: x, y: y, vx: (Math.random() - 0.5) * 0.6 * S, vy: 0.4 * S,
          r: (2 + Math.random() * 2) * S, color: COLORS[a.ci].light,
          life: 0.6, decay: 0.04, grav: false
        });
      }
      drawMarble(x, y, mr, a.ci, sc);
    } else {
      var h = a.holdT || 0;
      var bob = Math.sin(h * 0.12) * 3 * S;
      var pulse = 1 + Math.sin(h * 0.18) * 0.15;
      var x2 = a.endX;
      var y2 = a.endY + bob;
      ctx.save();
      ctx.globalAlpha = 0.85;
      var hg = ctx.createRadialGradient(x2, y2, 0, x2, y2, mr * 2.4);
      hg.addColorStop(0, COLORS[a.ci].glow);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(x2, y2, mr * 2.4 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawMarble(x2, y2, mr, a.ci, pulse);
      if (tick % 6 === 0) {
        particles.push({
          x: x2, y: y2, vx: (Math.random() - 0.5) * 0.4 * S, vy: -0.3 * S,
          r: (1.5 + Math.random() * 2) * S, color: COLORS[a.ci].light,
          life: 0.5, decay: 0.05, grav: false
        });
      }
    }
  }
}

// ── Trigger replacers when a colored box is played ──
// The replacement box always spawns at exactly the cell of the tapped
// box, so the player sees "the box I just played has been refilled
// with the same color".
function notifyReplacers(playedCi, originIdx) {
  if (playedCi < 0 || playedCi >= NUM_COLORS) return;
  if (originIdx === undefined || originIdx < 0 || originIdx >= stock.length) return;
  var origin = stock[originIdx];
  if (!origin || origin.isReplacer || origin.isTunnel || origin.isWall) return;

  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s || !s.isReplacer) continue;
    if (s.replacerCount <= 0) continue;
    if (s.replacerRemovingT > 0) continue;
    if (s.replacerCi !== playedCi) continue;

    s.replacerCount--;
    s.replacerShakeT = 0.6;
    s.replacerFlashT = 0.9;
    s.replacerCounterPopT = 1.0;

    var cx = s.x + L.bw / 2;
    var cy = s.y + L.bh / 2;

    replacerSpawnAnims.push({
      ci: s.replacerCi,
      startX: cx, startY: cy,
      endX: origin.x + L.bw / 2,
      endY: origin.y + L.bh / 2,
      endIdx: originIdx,
      t: 0,
      holdT: 0
    });

    var bc = COLORS[s.replacerCi];
    for (var p = 0; p < 12; p++) {
      var ang = Math.PI * 2 * p / 12 + Math.random() * 0.3;
      var sp = 2 + Math.random() * 3;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * sp * S, vy: Math.sin(ang) * sp * S,
        r: (2 + Math.random() * 3) * S, color: bc.glow,
        life: 0.8, decay: 0.03 + Math.random() * 0.02, grav: false
      });
    }
    if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();

    if (s.replacerCount <= 0) {
      s.replacerRemovingT = 1.0;
    }
  }
}

function materializeReplacerBox(ci, targetIdx) {
  var tgt = stock[targetIdx];
  if (!tgt) return;
  if (tgt.isReplacer || tgt.isTunnel || tgt.isWall) return;
  if (!(tgt.empty || tgt.used)) return;

  var row = Math.floor(targetIdx / L.cols);
  var col = targetIdx % L.cols;
  stock[targetIdx] = {
    ci: ci,
    used: false,
    remaining: MRB_PER_BOX,
    spawning: false,
    spawnIdx: 0,
    revealed: false,
    empty: false,
    boxType: 'default',
    iceHP: 0,
    iceCrackT: 0,
    iceShatterT: 0,
    blockerCount: 0,
    isTunnel: false,
    isWall: false,
    isReplacer: false,
    x: L.sx + col * (L.bw + L.bg),
    y: L.sy + row * (L.bh + L.bg),
    shakeT: 0,
    hoverT: 0,
    popT: 1.0,
    revealT: 0,
    emptyT: 0,
    idlePhase: Math.random() * Math.PI * 2
  };

  spawnBurst(stock[targetIdx].x + L.bw / 2, stock[targetIdx].y + L.bh / 2, COLORS[ci].fill, 14);
  if (typeof sfx !== 'undefined' && sfx.drop) sfx.drop();
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

function finalizeReplacerRemoval(primaryIdx) {
  var s = stock[primaryIdx];
  if (!s || !s.isReplacer) return;
  var covered = s.replacerCovered || null;

  var cx = s.x + L.bw / 2;
  var cy = s.y + L.bh / 2;
  spawnBurst(cx, cy, COLORS[s.replacerCi].fill, 24);
  spawnConfetti(cx, cy, 18);
  if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();

  stock[primaryIdx] = makeStockCellFromCovered(primaryIdx, covered);
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

function makeStockCellFromCovered(idx, coveredObj) {
  var row = Math.floor(idx / L.cols);
  var col = idx % L.cols;
  var x = L.sx + col * (L.bw + L.bg);
  var y = L.sy + row * (L.bh + L.bg);

  if (!coveredObj) {
    return {
      ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
      revealed: true, empty: true, boxType: 'default',
      isTunnel: false, isWall: false, isReplacer: false,
      iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
      x: x, y: y, shakeT: 0, hoverT: 0, popT: 0,
      revealT: 0, emptyT: 0, idlePhase: 0
    };
  }
  var isIce = (coveredObj.type === 'ice');
  var isBlocker = (coveredObj.type === 'blocker');
  return {
    ci: coveredObj.ci,
    used: false,
    remaining: MRB_PER_BOX,
    spawning: false,
    spawnIdx: 0,
    revealed: isIce ? true : false,
    empty: false,
    boxType: coveredObj.type || 'default',
    isTunnel: false, isWall: false, isReplacer: false,
    iceHP: isIce ? 2 : 0,
    iceCrackT: 0,
    iceShatterT: 0,
    blockerCount: isBlocker ? BLOCKER_PER_BOX : 0,
    x: x, y: y,
    shakeT: 0, hoverT: 0, popT: 0.9,
    revealT: 0, emptyT: 0,
    idlePhase: Math.random() * Math.PI * 2
  };
}

function updateReplacers() {
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s || !s.isReplacer) continue;
    if (s.replacerShakeT > 0) s.replacerShakeT = Math.max(0, s.replacerShakeT - 0.05);
    if (s.replacerFlashT > 0) s.replacerFlashT = Math.max(0, s.replacerFlashT - 0.05);
    if (s.replacerCounterPopT > 0) s.replacerCounterPopT = Math.max(0, s.replacerCounterPopT - 0.04);
    if (s.replacerRemovingT > 0) {
      s.replacerRemovingT = Math.max(0, s.replacerRemovingT - (1 / REPLACER_REMOVE_FRAMES));
      if (s.replacerRemovingT <= 0) {
        finalizeReplacerRemoval(i);
      }
    }
  }
  for (var k = replacerSpawnAnims.length - 1; k >= 0; k--) {
    var a = replacerSpawnAnims[k];
    if (a.t < REPLACER_SPAWN_FRAMES) {
      a.t++;
      continue;
    }
    var tgt = stock[a.endIdx];
    var ready = tgt && (tgt.empty || tgt.used) &&
                !tgt.isReplacer && !tgt.isTunnel && !tgt.isWall;
    if (ready) {
      materializeReplacerBox(a.ci, a.endIdx);
      replacerSpawnAnims.splice(k, 1);
      continue;
    }
    a.holdT++;
    if (a.holdT > 600) replacerSpawnAnims.splice(k, 1);
  }
}

// Count marbles contributed by a replacer at level start: count * MRB_PER_BOX
// of its color (spawned) plus its single covered box (if any).
function countReplacerMarbles(replacerObj, outCounts, outBlockerTotalRef) {
  var count = replacerObj.count || 0;
  var ci = replacerObj.ci;
  outCounts[ci] += count * MRB_PER_BOX;
  var co = replacerObj.covered;
  if (co) {
    var isBlockerCov = (co.type === 'blocker');
    var regularPerBox = isBlockerCov ? (MRB_PER_BOX - BLOCKER_PER_BOX) : MRB_PER_BOX;
    outCounts[co.ci] += regularPerBox;
    if (isBlockerCov) outBlockerTotalRef.v += BLOCKER_PER_BOX;
  }
}
