// ============================================================
// fridge.js — Fridge mechanic (see-through Panel variant)
//
// A Fridge covers a 2x2, 2x3, 3x2 or 3x3 area of the stock grid.
// The boxes underneath are visible through the glass but cannot be
// tapped. Each time a customer is filled (any colour), the Fridge
// counter drops by 1. At 0 the glass clears and the boxes become
// accessible.
//
// Differences from Panel: the body is see-through and the footprint
// is resizable. Neither changes how it opens.
// ============================================================

var fridges = [];
var fridgeTravelers = [];   // orbs flying from the filled customer to the fridge
var fridgeFloatTexts = [];  // floating "-1" indicators
var fridgeRipples = [];     // glass ripples from rejected taps

var FRIDGE_SIZES = [
  { w: 2, h: 2, label: '2\u00d72' },
  { w: 2, h: 3, label: '2\u00d73' },
  { w: 3, h: 2, label: '3\u00d72' },
  { w: 3, h: 3, label: '3\u00d73' }
];

// ── Sound ──

var fridgeSfx = {
  tick: function () {
    tone(1500, 0.09, 'sine', 0.05, 1100);
    setTimeout(function () { tone(2200, 0.05, 'sine', 0.025); }, 30);
  },
  reject: function () {
    tone(2600, 0.05, 'sine', 0.035, 2100);
    tone(150, 0.14, 'triangle', 0.05, 90);
  },
  open: function () {
    [988, 1319, 1760, 2093].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.22, 'sine', 0.07); }, i * 70);
    });
  }
};

// ── Geometry ──

function getFridgeRect(f) {
  var x = L.sx + f.col * (L.bw + L.bg);
  var y = L.sy + f.row * (L.bh + L.bg);
  var w = f.w * L.bw + (f.w - 1) * L.bg;
  var h = f.h * L.bh + (f.h - 1) * L.bg;
  return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2 };
}

// Returns the closed Fridge covering this cell, or null.
function isCellCoveredByFridge(idx) {
  if (!fridges.length || !L.cols) return null;
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  for (var i = 0; i < fridges.length; i++) {
    var f = fridges[i];
    if (f.opened) continue;
    if (row >= f.row && row < f.row + f.h && col >= f.col && col < f.col + f.w) return f;
  }
  return null;
}

// ── Init ──

function initFridges(lvl) {
  fridges = [];
  fridgeTravelers = [];
  fridgeFloatTexts = [];
  fridgeRipples = [];
  if (!lvl.fridges) return;
  for (var i = 0; i < lvl.fridges.length; i++) {
    var d = lvl.fridges[i];
    fridges.push({
      row: d.row, col: d.col,
      w: d.w || 3, h: d.h || 3,
      count: d.count,
      shakeT: 0, glowT: 0, rejectT: 0, openT: 0, opened: false
    });
  }
}

// ── Customer filled → counter down ──
// Any customer counts, whatever its colour. fromX/fromY is the
// screen position of the customer that was just filled.
function onCustomerFilled(fromX, fromY) {
  for (var i = 0; i < fridges.length; i++) {
    var f = fridges[i];
    if (f.opened || f.openT > 0) continue;
    var r = getFridgeRect(f);
    for (var k = 0; k < 5; k++) {
      fridgeTravelers.push({
        fromX: fromX + (Math.random() - 0.5) * 20 * S,
        fromY: fromY + (Math.random() - 0.5) * 10 * S,
        toX: r.cx + (Math.random() - 0.5) * r.w * 0.5,
        toY: r.cy + (Math.random() - 0.5) * r.h * 0.5,
        t: -k * 0.04,
        isLead: (k === 0),
        fridgeIdx: i
      });
    }
  }
}

function getFridgeTravelerPos(tr) {
  var t = Math.max(0, Math.min(1, tr.t));
  var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  var x = tr.fromX + (tr.toX - tr.fromX) * e;
  var y = tr.fromY + (tr.toY - tr.fromY) * e;
  var dist = Math.abs(tr.toY - tr.fromY);
  y -= Math.sin(t * Math.PI) * Math.max(60 * S, dist * 0.4);
  return { x: x, y: y };
}

