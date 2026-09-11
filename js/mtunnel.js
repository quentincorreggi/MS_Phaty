// ============================================================
// mtunnel.js — Multi Cell Tunnel ("the mushroom")
// ============================================================
// A Tunnel spin-off that occupies TWO cells and has TWO mouths
// instead of one, fed by a SINGLE shared stock of boxes.
//
//   • Horizontal footprint: 2 cells side by side.
//     Head cell = left  → its mouth spawns LEFT.
//     Tail cell = right → its mouth spawns RIGHT.
//   • Vertical footprint: 2 cells stacked.
//     Head cell = top    → its mouth spawns UP.
//     Tail cell = bottom → its mouth spawns DOWN.
//
// The mouths are back to back along the footprint axis, so the
// structure splits a region in two and the player decides which
// half gets fed — by choosing which side to play.
//
// The stock is common to the whole entity: the next box out is
// the next box in one ordered list, whichever mouth called for
// it. The counter (centred on the seam between the two cells)
// shows the boxes still INSIDE the structure. When the stock is
// empty the mushroom disappears, freeing its two cells.
//
// Grid data:
//   head → { mtunnel: true, role: 'head', orient: 'h'|'v', contents: [{ci,type}...] }
//   tail → { mtunnel: true, role: 'tail', orient: 'h'|'v' }
// The tail always sits at head+1 (horizontal) or head+7 (vertical).
// ============================================================

var MTUNNEL_SPAWN_COOLDOWN = 40;   // ticks between spawns, per mouth
var MTUNNEL_START_COOLDOWN = 60;   // grace period at level start
var MTUNNEL_VANISH_SPEED = 0.022;  // ~45 frames for the disappearance
var MTUNNEL_MAX_STOCK = 6;         // hard limit, same family as Tunnel
var MTUNNEL_SOFT_STOCK = 4;        // recommended stock

var MT_CAP = { light: '#F0785F', fill: '#D6472E', dark: '#95281A' };
var MT_STEM = { light: '#FCF3E0', fill: '#EDDCBB', dark: '#C0A87E' };

var MT_ORIENT_LABEL = { h: 'Horizontal', v: 'Vertical' };
// Mouth names per orientation, [head, tail]
var MT_MOUTH_LABEL = { h: ['Left', 'Right'], v: ['Up', 'Down'] };
var MT_MOUTH_ARROW = { h: ['◀', '▶'], v: ['▲', '▼'] };

// ── Geometry ──

// The two cells of an entity, given the head index and orientation.
function mtTailIdx(headIdx, orient, cols, rows) {
  cols = cols || 7; rows = rows || cols;
  var row = Math.floor(headIdx / cols), col = headIdx % cols;
  if (orient === 'v') {
    if (row + 1 >= rows) return -1;
    return (row + 1) * cols + col;
  }
  if (col + 1 >= cols) return -1;
  return row * cols + (col + 1);
}

// The cell a given mouth spawns into. role is 'head' or 'tail'.
function mtMouthTargetIdx(cellIdx, orient, role, cols, rows) {
  cols = cols || 7; rows = rows || cols;
  var row = Math.floor(cellIdx / cols), col = cellIdx % cols;
  var tr = row, tc = col;
  if (orient === 'v') tr = (role === 'head') ? row - 1 : row + 1;
  else tc = (role === 'head') ? col - 1 : col + 1;
  if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) return -1;
  return tr * cols + tc;
}

// Runtime version — reads orientation/role off the stock cell.
function getMTunnelExitIdx(cellIdx) {
  var s = stock[cellIdx];
  if (!s || !s.isMTunnel) return -1;
  return mtMouthTargetIdx(cellIdx, s.mtOrient, s.mtRole, L.cols, L.rows);
}

// Screen footprint of the whole entity, measured from its head cell.
// len runs along the footprint axis, thk across it.
function mtFootprint(head) {
  if (head.mtOrient === 'v') {
    var vlen = 2 * L.bh + L.bg;
    return { cx: head.x + L.bw / 2, cy: head.y + vlen / 2, len: vlen, thk: L.bw };
  }
  var hlen = 2 * L.bw + L.bg;
  return { cx: head.x + hlen / 2, cy: head.y + L.bh / 2, len: hlen, thk: L.bh };
}

function mtHeadOf(cell) {
  if (!cell || !cell.isMTunnel) return null;
  return stock[cell.mtHeadIdx] || null;
}

