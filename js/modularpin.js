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
// leaf when it has no living children in the pin's tree. If only the
// base remains and it's a leaf, it also gets removed.
function damageModularPin(pin) {
  var leaves = [];
  for (var i = 0; i < pin.cells.length; i++) {
    var c = pin.cells[i];
    var kids = pin.children[c] || [];
    if (kids.length === 0) leaves.push(c);
  }
  for (var l = 0; l < leaves.length; l++) removePinCell(pin, leaves[l]);
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

// Build the whole pin tree as ONE continuous silhouette path. All
// segments (as capsule rectangles) and node discs get added as
// sub-paths; using the default nonzero fill rule, they union into
// one shape, so there are no visible seams between segments.
function buildPinSilhouettePath(ctx, segments, nodes, half) {
  ctx.beginPath();
  for (var s = 0; s < segments.length; s++) {
    var seg = segments[s];
    var dx = seg.bx - seg.ax, dy = seg.by - seg.ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) continue;
    var nx = dx / len, ny = dy / len;
    var px = -ny * half, py = nx * half;
    ctx.moveTo(seg.ax + px, seg.ay + py);
    ctx.lineTo(seg.bx + px, seg.by + py);
    ctx.lineTo(seg.bx - px, seg.by - py);
    ctx.lineTo(seg.ax - px, seg.ay - py);
    ctx.closePath();
  }
  for (var n = 0; n < nodes.length; n++) {
    ctx.moveTo(nodes[n].x + half, nodes[n].y);
    ctx.arc(nodes[n].x, nodes[n].y, half, 0, Math.PI * 2);
  }
}

function pinTreeBBox(segments, nodes, pad) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function add(x, y) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  for (var n = 0; n < nodes.length; n++) add(nodes[n].x, nodes[n].y);
  for (var s = 0; s < segments.length; s++) {
    add(segments[s].ax, segments[s].ay);
    add(segments[s].bx, segments[s].by);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
}