// ── Rejected tap ──

function fridgeHandleTap(px, py) {
  if (!fridges.length) return false;
  for (var i = 0; i < fridges.length; i++) {
    var f = fridges[i];
    if (f.opened) continue;
    var r = getFridgeRect(f);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      f.rejectT = 1.0;
      fridgeRipples.push({ x: px, y: py, t: 1.0, fridgeIdx: i });
      fridgeSfx.reject();
      return true;
    }
  }
  return false;
}

// ── Per-frame update ──

function updateFridges() {
  for (var i = 0; i < fridges.length; i++) {
    var f = fridges[i];
    if (f.opened) continue;
    if (f.shakeT > 0) f.shakeT = Math.max(0, f.shakeT - 0.04);
    if (f.glowT > 0) f.glowT = Math.max(0, f.glowT - 0.03);
    if (f.rejectT > 0) f.rejectT = Math.max(0, f.rejectT - 0.05);
    if (f.openT > 0) {
      f.openT = Math.max(0, f.openT - 0.02);
      if (f.openT <= 0) {
        f.opened = true;
        fridgeOpenEffect(f);
        updateBoxReveals(true);
      }
    }
  }

  for (var i = fridgeTravelers.length - 1; i >= 0; i--) {
    var tr = fridgeTravelers[i];
    tr.t += 0.022;

    if (tr.t > 0 && tr.t < 1 && tick % 2 === 0) {
      var pos = getFridgeTravelerPos(tr);
      particles.push({
        x: pos.x, y: pos.y,
        vx: (Math.random() - 0.5) * 0.8 * S,
        vy: (Math.random() - 0.5) * 0.8 * S + 0.5 * S,
        r: (1.5 + Math.random() * 2) * S,
        color: 'rgba(210,240,255,0.9)',
        life: 0.4, decay: 0.05, grav: false
      });
    }

    if (tr.t >= 1) {
      var pos = getFridgeTravelerPos(tr);
      for (var k = 0; k < 5; k++) {
        var a = Math.PI * 2 * k / 5 + Math.random() * 0.5;
        var sp = 1.5 + Math.random() * 2;
        particles.push({
          x: pos.x, y: pos.y,
          vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
          r: (1.5 + Math.random() * 2) * S,
          color: 'rgba(235,250,255,0.95)', life: 0.4, decay: 0.05, grav: false
        });
      }

      if (tr.isLead) {
        var f = fridges[tr.fridgeIdx];
        if (f && !f.opened && f.openT <= 0) {
          f.count--;
          f.shakeT = 0.7;
          f.glowT = 1.0;
          fridgeSfx.tick();
          var r = getFridgeRect(f);
          fridgeFloatTexts.push({ x: r.cx, y: r.y - 6 * S, text: '-1', t: 1.0 });
          if (f.count <= 0) { f.count = 0; f.openT = 1.0; }
        }
      }

      fridgeTravelers.splice(i, 1);
    }
  }

  for (var i = fridgeFloatTexts.length - 1; i >= 0; i--) {
    var ft = fridgeFloatTexts[i];
    ft.t -= 0.018;
    ft.y -= 1.2 * S;
    if (ft.t <= 0) fridgeFloatTexts.splice(i, 1);
  }

  for (var i = fridgeRipples.length - 1; i >= 0; i--) {
    fridgeRipples[i].t -= 0.05;
    if (fridgeRipples[i].t <= 0) fridgeRipples.splice(i, 1);
  }
}

// ── Opening burst ──
// The player already knows what is inside, so this reads as release
// rather than reveal: the glass breaks up and clears outward.
function fridgeOpenEffect(f) {
  var r = getFridgeRect(f);
  for (var k = 0; k < 30; k++) {
    var a = Math.PI * 2 * k / 30 + Math.random() * 0.3;
    var sp = 3 + Math.random() * 5;
    particles.push({
      x: r.cx + (Math.random() - 0.5) * r.w * 0.8,
      y: r.cy + (Math.random() - 0.5) * r.h * 0.8,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
      r: (2 + Math.random() * 4) * S,
      color: Math.random() > 0.5 ? 'rgba(200,238,255,0.9)' : 'rgba(255,255,255,0.85)',
      life: 1, decay: 0.015 + Math.random() * 0.012, grav: true
    });
  }
  for (var k = 0; k < 10; k++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 2 + Math.random() * 3;
    particles.push({
      x: r.cx, y: r.cy,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (3 + Math.random() * 3) * S,
      color: 'rgba(255,255,255,0.8)', life: 0.6, decay: 0.04, grav: false
    });
  }
  fridgeSfx.open();
  spawnConfetti(r.cx, r.cy, 18);
}

