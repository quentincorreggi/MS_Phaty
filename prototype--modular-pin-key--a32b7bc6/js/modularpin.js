// ============================================================
// modularpin.js — Modular Pin: a designer-drawn, bending/branching
//                 pin that locks every box under it. One tip is the
//                 head and points at an adjacent key box; playing the
//                 key box releases the whole pin at once.
//
// Level data: lvl.modPins = [{ cells: [idx...], head: idx, key: idx }]
// Pins live on a layer above the grid, so they don't change grid cells.
// ============================================================

var PIN_RELEASE_SPEED = 0.04;    // releaseT per frame (~0.4s)
var PIN_STUCK_FRAMES = 90;       // frames with nothing playable before auto-release

// ── Grid helpers (work for both editor 7x7 and runtime L.cols) ──
function pinNeighbors(idx, cols, rows) {
  var r = Math.floor(idx / cols), c = idx % cols, out = [];
  if (r > 0)        out.push(idx - cols);
  if (r < rows - 1) out.push(idx + cols);
  if (c > 0)        out.push(idx - 1);
  if (c < cols - 1) out.push(idx + 1);
  return out;
}

function pinHasCell(pin, idx) { return pin.cells.indexOf(idx) >= 0; }

function pinCellLinks(pin, idx, cols, rows) {
  var nb = pinNeighbors(idx, cols, rows), out = [];
  for (var i = 0; i < nb.length; i++) if (pinHasCell(pin, nb[i])) out.push(nb[i]);
  return out;
}

// A tip is a cell joined to the rest of the pin on exactly one side
function pinTips(pin, cols, rows) {
  var out = [];
  for (var i = 0; i < pin.cells.length; i++) {
    if (pinCellLinks(pin, pin.cells[i], cols, rows).length === 1) out.push(pin.cells[i]);
  }
  return out;
}

function pinIsConnected(pin, cols, rows) {
  if (pin.cells.length === 0) return false;
  var seen = {}, queue = [pin.cells[0]], n = 0;
  seen[pin.cells[0]] = true;
  while (queue.length) {
    var cur = queue.shift(); n++;
    var links = pinCellLinks(pin, cur, cols, rows);
    for (var i = 0; i < links.length; i++) {
      if (!seen[links[i]]) { seen[links[i]] = true; queue.push(links[i]); }
    }
  }
  return n === pin.cells.length;
}

function pinIsStraight(pin, cols) {
  var r0 = Math.floor(pin.cells[0] / cols), c0 = pin.cells[0] % cols;
  var sameRow = true, sameCol = true;
  for (var i = 1; i < pin.cells.length; i++) {
    if (Math.floor(pin.cells[i] / cols) !== r0) sameRow = false;
    if (pin.cells[i] % cols !== c0) sameCol = false;
  }
  return sameRow || sameCol;
}

// ── Validation (editor) — returns list of error strings per pin ──
function validateModPin(pin, grid, cols, rows) {
  var errs = [];
  if (pin.cells.length < 4) errs.push('needs at least 4 cells');
  if (!pinIsConnected(pin, cols, rows)) errs.push('cells must all be joined up');
  else if (pin.cells.length >= 2 && pinIsStraight(pin, cols)) errs.push('needs a corner or branch (a straight one is just a Pin)');
  var boxes = 0, bad = false;
  for (var i = 0; i < pin.cells.length; i++) {
    var v = grid[pin.cells[i]];
    if (v && v.wall) continue;
    if (v && !v.tunnel && v.ci >= 0) { boxes++; continue; }
    bad = true;
  }
  if (bad) errs.push('only boxes and walls may sit under it');
  if (boxes === 0) errs.push('must cover at least one box');
  if (pin.head < 0 || pinTips(pin, cols, rows).indexOf(pin.head) < 0) {
    errs.push('pick a tip as the head');
  } else if (pin.key < 0) {
    errs.push('the head needs a box next to it');
  } else {
    var kv = grid[pin.key];
    if (pinHasCell(pin, pin.key)) errs.push('key box is under its own pin');
    else if (!kv || kv.wall || kv.tunnel || !(kv.ci >= 0)) errs.push('the head must point at a box');
  }
  return errs;
}

// Boxes next to the head that it could point at
function pinKeyCandidates(pin, head, grid, cols, rows) {
  var nb = pinNeighbors(head, cols, rows), out = [];
  for (var i = 0; i < nb.length; i++) {
    if (pinHasCell(pin, nb[i])) continue;
    var v = grid[nb[i]];
    if (v && !v.wall && !v.tunnel && v.ci >= 0) out.push(nb[i]);
  }
  return out;
}

