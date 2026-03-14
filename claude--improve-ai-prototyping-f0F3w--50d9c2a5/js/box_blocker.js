// ============================================================
// box_blocker.js — Blocker box type (fully self-contained)
// Contains MRB_PER_BOX - BLOCKER_PER_BOX regular marbles plus
// BLOCKER_PER_BOX neutral blocker marbles. Visually distinct
// with diagonal stripe pattern and stone marble indicators.
//
// Also registers 'blockerCollection' mechanic for belt logic.
// ============================================================

registerBoxType('blocker', {
  label: 'Blocker',
  editorColor: '#7A7068',

  // ── Lifecycle hooks ──

  defaultState: function () {
    return { blockerCount: BLOCKER_PER_BOX };
  },

  countMarbles: function (box) {
    return { regular: Math.max(0, (box.remaining || MRB_PER_BOX) - BLOCKER_PER_BOX), special: BLOCKER_PER_BOX };
  },

  getMarbleCi: function (box, spawnIdx) {
    var blockerStart = MRB_PER_BOX - (box.blockerCount || BLOCKER_PER_BOX);
    return (spawnIdx >= blockerStart) ? BLOCKER_CI : box.ci;
  },

  // ── Open box rendering with blocker stripe + mixed marbles ──

  drawOpenBox: function (ctx, x, y, w, h, box, S, tick) {
    drawBox(x, y, w, h, box.ci);
    // Stripe overlay
    if (box.blockerCount > 0) {
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.beginPath(); rRect(x, y, w, h, 6 * S); ctx.clip();
      ctx.strokeStyle = COLORS[BLOCKER_CI].fill; ctx.lineWidth = 2 * S;
      var sg = 8 * S;
      for (var d = -w; d < w + h; d += sg) {
        ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d - h, y + h); ctx.stroke();
      }
      ctx.restore();
    }
    if (box.remaining > 0) {
      if (box.blockerCount > 0) {
        drawBoxMarblesWithBlockers(box.ci, box.remaining, box.blockerCount);
      } else {
        drawBoxMarbles(box.ci, box.remaining);
      }
      drawBoxLip(box.ci);
    }
  },

  // ── Closed state ──

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    var bc = COLORS[BLOCKER_CI];

    ctx.save();

    ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
    ctx.globalAlpha = 0.55;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    ctx.globalAlpha = 0.18;
    ctx.save();
    ctx.beginPath();
    rRect(x, y, w, h, 6 * S);
    ctx.clip();
    ctx.strokeStyle = bc.fill;
    ctx.lineWidth = 3 * S;
    var stripeGap = 10 * S;
    for (var d = -w; d < w + h; d += stripeGap) {
      ctx.beginPath();
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d - h, y + h);
      ctx.stroke();
    }
    ctx.restore();

    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    ctx.globalAlpha = 0.55;
    var dotR = w * 0.075;
    var dotY = y + h * 0.75;
    var dotGap = w * 0.22;
    var dotCx = x + w / 2;
    for (var d = -1; d <= 1; d++) {
      var grd = ctx.createRadialGradient(dotCx + d * dotGap, dotY, 0, dotCx + d * dotGap, dotY, dotR);
      grd.addColorStop(0, bc.light); grd.addColorStop(1, bc.dark);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(dotCx + d * dotGap, dotY, dotR, 0, Math.PI * 2); ctx.fill();
    }

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.28) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDD12', x + w / 2, y + h * 0.38);

    ctx.restore();
  },

  // ── Reveal animation ──

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

    if (phase < 0.7) {
      var bc = COLORS[BLOCKER_CI];
      ctx.globalAlpha = 0.08 * (1 - phase);
      ctx.save();
      ctx.beginPath();
      rRect(x, y, w, h, 6 * S);
      ctx.clip();
      ctx.strokeStyle = bc.fill;
      ctx.lineWidth = 2 * S;
      var stripeGap = 10 * S;
      for (var d = -w; d < w + h; d += stripeGap) {
        ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d - h, y + h); ctx.stroke();
      }
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      var blockerCount = Math.min(BLOCKER_PER_BOX, remaining);
      drawBoxMarblesWithBlockers(ci, remaining, blockerCount);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    var bc = COLORS[BLOCKER_CI];
    return {
      background: 'linear-gradient(135deg,' + c.light + ' 60%,' + bc.fill + ')',
      borderColor: bc.dark
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:9px">' + CLR_NAMES[ci][0].toUpperCase() + '<span style="color:#A89E94;font-size:7px">&#9679;</span></span>';
  }
});

// ============================================================
// Blocker collection mechanic — clears blocker marbles from
// the belt when all expected blockers have arrived.
// ============================================================

var _blockerState = {
  totalMarbles: 0,
  onBelt: 0,
  collecting: false,
  collectT: 0,
  collectSlots: [],
  collectCleared: false
};

