// ============================================================
// door.js — Turn-Based Door mechanic
//
// A door is a horizontal 1x1 to 1x4 structural strip that
// alternates between two states with every box pick:
//   • open   — passable (like an empty / used slot)
//   • closed — solid wall (blocks reachability)
//
// Lifecycle:
//   1. Dormant: shown in its starting state, ignored by reveals
//      logic until a path *to* the door is cleared.
//   2. Activation move: the box pick that first opens a path to
//      the door activates it, but the door keeps its starting
//      state for that move (no toggle).
//   3. Active: every box pick from this point on toggles all
//      active doors simultaneously.
//
// Doors are never tappable and never removed during play.
// ============================================================

var doors = []; // populated by initDoors()

function initDoors(rawDoorList) {
  doors = [];
  if (!rawDoorList) return;
  for (var i = 0; i < rawDoorList.length; i++) {
    var r = rawDoorList[i];
    doors.push({
      id: i,
      cellIdxs: r.cellIdxs.slice(),  // left-to-right ordered cell indices
      start: r.start,                // 'open' | 'closed'
      state: r.start,                // current state
      prevState: r.start,            // for toggle animation
      active: false,
      reachable: false,
      animT: 0                       // counts 1 → 0 over toggle
    });
  }
}

// Bottom-row flood-fill reachability with door cells passable iff state==='open'.
// If includeSpawning is true, currently-spawning boxes count as passable too —
// so the box just tapped is treated as already gone for door-activation checks.
function isDoorReachableNow(door, includeSpawning) {
  if (!stock || stock.length === 0) return false;
  if (!L || !L.rows || !L.cols) return false;
  var total = stock.length;
  var passable = new Array(total);
  for (var i = 0; i < total; i++) {
    var s = stock[i];
    if (!s) { passable[i] = false; continue; }
    if (s.isWall || s.isTunnel) { passable[i] = false; continue; }
    if (s.isDoor) {
      var d2 = doors[s.doorId];
      passable[i] = !!(d2 && d2.state === 'open');
      continue;
    }
    if (s.empty || s.used) { passable[i] = true; continue; }
    if (includeSpawning && s.spawning) { passable[i] = true; continue; }
    passable[i] = false;
  }
  var reachable = new Array(total);
  for (var j = 0; j < total; j++) reachable[j] = false;
  var queue = [];
  var bottomRow = L.rows - 1;
  for (var bc = 0; bc < L.cols; bc++) {
    var bIdx = bottomRow * L.cols + bc;
    if (passable[bIdx]) { reachable[bIdx] = true; queue.push(bIdx); }
  }
  var head = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    var cr = Math.floor(cur / L.cols), cc = cur % L.cols;
    var nbrs = [];
    if (cr > 0)            nbrs.push((cr - 1) * L.cols + cc);
    if (cr < L.rows - 1)   nbrs.push((cr + 1) * L.cols + cc);
    if (cc > 0)            nbrs.push(cr * L.cols + (cc - 1));
    if (cc < L.cols - 1)   nbrs.push(cr * L.cols + (cc + 1));
    for (var n = 0; n < nbrs.length; n++) {
      var ni = nbrs[n];
      if (!reachable[ni] && passable[ni]) { reachable[ni] = true; queue.push(ni); }
    }
  }
  // A door is reachable if any cell adjacent to one of its cells (and not
  // part of the same door) is bottom-reachable, or if any door cell sits
  // directly on the bottom row.
  for (var ci = 0; ci < door.cellIdxs.length; ci++) {
    var idx = door.cellIdxs[ci];
    var r = Math.floor(idx / L.cols), c = idx % L.cols;
    if (r === L.rows - 1 && passable[idx]) return true;
    var nbrs2 = [];
    if (r > 0)          nbrs2.push((r - 1) * L.cols + c);
    if (r < L.rows - 1) nbrs2.push((r + 1) * L.cols + c);
    if (c > 0)          nbrs2.push(r * L.cols + (c - 1));
    if (c < L.cols - 1) nbrs2.push(r * L.cols + (c + 1));
    for (var n2 = 0; n2 < nbrs2.length; n2++) {
      var nIdx = nbrs2[n2];
      var ns = stock[nIdx];
      if (ns && ns.isDoor && ns.doorId === door.id) continue;
      if (reachable[nIdx]) return true;
    }
  }
  return false;
}

// Called immediately after each successful box pick.
function tickDoors() {
  if (!doors || doors.length === 0) return;
  var toggled = 0;
  for (var i = 0; i < doors.length; i++) {
    var d = doors[i];
    if (!d) continue;
    var reachable = isDoorReachableNow(d, true);
    d.reachable = reachable;
    if (!d.active) {
      if (reachable) {
        // Activation move — holds starting state, no toggle.
        d.active = true;
      }
    } else {
      d.prevState = d.state;
      d.state = (d.state === 'open') ? 'closed' : 'open';
      d.animT = 1.0;
      toggled++;
    }
  }
  if (toggled > 0) sfxDoorClack();
}