// ── Sound ──
// The push-out cue carries a light spatial bias toward the side
// that fired, so the player feels which mouth responded.

function mtToneAt(freq, dur, type, vol, ramp, pan) {
  ensureAudio();
  var t = audioCtx.currentTime;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (ramp) o.frequency.exponentialRampToValueAtTime(ramp, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  if (audioCtx.createStereoPanner) {
    var p = audioCtx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan || 0)), t);
    g.connect(p); p.connect(audioCtx.destination);
  } else {
    g.connect(audioCtx.destination);
  }
  o.start(t); o.stop(t + dur);
}

// side: -1 = head mouth (left/up), +1 = tail mouth (right/down)
// horizontal biases the stereo field, vertical biases the pitch
function mtPushSfx(side, orient) {
  var pan = (orient === 'v') ? side * 0.2 : side * 0.6;
  var base = (orient === 'v') ? (side < 0 ? 880 : 720) : 800;
  mtToneAt(base, 0.13, 'sine', 0.13, base * 0.4, pan);
  // Counter decrement tick — tied to the push-out, not a separate beat
  setTimeout(function () {
    mtToneAt(1650, 0.05, 'square', 0.035, 1200, pan);
  }, 70);
}

function mtVanishSfx() {
  [740, 560, 415].forEach(function (f, i) {
    setTimeout(function () { mtToneAt(f, 0.22, 'sine', 0.09, f * 0.75, 0); }, i * 110);
  });
  setTimeout(function () { mtToneAt(180, 0.4, 'triangle', 0.05, 90, 0); }, 220);
}

// ── Spawning + lifecycle (called from update) ──

function updateMultiTunnels() {
  var i, s;

  // 1. Timers
  for (i = 0; i < stock.length; i++) {
    s = stock[i];
    if (!s || !s.isMTunnel) continue;
    if (s.mtPulseT > 0) s.mtPulseT = Math.max(0, s.mtPulseT - 0.05);
  }

  // 2. Each mouth serves itself from the shared stock
  for (i = 0; i < stock.length; i++) {
    s = stock[i];
    if (!s || !s.isMTunnel) continue;
    var head = mtHeadOf(s);
    if (!head || !head.mtContents) continue;
    if (head.mtVanishT > 0) continue;            // already going
    if (head.mtContents.length === 0) continue;
    if (s.mtSpawning) continue;
    if (s.mtCooldown > 0) { s.mtCooldown--; continue; }

    var exitIdx = getMTunnelExitIdx(i);
    if (exitIdx < 0) continue;
    if (!isTileAvailableForTunnel(exitIdx)) continue;

    // Pull the next box off the single shared list
    var nextBox = head.mtContents.shift();
    s.mtSpawning = true;
    s.mtCooldown = MTUNNEL_SPAWN_COOLDOWN;
    s.mtPulseT = 1;

    stock[exitIdx] = makeTunnelSpawnedBox(exitIdx, nextBox);

    // Push-out feedback: particles slide from the mouth to the cell
    var side = (s.mtRole === 'head') ? -1 : 1;
    var mx = s.x + L.bw / 2, my = s.y + L.bh / 2;
    var ex = stock[exitIdx].x + L.bw / 2, ey = stock[exitIdx].y + L.bh / 2;
    spawnBurst(mx, my, '#FFD9A0', 8);
    spawnBurst(ex, ey, '#FFD080', 10);
    for (var p = 0; p < 6; p++) {
      var f = p / 6;
      particles.push({
        x: mx + (ex - mx) * f, y: my + (ey - my) * f,
        vx: (ex - mx) * 0.035, vy: (ey - my) * 0.035,
        r: (2 + Math.random() * 3) * S, color: '#FFF0C8',
        life: 0.9, decay: 0.035, grav: false
      });
    }
    mtPushSfx(side, s.mtOrient);

    // Re-evaluate reveals: the new box may itself be open, and any box
    // that relied on the now-occupied cell as its path closes.
    if (typeof updateBoxReveals === 'function') updateBoxReveals(true);

    (function (cell) {
      setTimeout(function () { cell.mtSpawning = false; }, 350);
    })(s);
  }

  // 3. Spent mushrooms leave the board
  for (i = 0; i < stock.length; i++) {
    s = stock[i];
    if (!s || !s.isMTunnel || s.mtRole !== 'head') continue;

    if (s.mtVanishT > 0) {
      s.mtVanishT = Math.max(0, s.mtVanishT - MTUNNEL_VANISH_SPEED);
      if (s.mtVanishT <= 0) mtFinishVanish(s);
      continue;
    }
    if (!s.mtContents || s.mtContents.length > 0) continue;

    // Wait for both mouths to finish their last push-out, so the
    // final delivery and the disappearance read as one beat.
    var tail = stock[s.mtTailIdx];
    if (s.mtSpawning || (tail && tail.mtSpawning)) continue;

    mtStartVanish(s);
  }
}

