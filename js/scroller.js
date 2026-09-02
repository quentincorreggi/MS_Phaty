// ============================================================
// scroller.js — "Scrolling Board" special level
// ============================================================
//
// The board is a tall vertical strip of boxes that slides down
// through a fixed window toward a pressure line just above the
// funnel.
//
//   • Tap a box  → that box and its whole connected same-colour
//                  group release their marbles at once.
//   • Clearing   → opens holes; boxes below rise into them
//                  (gravity-up), compacting the stack away from
//                  the line. A rise that creates a new same-colour
//                  adjacency is a free chain.
//   • Scrolling  → variant A ("tap"): N rows per tap plus a slow
//                  idle drift. Variant B ("auto"): continuous.
//                  Both run off the same board data and can be
//                  swapped mid-run with the HUD pill.
//   • Crumble    → a box that sinks past the pressure line breaks
//                  on its own and dumps its marbles onto the
//                  conveyor uncontrolled.
//
// Win  : the end of the board crosses the pressure line.
// Lose : the conveyor jams — too many marbles parked on the belt.
//
// Board data is authored top-to-bottom: grid row 0 is the END of
// the board (arrives last), the last grid row is the START (the
// row nearest the pressure line at kickoff).
// ============================================================

var scroller = {
  active: false,

  // ── tunables (level.scroller) ──
  mode: 'tap',            // 'tap' | 'auto'
  release: 'single',      // 'single'   = only the box that was tapped
                          // 'adjacent' = it plus its 4 same-colour neighbours
                          // 'group'    = the whole connected same-colour blob
  rowsPerTap: 0.25,       // variant A: rows advanced per tap
  idleDrift: 0,           // variant A: rows per second with no input. Zero by
                          // default: in the tap variant the board moves only
                          // when the player taps. Nothing scrolls on its own,
                          // so a player who stops tapping stops the level —
                          // that is the freeze risk, traded for a board that
                          // never moves behind your back.
  autoSpeed: 0.13,        // variant B: rows per second
  gravity: 'column',      // 'column' | 'group'
  settleFrames: 5,        // frames between gravity steps
  releaseStagger: 90,     // ms between marbles leaving a tapped box
  crumbleStagger: 120,    // ms between marbles of a crumbling box (0 = instant dump)
  loadCap: 85,            // conveyor load (belt slots + marbles backed up in
                          // the funnel) that counts as an overflow
  tapBlockLoad: 60,       // the line refuses a release that would push the
                          // projected load past this. A tapped group is
                          // 20-45 marbles and the conveyor sorts about six
                          // a second, so without it the player buries
                          // themselves in three taps with no warning and no
                          // way back. Refusing teaches the pace instead of
                          // ending the run, keeps a legal tap from ever
                          // breaching loadCap on its own, and leaves the
                          // crumble as the real threat. Small groups still
                          // fit when big ones don't.
  beltSpeed: 2.5,         // multiplier on the calibrated conveyor speed
  sortWindow: 0.05,       // how forgiving the customer hand-off is
  funnelWiden: 1.7,       // funnel mouth multiplier — big releases jam a narrow one
  jamFuse: 90,            // frames of sustained overflow before the level is lost
  startGap: 3,            // rows of breathing room below the stack at kickoff

  // ── runtime ──
  scrollRows: 0, scrollTarget: 0, scrollStart: 0, winAt: 0,
  gravityT: 0,
  beltOcc: 0, load: 0, jamT: 0, danger: 0,
  lineFlash: 0, blockFlash: 0,
  hoverGroup: null,
  ended: false, endKind: '',
  crumbledBoxes: 0, clearedBoxes: 0, taps: 0,
  pool: null, starveT: 0,
  modeFlash: 0,
  pillX: 0, pillY: 0, pillW: 0, pillH: 0
};

// Only used to break a soft-lock: with no idle drift, a stack that has
// compacted above the window leaves nothing to tap and nothing to move
// the board, so the level would sit there forever.
var SCROLL_FAST_FORWARD = 3.5;   // rows/sec when nothing is reachable at all

// ── Setup ─────────────────────────────────────────────────────

