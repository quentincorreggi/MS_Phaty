// ============================================================
// faucet.js — Faucet mechanic
// A 1x1 grid element filled with marbles of one colour (3-12, in
// steps of 3). Each tap on an orthogonally adjacent box makes it
// wobble and "drip" 3 marbles of its colour into the funnel.
// When empty it shuts off (grey ring, closed lever) and stays on
// the board as a permanent path blocker, like a wall.
//
// Faucet stock objects carry isWall:true so every existing
// "skip walls" check (tap, reveal path, tunnel exits, ice, stock
// animations) treats them as inert blockers. isFaucet:true is
// checked first wherever faucets need their own behaviour.
// ============================================================

var FAUCET_DRIP_SIZE = 3;          // marbles per drip
var FAUCET_DRIP_DELAY = 20;        // frames from tap to first drip marble
var FAUCET_MARBLE_GAP = 7;         // frames between marbles in one drip
var FAUCET_STAGGER = 18;           // extra frames per additional faucet on one tap
var FAUCET_AUTO_GAP = 50;          // frames between auto-drain drips
var faucetEmits = [];              // pending marbles: { idx, delay, last }

// ── Sounds ──
sfx.faucetWobble = function () { tone(260, 0.12, 'triangle', 0.07, 420); };
sfx.faucetPlip = function () { tone(1300 + Math.random() * 300, 0.09, 'sine', 0.08, 500); };
sfx.faucetClose = function () {
  tone(320, 0.08, 'square', 0.04, 200);
  setTimeout(function () { tone(160, 0.18, 'triangle', 0.09, 90); }, 70);
};

// ── Stock object ──
function makeFaucetStock(ci, content, x, y) {
  var drips = Math.max(1, Math.round((content || 9) / FAUCET_DRIP_SIZE));
  return {
    isFaucet: true, isWall: true, isTunnel: false,
    ci: ci, faucetDrips: drips, faucetTotal: drips, faucetPending: 0,
    faucetDry: false, faucetShutT: 0, faucetAutoCd: 60,
    used: false, remaining: 0, spawning: false, spawnIdx: 0,
    revealed: false, empty: false, boxType: 'default',
    iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
    x: x, y: y,
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
  };
}

function faucetNeighbors(idx) {
  var r = Math.floor(idx / L.cols), c = idx % L.cols, out = [];
  if (r > 0) out.push(idx - L.cols);
  if (r < L.rows - 1) out.push(idx + L.cols);
  if (c > 0) out.push(idx - 1);
  if (c < L.cols - 1) out.push(idx + 1);
  return out;
}

function faucetSpoutPos(f) {
  var u = L.bw / 100;
  return { x: f.x + L.bw / 2, y: f.y + L.bh / 2 + 30 * u };
}

// Queue one drip (3 marbles) from faucet at idx after `delay` frames.
function faucetQueueDrip(idx, delay) {
  var f = stock[idx];
  if (!f || !f.isFaucet || f.faucetDrips <= 0) return;
  f.faucetDrips--;
  f.faucetPending += FAUCET_DRIP_SIZE;
  f.shakeT = 1;
  sfx.faucetWobble();
  for (var m = 0; m < FAUCET_DRIP_SIZE; m++) {
    faucetEmits.push({ idx: idx, delay: delay + m * FAUCET_MARBLE_GAP,
      last: (f.faucetDrips === 0 && m === FAUCET_DRIP_SIZE - 1) });
  }
}

// Called from handleTap after a box at boxIdx was successfully played.
// One tap = one drip per adjacent faucet, in reading order.
function triggerAdjacentFaucets(boxIdx) {
  var nb = faucetNeighbors(boxIdx).sort(function (a, b) { return a - b; });
  var k = 0;
  for (var i = 0; i < nb.length; i++) {
    var f = stock[nb[i]];
    if (!f || !f.isFaucet || f.faucetDrips <= 0) continue;
    faucetQueueDrip(nb[i], FAUCET_DRIP_DELAY + k * FAUCET_STAGGER);
    k++;
  }
}

