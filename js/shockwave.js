// ============================================================
// shockwave.js — Wave travel, path indicators, lift animations
// ============================================================

var activeWaves = [];

// ~2 grid tiles per second at 60 fps
var SW_SPEED = 4 / 60;

// Called from handleTap when a shockwave box is tapped.
function emitShockwave(stockIdx) {
  var b = stock[stockIdx];
  if (!b || !b.swPath || b.swPath.length === 0) return;
  activeWaves.push({
    path: b.swPath.slice(),
    target: b.swTarget,
    originIdx: stockIdx,
    progress: 0,
    done: false
  });
  // Low rumble
  if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();
}

// Called each frame from update().
function updateWaves() {
  for (var i = activeWaves.length - 1; i >= 0; i--) {
    var w = activeWaves[i];
    if (w.done) { activeWaves.splice(i, 1); continue; }

    var prevFloor = Math.floor(w.progress);
    w.progress += SW_SPEED;
    var newFloor = Math.floor(w.progress);

    // Trigger lift animation on newly passed tiles (not the target)
    for (var t = prevFloor; t < newFloor && t < w.path.length; t++) {
      var pIdx = w.path[t];
      if (pIdx === w.target) continue;
      var pb = stock[pIdx];
      if (pb && !pb.empty && !pb.used && !pb.isTunnel && !pb.isWall) {
        pb.swLiftT = 1.0;
        pb.shakeT = 0.35;
        if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();
      }
    }

    // Wave reached the target
    if (w.progress >= w.path.length) {
      var tb = stock[w.target];
      if (tb && !tb.empty && !tb.used && !tb.isTunnel && !tb.isWall) {
        tb.swUnlocked = true;
        tb.revealed = true;
        tb.shakeT = 0.8;
        tb.popT = 0.8;
        var bx = tb.x + L.bw / 2, by = tb.y + L.bh / 2;
        if (typeof spawnBurst === 'function') spawnBurst(bx, by, '#FF961E', 20);
        for (var p = 0; p < 12; p++) {
          var ang = Math.PI * 2 * p / 12;
          particles.push({
            x: bx, y: by,
            vx: Math.cos(ang) * (2 + Math.random() * 3) * S,
            vy: Math.sin(ang) * (2 + Math.random() * 3) * S,
            r: (2 + Math.random() * 3) * S,
            color: p % 2 === 0 ? '#FF961E' : '#FFD060',
            life: 1, decay: 0.02 + Math.random() * 0.01, grav: false
          });
        }
        if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
        updateBoxReveals(true);
      }
      w.done = true;
    }
  }

  // Tick lift animations on all stock tiles
  for (var i = 0; i < stock.length; i++) {
    if (stock[i].swLiftT > 0) stock[i].swLiftT = Math.max(0, stock[i].swLiftT - 0.025);
  }
}

// Draw path dotted line + target glow BEHIND the boxes.
// Called before drawStock() in frame().
function drawShockwaveIndicators() {
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.boxType !== 'shockwave') continue;
    if (b.used || b.empty) continue;
    if (!b.swPath || b.swPath.length === 0 || b.swTarget < 0) continue;

    // White path line through tile centers
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.70)';
    ctx.lineWidth = 2.5 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = 4 * S;
    ctx.beginPath();
    ctx.moveTo(b.x + L.bw / 2, b.y + L.bh / 2);
    for (var p = 0; p < b.swPath.length; p++) {
      var pb = stock[b.swPath[p]];
      if (pb) ctx.lineTo(pb.x + L.bw / 2, pb.y + L.bh / 2);
    }
    ctx.stroke();
    ctx.restore();

    // Target glow ring (white)
    var tgt = stock[b.swTarget];
    if (tgt) {
      var pulse = Math.sin(tick * 0.07 + 1.5) * 0.35 + 0.55;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,' + pulse + ')';
      ctx.lineWidth = 3 * S;
      ctx.shadowColor = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 8 * S;
      rRect(tgt.x - 3 * S, tgt.y - 3 * S, L.bw + 6 * S, L.bh + 6 * S, 9 * S);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Draw the traveling wave pulse ON TOP of boxes.
// Called after drawStock() in frame().
function drawWavePulses() {
  for (var i = 0; i < activeWaves.length; i++) {
    var w = activeWaves[i];
    if (w.done) continue;

    var tileIdx = Math.floor(w.progress);
    var frac = w.progress - tileIdx;

    // Clamp so we don't go out of bounds
    if (tileIdx >= w.path.length) tileIdx = w.path.length - 1;

    var prevB = stock[tileIdx > 0 ? w.path[tileIdx - 1] : w.originIdx];
    var currB = stock[w.path[tileIdx]];
    if (!prevB || !currB) continue;

    var wx = (prevB.x + L.bw / 2) + ((currB.x + L.bw / 2) - (prevB.x + L.bw / 2)) * frac;
    var wy = (prevB.y + L.bh / 2) + ((currB.y + L.bh / 2) - (prevB.y + L.bh / 2)) * frac;

    var rBase = L.bw * 0.44;

    ctx.save();
    // Outer ring
    ctx.strokeStyle = 'rgba(255,165,30,0.80)';
    ctx.lineWidth = 3 * S;
    ctx.shadowColor = 'rgba(255,165,30,0.55)';
    ctx.shadowBlur = 10 * S;
    ctx.beginPath(); ctx.arc(wx, wy, rBase, 0, Math.PI * 2); ctx.stroke();

    // Inner ring
    ctx.strokeStyle = 'rgba(255,230,100,0.55)';
    ctx.lineWidth = 1.5 * S;
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(wx, wy, rBase * 0.55, 0, Math.PI * 2); ctx.stroke();

    // Leading edge dot
    ctx.fillStyle = 'rgba(255,220,80,0.9)';
    ctx.shadowColor = 'rgba(255,200,0,0.7)';
    ctx.shadowBlur = 8 * S;
    ctx.beginPath(); ctx.arc(wx, wy, 3 * S, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
