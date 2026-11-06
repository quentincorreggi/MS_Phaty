// ============================================================
// snowman.js — Snowman mechanic (3 states)
//
// One 2x2 snowman per level (level.snowman = top-left cell index).
// He sits ABOVE the 4 cells under him: they are hidden, untappable,
// and block paths like walls until he leaves.
//
// Exactly 3 snowy boxes (box_snowy.js) per level. The moment one opens
// (gets a path to the bottom) its snow flies to the snowman:
//   pile (hat + carrot waiting) → 1: base ball → 2: middle ball → 3: head
// On the 3rd, the hat and carrot jump on, his face appears, he does a
// happy jump, winks, then collapses into himself like a planet, swirling
// down to a point. A small star twinkles where he stood, then fades,
// and the 4 boxes under him play as normal boxes.
// ============================================================

var snowman = null;
var snowFlyers = [];
var SNOW_STATES = 3;

// Finale timeline (frames)
var SM_ACC_END = 22;     // hat + carrot jump onto him
var SM_FACE_END = 36;    // face fades in
var SM_JUMP_START = 38, SM_JUMP_END = 60;
var SM_WINK_START = 68, SM_WINK_END = 92;
var SM_EXIT_START = 102, SM_EXIT_END = 146;
var SM_STAR_END = 196;

// ── Sounds (soft noise "poof" + packing thump) ──
function snowNoise(dur, vol, freq) {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var len = Math.floor(audioCtx.sampleRate * dur);
  var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  var f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  var g = audioCtx.createGain(); g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur);
}
sfx.snowPuff = function () { snowNoise(0.25, 0.18, 2200); tone(1200, 0.15, 'sine', 0.04, 1800); };
sfx.snowPack = function () { snowNoise(0.18, 0.3, 700); tone(180, 0.15, 'sine', 0.12, 90); };
sfx.snowFace = function () { [784, 988, 1175].forEach(function (f, i) { setTimeout(function () { tone(f, 0.18, 'triangle', 0.09); }, i * 70); }); };
sfx.snowHop = function () { tone(500, 0.12, 'sine', 0.08, 900); };
sfx.snowWink = function () { tone(1400, 0.1, 'sine', 0.08, 2000); };
sfx.snowSwirl = function () { tone(900, 0.5, 'sine', 0.07, 200); snowNoise(0.45, 0.12, 2500); };
sfx.snowStar = function () { [1568, 2093].forEach(function (f, i) { setTimeout(function () { tone(f, 0.25, 'sine', 0.07); }, i * 90); }); };

// ── Init (called from initGame after stock is built, before reveals) ──
function initSnowman(lvl) {
  snowman = null;
  snowFlyers = [];
  var total = 0;
  for (var i = 0; i < stock.length; i++) {
    stock[i].underSnowman = false;
    stock[i].snowPuffT = 0;
    if (!stock[i].isTunnel && !stock[i].isWall && !stock[i].empty && stock[i].boxType === 'snowy') total++;
  }
  if (lvl.snowman === undefined || lvl.snowman === null || lvl.snowman < 0) return;
  var r = Math.floor(lvl.snowman / L.cols), c = lvl.snowman % L.cols;
  if (r > L.rows - 2) r = L.rows - 2;
  if (c > L.cols - 2) c = L.cols - 2;
  var cells = [r * L.cols + c, r * L.cols + c + 1, (r + 1) * L.cols + c, (r + 1) * L.cols + c + 1];
  for (var k = 0; k < cells.length; k++) {
    var b = stock[cells[k]];
    b.underSnowman = true;
    // No snow under the snowman: anything there stays a plain box
    if (b.boxType === 'snowy') { b.boxType = 'default'; total--; }
  }
  var tl = stock[cells[0]];
  snowman = {
    cells: cells,
    x: tl.x, y: tl.y,
    w: 2 * L.bw + L.bg, h: 2 * L.bh + L.bg,
    total: total, arrived: 0,
    state: 0, pending: 0, animT: 0,
    shakeT: 0,
    phase: 'build', finT: 0, released: false,
    lastFlyTick: -1, flyStack: 0
  };
}

// Active = still on the board, blocking and hiding his cells
function isSnowmanActive() { return !!(snowman && snowman.phase !== 'gone' && !snowman.released); }

