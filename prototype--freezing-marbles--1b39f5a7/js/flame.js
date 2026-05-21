// ============================================================
// flame.js — Flamethrower mechanic
// Triggers a global thaw of every frozen marble (belt slots,
// physMarbles in flight, and remaining frozen marbles still
// inside un-tapped freeze boxes). Sets a global flag so any
// freeze boxes spawned later from tunnels also come out clean.
// ============================================================

// Animation timer (1 → 0) for the flame sweep across the belt.
var flameSweepT = 0;
var flameSweepStartX = 0;
var flameSweepEndX = 0;
var flameSweepY = 0;

function triggerFlamethrower(box) {
  // Consume the box
  box.used = true;
  box.remaining = 0;
  box.emptyT = 1.0;
  box.popT = 1;

  // From now on, freeze boxes spawn without frozen marbles.
  globalFlameFired = true;

  // 1. Thaw frozen marbles inside every un-tapped freeze box on the grid.
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s || s.isTunnel || s.isWall) continue;
    if (s.frozenCount && s.frozenCount > 0) {
      s.frozenCount = 0;
      s.boxType = 'default';
      s.shakeT = 0.5;
    }
  }
  // 1b. Also thaw freeze-typed entries waiting inside tunnels.
  for (var t = 0; t < stock.length; t++) {
    var tn = stock[t];
    if (!tn || !tn.isTunnel || !tn.tunnelContents) continue;
    for (var c = 0; c < tn.tunnelContents.length; c++) {
      if (tn.tunnelContents[c].type === 'freeze') {
        tn.tunnelContents[c].type = 'default';
      }
    }
  }

  // 2. Thaw in-flight physics marbles.
  for (var m = 0; m < physMarbles.length; m++) {
    if (physMarbles[m].frozen) {
      physMarbles[m].frozen = false;
      spawnIceShatter(physMarbles[m].x, physMarbles[m].y);
    }
  }

  // 3. Thaw belt slots.
  for (var b = 0; b < BELT_SLOTS; b++) {
    if (beltSlots[b].frozen) {
      beltSlots[b].frozen = false;
      beltSlots[b].arriveAnim = 0.6; // little pop when freed
      var pos = getSlotPos(b);
      spawnIceShatter(pos.x, pos.y);
    }
  }

  // 4. Flame sweep animation across the belt.
  flameSweepT = 1.0;
  flameSweepStartX = 0;
  flameSweepEndX = W;
  flameSweepY = (L.beltTopY + L.beltBotY) / 2;

  // 5. Burst at the flamethrower box itself.
  var bx = box.x + L.bw / 2;
  var by = box.y + L.bh / 2;
  for (var k = 0; k < 24; k++) {
    var a = Math.PI * 2 * k / 24 + Math.random() * 0.4;
    var sp = 3 + Math.random() * 5;
    particles.push({
      x: bx, y: by,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1 * S,
      r: (2 + Math.random() * 4) * S,
      color: Math.random() > 0.5 ? '#FFB94A' : '#FF6B2E',
      life: 1, decay: 0.025 + Math.random() * 0.015, grav: false
    });
  }

  // 6. Sounds — whoosh + crackle
  sfxFlameWhoosh();
}

function spawnIceShatter(x, y) {
  for (var p = 0; p < 14; p++) {
    var a = Math.PI * 2 * p / 14 + Math.random() * 0.4;
    var sp = 2 + Math.random() * 3;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
      r: (1.5 + Math.random() * 3) * S,
      color: Math.random() > 0.5 ? 'rgba(220,240,255,0.95)' : 'rgba(255,255,255,0.85)',
      life: 0.9, decay: 0.025 + Math.random() * 0.02, grav: true
    });
  }
}

function tickFlame() {
  if (flameSweepT > 0) {
    flameSweepT = Math.max(0, flameSweepT - 0.025);

    // Continually spawn flame particles along the sweep front while active.
    var progress = 1 - flameSweepT;
    var sx = flameSweepStartX + (flameSweepEndX - flameSweepStartX) * progress;
    for (var k = 0; k < 3; k++) {
      var ox = (Math.random() - 0.5) * 30 * S;
      var oy = (Math.random() - 0.5) * 40 * S;
      particles.push({
        x: sx + ox, y: flameSweepY + oy,
        vx: (Math.random() - 0.5) * 1 * S,
        vy: -(1 + Math.random() * 2) * S,
        r: (3 + Math.random() * 4) * S,
        color: Math.random() > 0.6 ? '#FFE066' : (Math.random() > 0.5 ? '#FF9430' : '#E84E18'),
        life: 0.7, decay: 0.04 + Math.random() * 0.02, grav: false
      });
    }
  }
}

function drawFlameSweep() {
  if (flameSweepT <= 0) return;
  var progress = 1 - flameSweepT;
  var sx = flameSweepStartX + (flameSweepEndX - flameSweepStartX) * progress;
  ctx.save();
  // Bright soft glow following the sweep front
  var grd = ctx.createRadialGradient(sx, flameSweepY, 5 * S, sx, flameSweepY, 90 * S);
  grd.addColorStop(0, 'rgba(255,235,150,0.65)');
  grd.addColorStop(0.4, 'rgba(255,140,40,0.45)');
  grd.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, flameSweepY - 90 * S, W, 180 * S);
  ctx.restore();
}

// Whoosh + crackle sound for the flamethrower
function sfxFlameWhoosh() {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  // Whoosh: filtered noise via square wave + sweep
  var o = audioCtx.createOscillator();
  var g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.45);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.10, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + 0.55);
  // Crackle pops
  for (var i = 0; i < 4; i++) {
    setTimeout(function () { tone(1200 + Math.random() * 600, 0.04, 'square', 0.05, 600); }, 60 + i * 90);
  }
}