// Called from initGame() BEFORE computeLayout(), so the layout can
// size itself to the level's board.
function scrollerSetup(lvl) {
  scroller.active = false;
  scroller.scrollRows = 0; scroller.scrollTarget = 0; scroller.scrollStart = 0;
  scroller.gravityT = 0; scroller.beltOcc = 0; scroller.jamT = 0;
  scroller.danger = 0; scroller.lineFlash = 0; scroller.modeFlash = 0; scroller.blockFlash = 0;
  scroller.ended = false; scroller.endKind = '';
  scroller.crumbledBoxes = 0; scroller.clearedBoxes = 0; scroller.taps = 0;
  scroller.hoverGroup = null;
  scroller.pool = null;
  scroller.starveT = 0;

  boardCols = 7; boardRows = 7; boardViewRows = 7;
  BELT_SPEED = BELT_SPEED_BASE;
  SORT_WINDOW = SORT_WINDOW_BASE;
  if (!lvl || !lvl.scroller || lvl.scroller.enabled === false) return;

  var s = lvl.scroller;
  scroller.active = true;
  boardCols = scrollerClamp(lvl.cols || s.cols || 7, 3, 9);
  boardRows = scrollerClamp(lvl.rows || s.rows || 24, 6, 120);
  boardViewRows = scrollerClamp(s.viewRows || 7, 4, 10);
  if (boardViewRows > boardRows) boardViewRows = boardRows;

  scroller.mode = (s.mode === 'auto') ? 'auto' : 'tap';
  scroller.release = (s.release === 'group' || s.release === 'adjacent') ? s.release : 'single';
  scroller.rowsPerTap = scrollerNum(s.rowsPerTap, 0.25, 0, 3);
  scroller.idleDrift = scrollerNum(s.idleDrift, 0, 0, 2);
  scroller.autoSpeed = scrollerNum(s.autoSpeed, 0.13, 0.01, 3);
  scroller.gravity = (s.gravity === 'group') ? 'group' : 'column';
  scroller.settleFrames = scrollerClamp(s.settleFrames || 5, 1, 30);
  scroller.releaseStagger = scrollerNum(s.releaseStagger, 90, 0, 400);
  scroller.crumbleStagger = scrollerNum(s.crumbleStagger, 120, 0, 400);
  scroller.loadCap = scrollerClamp(s.loadCap || 85, 6, 250);
  scroller.tapBlockLoad = scrollerClamp(s.tapBlockLoad || 60, 4, 250);
  scroller.beltSpeed = scrollerNum(s.beltSpeed, 2.5, 0.5, 4);
  scroller.sortWindow = scrollerNum(s.sortWindow, 0.05, 0.01, 0.12);
  scroller.funnelWiden = scrollerNum(s.funnelWiden, 1.7, 1, 3);
  scroller.jamFuse = scrollerClamp(s.jamFuse || 90, 1, 600);
  scroller.startGap = scrollerNum(s.startGap, 3, 0, 8);

  // A scrolling board feeds the conveyor far faster than a normal
  // level, so the conveyor runs faster to match.
  BELT_SPEED = BELT_SPEED_BASE * scroller.beltSpeed;
  SORT_WINDOW = scroller.sortWindow;
  scroller.winAt = boardRows - 0.5;
}

function scrollerClamp(v, lo, hi) { v = Math.round(v); return v < lo ? lo : (v > hi ? hi : v); }
function scrollerNum(v, dflt, lo, hi) {
  if (typeof v !== 'number' || !isFinite(v)) return dflt;
  return v < lo ? lo : (v > hi ? hi : v);
}

// Called from initGame() after stock has been built.
function scrollerInitBoard() {
  if (!scroller.active) return;
  // Settle the authored board so it starts compacted — gaps inside a
  // column collapse upward before the first frame.
  var guard = 0;
  while (scrollerGravityStep() && guard++ < L.rows * L.cols) { }
  for (var i = 0; i < stock.length; i++) stock[i].slidePx = 0;

  // Park the stack so its lowest live row sits startGap rows above
  // the pressure line.
  var lowest = -1;
  for (var k = 0; k < stock.length; k++) {
    if (scrollerMovable(k)) { var r = Math.floor(k / L.cols); if (r > lowest) lowest = r; }
  }
  var height = lowest + 1;
  scroller.scrollRows = L.rows - height - scroller.startGap;
  scroller.scrollTarget = scroller.scrollRows;
  scroller.scrollStart = scroller.scrollRows;
  scroller.gravityT = scroller.settleFrames;
  updateStockPositions();
}

// ── Grid helpers ──────────────────────────────────────────────

function scrollerYOffset() {
  if (!scroller.active) return 0;
  return (scroller.scrollRows - (L.rows - L.viewRows)) * (L.bh + L.bg);
}

function scrollerScreenRow(r) {
  return r - (L.rows - L.viewRows) + scroller.scrollRows;
}

// A cell a box can rise into.
function scrollerFree(i) {
  var b = stock[i];
  if (!b) return false;
  if (b.isWall || b.isTunnel) return false;
  return !!(b.empty || b.used);
}

// A live box that gravity can move.
function scrollerMovable(i) {
  var b = stock[i];
  if (!b) return false;
  if (b.isWall || b.isTunnel) return false;
  return !(b.empty || b.used);
}

// Move the box at `from` into the free cell at `to`, keeping a
// placeholder behind. The box renders from where it came from and
// catches up over the next few frames.
function scrollerSwap(from, to) {
  var moved = stock[from];
  stock[from] = stock[to];
  stock[to] = moved;
  var cell = L.bh + L.bg;
  var dRows = Math.abs(Math.floor(from / L.cols) - Math.floor(to / L.cols));
  if (moved) moved.slidePx = Math.min((moved.slidePx || 0) + dRows * cell, cell * 1.8);
}

// ── Gravity-up ────────────────────────────────────────────────
// One step moves everything that can rise by at most one row, so
// cascades read as a wave instead of a teleport.

function scrollerGravityStep() {
  return scroller.gravity === 'group' ? scrollerGravityStepGroup() : scrollerGravityStepColumn();
}

function scrollerGravityStepColumn() {
  var moved = false;
  for (var c = 0; c < L.cols; c++) {
    for (var r = 1; r < L.rows; r++) {
      var i = r * L.cols + c, up = i - L.cols;
      if (scrollerMovable(i) && scrollerFree(up)) {
        scrollerSwap(i, up);
        moved = true;
      }
    }
  }
  return moved;
}