function snowmanHitTest(px, py) {
  if (!isSnowmanActive()) return false;
  return px >= snowman.x && px <= snowman.x + snowman.w && py >= snowman.y && py <= snowman.y + snowman.h;
}

// ── Called by updateBoxReveals when a snowy box opens ──
function onSnowyRevealed(b, animate) {
  b.boxType = 'default';
  b.snowPuffT = animate ? 1 : 0;
  var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
  if (animate) {
    for (var p = 0; p < 14; p++) {
      var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      particles.push({ x: bx, y: by - L.bh * 0.2, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
        r: (2 + Math.random() * 3.5) * S, color: Math.random() > 0.4 ? '#FFFFFF' : '#D6E8F7',
        life: 0.9, decay: 0.025 + Math.random() * 0.02, grav: false });
    }
    sfx.snowPuff();
  }
  if (!isSnowmanActive() || snowman.total <= 0) return;
  // Stagger flyers launched on the same frame (one pick opening two boxes)
  if (snowman.lastFlyTick === tick) snowman.flyStack++; else { snowman.flyStack = 0; snowman.lastFlyTick = tick; }
  snowFlyers.push({ x0: bx, y0: by, t: -0.4 * snowman.flyStack, seed: Math.random() * 10 });
}

// ── Layout of the figure (full-size positions) ──
function snowmanGeom() {
  var sm = snowman;
  var w = sm.w;
  var cx = sm.x + sm.w / 2;
  var ground = sm.y + sm.h * 0.9;
  var rb = w * 0.22, rm = w * 0.165, rh = w * 0.13;
  var by = ground - rb;
  var my = by - (rb + rm) * 0.8;
  var hy = my - (rm + rh) * 0.8;
  return { cx: cx, ground: ground, rb: rb, by: by, rm: rm, my: my, rh: rh, hy: hy };
}

// Where flying snow lands: the spot of the next ball
function snowmanLandPoint() {
  var g = snowmanGeom();
  var next = Math.min(snowman.pending, SNOW_STATES - 1);
  if (next <= 0) return { x: g.cx, y: g.by };
  if (next === 1) return { x: g.cx, y: g.my };
  return { x: g.cx, y: g.hy };
}

function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function easeOutBounce(t) {
  var n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
  if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
  t -= 2.625 / d1; return n1 * t * t + 0.984375;
}
function smClamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

// ── Per-frame update (called from game.js update) ──
function updateSnowman() {
  if (!snowman) return;
  var sm = snowman;

  // Flyers
  for (var i = snowFlyers.length - 1; i >= 0; i--) {
    var f = snowFlyers[i];
    f.t += 0.026;
    if (f.t >= 1) {
      snowFlyers.splice(i, 1);
      sm.arrived++;
      sm.pending = Math.min(SNOW_STATES, Math.round(SNOW_STATES * sm.arrived / sm.total));
      var lp = snowmanLandPoint();
      for (var p = 0; p < 14; p++) {
        var a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
        particles.push({ x: lp.x, y: lp.y, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
          r: (2 + Math.random() * 3) * S, color: Math.random() > 0.3 ? '#FFFFFF' : '#CFE1F0',
          life: 0.8, decay: 0.03 + Math.random() * 0.02, grav: true });
      }
    }
  }

  // Next state anim (one at a time, in order)
  if (sm.animT > 0) {
    var prev = sm.animT;
    sm.animT = Math.max(0, sm.animT - 0.03);
    // packing thump when the ball lands
    if (prev > 0.55 && sm.animT <= 0.55) sfx.snowPack();
  } else if (sm.state < sm.pending) {
    sm.state++;
    sm.animT = 1;
  }
  if (sm.shakeT > 0) sm.shakeT = Math.max(0, sm.shakeT - 0.04);

  // Finale
  if (sm.phase === 'build' && sm.state >= SNOW_STATES && sm.animT <= 0 && snowFlyers.length === 0) {
    sm.phase = 'finale'; sm.finT = 0;
    sfx.snowFace();
  }
  if (sm.phase === 'finale') {
    sm.finT++;
    var g = snowmanGeom();
    var fcy = (g.hy + g.by) / 2;
    if (sm.finT === SM_JUMP_START) sfx.snowHop();
    if (sm.finT === SM_WINK_START) sfx.snowWink();
    if (sm.finT === SM_EXIT_START) sfx.snowSwirl();
    // Swirl particles spiralling inward
    if (sm.finT > SM_EXIT_START && sm.finT < SM_EXIT_END && sm.finT % 2 === 0) {
      var ang = sm.finT * 0.5, rad = sm.w * 0.45 * (1 - (sm.finT - SM_EXIT_START) / (SM_EXIT_END - SM_EXIT_START));
      for (var q = 0; q < 2; q++) {
        var aa = ang + q * Math.PI;
        var px = g.cx + Math.cos(aa) * rad, py = fcy + Math.sin(aa) * rad * 0.8;
        particles.push({ x: px, y: py,
          vx: (g.cx - px) * 0.06 - Math.sin(aa) * 2 * S, vy: (fcy - py) * 0.06 + Math.cos(aa) * 2 * S,
          r: (1.5 + Math.random() * 2) * S, color: q ? '#FFFFFF' : '#CFE6FF', life: 0.7, decay: 0.05, grav: false });
      }
    }
    if (sm.finT === SM_EXIT_END) {
      // He's gone: free the cells under him
      sm.released = true;
      sfx.snowStar();
      for (var k = 0; k < sm.cells.length; k++) {
        var b = stock[sm.cells[k]];
        b.underSnowman = false;
        b.popT = 0.8;
      }
      updateBoxReveals(true);
    }
    if (sm.finT >= SM_STAR_END) sm.phase = 'gone';
  }
}