function sfxDoorClack() {
  if (typeof audioCtx === 'undefined' || !audioCtx) return;
  var t = audioCtx.currentTime;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(240, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
  g.gain.setValueAtTime(0.055, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + 0.22);
}

function updateDoorAnims() {
  if (!doors) return;
  for (var i = 0; i < doors.length; i++) {
    var d = doors[i];
    if (!d) continue;
    if (d.animT > 0) d.animT = Math.max(0, d.animT - 0.1);
  }
}

// ── Drawing ─────────────────────────────────────────────────────
// Draws the full door spanning N cells horizontally. Called once per
// door (from rendering.js, only on the leftmost cell).
function drawDoorOnGrid(ctx, x, y, w, h, S, door, tick) {
  ctx.save();

  // Easing factor: animT == 1 means just toggled, 0 means settled.
  var k = 1 - Math.pow(1 - (1 - door.animT), 2); // ease-out from prev → target as animT → 0
  var prevOpen = (door.prevState === 'open') ? 1 : 0;
  var targetOpen = (door.state === 'open') ? 1 : 0;
  var openness;
  if (door.animT > 0) {
    openness = prevOpen + (targetOpen - prevOpen) * k;
  } else {
    openness = targetOpen;
  }

  // Track / frame band (recessed area where panels slide)
  var trackInset = h * 0.20;
  var trackY = y + trackInset;
  var trackH = h - trackInset * 2;
  var frameR = 4 * S;

  // Frame shadow base
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = '#3A332C';
  rRect(x, trackY, w, trackH, frameR); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Inner track recess
  var innerInset = 3 * S;
  ctx.fillStyle = 'rgba(20,18,16,0.85)';
  rRect(x + innerInset, trackY + innerInset, w - innerInset * 2, trackH - innerInset * 2, frameR * 0.6); ctx.fill();

  // Rails (thin metallic bars)
  ctx.fillStyle = '#857A6E';
  ctx.fillRect(x + innerInset, trackY + innerInset, w - innerInset * 2, 1.5 * S);
  ctx.fillRect(x + innerInset, trackY + trackH - innerInset - 1.5 * S, w - innerInset * 2, 1.5 * S);

  // Panels meet in the middle when closed; slide off the ends when open.
  var midX = x + w / 2;
  var halfW = w / 2;
  var leftClosedX = x;
  var leftOpenX = x - halfW;
  var rightClosedX = midX;
  var rightOpenX = x + w;
  var leftX = leftClosedX + (leftOpenX - leftClosedX) * openness;
  var rightX = rightClosedX + (rightOpenX - rightClosedX) * openness;

  var panelInset = innerInset + 1.5 * S;
  var panelY = trackY + panelInset;
  var panelH = trackH - panelInset * 2;

  ctx.save();
  ctx.beginPath();
  rRect(x + innerInset, trackY + innerInset, w - innerInset * 2, trackH - innerInset * 2, frameR * 0.6);
  ctx.clip();

  drawDoorPanel(ctx, leftX, panelY, halfW, panelH, S, true);
  drawDoorPanel(ctx, rightX, panelY, halfW, panelH, S, false);

  // Center seam glow when fully closed
  if (openness < 0.05) {
    var seamA = (1 - openness / 0.05) * 0.2;
    ctx.fillStyle = 'rgba(0,0,0,' + seamA + ')';
    ctx.fillRect(midX - 1 * S, panelY, 2 * S, panelH);
  }

  ctx.restore();

  // Outer frame outline
  ctx.strokeStyle = 'rgba(20,18,16,0.85)';
  ctx.lineWidth = 1.2 * S;
  rRect(x, trackY, w, trackH, frameR); ctx.stroke();

  // Status indicator dot — top center
  var dotR = 2.6 * S;
  var dotColor = (door.state === 'open') ? '#5BD16A' : '#E25E5E';
  var dotX = x + w / 2;
  var dotY = y + h * 0.10;
  ctx.fillStyle = dotColor;
  ctx.shadowColor = dotColor;
  ctx.shadowBlur = 6 * S;
  ctx.beginPath(); ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Dormant: tint with translucent overlay so it reads as "not yet armed"
  if (!door.active) {
    ctx.fillStyle = 'rgba(237,229,216,0.35)';
    rRect(x, y, w, h, 6 * S); ctx.fill();
    // Small "Z" hint badge top-right
    ctx.fillStyle = 'rgba(90,74,56,0.55)';
    ctx.font = 'bold ' + (8 * S) + 'px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('○', x + w - 3 * S, y + 2 * S);
  }

  ctx.restore();
}

function drawDoorPanel(ctx, x, y, w, h, S, isLeft) {
  // Metallic vertical gradient
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#C8C0B5');
  grad.addColorStop(0.5, '#9A938A');
  grad.addColorStop(1, '#5F5852');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Vertical ribs
  ctx.strokeStyle = 'rgba(60,55,50,0.45)';
  ctx.lineWidth = 1 * S;
  var ribs = Math.max(2, Math.floor(w / (8 * S)));
  for (var r = 1; r < ribs; r++) {
    var rx = x + (w * r) / ribs;
    ctx.beginPath();
    ctx.moveTo(rx, y + 1.5 * S);
    ctx.lineTo(rx, y + h - 1.5 * S);
    ctx.stroke();
  }

  // Inner edge bevel (where panels meet) — only on the meeting side
  var edgeX = isLeft ? (x + w - 1.2 * S) : x;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(edgeX, y, 1.4 * S, h);
  var hiX = isLeft ? (x + w - 2.4 * S) : (x + 1.2 * S);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(hiX, y, 1 * S, h);

  // Top sheen
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 1.2 * S);
  ctx.lineTo(x + w - 1, y + 1.2 * S);
  ctx.stroke();
}

// ── Editor helpers ──────────────────────────────────────────────
// Generate a unique door id (used in the editor when placing).
var _nextDoorUid = 1;
function nextDoorUid() {
  return 'd' + Date.now().toString(36) + '_' + (_nextDoorUid++);
}
