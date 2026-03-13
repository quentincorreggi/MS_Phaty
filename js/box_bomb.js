// ============================================================
// box_bomb.js — Bomb box type
// Tap to detonate a random revealed box. Respawns up to 3 times
// with different colours, each with a 15-second countdown.
// Timer expiry makes the bomb inert and it fades away.
// ============================================================

var BOMB_STAGE_CI = [5, 7, 4]; // orange → crimson → purple
var BOMB_TIMER_FRAMES = 15 * 60; // ~900 frames at 60 fps
var BOMB_WARN_FRAMES = 5 * 60;   // final 5 s: flashing arc

// Called from frame() in game.js, after drawStock().
// Draws the bomb emoji, countdown arc, and stage-indicator dots
// for every active revealed bomb box.
function drawBombOverlays() {
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.boxType !== 'bomb') continue;
    if (b.empty || b.isTunnel || b.isWall || b.used) continue;
    if (!b.revealed || b.revealT > 0) continue;

    var cx = b.x + L.bw / 2;
    var cy = b.y + L.bh / 2;
    var stageCi = BOMB_STAGE_CI[b.bombStage - 1];
    var isWarning = b.bombTimer <= BOMB_WARN_FRAMES;
    var progress = b.bombTimer / BOMB_TIMER_FRAMES;

    ctx.save();

    // ── Bomb emoji ──
    ctx.font = 'bold ' + Math.round(L.bh * 0.38) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDCA3', cx, cy);

    // ── Countdown arc ──
    var arcR = Math.min(L.bw, L.bh) * 0.47;

    // Track (dim background ring)
    ctx.beginPath();
    ctx.arc(cx, cy, arcR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 4 * S;
    ctx.stroke();

    // Foreground arc drains clockwise from 12-o'clock
    if (progress > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
      var flash = isWarning && Math.floor(tick / 8) % 2 === 0;
      ctx.strokeStyle = flash ? '#FF3300' : COLORS[stageCi].light;
      ctx.lineWidth = 4 * S;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // ── Stage dots (remaining uses) ──
    var dotR = 3 * S;
    var dotGap = 8 * S;
    var filled = 4 - b.bombStage; // 3 → 2 → 1 as stages progress
    for (var d = 0; d < 3; d++) {
      ctx.beginPath();
      ctx.arc(cx + (d - 1) * dotGap, b.y + L.bh + 5 * S, dotR, 0, Math.PI * 2);
      ctx.fillStyle = d < filled ? COLORS[stageCi].fill : 'rgba(0,0,0,0.18)';
      ctx.fill();
    }

    ctx.restore();
  }
}

registerBoxType('bomb', {
  label: 'Bomb',
  editorColor: '#2A2030',

  // Shown when the box is not yet revealed (hidden state)
  drawClosed: function(ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawBox(x, y, w, h, ci);
    ctx.save();
    ctx.font = 'bold ' + Math.round(h * 0.40) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDCA3', x + w / 2, y + h * 0.50);
    ctx.restore();
  },

  // Shown during the reveal animation (phase 0 → 1)
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
