// ============================================================
// gate.js — Gate 1x1 (×2) maze element
// A single-cell passable tile. Every marble that falls through
// the gate cell is doubled (×2): the original continues and one
// same-color clone is spawned beside it. Each marble is doubled
// at most once per gate (tracked via marble.passedGates), so a
// box of 9 marbles above the gate yields 18 on the belt.
//
// Same banner visual as the 2-cell Gate (plaque body + end posts
// + outlined ×2), sized to one grid cell and coloured orange.
// ============================================================

var GATE_MULTIPLIER = 2;

// Orange palette
var GATE_BODY_TOP = '#FFC957';
var GATE_BODY_MID = '#FBA334';
var GATE_BODY_BOT = '#EE8B1E';
var GATE_BODY_BORDER = '#D9741A';
var GATE_POST_DARK = '#8A410C';
var GATE_POST_LIGHT = '#C86A1C';
var GATE_TEXT_OUTLINE = '#6E3208';
var GATE_BURST = '#FFB347';

// ── Drawing ──

function drawGatePost(ctx, px, py, pw, ph, S) {
  var r = pw * 0.5;
  // Horizontal gradient → cylindrical post (dark edges, lit centre)
  var g = ctx.createLinearGradient(px, py, px + pw, py);
  g.addColorStop(0, GATE_POST_DARK);
  g.addColorStop(0.5, GATE_POST_LIGHT);
  g.addColorStop(1, GATE_POST_DARK);
  ctx.fillStyle = g;
  rRect(px, py, pw, ph, r);
  ctx.fill();
  // Soft vertical highlight down the middle
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  rRect(px + pw * 0.32, py + ph * 0.10, pw * 0.20, ph * 0.80, pw * 0.10);
  ctx.fill();
}

function drawGateOnGrid(ctx, x, y, w, h, S, tick, flashT) {
  ctx.save();

  // Empty-slot background — the gate sits on a passable cell
  drawEmptySlot(x, y, w, h);

  var cx = x + w / 2;
  var cy = y + h / 2 + Math.sin(tick * 0.05) * 1.5 * S; // idle bob

  var bodyW = w * 0.82;
  var bodyH = h * 0.44;
  var bx = cx - bodyW / 2;
  var by = cy - bodyH / 2;
  var rad = Math.min(bodyH * 0.30, 8 * S);

  var postW = Math.max(w * 0.11, 6 * S);
  var postH = bodyH * 1.5;
  var postY = cy - postH / 2;
  var leftPostX = bx - postW * 0.25;
  var rightPostX = bx + bodyW - postW * 0.75;

  // ── Banner body (with drop shadow) ──
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 3 * S;
  var bg = ctx.createLinearGradient(bx, by, bx, by + bodyH);
  bg.addColorStop(0, GATE_BODY_TOP);
  bg.addColorStop(0.45, GATE_BODY_MID);
  bg.addColorStop(1, GATE_BODY_BOT);
  ctx.fillStyle = bg;
  rRect(bx, by, bodyW, bodyH, rad);
  ctx.fill();
  ctx.restore();

  // Inner top sheen
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  rRect(bx + 4 * S, by + 3 * S, bodyW - 8 * S, bodyH * 0.34, rad * 0.7);
  ctx.fill();

  // Body border
  ctx.strokeStyle = GATE_BODY_BORDER;
  ctx.lineWidth = 1.5 * S;
  rRect(bx, by, bodyW, bodyH, rad);
  ctx.stroke();

  // ── End posts ──
  drawGatePost(ctx, leftPostX, postY, postW, postH, S);
  drawGatePost(ctx, rightPostX, postY, postW, postH, S);

  // ── Flash overlay when a marble just passed through ──
  if (flashT && flashT > 0) {
    ctx.globalAlpha = flashT * 0.6;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    rRect(bx, by, bodyW, bodyH, rad);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── ×2 label (white fill + dark outline) ──
  var tx = cx, ty = cy + 1 * S;
  ctx.font = 'bold ' + Math.floor(bodyH * 0.72) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur = 2 * S;
  ctx.shadowOffsetY = 1.5 * S;
  ctx.lineWidth = Math.max(3 * S, bodyH * 0.16);
  ctx.strokeStyle = GATE_TEXT_OUTLINE;
  ctx.strokeText('×2', tx, ty);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('×2', tx, ty);

  ctx.restore();
}

// ── Logic: double every marble that falls through the gate cell ──

function processGateMultipliers() {
  if (!stock || stock.length === 0) return;
  if (physMarbles.length === 0) return;

  for (var i = 0; i < stock.length; i++) {
    var g = stock[i];
    if (!g.isGate) continue;

    var gx0 = g.x, gx1 = g.x + L.bw;
    var gy0 = g.y, gy1 = g.y + L.bh;

    // Cap the loop at the current length — clones added this pass go
    // to the end and are skipped until the next frame.
    var n = physMarbles.length;
    for (var m = 0; m < n; m++) {
      var marble = physMarbles[m];
      if (!marble.passedGates) marble.passedGates = {};
      if (marble.passedGates[i]) continue;

      // Test the marble's whole vertical travel this frame against the
      // gate cell, not just its final position. A fast-falling marble
      // can jump clean over the cell in one frame; using the swept
      // interval [prevY, curY] means it is still caught. Because we
      // require the interval to reach the cell from a marble that was
      // above/inside it, marbles from boxes BELOW the gate (which never
      // sweep down into it) are correctly left untouched.
      var prevY = (marble._gy === undefined) ? marble.y : marble._gy;
      var loY = Math.min(prevY, marble.y);
      var hiY = Math.max(prevY, marble.y);

      if (marble.x >= gx0 && marble.x <= gx1 &&
          hiY >= gy0 && loY <= gy1) {
        marble.passedGates[i] = true;

        var clonesToSpawn = GATE_MULTIPLIER - 1;
        for (var k = 0; k < clonesToSpawn; k++) {
          var ang = clonesToSpawn > 1
            ? (k / (clonesToSpawn - 1)) * Math.PI - Math.PI / 2
            : 0;
          var jitterX = Math.cos(ang) * 6 * S + (Math.random() - 0.5) * 2 * S;
          var jitterY = (Math.random() - 0.5) * 3 * S;
          var clone = {
            x: marble.x + jitterX,
            y: marble.y + jitterY,
            vx: marble.vx + Math.cos(ang) * 1.2 * S,
            vy: marble.vy + (Math.random() - 0.5) * 0.6 * S,
            ci: marble.ci,
            r: marble.r,
            spawnT: 1.0,
            passedGates: {}
          };
          // Clone inherits parent's passed gates so it won't re-trigger
          // this gate, but stays open to any other gates.
          for (var pk in marble.passedGates) clone.passedGates[pk] = true;
          physMarbles.push(clone);
        }

        g.flashT = 1.0;
        var ccx = g.x + L.bw / 2, ccy = g.y + L.bh / 2;
        if (typeof spawnBurst === 'function') {
          spawnBurst(ccx, ccy, GATE_BURST, 8);
          spawnBurst(marble.x, marble.y, COLORS[marble.ci].fill, 6);
        }
        if (typeof sfx !== 'undefined' && sfx.pop) sfx.pop();
      }
    }
  }

  // Remember each marble's position so the next frame can test the
  // swept interval. Clones added this pass start with prev == current.
  for (var q = 0; q < physMarbles.length; q++) {
    physMarbles[q]._gy = physMarbles[q].y;
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
