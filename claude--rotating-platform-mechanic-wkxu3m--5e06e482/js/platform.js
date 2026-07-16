// ============================================================
// platform.js — Rotating Platform mechanic
//
// A Rotating Platform is a 2x2 gear that sits on the maze grid
// underneath boxes. Every time the player picks up ANY box on the
// board, all platforms rotate 90° anti-clockwise, carrying their
// contents (boxes AND empty cells) one position around the ring.
//
// The plate itself is never pickable. When the last box riding it is
// removed, the plate clears and its cells become normal empty maze.
//
// Reachability is evaluated at each box's CURRENT cell, so boxes
// toggle between pickable and unpickable as they spin. Hidden boxes
// reveal the moment they rotate onto a cell with a clear path.
//
// Safeguard: if the current pick's rotation would leave the player
// with no available pick, the rotation is held for that move. The
// hold is not permanent — plates resume turning as soon as it is
// safe again.
// ============================================================

// ── Geometry helpers ──

function platCellCenterX(idx) { return L.sx + (idx % L.cols) * (L.bw + L.bg) + L.bw / 2; }
function platCellCenterY(idx) { return L.sy + Math.floor(idx / L.cols) * (L.bh + L.bg) + L.bh / 2; }
function platCellX(idx) { return L.sx + (idx % L.cols) * (L.bw + L.bg); }
function platCellY(idx) { return L.sy + Math.floor(idx / L.cols) * (L.bh + L.bg); }

// Anti-clockwise ring order for a 2x2 anchored at top-left index `a`:
// content at ring[i] moves to ring[(i+1)%4] each turn.
//   ring = [TL, BL, BR, TR]
function platRingFor(anchor) {
  var tl = anchor;
  var tr = anchor + 1;
  var bl = anchor + L.cols;
  var br = anchor + L.cols + 1;
  return [tl, bl, br, tr];
}

// ── Build platforms from the parsed grid (called by initGame) ──
// `anchors` is a map { anchorIdx: true }. Every cell of each platform
// must already exist in stock, flagged onPlatform.
function buildPlatforms(anchors) {
  platforms = [];
  for (var key in anchors) {
    var anchor = parseInt(key, 10);
    var ring = platRingFor(anchor);
    var p = {
      anchor: anchor,
      ringCCW: ring,          // [TL, BL, BR, TR]
      cx: 0, cy: 0,
      restAngle: 0,           // resting rotation (radians, fed to ctx.rotate)
      rotT: 0,                // 1 -> 0 while a turn animates
      heldT: 0,               // >0 briefly when a turn is held by the safeguard
      cleared: false
    };
    platforms.push(p);
    for (var i = 0; i < 4; i++) {
      var o = stock[ring[i]];
      if (o) { o.onPlatform = anchor; o.platCell = ring[i]; }
    }
  }
  recomputePlatformGeometry();
}

function recomputePlatformGeometry() {
  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    var tl = p.anchor, br = p.anchor + L.cols + 1;
    p.cx = (platCellCenterX(tl) + platCellCenterX(br)) / 2;
    p.cy = (platCellCenterY(tl) + platCellCenterY(br)) / 2;
  }
}

function getPlatform(anchor) {
  for (var i = 0; i < platforms.length; i++) if (platforms[i].anchor === anchor) return platforms[i];
  return null;
}

function anyPlatformAnimating() {
  for (var i = 0; i < platforms.length; i++) if (!platforms[i].cleared && platforms[i].rotT > 0) return true;
  return false;
}

// ── Rotation ──

