// ============================================================
// chocolate.js — Chocolate Customer mechanic
//   A sort customer wrapped in 3 HP chocolate that hides its
//   color, can't receive marbles and blocks its column. Each time
//   the front customer of a neighboring column (left/right) is
//   filled, the front-row chocolate takes 1 hit:
//     3 → 2 : wrapper comes off (plain bar)
//     2 → 1 : bar cracks
//     1 → 0 : bar shatters, revealing the customer + its color
// ============================================================

var CHOCO_HP = 3;

// ── Placement (called from initGame after sort columns are built) ──
function placeChocolateCustomers(n) {
  if (!n) return;
  var candidates = [];
  for (var c = 0; c < sortCols.length; c++) {
    // Never the very first slot of a column, so there's always something to fill at start
    for (var r = 1; r < sortCols[c].length; r++) {
      var b = sortCols[c][r];
      if (b.type === 'lock' || b.choco) continue;
      candidates.push(b);
    }
  }
  shuffle(candidates);
  for (var i = 0; i < n && i < candidates.length; i++) {
    var box = candidates[i];
    box.choco = CHOCO_HP;
    box.chocoHitT = 0;
    box.chocoRevealT = 0;
  }
}

function isChocoLocked(box) { return !!(box && box.choco > 0); }

function getFrontBox(c) {
  var col = sortCols[c];
  if (!col) return null;
  for (var r = 0; r < col.length; r++) if (col[r].vis) return col[r];
  return null;
}

function getSortBoxCenter(c) {
  return { x: L.sSx + c * (L.sBw + L.sColGap) + L.sBw / 2, y: getSortBoxY(c, 0) + L.sBh / 2 };
}

// ── Damage (called when a customer in column c gets filled) ──
function chocoOnCustomerFilled(c) {
  var nbs = [c - 1, c + 1];
  for (var i = 0; i < nbs.length; i++) {
    var nc = nbs[i];
    if (nc < 0 || nc >= sortCols.length) continue;
    var front = getFrontBox(nc);
    if (front && front.choco > 0) chocoHit(front, nc);
  }
}

function chocoHit(box, c) {
  box.choco--;
  box.chocoHitT = 1;
  var p = getSortBoxCenter(c);
  if (box.choco === 2) {
    // Wrapper scraps fly off
    chocoSpawnPieces(p.x, p.y, ['#F02D3A', '#FF5A63', '#F3E6C4'], 16, 1);
    chocoSfx.unwrap();
  } else if (box.choco === 1) {
    // Chocolate chips flick off
    chocoSpawnPieces(p.x, p.y, ['#7A4022', '#5A2C14', '#9B5A34'], 12, 1);
    chocoSfx.crack();
  } else if (box.choco <= 0) {
    chocoShatter(box, c);
  }
}

function chocoShatter(box, c) {
  box.choco = 0;
  box.chocoHitT = 0;
  box.chocoRevealT = 1;
  box.shineT = 1;
  var p = getSortBoxCenter(c);
  chocoSpawnPieces(p.x, p.y, ['#7A4022', '#5A2C14', '#9B5A34', '#B87A50'], 28, 1.6);
  spawnBurst(p.x, p.y, COLORS[box.ci].fill, 18);
  spawnBurst(p.x, p.y, COLORS[box.ci].light, 10);
  chocoSfx.shatter();
}

function chocoSpawnPieces(x, y, colors, n, power) {
  for (var i = 0; i < n; i++) {
    var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    var sp = (2 + Math.random() * 4) * power;
    particles.push({
      x: x + (Math.random() - 0.5) * L.sBw * 0.7, y: y + (Math.random() - 0.5) * L.sBh * 0.5,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
      r: (2 + Math.random() * 3.5) * S, color: colors[~~(Math.random() * colors.length)],
      life: 1, decay: 0.015 + Math.random() * 0.015, grav: true
    });
  }
}

// ── Per-frame update: animations + soft-lock safeguards ──
function updateChocolate() {
  var anyChoco = false;
  for (var c = 0; c < sortCols.length; c++) {
    var col = sortCols[c];
    for (var r = 0; r < col.length; r++) {
      var b = col[r];
      if (b.chocoHitT > 0) b.chocoHitT = Math.max(0, b.chocoHitT - 0.04);
      if (b.chocoRevealT > 0) b.chocoRevealT = Math.max(0, b.chocoRevealT - 0.03);
      if (b.vis && b.choco > 0) anyChoco = true;
    }
  }
  if (!anyChoco) return;

  // Safeguard 1: not enough customers left in the neighboring columns
  for (var c = 0; c < sortCols.length; c++) {
    var front = getFrontBox(c);
    if (!front || !(front.choco > 0)) continue;
    var remaining = 0;
    var nbs = [c - 1, c + 1];
    for (var i = 0; i < nbs.length; i++) {
      var nc = nbs[i];
      if (nc < 0 || nc >= sortCols.length) continue;
      var ncol = sortCols[nc];
      for (var r = 0; r < ncol.length; r++) {
        var nb = ncol[r];
        if (nb.vis && nb.type !== 'lock' && nb.filled < SORT_CAP) remaining++;
      }
    }
    if (remaining < front.choco) chocoShatter(front, c);
  }

  // Safeguard 2: every front-row customer is wrapped in chocolate
  var fronts = 0, covered = 0;
  for (var c = 0; c < sortCols.length; c++) {
    var front = getFrontBox(c);
    if (!front) continue;
    fronts++;
    if (front.choco > 0) covered++;
  }
  if (fronts > 0 && covered === fronts) {
    for (var c = 0; c < sortCols.length; c++) {
      var front = getFrontBox(c);
      if (front && front.choco > 0) chocoShatter(front, c);
    }
  }
}