function scrollerGravityStepGroup() {
  var total = L.rows * L.cols;
  var comp = new Array(total);
  for (var i = 0; i < total; i++) comp[i] = -1;
  var comps = [];

  for (var s = 0; s < total; s++) {
    if (comp[s] >= 0 || !scrollerMovable(s)) continue;
    var id = comps.length;
    var cells = [];
    var queue = [s];
    comp[s] = id;
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      cells.push(cur);
      var cr = Math.floor(cur / L.cols), cc = cur % L.cols;
      var nbrs = [];
      if (cr > 0) nbrs.push(cur - L.cols);
      if (cr < L.rows - 1) nbrs.push(cur + L.cols);
      if (cc > 0) nbrs.push(cur - 1);
      if (cc < L.cols - 1) nbrs.push(cur + 1);
      for (var n = 0; n < nbrs.length; n++) {
        var ni = nbrs[n];
        if (comp[ni] < 0 && scrollerMovable(ni)) { comp[ni] = id; queue.push(ni); }
      }
    }
    cells.sort(function (a, b) { return a - b; });
    comps.push(cells);
  }

  // Topmost groups first so a group can follow the one above it.
  comps.sort(function (a, b) { return a[0] - b[0]; });

  var moved = false;
  for (var g = 0; g < comps.length; g++) {
    var cells2 = comps[g];
    var id2 = comp[cells2[0]];
    var can = true;
    for (var k = 0; k < cells2.length; k++) {
      var cell = cells2[k];
      if (cell < L.cols) { can = false; break; }              // already at the board's end
      var above = cell - L.cols;
      if (comp[above] === id2) continue;                       // part of this group
      if (!scrollerFree(above)) { can = false; break; }
    }
    if (!can) continue;
    for (var k2 = 0; k2 < cells2.length; k2++) scrollerSwap(cells2[k2], cells2[k2] - L.cols);
    // Component ids move with the cells.
    for (var k3 = 0; k3 < cells2.length; k3++) {
      comp[cells2[k3] - L.cols] = id2;
      comp[cells2[k3]] = -1;
    }
    moved = true;
  }
  return moved;
}

// ── Input ─────────────────────────────────────────────────────

// Returns true when the tap was consumed by the scrolling board.
function scrollerHandleTap(px, py) {
  if (!scroller.active) return false;
  if (scroller.ended) return true;

  if (px >= scroller.pillX && px <= scroller.pillX + scroller.pillW &&
      py >= scroller.pillY && py <= scroller.pillY + scroller.pillH) {
    scrollerToggleMode();
    return true;
  }

  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || b.isWall || b.isTunnel) continue;
    if (b.empty || b.used || b.spawning) continue;
    if (px < b.x || px > b.x + L.bw || py < b.y || py > b.y + L.bh) continue;
    if (b.y + L.bh * 0.5 >= L.pressY) return true;   // already crumbling into the line
    if (!isBoxTappable(i)) { b.shakeT = 0.5; return true; }
    if (scroller.load + scrollerCollectGroup(i).length * MRB_PER_BOX > scroller.tapBlockLoad) {
      // That release wouldn't fit on the line — the boxes stay shut.
      b.shakeT = 0.6;
      scroller.blockFlash = 1;
      tone(170, 0.12, 'square', 0.05);
      return true;
    }
    scrollerReleaseGroup(i);
    return true;
  }
  return true;
}

// Hover highlights the whole group that a tap would release.
function scrollerHover(px, py) {
  scroller.hoverGroup = null;
  hoverIdx = -1;
  if (scroller.ended) { canvas.style.cursor = 'default'; return; }
  if (px >= scroller.pillX && px <= scroller.pillX + scroller.pillW &&
      py >= scroller.pillY && py <= scroller.pillY + scroller.pillH) {
    canvas.style.cursor = 'pointer';
    return;
  }
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || b.isWall || b.isTunnel) continue;
    if (b.empty || b.used || b.spawning) continue;
    if (px < b.x || px > b.x + L.bw || py < b.y || py > b.y + L.bh) continue;
    if (b.y + L.bh * 0.5 >= L.pressY || !isBoxTappable(i)) break;
    if (scroller.load + scrollerCollectGroup(i).length * MRB_PER_BOX > scroller.tapBlockLoad) {
      canvas.style.cursor = 'not-allowed'; return;
    }
    hoverIdx = i;
    var group = scrollerCollectGroup(i);
    var map = {};
    for (var g = 0; g < group.length; g++) map[group[g]] = true;
    scroller.hoverGroup = { map: map, size: group.length };
    canvas.style.cursor = 'pointer';
    return;
  }
  canvas.style.cursor = 'default';
}

function scrollerToggleMode() {
  scroller.mode = (scroller.mode === 'tap') ? 'auto' : 'tap';
  scroller.modeFlash = 1;
  scroller.scrollTarget = scroller.scrollRows;
  tone(scroller.mode === 'auto' ? 660 : 440, 0.1, 'triangle', 0.09);
}

function scrollerReleasable(i, ci) {
  var b = stock[i];
  if (!b || b.isWall || b.isTunnel) return false;
  if (b.empty || b.used || b.spawning) return false;
  if (b.iceHP > 0) return false;
  return b.ci === ci;
}

