// ============================================================
// modularpin.js — Modular Pin mechanic
// A pillar-shaped overlay: base cell + a tree of covered cells.
// Every covered cell locks the box beneath it. Tapping a box
// cardinal-adjacent to the pin costs 1 HP and removes ALL current
// leaves simultaneously (so branches shrink in parallel).
// ============================================================

// modularPins[] is declared in config.js. Each pin:
//   {
//     cells:    [idx, ...]              covered grid cells (tree)
//     base:     rootIdx                 the base cell (root of the tree)
//     parent:   { childIdx: parentIdx }
//     children: { idx: [childIdx, ...] } (derived)
//     hitT:     0..1                    damage flash timer
//     spawnT:   0..1                    spawn intro
//     shakeT:   reject-shake timer
//     removedT: { idx: 0..1 }           per-cell retract animation
//     removedGeom: { idx: { parent, phase } } snapshot for drawing stub
//   }

function initModularPins(defs) {
  modularPins = [];
  if (!defs || !defs.length) return;
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    if (!d || !d.cells || !d.cells.length) continue;
    var pin = {
      cells: d.cells.slice(),
      base: (d.base != null) ? d.base : d.cells[0],
      parent: {},
      children: {},
      hitT: 0,
      spawnT: 1,
      shakeT: 0,
      removedT: {},
      removedGeom: {}
    };
    if (d.parent) {
      for (var k in d.parent) pin.parent[+k] = d.parent[k];
    } else if (d.parents) {
      for (var k2 in d.parents) pin.parent[+k2] = d.parents[k2];
    } else {
      // Fallback: build a BFS tree from the base using cardinal adjacency
      var cellSet = {};
      for (var ci = 0; ci < pin.cells.length; ci++) cellSet[pin.cells[ci]] = true;
      var visited = {}; visited[pin.base] = true;
      var q = [pin.base];
      while (q.length) {
        var cur = q.shift();
        var neigh = cardinalNeighbors(cur);
        for (var n = 0; n < neigh.length; n++) {
          var nb = neigh[n];
          if (cellSet[nb] && !visited[nb]) {
            visited[nb] = true;
            pin.parent[nb] = cur;
            q.push(nb);
          }
        }
      }
    }
    rebuildPinChildren(pin);
    modularPins.push(pin);
  }
}

function rebuildPinChildren(pin) {
  pin.children = {};
  for (var i = 0; i < pin.cells.length; i++) pin.children[pin.cells[i]] = [];
  for (var childKey in pin.parent) {
    var child = +childKey;
    var par = pin.parent[childKey];
    if (pin.children[par]) pin.children[par].push(child);
  }
}

function cardinalNeighbors(idx) {
  var row = Math.floor(idx / 7), col = idx % 7;
  var out = [];
  if (row > 0) out.push((row - 1) * 7 + col);
  if (row < 6) out.push((row + 1) * 7 + col);
  if (col > 0) out.push(row * 7 + (col - 1));
  if (col < 6) out.push(row * 7 + (col + 1));
  return out;
}

function isCellPinnedByModular(cellIdx) {
  for (var i = 0; i < modularPins.length; i++) {
    if (modularPins[i].cells.indexOf(cellIdx) >= 0) return true;
  }
  return false;
}

// Returns true if boxIdx is cardinal-adjacent to any covered cell of any pin.
function isBoxAdjacentToAnyPin(boxIdx) {
  var neigh = cardinalNeighbors(boxIdx);
  for (var i = 0; i < modularPins.length; i++) {
    var cells = modularPins[i].cells;
    for (var n = 0; n < neigh.length; n++) {
      if (cells.indexOf(neigh[n]) >= 0) return true;
    }
  }
  return false;
}

// Called when a box at boxIdx has just become used. Damage every pin
// that has any cell adjacent to boxIdx.
function damagePinsAdjacentTo(boxIdx) {
  var neigh = cardinalNeighbors(boxIdx);
  for (var i = 0; i < modularPins.length; i++) {
    var pin = modularPins[i];
    var touches = false;
    for (var n = 0; n < neigh.length; n++) {
      if (pin.cells.indexOf(neigh[n]) >= 0) { touches = true; break; }
    }
    if (touches) damageModularPin(pin);
  }
}

