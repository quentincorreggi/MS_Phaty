// ============================================================
// box_bomb.js — Bomb box type
//
// State machine:
//   revealed=false            → drawClosed: shows box color + bomb icon
//   revealed=true, bombActive=false → open & tappable, small idle bomb icon
//   revealed=true, bombActive=true  → ticking: countdown overlay shown
//   bombTicksLeft reaches 0   → explosion (handled in game.js update)
//   player taps while active  → defused, normal marble drop
// ============================================================

registerBoxType('bomb', {
  label: 'Bomb',
  editorColor: '#2C2030',

  // ── Shared bomb body drawing helper ──
  _drawBombBody: function (ctx, cx, cy, br, S) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.arc(cx + S, cy + 2 * S, br, 0, Math.PI * 2); ctx.fill();
    // Body
    var grad = ctx.createRadialGradient(cx - br * 0.3, cy - br * 0.3, br * 0.05, cx, cy, br);
    grad.addColorStop(0, '#3A3040');
    grad.addColorStop(1, '#12100E');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, br, 0, Math.PI * 2); ctx.fill();
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(cx - br * 0.3, cy - br * 0.3, br * 0.35, 0, Math.PI * 2); ctx.fill();
    // Fuse
    ctx.strokeStyle = '#C8A030';
    ctx.lineWidth = 1.8 * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + br * 0.55, cy - br * 0.65);
    ctx.bezierCurveTo(
      cx + br * 0.85, cy - br * 1.15,
      cx + br * 0.7, cy - br * 1.55,
      cx + br * 1.0, cy - br * 1.85
    );
    ctx.stroke();
  },

  // ── Fuse spark (flickers) ──
  _drawSpark: function (ctx, cx, cy, br, S, gameTick) {
    var flicker = (Math.sin(gameTick * 0.5) > 0);
    var sparkX = cx + br * 1.0, sparkY = cy - br * 1.85;
    var col = flicker ? '#FF6030' : '#FFD060';
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 8 * S;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(sparkX, sparkY, 2.2 * S, 0, Math.PI * 2); ctx.fill();
    // Small rays
    if (flicker) {
      ctx.strokeStyle = '#FFA040';
      ctx.lineWidth = 1.2 * S;
      for (var a = 0; a < 4; a++) {
        var angle = (a / 4) * Math.PI * 2 + gameTick * 0.12;
        ctx.beginPath();
        ctx.moveTo(sparkX, sparkY);
        ctx.lineTo(sparkX + Math.cos(angle) * 3.5 * S, sparkY + Math.sin(angle) * 3.5 * S);
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  // ── Closed (locked/unrevealed) ── shows box color + prominent bomb ──
  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    // Slightly dimmed box color
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
    ctx.globalAlpha = 0.55;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Dark overlay to look ominous
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#0A0810';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#1A1520';
    ctx.lineWidth = 2 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();
    ctx.restore();
    // Bomb icon centered
    var br = w * 0.23;
    var bcx = x + w * 0.5, bcy = y + h * 0.58;
    ctx.save();
    this._drawBombBody(ctx, bcx, bcy, br, S);
    this._drawSpark(ctx, bcx, bcy, br, S, tick);
    ctx.restore();
  },

  // ── Reveal animation (locked → open) ──
  drawReveal: function (ctx, x, y, w, h, ci, S, phase, remaining, tick) {
    var popScale = 1 + Math.sin(phase * Math.PI) * 0.1;
    ctx.save();
    ctx.scale(popScale, popScale);
    if (phase < 0.5) {
      ctx.globalAlpha = 1 - phase * 2;
      this.drawClosed(ctx, x, y, w, h, ci, S, tick, 0);
      ctx.globalAlpha = phase * 2;
    }
    drawBox(x, y, w, h, ci);
    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarbles(ci, remaining);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
    // Keep bomb icon during reveal
    ctx.save();
    ctx.scale(popScale, popScale);
    var br = w * 0.14;
    var bcx = x + w * 0.76, bcy = y + h * 0.28;
    ctx.globalAlpha = Math.min(1, phase * 2);
    this._drawBombBody(ctx, bcx, bcy, br, S);
    this._drawSpark(ctx, bcx, bcy, br, S, tick);
    ctx.restore();
  },

  // ── Open idle (revealed but bomb not yet activated) ──
  // Called from rendering.js after the normal open-box drawing
  drawIdleOverlay: function (ctx, x, y, w, h, S, tick) {
    var br = w * 0.13;
    var bcx = x + w * 0.78, bcy = y + h * 0.26;
    ctx.save();
    this._drawBombBody(ctx, bcx, bcy, br, S);
    this._drawSpark(ctx, bcx, bcy, br, S, tick);
    ctx.restore();
  },

  // ── Active (ticking countdown) overlay ──
  // Called from rendering.js when b.bombActive === true
  drawActiveOverlay: function (ctx, x, y, w, h, S, ticksLeft, fuseLength, gameTick) {
    var urgency = 1 - (ticksLeft / fuseLength);
    var cx = x + w * 0.5, cy = y + h * 0.5;
    ctx.save();

    // Pulsing red border
    var pulse = 0.6 + Math.sin(gameTick * (0.12 + urgency * 0.25)) * 0.4;
    ctx.strokeStyle = 'rgba(220,40,20,' + (0.5 + urgency * 0.4) + ')';
    ctx.lineWidth = (1.5 + urgency * 2.5 + pulse * 1.5) * S;
    rRect(x + 1 * S, y + 1 * S, w - 2 * S, h - 2 * S, 6 * S);
    ctx.stroke();

    // Warm glow overlay when urgent
    if (urgency > 0.5) {
      ctx.globalAlpha = (urgency - 0.5) * 0.18;
      ctx.fillStyle = '#FF3010';
      rRect(x, y, w, h, 6 * S); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Small bomb icon top-right with flickering spark
    var br = w * 0.13;
    var bcx = x + w * 0.78, bcy = y + h * 0.26;
    this._drawBombBody(ctx, bcx, bcy, br, S);
    this._drawSpark(ctx, bcx, bcy, br, S, gameTick);

    // Countdown number — big and centered
    var fontSize = Math.round(w * 0.44);
    ctx.font = 'bold ' + fontSize + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (ticksLeft <= 1) {
      // Urgent — big red pulse
      var p2 = 1 + Math.sin(gameTick * 0.35) * 0.2;
      ctx.save();
      ctx.translate(cx, cy + h * 0.1);
      ctx.scale(p2, p2);
      ctx.shadowColor = '#FF2010';
      ctx.shadowBlur = 16 * S;
      ctx.fillStyle = '#FF2010';
      ctx.fillText(ticksLeft.toString(), 0, 0);
      ctx.restore();
    } else {
      var alpha = ticksLeft <= 2 ? 0.95 : 0.82;
      ctx.shadowColor = 'rgba(220,40,20,0.6)';
      ctx.shadowBlur = 8 * S;
      ctx.fillStyle = 'rgba(220,' + Math.floor(30 + urgency * 20) + ',20,' + alpha + ')';
      ctx.fillText(ticksLeft.toString(), cx, cy + h * 0.1);
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    ctx.restore();
  },

  // ── Defuse flash overlay ──
  drawDefuseOverlay: function (ctx, x, y, w, h, S, defuseT) {
    ctx.save();
    ctx.globalAlpha = defuseT * 0.55;
    ctx.fillStyle = '#50FF80';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
  },

  // ── Explode flash overlay ──
  drawExplodeOverlay: function (ctx, x, y, w, h, S, explodeT) {
    ctx.save();
    ctx.globalAlpha = explodeT * 0.7;
    ctx.fillStyle = '#FF5010';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.dark + ' 0%,#12100E 60%)',
      borderColor: '#1A1520'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:1.1em;text-shadow:0 0 6px rgba(255,100,20,0.8)">&#128163;</span>';
  }
});