function scrollerNeighbours(i) {
  var r = Math.floor(i / L.cols), c = i % L.cols;
  var out = [];
  if (r > 0) out.push(i - L.cols);
  if (r < L.rows - 1) out.push(i + L.cols);
  if (c > 0) out.push(i - 1);
  if (c < L.cols - 1) out.push(i + 1);
  return out;
}

// What a tap on `idx` would release. In 'adjacent' mode that is the box
// plus its four same-colour neighbours; in 'group' mode the whole
// connected blob. Either way a rise that creates a new same-colour
// neighbour makes the next tap pay more — that's the chain.
function scrollerCollectGroup(idx) {
  var target = stock[idx];
  if (!target || !scrollerReleasable(idx, target.ci)) return [];
  var ci = target.ci;

  if (scroller.release === 'single') return [idx];

  if (scroller.release === 'adjacent') {
    var out = [idx];
    var nbrs = scrollerNeighbours(idx);
    for (var n = 0; n < nbrs.length; n++) {
      if (scrollerReleasable(nbrs[n], ci)) out.push(nbrs[n]);
    }
    return out;
  }

  var seen = {};
  var group = [];
  var queue = [idx];
  seen[idx] = true;
  var head = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    if (!scrollerReleasable(cur, ci)) continue;
    group.push(cur);
    var gn = scrollerNeighbours(cur);
    for (var k = 0; k < gn.length; k++) {
      if (!seen[gn[k]]) { seen[gn[k]] = true; queue.push(gn[k]); }
    }
  }
  return group;
}

function scrollerReleaseGroup(idx) {
  var group = scrollerCollectGroup(idx);
  if (group.length === 0) return;
  scroller.hoverGroup = null;

  sfx.pop();
  for (var g = 0; g < group.length; g++) {
    var gi = group[g];
    var b = stock[gi];
    b.popT = 1;
    // Every box in the group opens on the same frame — a staggered start
    // reads as several separate taps instead of one release.
    b.groupFlashT = 1;
    spawnBurst(b.x + L.bw / 2, b.y + L.bh / 2, COLORS[b.ci].fill, group.length > 1 ? 14 : 18);
    spawnPhysMarbles(b, { stagger: scroller.releaseStagger });
    damageAdjacentIce(gi);
  }
  if (group.length > 1) {
    // Chain feedback: the bigger the group, the brighter the pop.
    var gen = gameGen;
    setTimeout(function () { if (gen === gameGen) tone(700 + group.length * 60, 0.14, 'triangle', 0.1); }, 90);
  }

  scroller.clearedBoxes += group.length;
  scroller.taps++;
  if (scroller.mode === 'tap') scroller.scrollTarget += scroller.rowsPerTap;
}

// ── Crumble ───────────────────────────────────────────────────

function scrollerCrumble(idx) {
  var b = stock[idx];
  if (!b) return;
  b.crumbleT = 1;
  b.shakeT = 1;
  scroller.crumbledBoxes++;
  scroller.lineFlash = 1;
  tone(170, 0.28, 'sawtooth', 0.07, 60);

  var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
  for (var p = 0; p < 16; p++) {
    var a = Math.PI * 2 * p / 16 + Math.random() * 0.4, sp = 2 + Math.random() * 4;
    particles.push({
      x: bx, y: by, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1 * S,
      r: (2 + Math.random() * 4) * S,
      color: Math.random() > 0.45 ? 'rgba(90,80,72,0.85)' : COLORS[b.ci].dark,
      life: 1, decay: 0.02 + Math.random() * 0.02, grav: true
    });
  }
  spawnPhysMarbles(b, { stagger: scroller.crumbleStagger, spread: 2.4, pop: 0.45 });
}

function scrollerCheckCrumble() {
  var limit = L.viewRows - 0.5;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!scrollerMovable(i)) continue;
    if (b.spawning) continue;
    if (scrollerScreenRow(Math.floor(i / L.cols)) >= limit) scrollerCrumble(i);
  }
}

// ── Update ────────────────────────────────────────────────────

