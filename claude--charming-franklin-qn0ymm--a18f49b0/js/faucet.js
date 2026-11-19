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
    faucetDry: false, faucetShutT: 0, faucetAutoCd: 60, faucetDropPhase: Math.random() * 200,
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
  return { x: f.x + L.bw / 2 + 24 * u, y: f.y + L.bh / 2 + 20 * u };
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
function drawFaucetOnGrid(ctx, f, S, tick) {
  var x = f.x, y = f.y, w = L.bw, h = L.bh;
  var u = w / 100;
  var dry = f.faucetDry;
  var c = COLORS[f.ci];

  ctx.save();

  // Ceramic tile backing — reads as a solid, permanent cell
  ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetY = 2 * S;
  var bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, dry ? '#C4C8CC' : '#D6E1EA');
  bg.addColorStop(1, dry ? '#A4A9AE' : '#AFC0CE');
  ctx.fillStyle = bg;
  rRect(x, y, w, h, 6 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save();
  ctx.beginPath(); rRect(x, y, w, h, 6 * S); ctx.clip();
  if (!dry) {
    // Soft wash of the faucet's colour so it reads from afar
    var wash = ctx.createRadialGradient(x + w * 0.74, y + h * 0.85, 0, x + w * 0.74, y + h * 0.85, w * 0.75);
    wash.addColorStop(0, c.light); wash.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.55; ctx.fillStyle = wash; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.restore();

  // Faucet body, centred, with wobble on adjacent pick
  ctx.translate(x + w / 2, y + h / 2);
  if (f.shakeT > 0) {
    ctx.rotate(Math.sin(f.shakeT * 30) * 0.14 * f.shakeT);
    var sq = 1 + Math.sin(f.shakeT * Math.PI) * 0.06;
    ctx.scale(sq, 1 / sq);
  }
  if (dry) ctx.globalAlpha = 0.85;

  var metalA = dry ? '#BFC3C7' : '#F4F7FA';
  var metalB = dry ? '#7E848A' : '#8E9AA6';
  var metalEdge = dry ? '#5E6368' : '#5F6B78';
  function chrome(y0, y1) {
    var g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, metalA); g.addColorStop(0.5, metalB); g.addColorStop(1, metalEdge);
    return g;
  }

  // Wall pipe + flange
  ctx.fillStyle = chrome(-25 * u, -11 * u);
  rRect(-50 * u, -25 * u, 42 * u, 14 * u, 3 * u); ctx.fill();
  ctx.fillStyle = chrome(-31 * u, -5 * u);
  rRect(-46 * u, -31 * u, 9 * u, 26 * u, 3 * u); ctx.fill();

  // Spout: out of the body to the right, curving down
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  ctx.strokeStyle = metalEdge; ctx.lineWidth = 15 * u;
  ctx.beginPath(); ctx.moveTo(4 * u, -18 * u); ctx.lineTo(14 * u, -18 * u);
  ctx.quadraticCurveTo(24 * u, -18 * u, 24 * u, -6 * u); ctx.lineTo(24 * u, 14 * u); ctx.stroke();
  ctx.strokeStyle = chrome(-26 * u, 14 * u); ctx.lineWidth = 11 * u;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.5 * u;
  ctx.beginPath(); ctx.moveTo(6 * u, -21 * u); ctx.lineTo(14 * u, -21 * u);
  ctx.quadraticCurveTo(21 * u, -21 * u, 21 * u, -8 * u); ctx.stroke();

  // Coloured ring on the spout tip (grey once dry)
  var ringFill = dry ? '#9A9EA3' : c.fill;
  var ringLight = dry ? '#C4C7CA' : c.light;
  var ringDark = dry ? '#6E7277' : c.dark;
  ctx.fillStyle = ringDark;
  rRect(13 * u, 1 * u, 22 * u, 15 * u, 4 * u); ctx.fill();
  var rg = ctx.createLinearGradient(13 * u, 0, 35 * u, 0);
  rg.addColorStop(0, ringLight); rg.addColorStop(0.45, ringFill); rg.addColorStop(1, ringDark);
  ctx.fillStyle = rg;
  rRect(14 * u, 2 * u, 20 * u, 13 * u, 3.5 * u); ctx.fill();
  if (!dry) {
    ctx.shadowColor = c.glow; ctx.shadowBlur = 8 * S;
    ctx.strokeStyle = c.light; ctx.lineWidth = 1 * u;
    rRect(14 * u, 2 * u, 20 * u, 13 * u, 3.5 * u); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }
  // Spout opening
  ctx.fillStyle = dry ? '#55595D' : '#3A424A';
  ctx.beginPath(); ctx.ellipse(24 * u, 15 * u, 6 * u, 2 * u, 0, 0, Math.PI * 2); ctx.fill();

  // Body
  ctx.fillStyle = chrome(-30 * u, -6 * u);
  rRect(-12 * u, -30 * u, 24 * u, 24 * u, 6 * u); ctx.fill();
  ctx.strokeStyle = metalEdge; ctx.lineWidth = 1.2 * u;
  rRect(-12 * u, -30 * u, 24 * u, 24 * u, 6 * u); ctx.stroke();

  // Lever handle: tilted up when open, swings flat when shut
  var openAng = -0.75, shutAng = 0.35;
  var ang = dry ? shutAng + (openAng - shutAng) * f.faucetShutT : openAng;
  ctx.fillStyle = chrome(-38 * u, -30 * u);
  rRect(-4 * u, -38 * u, 8 * u, 10 * u, 2 * u); ctx.fill();
  ctx.save();
  ctx.translate(0, -37 * u); ctx.rotate(ang);
  ctx.fillStyle = metalEdge;
  rRect(-4 * u, -4 * u, 34 * u, 8 * u, 4 * u); ctx.fill();
  ctx.fillStyle = chrome(-3 * u, 3 * u);
  rRect(-3 * u, -3 * u, 32 * u, 6 * u, 3 * u); ctx.fill();
  ctx.fillStyle = dry ? '#8A8F94' : '#E25B5B';
  ctx.beginPath(); ctx.arc(28 * u, 0, 4.5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Idle drop forming at the tip while it still holds marbles
  if (!dry && f.faucetDrips > 0) {
    var cyc = ((tick + f.faucetDropPhase) % 200) / 200;
    if (cyc > 0.55) {
      var p = (cyc - 0.55) / 0.45;
      var grow = Math.min(1, p * 2.2);
      var fall = p > 0.6 ? (p - 0.6) / 0.4 : 0;
      var dr = (1.5 + 2.5 * grow) * u;
      ctx.globalAlpha = (dry ? 0.85 : 1) * (1 - fall);
      ctx.fillStyle = c.fill;
      ctx.beginPath(); ctx.arc(24 * u, 17 * u + dr + fall * 24 * u, dr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(24 * u - dr * 0.3, 17 * u + dr * 0.7 + fall * 24 * u, dr * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }

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
