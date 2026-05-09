// ============================================================
// gate.js — Narrow Gate ×3 mechanic
// A 1-cell-wide passive tile. When a phys marble passes through
// the pill area, the marble is tripled (1 → 3): the original
// continues, and 2 same-color clones are spawned next to it.
// Each marble is multiplied at most once per gate (tracked via
// marble.passedGates).
// ============================================================

var GATE_MULTIPLIER = 3;

// ── Drawing ──

function drawGateOnGrid(ctx, x, y, w, h, S, tick, flashT) {
  ctx.save();

  // Empty-slot background — the gate sits on a passable cell
  drawEmptySlot(x, y, w, h);

  var pillW = w * 0.78;
  var pillH = h * 0.42;
  var px = x + (w - pillW) / 2;
  var py = y + (h - pillH) / 2;

  // Idle bob
  var bob = Math.sin(tick * 0.05) * 1.5 * S;
  py += bob;

  // Outer drop shadow / glow
  ctx.shadowColor = 'rgba(40,140,60,0.45)';
  ctx.shadowBlur = 8 * S;
  ctx.shadowOffsetY = 2 * S;

  var grad = ctx.createLinearGradient(px, py, px, py + pillH);
  grad.addColorStop(0, '#7BE89E');
  grad.addColorStop(0.5, '#4ED477');
  grad.addColorStop(1, '#2EA858');
  ctx.fillStyle = grad;
  rRect(px, py, pillW, pillH, pillH * 0.5);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = '#1F8A48';
  ctx.lineWidth = 1.5 * S;
  rRect(px, py, pillW, pillH, pillH * 0.5);
  ctx.stroke();

  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rRect(px + 3 * S, py + 2 * S, pillW - 6 * S, pillH * 0.35, pillH * 0.3);
  ctx.fill();

  // ×3 label
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold ' + Math.floor(pillH * 0.6) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 2 * S;
  ctx.shadowOffsetY = 1 * S;
  ctx.fillText('×3', px + pillW / 2, py + pillH / 2 + 1 * S);

  // Flash overlay when a marble just passed through
  if (flashT && flashT > 0) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.globalAlpha = flashT * 0.7;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    rRect(px, py, pillW, pillH, pillH * 0.5);
    ctx.fill();
  }

  ctx.restore();
}

// ── Logic: detect marble overlap with gate pill, spawn clones ──

function processGateMultipliers() {
  if (!stock || stock.length === 0) return;
  if (physMarbles.length === 0) return;

  var pillW = L.bw * 0.78;
  var pillH = L.bh * 0.42;
  var pillOffX = (L.bw - pillW) / 2;
  var pillOffY = (L.bh - pillH) / 2;

  for (var i = 0; i < stock.length; i++) {
    var g = stock[i];
    if (!g.isGate) continue;
    var gx = g.x + pillOffX;
    var gy = g.y + pillOffY;

    // Iterate forwards — newly added clones go to the end and we
    // skip them on this pass via length cap.
    var n = physMarbles.length;
    for (var m = 0; m < n; m++) {
      var marble = physMarbles[m];
      if (!marble.passedGates) marble.passedGates = {};
      if (marble.passedGates[i]) continue;

      if (marble.x >= gx && marble.x <= gx + pillW &&
          marble.y >= gy && marble.y <= gy + pillH) {
        marble.passedGates[i] = true;

        var MR = marble.r;
        var clonesToSpawn = GATE_MULTIPLIER - 1;
        for (var k = 0; k < clonesToSpawn; k++) {
          var ang = (k / clonesToSpawn) * Math.PI - Math.PI / 2;
          var jitterX = Math.cos(ang) * 6 * S + (Math.random() - 0.5) * 2 * S;
          var jitterY = (Math.random() - 0.5) * 3 * S;
          var clone = {
            x: marble.x + jitterX,
            y: marble.y + jitterY,
            vx: marble.vx + Math.cos(ang) * 1.2 * S,
            vy: marble.vy + (Math.random() - 0.5) * 0.6 * S,
            ci: marble.ci,
            r: MR,
            spawnT: 1.0,
            passedGates: {}
          };
          // Clones inherit the parent's passed-gates so they don't
          // re-trigger the same gate, but other gates are open.
          for (var pk in marble.passedGates) clone.passedGates[pk] = true;
          physMarbles.push(clone);
        }

        g.flashT = 1.0;
        var cx = g.x + L.bw / 2, cy = g.y + L.bh / 2;
        if (typeof spawnBurst === 'function') {
          spawnBurst(cx, cy, '#7BE89E', 8);
          spawnBurst(marble.x, marble.y, COLORS[marble.ci].fill, 6);
        }
        if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();
      }
    }
  }
}

function tickGates() {
  if (!stock) return;
  for (var i = 0; i < stock.length; i++) {
    var g = stock[i];
    if (!g || !g.isGate) continue;
    if (g.flashT > 0) g.flashT = Math.max(0, g.flashT - 0.05);
  }
}
