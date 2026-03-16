// ============================================================
// connected.js — Connected Boxes mechanic
//
// Groups of 2-3 adjacent boxes that all fire when any one is
// tapped. Connections are stored per-level in grid metadata
// and drawn as gold chain links between box centers.
// ============================================================

// Runtime connection groups: array of arrays of stock indices
var connectedGroups = [];

// ── Build runtime groups from level grid ──
function initConnectedGroups() {
  connectedGroups = [];
  var lvl = LEVELS[currentLevel];
  if (!lvl || !lvl.connectedGroups) return;
  for (var g = 0; g < lvl.connectedGroups.length; g++) {
    connectedGroups.push(lvl.connectedGroups[g].slice());
  }
}

// ── Find group containing a given stock index ──
function getConnectedGroup(idx) {
  for (var g = 0; g < connectedGroups.length; g++) {
    for (var m = 0; m < connectedGroups[g].length; m++) {
      if (connectedGroups[g][m] === idx) return connectedGroups[g];
    }
  }
  return null;
}

// ── Check if two grid indices are adjacent (orthogonal) ──
function areAdjacent(a, b, cols) {
  var ra = Math.floor(a / cols), ca = a % cols;
  var rb = Math.floor(b / cols), cb = b % cols;
  var dr = Math.abs(ra - rb), dc = Math.abs(ca - cb);
  return (dr + dc) === 1;
}

// ── Draw gold chain links between connected boxes ──
function drawConnectedLinks() {
  if (connectedGroups.length === 0) return;
  ctx.save();
  for (var g = 0; g < connectedGroups.length; g++) {
    var group = connectedGroups[g];
    // Check if entire group is used up — skip drawing
    var allUsed = true;
    for (var m = 0; m < group.length; m++) {
      var b = stock[group[m]];
      if (b && !b.used && !b.empty) { allUsed = false; break; }
    }
    if (allUsed) continue;

    // Draw links between consecutive members
    for (var m = 0; m < group.length - 1; m++) {
      var b1 = stock[group[m]];
      var b2 = stock[group[m + 1]];
      if (!b1 || !b2) continue;

      var x1 = b1.x + L.bw / 2;
      var y1 = b1.y + L.bh / 2;
      var x2 = b2.x + L.bw / 2;
      var y2 = b2.y + L.bh / 2;

      // Gold glow behind chain
      ctx.strokeStyle = 'rgba(255,200,60,0.25)';
      ctx.lineWidth = 8 * S;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Main gold chain — dashed
      ctx.strokeStyle = 'rgba(218,165,32,0.85)';
      ctx.lineWidth = 3 * S;
      ctx.setLineDash([5 * S, 4 * S]);
      ctx.lineDashOffset = -tick * 0.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small chain link circles at endpoints
      var linkR = 4 * S;
      ctx.fillStyle = 'rgba(218,165,32,0.7)';
      ctx.beginPath(); ctx.arc(x1, y1, linkR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x2, y2, linkR, 0, Math.PI * 2); ctx.fill();

      // White highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(x1 - linkR * 0.2, y1 - linkR * 0.2, linkR * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x2 - linkR * 0.2, y2 - linkR * 0.2, linkR * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