function mtStartVanish(head) {
  head.mtVanishT = 1;
  var fp = mtFootprint(head);
  spawnBurst(fp.cx, fp.cy, MT_CAP.light, 18);
  spawnBurst(fp.cx, fp.cy, MT_STEM.light, 12);
  for (var p = 0; p < 14; p++) {
    var a = Math.PI * 2 * p / 14 + Math.random() * 0.4;
    particles.push({
      x: fp.cx + Math.cos(a) * fp.len * 0.3,
      y: fp.cy + Math.sin(a) * fp.thk * 0.3,
      vx: Math.cos(a) * (1 + Math.random() * 2) * S,
      vy: -(1.5 + Math.random() * 3) * S,
      r: (2 + Math.random() * 4) * S,
      color: Math.random() > 0.5 ? MT_CAP.fill : MT_STEM.fill,
      life: 1, decay: 0.014 + Math.random() * 0.012, grav: true
    });
  }
  mtVanishSfx();
}

// The two cells become plain empty slots — they were never playable,
// so nothing about the board's behaviour changes, they just open up.
function mtFinishVanish(head) {
  var idxs = [head.mtHeadIdx, head.mtTailIdx];
  for (var k = 0; k < idxs.length; k++) {
    var idx = idxs[k];
    if (idx < 0 || idx >= stock.length) continue;
    var row = Math.floor(idx / L.cols), col = idx % L.cols;
    stock[idx] = {
      ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
      revealed: true, empty: true, boxType: 'default',
      isTunnel: false, isMTunnel: false, isWall: false,
      iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
      x: L.sx + col * (L.bw + L.bg), y: L.sy + row * (L.bh + L.bg),
      shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
    };
  }
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

// ── Drawing ──
// The mushroom is assembled from the same four parts in both
// footprints — one cap, one stem, two mouths, one counter — but each
// footprint lays them out upright rather than rotating the whole
// sprite, because a cap rotated onto its side stops reading as a cap.
//
//   Horizontal: wide cap across both cells, mouths left + right
//               beneath its rim, counter on the seam.
//   Vertical:   cap centred on the seam, mouths above and below it,
//               stem running down toward the lower mouth.
//
// Either way there is one cap, one stem and one counter across the
// two cells, so the entity reads as a single thing that can spawn at
// two exits — never as two adjacent Tunnels.

function drawMTunnelOnGrid(ctx, head, S, tick) {
  var fp = mtFootprint(head);
  var vert = (head.mtOrient === 'v');
  var fw = vert ? fp.thk : fp.len;   // footprint width on screen
  var fh = vert ? fp.len : fp.thk;   // footprint height on screen
  var span = Math.min(fw, fh);       // the "one cell" dimension

  var vanish = head.mtVanishT > 0 ? (1 - head.mtVanishT) : 0;
  var remaining = head.mtContents ? head.mtContents.length : 0;
  var tailCell = stock[head.mtTailIdx];
  var glowA = head.mtPulseT || 0;
  var glowB = (tailCell && tailCell.mtPulseT) || 0;

  // ── Part geometry, per footprint ──
  var capSpan, capRise, capBase, stemW, stemTop, stemBot, mouths;
  if (vert) {
    capSpan = fw * 0.96;
    capRise = fh * 0.38;
    capBase = fh * 0.055;               // cap sits just below the seam
    stemW = fw * 0.40;
    stemTop = capBase - fh * 0.01;
    stemBot = fh * 0.335;
    var vDepth = fh * 0.175, vSpan = fw * 0.50;
    mouths = [
      { x: 0, y: -fh / 2 + vDepth / 2, depth: vDepth, span: vSpan, dir: 'u', glow: glowA },
      { x: 0, y: fh / 2 - vDepth / 2, depth: vDepth, span: vSpan, dir: 'd', glow: glowB }
    ];
  } else {
    capSpan = fw * 0.98;
    capRise = fh * 0.60;
    capBase = fh * 0.02;
    stemW = fh * 0.44;
    stemTop = capBase - fh * 0.02;
    stemBot = fh * 0.46;
    var hDepth = fh * 0.44, hSpan = fh * 0.44;
    mouths = [
      { x: -fw / 2 + hDepth / 2 + fh * 0.03, y: fh * 0.26, depth: hDepth, span: hSpan, dir: 'l', glow: glowA },
      { x: fw / 2 - hDepth / 2 - fh * 0.03, y: fh * 0.26, depth: hDepth, span: hSpan, dir: 'r', glow: glowB }
    ];
  }

  ctx.save();
  if (vanish > 0) ctx.globalAlpha = Math.max(0, 1 - vanish * 1.05);

  // The whole mushroom lifts away as it goes
  ctx.translate(fp.cx, fp.cy - vanish * fh * 0.6);
  var vs = 1 + vanish * 0.2;
  ctx.scale(vs, vs);
  ctx.rotate(Math.sin(tick * 0.028 + (head.mtPhase || 0)) * 0.012 + vanish * 0.09);

  // ── Ground shadow — one shadow, for one entity ──
  ctx.fillStyle = 'rgba(70,55,40,0.12)';
  ctx.beginPath();
  ctx.ellipse(0, fh * 0.44, fw * 0.42, span * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Mouths, drawn under the cap ──
  for (var m = 0; m < mouths.length; m++) {
    var mo = mouths[m];
    mtDrawMouth(ctx, mo.x, mo.y, mo.depth, mo.span, mo.dir, S, mo.glow, tick);
  }

  // ── Stem — one stem, centred on the seam ──
  mtDrawStem(ctx, stemW, stemTop, stemBot, S);

  // ── Cap — one continuous cap across BOTH cells ──
  mtDrawCap(ctx, capBase, capSpan, capRise, S, tick, remaining, head.mtPhase || 0, vanish);

  ctx.restore();

  // ── Counter — one badge on the cap, on the seam, always upright ──
  if (vanish < 0.35) {
    var by = fp.cy - (vert ? fh * 0.11 : fh * 0.24) - vanish * fh * 0.6;
    mtDrawCounter(ctx, fp.cx, by, span, S, remaining, Math.max(glowA, glowB),
      vanish > 0 ? Math.max(0, 1 - vanish * 3) : 1);
  }
}

// One mouth: a dark arch opening toward dir ('l','r','u','d'), with a
// bright arrow pointing the same way. Mouth direction is the whole
// decision, so it has to be at least as clear as on a regular Tunnel.
function mtDrawMouth(ctx, mx, my, depth, mspan, dir, S, glow, tick) {
  var rot = 0;
  if (dir === 'd') rot = Math.PI / 2;
  else if (dir === 'l') rot = Math.PI;
  else if (dir === 'u') rot = -Math.PI / 2;

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(rot);
  // Local frame: the opening faces +x, depth along x, span across y.
  var hd = depth / 2, hs = mspan / 2, r = hs;

  // Push-out glow spilling out of the mouth that just fired
  if (glow > 0) {
    var gg = ctx.createRadialGradient(hd * 0.4, 0, hs * 0.2, hd * 0.4, 0, hs * 2.6);
    gg.addColorStop(0, 'rgba(255,226,152,' + (0.55 * glow) + ')');
    gg.addColorStop(1, 'rgba(255,226,152,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(hd * 0.4, 0, hs * 2.6, 0, Math.PI * 2); ctx.fill();
  }

  // Dark opening — rounded at the back, open at the front
  ctx.beginPath();
  ctx.moveTo(hd, -hs);
  ctx.lineTo(-hd + r, -hs);
  ctx.arc(-hd + r, 0, r, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(hd, hs);
  ctx.closePath();
  var mg = ctx.createLinearGradient(-hd, 0, hd, 0);
  mg.addColorStop(0, '#1B1220');
  mg.addColorStop(0.55, '#2C2032');
  mg.addColorStop(1, '#48344F');
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,238,205,0.42)';
  ctx.lineWidth = 1.5 * S;
  ctx.stroke();

  // Outward arrow
  var aS = hs * 0.62 * (1 + glow * 0.28);
  var ax = hd * 0.18;
  var pulse = 0.74 + Math.sin(tick * 0.07) * 0.12 + glow * 0.26;
  ctx.fillStyle = 'rgba(255,216,128,' + Math.min(1, pulse) + ')';
  ctx.beginPath();
  ctx.moveTo(ax + aS, 0);
  ctx.lineTo(ax - aS * 0.55, -aS * 0.88);
  ctx.lineTo(ax - aS * 0.55, aS * 0.88);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function mtDrawStem(ctx, stemW, stemTop, stemBot, S) {
  var g = ctx.createLinearGradient(-stemW * 0.6, 0, stemW * 0.6, 0);
  g.addColorStop(0, MT_STEM.light);
  g.addColorStop(0.55, MT_STEM.fill);
  g.addColorStop(1, MT_STEM.dark);
  ctx.fillStyle = g;
  var h = stemBot - stemTop;
  ctx.beginPath();
  ctx.moveTo(-stemW * 0.42, stemTop);
  ctx.bezierCurveTo(-stemW * 0.44, stemTop + h * 0.5, -stemW * 0.62, stemTop + h * 0.82, -stemW * 0.60, stemBot);
  ctx.quadraticCurveTo(0, stemBot + h * 0.14, stemW * 0.60, stemBot);
  ctx.bezierCurveTo(stemW * 0.62, stemTop + h * 0.82, stemW * 0.44, stemTop + h * 0.5, stemW * 0.42, stemTop);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,120,80,0.32)';
  ctx.lineWidth = 1.2 * S;
  ctx.stroke();
}

function mtDrawCap(ctx, capBase, capSpan, capRise, S, tick, remaining, phase, vanish) {
  var HS = capSpan / 2;
  var top = capBase - capRise;
  var belly = capRise * 0.20;

  function capPath() {
    ctx.beginPath();
    ctx.moveTo(-HS, capBase);
    ctx.bezierCurveTo(-HS * 0.94, top + capRise * 0.34, -HS * 0.44, top, 0, top);
    ctx.bezierCurveTo(HS * 0.44, top, HS * 0.94, top + capRise * 0.34, HS, capBase);
    ctx.quadraticCurveTo(0, capBase + belly, -HS, capBase);
    ctx.closePath();
  }

  ctx.save();
  capPath();
  ctx.shadowColor = 'rgba(0,0,0,0.24)';
  ctx.shadowBlur = 7 * S;
  ctx.shadowOffsetY = 2.5 * S;
  var cg = ctx.createLinearGradient(0, top, 0, capBase + belly);
  cg.addColorStop(0, MT_CAP.light);
  cg.addColorStop(0.55, MT_CAP.fill);
  cg.addColorStop(1, MT_CAP.dark);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.restore();

  // Underside shading + cream spots, clipped to the cap
  ctx.save();
  capPath();
  ctx.clip();
  ctx.fillStyle = 'rgba(110,38,24,0.42)';
  ctx.fillRect(-HS, capBase - belly * 0.5, capSpan, belly * 3);
  ctx.fillStyle = 'rgba(255,246,225,0.9)';
  var spots = [
    [-0.60, 0.28, 0.26], [-0.22, 0.14, 0.19], [0.20, 0.30, 0.29],
    [0.62, 0.20, 0.21], [-0.86, 0.62, 0.16], [0.88, 0.58, 0.17],
    [-0.02, 0.62, 0.14]
  ];
  for (var s = 0; s < spots.length; s++) {
    var sx = spots[s][0] * HS;
    var sy = top + spots[s][1] * capRise;
    var sr = spots[s][2] * capRise * 0.42;
    ctx.beginPath();
    ctx.ellipse(sx, sy, sr * 1.12, sr, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  var sheen = ctx.createLinearGradient(0, top, 0, top + capRise * 0.7);
  sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-HS, top, capSpan, capRise * 0.7);
  ctx.restore();

  // Rim
  ctx.strokeStyle = 'rgba(120,40,26,0.5)';
  ctx.lineWidth = 1.6 * S;
  ctx.beginPath();
  ctx.moveTo(-HS, capBase);
  ctx.bezierCurveTo(-HS * 0.94, top + capRise * 0.34, -HS * 0.44, top, 0, top);
  ctx.bezierCurveTo(HS * 0.44, top, HS * 0.94, top + capRise * 0.34, HS, capBase);
  ctx.stroke();

  // Alive while stock remains
  if (remaining > 0 && vanish === 0) {
    ctx.save();
    ctx.globalAlpha = 0.05 + Math.sin(tick * 0.045 + phase) * 0.035;
    ctx.fillStyle = '#FFE7B0';
    capPath();
    ctx.fill();
    ctx.restore();
  }
}

function mtDrawCounter(ctx, bx, by, span, S, remaining, glow, alpha) {
  var R = span * 0.23;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  // Tick pop on decrement — the only moment the shared stock speaks
  ctx.translate(bx, by);
  var pop = 1 + glow * 0.22;
  ctx.scale(pop, pop);

  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 1.5 * S;
  var g = ctx.createLinearGradient(0, -R, 0, R);
  g.addColorStop(0, 'rgba(255,248,228,0.98)');
  g.addColorStop(1, 'rgba(246,217,164,0.98)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(150,60,40,0.7)';
  ctx.lineWidth = 2 * S;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = remaining > 0 ? '#8E2A1C' : 'rgba(140,120,100,0.75)';
  ctx.font = 'bold ' + (R * 1.35) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(remaining, 0, R * 0.06);

  ctx.restore();
}

// ── Editor validation ──
// Both mouths must have a populatable cell in front of them. A cell
// off the grid, a wall, a Tunnel or another Multi Cell Tunnel would
// strand the shared stock, so those are hard errors.

function mtValidate(grid, headIdx, orient) {
  var res = { ok: true, errors: [], hints: [], tailIdx: mtTailIdx(headIdx, orient, 7) };
  if (res.tailIdx < 0) {
    res.ok = false;
    res.errors.push('Second cell falls outside the grid');
    return res;
  }
  var cells = [{ idx: headIdx, role: 'head' }, { idx: res.tailIdx, role: 'tail' }];
  for (var k = 0; k < cells.length; k++) {
    var name = MT_MOUTH_LABEL[orient][k];
    var t = mtMouthTargetIdx(cells[k].idx, orient, cells[k].role, 7, 7);
    if (t < 0) {
      res.ok = false;
      res.errors.push(name + ' mouth points off the grid');
      continue;
    }
    var c = grid[t];
    if (c && c.wall) {
      res.ok = false;
      res.errors.push(name + ' mouth is blocked by a wall');
    } else if (c && c.tunnel) {
      res.ok = false;
      res.errors.push(name + ' mouth is blocked by a tunnel');
    } else if (c && c.mtunnel) {
      res.ok = false;
      res.errors.push(name + ' mouth is blocked by another mushroom');
    } else if (!c) {
      res.hints.push(name + ' mouth starts on an empty cell');
    }
  }
  return res;
}

// The head index of the entity a given editor-grid cell belongs to,
// or -1 if the cell is not part of a well-formed Multi Cell Tunnel.
function mtHeadIdxOfCell(grid, idx) {
  var c = grid[idx];
  if (!c || !c.mtunnel) return -1;
  var orient = c.orient || 'h';
  if (c.role === 'head') {
    var t = mtTailIdx(idx, orient, 7);
    if (t < 0) return -1;
    var tc = grid[t];
    return (tc && tc.mtunnel && tc.role === 'tail') ? idx : -1;
  }
  var h = (orient === 'v') ? idx - 7 : idx - 1;
  if (h < 0) return -1;
  if (orient !== 'v' && Math.floor(h / 7) !== Math.floor(idx / 7)) return -1;
  var hc = grid[h];
  return (hc && hc.mtunnel && hc.role === 'head') ? h : -1;
}

// Every Multi Cell Tunnel on a grid, as { headIdx, orient, contents }.
function mtCollect(grid) {
  var out = [];
  for (var i = 0; i < grid.length; i++) {
    var c = grid[i];
    if (!c || !c.mtunnel || c.role !== 'head') continue;
    var tail = mtTailIdx(i, c.orient || 'h', 7);
    if (tail < 0) continue;
    var tc = grid[tail];
    if (!tc || !tc.mtunnel || tc.role !== 'tail') continue;
    out.push({ headIdx: i, tailIdx: tail, orient: c.orient || 'h', contents: c.contents || [] });
  }
  return out;
}
