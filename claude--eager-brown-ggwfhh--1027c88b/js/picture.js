// ============================================================
// picture.js — Picture mechanic (5-piece jigsaw: 4 corners + round center)
// A 2x2 frame sits over 4 grid cells and hides them. 5 boxes on
// the board carry a picture piece (box.piece = 1..5). Picking a
// piece box sends its piece flying into its slot in the frame.
// When all pieces are in, the picture shines and disappears,
// freeing the boxes underneath.
//
// Level data:
//   lvl.picture = { idx: <top-left cell index> }
//   grid cell   = { ci, type, piece: 1..5 }
// ============================================================

var PICTURE_PIECES = 5;
var PIC_U = 400;          // local picture size (units) — 2x2 cells of 200
var PIC_CELL = 200;
var PIC_HOLE_R = 64;      // radius of the round center piece

// 5-piece cut: 4 corner pieces (jigsaw tabs between them, center cut
// out) + 1 round piece in the middle.
// Edges: [top, right, bottom, left]  +1 tab out, -1 tab in, 0 flat
var PIECE_DEFS = {
  1: { type: 'quad', c: 0, r: 0, e: [0, 1, 1, 0] },     // top-left
  2: { type: 'quad', c: 1, r: 0, e: [0, 0, -1, -1] },   // top-right
  3: { type: 'quad', c: 0, r: 1, e: [-1, 1, 0, 0] },    // bottom-left
  4: { type: 'quad', c: 1, r: 1, e: [1, 0, 0, -1] },    // bottom-right
  5: { type: 'circle' }                                 // center
};

function pieceAnchor(n) {
  var d = PIECE_DEFS[n];
  if (d.type === 'circle') return { x: PIC_U / 2, y: PIC_U / 2 };
  // visual center of a corner piece, pushed outward because the middle is cut out
  return { x: d.c * PIC_CELL + PIC_CELL / 2 + (d.c ? 8 : -8), y: d.r * PIC_CELL + PIC_CELL / 2 + (d.r ? 8 : -8) };
}

function pieceSize(n) {
  return PIECE_DEFS[n].type === 'circle' ? PIC_HOLE_R * 2.3 : PIC_CELL;
}

// ── Image (procedural winter scene, drawn once offscreen) ──
var pictureImg = null;

function buildPictureImage() {
  var cv = document.createElement('canvas');
  cv.width = PIC_U; cv.height = PIC_U;
  var g = cv.getContext('2d');
  function circ(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

  // Background: soft sky + snowy ground
  var sky = g.createLinearGradient(0, 0, 0, PIC_U);
  sky.addColorStop(0, '#4FA8EE'); sky.addColorStop(1, '#BFE4FF');
  g.fillStyle = sky; g.fillRect(0, 0, PIC_U, PIC_U);
  g.fillStyle = '#EAF5FF';
  g.beginPath(); g.moveTo(0, 330); g.quadraticCurveTo(200, 290, 400, 330); g.lineTo(400, 400); g.lineTo(0, 400); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  var flakes = [[40, 60], [350, 50], [70, 200], [340, 230], [30, 300], [375, 140], [110, 30], [300, 20]];
  for (var f = 0; f < flakes.length; f++) circ(flakes[f][0], flakes[f][1], 6);

  // Stick arms
  g.strokeStyle = '#6B4320'; g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.moveTo(150, 205); g.lineTo(45, 150); g.moveTo(85, 172); g.lineTo(60, 120); g.stroke();
  g.beginPath(); g.moveTo(250, 205); g.lineTo(355, 150); g.moveTo(315, 172); g.lineTo(345, 115); g.stroke();

  // Snow balls (shaded)
  function ball(x, y, r) {
    var gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.75, '#F2F8FF'); gr.addColorStop(1, '#BCD6EE');
    g.fillStyle = gr; circ(x, y, r);
  }
  ball(200, 318, 92);
  ball(200, 200, 70);
  ball(200, 98, 54);

  // Buttons
  g.fillStyle = '#2B2B3A';
  circ(200, 185, 9); circ(200, 215, 9); circ(200, 290, 10); circ(200, 325, 10);

  // Scarf
  g.fillStyle = '#E5383B';
  g.beginPath(); g.ellipse(200, 145, 58, 15, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(222, 145); g.lineTo(258, 145); g.lineTo(266, 215); g.lineTo(236, 210); g.closePath(); g.fill();
  g.fillStyle = '#FFFFFF';
  g.fillRect(239, 195, 24, 6);

  // Top hat
  g.fillStyle = '#23232E';
  g.fillRect(140, 50, 120, 14);
  g.fillRect(160, -5, 80, 58);
  g.fillStyle = '#E5383B'; g.fillRect(160, 36, 80, 12);

  // Face
  g.fillStyle = '#23232E';
  circ(182, 92, 7); circ(218, 92, 7);
  var mouth = [[176, 118], [186, 124], [200, 127], [214, 124], [224, 118]];
  for (var m = 0; m < mouth.length; m++) circ(mouth[m][0], mouth[m][1], 4);
  g.fillStyle = '#FF8A1F';
  g.beginPath(); g.moveTo(198, 100); g.lineTo(250, 110); g.lineTo(198, 112); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,120,140,0.35)';
  circ(170, 108, 9); circ(230, 108, 9);

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
  var d = PIECE_DEFS[n];
  var C = PIC_U / 2, R = PIC_HOLE_R;
  c.beginPath();
  if (d.type === 'circle') { c.arc(C, C, R, 0, Math.PI * 2); c.closePath(); return; }
  var x0 = d.c * PIC_CELL, y0 = d.r * PIC_CELL, x1 = x0 + PIC_CELL, y1 = y0 + PIC_CELL;
  var V = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  var ci = -1;
  for (var k = 0; k < 4; k++) if (V[k][0] === C && V[k][1] === C) ci = k;
  function toward(A, B, dist) {
    var dx = B[0] - A[0], dy = B[1] - A[1], len = Math.sqrt(dx * dx + dy * dy);
    return [A[0] + dx / len * dist, A[1] + dy / len * dist];
  }
  var st = (ci + 2) % 4;
  c.moveTo(V[st][0], V[st][1]);
  for (var j = 0; j < 4; j++) {
    var kk = (st + j) % 4, k2 = (kk + 1) % 4;
    var a = V[kk], b = V[k2];
    if (kk === ci) a = toward(V[kk], V[k2], R);
    if (k2 === ci) b = toward(V[k2], V[kk], R);
    pieceEdge(c, a[0], a[1], b[0], b[1], d.e[kk]);
    if (k2 === ci) {
      var nx = toward(V[k2], V[(k2 + 1) % 4], R);
      c.arc(C, C, R, Math.atan2(b[1] - C, b[0] - C), Math.atan2(nx[1] - C, nx[0] - C), true);
    }
  }
  c.closePath();
}

