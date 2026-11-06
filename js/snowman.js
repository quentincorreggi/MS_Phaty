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

// ── Shape of the snow mass ──
// Drawn as ONE soft silhouette. Each snow delivery builds ONE ball:
//   0: lumpy pile → 1: pile packs into the base ball
//   → 2: middle ball grows on top → 3: head grows on top.
var SM_PILE_H = 0.30, SM_PILE_W = 0.34;       // × w
var SM_R = [0.23, 0.165, 0.125];              // ball radii × w
var SM_C1 = 0.215;                            // base centre height × w

function snowmanGeom() {
  var sm = snowman, w = sm.w;
  var cx = sm.x + sm.w / 2;
  var ground = sm.y + sm.h * 0.93;
  var full = snowBuild(3);
  return {
    cx: cx, ground: ground, w: w,
    by: ground - full.c[0] * w, my: ground - full.c[1] * w, hy: ground - full.c[2] * w,
    rm: SM_R[1] * w, rh: SM_R[2] * w
  };
}

// Build state at display value d (0..3, may overshoot slightly while popping)
function snowBuild(d) {
  var pb = Math.max(0, Math.min(1.06, d));          // pile → base ball
  var k2 = Math.max(0, Math.min(1.12, d - 1));      // middle ball
  var k3 = Math.max(0, Math.min(1.12, d - 2));      // head
  var R1 = SM_R[0] * (pb > 1 ? pb : 1), c1 = SM_C1;
  var R2 = SM_R[1] * k2, c2 = c1 + (SM_R[0] + R2) * 0.8;
  var R3 = SM_R[2] * k3, c3 = c2 + (R2 + R3) * 0.8;
  var baseTop = pb > 0.001 ? Math.max(SM_PILE_H, c1 + R1) : SM_PILE_H;
  var H = baseTop;
  if (R2 > 0) H = Math.max(H, c2 + R2);
  if (R3 > 0) H = Math.max(H, c3 + R3);
  return { pb: pb, k: [Math.min(1, pb), k2, k3], c: [c1, c2, c3], R: [R1, R2, R3], H: H };
}

// Half-width (× w) at absolute height y (× w)
function snowHalfWidth(st, y, side, wob) {
  // lumpy pile
  var pile = 0;
  if (y < SM_PILE_H) {
    var t = y / SM_PILE_H;
    pile = SM_PILE_W * Math.pow(Math.max(0, 1 - Math.pow(t, 2.1)), 0.55) * (1 + 0.12 * Math.pow(1 - t, 6));
    pile *= 1 + 0.07 * Math.sin(t * 11 + (side > 0 ? 0.6 : 2.4)) + 0.04 * Math.sin(t * 23 + (side > 0 ? 1.3 : 0.2));
  }
  // base ball, settled on the ground
  var c1 = st.c[0], R1 = st.R[0], base = 0;
  if (y < c1) { var q = (c1 - y) / c1; base = R1 * Math.sqrt(Math.max(0, 1 - q * q * 0.72)); }
  else if (y < c1 + R1) { var dy = y - c1; base = Math.sqrt(R1 * R1 - dy * dy); }
  var pb = Math.min(1, st.pb);
  var r = pile + (base - pile) * pb;
  // upper balls
  for (var i = 1; i < 3; i++) {
    var R = st.R[i];
    if (R <= 0) continue;
    var d2 = y - st.c[i];
    if (Math.abs(d2) < R) r = Math.max(r, Math.sqrt(R * R - d2 * d2));
  }
  return Math.max(0, r * (1 + wob));
}

