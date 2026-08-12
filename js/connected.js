// === THREE-LANE CONNECTED CUSTOMERS ===
// Three sort customers — one in each of three adjacent lanes (columns
// X, X+1, X+2), all at the same queue depth N — are linked together.
// None of the three accepts marbles until all three have simultaneously
// reached the FRONT of their lane. A locked customer sitting at the front
// blocks its lane: the queue behind it cannot advance. Once all three are
// at the front at the same time they unlock and behave like normal
// customers, each accepting its own color, filled and cleared
// independently.
//
// Data model: a connected customer is an ordinary sort box (with its own
// `ci` color) carrying extra fields:
//   connected  : true
//   locked     : true while waiting, false once the trio unlocks
//   connGroup  : reference to the shared group object
// Group objects live in the global `connectedGroups` (see config.js) and
// hold { cols:[X,X+1,X+2], depth:N, members:[box,box,box], unlocked, unlockT }.

// ── Placement (called from initGame after sort columns are built) ──
function placeConnectedTrios(lvl) {
  connectedGroups = [];
  var numTrios = lvl.connectedTrios || 0;
  if (numTrios <= 0) return;

  // With 4 lanes, an adjacent trio starts at column 0 ({0,1,2}) or 1 ({1,2,3}).
  var starts = [0, 1];

  for (var t = 0; t < numTrios; t++) {
    // Prefer a start column not already used by another trio, when possible.
    var order = starts.slice();
    // simple index-based rotation so two trios pick different starts
    if (connectedGroups.length > 0) order.reverse();

    var placed = false;
    for (var oi = 0; oi < order.length && !placed; oi++) {
      var X = order[oi];
      var cols = [X, X + 1, X + 2];
      var minLen = Math.min(sortCols[cols[0]].length, sortCols[cols[1]].length, sortCols[cols[2]].length);
      if (minLen === 0) continue;

      // A depth N is eligible only if, in all three lanes, the box at N is a
      // plain colored customer (not a lock button, not already connected).
      var deep = [], shallow = [];
      for (var n = 0; n < minLen; n++) {
        var ok = true;
        for (var k = 0; k < 3; k++) {
          var bx = sortCols[cols[k]][n];
          if (!bx || bx.type === 'lock' || bx.connected) { ok = false; break; }
        }
        if (!ok) continue;
        if (n >= 1) deep.push(n); else shallow.push(n);
      }
      // Prefer N >= 1 so the trio must be brought to the front (real pressure);
      // fall back to the front row only if that is the only option.
      var pool = deep.length ? deep : shallow;
      if (!pool.length) continue;

      var N = pool[Math.floor(Math.random() * pool.length)];
      var group = { cols: cols, depth: N, members: [], unlocked: false, unlockT: 0 };
      for (var k2 = 0; k2 < 3; k2++) {
        var box = sortCols[cols[k2]][N];
        box.connected = true;
        box.locked = true;
        box.connGroup = group;
        group.members.push(box);
      }
      connectedGroups.push(group);
      placed = true;
    }
  }
}

// ── Front-of-lane helper ──
function connFrontVis(col) {
  for (var r = 0; r < col.length; r++) if (col[r].vis) return col[r];
  return null;
}

// A connected customer that has not yet unlocked never accepts marbles.
function isSortBoxLocked(box) {
  return !!(box && box.connected && box.locked);
}

// ── Per-frame update (called from update()) ──
// Unlock a trio the moment all three members are simultaneously the visible
// front box of their respective lanes.
function updateConnected() {
  for (var g = 0; g < connectedGroups.length; g++) {
    var grp = connectedGroups[g];
    if (grp.unlocked) {
      if (grp.unlockT > 0) grp.unlockT = Math.max(0, grp.unlockT - 0.02);
      continue;
    }
    var allFront = true;
    for (var k = 0; k < 3; k++) {
      var member = grp.members[k];
      var col = sortCols[grp.cols[k]];
      if (!member.vis || connFrontVis(col) !== member) { allFront = false; break; }
    }
    if (!allFront) continue;

    // Unlock all three at once.
    grp.unlocked = true;
    grp.unlockT = 1;
    for (var k2 = 0; k2 < 3; k2++) {
      var m = grp.members[k2];
      m.locked = false;
      m.shineT = 1;
      m.squishT = 1;
    }
    sfx.complete();
    for (var k3 = 0; k3 < 3; k3++) {
      var cc = grp.cols[k3];
      var bx = L.sSx + cc * (L.sBw + L.sColGap) + L.sBw / 2;
      var by = getSortBoxY(cc, 0) + L.sBh / 2;
      spawnBurst(bx, by, '#FFD54A', 16);
      spawnConfetti(bx, by, 10);
    }
  }
}