function scrollerUpdate() {
  if (!scroller.active) return;

  // Box animations owned by this mechanic
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b) continue;
    if (b.slidePx) { b.slidePx *= 0.62; if (Math.abs(b.slidePx) < 0.4) b.slidePx = 0; }
    if (b.crumbleT > 0) b.crumbleT = Math.max(0, b.crumbleT - 0.02);
    if (b.groupFlashT > 0) b.groupFlashT = Math.max(0, b.groupFlashT - 0.045);
  }
  if (scroller.lineFlash > 0) scroller.lineFlash = Math.max(0, scroller.lineFlash - 0.02);
  if (scroller.blockFlash > 0) scroller.blockFlash = Math.max(0, scroller.blockFlash - 0.025);
  if (scroller.modeFlash > 0) scroller.modeFlash = Math.max(0, scroller.modeFlash - 0.015);

  // Conveyor load — the single fail state. Marbles that can't get onto a
  // full belt stack up in the funnel, so the honest measure of "the
  // conveyor is overflowing" is the belt plus that backlog.
  var occ = 0;
  for (var s = 0; s < BELT_SLOTS; s++) if (beltSlots[s].marble >= 0) occ++;
  scroller.beltOcc = occ;
  scroller.load = occ + physMarbles.length;
  var dangerTarget = Math.max(0, Math.min(1, (scroller.load - (scroller.loadCap - 14)) / 14));
  scroller.danger += (dangerTarget - scroller.danger) * 0.12;

  if (!scroller.ended) {
    if (scroller.load >= scroller.loadCap) {
      scroller.jamT++;
      if (scroller.jamT % 12 === 0) tone(150, 0.18, 'square', 0.06);
      if (scroller.jamT >= scroller.jamFuse) { scrollerEnd('lose'); return; }
    } else if (scroller.jamT > 0) {
      scroller.jamT = Math.max(0, scroller.jamT - 2);
    }
  }

  if (scroller.ended) { updateStockPositions(); return; }

  // Gravity-up: one row per settle step, cascading naturally
  if (--scroller.gravityT <= 0) {
    scroller.gravityT = scroller.settleFrames;
    scrollerGravityStep();
  }

  // Scroll
  if (scroller.mode === 'auto') {
    scroller.scrollTarget += scroller.autoSpeed / 60;
  } else {
    scroller.scrollTarget += scroller.idleDrift / 60;
  }
  if (!scrollerHasReachableBox()) scroller.scrollTarget += SCROLL_FAST_FORWARD / 60;
  scroller.scrollRows += (scroller.scrollTarget - scroller.scrollRows) * 0.12;
  // The ease never actually arrives. With no idle drift the target stops
  // growing the moment the player stops tapping, so without this the last
  // sliver of a row is never covered and the board can never finish.
  if (Math.abs(scroller.scrollTarget - scroller.scrollRows) < 0.004) {
    scroller.scrollRows = scroller.scrollTarget;
  }

  updateStockPositions();
  scrollerCheckCrumble();

  scrollerAssignCustomers();
  if (tick % 20 === 0) scrollerFlushDeadCustomers();

  if (scroller.scrollRows >= scroller.winAt - 0.001) scrollerEnd('win');
}

// ── Customer queues ───────────────────────────────────────────
// A tap on a scrolling board is monochrome: every box in a released
// group shares a colour, so one tap drops 20-40 marbles of the SAME
// colour onto the belt. With fixed pre-dealt queues only whichever
// column happens to have that colour at its head can drain them, which
// caps a single colour at roughly a quarter of the conveyor's rate and
// leaves the rest of the flood circling until it overflows.
//
// So customers are not dealt up front. Each column's head is assigned a
// colour the moment it becomes the head, picked from the remaining order
// pool by what is actually backed up on the line. Tap a big pink group
// and the columns turn pink to meet it. The pool still holds exactly the
// marbles the board contains, so nothing is created or lost.

function scrollerBuildCustomers(sortPerColor) {
  if (!scroller.active) return;
  scroller.pool = [];
  var total = 0;
  for (var c = 0; c < NUM_COLORS; c++) {
    scroller.pool.push(sortPerColor[c] || 0);
    total += scroller.pool[c];
  }
  sortCols = [[], [], [], []];
  for (var i = 0; i < total; i++) {
    // ci -1 = waiting customer, no order taken yet
    sortCols[i % 4].push({ ci: -1, filled: 0, popT: 0, vis: true, shineT: 0, squishT: 0 });
  }
  scrollerAssignCustomers();
}

function scrollerAssignCustomers() {
  if (!scroller.active || !scroller.pool) return;

  // Only marbles already ON the belt can be served. Marbles still in the
  // funnel are counted too but weighted far lower: if every column waits
  // on a colour that is stuck behind a full belt, nothing moves at all.
  var onBelt = [], inFunnel = [];
  for (var c = 0; c < NUM_COLORS; c++) { onBelt.push(0); inFunnel.push(0); }
  var beltCount = 0;
  for (var s = 0; s < BELT_SLOTS; s++) {
    var m = beltSlots[s].marble;
    if (m >= 0 && m < NUM_COLORS) { onBelt[m]++; beltCount++; }
  }
  for (var p = 0; p < physMarbles.length; p++) {
    if (physMarbles[p].ci < NUM_COLORS) inFunnel[physMarbles[p].ci]++;
  }

  // Free any head that has taken nothing yet and is waiting on a colour
  // the belt isn't carrying. An unserved customer can change their order.
  var free = [];
  var serving = [];
  var servable = false;
  for (var c2 = 0; c2 < NUM_COLORS; c2++) serving.push(0);
  for (var col = 0; col < sortCols.length; col++) {
    var head = scrollerHeadBox(col);
    if (!head || head.type === 'lock') continue;
    if (head.ci < 0) { free.push(head); continue; }
    if (head.filled === 0 && onBelt[head.ci] === 0) {
      scroller.pool[head.ci]++;
      head.ci = -1;
      free.push(head);
      continue;
    }
    serving[head.ci]++;
    if (onBelt[head.ci] > 0) servable = true;
  }

  // Liveness. A part-filled head keeps its order, so the line can still
  // deadlock: every column half-served on colours the belt isn't
  // carrying, belt full of colours nobody wants. If that holds, the
  // least-served customer gives up and leaves, freeing the column.
  if (!servable && beltCount > 0 && free.length === 0) {
    scroller.starveT = (scroller.starveT || 0) + 1;
    if (scroller.starveT > 180) {
      scroller.starveT = 0;
      var give = null, giveCol = -1;
      for (var gc = 0; gc < sortCols.length; gc++) {
        var h = scrollerHeadBox(gc);
        if (!h || h.type === 'lock' || h.ci < 0) continue;
        if (!give || h.filled < give.filled) { give = h; giveCol = gc; }
      }
      if (give) {
        scroller.pool[give.ci]++;      // capacity comes back with the order
        give.popT = 1;
        var gx = L.sSx + giveCol * (L.sBw + L.sColGap) + L.sBw / 2;
        var gy = getSortBoxY(giveCol, 0) + L.sBh / 2;
        spawnBurst(gx, gy, '#B8A898', 14);
        tone(300, 0.2, 'triangle', 0.07, 180);
        (function (ref, gen) {
          setTimeout(function () { if (gen === gameGen) ref.vis = false; }, 350);
        })(give, gameGen);
      }
      return;
    }
  } else {
    scroller.starveT = 0;
  }

  if (free.length === 0) return;

  for (var f = 0; f < free.length; f++) {
    var pick = -1, best = -Infinity;
    for (var ci = 0; ci < NUM_COLORS; ci++) {
      if (scroller.pool[ci] <= 0) continue;
      // What's on the belt dominates; the funnel is a hint about what is
      // coming; the pool term only breaks ties when the line is empty.
      // The serving discount has to divide the whole score, or with an
      // empty line every column scores the colours identically and all
      // four take the same order, leaving most of the line unservable.
      var score = (onBelt[ci] * 3 + inFunnel[ci] * 0.6 + scroller.pool[ci] * 0.05) /
                  (1 + serving[ci] * 1.1);
      if (score > best) { best = score; pick = ci; }
    }
    if (pick < 0) continue;
    free[f].ci = pick;
    scroller.pool[pick]--;
    serving[pick]++;
  }
}

