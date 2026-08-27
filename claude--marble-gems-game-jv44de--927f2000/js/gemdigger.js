// ============================================================
// gemdigger.js — "Gem Digger" mode
//   Marble-shooter + auto-scrolling board.
//   • The board is a grid of colored marbles that slowly scrolls DOWN,
//     spawning new rows at the top (infinite pattern).
//   • A shooter at the bottom fires a colored marble upward. It snaps to
//     the board. If it joins a group of 2+ same-color marbles, the whole
//     group is released and falls to the conveyor. A non-matching shot
//     just sticks (the board fills up).
//   • Gems are scattered in the field. A gem is COLLECTED when nothing
//     holds it from directly below (its support marble was cleared).
//   • Objective: collect GEM_TARGET gems.
//   • Lose: a marble crosses the danger line (board full) OR the belt fills.
//
//   Reuses the existing funnel → belt → customers pipeline: released
//   marbles become normal physMarbles and fall through the funnel.
// ============================================================

// ── Tunables (design knobs) ──
var GEM_COLS          = 6;      // board width (columns)
var GEM_NUM_COLORS    = 5;      // uses COLORS[0..4]
var GEM_TARGET        = 5;      // gems to collect to win
var GEM_MIN_MATCH     = 3;      // same-colour group size needed to release
var GEM_SCROLL_SPEED  = 0.0020; // board descent, in cells per frame (very slow)
var GEM_SCROLL_PER_DROP = 0.03; // extra descent per marble released
var GEM_GEM_CHANCE    = 0.11;   // chance to seed a gem in an eligible new cell
var GEM_MAX_GEMS      = 10;     // max gems present on the board at once
var GEM_INIT_ROWS     = 5;      // rows generated at start (near the top)
var GEM_TARGET_ROWS   = 11;     // visible rows down to the danger line (zoom-out)
var GEM_CLUSTER       = 0.68;   // prob a new cell copies a neighbour's colour
var GEM_BELT_SLOTS    = 50;     // conveyor capacity in this mode
var GEM_SORT_CAP      = 3;      // marbles per customer order
var GEM_ORDER_QUEUE   = 4;      // customer orders queued (stacked) per column
var GEM_SHOT_SPEED    = 16;     // projectile speed (px * S per frame)

// ── State ──
var gemMode = false;
var gemEnded = false, gemWinFlag = false, gemLoseReason = '';
var G = {};                 // layout: cell, boardLeft, boardRight, boardTop, dangerY, cx, shooterX, shooterY
var gemGrid = [];           // rows[]; each row = array[GEM_COLS] of null | {ci} | {gem:true, popT}
var gemScrollFrac = 0;      // current sub-cell scroll offset [0,1)
var gemPendingScroll = 0;   // extra scroll queued by releases
var gemCollected = 0;       // gems collected
var gemFalling = [];        // cosmetic falling gems {x,y,vy,rot,life,size}
var gemProjectile = null;   // {x,y,vx,vy,ci,r,prevR,prevC,life}
var gemShotCi = 0, gemNextCi = 1;
var gemAimAngle = -Math.PI / 2;
var gemAimX = 0, gemAimY = 0;
var gemEndT = 0;            // overlay fade-in timer

// ── Helpers ──
function randGemColor() { return (Math.random() * GEM_NUM_COLORS) | 0; }

function newEmptyGemRow() {
  var row = [];
  for (var c = 0; c < GEM_COLS; c++) row.push(null);
  return row;
}

function gemCountGems() {
  var n = 0;
  for (var r = 0; r < gemGrid.length; r++)
    for (var c = 0; c < GEM_COLS; c++)
      if (gemGrid[r][c] && gemGrid[r][c].gem) n++;
  return n;
}