// Can any box next to this faucet still be played (now or later)?
function faucetHasPlayableNeighbor(idx) {
  var nb = faucetNeighbors(idx);
  for (var i = 0; i < nb.length; i++) {
    var s = stock[nb[i]];
    if (s && !s.isWall && !s.isTunnel && !s.empty && !s.used && !s.spawning) return true;
  }
  // A tunnel that still holds boxes may drop one into a neighbouring cell
  for (var t = 0; t < stock.length; t++) {
    var tn = stock[t];
    if (!tn.isTunnel || !tn.tunnelContents || tn.tunnelContents.length === 0) continue;
    var ex = getTunnelExitIdx(t);
    if (ex >= 0 && nb.indexOf(ex) >= 0) return true;
  }
  return false;
}

function faucetsBusy() {
  if (faucetEmits.length > 0) return true;
  for (var i = 0; i < stock.length; i++) {
    if (stock[i].isFaucet && stock[i].faucetDrips > 0) return true;
  }
  return false;
}

// ── Per-frame update (called from game.js update) ──
function updateFaucets() {
  // Emit queued marbles
  for (var e = faucetEmits.length - 1; e >= 0; e--) {
    var em = faucetEmits[e];
    em.delay--;
    if (em.delay > 0) continue;
    faucetEmits.splice(e, 1);
    var f = stock[em.idx];
    if (!f || !f.isFaucet) continue;
    var sp = faucetSpoutPos(f);
    physMarbles.push({ x: sp.x + (Math.random() - 0.5) * 2 * S, y: sp.y,
      vx: (Math.random() - 0.5) * 0.8 * S, vy: (1 + Math.random()) * S,
      ci: f.ci, r: getMR(), spawnT: 1.0 });
    spawnBurst(sp.x, sp.y, COLORS[f.ci].light, 3);
    sfx.faucetPlip();
    f.faucetPending = Math.max(0, f.faucetPending - 1);
    if (em.last) {
      f.faucetDry = true; f.faucetShutT = 1;
      spawnBurst(f.x + L.bw / 2, f.y + L.bh / 2, '#B8C2CC', 12);
      sfx.faucetClose();
    }
  }

  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s.isFaucet) continue;
    if (s.shakeT > 0) s.shakeT = Math.max(0, s.shakeT - 0.035);
    if (s.faucetShutT > 0) s.faucetShutT = Math.max(0, s.faucetShutT - 0.03);

    // Runtime rescue: no neighbour can ever be played → drain itself
    if (won || s.faucetDrips <= 0 || s.faucetPending > 0) continue;
    if (s.faucetAutoCd > 0) { s.faucetAutoCd--; continue; }
    if (!faucetHasPlayableNeighbor(i)) {
      faucetQueueDrip(i, 4);
      s.faucetAutoCd = FAUCET_AUTO_GAP;
    } else {
      s.faucetAutoCd = 10;
    }
  }
}