// ── Drawing ──
// Called after drawStock, so the boxes underneath are already painted
// and the glass goes on top of them.

function drawFridges() {
  for (var i = 0; i < fridges.length; i++) {
    var f = fridges[i];
    if (f.opened) continue;

    var r = getFridgeRect(f);
    var alpha = 1, lift = 0;
    if (f.openT > 0) {
      alpha = f.openT;
      lift = (1 - f.openT) * r.h * 0.5;   // glass slides up and out
    }

    var ox = 0;
    if (f.shakeT > 0) ox += Math.sin(f.shakeT * 30) * 4 * S * f.shakeT;
    if (f.rejectT > 0) ox += Math.sin(f.rejectT * 55) * 3 * S * f.rejectT;

    var fr = 5 * S;             // frame thickness — constant across footprints
    var rad = 6 * S;            // matches the box corner radius, so no box corner pokes out

    ctx.save();
    ctx.translate(r.cx + ox, r.cy);
    // The frame sits slightly outside the covered cells so that no box corner
    // pokes past its rounded corners.
    var pad = 3 * S;
    var ew = r.w + pad * 2, eh = r.h + pad * 2;
    var hw = ew / 2, hh = eh / 2;

    // ── Glass pane ──
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, -lift);
    ctx.beginPath();
    rRect(-hw + fr, -hh + fr, ew - fr * 2, eh - fr * 2, rad * 0.6);
    ctx.clip();

    var tint = ctx.createLinearGradient(0, -hh, 0, hh);
    tint.addColorStop(0, 'rgba(190,232,255,0.34)');
    tint.addColorStop(0.5, 'rgba(215,242,255,0.20)');
    tint.addColorStop(1, 'rgba(170,220,250,0.32)');
    ctx.fillStyle = tint;
    ctx.fillRect(-hw, -hh, ew, eh);

    // Frost bands top and bottom — sells "cold" without hiding the boxes
    var frost = ctx.createLinearGradient(0, -hh, 0, -hh + eh * 0.22);
    frost.addColorStop(0, 'rgba(255,255,255,0.35)');
    frost.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = frost;
    ctx.fillRect(-hw, -hh, ew, eh * 0.22);
    var frost2 = ctx.createLinearGradient(0, hh, 0, hh - eh * 0.18);
    frost2.addColorStop(0, 'rgba(255,255,255,0.28)');
    frost2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = frost2;
    ctx.fillRect(-hw, hh - eh * 0.18, ew, eh * 0.18);

    // Diagonal sheen — the main "there is glass here" cue
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    var sw = ew * 0.16;
    ctx.beginPath();
    ctx.moveTo(-hw + ew * 0.10, hh);
    ctx.lineTo(-hw + ew * 0.10 + sw, hh);
    ctx.lineTo(-hw + ew * 0.10 + sw + eh * 0.6, -hh);
    ctx.lineTo(-hw + ew * 0.10 + eh * 0.6, -hh);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha * 0.22;
    ctx.beginPath();
    ctx.moveTo(-hw + ew * 0.36, hh);
    ctx.lineTo(-hw + ew * 0.36 + sw * 0.45, hh);
    ctx.lineTo(-hw + ew * 0.36 + sw * 0.45 + eh * 0.6, -hh);
    ctx.lineTo(-hw + ew * 0.36 + eh * 0.6, -hh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Rejected-tap ripples, clipped to the glass
    for (var k = 0; k < fridgeRipples.length; k++) {
      var rp = fridgeRipples[k];
      if (rp.fridgeIdx !== i) continue;
      var prog = 1 - rp.t;
      ctx.save();
      ctx.globalAlpha = alpha * rp.t * 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = (3 - prog * 2) * S;
      ctx.beginPath();
      ctx.arc(rp.x - r.cx - ox, rp.y - r.cy + lift, prog * 42 * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // ── Frame ──
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, -lift);
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 9 * S;
    ctx.shadowOffsetY = 3 * S;

    var frameGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    frameGrad.addColorStop(0, '#EAF3F8');
    frameGrad.addColorStop(0.5, '#B9CBD6');
    frameGrad.addColorStop(1, '#8FA3B0');
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = fr;
    rRect(-hw + fr / 2, -hh + fr / 2, ew - fr, eh - fr, rad);
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Inner and outer frame edges
    ctx.strokeStyle = 'rgba(90,115,130,0.75)';
    ctx.lineWidth = 1.2 * S;
    rRect(-hw, -hh, ew, eh, rad + fr / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    rRect(-hw + fr, -hh + fr, ew - fr * 2, eh - fr * 2, rad * 0.6);
    ctx.stroke();

    // Glow ring when the counter ticks
    if (f.glowT > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * f.glowT * 0.7;
      ctx.strokeStyle = 'rgba(190,240,255,1)';
      ctx.lineWidth = (3 + (1 - f.glowT) * 4) * S;
      var ex = (1 - f.glowT) * 8 * S;
      rRect(-hw - ex, -hh - ex, ew + ex * 2, eh + ex * 2, rad + 4 * S);
      ctx.stroke();
      ctx.restore();
    }

    // Rejected-tap flash on the frame
    if (f.rejectT > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * f.rejectT * 0.8;
      ctx.strokeStyle = '#FF8B8B';
      ctx.lineWidth = 2.5 * S;
      rRect(-hw, -hh, ew, eh, rad + fr / 2);
      ctx.stroke();
      ctx.restore();
    }

    // Handle on the right rail — keeps the fridge metaphor readable
    var handleH = Math.min(eh * 0.32, 34 * S);
    ctx.fillStyle = 'rgba(120,145,160,0.9)';
    rRect(hw - fr * 0.35 - 3 * S, -handleH / 2, 3.5 * S, handleH, 2 * S);
    ctx.fill();

    // ── Counter badge, centred on the glass and scaled to the footprint ──
    var br = Math.min(20 * S, ew * 0.16, eh * 0.16);
    var pulse = f.shakeT > 0 ? 1 + Math.sin(f.shakeT * 20) * 0.18 : 1;
    ctx.save();
    ctx.scale(pulse, pulse);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 5 * S;
    ctx.shadowOffsetY = 2 * S;
    var bg = ctx.createLinearGradient(0, -br, 0, br);
    bg.addColorStop(0, '#5C7A8C');
    bg.addColorStop(1, '#33505F');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(235,248,255,0.9)';
    ctx.lineWidth = 1.6 * S;
    ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(br * 1.25) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.count.toString(), 0, 0.5 * S);
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }
}

function drawFridgeTravelers() {
  for (var i = 0; i < fridgeTravelers.length; i++) {
    var tr = fridgeTravelers[i];
    if (tr.t <= 0) continue;
    var pos = getFridgeTravelerPos(tr);
    var pulse = 1 + Math.sin(tr.t * Math.PI * 6) * 0.15;
    var r = (4.5 + (tr.isLead ? 1.5 : 0)) * S * pulse;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'rgba(180,230,255,0.9)';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    var g = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, r * 0.1, pos.x, pos.y, r);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.6, '#CFEEFF');
    g.addColorStop(1, '#7FC4E8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawFridgeFloatTexts() {
  for (var i = 0; i < fridgeFloatTexts.length; i++) {
    var ft = fridgeFloatTexts[i];
    var scale = ft.t > 0.8 ? 1 + (1 - ft.t) * 1.5 : 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, ft.t * 1.5);
    ctx.translate(ft.x, ft.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#DFF4FF';
    ctx.font = 'bold ' + Math.round(26 * S) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5 * S;
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }
}