function drawPinTipCap(x, y, r, tick) {
  // Yellow ring cap at a tip
  ctx.save();
  ctx.shadowColor = 'rgba(255,200,60,0.55)';
  ctx.shadowBlur = 10 * S;
  var pulse = 1 + Math.sin(tick * 0.10 + x * 0.01) * 0.06;
  ctx.strokeStyle = '#FFD34A';
  ctx.lineWidth = 3 * S * pulse;
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawPinBaseDisc(x, y, r, hitT) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 6 * S;
  ctx.shadowOffsetY = 3 * S;
  var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.5, '#E6F0FF');
  g.addColorStop(1, '#9AB8D8');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(90,110,140,0.55)';
  ctx.lineWidth = 1.4 * S;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  // Inner ring
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.stroke();
  if (hitT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (hitT * 0.55) + ')';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawOneModularPin(pin) {
  var thick = Math.min(L.bw, L.bh) * 0.44;
  var half = thick / 2;
  var shakeOff = 0;
  if (pin.shakeT > 0) shakeOff = Math.sin(pin.shakeT * 42) * 3.5 * S * pin.shakeT;

  // Collect all node centers and parent→child segments for the live tree
  var nodes = [];
  for (var i = 0; i < pin.cells.length; i++) {
    var p = modPinCellCenter(pin.cells[i]);
    nodes.push(p);
  }
  var segments = [];
  for (var i2 = 0; i2 < pin.cells.length; i2++) {
    var c = pin.cells[i2];
    var par = pin.parent[c];
    if (par == null) continue;
    var A = modPinCellCenter(par);
    var B = modPinCellCenter(c);
    segments.push({ ax: A.x, ay: A.y, bx: B.x, by: B.y });
  }

  ctx.save();
  ctx.translate(shakeOff, 0);

  // Include retracting stubs into the SAME silhouette so they blend
  // with the trunk while receding — no visible seam at the join.
  var retractSegs = [];
  var retractNodes = [];
  var remKeys = Object.keys(pin.removedT);
  for (var r = 0; r < remKeys.length; r++) {
    var rc = +remKeys[r];
    var t = pin.removedT[rc];
    var parIdx = pin.removedGeom[rc].parent;
    if (parIdx == null || !stock[parIdx]) continue;
    var A2 = modPinCellCenter(parIdx);
    var Bc = stock[rc]; if (!Bc) continue;
    var B2 = { x: Bc.x + L.bw / 2, y: Bc.y + L.bh / 2 };
    var retract = 1 - t;
    var bx = B2.x + (A2.x - B2.x) * retract;
    var by = B2.y + (A2.y - B2.y) * retract;
    retractSegs.push({ ax: A2.x, ay: A2.y, bx: bx, by: by, alpha: t });
    retractNodes.push({ x: bx, y: by });
  }

  if (nodes.length === 0 && retractSegs.length === 0) {
    ctx.restore();
    return;
  }

  // PASS 1 — soft drop shadow: draw the union with a slight offset in a dark tone.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 8 * S;
  ctx.shadowOffsetY = 3 * S;
  ctx.fillStyle = 'rgba(120,90,140,0.85)';
  buildPinSilhouettePath(ctx, segments, nodes, half + 1.2 * S);
  ctx.fill();
  // shadow for retracting stubs as well (fainter)
  if (retractSegs.length) {
    for (var rr = 0; rr < retractSegs.length; rr++) {
      var rs = retractSegs[rr];
      ctx.globalAlpha = rs.alpha;
      buildPinSilhouettePath(ctx, [rs], [retractNodes[rr]], half + 1.2 * S);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // PASS 2 — interior fill of the LIVE tree, clipped to the union so the
  //          gradient and candy stripes wrap the whole pillar with no seams.
  if (nodes.length > 0) {
    ctx.save();
    buildPinSilhouettePath(ctx, segments, nodes, half);
    ctx.clip();

    var bb = pinTreeBBox(segments, nodes, half);

    // Base gradient (rainbow pastel from top to bottom of the shape)
    var grad = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
    grad.addColorStop(0.00, '#FFFFFF');
    grad.addColorStop(0.15, '#FFE1F0');
    grad.addColorStop(0.35, '#C6E4FF');
    grad.addColorStop(0.55, '#CFF5D8');
    grad.addColorStop(0.75, '#FFEE9A');
    grad.addColorStop(1.00, '#B29ACB');
    ctx.fillStyle = grad;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);

    // Diagonal candy stripes across the whole clipped region
    var bands = ['rgba(255,138,190,0.55)', 'rgba(126,201,255,0.55)',
                 'rgba(140,235,175,0.55)', 'rgba(255,220,120,0.55)',
                 'rgba(200,150,240,0.55)'];
    var bandW = Math.max(6 * S, thick * 0.42);
    var diag = bb.w + bb.h;
    var offset = ((tick * 0.4) % (bandW * bands.length * 2));
    for (var b = -bands.length; b * bandW < diag + bandW; b++) {
      var y0 = bb.y + b * bandW - offset;
      ctx.fillStyle = bands[((b % bands.length) + bands.length) % bands.length];
      ctx.beginPath();
      ctx.moveTo(bb.x - 4 * S, y0);
      ctx.lineTo(bb.x + bb.w + 4 * S, y0 - bb.w);
      ctx.lineTo(bb.x + bb.w + 4 * S, y0 - bb.w + bandW);
      ctx.lineTo(bb.x - 4 * S, y0 + bandW);
      ctx.closePath();
      ctx.fill();
    }

    // Sheen: subtle white haze along the top-left edge
    var sheen = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w * 0.6, bb.y + bb.h * 0.6);
    sheen.addColorStop(0, 'rgba(255,255,255,0.55)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);

    // Damage flash
    if (pin.hitT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (pin.hitT * 0.55) + ')';
      ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    }

    ctx.restore();
  }

  // Retract stubs — draw with the SAME styling so the trunk stays visually
  // continuous while the stub fades. Uses their own tiny bbox.
  for (var rs2 = 0; rs2 < retractSegs.length; rs2++) {
    var sg = retractSegs[rs2];
    ctx.save();
    ctx.globalAlpha = sg.alpha;
    buildPinSilhouettePath(ctx, [sg], [retractNodes[rs2]], half);
    ctx.clip();
    var bb2 = pinTreeBBox([sg], [retractNodes[rs2]], half);
    var g2 = ctx.createLinearGradient(bb2.x, bb2.y, bb2.x, bb2.y + bb2.h);
    g2.addColorStop(0, '#FFE1F0');
    g2.addColorStop(0.5, '#C6E4FF');
    g2.addColorStop(1, '#B29ACB');
    ctx.fillStyle = g2;
    ctx.fillRect(bb2.x, bb2.y, bb2.w, bb2.h);
    ctx.restore();
  }

  // Tip caps on current leaves (drawn AFTER the silhouette so they sit on top)
  for (var j = 0; j < pin.cells.length; j++) {
    var c2 = pin.cells[j];
    var kids = pin.children[c2] || [];
    if (kids.length > 0) continue;
    if (c2 === pin.base && pin.cells.length > 1) continue;
    var P = modPinCellCenter(c2);
    drawPinTipCap(P.x, P.y, thick, tick);
  }

  // Base disc last, at the root cell
  if (pin.cells.indexOf(pin.base) >= 0) {
    var Bpos = modPinCellCenter(pin.base);
    drawPinBaseDisc(Bpos.x, Bpos.y, thick * 0.62, pin.hitT);
  }

  ctx.restore();
}

function pinDepth(pin, cellIdx) {
  var d = 0, cur = cellIdx;
  var guard = 0;
  while (pin.parent[cur] != null && guard++ < 100) {
    cur = pin.parent[cur];
    d++;
  }
  return d;
}