// ── Drawing helpers ──
function drawSnowBall(cx, cy, r) {
  if (r <= 0.5) return;
  var grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.6, '#F2F7FC');
  grad.addColorStop(1, '#C6DAEB');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,165,205,0.5)'; ctx.lineWidth = 1.1 * S;
  ctx.stroke();
}

// Orange knitted bobble hat. (cx, cy) = centre of the cuff, s = width.
function drawBeanie(cx, cy, s, rot) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot || 0);
  var w = s, h = s * 0.62;
  // dome
  var dg = ctx.createLinearGradient(0, -h, 0, 0);
  dg.addColorStop(0, '#FF9A3C'); dg.addColorStop(1, '#E8641A');
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, 0);
  ctx.bezierCurveTo(-w * 0.48, -h * 0.9, w * 0.48, -h * 0.9, w * 0.46, 0);
  ctx.closePath(); ctx.fill();
  // knit ribs
  ctx.strokeStyle = 'rgba(160,60,10,0.3)'; ctx.lineWidth = Math.max(1, w * 0.035);
  for (var i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(i * w * 0.15, -h * 0.05); ctx.quadraticCurveTo(i * w * 0.1, -h * 0.5, i * w * 0.04, -h * 0.68); ctx.stroke();
  }
  // cuff
  ctx.fillStyle = '#D9561A';
  rRect(-w * 0.52, -h * 0.12, w * 1.04, h * 0.3, h * 0.12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,190,130,0.45)';
  for (var j = -4; j <= 4; j++) {
    ctx.beginPath(); ctx.moveTo(j * w * 0.11, -h * 0.08); ctx.lineTo(j * w * 0.11, h * 0.14); ctx.stroke();
  }
  // pompom
  var pg = ctx.createRadialGradient(-w * 0.04, -h * 0.82, 1, 0, -h * 0.75, w * 0.17);
  pg.addColorStop(0, '#FFC27A'); pg.addColorStop(1, '#F07A22');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(0, -h * 0.76, w * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Carrot: tip at (x, y) pointing along angle, length len.
function drawCarrot(x, y, len, ang) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  // body (tip at 0,0, base at -len)
  var cg = ctx.createLinearGradient(-len, 0, 0, 0);
  cg.addColorStop(0, '#FF8A2A'); cg.addColorStop(1, '#F06A12');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-len, -len * 0.2);
  ctx.quadraticCurveTo(-len * 1.06, 0, -len, len * 0.2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(170,70,10,0.45)'; ctx.lineWidth = Math.max(0.8, len * 0.05);
  for (var i = 1; i <= 2; i++) {
    var xx = -len * i * 0.3;
    ctx.beginPath(); ctx.moveTo(xx, -len * 0.12 * (1 - i * 0.15)); ctx.lineTo(xx + len * 0.05, len * 0.04); ctx.stroke();
  }
  ctx.restore();
}