function scrollerHeadBox(col) {
  var c = sortCols[col];
  if (!c) return null;
  for (var r = 0; r < c.length; r++) if (c[r].vis) return c[r];
  return null;
}

// ── Dead customers ────────────────────────────────────────────
// A generated board won't hand each colour a marble count that divides
// evenly by the sort cap, so the last customer of a colour can end up
// permanently short — and a head customer that can never complete
// blocks its whole column, which is a guaranteed jam. Retire any head
// customer whose colour has run out.

function scrollerColorSupply() {
  var supply = [];
  for (var c = 0; c < NUM_COLORS; c++) supply.push(0);
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || b.isWall || b.isTunnel || b.empty || b.used) continue;
    if (b.ci < NUM_COLORS) supply[b.ci] += Math.max(0, b.remaining - (b.blockerCount || 0));
  }
  for (var m = 0; m < physMarbles.length; m++) {
    if (physMarbles[m].ci < NUM_COLORS) supply[physMarbles[m].ci]++;
  }
  for (var s = 0; s < BELT_SLOTS; s++) {
    var mk = beltSlots[s].marble;
    if (mk >= 0 && mk < NUM_COLORS) supply[mk]++;
  }
  for (var j = 0; j < jumpers.length; j++) {
    if (jumpers[j].ci < NUM_COLORS) supply[jumpers[j].ci]++;
  }
  return supply;
}

function scrollerFlushDeadCustomers() {
  var supply = scrollerColorSupply();
  var pending = [];
  for (var c = 0; c < sortCols.length; c++) {
    var col = sortCols[c];
    for (var r = 0; r < col.length; r++) {
      if (!col[r].vis) continue;
      pending.push({ col: c, box: col[r] });
      break;
    }
  }
  for (var p = 0; p < pending.length; p++) {
    var box = pending[p].box;
    if (box.type === 'lock' || box.ci < 0) continue;   // unassigned: nothing to strand
    var needed = SORT_CAP - box.filled;
    if (needed <= 0 || supply[box.ci] >= needed) continue;
    // Claim what is still coming so two columns of the same colour
    // don't both retire on the same frame.
    supply[box.ci] = 0;
    box.popT = 1; box.shineT = 1;
    var gen = gameGen;
    var bx = L.sSx + pending[p].col * (L.sBw + L.sColGap) + L.sBw / 2;
    var by = getSortBoxY(pending[p].col, 0) + L.sBh / 2;
    spawnBurst(bx, by, '#B8A898', 12);
    tone(520, 0.16, 'triangle', 0.07, 300);
    (function (ref) { setTimeout(function () { if (gen === gameGen) ref.vis = false; }, 400); })(box);
  }
}

// True while at least one live box is somewhere the player could actually
// tap it: far enough down to be hittable, not yet sunk into the line.
function scrollerHasReachableBox() {
  for (var i = 0; i < stock.length; i++) {
    if (!scrollerMovable(i)) continue;
    var b = stock[i];
    if (b.y < L.sy - L.bh * 0.3) continue;
    if (b.y + L.bh * 0.5 >= L.pressY) continue;
    return true;
  }
  return false;
}

function scrollerProgress() {
  var span = scroller.winAt - scroller.scrollStart;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (scroller.scrollRows - scroller.scrollStart) / span));
}