// Generate a fresh row. `below` is the row that will sit directly beneath it
// (used both for colour clustering and to guarantee gems are supported).
function newGemRow(below) {
  var row = [];
  var leftCi = -1;
  for (var c = 0; c < GEM_COLS; c++) {
    var candidates = [];
    if (leftCi >= 0) candidates.push(leftCi);
    if (below && below[c] && below[c].ci !== undefined) candidates.push(below[c].ci);
    var ci;
    if (candidates.length && Math.random() < GEM_CLUSTER) {
      ci = candidates[(Math.random() * candidates.length) | 0];
    } else {
      ci = randGemColor();
    }
    row.push({ ci: ci });
    leftCi = ci;
  }
  // Seed gems only on cells whose lower neighbour is a marble (so they start
  // supported and only drop once the player clears beneath them).
  if (below) {
    for (var c2 = 0; c2 < GEM_COLS; c2++) {
      if (below[c2] && below[c2].ci !== undefined && !below[c2].gem) {
        if (Math.random() < GEM_GEM_CHANCE && gemCountGems() < GEM_MAX_GEMS) {
          row[c2] = { gem: true, popT: 0 };
        }
      }
    }
  }
  return row;
}

// Prefer next-shot colours that actually exist on the board.
function pickShotColor() {
  var present = [];
  for (var r = 0; r < gemGrid.length; r++)
    for (var c = 0; c < GEM_COLS; c++)
      if (gemGrid[r][c] && gemGrid[r][c].ci !== undefined) present.push(gemGrid[r][c].ci);
  if (present.length) return present[(Math.random() * present.length) | 0];
  return randGemColor();
}

// ── Layout ──
function computeGemLayout() {
  if (!L || !L.funnelTop) return;
  G.cx = W / 2;
  G.boardTop = 46 * S;
  G.dangerY = L.funnelTop - 4 * S;
  var usableH = G.dangerY - G.boardTop;
  G.cell = Math.min(L.gameW / GEM_COLS, usableH / GEM_TARGET_ROWS);
  var boardW = GEM_COLS * G.cell;
  G.boardLeft = G.cx - boardW / 2;
  G.boardRight = G.cx + boardW / 2;
  G.mr = G.cell * 0.42;
  G.shooterX = G.cx;
  G.shooterY = G.dangerY + Math.min(G.cell * 0.75, (L.funnelBot - G.dangerY) * 0.55);
}

// Grid <-> screen mapping
function gemCellCX(c) { return G.boardLeft + (c + 0.5) * G.cell; }
function gemCellCY(r) { return G.boardTop + (r - 1) * G.cell + gemScrollFrac * G.cell + G.cell / 2; }
function gemColAtX(x) { return Math.floor((x - G.boardLeft) / G.cell); }
function gemRowAtY(y) { return Math.floor((y - G.boardTop - gemScrollFrac * G.cell) / G.cell) + 1; }

// ── Init / start ──
function initGemDigger() {
  gemMode = true;
  gemEnded = false; gemWinFlag = false; gemLoseReason = ''; gemEndT = 0;
  won = false; score = 0; tick = 0; hoverIdx = -1;
  particles = []; physMarbles = []; jumpers = [];
  totalBlockerMarbles = 0; blockersOnBelt = 0; blockerCollecting = false;
  gemGrid = []; gemFalling = []; gemProjectile = null;
  gemScrollFrac = 0; gemPendingScroll = 0; gemCollected = 0;
  stock = [];

  BELT_SLOTS = GEM_BELT_SLOTS;
  SORT_CAP = GEM_SORT_CAP;

  document.getElementById('win-screen').classList.remove('show');
  computeLayout();
  computeGemLayout();
  initBeltSlots();

  // Build the starting board from the bottom up so gems are supported.
  gemGrid = [newGemRow(null)];
  for (var i = 1; i < GEM_INIT_ROWS; i++) gemGrid.unshift(newGemRow(gemGrid[0]));

  // Endless customers: a stacked queue of orders per column, refilled as
  // the front order completes.
  sortCols = [[], [], [], []];
  for (var c = 0; c < 4; c++)
    for (var q = 0; q < GEM_ORDER_QUEUE; q++) sortCols[c].push(gemNewOrder());

  gemShotCi = pickShotColor();
  gemNextCi = pickShotColor();
}

function gemNewOrder() {
  return { ci: randGemColor(), filled: 0, popT: 0, vis: true, shineT: 0, squishT: 0 };
}

function startGemDigger() {
  currentLevel = -1;
  gameActive = true;
  document.getElementById('level-screen').classList.add('hidden');
  document.getElementById('cal-toggle').style.display = '';
  ensureAudio();
  initGemDigger();
}

