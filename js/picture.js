// ============================================================
// picture.js — Picture mechanic (4-piece jigsaw)
// A 2x2 frame sits over 4 grid cells and hides them. 4 boxes on
// the board carry a picture piece (box.piece = 1..4). Picking a
// piece box sends its piece flying into its slot in the frame.
// When all 4 pieces are in, the picture shines and disappears,
// freeing the boxes underneath.
//
// Level data:
//   lvl.picture = { idx: <top-left cell index> }
//   grid cell   = { ci, type, piece: 1..4 }
// ============================================================

var PICTURE_PIECES = 4;
var PIC_U = 400;          // local picture size (units) — 2x2 cells of 200
var PIC_CELL = 200;

// Jigsaw edges per piece: [top, right, bottom, left]
//  +1 = tab sticks out, -1 = tab goes in, 0 = flat border
var PIECE_EDGES = {
  1: [0, 1, 1, 0],      // top-left:     two tabs out
  2: [0, 0, -1, -1],    // top-right:    two holes
  3: [-1, 1, 0, 0],     // bottom-left:  hole on top, tab right
  4: [1, 0, 0, -1]      // bottom-right: tab up, hole left
};
var PIECE_CELL = { 1: { c: 0, r: 0 }, 2: { c: 1, r: 0 }, 3: { c: 0, r: 1 }, 4: { c: 1, r: 1 } };

// ── Image (procedural winter scene, drawn once offscreen) ──
var pictureImg = null;

