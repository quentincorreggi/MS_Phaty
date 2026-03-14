// ============================================================
// game.js — Game init, update loop, input, level select
//           + Tunnel spawning integration
//           + Wall cell support
// ============================================================

// === LEVEL SELECT ===
function showLevelSelect() {
  gameActive = false;
  document.getElementById('win-screen').classList.remove('show');
  document.getElementById('cal-toggle').style.display = 'none';
  if (typeof editor !== 'undefined' && editor._testIdx !== undefined) {
    editorCleanupTest();
    showEditor(false);
    return;
  }
  document.getElementById('level-screen').classList.remove('hidden');
  if (typeof editorCleanupTest === 'function') editorCleanupTest();
}

function startLevel(idx) {
  currentLevel = idx;
  gameActive = true;
  document.getElementById('level-screen').classList.add('hidden');
  document.getElementById('cal-toggle').style.display = '';
  ensureAudio();
  initGame();
}

// === GAME INIT ===
function initGame() {
  won = false; score = 0; particles = []; physMarbles = []; jumpers = []; tick = 0; hoverIdx = -1;
  document.getElementById('win-screen').classList.remove('show');
  computeLayout(); initBeltSlots();

  var totalSlots = L.rows * L.cols;
  var lvl = LEVELS[currentLevel];

  // ── Build boxSlots, tunnelSlots, wallSlots from grid or legacy random ──
  var boxSlots = {};
  var tunnelSlots = {};
  var wallSlots = {};
  if (lvl.grid) {
    for (var i = 0; i < Math.min(lvl.grid.length, totalSlots); i++) {
      var cell = lvl.grid[i];
      if (cell === null || cell === undefined) continue;
      if (cell.wall) {
        wallSlots[i] = true;
        continue;
      }
      if (cell.tunnel) {
        tunnelSlots[i] = { dir: cell.dir || 'bottom', contents: cell.contents ? cell.contents.slice() : [] };
      } else if (typeof cell === 'number') {
        if (cell >= 0) boxSlots[i] = { ci: cell, boxType: 'default' };
      } else if (typeof cell === 'object' && cell.ci >= 0) {
        boxSlots[i] = { ci: cell.ci, boxType: cell.type || 'default' };
      }
    }
  }
  if (lvl.mrbPerBox) MRB_PER_BOX = lvl.mrbPerBox;
  if (lvl.sortCap) SORT_CAP = lvl.sortCap;

  // ── Count regular marbles per color for sort columns ──
  var colorMarblesTotal = [];
  for (var c = 0; c < NUM_COLORS; c++) colorMarblesTotal.push(0);
  function _countBoxMarbles(ci, boxType) {
    var bt = getBoxType(boxType || 'default');
    if (bt.countMarbles) {
      var mc = bt.countMarbles({ ci: ci, remaining: MRB_PER_BOX });
      colorMarblesTotal[ci] += mc.regular;
    } else {
      colorMarblesTotal[ci] += MRB_PER_BOX;
    }
  }
  for (var k in boxSlots) {
    _countBoxMarbles(boxSlots[k].ci, boxSlots[k].boxType);
  }
  // Count marbles from tunnel contents
  for (var k in tunnelSlots) {
    var ts = tunnelSlots[k];
    for (var tc = 0; tc < ts.contents.length; tc++) {
      _countBoxMarbles(ts.contents[tc].ci, ts.contents[tc].type);
    }
  }
  var sortPerColor = [];
  for (var c = 0; c < NUM_COLORS; c++) {
    sortPerColor.push(SORT_CAP > 0 ? Math.ceil(colorMarblesTotal[c] / SORT_CAP) : 0);
  }

  // ── Build stock ──
  stock = [];
  for (var r = 0; r < L.rows; r++) for (var c = 0; c < L.cols; c++) {
    var idx = r * L.cols + c;
    var slot = boxSlots[idx];
    var tSlot = tunnelSlots[idx];
    var wSlot = wallSlots[idx];

    var cellX = L.sx + c * (L.bw + L.bg), cellY = L.sy + r * (L.bh + L.bg);
    if (tSlot) {
      // Tunnel entry
      stock.push({
        isTunnel: true, isWall: false,
        tunnelDir: tSlot.dir,
        tunnelContents: tSlot.contents.map(function (item) { return { ci: item.ci, type: item.type || 'default' }; }),
        tunnelTotal: tSlot.contents.length,
        tunnelSpawning: false,
        tunnelCooldown: 60,
        ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
        revealed: true, empty: false, boxType: 'default',
        x: cellX, y: cellY,
        shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
      });
    } else if (wSlot) {
      // Wall cell — inert structural element
      stock.push({
        isWall: true, isTunnel: false,
        ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
        revealed: false, empty: false, boxType: 'default',
        x: cellX, y: cellY,
        shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
      });
    } else if (!slot) {
      stock.push({ ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
        revealed: true, empty: true, boxType: 'default', isTunnel: false, isWall: false,
        x: cellX, y: cellY,
        shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0 });
    } else {
      var obj = { ci: slot.ci, used: false, remaining: MRB_PER_BOX, spawning: false, spawnIdx: 0,
        revealed: false, empty: false,
        boxType: slot.boxType || 'default', isTunnel: false, isWall: false,
        x: cellX, y: cellY,
        shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0,
        idlePhase: Math.random() * Math.PI * 2 };
      applyBoxTypeDefaults(obj);
      var bt = getBoxType(obj.boxType);
      if (bt.initBox) bt.initBox(obj, slot.ci);
      stock.push(obj);
    }
  }

  // ── Initial reveal: lowest non-empty box per column ──
  for (var c = 0; c < L.cols; c++) {
    for (var r = L.rows - 1; r >= 0; r--) {
      var b = stock[r * L.cols + c];
      if (!b.empty && !b.isTunnel && !b.isWall) { b.revealed = true; break; }
    }
  }

  // ── Reveal boxes adjacent to initially empty/tunnel cells ──
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < stock.length; i++) {
      if (!isCellTrulyEmpty(i)) continue;
      var row2 = Math.floor(i / L.cols), col2 = i % L.cols;
      var nbrs = [];
      if (row2 > 0)          nbrs.push((row2 - 1) * L.cols + col2);
      if (row2 < L.rows - 1) nbrs.push((row2 + 1) * L.cols + col2);
      if (col2 > 0)          nbrs.push(row2 * L.cols + (col2 - 1));
      if (col2 < L.cols - 1) nbrs.push(row2 * L.cols + (col2 + 1));
      for (var ni = 0; ni < nbrs.length; ni++) {
        var nb = stock[nbrs[ni]];
        if (nb.isTunnel || nb.isWall || nb.empty || nb.used || nb.revealed) continue;
        nb.revealed = true;
        changed = true;
      }
    }
  }

  // ── Sort columns ──
  var allBoxes = [];
  for (var c = 0; c < NUM_COLORS; c++) for (var r = 0; r < sortPerColor[c]; r++)
    allBoxes.push({ ci: c, filled: 0, popT: 0, vis: true, shineT: 0, squishT: 0 });
  shuffle(allBoxes);
  sortCols = [[], [], [], []];
  for (var i = 0; i < allBoxes.length; i++) sortCols[i % 4].push(allBoxes[i]);

  // ── Init registered mechanics ──
  for (var mi = 0; mi < MechanicOrder.length; mi++) {
    var mech = Mechanics[MechanicOrder[mi]];
    if (mech.init) mech.init();
  }

  // Lock buttons
  var numLocks = lvl.lockButtons || 0;
  for (var li2 = 0; li2 < numLocks; li2++) {
    var lockCol = Math.floor(Math.random() * 4);
    var lockRow = Math.min(2 + Math.floor(Math.random() * 4), sortCols[lockCol].length);
    sortCols[lockCol].splice(lockRow, 0, { type: 'lock', ci: -1, filled: 0, popT: 0, vis: true, shineT: 0, squishT: 0, triggerT: 0, triggered: false });
  }
}