// ── Shooting ──
function clampUpAngle(a) {
  // Keep the shot pointing upward, within a comfortable arc.
  var lo = -(Math.PI - 0.18), hi = -0.18;
  if (a > hi) { a = (Math.cos(a) >= 0) ? hi : lo; }
  if (a < lo) a = lo;
  return a;
}

function updateGemAim() {
  var a = Math.atan2(gemAimY - G.shooterY, gemAimX - G.shooterX);
  gemAimAngle = clampUpAngle(a);
}

function gemShoot(px, py) {
  if (gemProjectile) return;
  gemAimX = px; gemAimY = py;
  updateGemAim();
  var spd = GEM_SHOT_SPEED * S;
  gemProjectile = {
    x: G.shooterX, y: G.shooterY,
    vx: Math.cos(gemAimAngle) * spd,
    vy: Math.sin(gemAimAngle) * spd,
    ci: gemShotCi, r: G.mr, life: 0,
    prevR: gemRowAtY(G.shooterY), prevC: gemColAtX(G.shooterX)
  };
  gemShotCi = gemNextCi;
  gemNextCi = pickShotColor();
  sfx.pop();
}

// Place a marble in the grid, extending downward if it landed below the
// current content (this is how wrong-colour shots pile the board up).
function gemLand(r, c, ci) {
  if (c < 0) c = 0; if (c >= GEM_COLS) c = GEM_COLS - 1;
  if (r < 0) r = 0;
  while (r >= gemGrid.length) gemGrid.push(newEmptyGemRow());
  if (gemGrid[r][c]) {
    // Target somehow occupied — drop it just below instead.
    r = r + 1;
    while (r >= gemGrid.length) gemGrid.push(newEmptyGemRow());
  }
  gemGrid[r][c] = { ci: ci };
  sfx.drop();
  spawnBurst(gemCellCX(c), gemCellCY(r), COLORS[ci].fill, 6);
  gemResolveMatch(r, c, ci);
  gemCheckGems();
}

// Flood-fill the same-colour connected group; release it if 2+.
function gemResolveMatch(sr, sc, ci) {
  var seen = {};
  var group = [];
  var stack = [[sr, sc]];
  while (stack.length) {
    var cur = stack.pop();
    var r = cur[0], c = cur[1];
    if (r < 0 || r >= gemGrid.length || c < 0 || c >= GEM_COLS) continue;
    var key = r + ',' + c;
    if (seen[key]) continue;
    var cell = gemGrid[r][c];
    if (!cell || cell.gem || cell.ci !== ci) continue;
    seen[key] = true;
    group.push([r, c]);
    stack.push([r - 1, c]); stack.push([r + 1, c]);
    stack.push([r, c - 1]); stack.push([r, c + 1]);
  }
  if (group.length >= GEM_MIN_MATCH) {
    for (var i = 0; i < group.length; i++) gemReleaseCell(group[i][0], group[i][1], ci);
    sfx.sort();
  }
}

// Turn a board marble into a falling physics marble headed for the belt.
function gemReleaseCell(r, c, ci) {
  if (!gemGrid[r] || !gemGrid[r][c]) return;
  var x = gemCellCX(c), y = gemCellCY(r);
  gemGrid[r][c] = null;
  physMarbles.push({
    x: x, y: y,
    vx: (Math.random() - 0.5) * 3 * S,
    vy: -(1 + Math.random() * 2) * S,
    ci: ci, r: getMR(), spawnT: 1.0
  });
  spawnBurst(x, y, COLORS[ci].light, 5);
  gemPendingScroll += GEM_SCROLL_PER_DROP;
}

// Collect any gem that no longer has a marble directly below it.
function gemCheckGems() {
  for (var r = 0; r < gemGrid.length; r++) {
    for (var c = 0; c < GEM_COLS; c++) {
      var cell = gemGrid[r][c];
      if (!cell || !cell.gem) continue;
      var below = (r + 1 < gemGrid.length) ? gemGrid[r + 1][c] : null;
      var supported = below && below.ci !== undefined; // a marble holds it
      if (!supported) gemCollectGem(r, c);
    }
  }
}

function gemCollectGem(r, c) {
  var x = gemCellCX(c), y = gemCellCY(r);
  gemGrid[r][c] = null;
  gemCollected++;
  gemFalling.push({ x: x, y: y, vy: 1 * S, rot: 0, life: 1, size: G.mr * 1.1 });
  spawnBurst(x, y, '#FFE066', 16);
  spawnConfetti(x, y, 10);
  sfx.complete();
  if (gemCollected >= GEM_TARGET) gemGameEnd(true, '');
}