// One HP damage: remove all current leaves simultaneously. A cell is a
// leaf when it has no living children in the pin's tree. When the last
// stalk unit falls, the base falls with it (same hit).
function damageModularPin(pin) {
  var leaves = [];
  for (var i = 0; i < pin.cells.length; i++) {
    var c = pin.cells[i];
    var kids = pin.children[c] || [];
    if (kids.length === 0) leaves.push(c);
  }
  for (var l = 0; l < leaves.length; l++) removePinCell(pin, leaves[l]);
  // If only the base remains after removing this hit's leaves, take the
  // base out too — base + last stalk fall together.
  if (pin.cells.length === 1 && pin.cells[0] === pin.base) {
    removePinCell(pin, pin.base);
  }
  pin.hitT = 1;
  pin.shakeT = 0.55;
  if (typeof sfx !== 'undefined' && sfx.pinChip) sfx.pinChip();
  if (pin.cells.length === 0) {
    if (typeof sfx !== 'undefined' && sfx.pinPop) sfx.pinPop();
  }
}

function removePinCell(pin, cellIdx) {
  // Remove from cells
  var i = pin.cells.indexOf(cellIdx);
  if (i >= 0) pin.cells.splice(i, 1);
  var parentIdx = (pin.parent[cellIdx] != null) ? pin.parent[cellIdx] : null;
  // Unlink from parent's children
  if (parentIdx != null && pin.children[parentIdx]) {
    var kids = pin.children[parentIdx];
    var j = kids.indexOf(cellIdx);
    if (j >= 0) kids.splice(j, 1);
  }
  delete pin.parent[cellIdx];
  delete pin.children[cellIdx];
  // Snapshot for retract animation
  pin.removedT[cellIdx] = 1;
  pin.removedGeom[cellIdx] = { parent: parentIdx };
  // Sparks
  var cell = stock[cellIdx];
  if (cell) {
    var cx = cell.x + L.bw / 2, cy = cell.y + L.bh / 2;
    var palette = ['#FF7FBF', '#7FC1FF', '#7FF0B0', '#FFE47F', '#B98CFF', '#FFB07A'];
    for (var k = 0; k < 12; k++) {
      var ang = Math.PI * 2 * Math.random();
      var sp = 1.4 + Math.random() * 3.3;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * sp * S, vy: Math.sin(ang) * sp * S - 1.2 * S,
        r: (1.6 + Math.random() * 2.4) * S,
        color: palette[(Math.random() * palette.length) | 0],
        life: 0.9, decay: 0.03 + Math.random() * 0.02, grav: true
      });
    }
  }
}

function updateModularPins() {
  var anyEmpty = false;
  for (var i = 0; i < modularPins.length; i++) {
    var p = modularPins[i];
    if (p.spawnT > 0) p.spawnT = Math.max(0, p.spawnT - 0.04);
    if (p.hitT > 0) p.hitT = Math.max(0, p.hitT - 0.05);
    if (p.shakeT > 0) p.shakeT = Math.max(0, p.shakeT - 0.05);
    var keys = Object.keys(p.removedT);
    for (var k = 0; k < keys.length; k++) {
      p.removedT[keys[k]] -= 0.06;
      if (p.removedT[keys[k]] <= 0) {
        delete p.removedT[keys[k]];
        delete p.removedGeom[keys[k]];
      }
    }
    if (p.cells.length === 0 && Object.keys(p.removedT).length === 0) anyEmpty = true;
  }
  if (anyEmpty) {
    var fresh = [];
    for (var j = 0; j < modularPins.length; j++) {
      var pj = modularPins[j];
      if (pj.cells.length > 0 || Object.keys(pj.removedT).length > 0) fresh.push(pj);
    }
    modularPins = fresh;
    if (typeof updateBoxReveals === 'function') updateBoxReveals(true);
  }
}

// Reject-shake all pins that cover cellIdx
function modularPinRejectShakeAt(cellIdx) {
  for (var i = 0; i < modularPins.length; i++) {
    if (modularPins[i].cells.indexOf(cellIdx) >= 0) modularPins[i].shakeT = 0.5;
  }
}

// ── Rendering ─────────────────────────────────────────────────

function drawModularPins() {
  if (!modularPins || !modularPins.length) return;
  for (var i = 0; i < modularPins.length; i++) drawOneModularPin(modularPins[i]);
}

function modPinCellCenter(cellIdx) {
  var cell = stock[cellIdx];
  return { x: cell.x + L.bw / 2, y: cell.y + L.bh / 2 };
}

// Add a capsule-rect sub-path from (ax,ay) to (bx,by), thickness 2*half.
// Multiple sub-paths added to one path form a union (nonzero fill rule),
// so overlapping bridges merge visually into a single continuous shape.
function addPinCapsule(ctx, ax, ay, bx, by, half) {
  var dx = bx - ax, dy = by - ay;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) {
    ctx.moveTo(ax + half, ay);
    ctx.arc(ax, ay, half, 0, Math.PI * 2);
    return;
  }
  var nx = dx / len, ny = dy / len;
  var px = -ny * half, py = nx * half;
  ctx.moveTo(ax + px, ay + py);
  ctx.lineTo(bx + px, by + py);
  ctx.lineTo(bx - px, by - py);
  ctx.lineTo(ax - px, ay - py);
  ctx.closePath();
}