function scrollerEnd(kind) {
  if (scroller.ended) return;
  scroller.ended = true;
  scroller.endKind = kind;
  var screen = document.getElementById('win-screen');
  var title = document.getElementById('win-title');
  var msg = document.getElementById('win-msg');
  var retry = document.getElementById('win-retry');

  if (kind === 'win') {
    won = true;
    sfx.win();
    if (title) title.textContent = 'Survived!';
    if (msg) msg.textContent = 'Board cleared · ' + scroller.clearedBoxes + ' boxes tapped · ' +
      scroller.crumbledBoxes + ' crumbled';
    if (screen) screen.classList.remove('lose');
    spawnConfetti(W / 2, H / 3, 60);
    setTimeout(function () { spawnConfetti(W * 0.3, H / 2, 40); }, 200);
    setTimeout(function () { spawnConfetti(W * 0.7, H / 2, 40); }, 400);
  } else {
    lost = true;
    tone(200, 0.5, 'sawtooth', 0.1, 60);
    setTimeout(function () { tone(140, 0.7, 'sawtooth', 0.1, 45); }, 220);
    if (title) title.textContent = 'Conveyor Jammed';
    if (msg) msg.textContent = Math.round(scrollerProgress() * 100) + '% of the board survived · ' +
      scroller.crumbledBoxes + ' boxes crumbled';
    if (screen) screen.classList.add('lose');
  }
  if (retry) retry.style.display = '';
  var gen = gameGen;
  setTimeout(function () {
    if (gen !== gameGen || !scroller.ended || scroller.endKind !== kind) return;
    if (screen) screen.classList.add('show');
  }, kind === 'win' ? 1600 : 900);
}

// ── Rendering ─────────────────────────────────────────────────