function rotatePlatform(p) {
  var ring = p.ringCCW;
  var objs = [stock[ring[0]], stock[ring[1]], stock[ring[2]], stock[ring[3]]];
  // Record where each object comes FROM (for the arc animation) and
  // shift it one position anti-clockwise around the ring.
  for (var i = 0; i < 4; i++) {
    var fromIdx = ring[i];
    var o = objs[i];
    if (o) {
      o.platStartX = platCellCenterX(fromIdx) - p.cx;
      o.platStartY = platCellCenterY(fromIdx) - p.cy;
    }
  }
  for (var i = 0; i < 4; i++) {
    var toIdx = ring[(i + 1) % 4];
    stock[toIdx] = objs[i];
    if (objs[i]) {
      objs[i].platCell = toIdx;
      objs[i].onPlatform = p.anchor;
      objs[i].x = platCellX(toIdx);
      objs[i].y = platCellY(toIdx);
    }
  }
  p.rotT = 1;
}

function rotateAllPlatforms() {
  var any = false;
  for (var i = 0; i < platforms.length; i++) {
    if (platforms[i].cleared) continue;
    rotatePlatform(platforms[i]);
    any = true;
  }
  if (any) {
    if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
    if (typeof sfx !== 'undefined' && sfx.gear) sfx.gear();
  }
}

// Called when the safeguard holds the turn — a small nudge so the
// player sees the plates "wanted" to move but couldn't.
function holdAllPlatforms() {
  for (var i = 0; i < platforms.length; i++) {
    if (platforms[i].cleared) continue;
    platforms[i].heldT = 1;
  }
  if (typeof sfx !== 'undefined' && sfx.gearBlocked) sfx.gearBlocked();
}

// ── Safeguard: would rotating now strand the player with no pick? ──
// Simulates the rotation (with the just-tapped box treated as spent)
// and returns true if no box anywhere would be pickable afterwards.
function platformsWouldDeadlock(tappedIdx) {
  if (!platforms.length) return false;
  var total = stock.length;
  var tappedObj = stock[tappedIdx];

  // Hypothetical object at each index after the rotation.
  var objAt = new Array(total);
  for (var i = 0; i < total; i++) objAt[i] = stock[i];
  for (var pi = 0; pi < platforms.length; pi++) {
    var p = platforms[pi];
    if (p.cleared) continue;
    var ring = p.ringCCW;
    var cur = [stock[ring[0]], stock[ring[1]], stock[ring[2]], stock[ring[3]]];
    for (var i = 0; i < 4; i++) objAt[ring[(i + 1) % 4]] = cur[i];
  }

  // The tapped box will be consumed — find the cell it ends up in after
  // the rotation (it moves if it rides a plate) and treat that as spent.
  var consumedIdx = tappedIdx;
  for (var k = 0; k < total; k++) if (objAt[k] === tappedObj) { consumedIdx = k; break; }

  function passable(idx) {
    if (idx === consumedIdx) return true; // the tapped box will be consumed
    var s = objAt[idx];
    if (!s) return false;
    if (s.isWall || s.isTunnel) return false;
    return !!(s.empty || s.used);
  }

  // Flood fill "path to below the bottom edge".
  var reachable = new Array(total);
  for (var j = 0; j < total; j++) reachable[j] = false;
  var queue = [];
  var bottomRow = L.rows - 1;
  for (var bc = 0; bc < L.cols; bc++) {
    var bIdx = bottomRow * L.cols + bc;
    if (passable(bIdx)) { reachable[bIdx] = true; queue.push(bIdx); }
  }
  var head = 0;
  while (head < queue.length) {
    var curIdx = queue[head++];
    var cr = Math.floor(curIdx / L.cols), cc = curIdx % L.cols;
    var nb = [];
    if (cr > 0) nb.push((cr - 1) * L.cols + cc);
    if (cr < L.rows - 1) nb.push((cr + 1) * L.cols + cc);
    if (cc > 0) nb.push(cr * L.cols + (cc - 1));
    if (cc < L.cols - 1) nb.push(cr * L.cols + (cc + 1));
    for (var n = 0; n < nb.length; n++) {
      if (!reachable[nb[n]] && passable(nb[n])) { reachable[nb[n]] = true; queue.push(nb[n]); }
    }
  }

  var activeBoxes = 0, tappable = 0;
  for (var k = 0; k < total; k++) {
    if (k === consumedIdx) continue;
    var s = objAt[k];
    if (!s) continue;
    if (s.isWall || s.isTunnel || s.empty || s.used) continue;
    activeBoxes++;
    if (s.spawning || s.iceHP > 0) continue; // ice can still be freed by adjacent taps
    var br = Math.floor(k / L.cols), bcol = k % L.cols;
    var hasPath = false;
    if (br === L.rows - 1) hasPath = true;
    else {
      if (br > 0 && reachable[(br - 1) * L.cols + bcol]) hasPath = true;
      else if (br < L.rows - 1 && reachable[(br + 1) * L.cols + bcol]) hasPath = true;
      else if (bcol > 0 && reachable[br * L.cols + (bcol - 1)]) hasPath = true;
      else if (bcol < L.cols - 1 && reachable[br * L.cols + (bcol + 1)]) hasPath = true;
    }
    if (hasPath) tappable++;
  }

  return activeBoxes > 0 && tappable === 0;
}

