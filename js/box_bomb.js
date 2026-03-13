// ============================================================
// box_bomb.js — Bomb box type
// Tapping spawns the bomb's OWN marbles AND silently destroys
// a random other box (no marbles from that box). Respawns up
// to 3 times with a fresh 15-second countdown each stage.
// Timer expiry makes the bomb fade away, losing its marbles.
// ============================================================

var BOMB_STAGE_COLORS = ['#FF8C00', '#CC2200', '#7B35CC']; // arc color per stage
var BOMB_TIMER_FRAMES = 15 * 60; // ~900 frames at 60 fps
var BOMB_WARN_FRAMES  = 5 * 60;  // final 5 s: flashing arc

// Custom marble-spawning function for bombs — same as spawnPhysMarbles
// but calls onComplete(box) instead of setting box.used = true.
function spawnBombMarbles(box, onComplete) {
  box.spawning = true; box.spawnIdx = 0;
  var count = box.remaining;
  for (var idx = 0; idx < count; idx++) {
    (function(ii, b) {
      setTimeout(function() {
        if (b.remaining <= 0) return;
        var spawnIdx = MRB_PER_BOX - b.remaining;
        var sn = SNAKE_ORDER[spawnIdx];
        b.remaining--;
        b.spawnIdx = MRB_PER_BOX - b.remaining;
        var MR = getMR();
        var mg = Math.min(14 * S, L.bw / 4.2);
        var mgY = mg * MRB_GAP_FACTOR;
        var mx = b.x + L.bw / 2 + (sn.c - 1) * mg;
        var my = b.y + L.bh / 2 + (sn.r - 1) * mgY - 2 * S;
        physMarbles.push({ x: mx, y: my,
          vx: (Math.random() - 0.5) * 2 * S, vy: -(2 + Math.random() * 2) * S,
          ci: b.ci, r: MR, spawnT: 1.0 });
        sfx.drop();
        spawnBurst(mx, my, COLORS[b.ci].fill, 4);
        if (b.remaining <= 0) {
          b.emptyT = 1.0;
          setTimeout(function() {
            b.spawning = false;
            onComplete(b);
          }, 300);
        }
      }, ii * 120);
    })(idx, box);
  }
}

// Called from frame() in game.js, after drawStock().
// Draws the bomb emoji, countdown arc and stage-indicator dots
// for every active revealed non-spawning bomb box.
function drawBombOverlays() {
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.boxType !== 'bomb') continue;
    if (b.empty || b.isTunnel || b.isWall || b.used || b.spawning) continue;
    if (!b.revealed || b.revealT > 0) continue;

    var cx   = b.x + L.bw / 2;
    var cy   = b.y + L.bh / 2;
    var arcR = Math.min(L.bw, L.bh) * 0.47;
    var prog = b.bombTimer / BOMB_TIMER_FRAMES;
    var warn = b.bombTimer <= BOMB_WARN_FRAMES;
    var stageColor = BOMB_STAGE_COLORS[b.bombStage - 1];

    ctx.save();

    // ── Bomb emoji ──
    ctx.font = 'bold ' + Math.round(L.bh * 0.38) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDCA3', cx, cy);

    // ── Countdown arc (background track) ──
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 4 * S;
    ctx.stroke();

    // ── Countdown arc (foreground, drains clockwise from top) ──
    if (prog > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog, false);
      ctx.strokeStyle = (warn && Math.floor(tick / 8) % 2 === 0) ? '#FF3300' : stageColor;
      ctx.lineWidth = 4 * S;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // ── Stage dots (remaining uses, including current stage) ──
    var dotR   = 3 * S;
    var dotGap = 8 * S;
    var filled = 4 - b.bombStage; // 3 → 2 → 1
    for (var d = 0; d < 3; d++) {
      ctx.beginPath();
      ctx.arc(cx + (d - 1) * dotGap, b.y + L.bh + 5 * S, dotR, 0, Math.PI * 2);
      ctx.fillStyle = d < filled ? stageColor : 'rgba(0,0,0,0.18)';
      ctx.fill();
    }

    ctx.restore();
  }
}

registerBoxType('bomb', {
  label: 'Bomb',
  editorColor: '#2A2030',

  // Shown when the box is not yet revealed
  drawClosed: function(ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawBox(x, y, w, h, ci);
    ctx.save();
    ctx.font = 'bold ' + Math.round(h * 0.40) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDCA3', x + w / 2, y + h * 0.50);
    ctx.restore();
  },

  // Shown during reveal animation (phase 0 → 1)
  drawReveal: function(ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    ctx.save();
    ctx.globalAlpha = phase;
    drawBox(x, y, w, h, ci);
    ctx.font = 'bold ' + Math.round(h * 0.40) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDCA3', x + w / 2, y + h * 0.50);
    ctx.restore();
  },

  editorCellStyle: function(ci) {
    return { background: '#2A2030', borderColor: '#554466' };
  },

  editorCellHTML: function(ci) {
    return '<span style="font-size:17px">\uD83D\uDCA3</span>';
  }
});