function drawCarrotWithLeaves(x, y, len, ang) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#4CB848';
  for (var i = -1; i <= 1; i++) {
    ctx.save(); ctx.translate(-len, 0); ctx.rotate(Math.PI + i * 0.45);
    ctx.beginPath(); ctx.ellipse(len * 0.2, 0, len * 0.22, len * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  drawCarrot(x, y, len, ang);
}

function drawSnowPatch(sm) {
  // Lumpy snow ground covering all 4 cells
  ctx.save();
  ctx.shadowColor = 'rgba(60,90,130,0.25)'; ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 2 * S;
  var gg = ctx.createLinearGradient(sm.x, sm.y, sm.x, sm.y + sm.h);
  gg.addColorStop(0, '#FBFDFF'); gg.addColorStop(1, '#DCE9F4');
  ctx.fillStyle = gg;
  rRect(sm.x, sm.y, sm.w, sm.h, 10 * S); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); rRect(sm.x, sm.y, sm.w, sm.h, 10 * S); ctx.clip();
  // soft drifts
  ctx.fillStyle = 'rgba(170,205,235,0.28)';
  var drifts = [[0.2, 0.25, 0.22], [0.78, 0.2, 0.18], [0.15, 0.78, 0.2], [0.85, 0.8, 0.22], [0.5, 0.95, 0.3]];
  for (var i = 0; i < drifts.length; i++) {
    ctx.beginPath(); ctx.ellipse(sm.x + sm.w * drifts[i][0], sm.y + sm.h * drifts[i][1], sm.w * drifts[i][2], sm.h * drifts[i][2] * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  var lumps = [[0.1, 0.06], [0.35, 0.03], [0.65, 0.05], [0.9, 0.04], [0.04, 0.45], [0.96, 0.5]];
  for (var j = 0; j < lumps.length; j++) {
    ctx.beginPath(); ctx.arc(sm.x + sm.w * lumps[j][0], sm.y + sm.h * lumps[j][1], sm.w * 0.08, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(150,190,225,0.85)'; ctx.lineWidth = 1.5 * S;
  rRect(sm.x, sm.y, sm.w, sm.h, 10 * S); ctx.stroke();
}

function drawSnowPile(g, sm, k) {
  // k = 1 full pile, 0 gone
  if (k <= 0.01) return;
  ctx.save();
  ctx.beginPath(); rRect(sm.x, sm.y - sm.h, sm.w, sm.h * 2, 10 * S); ctx.clip();
  var lumps = [
    [-0.24, -0.1, 0.17], [0.24, -0.09, 0.17], [0, -0.17, 0.22],
    [-0.1, -0.3, 0.15], [0.13, -0.31, 0.14], [-0.33, -0.02, 0.11], [0.34, -0.02, 0.11]
  ];
  for (var i = 0; i < lumps.length; i++) {
    var L0 = lumps[i];
    drawSnowBall(g.cx + sm.w * L0[0] * k, g.ground + sm.h * L0[1] * k, sm.w * L0[2] * (0.4 + 0.6 * k));
  }
  ctx.restore();
}

// ── Main draw ──
function drawSnowman() {
  if (!snowman || snowman.phase === 'gone') return;
  var sm = snowman;
  var g = snowmanGeom();

  if (sm.released) { drawSnowStar(g, sm); return; }

  var ox = sm.shakeT > 0 ? Math.sin(sm.shakeT * 28) * 5 * S * sm.shakeT : 0;
  ctx.save();
  ctx.translate(ox, 0);

  drawSnowPatch(sm);

  var fin = sm.phase === 'finale' ? sm.finT : -1;
  var k = 1 - sm.animT; // progress of the current state anim

  // Exit swirl: whole figure spins & shrinks into its centre
  var fcy = (g.hy + g.by) / 2;
  var exitK = fin > SM_EXIT_START ? smClamp01((fin - SM_EXIT_START) / (SM_EXIT_END - SM_EXIT_START)) : 0;
  // Happy jump
  var jumpY = 0;
  if (fin >= SM_JUMP_START && fin <= SM_JUMP_END) {
    var jk = (fin - SM_JUMP_START) / (SM_JUMP_END - SM_JUMP_START);
    jumpY = -Math.sin(jk * Math.PI) * sm.h * 0.1;
  }

  ctx.save();
  if (exitK > 0) {
    var es = Math.pow(1 - exitK, 1.6);
    ctx.translate(g.cx, fcy);
    ctx.rotate(exitK * exitK * Math.PI * 4);
    ctx.scale(es, es);
    ctx.translate(-g.cx, -fcy);
    ctx.globalAlpha = 1 - exitK * 0.5;
  }

  // Waiting hat + carrot lying in the snow (until the finale picks them up)
  var accK = fin >= 0 ? smClamp01(fin / SM_ACC_END) : 0;
  // on the snow beside him: hat bottom-left, carrot bottom-right
  var hatRestX = sm.x + sm.w * 0.17, hatRestY = g.ground - sm.h * 0.02;
  var carRestX = sm.x + sm.w * 0.92, carRestY = g.ground - sm.h * 0.04;
  if (sm.state === 0 || (sm.state === 1 && sm.animT > 0)) {
    // pile state: hat & carrot sit on top of the pile
    hatRestX = g.cx - sm.w * 0.13; hatRestY = g.ground - sm.h * 0.33;
    carRestX = g.cx + sm.w * 0.26; carRestY = g.ground - sm.h * 0.12;
  }

  // Ground shadow
  if (sm.state >= 1) {
    ctx.fillStyle = 'rgba(90,130,170,0.2)';
    ctx.beginPath(); ctx.ellipse(g.cx, g.ground, g.rb * 1.05 * (sm.state === 1 ? k : 1), g.rb * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Pile → base ball
  if (sm.state === 0) drawSnowPile(g, sm, 1);
  if (sm.state === 1 && sm.animT > 0) drawSnowPile(g, sm, 1 - smClamp01(k * 1.6));

  // Balls: base, middle, head
  var balls = [[g.by, g.rb], [g.my, g.rm], [g.hy, g.rh]];
  for (var i = 0; i < 3; i++) {
    if (sm.state <= i) break;
    var bx = g.cx, byy = balls[i][0], br = balls[i][1];
    if (i === sm.state - 1 && sm.animT > 0) {
      if (i === 0) {
        // base forms out of the pile, packing up with a bounce
        br = br * easeOutBack(smClamp01(k * 1.3));
        byy = g.ground - br;
      } else {
        // next ball drops in from above and bounces into place
        var dk = easeOutBounce(smClamp01(k * 1.25));
        byy = byy - (1 - dk) * sm.h * 0.7;
        ctx.save(); ctx.globalAlpha *= smClamp01(k * 4);
        drawSnowBall(bx, byy, br);
        ctx.restore();
        continue;
      }
    }
    if (i === 2 && fin >= 0) byy += jumpY;
    else if (fin >= 0) byy += jumpY * (i === 1 ? 0.95 : 0.9);
    drawSnowBall(bx, byy, br);
  }

  // Coal buttons + face once complete
  if (fin >= 0) {
    var faceA = smClamp01((fin - SM_ACC_END + 8) / (SM_FACE_END - SM_ACC_END));
    ctx.save(); ctx.globalAlpha *= faceA;
    ctx.fillStyle = '#2A2A33';
    for (var bt = 0; bt < 3; bt++) {
      ctx.beginPath(); ctx.arc(g.cx, g.my + jumpY * 0.95 - g.rm * 0.45 + bt * g.rm * 0.45, g.rm * 0.09, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    drawSnowmanFace(g.cx, g.hy + jumpY, g.rh, fin, faceA);
  }

  // Hat & carrot: resting, then jumping onto him
  var restRot = (sm.state === 0 || (sm.state === 1 && sm.animT > 0)) ? -0.5 : -0.15;
  var hatX = hatRestX, hatY = hatRestY, hatRot = restRot, hatS = sm.w * 0.22;
  var carX = carRestX, carY = carRestY, carAng = 0.5, carLen = sm.w * 0.16;
  if (fin >= 0) {
    var e = easeOutBack(accK);
    var arc = Math.sin(accK * Math.PI) * sm.h * 0.25;
    var hatTX = g.cx, hatTY = g.hy + jumpY - g.rh * 0.62;
    hatX = hatRestX + (hatTX - hatRestX) * e; hatY = hatRestY + (hatTY - hatRestY) * e - arc;
    hatRot = restRot * (1 - accK) - 0.12 * accK;
    hatS = sm.w * (0.22 + (0.2 - 0.22) * accK);
    var carTX = g.cx + g.rh * 0.62, carTY = g.hy + jumpY + g.rh * 0.08;
    carX = carRestX + (carTX - carRestX) * e; carY = carRestY + (carTY - carRestY) * e - arc;
    carAng = 0.5 * (1 - accK) + 0.08 * accK;
    carLen = sm.w * (0.16 + (0.13 - 0.16) * accK);
  }
  if (fin < 0 || accK < 1) drawCarrotWithLeaves(carX, carY, carLen, carAng);
  else drawCarrot(carX, carY, carLen, carAng);
  drawBeanie(hatX, hatY, hatS, hatRot);

  ctx.restore();
  ctx.restore();
}

function drawSnowmanFace(cx, cy, r, finT, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  var eyeY = cy - r * 0.12, eyeDX = r * 0.34, eyeR = r * 0.12;
  ctx.fillStyle = '#2A2A33';
  ctx.beginPath(); ctx.arc(cx - eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
  var winking = finT >= SM_WINK_START && finT <= SM_WINK_END;
  if (winking) {
    ctx.strokeStyle = '#2A2A33'; ctx.lineWidth = eyeR * 0.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx + eyeDX, eyeY + eyeR * 0.3, eyeR * 1.1, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(cx + eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(cx - eyeDX + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.32, 0, Math.PI * 2); ctx.fill();
  if (!winking) { ctx.beginPath(); ctx.arc(cx + eyeDX + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.32, 0, Math.PI * 2); ctx.fill(); }
  // coal smile
  ctx.fillStyle = '#2A2A33';
  for (var i = 0; i < 5; i++) {
    var ang = Math.PI * (0.22 + i * 0.14);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * r * 0.48, cy + r * 0.1 + Math.sin(ang) * r * 0.4, r * 0.065, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Small star twinkling where he stood, then fading
function drawSnowStar(g, sm) {
  var t = smClamp01((sm.finT - SM_EXIT_END) / (SM_STAR_END - SM_EXIT_END));
  var cx = g.cx, cy = (g.hy + g.by) / 2;
  var pop = t < 0.25 ? easeOutBack(t / 0.25) : 1;
  var a = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  var R = sm.w * 0.11 * pop * (1 + 0.12 * Math.sin(t * 30));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(cx, cy); ctx.rotate(t * 1.5);
  // ring
  ctx.strokeStyle = 'rgba(255,220,90,0.7)'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.arc(0, 0, R * (1.4 + t * 1.2), 0, Math.PI * 2); ctx.stroke();
  // star
  ctx.shadowColor = 'rgba(255,210,60,0.9)'; ctx.shadowBlur = 12 * S;
  ctx.fillStyle = '#FFD84A';
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var rr = i % 2 === 0 ? R : R * 0.45;
    var an = -Math.PI / 2 + i * Math.PI / 5;
    if (i === 0) ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); else ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Snow puffs flying from a revealed box to the snowman, with a dotted trail
function drawSnowFlyers() {
  if (!snowman || snowFlyers.length === 0) return;
  var lp = snowmanLandPoint();
  for (var i = 0; i < snowFlyers.length; i++) {
    var f = snowFlyers[i];
    if (f.t <= 0) continue;
    var cx1 = (f.x0 + lp.x) / 2 + (f.x0 < lp.x ? -1 : 1) * snowman.w * 0.3;
    var cy1 = (f.y0 + lp.y) / 2;
    function at(t) {
      var u = 1 - t;
      return { x: u * u * f.x0 + 2 * u * t * cx1 + t * t * lp.x, y: u * u * f.y0 + 2 * u * t * cy1 + t * t * lp.y };
    }
    // dotted trail
    var steps = Math.floor(f.t / 0.07);
    for (var d = 0; d <= steps; d++) {
      var td = d * 0.07;
      var fade = 1 - (f.t - td) / 0.6;
      if (fade <= 0) continue;
      var pd = at(td);
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(pd.x, pd.y, 2.6 * S, 0, Math.PI * 2); ctx.fill();
    }
    // puff
    var pp = at(f.t);
    ctx.globalAlpha = 1;
    for (var k = 0; k < 4; k++) {
      var ang = f.seed + k * 1.6 + f.t * 8;
      var rr = (6 - k) * S;
      ctx.fillStyle = k === 0 ? '#FFFFFF' : '#EEF6FD';
      ctx.beginPath(); ctx.arc(pp.x + Math.cos(ang) * 3 * S * (k ? 1 : 0), pp.y + Math.sin(ang) * 3 * S * (k ? 1 : 0), rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(150,195,230,0.7)'; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 6 * S, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