// ── Per-frame update: animate turns, settle, and clear dead plates ──

function updatePlatforms() {
  for (var pi = 0; pi < platforms.length; pi++) {
    var p = platforms[pi];
    if (p.cleared) continue;

    if (p.heldT > 0) p.heldT = Math.max(0, p.heldT - 0.05);

    if (p.rotT > 0) {
      p.rotT = Math.max(0, p.rotT - PLAT_ROT_SPEED);
      var ang = (1 - p.rotT) * (Math.PI / 2); // 0 -> 90° anti-clockwise
      var cos = Math.cos(ang), sin = Math.sin(ang);
      for (var ci = 0; ci < 4; ci++) {
        var o = stock[p.ringCCW[ci]];
        if (!o || o.platStartX === undefined) continue;
        // Rotate the start offset visually anti-clockwise (screen y is down).
        var dx = o.platStartX * cos + o.platStartY * sin;
        var dy = -o.platStartX * sin + o.platStartY * cos;
        o.x = p.cx + dx - L.bw / 2;
        o.y = p.cy + dy - L.bh / 2;
      }
      if (p.rotT <= 0) {
        p.restAngle -= Math.PI / 2;
        for (var ci = 0; ci < 4; ci++) {
          var idx = p.ringCCW[ci];
          var o = stock[idx];
          if (!o) continue;
          o.x = platCellX(idx);
          o.y = platCellY(idx);
          o.platStartX = undefined;
          o.platStartY = undefined;
        }
      }
    }

    checkPlatformCleared(p);
  }
}