// ============================================================
// RUNTIME
// ============================================================

function initModPins(lvl) {
  modPins = [];
  pinStuckFrames = 0;
  var src = lvl.modPins || [];
  for (var i = 0; i < src.length; i++) {
    var p = src[i];
    if (!p || !p.cells || p.cells.length === 0) continue;
    modPins.push({ cells: p.cells.slice(), head: p.head, key: p.key,
      locked: true, releaseT: 0, shakeT: 0 });
  }
}

function isPinCovered(idx) {
  for (var i = 0; i < modPins.length; i++) {
    if (modPins[i].locked && pinHasCell(modPins[i], idx)) return true;
  }
  return false;
}

function pinAtCell(idx) {
  for (var i = 0; i < modPins.length; i++) {
    if (modPins[i].locked && pinHasCell(modPins[i], idx)) return modPins[i];
  }
  return null;
}

function releasePin(pin) {
  if (!pin.locked) return;
  pin.locked = false;
  pin.releaseT = 0.001;
  for (var i = 0; i < pin.cells.length; i++) {
    var b = stock[pin.cells[i]];
    if (!b) continue;
    var cx = b.x + L.bw / 2, cy = b.y + L.bh / 2;
    for (var p = 0; p < 6; p++) {
      var a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
        r: (1.5 + Math.random() * 3) * S, color: Math.random() > 0.5 ? '#FFFFFF' : '#C9D3DF',
        life: 0.9, decay: 0.025 + Math.random() * 0.02, grav: false });
    }
  }
  sfx.pinRelease();
}

// Called when a box is played: every pin keyed to it releases at once
function releasePinsForKey(idx) {
  for (var i = 0; i < modPins.length; i++) {
    if (modPins[i].locked && modPins[i].key === idx) releasePin(modPins[i]);
  }
}

// Blocked-tap feedback on a pin
function pinBlockedTap(pin, idx) {
  pin.shakeT = 0.5;
  if (idx >= 0 && stock[idx]) stock[idx].shakeT = 0.5;
  sfx.pinThunk();
}

function updateModPins() {
  var anyLocked = false;
  for (var i = 0; i < modPins.length; i++) {
    var p = modPins[i];
    if (p.shakeT > 0) p.shakeT = Math.max(0, p.shakeT - 0.04);
    if (!p.locked && p.releaseT > 0 && p.releaseT < 1) p.releaseT = Math.min(1, p.releaseT + PIN_RELEASE_SPEED);
    if (p.locked) anyLocked = true;
  }
  if (!anyLocked || won) { pinStuckFrames = 0; return; }

  // Safety net: if nothing on the board can be played while a pin is
  // still locked, release every locked pin on its own.
  var busy = physMarbles.length > 0;
  var playable = false;
  for (var k = 0; k < stock.length && !busy && !playable; k++) {
    var b = stock[k];
    if (b.isTunnel) { if (b.tunnelSpawning || (b.tunnelContents && b.tunnelContents.length > 0 && b.tunnelCooldown > 0)) busy = true; continue; }
    if (b.isWall || b.empty || b.used) continue;
    if (b.spawning || b.revealT > 0) { busy = true; continue; }
    if (isBoxTappable(k)) playable = true;
  }
  if (busy || playable) { pinStuckFrames = 0; return; }
  pinStuckFrames++;
  if (pinStuckFrames >= PIN_STUCK_FRAMES) {
    pinStuckFrames = 0;
    for (var j = 0; j < modPins.length; j++) if (modPins[j].locked) releasePin(modPins[j]);
    updateBoxReveals(true);
  }
}

// ── Drawing ──
function pinCellCenter(idx) {
  var b = stock[idx];
  return { x: b.x + L.bw / 2, y: b.y + L.bh / 2 };
}

function drawModPins() {
  for (var i = 0; i < modPins.length; i++) {
    var p = modPins[i];
    if (!p.locked && p.releaseT >= 1) continue;
    drawOneModPin(p);
  }
}