function drawScrollerBoard() {
  var cell = L.bh + L.bg;

  // Clipped at the pressure line itself, so a box that sinks past it
  // grinds out of sight instead of sliding over the funnel.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, L.boardTopY, W, (L.pressY + 4 * S) - L.boardTopY);
  ctx.clip();
  drawStock();

  // Group preview under the cursor
  var hg = scroller.hoverGroup;
  if (hg && hg.size > 1) {
    ctx.save();
    ctx.globalAlpha = 0.55 + Math.sin(tick * 0.12) * 0.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2.5 * S;
    for (var k in hg.map) {
      var hb = stock[k];
      if (!hb) continue;
      rRect(hb.x - 1.5 * S, hb.y - 1.5 * S, L.bw + 3 * S, L.bh + 3 * S, 7 * S);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Crumble tint + "about to crumble" warning, drawn over the boxes.
  var warnRow = L.viewRows - 1.35;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b) continue;
    // A released group flashes together, so the player can see that the
    // tap took the neighbours with it and not just the box they hit.
    if (b.groupFlashT > 0) {
      var gf = b.groupFlashT;
      ctx.save();
      ctx.globalAlpha = gf * 0.9;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3 * S * gf;
      var grow = (1 - gf) * 7 * S;
      rRect(b.x - grow, b.y - grow, L.bw + grow * 2, L.bh + grow * 2, (6 + grow) * S);
      ctx.stroke();
      ctx.restore();
    }

    if (b.crumbleT > 0) {
      ctx.save();
      ctx.globalAlpha = b.crumbleT * 0.6;
      ctx.fillStyle = '#3E3833';
      rRect(b.x, b.y, L.bw, L.bh, 6 * S); ctx.fill();
      ctx.restore();
      continue;
    }
    if (!scrollerMovable(i)) continue;
    var sr = scrollerScreenRow(Math.floor(i / L.cols));
    if (sr < warnRow) continue;
    var pulse = 0.35 + Math.sin(tick * 0.25) * 0.25;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#FF5A4A';
    ctx.lineWidth = 2.5 * S;
    rRect(b.x + S, b.y + S, L.bw - 2 * S, L.bh - 2 * S, 6 * S); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Fade the preview rows out toward the top of the strip.
  var fadeH = L.sy - L.boardTopY;
  if (fadeH > 2) {
    var g = ctx.createLinearGradient(0, L.boardTopY, 0, L.boardTopY + fadeH);
    g.addColorStop(0, 'rgba(237,229,216,1)');
    g.addColorStop(0.55, 'rgba(237,229,216,0.55)');
    g.addColorStop(1, 'rgba(237,229,216,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.boardTopY - 2 * S, W, fadeH + 2 * S);
  }

  drawPressureLine();
}

function drawPressureLine() {
  var x0 = L.gameLeft - 4 * S, x1 = L.gameRight + 4 * S;
  var y = L.pressY;
  var h = 7 * S;
  var flash = scroller.lineFlash;

  ctx.save();
  ctx.beginPath();
  rRect(x0, y, x1 - x0, h, h / 2);
  ctx.clip();
  ctx.fillStyle = flash > 0 ? 'rgba(200,70,55,' + (0.35 + flash * 0.5) + ')' : 'rgba(150,120,95,0.35)';
  ctx.fillRect(x0, y, x1 - x0, h);
  // Moving hazard stripes
  ctx.strokeStyle = flash > 0 ? 'rgba(255,200,190,0.75)' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3 * S;
  var step = 12 * S;
  var shift = (tick * 0.5 * S) % step;
  for (var sx = x0 - h * 2 + shift; sx < x1 + h; sx += step) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h * 1.4, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = flash > 0 ? 'rgba(210,70,55,0.9)' : 'rgba(140,115,90,0.5)';
  ctx.lineWidth = 1.5 * S;
  rRect(x0, y, x1 - x0, h, h / 2); ctx.stroke();
  ctx.restore();
}

function drawScrollerHUD() {
  var barY = L.bkY + L.bkSize * 0.5;
  var pillW = 62 * S, pillH = 22 * S;
  var pillX = L.bkX + L.bkSize + 8 * S;
  var pillY = barY - pillH / 2;
  scroller.pillX = pillX; scroller.pillY = pillY;
  scroller.pillW = pillW; scroller.pillH = pillH;

  // ── Mode pill (tap to swap scroll variant) ──
  var isAuto = scroller.mode === 'auto';
  ctx.save();
  ctx.fillStyle = isAuto ? 'rgba(200,120,60,0.85)' : 'rgba(110,140,175,0.85)';
  if (scroller.modeFlash > 0) {
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 14 * S * scroller.modeFlash;
  }
  rRect(pillX, pillY, pillW, pillH, pillH / 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.fillStyle = 'white';
  ctx.font = 'bold ' + (10 * S) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(isAuto ? '⏱ AUTO' : '☝ TAP', pillX + pillW / 2, pillY + pillH / 2 + 0.5 * S);
  ctx.restore();

  // ── Board progress ──
  var barX0 = pillX + pillW + 9 * S;
  var barX1 = L.gameRight - 46 * S;
  if (barX1 > barX0 + 20 * S) {
    var barH = 9 * S;
    var by = barY - barH / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(160,140,118,0.28)';
    rRect(barX0, by, barX1 - barX0, barH, barH / 2); ctx.fill();
    var p = scrollerProgress();
    if (p > 0.001) {
      var fw = Math.max(barH, (barX1 - barX0) * p);
      var grd = ctx.createLinearGradient(barX0, 0, barX1, 0);
      grd.addColorStop(0, '#7EDDD6'); grd.addColorStop(1, '#4EE68C');
      ctx.fillStyle = grd;
      rRect(barX0, by, fw, barH, barH / 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(140,115,90,0.35)'; ctx.lineWidth = 1 * S;
    rRect(barX0, by, barX1 - barX0, barH, barH / 2); ctx.stroke();
    ctx.fillStyle = 'rgba(120,100,80,0.75)';
    ctx.font = 'bold ' + (9 * S) + 'px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(p * 100) + '%', barX1 + 40 * S, barY);
    ctx.restore();
  }

  drawBeltLoad();
}

// Conveyor load meter, drawn inside the belt loop where the slots aren't.
function drawBeltLoad() {
  var cx = L.beltCx;
  var cy = (L.beltTopY + L.beltBotY) / 2;
  var w = Math.min(L.beltRight - L.beltLeft - 30 * S, 190 * S);
  var h = 7 * S;
  if (w < 30 * S) return;
  var x = cx - w / 2, y = cy - h / 2;
  var p = Math.max(0, Math.min(1, scroller.load / scroller.loadCap));
  var d = scroller.danger;

  ctx.save();
  ctx.fillStyle = 'rgba(120,100,80,0.16)';
  rRect(x, y, w, h, h / 2); ctx.fill();
  if (p > 0.001) {
    var grd = ctx.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, '#8FD9A8');
    grd.addColorStop(0.65, '#F0C060');
    grd.addColorStop(1, '#E8503C');
    ctx.fillStyle = grd;
    ctx.save();
    rRect(x, y, w, h, h / 2); ctx.clip();
    ctx.fillRect(x, y, w * p, h);
    ctx.restore();
  }
  // Where the line stops accepting new boxes.
  var blockX = x + w * Math.max(0, Math.min(1, scroller.tapBlockLoad / scroller.loadCap));
  ctx.strokeStyle = 'rgba(90,74,56,0.45)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.moveTo(blockX, y - 2.5 * S); ctx.lineTo(blockX, y + h + 2.5 * S); ctx.stroke();

  if (scroller.blockFlash > 0) {
    var bf = scroller.blockFlash;
    ctx.globalAlpha = bf;
    ctx.fillStyle = '#E8A84C';
    rRect(x - 3 * S, y - 3 * S, w + 6 * S, h + 6 * S, (h + 6 * S) / 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(90,74,56,' + bf + ')';
    ctx.font = 'bold ' + (9 * S) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('LINE FULL', cx, y - 5 * S);
  }

  if (d > 0.02) {
    var pulse = 0.25 + Math.sin(tick * 0.3) * 0.2;
    ctx.globalAlpha = d * pulse * 2;
    ctx.strokeStyle = '#E8503C'; ctx.lineWidth = 2.5 * S;
    rRect(x - 2 * S, y - 2 * S, w + 4 * S, h + 4 * S, (h + 4 * S) / 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(120,100,80,0.28)'; ctx.lineWidth = 1 * S;
  rRect(x, y, w, h, h / 2); ctx.stroke();
  ctx.restore();

  // Jam fuse burning down
  if (scroller.jamT > 0 && !scroller.ended) {
    var f = Math.min(1, scroller.jamT / scroller.jamFuse);
    ctx.save();
    ctx.globalAlpha = 0.25 + f * 0.45;
    ctx.fillStyle = '#E8503C';
    ctx.fillRect(0, 0, W, 5 * S);
    ctx.fillRect(0, H - 5 * S, W, 5 * S);
    ctx.fillRect(0, 0, 5 * S, H);
    ctx.fillRect(W - 5 * S, 0, 5 * S, H);
    ctx.restore();
  }
}