function gemGameEnd(win, reason) {
  if (gemEnded) return;
  gemEnded = true; gemWinFlag = win; gemLoseReason = reason; gemEndT = 0;
  gemProjectile = null;
  if (win) {
    sfx.win();
    spawnConfetti(W / 2, H / 3, 60);
    setTimeout(function () { spawnConfetti(W * 0.3, H / 2, 40); }, 200);
    setTimeout(function () { spawnConfetti(W * 0.7, H / 2, 40); }, 400);
  } else {
    tone(220, 0.5, 'sawtooth', 0.08, 90);
  }
}

// ── Update ──
function updateGemDigger() {
  // Projectile flight (freezes the scroll so indices stay stable).
  if (gemProjectile) {
    var p = gemProjectile;
    var steps = 5;
    for (var s = 0; s < steps && gemProjectile; s++) {
      p.x += p.vx / steps; p.y += p.vy / steps;
      if (p.x < G.boardLeft + p.r) { p.x = G.boardLeft + p.r; p.vx = Math.abs(p.vx); }
      if (p.x > G.boardRight - p.r) { p.x = G.boardRight - p.r; p.vx = -Math.abs(p.vx); }
      if (p.y < G.boardTop - p.r) { gemLand(p.prevR, p.prevC, p.ci); gemProjectile = null; break; }
      var c = gemColAtX(p.x), r = gemRowAtY(p.y);
      if (r >= 0 && r < gemGrid.length && c >= 0 && c < GEM_COLS && gemGrid[r][c]) {
        gemLand(p.prevR, p.prevC, p.ci); gemProjectile = null; break;
      } else if (c >= 0 && c < GEM_COLS && r >= 0) {
        p.prevR = r; p.prevC = c;
      }
    }
    if (gemProjectile) {
      p.life++;
      if (p.life > 200) { gemLand(p.prevR, p.prevC, p.ci); gemProjectile = null; }
    }
  } else {
    // Auto-scroll (only while no projectile is in flight).
    gemScrollFrac += GEM_SCROLL_SPEED + gemPendingScroll;
    gemPendingScroll = 0;
    while (gemScrollFrac >= 1) {
      gemScrollFrac -= 1;
      gemGrid.unshift(newGemRow(gemGrid[0]));
    }
    // Trim empty rows off the bottom to keep the grid bounded.
    while (gemGrid.length > 1) {
      var last = gemGrid[gemGrid.length - 1];
      var empty = true;
      for (var lc = 0; lc < GEM_COLS; lc++) if (last[lc]) { empty = false; break; }
      if (empty) gemGrid.pop(); else break;
    }
  }

  // Falling-gem cosmetics
  for (var i = gemFalling.length - 1; i >= 0; i--) {
    var g = gemFalling[i];
    g.y += g.vy; g.vy += 0.45 * S; g.rot += 0.18; g.life -= 0.02;
    if (g.y > H + 40 * S || g.life <= 0) gemFalling.splice(i, 1);
  }

  // Gem pop timers
  for (var r2 = 0; r2 < gemGrid.length; r2++)
    for (var c2 = 0; c2 < GEM_COLS; c2++)
      if (gemGrid[r2][c2] && gemGrid[r2][c2].gem && gemGrid[r2][c2].popT > 0)
        gemGrid[r2][c2].popT = Math.max(0, gemGrid[r2][c2].popT - 0.03);

  // Refill customer queues as completed orders drop off the front.
  for (var col = 0; col < 4; col++) {
    var arr = sortCols[col];
    for (var k = arr.length - 1; k >= 0; k--) if (!arr[k].vis) arr.splice(k, 1);
    while (arr.length < GEM_ORDER_QUEUE) arr.push(gemNewOrder());
  }

  if (gemEnded) return;

  // Lose: board full (a marble/gem crosses the danger line).
  for (var rr = 0; rr < gemGrid.length; rr++) {
    var cy = gemCellCY(rr);
    if (cy + G.mr < G.dangerY) continue;
    for (var cc = 0; cc < GEM_COLS; cc++) {
      if (gemGrid[rr][cc]) { gemGameEnd(false, 'board'); break; }
    }
    if (gemEnded) break;
  }

  // Lose: conveyor full.
  if (!gemEnded) {
    var occ = 0;
    for (var b = 0; b < BELT_SLOTS; b++) if (beltSlots[b].marble >= 0) occ++;
    if (occ >= BELT_SLOTS) gemGameEnd(false, 'belt');
  }
}