function drawOneModPin(p) {
  var cols = L.cols, rows = L.rows;
  var tw = L.bw * 0.34;              // tube width
  var pitch = L.bw + L.bg;
  var t = p.locked ? 0 : p.releaseT;
  var ox = p.shakeT > 0 ? Math.sin(p.shakeT * 28) * 4 * S * p.shakeT : 0;

  // Pivot = average cell centre so the lift/scale feels anchored
  var cx = 0, cy = 0;
  for (var i = 0; i < p.cells.length; i++) { var c0 = pinCellCenter(p.cells[i]); cx += c0.x; cy += c0.y; }
  cx /= p.cells.length; cy /= p.cells.length;

  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.translate(cx + ox, cy - t * t * 70 * S);
  ctx.scale(1 + t * 0.08, 1 + t * 0.08);
  ctx.translate(-cx, -cy);

  // Segments between linked cells (each pair once)
  var segs = [];
  for (var a = 0; a < p.cells.length; a++) {
    var links = pinCellLinks(p, p.cells[a], cols, rows);
    for (var l = 0; l < links.length; l++) if (links[l] > p.cells[a]) segs.push([p.cells[a], links[l]]);
  }
  // Flat tail stubs on every non-head tip
  var tips = pinTips(p, cols, rows), stubs = [];
  for (var k = 0; k < tips.length; k++) {
    if (tips[k] === p.head) continue;
    var tc = pinCellCenter(tips[k]);
    var other = pinCellCenter(pinCellLinks(p, tips[k], cols, rows)[0]);
    var dx = tc.x - other.x, dy = tc.y - other.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
    stubs.push({ x: tc.x, y: tc.y, ux: dx / dl, uy: dy / dl });
  }

  // Shadow under the tube
  ctx.save();
  ctx.translate(0, 3 * S + t * 10 * S);
  strokePinPath(p, segs, stubs, tw + 4 * S, 'rgba(40,30,20,0.28)', pitch);
  ctx.restore();

  // Outline → body → highlight
  strokePinPath(p, segs, stubs, tw + 4 * S, '#3E4654', pitch);
  strokePinPath(p, segs, stubs, tw, '#9FAABA', pitch);
  ctx.save();
  ctx.translate(-tw * 0.12, -tw * 0.14);
  strokePinPath(p, segs, stubs, tw * 0.28, 'rgba(240,245,252,0.75)', pitch);
  ctx.restore();

  // Flat end plates on non-head tips
  for (var s = 0; s < stubs.length; s++) {
    var st = stubs[s];
    var ex = st.x + st.ux * pitch * 0.3, ey = st.y + st.uy * pitch * 0.3;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(Math.atan2(st.uy, st.ux));
    ctx.fillStyle = '#3E4654';
    rRect(-3 * S, -tw * 0.72, 6 * S, tw * 1.44, 2 * S); ctx.fill();
    ctx.fillStyle = '#C3CCD8';
    rRect(-1.6 * S, -tw * 0.6, 3.2 * S, tw * 1.2, 1.5 * S); ctx.fill();
    ctx.restore();
  }

  // Round head knob pointing at the key box
  if (p.head >= 0 && stock[p.head]) {
    var hc = pinCellCenter(p.head);
    var dirX = 0, dirY = 0;
    if (p.key >= 0 && stock[p.key]) {
      var kc = pinCellCenter(p.key);
      var kdx = kc.x - hc.x, kdy = kc.y - hc.y, kdl = Math.sqrt(kdx * kdx + kdy * kdy) || 1;
      dirX = kdx / kdl; dirY = kdy / kdl;
    }
    var kx = hc.x + dirX * pitch * 0.22, ky = hc.y + dirY * pitch * 0.22;
    var kr = tw * 0.95;
    // Neck from head-cell centre to knob
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3E4654'; ctx.lineWidth = tw + 4 * S;
    ctx.beginPath(); ctx.moveTo(hc.x, hc.y); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.strokeStyle = '#9FAABA'; ctx.lineWidth = tw;
    ctx.beginPath(); ctx.moveTo(hc.x, hc.y); ctx.lineTo(kx, ky); ctx.stroke();
    // Pointer triangle
    var px = kx + dirX * kr * 1.05, py = ky + dirY * kr * 1.05;
    var nx = -dirY, ny = dirX;
    ctx.fillStyle = '#8E1B1B';
    ctx.beginPath();
    ctx.moveTo(px + dirX * kr * 0.75, py + dirY * kr * 0.75);
    ctx.lineTo(px + nx * kr * 0.55, py + ny * kr * 0.55);
    ctx.lineTo(px - nx * kr * 0.55, py - ny * kr * 0.55);
    ctx.closePath(); ctx.fill();
    // Knob
    var g = ctx.createRadialGradient(kx - kr * 0.35, ky - kr * 0.4, kr * 0.1, kx, ky, kr);
    g.addColorStop(0, '#FF8A80'); g.addColorStop(0.55, '#E53935'); g.addColorStop(1, '#9E1C1C');
    ctx.fillStyle = '#5E1010';
    ctx.beginPath(); ctx.arc(kx, ky, kr + 2 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(kx - kr * 0.32, ky - kr * 0.36, kr * 0.25, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Pulsing marker on the key box while the pin is locked
  if (p.locked && p.key >= 0 && stock[p.key] && !stock[p.key].used && !stock[p.key].empty) {
    var kb = stock[p.key];
    var pulse = 0.45 + Math.sin(tick * 0.08) * 0.25;
    ctx.save();
    ctx.strokeStyle = 'rgba(229,57,53,' + pulse + ')';
    ctx.lineWidth = 3 * S;
    ctx.setLineDash([6 * S, 4 * S]);
    rRect(kb.x - 2 * S, kb.y - 2 * S, L.bw + 4 * S, L.bh + 4 * S, 8 * S); ctx.stroke();
    ctx.restore();
  }
}

function strokePinPath(p, segs, stubs, width, color, pitch) {
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (var i = 0; i < segs.length; i++) {
    var a = pinCellCenter(segs[i][0]), b = pinCellCenter(segs[i][1]);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  // Stubs end flat (butt) so they never look like a second head
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (var s = 0; s < stubs.length; s++) {
    var st = stubs[s];
    ctx.moveTo(st.x - st.ux * width * 0.5, st.y - st.uy * width * 0.5);
    ctx.lineTo(st.x + st.ux * pitch * 0.3, st.y + st.uy * pitch * 0.3);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
}

// ============================================================
// EDITOR OVERLAY — draws each pin onto the editor grid cells
// ============================================================

var PIN_ID_COLORS = ['#5B8DEF', '#E8833A', '#2FB37A', '#B05CD6', '#D9475B', '#2BB3C0', '#C9A227', '#6E7B8F'];

function editorPinColor(pi) { return PIN_ID_COLORS[pi % PIN_ID_COLORS.length]; }

function editorDecorateCellForPins(cellEl, idx) {
  var pins = editor.modPins;
  for (var pi = 0; pi < pins.length; pi++) {
    var pin = pins[pi];
    var col = editorPinColor(pi);
    if (pinHasCell(pin, idx)) {
      var sel = (editor.currentPin === pi);
      var links = pinCellLinks(pin, idx, 7, 7);
      // centre dot
      var dot = document.createElement('span');
      dot.className = 'ed-pin-seg';
      dot.style.cssText = 'left:30%;top:30%;width:40%;height:40%;border-radius:50%;background:' + col + ';';
      cellEl.appendChild(dot);
      // arms toward linked cells (reach into the grid gap to join up)
      for (var l = 0; l < links.length; l++) {
        var d = links[l] - idx, arm = document.createElement('span');
        arm.className = 'ed-pin-seg';
        if (d === -7) arm.style.cssText = 'left:30%;top:-4px;width:40%;height:calc(50% + 4px);';
        else if (d === 7) arm.style.cssText = 'left:30%;top:50%;width:40%;height:calc(50% + 6px);';
        else if (d === -1) arm.style.cssText = 'left:-4px;top:30%;width:calc(50% + 4px);height:40%;';
        else arm.style.cssText = 'left:50%;top:30%;width:calc(50% + 6px);height:40%;';
        arm.style.background = col;
        cellEl.appendChild(arm);
      }
      cellEl.style.boxShadow = 'inset 0 0 0 2px ' + col + (sel ? ', 0 0 0 2px ' + col : '');
      if (pin.head === idx) {
        var arrows = { '-7': '▲', '7': '▼', '-1': '◀', '1': '▶' };
        var hd = document.createElement('span');
        hd.className = 'ed-pin-head';
        hd.textContent = pin.key >= 0 ? (arrows[String(pin.key - idx)] || '') : '';
        cellEl.appendChild(hd);
      }
      continue;
    }
    if (pin.key === idx) {
      var kb = document.createElement('span');
      kb.className = 'ed-pin-key';
      kb.style.background = col;
      kb.textContent = 'KEY';
      cellEl.appendChild(kb);
    }
  }
}