// === EMPTY-CELL REVEAL ===
// A cell is "truly empty" when:
//  • it's an empty slot or a used-up box, AND no tunnel will spawn onto it
//  • OR it's a depleted tunnel (0 contents left, exit tile also free)
//  • Walls are NEVER truly empty
function isCellTrulyEmpty(idx) {
  var s = stock[idx];
  if (!s) return false;
  if (s.isWall) return false;  // Walls are never empty
  if (s.isTunnel) {
    if (s.tunnelContents && s.tunnelContents.length > 0) return false;
    var exitIdx = getTunnelExitIdx(idx);
    if (exitIdx >= 0 && stock[exitIdx] && !stock[exitIdx].isTunnel
        && !stock[exitIdx].empty && !stock[exitIdx].used) return false;
    return true;
  }
  if (!s.empty && !s.used) return false;
  for (var i = 0; i < stock.length; i++) {
    if (stock[i].isTunnel && stock[i].tunnelContents && stock[i].tunnelContents.length > 0) {
      if (getTunnelExitIdx(i) === idx) return false;
    }
  }
  return true;
}

var _revealVisited = {};
function revealAroundEmptyCell(idx) {
  if (!isCellTrulyEmpty(idx)) return;
  if (_revealVisited[idx]) return;
  _revealVisited[idx] = true;
  var row = Math.floor(idx / L.cols), col = idx % L.cols;
  var neighbors = [];
  if (row > 0)          neighbors.push((row - 1) * L.cols + col);
  if (row < L.rows - 1) neighbors.push((row + 1) * L.cols + col);
  if (col > 0)          neighbors.push(row * L.cols + (col - 1));
  if (col < L.cols - 1) neighbors.push(row * L.cols + (col + 1));
  for (var ni = 0; ni < neighbors.length; ni++) {
    var nIdx = neighbors[ni];
    var nb = stock[nIdx];
    if (nb.isTunnel) {
      if (isCellTrulyEmpty(nIdx)) revealAroundEmptyCell(nIdx);
      continue;
    }
    if (nb.isWall || nb.empty || nb.used || nb.revealed || nb.spawning) continue;
    nb.revealed = true;
    nb.revealT = 1.0;
    var bx = nb.x + L.bw / 2, by = nb.y + L.bh / 2;
    var burstColor = (nb.boxType === 'hidden') ? '#FFD700' : COLORS[nb.ci].fill;
    for (var p = 0; p < 12; p++) {
      var a = Math.PI * 2 * p / 12 + Math.random() * 0.3, sp = 3 + Math.random() * 4;
      particles.push({ x: bx, y: by, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
        r: (2 + Math.random() * 4) * S, color: burstColor, life: 1, decay: 0.02 + Math.random() * 0.015, grav: false });
    }
    sfx.pop();
  }
  _revealVisited[idx] = false;
}