// ── Drawing ──
// Front / top-down view, centred and symmetric: a mixer with two
// cross handles left and right, and a spout coming toward the player.
// The coloured ring sits around the spout tip. When the faucet runs
// dry the handles turn from "X" to "+" (closed) and the ring goes grey.
function drawFaucetOnGrid(ctx, f, S, tick) {
  var x = f.x, y = f.y, w = L.bw, h = L.bh;
  var u = w / 100;
  var dry = f.faucetDry;
  var c = COLORS[f.ci];

  ctx.save();

  // Ceramic tile backing — reads as a solid, permanent cell
  ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
  var bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, dry ? '#C4C8CC' : '#DCE6EE');
  bg.addColorStop(1, dry ? '#A4A9AE' : '#AEBFCD');
  ctx.fillStyle = bg;
  rRect(x, y, w, h, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.translate(x + w / 2, y + h / 2);
  if (f.shakeT > 0) {
    ctx.rotate(Math.sin(f.shakeT * 30) * 0.08 * f.shakeT);
    var sq = 1 + Math.sin(f.shakeT * Math.PI) * 0.07;
    ctx.scale(sq, 1 / sq);
  }

  var hi = dry ? '#D2D5D8' : '#FFFFFF';
  var mid = dry ? '#979CA1' : '#A3B0BC';
  var lo = dry ? '#5E6368' : '#4E5C6A';
  function chromeH(x0, x1) {   // horizontal chrome gradient (vertical shapes)
    var g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, lo); g.addColorStop(0.3, hi); g.addColorStop(0.55, mid); g.addColorStop(1, lo);
    return g;
  }
  function chromeR(cx, cy, r) {  // radial chrome (balls, discs)
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, hi); g.addColorStop(0.55, mid); g.addColorStop(1, lo);
    return g;
  }
  function ball(cx, cy, r) {
    ctx.fillStyle = chromeR(cx, cy, r);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  // Deck plate (soft shadow + oval base)
  ctx.fillStyle = 'rgba(40,55,70,0.18)';
  ctx.beginPath(); ctx.ellipse(0, -12 * u, 40 * u, 14 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = chromeH(-38 * u, 38 * u);
  ctx.beginPath(); ctx.ellipse(0, -14 * u, 38 * u, 12 * u, 0, 0, Math.PI * 2); ctx.fill();

  // Cross handles, mirrored left / right
  var closedAmt = dry ? 1 - f.faucetShutT : 0;   // 0 = open (X), 1 = closed (+)
  for (var side = -1; side <= 1; side += 2) {
    var hx = side * 27 * u, hy = -16 * u;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(side * (Math.PI / 4) * (1 - closedAmt));
    for (var a = 0; a < 4; a++) {
      ctx.save();
      ctx.rotate(a * Math.PI / 2);
      ctx.fillStyle = chromeH(-2.5 * u, 2.5 * u);
      rRect(-2.5 * u, -15 * u, 5 * u, 15 * u, 2 * u); ctx.fill();
      ball(0, -15 * u, 4.5 * u);
      ctx.restore();
    }
    // Hub + white porcelain cap
    ball(0, 0, 8 * u);
    ctx.fillStyle = dry ? '#D8DADC' : '#FAFAF7';
    ctx.beginPath(); ctx.arc(0, 0, 5.5 * u, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = lo; ctx.lineWidth = 0.8 * u;
    ctx.beginPath(); ctx.arc(0, 0, 4.2 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Central column
  ball(0, -16 * u, 10 * u);

  // Spout coming toward the player (tapers slightly, widens at the tip)
  ctx.fillStyle = chromeH(-9 * u, 9 * u);
  ctx.beginPath();
  ctx.moveTo(-8 * u, -16 * u);
  ctx.lineTo(8 * u, -16 * u);
  ctx.quadraticCurveTo(7 * u, 6 * u, 10 * u, 24 * u);
  ctx.lineTo(-10 * u, 24 * u);
  ctx.quadraticCurveTo(-7 * u, 6 * u, -8 * u, -16 * u);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  rRect(-1.8 * u, -12 * u, 3.6 * u, 30 * u, 1.8 * u); ctx.fill();

  // Coloured ring around the spout tip (grey once dry)
  var ringFill = dry ? '#9A9EA3' : c.fill;
  var ringLight = dry ? '#C4C7CA' : c.light;
  var ringDark = dry ? '#6E7277' : c.dark;
  if (!dry) { ctx.shadowColor = c.glow; ctx.shadowBlur = 10 * S; }
  ctx.fillStyle = ringDark;
  ctx.beginPath(); ctx.ellipse(0, 27 * u, 18 * u, 9.5 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  var rg = ctx.createLinearGradient(-17 * u, 0, 17 * u, 0);
  rg.addColorStop(0, ringDark); rg.addColorStop(0.3, ringLight); rg.addColorStop(0.55, ringFill); rg.addColorStop(1, ringDark);
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.ellipse(0, 26 * u, 17 * u, 8.5 * u, 0, 0, Math.PI * 2); ctx.fill();

  // Aerator opening
  ctx.fillStyle = dry ? '#55595D' : '#39424B';
  ctx.beginPath(); ctx.ellipse(0, 26.5 * u, 7.5 * u, 3.8 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.7 * u;
  ctx.beginPath(); ctx.ellipse(0, 26.5 * u, 4.5 * u, 2.2 * u, 0, 0, Math.PI * 2); ctx.stroke();

  ctx.restore();

  // Shut-off flash
  if (f.faucetShutT > 0) {
    ctx.save();
    ctx.globalAlpha = f.faucetShutT * 0.35;
    ctx.fillStyle = '#FFFFFF';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    ctx.restore();
  }
}