registerMechanic('blockerCollection', {
  init: function () {
    _blockerState.totalMarbles = 0;
    _blockerState.onBelt = 0;
    _blockerState.collecting = false;
    _blockerState.collectT = 0;
    _blockerState.collectSlots = [];
    _blockerState.collectCleared = false;
    // Count total blocker marbles from stock + tunnel contents
    for (var i = 0; i < stock.length; i++) {
      var b = stock[i];
      if (b.isTunnel) {
        if (b.tunnelContents) {
          for (var tc = 0; tc < b.tunnelContents.length; tc++) {
            if (b.tunnelContents[tc].type === 'blocker') _blockerState.totalMarbles += BLOCKER_PER_BOX;
          }
        }
      } else if (!b.empty && !b.isWall && b.boxType === 'blocker') {
        _blockerState.totalMarbles += (b.blockerCount || BLOCKER_PER_BOX);
      }
    }
  },

  update: function (tick) {
    if (_blockerState.totalMarbles <= 0) return;

    if (!_blockerState.collecting) {
      _blockerState.onBelt = 0;
      _blockerState.collectSlots = [];
      for (var i = 0; i < BELT_SLOTS; i++) {
        if (beltSlots[i].marble === BLOCKER_CI) {
          _blockerState.onBelt++;
          _blockerState.collectSlots.push(i);
        }
      }
      if (_blockerState.onBelt >= _blockerState.totalMarbles) {
        _blockerState.collecting = true;
        _blockerState.collectT = 1;
        _blockerState.collectCleared = false;
      }
    }

    if (_blockerState.collecting) {
      _blockerState.collectT = Math.max(0, _blockerState.collectT - 0.015);
      if (_blockerState.collectT <= 0.5 && !_blockerState.collectCleared) {
        _blockerState.collectCleared = true;
        for (var k = 0; k < _blockerState.collectSlots.length; k++) {
          var csi = _blockerState.collectSlots[k];
          if (beltSlots[csi].marble === BLOCKER_CI) {
            var cpos = getSlotPos(csi);
            beltSlots[csi].marble = -1;
            spawnBurst(cpos.x, cpos.y, COLORS[BLOCKER_CI].light, 10);
            for (var p = 0; p < 3; p++) {
              var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
              particles.push({ x: cpos.x, y: cpos.y,
                vx: (L.beltCx - cpos.x) * 0.03 + Math.cos(a) * sp * S,
                vy: ((L.beltTopY + L.beltBotY) / 2 - cpos.y) * 0.03 + Math.sin(a) * sp * S,
                r: (2 + Math.random() * 3) * S, color: '#fff', life: 0.8, decay: 0.03, grav: false });
            }
          }
        }
        var bcx = L.beltCx, bcy = (L.beltTopY + L.beltBotY) / 2;
        spawnBurst(bcx, bcy, '#A89E94', 20);
        spawnConfetti(bcx, bcy, 25);
        sfx.win();
        _blockerState.onBelt = 0;
      }
      if (_blockerState.collectT <= 0) {
        _blockerState.collecting = false;
        _blockerState.collectT = 0;
        _blockerState.collectSlots = [];
      }
    }
  },

  render: function (ctx, phase) {
    if (phase !== 'post-belt') return;
    if (_blockerState.totalMarbles <= 0) return;

    var cx = L.beltCx;
    var cy = (L.beltBotY + L.sTop) / 2;
    var total = _blockerState.totalMarbles;
    var filled = _blockerState.onBelt;
    var dotR = 3.5 * S;
    var gap = dotR * 3;
    var startX = cx - (total - 1) * gap / 2;
    var pillW = Math.max((total - 1) * gap + dotR * 5, dotR * 6);
    var pillH = dotR * 3.2;
    var bc = COLORS[BLOCKER_CI];

    ctx.save();
    ctx.fillStyle = 'rgba(122,112,104,0.10)';
    rRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(122,112,104,0.18)'; ctx.lineWidth = 1 * S;
    rRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2); ctx.stroke();

    var iconX = cx - pillW / 2 - dotR * 2.5;
    ctx.globalAlpha = 0.4;
    var icGrd = ctx.createRadialGradient(iconX, cy, 0, iconX, cy, dotR * 1.1);
    icGrd.addColorStop(0, bc.light); icGrd.addColorStop(1, bc.dark);
    ctx.fillStyle = icGrd;
    ctx.beginPath(); ctx.arc(iconX, cy, dotR * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    for (var i = 0; i < total; i++) {
      var dx = startX + i * gap;
      if (i < filled) {
        var grd = ctx.createRadialGradient(dx - dotR * 0.15, cy - dotR * 0.15, dotR * 0.1, dx, cy, dotR);
        grd.addColorStop(0, bc.light); grd.addColorStop(0.7, bc.fill); grd.addColorStop(1, bc.dark);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(dx, cy, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.arc(dx - dotR * 0.2, cy - dotR * 0.2, dotR * 0.35, 0, Math.PI * 2); ctx.fill();
        if (_blockerState.collecting && _blockerState.collectT > 0.5) {
          ctx.globalAlpha = 0.4 + Math.sin(tick * 0.2 + i * 0.5) * 0.3;
          ctx.fillStyle = bc.glow;
          ctx.beginPath(); ctx.arc(dx, cy, dotR * 2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.strokeStyle = 'rgba(122,112,104,0.22)'; ctx.lineWidth = 1 * S;
        ctx.setLineDash([2 * S, 2 * S]);
        ctx.beginPath(); ctx.arc(dx, cy, dotR * 0.65, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (_blockerState.collecting && _blockerState.collectT <= 0.5 && _blockerState.collectT > 0) {
      var flashAlpha = _blockerState.collectT * 2;
      ctx.globalAlpha = flashAlpha * 0.6;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      rRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
});
