// ============================================================
// box_freeze.js — Freeze box type
// Contains MRB_PER_BOX marbles of one color. The last 3 spawned
// (the bottom row in the box) are "freezing" marbles — they
// look icy and, once they reach the belt, lock their slot until
// a Flamethrower thaws them.
// ============================================================

registerBoxType('freeze', {
  label: 'Freeze',
  editorColor: '#7AB8E0',

  drawClosed: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3 * S; ctx.shadowOffsetY = 1 * S;
    ctx.globalAlpha = 0.45;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c.light); grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Frost tint overlay
    ctx.globalAlpha = 0.28;
    var frostGrad = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
    frostGrad.addColorStop(0, 'rgba(220,240,255,1)');
    frostGrad.addColorStop(0.5, 'rgba(170,215,255,0.9)');
    frostGrad.addColorStop(1, 'rgba(220,240,255,1)');
    ctx.fillStyle = frostGrad;
    rRect(x, y, w, h, 6 * S); ctx.fill();

    // Frost border
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(140,200,240,0.85)';
    ctx.lineWidth = 1.5 * S;
    rRect(x, y, w, h, 6 * S); ctx.stroke();

    // Snowflake icon
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(240,250,255,1)';
    ctx.font = 'bold ' + (h * 0.34) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('❄', x + w / 2, y + h / 2);
    ctx.restore();
  },

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
    drawFreezeFrost(ctx, x, y, w, h, S, tick, 0.55);

    ctx.globalAlpha = 1;
    if (remaining > 0 && phase > 0.3) {
      ctx.globalAlpha = Math.min(1, (phase - 0.3) / 0.5);
      drawBoxMarblesWithFrozen(ci, remaining, FROZEN_PER_BOX);
      ctx.globalAlpha = 1;
      drawBoxLip(ci);
    }
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ' 55%, #B8E0FF)',
      borderColor: '#7AB8E0'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:9px">' +
      CLR_NAMES[ci][0].toUpperCase() +
      '<span style="color:#E6F4FF;font-size:8px;margin-left:1px;text-shadow:0 0 3px rgba(140,210,255,0.9)">❄</span></span>';
  }
});

// ── Shared frost-crystals overlay (used by drawClosed/drawReveal and rendering.js) ──
function drawFreezeFrost(ctx, x, y, w, h, S, tick, intensity) {
  intensity = intensity || 0.6;
  ctx.save();

  // Frost edge accents along top and bottom
  var shimmer = Math.sin(tick * 0.05) * 0.08 + 0.18;
  ctx.fillStyle = 'rgba(220,240,255,' + (intensity * shimmer * 2.5) + ')';
  // Top-left frost cluster
  ctx.beginPath(); ctx.arc(x + w * 0.18, y + h * 0.18, w * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w * 0.78, y + h * 0.13, w * 0.05, 0, Math.PI * 2); ctx.fill();
  // Bottom-left frost cluster
  ctx.beginPath(); ctx.arc(x + w * 0.12, y + h * 0.82, w * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w * 0.87, y + h * 0.85, w * 0.05, 0, Math.PI * 2); ctx.fill();

  // Snowflake crystal arms
  ctx.strokeStyle = 'rgba(255,255,255,' + (intensity * 0.45) + ')';
  ctx.lineWidth = 1 * S;
  ctx.lineCap = 'round';
  var cx1 = x + w * 0.18, cy1 = y + h * 0.18, cr = w * 0.07;
  for (var a = 0; a < 3; a++) {
    var ang = a * Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(cx1 - Math.cos(ang) * cr, cy1 - Math.sin(ang) * cr);
    ctx.lineTo(cx1 + Math.cos(ang) * cr, cy1 + Math.sin(ang) * cr);
    ctx.stroke();
  }
  var cx2 = x + w * 0.87, cy2 = y + h * 0.85, cr2 = w * 0.05;
  for (var a = 0; a < 3; a++) {
    var ang2 = a * Math.PI / 3 + 0.5;
    ctx.beginPath();
    ctx.moveTo(cx2 - Math.cos(ang2) * cr2, cy2 - Math.sin(ang2) * cr2);
    ctx.lineTo(cx2 + Math.cos(ang2) * cr2, cy2 + Math.sin(ang2) * cr2);
    ctx.stroke();
  }

  // Subtle pale-blue rim
  ctx.globalAlpha = intensity * 0.45;
  ctx.strokeStyle = 'rgba(160,215,255,1)';
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 6 * S); ctx.stroke();

  ctx.restore();
}