function checkPlatformCleared(p) {
  if (p.cleared) return;
  var active = 0;
  for (var i = 0; i < 4; i++) {
    var o = stock[p.ringCCW[i]];
    if (!o) continue;
    if (o.isWall || o.isTunnel || o.empty || o.used) continue;
    active++;
  }
  if (active > 0) return;

  p.cleared = true;
  for (var i = 0; i < 4; i++) {
    var o = stock[p.ringCCW[i]];
    if (o) { o.onPlatform = undefined; o.isPlatformCell = false; }
  }
  spawnBurst(p.cx, p.cy, '#C9B27A', 22);
  spawnBurst(p.cx, p.cy, '#E8DCC0', 12);
  if (typeof sfx !== 'undefined' && sfx.complete) sfx.complete();
  if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

// ── Drawing (gear body + upright seats), called before drawStock ──

function drawPlatforms() {
  for (var pi = 0; pi < platforms.length; pi++) {
    var p = platforms[pi];
    if (p.cleared) continue;

    var ang = (p.rotT > 0) ? (1 - p.rotT) * (Math.PI / 2) : 0;
    var footprint = 2 * L.bw + L.bg;
    var R = footprint / 2;             // reaches the outer box edges
    var poke = Math.min(L.bg * 0.9, 5 * S); // how far teeth extend past the boxes
    var d = (L.bw + L.bg) / 2;         // quadrant-centre offset from plate centre
    var held = p.heldT;

    // Slight recoil shake when a turn is held.
    var shx = held > 0 ? Math.sin(tick * 0.9) * 2.5 * S * held : 0;

    // ── Gear body (rotates anti-clockwise = decreasing screen angle) ──
    ctx.save();
    ctx.translate(p.cx + shx, p.cy);
    ctx.rotate(p.restAngle - ang);
    drawGearBody(R, poke, S, held);
    drawGearDividers(R, S);
    drawGearDirection(R, S, tick);
    ctx.restore();

    // ── Seats (upright, riding the arc so boxes sit flush on them) ──
    var seatOffsets = [ [-d, -d], [d, -d], [d, d], [-d, d] ];
    var cos = Math.cos(ang), sin = Math.sin(ang);
    for (var s = 0; s < 4; s++) {
      var ox = seatOffsets[s][0], oy = seatOffsets[s][1];
      var rx = ox * cos + oy * sin;
      var ry = -ox * sin + oy * cos;
      drawPlatformSeat(p.cx + rx + shx, p.cy + ry, S);
    }
  }
}

function drawGearBody(R, poke, S, held) {
  ctx.save();

  // Teeth (16 = multiple of 4 so the gear looks identical every 90°).
  // Tips extend past the box edges so the cog silhouette frames the
  // four boxes even while they sit on top of it.
  var teeth = 16;
  var toothOuter = R + poke;
  var toothInner = R - 3 * S;
  ctx.fillStyle = held > 0 ? '#B0A187' : '#94886F';
  ctx.strokeStyle = 'rgba(60,50,38,0.55)';
  ctx.lineWidth = 1 * S;
  for (var t = 0; t < teeth; t++) {
    var a0 = (t / teeth) * Math.PI * 2;
    var halfW = (Math.PI / teeth) * 0.46;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0 - halfW) * toothInner, Math.sin(a0 - halfW) * toothInner);
    ctx.lineTo(Math.cos(a0 - halfW * 0.68) * toothOuter, Math.sin(a0 - halfW * 0.68) * toothOuter);
    ctx.lineTo(Math.cos(a0 + halfW * 0.68) * toothOuter, Math.sin(a0 + halfW * 0.68) * toothOuter);
    ctx.lineTo(Math.cos(a0 + halfW) * toothInner, Math.sin(a0 + halfW) * toothInner);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Main disc with a metallic radial gradient (mostly hidden by the
  // boxes; shows through the gaps and frames the block at its rim).
  var grad = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
  grad.addColorStop(0, held > 0 ? '#D8C9AC' : '#C4B79E');
  grad.addColorStop(0.6, held > 0 ? '#B6A788' : '#A99C82');
  grad.addColorStop(1, '#8A7D66');
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = 'rgba(60,50,38,0.55)'; ctx.lineWidth = 2 * S; ctx.stroke();

  ctx.restore();
}

function drawGearDividers(R, S) {
  // Vertical + horizontal grooves carving the gear into four seats.
  // They reach the box edges so they show in the gaps between boxes.
  ctx.save();
  var reach = R;
  ctx.strokeStyle = 'rgba(60,50,38,0.45)';
  ctx.lineWidth = 3 * S;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-reach, 0); ctx.lineTo(reach, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -reach); ctx.lineTo(0, reach); ctx.stroke();
  // Thin highlight along the grooves.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath(); ctx.moveTo(-reach, -1.5 * S); ctx.lineTo(reach, -1.5 * S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1.5 * S, -reach); ctx.lineTo(-1.5 * S, reach); ctx.stroke();

  // Hub cap in the centre — sits in the gap where the four boxes meet,
  // so it stays visible at rest and carries a small direction arrow.
  var hubR = Math.min(R * 0.16, (L.bg / 2 + 6 * S));
  var hg = ctx.createRadialGradient(-hubR * 0.3, -hubR * 0.3, hubR * 0.1, 0, 0, hubR);
  hg.addColorStop(0, '#E4D8BE'); hg.addColorStop(1, '#7E7059');
  ctx.beginPath(); ctx.arc(0, 0, hubR, 0, Math.PI * 2);
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = 'rgba(60,50,38,0.55)'; ctx.lineWidth = 1.5 * S; ctx.stroke();

  // Tiny anti-clockwise arrow on the hub.
  ctx.strokeStyle = 'rgba(60,50,38,0.7)';
  ctx.lineWidth = 1.4 * S; ctx.lineCap = 'round';
  var ar = hubR * 0.58;
  ctx.beginPath(); ctx.arc(0, 0, ar, -0.4, Math.PI * 1.1, true); ctx.stroke();
  var ha = -0.4;
  var hx = Math.cos(ha) * ar, hy = Math.sin(ha) * ar;
  var hs = hubR * 0.42;
  ctx.beginPath();
  ctx.moveTo(hx + Math.sin(ha) * hs, hy - Math.cos(ha) * hs);
  ctx.lineTo(hx + Math.cos(ha) * hs * 0.6, hy + Math.sin(ha) * hs * 0.6);
  ctx.lineTo(hx - Math.cos(ha) * hs * 0.6, hy - Math.sin(ha) * hs * 0.6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(60,50,38,0.7)'; ctx.fill();
  ctx.restore();
}

function drawGearDirection(R, S, tick) {
  // Curved arrows on the disc showing the anti-clockwise turn.
  ctx.save();
  var pulse = 0.5 + Math.sin(tick * 0.05) * 0.18;
  ctx.strokeStyle = 'rgba(80,66,48,' + pulse + ')';
  ctx.fillStyle = 'rgba(80,66,48,' + pulse + ')';
  ctx.lineWidth = 2.5 * S;
  ctx.lineCap = 'round';
  var ar = R * 0.42;
  // Two opposing curved arrows sweeping anti-clockwise.
  for (var k = 0; k < 2; k++) {
    var base = k * Math.PI;
    // Arc from base+0.5 down to base-0.7 (anti-clockwise sweep = decreasing angle).
    ctx.beginPath();
    ctx.arc(0, 0, ar, base + 0.55, base - 0.55, true);
    ctx.stroke();
    // Arrowhead at the leading (anti-clockwise) end.
    var ha = base - 0.55;
    var hx = Math.cos(ha) * ar, hy = Math.sin(ha) * ar;
    // Tangent direction for anti-clockwise travel at this point.
    var tx = Math.sin(ha), ty = -Math.cos(ha);
    var hs = R * 0.11;
    var nx = Math.cos(ha), ny = Math.sin(ha);
    ctx.beginPath();
    ctx.moveTo(hx + tx * hs, hy + ty * hs);
    ctx.lineTo(hx - nx * hs * 0.7, hy - ny * hs * 0.7);
    ctx.lineTo(hx + nx * hs * 0.7, hy + ny * hs * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawPlatformSeat(cx, cy, S) {
  // A raised pedestal, a touch smaller than a box, so the box reads as
  // resting ON the gear rather than painted onto it.
  var w = L.bw * 0.9, h = L.bh * 0.9;
  var x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  // Drop shadow onto the gear.
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 3 * S;
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#EFE7D8');
  grad.addColorStop(1, '#C9BCA2');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 7 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // Top bevel highlight for volume.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5 * S;
  rRect(x + 1.5 * S, y + 1.5 * S, w - 3 * S, h - 3 * S, 6 * S); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,74,56,0.35)';
  ctx.lineWidth = 1 * S;
  rRect(x, y, w, h, 7 * S); ctx.stroke();
  ctx.restore();
}
