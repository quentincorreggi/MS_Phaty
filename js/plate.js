// ============================================================
// plate.js — Rotating Plate mechanic
// A 2x2 group of boxes that rotates 90deg clockwise after every tap.
// Positions: 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
// ============================================================

var plates = [];

function initPlates(grid, totalSlots) {
  plates = [];
  var plateMap = {};
  for (var i = 0; i < Math.min(grid.length, totalSlots); i++) {
    var cell = grid[i];
    if (!cell || !cell.plate) continue;
    var pid = cell.plateId;
    if (!plateMap[pid]) plateMap[pid] = [];
    plateMap[pid].push({ idx: i, pos: cell.platePos });
  }
  for (var pid in plateMap) {
    var entries = plateMap[pid];
    if (entries.length !== 4) continue;
    entries.sort(function(a, b) { return a.pos - b.pos; });
    plates.push({
      id: parseInt(pid),
      indices: [entries[0].idx, entries[1].idx, entries[2].idx, entries[3].idx],
      rotT: 0
    });
  }
}

function triggerAllPlateRotations() {
  for (var p = 0; p < plates.length; p++) {
    rotatePlate(plates[p]);
  }
}

function rotatePlate(plate) {
  var idx = plate.indices;
  for (var i = 0; i < 4; i++) {
    if (stock[idx[i]] && stock[idx[i]].spawning) return;
  }
  var snaps = [];
  for (var i = 0; i < 4; i++) {
    var b = stock[idx[i]];
    snaps.push({
      ci: b.ci, used: b.used, empty: b.empty, remaining: b.remaining,
      spawning: b.spawning, spawnIdx: b.spawnIdx,
      revealed: b.revealed, boxType: b.boxType,
      iceHP: b.iceHP, iceCrackT: b.iceCrackT, iceShatterT: b.iceShatterT,
      blockerCount: b.blockerCount, idlePhase: b.idlePhase
    });
  }
  // Clockwise: new[0]=old[3], new[1]=old[0], new[2]=old[1], new[3]=old[2]
  var rot = [snaps[3], snaps[0], snaps[1], snaps[2]];
  for (var i = 0; i < 4; i++) {
    var b = stock[idx[i]], d = rot[i];
    b.ci = d.ci; b.used = d.used; b.empty = d.empty; b.remaining = d.remaining;
    b.spawning = d.spawning; b.spawnIdx = d.spawnIdx;
    b.revealed = d.revealed; b.boxType = d.boxType;
    b.iceHP = d.iceHP; b.iceCrackT = d.iceCrackT; b.iceShatterT = d.iceShatterT;
    b.blockerCount = d.blockerCount; b.idlePhase = d.idlePhase;
    b.popT = 0; b.revealT = 0; b.emptyT = 0; b.shakeT = 0;
  }
  plate.rotT = 1.0;
  updateBoxReveals(false);
}

function updatePlates() {
  for (var p = 0; p < plates.length; p++) {
    if (plates[p].rotT > 0) plates[p].rotT = Math.max(0, plates[p].rotT - 0.055);
  }
}

function drawPlateBgs() {
  if (!plates.length) return;
  for (var p = 0; p < plates.length; p++) {
    var plate = plates[p];
    var idx = plate.indices;
    var b0 = stock[idx[0]], b2 = stock[idx[2]];
    if (!b0 || !b2) continue;
    var pad = 5 * S;
    var x = b0.x - pad, y = b0.y - pad;
    var w = b2.x + L.bw + pad - x;
    var h = b2.y + L.bh + pad - y;
    var cx = x + w / 2, cy = y + h / 2;
    var spinning = plate.rotT > 0;
    var pulse = spinning ? 1 + Math.sin(plate.rotT * Math.PI * 2) * 0.04 : 1;

    ctx.save();
    if (spinning) {
      ctx.translate(cx, cy); ctx.scale(pulse, pulse); ctx.translate(-cx, -cy);
      ctx.globalAlpha = plate.rotT * 0.22;
      ctx.fillStyle = '#CD8B3C';
      ctx.shadowColor = '#CD8B3C'; ctx.shadowBlur = 14 * S;
      rRect(x - 2 * S, y - 2 * S, w + 4 * S, h + 4 * S, 12 * S); ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }

    ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 2 * S;
    ctx.strokeStyle = spinning ? '#FFD060' : '#CD8B3C';
    ctx.lineWidth = 3.5 * S;
    rRect(x, y, w, h, 10 * S); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = spinning ? '#FFD060' : '#CD8B3C';
    ctx.lineWidth = 1.5 * S;
    ctx.setLineDash([3 * S, 3 * S]);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    var arrowR = Math.min(w, h) * 0.1;
    ctx.save();
    ctx.translate(cx, cy);
    if (spinning) ctx.rotate((1 - plate.rotT) * Math.PI * 2);
    ctx.globalAlpha = spinning ? (0.5 + plate.rotT * 0.5) : 0.32;
    ctx.strokeStyle = spinning ? '#FFD060' : '#CD8B3C';
    ctx.lineWidth = 2 * S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, arrowR, -0.25, Math.PI * 1.5); ctx.stroke();
    var hs = 3.5 * S;
    var hx = Math.cos(Math.PI * 1.5) * arrowR;
    var hy = Math.sin(Math.PI * 1.5) * arrowR;
    ctx.fillStyle = spinning ? '#FFD060' : '#CD8B3C';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + hs, hy - hs);
    ctx.lineTo(hx - hs * 0.3, hy - hs * 1.3);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.restore();
  }
}

function drawPlateOverlays() {
  if (!plates.length) return;
  for (var p = 0; p < plates.length; p++) {
    var plate = plates[p];
    if (plate.rotT <= 0) continue;
    var idx = plate.indices;
    var b0 = stock[idx[0]], b2 = stock[idx[2]];
    if (!b0 || !b2) continue;
    var pad = 5 * S;
    var x = b0.x - pad, y = b0.y - pad;
    var w = b2.x + L.bw + pad - x;
    var h = b2.y + L.bh + pad - y;
    ctx.save();
    ctx.globalAlpha = Math.sin(plate.rotT * Math.PI) * 0.1;
    ctx.fillStyle = '#FFD060';
    rRect(x, y, w, h, 10 * S); ctx.fill();
    ctx.restore();
  }
}
