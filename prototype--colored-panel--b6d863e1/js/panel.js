// ============================================================
// panel.js — Colored Panel mechanic
// A colored panel covers a 3x3 area on the stock grid.
// It has an associated color and countdown number.
// Each time a sort box of the matching color clears,
// the count decreases. At 0, the panel is removed and
// the boxes underneath are revealed.
//
// Visual feedback: when a sort box clears, glowing orbs fly
// from the sort area up to the matching panel, then the panel
// shakes, the count ticks down with a floating "-1", and a
// glow ring pulses on impact.
// ============================================================

var panels = [];
var panelTravelers = [];   // orbs flying from sort box to panel
var panelFloatTexts = [];  // floating "-1" text indicators

// ── Helpers ──

function getPanelCenter(p) {
  var px = L.sx + p.col * (L.bw + L.bg);
  var py = L.sy + p.row * (L.bh + L.bg);
  var pw = 3 * L.bw + 2 * L.bg;
  var ph = 3 * L.bh + 2 * L.bg;
  return { x: px + pw / 2, y: py + ph / 2, w: pw, h: ph };
}

// Check if a stock cell is covered by an active panel.
// Returns the panel object or null.
function isCellCoveredByPanel(idx) {
  var row = Math.floor(idx / L.cols);
  var col = idx % L.cols;
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.removed) continue;
    if (row >= p.row && row < p.row + 3 && col >= p.col && col < p.col + 3) return p;
  }
  return null;
}

// ── Sort box → panel connection ──

// Called when a sort box of color ci is cleared.
// fromX/fromY = screen position of the sort box that just cleared.
function onSortBoxCompleted(ci, fromX, fromY) {
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.removed || p.ci !== ci) continue;

    var center = getPanelCenter(p);

    // Spawn 5 orbs that fly from sort box to panel, staggered
    for (var k = 0; k < 5; k++) {
      panelTravelers.push({
        fromX: fromX + (Math.random() - 0.5) * 20 * S,
        fromY: fromY + (Math.random() - 0.5) * 10 * S,
        toX: center.x + (Math.random() - 0.5) * 20 * S,
        toY: center.y + (Math.random() - 0.5) * 20 * S,
        ci: ci,
        t: -k * 0.04,     // stagger start times
        isLead: (k === 0), // only lead orb triggers countdown
        panelIdx: i
      });
    }
  }
}

// Compute position of a traveler orb along its arc.
function getPanelTravelerPos(tr) {
  var t = Math.max(0, Math.min(1, tr.t));
  // Ease in-out
  var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  var x = tr.fromX + (tr.toX - tr.fromX) * e;
  var y = tr.fromY + (tr.toY - tr.fromY) * e;
  // Arc upward — the further apart, the bigger the arc
  var dist = Math.abs(tr.toY - tr.fromY);
  var arcH = Math.max(60 * S, dist * 0.4);
  y -= Math.sin(t * Math.PI) * arcH;
  return { x: x, y: y };
}

// ── Per-frame updates ──

function updatePanels() {
  // Panel animations
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.removed) continue;
    if (p.shakeT > 0) p.shakeT = Math.max(0, p.shakeT - 0.04);
    if (p.glowT > 0) p.glowT = Math.max(0, p.glowT - 0.03);
    if (p.removeT > 0) {
      p.removeT = Math.max(0, p.removeT - 0.018);
      if (p.removeT <= 0) {
        p.removed = true;
        panelShatterEffect(p);
        revealPanelCells(p);
      }
    }
  }

  // Traveler orbs
  for (var i = panelTravelers.length - 1; i >= 0; i--) {
    var tr = panelTravelers[i];
    tr.t += 0.022;

    // Trail particles while in flight
    if (tr.t > 0 && tr.t < 1 && tick % 2 === 0) {
      var pos = getPanelTravelerPos(tr);
      var c = COLORS[tr.ci];
      particles.push({
        x: pos.x, y: pos.y,
        vx: (Math.random() - 0.5) * 0.8 * S,
        vy: (Math.random() - 0.5) * 0.8 * S + 0.5 * S,
        r: (1.5 + Math.random() * 2) * S,
        color: c.light,
        life: 0.4, decay: 0.05, grav: false
      });
    }

    // Arrived at panel
    if (tr.t >= 1) {
      var pos = getPanelTravelerPos(tr);

      // Arrival burst particles
      var c = COLORS[tr.ci];
      for (var k = 0; k < 5; k++) {
        var a = Math.PI * 2 * k / 5 + Math.random() * 0.5;
        var sp = 1.5 + Math.random() * 2;
        particles.push({
          x: pos.x, y: pos.y,
          vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
          r: (1.5 + Math.random() * 2) * S,
          color: c.fill, life: 0.4, decay: 0.05, grav: false
        });
      }

      // Lead orb triggers the actual countdown
      if (tr.isLead) {
        var p = panels[tr.panelIdx];
        if (p && !p.removed) {
          p.count--;
          p.shakeT = 0.7;
          p.glowT = 1.0;
          sfx.pop();

          // Floating "-1" text
          var center = getPanelCenter(p);
          panelFloatTexts.push({
            x: center.x, y: center.y - 15 * S,
            text: '-1', color: c.light, t: 1.0
          });

          if (p.count <= 0) {
            p.count = 0;
            p.removeT = 1.0;
          }
        }
      }

      panelTravelers.splice(i, 1);
    }
  }

  // Floating texts
  for (var i = panelFloatTexts.length - 1; i >= 0; i--) {
    var ft = panelFloatTexts[i];
    ft.t -= 0.018;
    ft.y -= 1.2 * S;
    if (ft.t <= 0) panelFloatTexts.splice(i, 1);
  }
}