// Where flying snow lands: on top of the snow
function snowmanLandPoint() {
  var g = snowmanGeom();
  var st = snowBuild(Math.min(snowman.state, SNOW_STATES));
  return { x: g.cx, y: g.ground - st.H * g.w * 0.85 };
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
  // Soft snowy ground covering all 4 cells (no hard frame)
  ctx.save();
  ctx.shadowColor = 'rgba(70,110,150,0.22)'; ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 2 * S;
  var gg = ctx.createLinearGradient(sm.x, sm.y, sm.x, sm.y + sm.h);
  gg.addColorStop(0, '#F3F9FE'); gg.addColorStop(1, '#DDEBF6');
  ctx.fillStyle = gg;
  rRect(sm.x + 1 * S, sm.y + 1 * S, sm.w - 2 * S, sm.h - 2 * S, 12 * S); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2 * S;
  rRect(sm.x + 2 * S, sm.y + 2 * S, sm.w - 4 * S, sm.h - 4 * S, 11 * S); ctx.stroke();
  ctx.restore();
}

// Build the silhouette path of the snow mass
function snowMassPath(g, st, wobT) {
  var N = 56, w = g.w, H = st.H;
  var pts = [];
  for (var i = 0; i <= N; i++) {
    var y = H * i / N;
    var wob = wobT * 0.04 * Math.sin(i * 0.5 + tick * 0.3);
    pts.push([g.cx + snowHalfWidth(st, y, 1, wob) * w, g.ground - y * w]);
  }
  for (var j = N; j >= 0; j--) {
    var y2 = H * j / N;
    var wob2 = wobT * 0.04 * Math.sin(j * 0.5 + tick * 0.3 + 1);
    pts.push([g.cx - snowHalfWidth(st, y2, -1, wob2) * w, g.ground - y2 * w]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var k = 1; k < pts.length - 1; k++) {
    var mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[k][0], pts[k][1], mx, my);
  }
  ctx.closePath();
}