function buildPictureImage() {
  var cv = document.createElement('canvas');
  cv.width = PIC_U; cv.height = PIC_U;
  var g = cv.getContext('2d');

  // Sky
  var sky = g.createLinearGradient(0, 0, 0, PIC_U);
  sky.addColorStop(0, '#5DB8F5'); sky.addColorStop(0.55, '#BFE6FF'); sky.addColorStop(1, '#E8F6FF');
  g.fillStyle = sky; g.fillRect(0, 0, PIC_U, PIC_U);

  // Sun (top-right)
  g.save();
  g.translate(300, 95);
  g.fillStyle = 'rgba(255,214,90,0.35)';
  g.beginPath(); g.arc(0, 0, 78, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#FFC63A'; g.lineWidth = 9; g.lineCap = 'round';
  for (var i = 0; i < 10; i++) {
    var a = i * Math.PI / 5;
    g.beginPath(); g.moveTo(Math.cos(a) * 60, Math.sin(a) * 60); g.lineTo(Math.cos(a) * 82, Math.sin(a) * 82); g.stroke();
  }
  var sg = g.createRadialGradient(-12, -12, 5, 0, 0, 50);
  sg.addColorStop(0, '#FFF3A8'); sg.addColorStop(1, '#FFB81F');
  g.fillStyle = sg; g.beginPath(); g.arc(0, 0, 48, 0, Math.PI * 2); g.fill();
  // smile
  g.fillStyle = '#B86A00';
  g.beginPath(); g.arc(-15, -8, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(15, -8, 5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#B86A00'; g.lineWidth = 5;
  g.beginPath(); g.arc(0, 4, 18, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  g.restore();

  // Cloud (top-left)
  g.fillStyle = '#FFFFFF';
  function puff(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  puff(70, 100, 32); puff(110, 80, 42); puff(155, 100, 32); puff(110, 115, 30);
  g.fillRect(70, 100, 85, 30);
  g.fillStyle = 'rgba(160,200,235,0.45)';
  g.fillRect(55, 128, 115, 6);

  // Birds
  g.strokeStyle = '#2D4F7A'; g.lineWidth = 5; g.lineCap = 'round';
  function bird(x, y) { g.beginPath(); g.moveTo(x - 14, y - 6); g.quadraticCurveTo(x - 6, y - 10, x, y); g.quadraticCurveTo(x + 6, y - 10, x + 14, y - 6); g.stroke(); }
  bird(195, 60); bird(225, 82);

  // Back hill (blue-white)
  g.fillStyle = '#CFE3F5';
  g.beginPath(); g.moveTo(0, 250);
  g.quadraticCurveTo(110, 170, 220, 235); g.quadraticCurveTo(320, 190, 400, 225);
  g.lineTo(400, 400); g.lineTo(0, 400); g.closePath(); g.fill();

  // Front hill (snow)
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.moveTo(0, 300);
  g.quadraticCurveTo(150, 240, 270, 300); g.quadraticCurveTo(340, 330, 400, 300);
  g.lineTo(400, 400); g.lineTo(0, 400); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(140,180,220,0.5)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(20, 360); g.quadraticCurveTo(120, 335, 210, 365); g.stroke();

  // Pine tree (bottom-left)
  g.fillStyle = '#7A4A22'; g.fillRect(100, 320, 26, 45);
  var tiers = [[113, 175, 50], [113, 215, 70], [113, 258, 90]];
  for (var t = 0; t < tiers.length; t++) {
    var tx = tiers[t][0], ty = tiers[t][1], tw = tiers[t][2];
    g.fillStyle = '#1F8A4C';
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + tw, ty + 75); g.lineTo(tx - tw, ty + 75); g.closePath(); g.fill();
    g.fillStyle = '#FFFFFF';
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + tw * 0.45, ty + 34); g.lineTo(tx, ty + 26); g.lineTo(tx - tw * 0.45, ty + 34); g.closePath(); g.fill();
  }
  // star
  g.fillStyle = '#FFD23F';
  g.beginPath();
  for (var s = 0; s < 10; s++) {
    var ra = s % 2 === 0 ? 18 : 8, aa = -Math.PI / 2 + s * Math.PI / 5;
    var px = 113 + Math.cos(aa) * ra, py = 172 + Math.sin(aa) * ra;
    if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.fill();

  // House (bottom-right)
  g.fillStyle = '#E2463F'; g.fillRect(250, 270, 110, 80);
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.moveTo(236, 275); g.lineTo(305, 215); g.lineTo(374, 275); g.closePath(); g.fill();
  g.fillStyle = '#8C2B27';
  g.beginPath(); g.moveTo(244, 275); g.lineTo(305, 226); g.lineTo(366, 275); g.closePath(); g.fill();
  g.fillStyle = '#FFFFFF'; g.fillRect(236, 268, 138, 10);
  g.fillStyle = '#6B3A1C'; g.fillRect(320, 300, 26, 50);
  g.fillStyle = '#FFD86B'; g.fillRect(265, 292, 34, 30);
  g.strokeStyle = '#8C2B27'; g.lineWidth = 4;
  g.strokeRect(265, 292, 34, 30);
  g.beginPath(); g.moveTo(282, 292); g.lineTo(282, 322); g.moveTo(265, 307); g.lineTo(299, 307); g.stroke();
  // chimney + smoke
  g.fillStyle = '#8C2B27'; g.fillRect(335, 222, 18, 34);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  puff(346, 205, 10); puff(356, 188, 13); puff(350, 168, 9);

  // Snowflakes
  g.fillStyle = '#FFFFFF';
  var flakes = [[40, 180, 5], [190, 150, 4], [250, 160, 5], [370, 170, 4], [30, 250, 4], [215, 205, 5], [180, 270, 4], [60, 40, 4], [380, 30, 4]];
  for (var f = 0; f < flakes.length; f++) puff(flakes[f][0], flakes[f][1], flakes[f][2]);

  pictureImg = cv;
}

// ── Jigsaw path in local picture coords (0..400) ──
function pieceEdge(c, ax, ay, bx, by, out) {
  if (!out) { c.lineTo(bx, by); return; }
  var dx = bx - ax, dy = by - ay;
  var nx = -dy, ny = dx; // points inside the piece for clockwise tracing
  var v = -out * 0.24;
  function P(u, w) { return [ax + dx * u + nx * w, ay + dy * u + ny * w]; }
  var p1 = P(0.36, 0), c1 = P(0.42, v * 0.15), c2 = P(0.28, v), p2 = P(0.5, v);
  var c3 = P(0.72, v), c4 = P(0.58, v * 0.15), p3 = P(0.64, 0), p4 = P(1, 0);
  c.lineTo(p1[0], p1[1]);
  c.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
  c.bezierCurveTo(c3[0], c3[1], c4[0], c4[1], p3[0], p3[1]);
  c.lineTo(p4[0], p4[1]);
}

function piecePath(c, n) {
  var pc = PIECE_CELL[n], e = PIECE_EDGES[n];
  var x0 = pc.c * PIC_CELL, y0 = pc.r * PIC_CELL, x1 = x0 + PIC_CELL, y1 = y0 + PIC_CELL;
  c.beginPath();
  c.moveTo(x0, y0);
  pieceEdge(c, x0, y0, x1, y0, e[0]);
  pieceEdge(c, x1, y0, x1, y1, e[1]);
  pieceEdge(c, x1, y1, x0, y1, e[2]);
  pieceEdge(c, x0, y1, x0, y0, e[3]);
  c.closePath();
}

// Draw a single piece centered at (cx, cy), its cell sized cw x ch px.
// opts: { border: px, alpha, rot, flash }
function drawPieceAt(n, cx, cy, cw, ch, opts) {
  if (!pictureImg) buildPictureImage();
  opts = opts || {};
  var pc = PIECE_CELL[n];
  var sx = cw / PIC_CELL, sy = ch / PIC_CELL;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.translate(cx, cy);
  if (opts.rot) ctx.rotate(opts.rot);
  ctx.scale(sx, sy);
  ctx.translate(-(pc.c * PIC_CELL + PIC_CELL / 2), -(pc.r * PIC_CELL + PIC_CELL / 2));
  var lw = 1 / Math.min(sx, sy);
  if (opts.border) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2 * S;
    piecePath(ctx, n);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = opts.border * 2 * lw; ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }
  ctx.save();
  piecePath(ctx, n); ctx.clip();
  ctx.drawImage(pictureImg, 0, 0, PIC_U, PIC_U);
  if (opts.flash) { ctx.fillStyle = 'rgba(255,255,255,' + opts.flash + ')'; ctx.fillRect(0, 0, PIC_U, PIC_U); }
  ctx.restore();
  piecePath(ctx, n);
  ctx.strokeStyle = opts.border ? 'rgba(90,60,30,0.6)' : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.2 * S * lw; ctx.stroke();
  ctx.restore();
}

// ── State ──
var picture = null;      // active picture state, or null
var pieceFlights = [];

function initPicture(lvl) {
  picture = null; pieceFlights = [];
  if (!pictureImg) buildPictureImage();
  if (!lvl || !lvl.picture || lvl.picture.idx === undefined) return;
  var tl = lvl.picture.idx;
  var r = Math.floor(tl / L.cols), c = tl % L.cols;
  if (r < 0 || r > L.rows - 2 || c < 0 || c > L.cols - 2) return;
  var cells = [tl, tl + 1, tl + L.cols, tl + L.cols + 1];
  picture = {
    tl: tl, cells: cells,
    placed: {}, snapT: {}, placedCount: 0,
    state: 'active',  // active → shine → exit → gone
    stateT: 0, shakeT: 0, popT: 0
  };
  for (var i = 0; i < cells.length; i++) {
    var b = stock[cells[i]];
    b.covered = true;
    b.piece = 0; // no pieces under the frame
  }
}

function isPictureCell(idx) {
  return !!(picture && picture.state !== 'gone' && picture.cells.indexOf(idx) >= 0);
}

function pictureRect() {
  var a = stock[picture.cells[0]], d = stock[picture.cells[3]];
  return { x: a.x, y: a.y, w: d.x + L.bw - a.x, h: d.y + L.bh - a.y };
}

function pictureInner() {
  var r = pictureRect(), pad = 6 * S;
  return { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 };
}

function pictureHitTest(px, py) {
  if (!picture || picture.state === 'gone') return false;
  var r = pictureRect();
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function pictureDeniedTap() {
  picture.shakeT = 0.6;
  tone(180, 0.12, 'square', 0.05, 120);
}

function slotCenter(n) {
  var inr = pictureInner(), pc = PIECE_CELL[n];
  return { x: inr.x + (pc.c + 0.5) * inr.w / 2, y: inr.y + (pc.r + 0.5) * inr.h / 2, cw: inr.w / 2, ch: inr.h / 2 };
}

// Badge geometry on a box (top-right corner, bigger than a slot feels at icon size)
function pieceBadgeGeom(b) {
  var cw = L.bw * 0.44;
  return { x: b.x + L.bw * 0.7, y: b.y + L.bh * 0.3, cw: cw, ch: cw };
}

// Called from handleTap when a box is picked
function collectPicturePiece(b) {
  if (!picture || !b.piece || picture.state === 'gone') return;
  var n = b.piece;
  b.piece = 0;
  var g = pieceBadgeGeom(b);
  pieceFlights.push({ n: n, sx: g.x, sy: g.y, scw: g.cw, sch: g.ch, t: 0, delay: pieceFlights.length * 8 });
  tone(950, 0.08, 'triangle', 0.07, 1400);
}

function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function updatePicture() {
  if (!picture) return;
  if (picture.shakeT > 0) picture.shakeT = Math.max(0, picture.shakeT - 0.04);
  if (picture.popT > 0) picture.popT = Math.max(0, picture.popT - 0.05);
  for (var k in picture.snapT) if (picture.snapT[k] > 0) picture.snapT[k] = Math.max(0, picture.snapT[k] - 0.04);

  // Flights
  for (var i = pieceFlights.length - 1; i >= 0; i--) {
    var f = pieceFlights[i];
    if (f.delay > 0) { f.delay--; continue; }
    f.t += 0.022;
    if (tick % 3 === 0 && f.t < 0.95) {
      var fp = flightPos(f);
      particles.push({ x: fp.x, y: fp.y, vx: (Math.random() - 0.5) * S, vy: (Math.random() - 0.5) * S,
        r: (1.5 + Math.random() * 2) * S, color: Math.random() > 0.5 ? '#FFFFFF' : '#FFE27A',
        life: 0.7, decay: 0.04, grav: false });
    }
    if (f.t >= 1) {
      pieceFlights.splice(i, 1);
      landPiece(f.n);
    }
  }

  if (picture.state === 'shine') {
    picture.stateT += 1 / 55;
    if (picture.stateT >= 1) {
      picture.state = 'exit'; picture.stateT = 0;
      var r = pictureRect();
      spawnConfetti(r.x + r.w / 2, r.y + r.h / 2, 30);
      spawnBurst(r.x + r.w / 2, r.y + r.h / 2, '#FFE27A', 24);
      sfx.win();
    }
  } else if (picture.state === 'exit') {
    picture.stateT += 1 / 28;
    if (picture.stateT >= 1) {
      picture.state = 'gone';
      for (var c = 0; c < picture.cells.length; c++) stock[picture.cells[c]].covered = false;
      updateBoxReveals(true);
    }
  }
}

function flightPos(f) {
  var end = slotCenter(f.n);
  var t = easeInOut(Math.min(1, f.t));
  var mx = (f.sx + end.x) / 2, my = Math.min(f.sy, end.y) - 110 * S;
  var x = (1 - t) * (1 - t) * f.sx + 2 * (1 - t) * t * mx + t * t * end.x;
  var y = (1 - t) * (1 - t) * f.sy + 2 * (1 - t) * t * my + t * t * end.y;
  // Size: lift up big, then shrink into the slot (fake perspective)
  var big = 1.35, cw, ch;
  if (f.t < 0.2) {
    var a = easeOut(f.t / 0.2);
    cw = f.scw + (end.cw * big - f.scw) * a; ch = f.sch + (end.ch * big - f.sch) * a;
  } else {
    var b2 = easeInOut((f.t - 0.2) / 0.8);
    cw = end.cw * big + (end.cw - end.cw * big) * b2; ch = end.ch * big + (end.ch - end.ch * big) * b2;
  }
  var rot = Math.sin(f.t * Math.PI * 2) * 0.35 * (1 - f.t);
  return { x: x, y: y, cw: cw, ch: ch, rot: rot };
}

function landPiece(n) {
  if (!picture || picture.placed[n]) return;
  picture.placed[n] = true;
  picture.placedCount++;
  picture.snapT[n] = 1;
  picture.popT = 1;
  var sc = slotCenter(n);
  spawnBurst(sc.x, sc.y, '#FFFFFF', 14);
  spawnBurst(sc.x, sc.y, '#FFE27A', 8);
  // soft "click"
  tone(1500, 0.04, 'square', 0.05);
  setTimeout(function () { tone(900, 0.06, 'triangle', 0.08); }, 35);
  if (picture.placedCount >= PICTURE_PIECES) {
    picture.state = 'shine'; picture.stateT = 0;
    sfx.complete();
  }
}

// ── Drawing ──
function drawPicture() {
  if (!picture) return;

  // Piece badges on boxes (visible on any box state except used / under frame)
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b.piece || b.used || b.empty || b.isTunnel || b.isWall || b.covered) continue;
    var g = pieceBadgeGeom(b);
    var ox = b.shakeT > 0 ? Math.sin(b.shakeT * 28) * 5 * S * b.shakeT : 0;
    var bob = Math.sin(tick * 0.06 + i) * 1.5 * S;
    drawPieceAt(b.piece, g.x + ox, g.y + bob, g.cw, g.ch, { border: 2.2 * S, rot: Math.sin(tick * 0.03 + i) * 0.06 });
  }

  if (picture.state === 'gone') return;

  var r = pictureRect();
  var inr = pictureInner();
  var ox = picture.shakeT > 0 ? Math.sin(picture.shakeT * 30) * 6 * S * picture.shakeT : 0;
  var sc = 1 + picture.popT * 0.03;
  var alpha = 1;
  if (picture.state === 'exit') { sc += easeOut(picture.stateT) * 0.18; alpha = 1 - picture.stateT; }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(r.x + r.w / 2 + ox, r.y + r.h / 2);
  ctx.scale(sc, sc);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));

  // Glow while shining
  if (picture.state === 'shine' || picture.state === 'exit') {
    ctx.shadowColor = 'rgba(255,215,80,0.9)'; ctx.shadowBlur = 30 * S;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 3 * S;
  }
  // Wooden frame
  var wg = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  wg.addColorStop(0, '#C8955A'); wg.addColorStop(0.5, '#A8743E'); wg.addColorStop(1, '#7E5228');
  ctx.fillStyle = wg;
  rRect(r.x, r.y, r.w, r.h, 8 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = '#5E3B1A'; ctx.lineWidth = 1.5 * S;
  rRect(r.x, r.y, r.w, r.h, 8 * S); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = 1.2 * S;
  rRect(r.x + 2.5 * S, r.y + 2.5 * S, r.w - 5 * S, r.h - 5 * S, 6 * S); ctx.stroke();

  // Canvas (paper + faded image)
  ctx.save();
  rRect(inr.x, inr.y, inr.w, inr.h, 3 * S); ctx.clip();
  ctx.fillStyle = '#F3ECDD'; ctx.fillRect(inr.x, inr.y, inr.w, inr.h);
  ctx.globalAlpha = alpha * 0.16;
  ctx.drawImage(pictureImg, inr.x, inr.y, inr.w, inr.h);
  ctx.globalAlpha = alpha;

  var ksx = inr.w / PIC_U, ksy = inr.h / PIC_U;
  for (var n = 1; n <= PICTURE_PIECES; n++) {
    if (picture.placed[n]) {
      var c = slotCenter(n);
      drawPieceAt(n, c.x, c.y, c.cw, c.ch, { flash: (picture.snapT[n] || 0) * 0.7, alpha: alpha });
    } else {
      // Dashed outline of the missing piece
      ctx.save();
      ctx.translate(inr.x, inr.y); ctx.scale(ksx, ksy);
      piecePath(ctx, n);
      ctx.fillStyle = 'rgba(120,90,60,0.08)'; ctx.fill();
      ctx.setLineDash([6 * S / ksx, 4 * S / ksx]);
      ctx.strokeStyle = 'rgba(110,75,40,0.75)'; ctx.lineWidth = 2 * S / Math.min(ksx, ksy);
      ctx.stroke();
      ctx.restore();
      var sc2 = slotCenter(n);
      ctx.fillStyle = 'rgba(110,75,40,0.35)';
      ctx.font = 'bold ' + Math.round(inr.h * 0.13) + 'px Fredoka, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), sc2.x, sc2.y);
    }
  }

  // Shine band
  if (picture.state === 'shine') {
    var t = picture.stateT;
    var bx = inr.x - inr.w * 0.6 + (inr.w * 2.2) * t;
    var sgr = ctx.createLinearGradient(bx - inr.w * 0.3, inr.y, bx + inr.w * 0.3, inr.y + inr.h);
    sgr.addColorStop(0, 'rgba(255,255,255,0)');
    sgr.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    sgr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sgr; ctx.fillRect(inr.x, inr.y, inr.w, inr.h);
    if (tick % 4 === 0) {
      particles.push({ x: inr.x + Math.random() * inr.w, y: inr.y + Math.random() * inr.h,
        vx: 0, vy: -0.5 * S, r: (2 + Math.random() * 2.5) * S, color: '#FFF6C8', life: 0.9, decay: 0.03, grav: false });
    }
  }
  ctx.restore();

  // Progress chip
  if (picture.state === 'active') {
    var label = picture.placedCount + '/' + PICTURE_PIECES;
    var chW = 30 * S, chH = 15 * S, chX = r.x + r.w / 2 - chW / 2, chY = r.y + r.h - chH * 0.55;
    ctx.fillStyle = '#5E3B1A'; rRect(chX, chY, chW, chH, chH / 2); ctx.fill();
    ctx.fillStyle = '#FFF3D6';
    ctx.font = 'bold ' + Math.round(10 * S) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, chX + chW / 2, chY + chH / 2 + 0.5 * S);
  }
  ctx.restore();
}

function drawPieceFlights() {
  for (var i = 0; i < pieceFlights.length; i++) {
    var f = pieceFlights[i];
    if (f.delay > 0) {
      drawPieceAt(f.n, f.sx, f.sy, f.scw, f.sch, { border: 2.2 * S });
      continue;
    }
    var p = flightPos(f);
    drawPieceAt(f.n, p.x, p.y, p.cw, p.ch, { border: 2.5 * S * (1 - f.t * 0.6), rot: p.rot });
  }
}