// ── Particle burst when panel shatters ──

function panelShatterEffect(panel) {
  var center = getPanelCenter(panel);
  var c = COLORS[panel.ci];

  for (var k = 0; k < 35; k++) {
    var a = Math.PI * 2 * k / 35 + Math.random() * 0.3;
    var sp = 4 + Math.random() * 6;
    particles.push({
      x: center.x + (Math.random() - 0.5) * center.w * 0.6,
      y: center.y + (Math.random() - 0.5) * center.h * 0.6,
      vx: Math.cos(a) * sp * S,
      vy: Math.sin(a) * sp * S - 2 * S,
      r: (3 + Math.random() * 5) * S,
      color: Math.random() > 0.5 ? c.fill : c.light,
      life: 1, decay: 0.015 + Math.random() * 0.01, grav: true
    });
  }
  for (var k = 0; k < 12; k++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 2 + Math.random() * 3;
    particles.push({
      x: center.x, y: center.y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (2 + Math.random() * 3) * S,
      color: 'rgba(255,255,255,0.8)',
      life: 0.6, decay: 0.04, grav: false
    });
  }

  sfx.complete();
  spawnConfetti(center.x, center.y, 25);
}

// ── Reveal boxes under a just-removed panel ──

function revealPanelCells(panel) {
  var cols = L.cols;
  for (var dr = 0; dr < 3; dr++) {
    for (var dc = 0; dc < 3; dc++) {
      var r = panel.row + dr;
      var c = panel.col + dc;
      if (r >= L.rows || c >= cols) continue;
      var idx = r * cols + c;
      var b = stock[idx];
      if (!b || b.isTunnel || b.isWall || b.empty || b.used) continue;
      if (!b.revealed) {
        b.revealed = true;
        b.revealT = 1.0;
        b.popT = 0.6;
        var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
        var burstColor = (b.boxType === 'hidden') ? '#FFD700' : COLORS[b.ci].fill;
        for (var k = 0; k < 8; k++) {
          var a = Math.PI * 2 * k / 8 + Math.random() * 0.3, sp = 2 + Math.random() * 3;
          particles.push({ x: bx, y: by, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
            r: (2 + Math.random() * 3) * S, color: burstColor, life: 0.8, decay: 0.025, grav: false });
        }
      }
    }
  }
  for (var dr = 0; dr < 3; dr++) {
    for (var dc = 0; dc < 3; dc++) {
      var r = panel.row + dr;
      var c = panel.col + dc;
      if (r >= L.rows || c >= L.cols) continue;
      var idx = r * L.cols + c;
      if (isCellTrulyEmpty(idx)) revealAroundEmptyCell(idx);
    }
  }
}

// ── Initialize panels from level data ──

function initPanels(lvl) {
  panels = [];
  panelTravelers = [];
  panelFloatTexts = [];
  if (!lvl.panels) return;
  for (var i = 0; i < lvl.panels.length; i++) {
    var p = lvl.panels[i];
    panels.push({
      row: p.row, col: p.col, ci: p.ci, count: p.count,
      shakeT: 0, glowT: 0, removeT: 0, removed: false
    });
  }
}

// ── Drawing ──