// ── Drawing ──
function drawGem(x, y, size, rot, glow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot || 0);
  if (glow) { ctx.shadowColor = 'rgba(120,230,255,0.9)'; ctx.shadowBlur = 14 * S; }
  var grad = ctx.createLinearGradient(-size, -size, size, size);
  grad.addColorStop(0, '#BFFCFF');
  grad.addColorStop(0.5, '#49D6FF');
  grad.addColorStop(1, '#1E7ACC');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.85, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.85, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5 * S;
  ctx.stroke();
  // facets
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(-size * 0.85, 0); ctx.lineTo(size * 0.85, 0);
  ctx.moveTo(0, -size); ctx.lineTo(0, size * 0.4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(-size * 0.25, -size * 0.3, size * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawGemBoard() {
  for (var r = 0; r < gemGrid.length; r++) {
    var cy = gemCellCY(r);
    if (cy < -G.cell || cy > H + G.cell) continue;
    for (var c = 0; c < GEM_COLS; c++) {
      var cell = gemGrid[r][c];
      if (!cell) continue;
      var cx = gemCellCX(c);
      if (cell.gem) {
        drawGem(cx, cy, G.mr * 0.95 * (1 + (cell.popT || 0) * 0.3), tick * 0.02 + (r + c), true);
      } else {
        drawMarble(cx, cy, G.mr, cell.ci);
      }
    }
  }
  // Projectile
  if (gemProjectile) drawMarble(gemProjectile.x, gemProjectile.y, gemProjectile.r, gemProjectile.ci);
}

function drawGemFalling() {
  for (var i = 0; i < gemFalling.length; i++) {
    var g = gemFalling[i];
    ctx.globalAlpha = Math.max(0, g.life);
    drawGem(g.x, g.y, g.size, g.rot, true);
    ctx.globalAlpha = 1;
  }
}

function drawGemAim() {
  if (gemProjectile) return;
  // Ray-march a dotted preview line, bouncing off the side walls.
  var x = G.shooterX, y = G.shooterY;
  var vx = Math.cos(gemAimAngle), vy = Math.sin(gemAimAngle);
  var step = G.cell * 0.32;
  ctx.save();
  ctx.fillStyle = 'rgba(90,74,56,0.35)';
  for (var i = 0; i < 60; i++) {
    x += vx * step; y += vy * step;
    if (x < G.boardLeft + G.mr) { x = G.boardLeft + G.mr; vx = Math.abs(vx); }
    if (x > G.boardRight - G.mr) { x = G.boardRight - G.mr; vx = -Math.abs(vx); }
    if (y < G.boardTop) break;
    var cc = gemColAtX(x), rr = gemRowAtY(y);
    if (rr >= 0 && rr < gemGrid.length && cc >= 0 && cc < GEM_COLS && gemGrid[rr][cc]) break;
    if (i % 2 === 0) { ctx.beginPath(); ctx.arc(x, y, 2.4 * S, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function drawGemShooter() {
  var x = G.shooterX, y = G.shooterY;
  // base
  ctx.save();
  ctx.fillStyle = 'rgba(120,100,80,0.55)';
  ctx.beginPath(); ctx.arc(x, y, G.mr * 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // loaded marble
  drawMarble(x, y, G.mr, gemShotCi);
  // next preview
  var nx = x + G.cell * 1.5, ny = y + G.cell * 0.1;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(120,100,80,0.25)';
  ctx.beginPath(); ctx.arc(nx, ny, G.mr * 0.75, 0, Math.PI * 2); ctx.fill();
  drawMarble(nx, ny, G.mr * 0.62, gemNextCi);
  ctx.font = 'bold ' + (9 * S) + 'px Fredoka, sans-serif';
  ctx.fillStyle = 'rgba(90,74,56,0.6)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('next', nx, ny - G.mr * 1.15);
  ctx.restore();
}

function drawGemDanger() {
  // How close is the lowest marble to the line?
  var maxCy = 0;
  for (var r = 0; r < gemGrid.length; r++) {
    var cy = gemCellCY(r);
    var has = false;
    for (var c = 0; c < GEM_COLS; c++) if (gemGrid[r][c]) { has = true; break; }
    if (has && cy > maxCy) maxCy = cy;
  }
  var near = Math.max(0, Math.min(1, 1 - (G.dangerY - maxCy) / (G.cell * 2.5)));
  var pulse = 0.3 + near * (0.4 + Math.sin(tick * 0.2) * 0.25);
  ctx.save();
  ctx.strokeStyle = 'rgba(220,60,60,' + pulse.toFixed(3) + ')';
  ctx.lineWidth = 2.5 * S;
  ctx.setLineDash([10 * S, 8 * S]);
  ctx.beginPath();
  ctx.moveTo(G.boardLeft - G.cell * 0.4, G.dangerY);
  ctx.lineTo(G.boardRight + G.cell * 0.4, G.dangerY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawGemHUD() {
  // Top band masks marbles sliding in above the play area + holds the counter.
  var bandH = 56 * S;
  var bgrad = ctx.createLinearGradient(0, 0, 0, bandH);
  bgrad.addColorStop(0, '#EDE5D8');
  bgrad.addColorStop(0.75, '#EDE5D8');
  bgrad.addColorStop(1, 'rgba(237,229,216,0)');
  ctx.fillStyle = bgrad;
  ctx.fillRect(0, 0, W, bandH);

  // Gem counter, top-centre.
  var y = 30 * S;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  drawGem(W / 2 - 42 * S, y, 11 * S, 0, false);
  ctx.font = 'bold ' + (24 * S) + 'px Fredoka, sans-serif';
  ctx.fillStyle = '#5A4A38';
  ctx.fillText(gemCollected + ' / ' + GEM_TARGET, W / 2 + 14 * S, y);
  ctx.font = '600 ' + (11 * S) + 'px Fredoka, sans-serif';
  ctx.fillStyle = 'rgba(90,74,56,0.55)';
  ctx.fillText('gems collected', W / 2, y + 20 * S);
  ctx.restore();
}

function drawGemOverlay() {
  gemEndT = Math.min(1, gemEndT + 0.05);
  ctx.save();
  ctx.globalAlpha = gemEndT * 0.9;
  ctx.fillStyle = gemWinFlag ? 'rgba(78,180,120,0.5)' : 'rgba(60,40,40,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = gemEndT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = gemWinFlag ? '#FFF6D0' : '#FFD9D9';
  ctx.font = 'bold ' + (52 * S) + 'px Fredoka, sans-serif';
  ctx.fillText(gemWinFlag ? 'You Win!' : 'Game Over', W / 2, H / 2 - 40 * S);
  ctx.font = '600 ' + (18 * S) + 'px Fredoka, sans-serif';
  ctx.fillStyle = gemWinFlag ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.85)';
  var msg = gemWinFlag ? ('You collected ' + GEM_TARGET + ' gems!')
    : (gemLoseReason === 'belt' ? 'The conveyor is full!' : 'The board filled up!');
  ctx.fillText(msg, W / 2, H / 2 + 10 * S);
  ctx.font = '600 ' + (15 * S) + 'px Fredoka, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('tap to return to menu', W / 2, H / 2 + 54 * S);
  ctx.restore();
}

function drawGemMode() {
  drawFunnel();
  drawGemBoard();
  drawGemFalling();
  drawGemShooter();
  drawGemAim();
  drawPhysMarbles();
  drawBelt();
  drawJumpers();
  drawSortArea();
  drawGemDanger();
  drawGemHUD();
  drawBackButton();
  if (gemEnded) drawGemOverlay();
}

// Keep the board layout in sync with window resizes.
window.addEventListener('resize', function () { if (gemMode) computeGemLayout(); });
canvas.addEventListener('mousemove', function (e) {
  if (gemMode && !gemEnded) { gemAimX = e.clientX; gemAimY = e.clientY; updateGemAim(); }
});
canvas.addEventListener('touchmove', function (e) {
  if (gemMode && !gemEnded && e.touches[0]) { gemAimX = e.touches[0].clientX; gemAimY = e.touches[0].clientY; updateGemAim(); }
}, { passive: true });