function pinBridgesBBox(bridges, stubs, pad) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function add(x, y) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  for (var b = 0; b < bridges.length; b++) {
    add(bridges[b].ax, bridges[b].ay);
    add(bridges[b].bx, bridges[b].by);
  }
  for (var s = 0; s < stubs.length; s++) {
    add(stubs[s].ax, stubs[s].ay);
    add(stubs[s].bx, stubs[s].by);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
}

// Gold circular base disc.
function drawPinBaseDisc(x, y, r, hitT) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 2 * S;
  var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#FFF9D2');
  g.addColorStop(0.45, '#FFD458');
  g.addColorStop(1, '#A77015');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(120,80,10,0.65)';
  ctx.lineWidth = 1.4 * S;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.stroke();
  if (hitT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (hitT * 0.55) + ')';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawOneModularPin(pin) {
  var cellSize = Math.min(L.bw, L.bh);
  var thick = cellSize * 0.55;
  var half = thick / 2;
  var shakeOff = 0;
  if (pin.shakeT > 0) shakeOff = Math.sin(pin.shakeT * 42) * 3.5 * S * pin.shakeT;

  // Build bridges: one rectangle per parent-child edge, spanning from
  // the parent's OUTER edge (facing away from the child) all the way
  // to the child's OUTER edge (facing away from the parent). This
  // guarantees each covered cell is fully covered along the edge axis,
  // and adjacent bridges overlap seamlessly at their shared cell.
  var bridges = [];
  for (var i = 0; i < pin.cells.length; i++) {
    var c = pin.cells[i];
    var par = pin.parent[c];
    if (par == null) continue;
    var pCell = stock[par], cCell = stock[c];
    if (!pCell || !cCell) continue;
    var pcx = pCell.x + L.bw / 2, pcy = pCell.y + L.bh / 2;
    var ccx = cCell.x + L.bw / 2, ccy = cCell.y + L.bh / 2;
    var dx = ccx - pcx, dy = ccy - pcy;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) continue;
    var nx = dx / len, ny = dy / len;
    var ext = (Math.abs(dx) > Math.abs(dy)) ? L.bw / 2 : L.bh / 2;
    bridges.push({
      ax: pcx - nx * ext, ay: pcy - ny * ext,
      bx: ccx + nx * ext, by: ccy + ny * ext
    });
  }

  // Retracting stubs — one per cell being animated away. They shrink
  // from the parent side outward toward the vanished cell.
  var stubs = [];
  var remKeys = Object.keys(pin.removedT);
  for (var r = 0; r < remKeys.length; r++) {
    var rc = +remKeys[r];
    var t = pin.removedT[rc];
    var parIdx = pin.removedGeom[rc].parent;
    if (parIdx == null || !stock[parIdx]) continue;
    var pC = stock[parIdx];
    var rC = stock[rc]; if (!rC) continue;
    var pcx2 = pC.x + L.bw / 2, pcy2 = pC.y + L.bh / 2;
    var rcx = rC.x + L.bw / 2, rcy = rC.y + L.bh / 2;
    var dx2 = rcx - pcx2, dy2 = rcy - pcy2;
    var len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (len2 < 0.01) continue;
    var nx2 = dx2 / len2, ny2 = dy2 / len2;
    var ext2 = (Math.abs(dx2) > Math.abs(dy2)) ? L.bw / 2 : L.bh / 2;
    // Start point is parent's outer edge on the removed-cell side (this
    // point stays put throughout retract, so the stub fades away from
    // where it used to connect).
    var startX = pcx2 + nx2 * ext2;
    var startY = pcy2 + ny2 * ext2;
    var fullReach = (len2 + ext2) - ext2; // = len2, distance from parent's outer edge to removed cell's outer edge past parent's edge
    // Actually full reach in world = distance from start point to removed cell's outer far edge = len2 + ext2 (from parent's outer to removed cell's outer)
    var full = len2 + ext2;
    var reach = full * t;
    stubs.push({
      ax: startX, ay: startY,
      bx: startX + nx2 * reach, by: startY + ny2 * reach,
      alpha: t
    });
  }

  if (bridges.length === 0 && stubs.length === 0 && !(pin.cells.indexOf(pin.base) >= 0)) {
    return;
  }

  ctx.save();
  ctx.translate(shakeOff, 0);

  // PASS 1 — drop shadow / outline. Slightly larger silhouette in a
  //          dark tone so the interior fill leaves a thin outline visible.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 8 * S;
  ctx.shadowOffsetY = 3 * S;
  ctx.fillStyle = 'rgba(120,90,140,0.85)';
  ctx.beginPath();
  for (var bi = 0; bi < bridges.length; bi++) {
    addPinCapsule(ctx, bridges[bi].ax, bridges[bi].ay, bridges[bi].bx, bridges[bi].by, half + 1.2 * S);
  }
  // Isolated base (no bridges) — still show a base disc-sized shadow so the
  // shadow layer isn't empty.
  if (bridges.length === 0 && pin.cells.indexOf(pin.base) >= 0) {
    var bcS = stock[pin.base];
    var bcSx = bcS.x + L.bw / 2, bcSy = bcS.y + L.bh / 2;
    ctx.moveTo(bcSx + half + 1.2 * S, bcSy);
    ctx.arc(bcSx, bcSy, half + 1.2 * S, 0, Math.PI * 2);
  }
  ctx.fill();
  // shadow behind fading stubs
  for (var st = 0; st < stubs.length; st++) {
    ctx.globalAlpha = stubs[st].alpha;
    ctx.beginPath();
    addPinCapsule(ctx, stubs[st].ax, stubs[st].ay, stubs[st].bx, stubs[st].by, half + 1.2 * S);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // PASS 2 — interior fill: clip to the union of all bridges, then paint
  //          the rainbow gradient + static diagonal candy stripes across
  //          the whole bounding box. Because everything is under one clip,
  //          the whole tree reads as one continuous unit.
  if (bridges.length > 0) {
    ctx.save();
    ctx.beginPath();
    for (var b2 = 0; b2 < bridges.length; b2++) {
      addPinCapsule(ctx, bridges[b2].ax, bridges[b2].ay, bridges[b2].bx, bridges[b2].by, half);
    }
    ctx.clip();

    var bb = pinBridgesBBox(bridges, [], half);
    var grad = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
    grad.addColorStop(0.00, '#FFFFFF');
    grad.addColorStop(0.15, '#FFE1F0');
    grad.addColorStop(0.35, '#C6E4FF');
    grad.addColorStop(0.55, '#CFF5D8');
    grad.addColorStop(0.75, '#FFEE9A');
    grad.addColorStop(1.00, '#B29ACB');
    ctx.fillStyle = grad;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);

    // STATIC diagonal candy stripes — same anchor every frame.
    var bands = ['rgba(255,138,190,0.55)', 'rgba(126,201,255,0.55)',
                 'rgba(140,235,175,0.55)', 'rgba(255,220,120,0.55)',
                 'rgba(200,150,240,0.55)'];
    var bandW = Math.max(6 * S, thick * 0.42);
    var diag = bb.w + bb.h;
    for (var bIdx = -bands.length; bIdx * bandW < diag + bandW; bIdx++) {
      var y0 = bb.y + bIdx * bandW;
      ctx.fillStyle = bands[((bIdx % bands.length) + bands.length) % bands.length];
      ctx.beginPath();
      ctx.moveTo(bb.x - 4 * S, y0);
      ctx.lineTo(bb.x + bb.w + 4 * S, y0 - bb.w);
      ctx.lineTo(bb.x + bb.w + 4 * S, y0 - bb.w + bandW);
      ctx.lineTo(bb.x - 4 * S, y0 + bandW);
      ctx.closePath();
      ctx.fill();
    }

    // Sheen along top-left edge for a subtle 3D feel.
    var sheen = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w * 0.6, bb.y + bb.h * 0.6);
    sheen.addColorStop(0, 'rgba(255,255,255,0.55)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);

    if (pin.hitT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (pin.hitT * 0.55) + ')';
      ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    }
    ctx.restore();
  }

  // Retracting stubs — clip to each stub's own capsule, fill with
  // matching gradient so it visually reads as the same tube fading.
  for (var st2 = 0; st2 < stubs.length; st2++) {
    var s = stubs[st2];
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.beginPath();
    addPinCapsule(ctx, s.ax, s.ay, s.bx, s.by, half);
    ctx.clip();
    var sbb = pinBridgesBBox([s], [], half);
    var g2 = ctx.createLinearGradient(sbb.x, sbb.y, sbb.x, sbb.y + sbb.h);
    g2.addColorStop(0, '#FFE1F0');
    g2.addColorStop(0.5, '#C6E4FF');
    g2.addColorStop(1, '#B29ACB');
    ctx.fillStyle = g2;
    ctx.fillRect(sbb.x, sbb.y, sbb.w, sbb.h);
    ctx.restore();
  }

  // Gold base disc on top, at the base cell.
  if (pin.cells.indexOf(pin.base) >= 0) {
    var Bpos = modPinCellCenter(pin.base);
    drawPinBaseDisc(Bpos.x, Bpos.y, thick * 0.55, pin.hitT);
  }

  ctx.restore();
}