function isBoxTappable(idx) {
  var b = stock[idx];
  if (b.isTunnel) return false;
  if (b.isWall) return false;
  if (b.empty || b.used) return false;
  if (b.spawning || b.revealT > 0) return false;
  var bt = getBoxType(b.boxType);
  if (bt.isBoxTappable && bt.isBoxTappable(idx, b) === false) return false;
  return b.revealed;
}

function getSortBoxY(ci, vi) { return L.sTop + vi * (L.sBh + L.sGap); }

// === INPUT ===
function handleTap(px, py) {
  if (won || !gameActive) return;
  ensureAudio();
  if (px >= L.bkX && px <= L.bkX + L.bkSize && py >= L.bkY && py <= L.bkY + L.bkSize) { showLevelSelect(); return; }
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.isTunnel || b.isWall) continue;  // skip tunnels and walls in tap handler
    if (b.empty || b.used || b.spawning || b.revealT > 0) continue;
    if (px >= b.x && px <= b.x + L.bw && py >= b.y && py <= b.y + L.bh) {
      if (!isBoxTappable(i)) { b.shakeT = 0.5; return; }
      // Let mechanics intercept tap
      var consumed = false;
      for (var mi = 0; mi < MechanicOrder.length; mi++) {
        var mech = Mechanics[MechanicOrder[mi]];
        if (mech.onTap && mech.onTap(i, b) === false) { consumed = true; break; }
      }
      if (consumed) return;
      b.popT = 1;
      sfx.pop();
      spawnBurst(b.x + L.bw / 2, b.y + L.bh / 2, COLORS[b.ci].fill, 18);
      // Let box type handle tap (return false to skip default spawn)
      var bt = getBoxType(b.boxType);
      var doSpawn = true;
      if (bt.onTap && bt.onTap(i, b) === false) doSpawn = false;
      if (doSpawn) spawnPhysMarbles(b);
      // Notify adjacent boxes
      var neighbors = getNeighbors(i);
      for (var ni = 0; ni < neighbors.length; ni++) {
        var nb = stock[neighbors[ni]];
        if (nb.isTunnel || nb.isWall) continue;
        var nbt = getBoxType(nb.boxType);
        if (nbt.onAdjacentTap) nbt.onAdjacentTap(neighbors[ni], nb, i);
      }
      return;
    }
  }
}
canvas.addEventListener('click', function (e) { handleTap(e.clientX, e.clientY); });
canvas.addEventListener('touchstart', function (e) { e.preventDefault(); handleTap(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
document.getElementById('cal-panel').addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: false });
canvas.addEventListener('mousemove', function (e) {
  hoverIdx = -1;
  if (!gameActive) return;
  if (e.clientX >= L.bkX && e.clientX <= L.bkX + L.bkSize && e.clientY >= L.bkY && e.clientY <= L.bkY + L.bkSize) { canvas.style.cursor = 'pointer'; return; }
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.isTunnel || b.isWall) continue;
    if (b.empty || b.used || b.spawning || b.revealT > 0) continue;
    if (!isBoxTappable(i)) continue;
    if (e.clientX >= b.x && e.clientX <= b.x + L.bw && e.clientY >= b.y && e.clientY <= b.y + L.bh) { hoverIdx = i; break; }
  }
  canvas.style.cursor = hoverIdx >= 0 ? 'pointer' : 'default';
});