// Draw piece n with its anchor at (cx, cy); sx/sy = pixels per picture unit.
// opts: { border: px, alpha, rot, flash }
function drawPieceAt(n, cx, cy, sx, sy, opts) {
  if (!pictureImg) buildPictureImage();
  opts = opts || {};
  var an = pieceAnchor(n);
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.translate(cx, cy);
  if (opts.rot) ctx.rotate(opts.rot);
  ctx.scale(sx, sy);
  ctx.translate(-an.x, -an.y);
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
  var inr = pictureInner(), an = pieceAnchor(n);
  var sx = inr.w / PIC_U, sy = inr.h / PIC_U;
  return { x: inr.x + an.x * sx, y: inr.y + an.y * sy, sx: sx, sy: sy };
}

// Badge geometry on a box: centered on the box, same on-screen size for every piece
function pieceBadgeGeom(b, n) {
  var sc = L.bw * 0.62 / pieceSize(n);
  return { x: b.x + L.bw / 2, y: b.y + L.bh / 2, sx: sc, sy: sc };
}

// Called from handleTap when a box is picked
function collectPicturePiece(b) {
  if (!picture || !b.piece || picture.state === 'gone') return;
  var n = b.piece;
  b.piece = 0;
  var g = pieceBadgeGeom(b, n);
  pieceFlights.push({ n: n, x0: g.x, y0: g.y, ssx: g.sx, ssy: g.sy, t: 0, delay: pieceFlights.length * 8 });
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
  var mx = (f.x0 + end.x) / 2, my = Math.min(f.y0, end.y) - 110 * S;
  var x = (1 - t) * (1 - t) * f.x0 + 2 * (1 - t) * t * mx + t * t * end.x;
  var y = (1 - t) * (1 - t) * f.y0 + 2 * (1 - t) * t * my + t * t * end.y;
  // Size: lifts off bigger than on the box, then shrinks into its slot (fake perspective)
  var bigX = Math.max(end.sx, f.ssx) * 1.3, bigY = Math.max(end.sy, f.ssy) * 1.3, sx, sy;
  if (f.t < 0.2) {
    var a = easeOut(f.t / 0.2);
    sx = f.ssx + (bigX - f.ssx) * a; sy = f.ssy + (bigY - f.ssy) * a;
  } else {
    var b2 = easeInOut((f.t - 0.2) / 0.8);
    sx = bigX + (end.sx - bigX) * b2; sy = bigY + (end.sy - bigY) * b2;
  }
  var rot = Math.sin(f.t * Math.PI * 2) * 0.35 * (1 - f.t);
  return { x: x, y: y, sx: sx, sy: sy, rot: rot };
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
    var g = pieceBadgeGeom(b, b.piece);
    var ox = b.shakeT > 0 ? Math.sin(b.shakeT * 28) * 5 * S * b.shakeT : 0;
    var bob = Math.sin(tick * 0.06 + i) * 1.5 * S;
    drawPieceAt(b.piece, g.x + ox, g.y + bob, g.sx, g.sy, { border: 2.2 * S, rot: Math.sin(tick * 0.03 + i) * 0.06 });
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
      drawPieceAt(n, c.x, c.y, c.sx, c.sy, { flash: (picture.snapT[n] || 0) * 0.7, alpha: alpha });
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

  ctx.restore();
}

function drawPieceFlights() {
  for (var i = 0; i < pieceFlights.length; i++) {
    var f = pieceFlights[i];
    if (f.delay > 0) {
      drawPieceAt(f.n, f.x0, f.y0, f.ssx, f.ssy, { border: 2.2 * S });
      continue;
    }
    var p = flightPos(f);
    drawPieceAt(f.n, p.x, p.y, p.sx, p.sy, { border: 2.5 * S * (1 - f.t * 0.6), rot: p.rot });
  }
}
