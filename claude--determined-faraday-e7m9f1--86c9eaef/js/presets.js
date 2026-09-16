// ============================================================
// presets.js — Test layouts for the free-form Modular Elevator
// ============================================================
// Six boards aimed at the open questions: how big a shape can get
// before clearing it stops being reasonable, whether a bent frame
// still reads as one machine, whether touching shapes read apart,
// whether colour alone separates modular from classic, and how often
// a shape encloses boxes the designer did not mean to enclose.
// ============================================================

function pGrid() {
  var g = [];
  for (var i = 0; i < 49; i++) g.push(null);
  return g;
}

function pWalls(g, list) {
  for (var i = 0; i < list.length; i++) g[list[i]] = { wall: true };
}

function pBoxes(g, list, startCi) {
  for (var i = 0; i < list.length; i++) {
    g[list[i]] = { ci: (startCi + i) % NUM_COLORS, type: 'default' };
  }
}

// Lay an elevator over `cells`. Surface and deep boxes are spread
// across the palette so a big shape does not become one wall of one
// colour.
function pElev(g, cells, eid, classic, surfCi, deepCi) {
  for (var i = 0; i < cells.length; i++) {
    g[cells[i]] = {
      elevator: true, eid: eid, classic: !!classic,
      surface: { ci: (surfCi + i) % NUM_COLORS, type: 'default' },
      deep: { ci: (deepCi + i) % NUM_COLORS, type: 'default' }
    };
  }
}

function pLevel(name, desc, grid) {
  return { name: name, desc: desc, mrbPerBox: 9, sortCap: 3, lockButtons: 0, grid: grid };
}

var ELEV_PRESETS = [
  {
    key: 'A',
    name: 'A — Wall channel',
    desc: 'A one-cell-wide arm down the left wall, in a channel a 2x2 could never enter',
    build: function () {
      var g = pGrid();
      pWalls(g, [0, 8, 15, 22, 29, 36]);
      pElev(g, [7, 14, 21, 28, 35], 0, false, 1, 5);
      pBoxes(g, [44, 45, 3, 17, 33], 0);
      return pLevel('A — Wall channel',
        'Five-cell arm flush along the left wall', g);
    }
  },
  {
    key: 'B',
    name: 'B — U-shape pocket',
    desc: 'A U whose lift seals a pocket of the maze — watch the enclosure readout',
    build: function () {
      var g = pGrid();
      pWalls(g, [17]);
      pElev(g, [16, 23, 30, 31, 32, 25, 18], 0, false, 1, 4);
      g[24] = { ci: 0, type: 'default' };   // the pocket box the U traps
      pBoxes(g, [43, 47, 2, 7], 2);
      return pLevel('B — U-shape pocket',
        'The pink box in the middle opens, then the lift shuts it again', g);
    }
  },
  {
    key: 'C',
    name: 'C — Cross',
    desc: 'A plus shape mid-board — four outside corners and four inside ones',
    build: function () {
      var g = pGrid();
      pElev(g, [17, 23, 24, 25, 31], 0, false, 2, 6);
      pBoxes(g, [42, 48, 8, 40], 0);
      return pLevel('C — Cross',
        'Does a crossing still read as one machine?', g);
    }
  },
  {
    key: 'D',
    name: 'D — Two touching',
    desc: 'Two separate elevators sharing two edges — they must read and fire apart',
    build: function () {
      var g = pGrid();
      pElev(g, [15, 22, 23], 0, false, 1, 5);
      pElev(g, [16, 17], 1, false, 3, 7);
      pBoxes(g, [37, 39, 42, 5], 0);
      return pLevel('D — Two touching',
        'Two elevators, touching, different liveries', g);
    }
  },
  {
    key: 'E',
    name: 'E — Modular + classic',
    desc: 'A modular shape and a classic 2x2 on one board — colour is the only difference',
    build: function () {
      var g = pGrid();
      pElev(g, [8, 15, 16, 23], 0, false, 1, 5);
      pElev(g, [25, 26, 32, 33], 1, true, 2, 6);
      pBoxes(g, [43, 47, 3], 0);
      return pLevel('E — Modular + classic',
        'Cool livery is modular, amber is the classic 2x2', g);
    }
  },
  {
    key: 'F',
    name: 'F — Oversized comb',
    desc: '12 cells: a spine with three teeth. 24 boxes before it fires',
    build: function () {
      var g = pGrid();
      pElev(g, [14, 15, 16, 17, 18, 19, 21, 28, 23, 30, 25, 32], 0, false, 0, 4);
      pBoxes(g, [45, 1], 2);
      return pLevel('F — Oversized comb',
        'Where does the commitment stop being reasonable?', g);
    }
  }
];

// ── Launching ──

var presetLevelIdx;   // level slot pushed for a preset, popped on exit

function playPreset(n) {
  var p = ELEV_PRESETS[n];
  if (!p) return;
  cleanupPresetLevel();
  var lvl = p.build();
  presetLevelIdx = LEVELS.length;
  LEVELS.push(lvl);
  levelStars.push(0);
  if (unlockedLevels <= presetLevelIdx) unlockedLevels = presetLevelIdx + 1;
  startLevel(presetLevelIdx);
}

function cleanupPresetLevel() {
  if (presetLevelIdx !== undefined && presetLevelIdx === LEVELS.length - 1) {
    LEVELS.pop(); levelStars.pop();
  }
  presetLevelIdx = undefined;
}

function buildPresetButtons(containerId, onPick) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  for (var i = 0; i < ELEV_PRESETS.length; i++) {
    var b = document.createElement('button');
    b.className = 'preset-btn';
    b.innerHTML = '<b>' + ELEV_PRESETS[i].key + '</b><span>' +
      ELEV_PRESETS[i].name.replace(/^. — /, '') + '</span>';
    b.title = ELEV_PRESETS[i].desc;
    b.setAttribute('data-n', i);
    b.addEventListener('click', function () { onPick(parseInt(this.getAttribute('data-n'))); });
    el.appendChild(b);
  }
}