// === UPDATE ===
function update() {
  if (!gameActive) return;
  tick++;
  physicsStep();

  beltOffset = (beltOffset + BELT_SPEED * S) % 1;
  for (var i = 0; i < BELT_SLOTS; i++) {
    if (beltSlots[i].arriveAnim > 0) beltSlots[i].arriveAnim = Math.max(0, beltSlots[i].arriveAnim - 0.025);
  }

  // ── Tunnel spawning ──
  trySpawnFromTunnels();

  // Belt → sort matching
  for (var si = 0; si < BELT_SLOTS; si++) {
    var slot = beltSlots[si]; if (slot.marble < 0) continue;
    var slotT = getSlotT(si);
    for (var c = 0; c < 4; c++) {
      var col = sortCols[c]; var tv = -1;
      for (var r = 0; r < col.length; r++) { if (col[r].vis) { tv = r; break; } }
      if (tv < 0 || col[tv].ci !== slot.marble) continue;
      var inFlight = 0;
      for (var j = 0; j < jumpers.length; j++) if (jumpers[j].targetCol === c) inFlight++;
      if (col[tv].filled + inFlight >= SORT_CAP) continue;
      var bt = L.sortBeltT[c]; var diff = Math.abs(slotT - bt); var wdiff = Math.min(diff, 1 - diff);
      if (wdiff < 0.015) {
        var aj = false;
        for (var j = 0; j < jumpers.length; j++) if (jumpers[j].slotIdx === si) { aj = true; break; }
        if (aj) continue;
        var pos = getSlotPos(si);
        jumpers.push({ ci: slot.marble, slotIdx: si, startX: pos.x, startY: pos.y, targetCol: c, targetSlot: col[tv].filled + inFlight, t: 0 });
        slot.marble = -1; break;
      }
    }
  }

  // Jumper animation
  for (var i = jumpers.length - 1; i >= 0; i--) {
    var j = jumpers[i]; j.t += 0.04;
    if (j.t >= 1) {
      var col = sortCols[j.targetCol]; var tv = -1;
      for (var r = 0; r < col.length; r++) { if (col[r].vis) { tv = r; break; } }
      if (tv >= 0 && col[tv].ci === j.ci) {
        col[tv].filled++;
        col[tv].squishT = 1;
        sfx.sort();
        if (col[tv].filled >= SORT_CAP) {
          col[tv].popT = 1; col[tv].shineT = 1;
          sfx.complete();
          var bx2 = L.sSx + j.targetCol * (L.sBw + L.sColGap) + L.sBw / 2;
          var by2 = getSortBoxY(j.targetCol, 0) + L.sBh / 2;
          spawnBurst(bx2, by2, COLORS[j.ci].fill, 20);
          spawnConfetti(bx2, by2, 15);
          (function (box) { setTimeout(function () { box.vis = false; checkWin(); }, 600); })(col[tv]);
        }
      }
      jumpers.splice(i, 1);
    }
  }

  // ── Box type per-frame updates ──
  for (var i = 0; i < stock.length; i++) {
    var ub = stock[i];
    if (ub.isTunnel || ub.isWall || ub.empty) continue;
    var ubt = getBoxType(ub.boxType);
    if (ubt.updateBox) ubt.updateBox(i, ub, tick);
  }

  // ── Mechanic per-frame updates ──
  for (var mi = 0; mi < MechanicOrder.length; mi++) {
    var mech = Mechanics[MechanicOrder[mi]];
    if (mech.update) mech.update(tick);
  }

  // Stock animations
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.isTunnel || b.isWall) continue;  // tunnels and walls don't need stock animations
    if (b.empty) continue;
    if (b.shakeT > 0) b.shakeT = Math.max(0, b.shakeT - 0.04);
    if (b.popT > 0) b.popT = Math.max(0, b.popT - 0.025);
    if (b.revealT > 0) b.revealT = Math.max(0, b.revealT - 0.03);
    if (b.emptyT > 0) b.emptyT = Math.max(0, b.emptyT - 0.025);
    var th = (i === hoverIdx && !b.used && isBoxTappable(i)) ? 1 : 0;
    b.hoverT += (th - b.hoverT) * 0.12;
  }

  // Phys marble spawn bounce
  for (var i = 0; i < physMarbles.length; i++) {
    if (physMarbles[i].spawnT > 0) physMarbles[i].spawnT = Math.max(0, physMarbles[i].spawnT - 0.05);
  }

  // Sort box animations
  for (var c = 0; c < sortCols.length; c++) {
    var col = sortCols[c];
    for (var r = 0; r < col.length; r++) {
      if (col[r].popT > 0) col[r].popT = Math.max(0, col[r].popT - 0.018);
      if (col[r].shineT > 0) col[r].shineT = Math.max(0, col[r].shineT - 0.025);
      if (col[r].squishT > 0) col[r].squishT = Math.max(0, col[r].squishT - 0.06);
    }
  }

  // Lock button trigger
  for (var c = 0; c < sortCols.length; c++) {
    var col = sortCols[c]; var topVis = -1;
    for (var r = 0; r < col.length; r++) if (col[r].vis) { topVis = r; break; }
    if (topVis < 0) continue;
    var box = col[topVis];
    if (box.type === 'lock' && !box.triggered) {
      box.triggered = true; box.triggerT = 1.0; box.shineT = 1;
      sfx.complete();
      var bx = L.sSx + c * (L.sBw + L.sColGap) + L.sBw / 2;
      var by = getSortBoxY(c, 0) + L.sBh / 2;
      spawnBurst(bx, by, '#FFD700', 20); spawnConfetti(bx, by, 15);
      (function (boxRef) {
        setTimeout(function () { boxRef.popT = 1; }, 300);
        setTimeout(function () { boxRef.vis = false; checkWin(); }, 700);
      })(box);
    }
    if (box.type === 'lock' && box.triggerT > 0) box.triggerT = Math.max(0, box.triggerT - 0.03);
  }

  tickParticles();
  updateRollingSound();
}