function drawPanels() {
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    if (p.removed) continue;

    var px = L.sx + p.col * (L.bw + L.bg);
    var py = L.sy + p.row * (L.bh + L.bg);
    var pw = 3 * L.bw + 2 * L.bg;
    var ph = 3 * L.bh + 2 * L.bg;

    var alpha = 1;
    var scale = 1;
    if (p.removeT > 0 && p.count <= 0) {
      alpha = p.removeT;
      scale = 1 + (1 - p.removeT) * 0.12;
    }

    var ox = 0;
    if (p.shakeT > 0) ox = Math.sin(p.shakeT * 30) * 5 * S * p.shakeT;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px + pw / 2 + ox, py + ph / 2);
    ctx.scale(scale, scale);

    var c = COLORS[p.ci];

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10 * S;
    ctx.shadowOffsetY = 4 * S;

    // Panel body
    var grad = ctx.createLinearGradient(-pw / 2, -ph / 2, -pw / 2, ph / 2);
    grad.addColorStop(0, c.light);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    ctx.globalAlpha = alpha * 0.88;
    rRect(-pw / 2, -ph / 2, pw, ph, 12 * S);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Border
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 2.5 * S;
    rRect(-pw / 2, -ph / 2, pw, ph, 12 * S);
    ctx.stroke();

    // Glow ring on impact
    if (p.glowT > 0) {
      ctx.save();
      ctx.globalAlpha = p.glowT * 0.7;
      ctx.strokeStyle = c.light;
      ctx.lineWidth = (3 + (1 - p.glowT) * 4) * S;
      var glowExpand = (1 - p.glowT) * 8 * S;
      rRect(-pw / 2 - glowExpand, -ph / 2 - glowExpand,
            pw + glowExpand * 2, ph + glowExpand * 2, 14 * S);
      ctx.stroke();
      ctx.restore();
    }

    // Inner highlight
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5 * S;
    rRect(-pw / 2 + 4 * S, -ph / 2 + 4 * S, pw - 8 * S, ph - 8 * S, 9 * S);
    ctx.stroke();

    // Diagonal pattern
    ctx.save();
    ctx.globalAlpha = alpha * 0.07;
    ctx.beginPath();
    rRect(-pw / 2, -ph / 2, pw, ph, 12 * S);
    ctx.clip();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2 * S;
    var sg = 14 * S;
    for (var d = -pw; d < pw + ph; d += sg) {
      ctx.beginPath();
      ctx.moveTo(-pw / 2 + d, -ph / 2);
      ctx.lineTo(-pw / 2 + d - ph, ph / 2);
      ctx.stroke();
    }
    ctx.restore();

    // Count number
    ctx.globalAlpha = alpha;
    var numPulse = p.shakeT > 0 ? 1 + Math.sin(p.shakeT * 20) * 0.15 : 1;
    ctx.save();
    ctx.scale(numPulse, numPulse);
    ctx.fillStyle = 'white';
    ctx.font = 'bold ' + Math.round(pw * 0.32) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * S;
    ctx.shadowOffsetY = 2 * S;
    ctx.fillText(p.count.toString(), 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.restore();

    // Small color marble indicator in top-right
    ctx.globalAlpha = alpha;
    var indicatorR = 8 * S;
    var ix = pw / 2 - indicatorR - 6 * S;
    var iy = -ph / 2 + indicatorR + 6 * S;
    drawMarble(ix, iy, indicatorR, p.ci);

    ctx.restore();
  }
}

// Draw flying orbs (travelers) from sort box to panel.
function drawPanelTravelers() {
  for (var i = 0; i < panelTravelers.length; i++) {
    var tr = panelTravelers[i];
    if (tr.t <= 0) continue;
    var pos = getPanelTravelerPos(tr);
    var c = COLORS[tr.ci];
    var pulse = 1 + Math.sin(tr.t * Math.PI * 6) * 0.15;
    var r = (4.5 + (tr.isLead ? 1.5 : 0)) * S * pulse;

    // Outer glow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c.glow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Core orb
    drawMarble(pos.x, pos.y, r, tr.ci);
  }
}

// Draw floating "-1" text indicators.
function drawPanelFloatTexts() {
  for (var i = 0; i < panelFloatTexts.length; i++) {
    var ft = panelFloatTexts[i];
    var scale = ft.t > 0.8 ? 1 + (1 - ft.t) * 5 * 0.3 : 1;  // pop-in
    ctx.save();
    ctx.globalAlpha = Math.min(1, ft.t * 1.5);
    ctx.translate(ft.x, ft.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = ft.color;
    ctx.font = 'bold ' + Math.round(28 * S) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5 * S;
    ctx.fillText(ft.text, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