// ── Draw marbles inside the box: bottom row drawn as frozen ──
function drawBoxMarblesWithFrozen(ci, remaining, frozenCount) {
  if (remaining <= 0) return;
  var mr = Math.min(7 * S, L.bw / 8.5);
  var mg = Math.min(14 * S, L.bw / 4.2);
  var mgY = mg * MRB_GAP_FACTOR;
  var gone = MRB_PER_BOX - remaining;
  var frozenStart = MRB_PER_BOX - frozenCount;
  var mrbsToDraw = [];
  for (var si = gone; si < MRB_PER_BOX; si++) {
    mrbsToDraw.push({ r: SNAKE_ORDER[si].r, c: SNAKE_ORDER[si].c, isFrozen: si >= frozenStart });
  }
  mrbsToDraw.sort(function (a, b) { return a.r - b.r; });
  for (var si2 = 0; si2 < mrbsToDraw.length; si2++) {
    var sp = mrbsToDraw[si2];
    var mx = (sp.c - 1) * mg;
    var my = (sp.r - 1) * mgY - 2 * S;
    drawMarble(mx, my, mr, ci);
    if (sp.isFrozen) drawFrozenMarbleOverlay(mx, my, mr, 1, 0);
  }
}

// ── Ice-brick overlay drawn on top of any marble to show it is frozen ──
// Renders a bold hexagonal ice-crystal shell with sharp faceted faces.
// Used for marbles inside freeze boxes, in flight, and stuck on the belt.
function drawFrozenMarbleOverlay(x, y, r, scale, tick) {
  scale = scale || 1;
  tick = tick || 0;
  var rs = r * scale;
  var pulse = 0.88 + Math.sin(tick * 0.07) * 0.12;
  ctx.save();

  // ── Build hexagon points slightly larger than the marble ──
  var hex = rs * 1.52;
  var pts = [];
  for (var k = 0; k < 6; k++) {
    var a = k * Math.PI / 3 - Math.PI / 6;  // flat-top orientation
    pts.push({ x: x + Math.cos(a) * hex, y: y + Math.sin(a) * hex });
  }
  function hexPath() {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  // ── Flat fill — solid icy body ──
  var bodyGrad = ctx.createLinearGradient(x - hex, y - hex, x + hex * 0.5, y + hex);
  bodyGrad.addColorStop(0,   'rgba(215,240,255,0.88)');
  bodyGrad.addColorStop(0.45,'rgba(170,220,250,0.82)');
  bodyGrad.addColorStop(1,   'rgba(120,185,235,0.78)');
  ctx.fillStyle = bodyGrad;
  hexPath(); ctx.fill();

  // ── Shade each face individually for a faceted-ice look ──
  // Top-left faces: bright; bottom-right faces: darker blue
  var faceColors = [
    'rgba(240,252,255,0.50)',  // top-right
    'rgba(200,238,255,0.35)',  // right
    'rgba(100,170,220,0.45)',  // bottom-right
    'rgba(80,155,210,0.50)',   // bottom-left
    'rgba(160,215,248,0.30)',  // left
    'rgba(230,248,255,0.42)'   // top-left
  ];
  for (var f = 0; f < 6; f++) {
    var p0 = pts[f], p1 = pts[(f + 1) % 6];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.closePath();
    ctx.fillStyle = faceColors[f];
    ctx.fill();
  }

  // ── Sharp outer edge ──
  ctx.strokeStyle = 'rgba(180,228,255,' + (pulse * 0.95) + ')';
  ctx.lineWidth = 1.8 * S;
  ctx.lineJoin = 'miter';
  hexPath(); ctx.stroke();

  // ── Bright highlight line across top-left edge ──
  ctx.strokeStyle = 'rgba(255,255,255,' + (pulse * 0.90) + ')';
  ctx.lineWidth = 1.6 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[5].x, pts[5].y);
  ctx.lineTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.stroke();

  // ── Thin inner separation ring (dark) to separate marble from ice ──
  ctx.strokeStyle = 'rgba(60,120,180,0.55)';
  ctx.lineWidth = 1.0 * S;
  ctx.beginPath(); ctx.arc(x, y, rs * 1.07, 0, Math.PI * 2); ctx.stroke();

  // ── Two bright glint dots (ice highlights) ──
  ctx.fillStyle = 'rgba(255,255,255,' + (pulse * 0.92) + ')';
  ctx.beginPath(); ctx.arc(x - rs * 0.6, y - rs * 0.5, rs * 0.20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(220,245,255,' + (pulse * 0.70) + ')';
  ctx.beginPath(); ctx.arc(x + rs * 0.5, y + rs * 0.4, rs * 0.13, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}