// ── Chain overlay (called from frame() after drawSortArea) ──
// Draws the chain linking the three members while any of them is still
// locked, plus a snapping flash on the frame the trio unlocks.
function drawConnectedLinks() {
  if (!connectedGroups.length) return;

  for (var g = 0; g < connectedGroups.length; g++) {
    var grp = connectedGroups[g];

    // Compute on-screen center for each member (skip members scrolled out of view).
    var pts = [];
    var anyLocked = false, allShown = true;
    for (var k = 0; k < 3; k++) {
      var member = grp.members[k];
      if (member.locked) anyLocked = true;
      if (!member.vis) { allShown = false; break; }
      var col = sortCols[grp.cols[k]];
      var vi = 0, seen = 0, found = false;
      for (var r = 0; r < col.length; r++) {
        if (!col[r].vis) continue;
        if (col[r] === member) { vi = seen; found = true; break; }
        seen++;
      }
      if (!found || vi >= SORT_VISIBLE_ROWS) { allShown = false; break; }
      var cx = L.sSx + grp.cols[k] * (L.sBw + L.sColGap) + L.sBw / 2;
      var cy = getSortBoxY(grp.cols[k], vi) + L.sBh / 2;
      pts.push({ x: cx, y: cy });
    }
    if (!allShown || pts.length < 3) continue;

    var flash = grp.unlocked ? grp.unlockT : 0;
    if (!anyLocked && flash <= 0) continue;

    ctx.save();
    // Chain runs above the boxes so it doesn't cover the marbles.
    var linkY = -L.sBh / 2 - 4 * S;
    var chainCol = grp.unlocked ? 'rgba(120,200,120,' : 'rgba(90,70,55,';
    var alpha = grp.unlocked ? (0.7 * flash) : 0.85;

    // Backing line + chain-link beads between consecutive members.
    for (var s = 0; s < 2; s++) {
      var a = pts[s], b = pts[s + 1];
      var ay = a.y + linkY, by2 = b.y + linkY;
      ctx.strokeStyle = chainCol + (alpha * 0.5) + ')';
      ctx.lineWidth = 4 * S;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, ay); ctx.lineTo(b.x, by2); ctx.stroke();

      var dist = Math.hypot(b.x - a.x, by2 - ay);
      var links = Math.max(2, Math.round(dist / (10 * S)));
      for (var li = 0; li <= links; li++) {
        var tt = li / links;
        var lx = a.x + (b.x - a.x) * tt;
        var ly = ay + (by2 - ay) * tt;
        ctx.strokeStyle = chainCol + alpha + ')';
        ctx.lineWidth = 2 * S;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 3.2 * S, 2.2 * S, (li % 2 ? Math.PI / 4 : -Math.PI / 4), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Padlock badge centered on the middle locked box.
    if (anyLocked) {
      var mid = pts[1];
      var bx = mid.x, by = mid.y;
      ctx.fillStyle = 'rgba(60,45,35,0.9)';
      ctx.beginPath(); ctx.arc(bx, by, 9 * S, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,150,0.95)'; ctx.lineWidth = 2 * S; ctx.lineCap = 'round';
      // shackle
      ctx.beginPath(); ctx.arc(bx, by - 2 * S, 3.3 * S, Math.PI, 0); ctx.stroke();
      // body
      ctx.fillStyle = 'rgba(255,220,150,0.95)';
      rRect(bx - 3.8 * S, by - 0.5 * S, 7.6 * S, 6.5 * S, 1.4 * S); ctx.fill();
    }

    // Snap flash: expanding rings on each member the moment they unlock.
    if (grp.unlocked && flash > 0) {
      for (var p = 0; p < 3; p++) {
        var pt = pts[p];
        ctx.strokeStyle = 'rgba(150,230,150,' + flash * 0.8 + ')';
        ctx.lineWidth = 2 * S;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, (1 - flash) * 26 * S + 6 * S, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