function drawSnowMass(g, st, wobT) {
  var w = g.w, Hpx = st.H * w;
  var top = g.ground - Hpx;
  // ground contact shadow
  ctx.fillStyle = 'rgba(80,125,170,0.2)';
  ctx.beginPath(); ctx.ellipse(g.cx, g.ground, (snowHalfWidth(st, 0.01, 1, 0) + 0.05) * w, w * 0.045, 0, 0, Math.PI * 2); ctx.fill();

  snowMassPath(g, st, wobT);
  var grad = ctx.createLinearGradient(g.cx - w * 0.3, top, g.cx + w * 0.3, g.ground);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.55, '#F4F8FC');
  grad.addColorStop(1, '#D5E5F2');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  snowMassPath(g, st, wobT);
  ctx.clip();
  // each ball gets its own soft shading so it reads as a ball
  for (var i = 0; i < 3; i++) {
    var R = st.R[i] * w, k = st.k[i];
    if (R <= 1 || k <= 0) continue;
    if (i === 0 && st.pb < 0.5) continue;
    var cy = g.ground - st.c[i] * w;
    var a = i === 0 ? (st.pb - 0.5) * 2 : Math.min(1, k * 1.5);
    var sg = ctx.createRadialGradient(g.cx - R * 0.35, cy - R * 0.4, R * 0.1, g.cx, cy, R * 1.05);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.7, 'rgba(170,205,235,0)');
    sg.addColorStop(1, 'rgba(150,190,225,' + (0.45 * a) + ')');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(g.cx, cy, R * 1.05, 0, Math.PI * 2); ctx.fill();
    // crease where this ball sits on the one below
    if (i > 0) {
      ctx.strokeStyle = 'rgba(120,165,205,' + (0.5 * a) + ')';
      ctx.lineWidth = 1.6 * S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(g.cx, cy, R, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
  }
  // pile shading (fades as it packs into the base ball)
  if (st.pb < 1) {
    var pa = 1 - st.pb;
    var pg = ctx.createRadialGradient(g.cx + w * 0.18, g.ground - Hpx * 0.3, 0, g.cx + w * 0.18, g.ground - Hpx * 0.3, w * 0.35);
    pg.addColorStop(0, 'rgba(150,190,225,' + (0.35 * pa) + ')'); pg.addColorStop(1, 'rgba(150,190,225,0)');
    ctx.fillStyle = pg; ctx.fillRect(g.cx - w * 0.5, top - w * 0.1, w, Hpx + w * 0.2);
  }
  // powder speckles
  ctx.fillStyle = 'rgba(160,200,230,0.35)';
  for (var p = 0; p < 10; p++) {
    var px = g.cx + Math.sin(p * 2.39) * w * 0.2, py = g.ground - ((p * 0.37) % 1) * Hpx;
    ctx.beginPath(); ctx.arc(px, py, 1.1 * S, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  snowMassPath(g, st, wobT);
  ctx.strokeStyle = 'rgba(130,175,215,0.75)'; ctx.lineWidth = 1.4 * S;
  ctx.stroke();
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
  var k = 1 - sm.animT;
  // Display state: the new ball grows with a soft pop
  var d = sm.animT > 0 ? (sm.state - 1) + easeOutBack(k) : sm.state;
  var st = snowBuild(d);
  var wobT = sm.animT > 0 ? Math.sin(k * Math.PI) : 0;

  var fcy = g.ground - st.H * g.w * 0.5;
  var exitK = fin > SM_EXIT_START ? smClamp01((fin - SM_EXIT_START) / (SM_EXIT_END - SM_EXIT_START)) : 0;
  var jumpY = 0;
  if (fin >= SM_JUMP_START && fin <= SM_JUMP_END) {
    jumpY = -Math.sin((fin - SM_JUMP_START) / (SM_JUMP_END - SM_JUMP_START) * Math.PI) * sm.h * 0.1;
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
  var sq = wobT * 0.05;
  ctx.translate(g.cx, g.ground + jumpY);
  ctx.scale(1 + sq, 1 - sq);
  ctx.translate(-g.cx, -g.ground);

  drawSnowMass(g, st, wobT);

  var topY = g.ground - st.H * g.w;
  var accK = fin >= 0 ? smClamp01(fin / SM_ACC_END) : 0;

  if (fin >= 0) {
    var faceA = smClamp01((fin - SM_ACC_END + 10) / (SM_FACE_END - SM_ACC_END));
    ctx.save(); ctx.globalAlpha *= faceA;
    ctx.fillStyle = '#2A2A33';
    for (var bt = 0; bt < 2; bt++) {
      ctx.beginPath(); ctx.arc(g.cx, g.my - g.rm * 0.25 + bt * g.rm * 0.5, g.rm * 0.09, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    drawSnowmanFace(g.cx, g.hy, g.rh, fin, faceA);
  }

  // Carrot: stuck in the pile, then leaning against the base, then the nose
  var cy0 = 0.12;
  var restX = g.cx + snowHalfWidth(st, cy0, 1, 0) * g.w * 0.85 + g.w * 0.12;
  var restY = g.ground - cy0 * g.w - g.w * 0.06;
  var carX = restX, carY = restY, carAng = -0.45, carLen = g.w * 0.19;
  if (fin >= 0) {
    var e = easeOutBack(accK), arc = Math.sin(accK * Math.PI) * g.w * 0.2;
    var noseX = g.cx + g.rh * 0.68, noseY = g.hy + g.rh * 0.1;
    carX = carX + (noseX - carX) * e; carY = carY + (noseY - carY) * e - arc;
    carAng = -0.45 * (1 - accK) + 0.06 * accK;
    carLen = g.w * (0.19 - 0.07 * accK);
  }
  drawCarrot(carX, carY, carLen, carAng);

  // Hat: always sits on top of the snow
  var hatTilt = st.pb < 1 ? -0.28 : -0.1;
  var hatPop = fin >= 0 ? Math.sin(Math.min(1, fin / 16) * Math.PI) * 0.18 : 0;
  drawBeanie(g.cx - g.w * 0.01, topY + g.w * 0.05, g.w * 0.21 * (1 + hatPop), hatTilt);

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
