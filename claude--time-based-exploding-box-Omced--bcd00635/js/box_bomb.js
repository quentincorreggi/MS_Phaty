// ============================================================
// box_bomb.js — Time Bomb box type
// A box with a 15-second countdown timer. If the timer expires
// before the player taps it, it detonates and destroys all 8
// adjacent boxes. Tapping it in time defuses it (normal marble
// release). Timer starts when the box is revealed.
// ============================================================

var BOMB_TIMER_FRAMES = 15 * 60; // 15 seconds at 60 fps
var BOMB_URGENT_FRAMES = 5 * 60; // last 5 seconds = urgent

registerBoxType('bomb', {
  label: 'Bomb',
  editorColor: '#8B2020',

  // ── Closed state: dark red/charcoal box with bomb icon ──
  drawClosed: function(ctx, x, y, w, h, ci, S, tick, idlePhase) {
    // Dark charcoal base
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#5A4040');
    grad.addColorStop(1, '#3A2222');
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.strokeStyle = '#2A1515';
    ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Bomb icon (circle + fuse)
    var cx = x + w / 2, cy = y + h / 2;
    var br = w * 0.18;
    ctx.fillStyle = '#1A1010';
    ctx.beginPath(); ctx.arc(cx, cy + br * 0.2, br, 0, Math.PI * 2); ctx.fill();
    // Fuse
    ctx.strokeStyle = '#FF8C00';
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.moveTo(cx + br * 0.5, cy - br * 0.5);
    ctx.quadraticCurveTo(cx + br * 1.2, cy - br * 1.5, cx + br * 0.3, cy - br * 1.3);
    ctx.stroke();
    // Spark
    var sparkAlpha = 0.5 + Math.sin(tick * 0.15) * 0.5;
    ctx.fillStyle = 'rgba(255,200,50,' + sparkAlpha + ')';
    ctx.beginPath(); ctx.arc(cx + br * 0.3, cy - br * 1.3, 3 * S, 0, Math.PI * 2); ctx.fill();
  },

  // ── Reveal animation ──
  drawReveal: function(ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.08;
    ctx.save();
    ctx.scale(popScale, popScale);
    drawBox(x, y, w, h, ci);
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  // ── Draw bomb overlay on revealed box (timer ring + countdown) ──
  drawBombOverlay: function(ctx, x, y, w, h, S, bombTimer, tick) {
    var cx = x + w / 2, cy = y + h / 2;
    var secondsLeft = Math.ceil(bombTimer / 60);
    var fraction = bombTimer / BOMB_TIMER_FRAMES;
    var urgent = bombTimer < BOMB_URGENT_FRAMES;

    // Pulsing background tint when urgent
    if (urgent) {
      var pulseAlpha = 0.08 + Math.sin(tick * 0.2) * 0.06;
      ctx.fillStyle = 'rgba(200,30,30,' + pulseAlpha + ')';
      rRect(x, y, w, h, 6 * S); ctx.fill();
    }

    // Pie-chart countdown ring
    var ringR = Math.min(w, h) * 0.38;
    var ringW = 3 * S;

    // Background ring (dark)
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Remaining time arc (depletes clockwise)
    var startAngle = -Math.PI / 2;
    var endAngle = startAngle + fraction * Math.PI * 2;
    var ringColor = urgent ? '#FF3030' : '#FF8C00';
    if (urgent && Math.sin(tick * 0.25) > 0) {
      ringColor = '#FF0000';
    }
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringW;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, startAngle, endAngle);
    ctx.stroke();

    // Countdown number
    ctx.save();
    var fontSize = Math.min(w, h) * 0.32;
    ctx.font = 'bold ' + fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (urgent) {
      var flashAlpha = 0.7 + Math.sin(tick * 0.3) * 0.3;
      ctx.fillStyle = 'rgba(255,30,30,' + flashAlpha + ')';
      // Pulsing scale for urgent numbers
      var numPulse = 1 + Math.sin(tick * 0.2) * 0.08;
      ctx.translate(cx, cy);
      ctx.scale(numPulse, numPulse);
      ctx.fillText(secondsLeft, 0, 0);
    } else {
      ctx.fillStyle = 'rgba(255,140,0,0.85)';
      ctx.fillText(secondsLeft, cx, cy);
    }
    ctx.restore();
  },

  editorCellStyle: function(ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#8B2020'
    };
  },

  editorCellHTML: function(ci) {
    return '<span class="ed-cell-dot" style="text-shadow:0 0 4px rgba(200,30,30,0.8)">&#128163;</span>';
  }
});