// ── Drawing (local coords: centered on 0,0, size w x h) ──
function drawChocoCustomer(b, w, h) {
  if (b.chocoHitT > 0) {
    var sh = Math.sin(b.chocoHitT * Math.PI * 6) * b.chocoHitT * 3 * S;
    ctx.translate(sh, 0);
    var ps = 1 + Math.sin(b.chocoHitT * Math.PI) * 0.08;
    ctx.scale(ps, ps);
  }
  if (b.choco >= 3) drawChocoWrapped(w, h);
  else { drawChocoBar(w, h); if (b.choco === 1) drawChocoCracks(w, h); }
}

function drawChocoWrapped(w, h) {
  var crimp = w * 0.09;
  var bx = -w / 2 + crimp, bw = w - crimp * 2, by = -h / 2 + h * 0.06, bh = h * 0.88;

  // Crimped ends
  for (var side = -1; side <= 1; side += 2) {
    var ex = side < 0 ? -w / 2 : w / 2;
    var ix = side < 0 ? bx + 2 * S : bx + bw - 2 * S;
    var top = -h / 2, bot = h / 2;
    var g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#FF5A63'); g.addColorStop(1, '#C41824');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ix, by + 2 * S);
    ctx.lineTo(ex - side * crimp * 0.15, top);
    var teeth = 6;
    for (var t = 0; t <= teeth; t++) {
      var yy = top + (bot - top) * t / teeth;
      var xx = ex - side * (t % 2 === 0 ? crimp * 0.15 : crimp * 0.0);
      ctx.lineTo(xx, yy);
    }
    ctx.lineTo(ix, by + bh - 2 * S);
    ctx.closePath(); ctx.fill();
    // Crimp ridges
    ctx.strokeStyle = 'rgba(120,0,10,0.45)'; ctx.lineWidth = 1 * S;
    for (var t = 1; t < teeth; t++) {
      var yy = top + (bot - top) * t / teeth;
      ctx.beginPath(); ctx.moveTo(ex - side * crimp * 0.1, yy); ctx.lineTo(ix, by + bh / 2 + (yy - (top + bot) / 2) * 0.7); ctx.stroke();
    }
  }

  // Body
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 3 * S;
  var bg = ctx.createLinearGradient(0, by, 0, by + bh);
  bg.addColorStop(0, '#FF4C55'); bg.addColorStop(0.55, '#EE2733'); bg.addColorStop(1, '#C01622');
  ctx.fillStyle = bg;
  rRect(bx, by, bw, bh, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Cream diagonal stripe
  ctx.save();
  rRect(bx, by, bw, bh, 6 * S); ctx.clip();
  var cg = ctx.createLinearGradient(0, by, 0, by + bh);
  cg.addColorStop(0, '#FBF2DA'); cg.addColorStop(1, '#E8D8B0');
  ctx.fillStyle = cg;
  var sw = bw * 0.2;
  ctx.beginPath();
  ctx.moveTo(bx + bw * 0.62, by - 1);
  ctx.lineTo(bx + bw * 0.62 + sw, by - 1);
  ctx.lineTo(bx + bw * 0.12 + sw, by + bh + 1);
  ctx.lineTo(bx + bw * 0.12, by + bh + 1);
  ctx.closePath(); ctx.fill();
  // Glossy highlight
  var hg = ctx.createLinearGradient(0, by, 0, by + bh * 0.5);
  hg.addColorStop(0, 'rgba(255,255,255,0.55)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  rRect(bx + 3 * S, by + 2 * S, bw - 6 * S, bh * 0.4, 4 * S); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  rRect(bx + 5 * S, by + 3 * S, bw * 0.18, 2.5 * S, 1.2 * S); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#A0101B'; ctx.lineWidth = 1 * S;
  rRect(bx, by, bw, bh, 6 * S); ctx.stroke();
}

function drawChocoBar(w, h) {
  var bx = -w / 2 + w * 0.03, bw = w * 0.94, by = -h / 2, bh = h;
  // Base / thickness
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 3 * S;
  ctx.fillStyle = '#4E220E';
  rRect(bx, by + 2 * S, bw, bh - 1 * S, 7 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  var tg = ctx.createLinearGradient(0, by, 0, by + bh);
  tg.addColorStop(0, '#8E5030'); tg.addColorStop(1, '#6A3418');
  ctx.fillStyle = tg;
  rRect(bx, by, bw, bh - 3 * S, 7 * S); ctx.fill();

  // 2 x 4 squares
  var pad = 3 * S, gap = 2.5 * S;
  var cw = (bw - pad * 2 - gap * 3) / 4, chh = (bh - 3 * S - pad * 2 - gap) / 2;
  for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) {
    var sx = bx + pad + c * (cw + gap), sy = by + pad + r * (chh + gap);
    ctx.fillStyle = '#4A200C';
    rRect(sx, sy + 1.2 * S, cw, chh, 3 * S); ctx.fill();
    var sg = ctx.createLinearGradient(0, sy, 0, sy + chh);
    sg.addColorStop(0, '#B07048'); sg.addColorStop(1, '#84462A');
    ctx.fillStyle = sg;
    rRect(sx, sy, cw, chh - 0.8 * S, 3 * S); ctx.fill();
    ctx.fillStyle = 'rgba(255,225,200,0.35)';
    rRect(sx + 1.5 * S, sy + 1 * S, cw - 3 * S, Math.max(1, chh * 0.22), 1.5 * S); ctx.fill();
  }
  ctx.strokeStyle = '#3E1A08'; ctx.lineWidth = 1 * S;
  rRect(bx, by, bw, bh - 1 * S, 7 * S); ctx.stroke();
}

function drawChocoCracks(w, h) {
  var bw = w * 0.94, bh = h;
  var x0 = -bw / 2, y0 = -bh / 2;
  // Points in 0..1 bar space, matching the reference crack pattern
  var main = [[0.10, 0.02], [0.18, 0.20], [0.25, 0.30], [0.36, 0.42], [0.42, 0.50], [0.50, 0.44], [0.58, 0.60], [0.70, 0.72], [0.80, 0.80], [0.88, 0.97]];
  var branch1 = [[0.50, 0.44], [0.56, 0.32], [0.62, 0.20]];
  var branch2 = [[0.46, 0.50], [0.44, 0.66], [0.47, 0.80], [0.45, 0.96]];
  var paths = [main, branch1, branch2];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (var pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? 'rgba(210,150,110,0.55)' : '#2A0F04';
    ctx.lineWidth = (pass === 0 ? 2.6 : 1.4) * S;
    for (var p = 0; p < paths.length; p++) {
      var pts = paths[p];
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var px = x0 + pts[i][0] * bw, py = y0 + pts[i][1] * bh + (pass === 0 ? 0.8 * S : 0);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
}

// Overlay drawn on top of the real tray right after the chocolate shatters
function drawChocoReveal(b, w, h) {
  var t = b.chocoRevealT;
  ctx.fillStyle = 'rgba(255,255,255,' + (t * 0.7) + ')';
  rRect(-w / 2, -h / 2, w, h, 8 * S); ctx.fill();
  // Leftover chocolate chunks sliding off the tray
  var fall = (1 - t) * h * 1.2;
  ctx.globalAlpha = Math.max(0, t);
  var chunks = [[-0.38, -0.2], [-0.15, 0.1], [0.1, -0.15], [0.32, 0.12], [0.4, -0.25], [-0.3, 0.25]];
  for (var i = 0; i < chunks.length; i++) {
    var cx = chunks[i][0] * w + (chunks[i][0] < 0 ? -1 : 1) * (1 - t) * w * 0.2;
    var cy = chunks[i][1] * h + fall;
    ctx.fillStyle = i % 2 ? '#84462A' : '#6A3418';
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((1 - t) * (i % 2 ? 2 : -2));
    rRect(-w * 0.07, -h * 0.16, w * 0.14, h * 0.32, 2 * S); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ── Sounds ──
function chocoNoise(dur, vol, freq, q) {
  ensureAudio();
  var t = audioCtx.currentTime;
  var len = Math.floor(audioCtx.sampleRate * dur);
  var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  var f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
  var g = audioCtx.createGain(); g.gain.setValueAtTime(vol, t);
  src.connect(f); f.connect(g); g.connect(audioCtx.destination);
  src.start(t);
}

var chocoSfx = {
  unwrap: function () {
    // Light crinkly pop
    for (var i = 0; i < 5; i++) {
      (function (k) { setTimeout(function () { chocoNoise(0.05, 0.12, 3000 + Math.random() * 3000, 2); }, k * 35); })(i);
    }
    tone(1200, 0.08, 'triangle', 0.06, 1800);
  },
  crack: function () {
    // Sharper snap, pitched up
    chocoNoise(0.09, 0.3, 1800, 1.5);
    tone(700, 0.07, 'square', 0.05, 250);
    setTimeout(function () { chocoNoise(0.05, 0.15, 2600, 2); }, 60);
  },
  shatter: function () {
    // Big shatter + reveal chime
    chocoNoise(0.25, 0.4, 1200, 0.8);
    for (var i = 0; i < 4; i++) {
      (function (k) { setTimeout(function () { chocoNoise(0.06, 0.18, 1500 + Math.random() * 2500, 2); }, 50 + k * 45); })(i);
    }
    [784, 988, 1319].forEach(function (f, i) { setTimeout(function () { tone(f, 0.22, 'sine', 0.1); }, 120 + i * 80); });
  }
};