function checkWin() {
  for (var c = 0; c < sortCols.length; c++)
    for (var r = 0; r < sortCols[c].length; r++)
      if (sortCols[c][r].vis) return;
  for (var i = 0; i < stock.length; i++) {
    if (stock[i].isTunnel && stock[i].tunnelContents && stock[i].tunnelContents.length > 0) return;
  }
  if (!won) {
    won = true; sfx.win();
    document.getElementById('win-msg').textContent = 'All marbles sorted perfectly!';
    spawnConfetti(W / 2, H / 3, 60);
    setTimeout(function () { spawnConfetti(W * 0.3, H / 2, 40); }, 200);
    setTimeout(function () { spawnConfetti(W * 0.7, H / 2, 40); }, 400);
    setTimeout(function () { spawnConfetti(W / 2, H / 4, 50); }, 600);
    setTimeout(function () { spawnConfetti(W / 2, H / 2, 80); }, 800);
    setTimeout(function () { document.getElementById('win-screen').classList.add('show'); }, 2000);
  }
}

// === MAIN LOOP ===
function frame() {
  if (gameActive) {
    update();
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawFunnel();
    _dispatchMechanicRender('pre-stock');
    drawStock();
    drawPhysMarbles();
    drawBelt();
    _dispatchMechanicRender('post-belt');
    drawJumpers();
    drawSortArea();
    _dispatchMechanicRender('post-sort');
    drawBackButton();
    drawParticles();
    drawDebugWalls();
  }
  requestAnimationFrame(frame);
}

// === BOOT ===
resize();
showLevelSelect();
frame();
