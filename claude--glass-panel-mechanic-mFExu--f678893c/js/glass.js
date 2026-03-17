// ============================================================
// glass.js — Glass Panel mechanic
//   Translucent panels that slide between two positions,
//   blocking boxes underneath from being tapped.
// ============================================================

var glassPanels = [];

function initGlassPanels(lvl) {
  glassPanels = [];
  if (!lvl.panels) return;
  for (var i = 0; i < lvl.panels.length; i++) {
    var p = lvl.panels[i];
    glassPanels.push({
      r1A: p.r1A, c1A: p.c1A,
      r1B: p.r1B, c1B: p.c1B,
      rows: p.rows, cols: p.cols,
      tapsToMove: p.tapsToMove || 3,
      tapCounter: p.tapsToMove || 3,
      atA: true,
      slideT: 0,
      slideFromR: 0, slideFromC: 0,
      slideToR: 0, slideToC: 0
    });
  }
}

// ── Query: is a grid cell covered by any glass panel? ──

function isUnderGlass(row, col) {
  for (var i = 0; i < glassPanels.length; i++) {
    var p = glassPanels[i];
    if (p.slideT > 0) {
      // During slide animation, block both source and destination
      if (row >= p.slideFromR && row < p.slideFromR + p.rows &&
          col >= p.slideFromC && col < p.slideFromC + p.cols) return true;
      if (row >= p.slideToR && row < p.slideToR + p.rows &&
          col >= p.slideToC && col < p.slideToC + p.cols) return true;
    } else {
      var r1 = p.atA ? p.r1A : p.r1B;
      var c1 = p.atA ? p.c1A : p.c1B;
      if (row >= r1 && row < r1 + p.rows && col >= c1 && col < c1 + p.cols) return true;
    }
  }
  return false;
}

function isIdxUnderGlass(idx) {
  if (glassPanels.length === 0) return false;
  var row = Math.floor(idx / L.cols);
  var col = idx % L.cols;
  return isUnderGlass(row, col);
}

// ── Called after every successful box tap ──

function glassTapHappened() {
  if (glassPanels.length === 0) return;
  for (var i = 0; i < glassPanels.length; i++) {
    var p = glassPanels[i];
    if (p.slideT > 0) continue; // already sliding
    p.tapCounter--;
    if (p.tapCounter <= 0) {
      p.slideFromR = p.atA ? p.r1A : p.r1B;
      p.slideFromC = p.atA ? p.c1A : p.c1B;
      p.slideToR = p.atA ? p.r1B : p.r1A;
      p.slideToC = p.atA ? p.c1B : p.c1A;
      p.slideT = 1.0;
      p.tapCounter = p.tapsToMove;
      sfx.glassSlide();
    }
  }
}

// ── Update slide animation (called from game update) ──

function updateGlassPanels() {
  if (glassPanels.length === 0) return;
  for (var i = 0; i < glassPanels.length; i++) {
    var p = glassPanels[i];
    if (p.slideT > 0) {
      p.slideT = Math.max(0, p.slideT - 0.042); // ~24 frames ≈ 0.4s
      if (p.slideT <= 0) {
        p.atA = !p.atA;
      }
    }
  }
}

// ── Drawing helpers ──

function glassEaseInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function glassPixelRect(r1, c1, rows, cols) {
  var pad = 3 * S;
  return {
    x: L.sx + c1 * (L.bw + L.bg) - pad,
    y: L.sy + r1 * (L.bh + L.bg) - pad,
    w: cols * (L.bw + L.bg) - L.bg + 2 * pad,
    h: rows * (L.bh + L.bg) - L.bg + 2 * pad
  };
}

// ── Main draw (called from game frame after drawStock) ──

function drawGlassPanels() {
  if (glassPanels.length === 0) return;

  for (var i = 0; i < glassPanels.length; i++) {
    var p = glassPanels[i];

    // Compute current visual position and alternate position
    var curR, curC, altR, altC;
    if (p.slideT > 0) {
      var progress = glassEaseInOut(1 - p.slideT);
      curR = p.slideFromR + (p.slideToR - p.slideFromR) * progress;
      curC = p.slideFromC + (p.slideToC - p.slideFromC) * progress;
      altR = -1; // don't draw alt outline during slide
    } else {
      curR = p.atA ? p.r1A : p.r1B;
      curC = p.atA ? p.c1A : p.c1B;
      altR = p.atA ? p.r1B : p.r1A;
      altC = p.atA ? p.c1B : p.c1A;
    }

    // ── Dotted outline at alternate position ──
    if (altR >= 0) {
      var alt = glassPixelRect(altR, altC, p.rows, p.cols);
      ctx.save();
      var pulse = 0.15 + Math.sin(tick * 0.04) * 0.08;
      ctx.strokeStyle = 'rgba(100,170,230,' + pulse + ')';
      ctx.lineWidth = 2 * S;
      ctx.setLineDash([5 * S, 4 * S]);
      rRect(alt.x, alt.y, alt.w, alt.h, 8 * S);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Glass panel at current position ──
    var pad = 3 * S;
    var gx = L.sx + curC * (L.bw + L.bg) - pad;
    var gy = L.sy + curR * (L.bh + L.bg) - pad;
    var gw = p.cols * (L.bw + L.bg) - L.bg + 2 * pad;
    var gh = p.rows * (L.bh + L.bg) - L.bg + 2 * pad;

    ctx.save();

    // Shadow
    ctx.shadowColor = 'rgba(40,80,140,0.15)';
    ctx.shadowBlur = 8 * S;
    ctx.shadowOffsetY = 3 * S;

    // Glass fill — semi-transparent blue
    ctx.globalAlpha = 0.22;
    var glassGrad = ctx.createLinearGradient(gx, gy, gx + gw * 0.3, gy + gh);
    glassGrad.addColorStop(0, '#78B4F0');
    glassGrad.addColorStop(0.5, '#8CC8FF');
    glassGrad.addColorStop(1, '#6AA0DC');
    ctx.fillStyle = glassGrad;
    rRect(gx, gy, gw, gh, 8 * S);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // White border
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5 * S;
    rRect(gx, gy, gw, gh, 8 * S);
    ctx.stroke();

    // Shine / reflection on top portion
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    rRect(gx + 3 * S, gy + 3 * S, gw - 6 * S, gh * 0.4, 6 * S);
    ctx.clip();
    var shineGrad = ctx.createLinearGradient(gx, gy, gx, gy + gh * 0.4);
    shineGrad.addColorStop(0, '#fff');
    shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shineGrad;
    ctx.fillRect(gx, gy, gw, gh * 0.4);
    ctx.restore();

    // ── Tap counter badge (top-right corner) ──
    ctx.globalAlpha = 1;
    var badgeR = 10 * S;
    var bx = gx + gw - badgeR * 0.3;
    var by = gy + badgeR * 0.3;

    ctx.fillStyle = 'rgba(40,90,150,0.85)';
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (badgeR * 1.2) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.tapCounter, bx, by + 0.5 * S);

    ctx.restore();
  }
}
