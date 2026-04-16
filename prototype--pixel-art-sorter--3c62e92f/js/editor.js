// ============================================================
// editor.js — Level Editor (Pixel Art Sorter version)
//             Paint a 20x20 pixel art image, auto-generate stock
// ============================================================

var editor = {
  pixelArt: [],      // 20*20 flat: null or ci (0-7)
  grid: [],          // 7*7 flat: auto-generated { ci, type } or null
  name: 'Pixel Art Level',
  desc: 'Paint and play!',
  mrbPerBox: 8,
  activeColor: 0,    // -1=eraser, 0-7=color
  visible: false,
  painting: false,
  paintColor: null
};

// ── Pixel art presets (generated at load time) ──
var PIXEL_PRESETS = {};

PIXEL_PRESETS.heart = (function () {
  var a = [];
  for (var i = 0; i < 400; i++) a.push(null);
  for (var r = 0; r < 20; r++) {
    for (var c = 0; c < 20; c++) {
      var x = (c - 9.5) / 7.5;
      var y = -(r - 10) / 8;
      var v = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
      if (v < 0) a[r * 20 + c] = 0; // pink
    }
  }
  return a;
})();

PIXEL_PRESETS.star = (function () {
  var a = [];
  for (var i = 0; i < 400; i++) a.push(null);
  var cx = 9.5, cy = 9.5;
  for (var r = 0; r < 20; r++) {
    for (var c = 0; c < 20; c++) {
      var dx = c - cx, dy = r - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var ang = Math.atan2(dy, dx) + Math.PI / 2;
      var a2 = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      var sector = a2 / (Math.PI * 2 / 5);
      var frac = sector - Math.floor(sector);
      var t = Math.abs(frac - 0.5) * 2;
      var threshold = 3.5 + t * 5.5;
      if (dist < threshold) {
        a[r * 20 + c] = dist < threshold - 1.5 ? 3 : 5; // yellow inner, orange outline
      }
    }
  }
  return a;
})();

PIXEL_PRESETS.mushroom = (function () {
  var a = [];
  for (var i = 0; i < 400; i++) a.push(null);
  var cx = 9.5;
  // Cap
  for (var r = 2; r <= 10; r++) {
    for (var c = 0; c < 20; c++) {
      var ddx = (c - cx) / 8;
      var ddy = (r - 10) / 6;
      if (ddx * ddx + ddy * ddy < 1) a[r * 20 + c] = 0; // pink cap
    }
  }
  // Spots (transparent holes in cap)
  var spots = [[6, 5, 1.8], [13, 5, 1.8], [9.5, 3, 1.4], [4, 8, 1.2], [15, 8, 1.2]];
  for (var s = 0; s < spots.length; s++) {
    for (var r = 0; r < 20; r++) {
      for (var c = 0; c < 20; c++) {
        var ddx = c - spots[s][0], ddy = r - spots[s][1];
        if (ddx * ddx + ddy * ddy < spots[s][2] * spots[s][2] && a[r * 20 + c] === 0) {
          a[r * 20 + c] = null;
        }
      }
    }
  }
  // Stem
  for (var r = 11; r <= 16; r++) {
    for (var c = 7; c <= 12; c++) a[r * 20 + c] = 6; // teal
  }
  // Ground
  for (var r = 17; r <= 19; r++) {
    for (var c = 0; c < 20; c++) a[r * 20 + c] = 2; // green
  }
  return a;
})();

PIXEL_PRESETS.smiley = (function () {
  var a = [];
  for (var i = 0; i < 400; i++) a.push(null);
  var cx = 9.5, cy = 9.5, R = 8.5;
  // Face
  for (var r = 0; r < 20; r++) {
    for (var c = 0; c < 20; c++) {
      var ddx = c - cx, ddy = r - cy;
      if (ddx * ddx + ddy * ddy < R * R) a[r * 20 + c] = 3; // yellow
    }
  }
  // Eyes
  var eyes = [[7, 7], [12, 7]];
  for (var e = 0; e < eyes.length; e++) {
    for (var r = 0; r < 20; r++) {
      for (var c = 0; c < 20; c++) {
        var ddx = c - eyes[e][0], ddy = r - eyes[e][1];
        if (ddx * ddx + ddy * ddy < 2.8) a[r * 20 + c] = 1; // blue
      }
    }
  }
  // Mouth arc
  for (var c = 5; c <= 14; c++) {
    var mt = (c - 9.5) / 5;
    var mouthY = Math.round(12.5 + mt * mt * 2);
    for (var dy = 0; dy <= 1; dy++) {
      var mr = mouthY + dy;
      if (mr >= 0 && mr < 20 && a[mr * 20 + c] === 3) a[mr * 20 + c] = 0; // pink
    }
  }
  return a;
})();

// ── Init ──
function editorInit() {
  editor.pixelArt = [];
  for (var i = 0; i < PIXEL_ROWS * PIXEL_COLS; i++) editor.pixelArt.push(null);
  editor.grid = [];
  for (var i = 0; i < 49; i++) editor.grid.push(null);
  editor.name = 'Pixel Art Level';
  editor.desc = 'Paint and play!';
  editor.mrbPerBox = 8;
  editor.activeColor = 0;
  editor.painting = false;
  editor.paintColor = null;
}

function showEditor(fresh) {
  gameActive = false;
  document.getElementById('win-screen').classList.remove('show');
  document.getElementById('level-screen').classList.add('hidden');
  document.getElementById('cal-toggle').style.display = 'none';
  document.getElementById('editor-screen').classList.remove('hidden');
  editor.visible = true;
  if (fresh !== false) editorInit();
  editorBuildUI();
}

function hideEditor() {
  document.getElementById('editor-screen').classList.add('hidden');
  editor.visible = false;
}

function editorBack() { hideEditor(); showLevelSelect(); }

function editorBuildUI() {
  editorRenderToolbar();
  editorRenderPixelGrid();
  editorRenderSettings();
  editorAutoGenStock();
  editorUpdateStats();
  editorRenderStockPreview();
}

// ── Pixel art grid (20x20) ──
function editorRenderPixelGrid() {
  var el = document.getElementById('ed-grid');
  el.innerHTML = '';
  el.style.gridTemplateColumns = 'repeat(' + PIXEL_COLS + ', 1fr)';

  for (var i = 0; i < PIXEL_ROWS * PIXEL_COLS; i++) {
    var cell = document.createElement('div');
    cell.className = 'ed-px-cell';
    var ci = editor.pixelArt[i];
    if (ci !== null && ci >= 0) {
      cell.style.background = COLORS[ci].fill;
      cell.style.borderColor = COLORS[ci].dark;
    } else {
      cell.style.background = 'rgba(180,165,145,0.15)';
      cell.style.borderColor = 'rgba(160,140,120,0.15)';
    }
    cell.setAttribute('data-idx', i);
    cell.addEventListener('mousedown', editorPixelDown);
    cell.addEventListener('mouseover', editorPixelDrag);
    cell.addEventListener('contextmenu', editorPixelCtx);
    cell.addEventListener('touchstart', editorPixelTouchStart, { passive: false });
    cell.addEventListener('touchmove', editorPixelTouchMove, { passive: false });
    cell.addEventListener('touchend', editorPixelTouchEnd, { passive: false });
    el.appendChild(cell);
  }
  document.removeEventListener('mouseup', editorPixelUp);
  document.addEventListener('mouseup', editorPixelUp);
}

function editorPixelDown(e) {
  e.preventDefault();
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  editor.painting = true;
  if (e.button === 2 || editor.activeColor === -1) {
    editor.paintColor = null;
    editor.pixelArt[idx] = null;
  } else {
    editor.paintColor = editor.activeColor;
    editor.pixelArt[idx] = editor.activeColor;
  }
  editorRefreshPixelCell(idx, e.currentTarget);
}

function editorPixelDrag(e) {
  if (!editor.painting) return;
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  editor.pixelArt[idx] = editor.paintColor;
  editorRefreshPixelCell(idx, e.currentTarget);
}

function editorPixelCtx(e) {
  e.preventDefault();
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  editor.painting = true;
  editor.paintColor = null;
  editor.pixelArt[idx] = null;
  editorRefreshPixelCell(idx, e.currentTarget);
}

function editorPixelUp() {
  if (editor.painting) {
    editor.painting = false;
    editorAutoGenStock();
    editorUpdateStats();
    editorRenderStockPreview();
  }
}

function editorPixelTouchStart(e) {
  e.preventDefault();
  var touch = e.touches[0];
  var el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el && el.classList.contains('ed-px-cell') && el.getAttribute('data-idx') !== null) {
    var idx = parseInt(el.getAttribute('data-idx'));
    editor.painting = true;
    if (editor.activeColor === -1) {
      editor.paintColor = null;
      editor.pixelArt[idx] = null;
    } else {
      editor.paintColor = editor.activeColor;
      editor.pixelArt[idx] = editor.activeColor;
    }
    editorRefreshPixelCell(idx, el);
  }
}

function editorPixelTouchMove(e) {
  e.preventDefault();
  if (!editor.painting) return;
  var touch = e.touches[0];
  var el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el && el.classList.contains('ed-px-cell') && el.getAttribute('data-idx') !== null) {
    var idx = parseInt(el.getAttribute('data-idx'));
    editor.pixelArt[idx] = editor.paintColor;
    editorRefreshPixelCell(idx, el);
  }
}

function editorPixelTouchEnd(e) {
  e.preventDefault();
  editorPixelUp();
}

function editorRefreshPixelCell(idx, el) {
  var ci = editor.pixelArt[idx];
  if (ci !== null && ci >= 0) {
    el.style.background = COLORS[ci].fill;
    el.style.borderColor = COLORS[ci].dark;
  } else {
    el.style.background = 'rgba(180,165,145,0.15)';
    el.style.borderColor = 'rgba(160,140,120,0.15)';
  }
}

// ── Toolbar: color palette ──
function editorRenderToolbar() {
  var el = document.getElementById('ed-toolbar');
  el.innerHTML = '';

  var colorRow = document.createElement('div');
  colorRow.className = 'ed-color-row';

  var eraser = document.createElement('button');
  eraser.className = 'ed-tool' + (editor.activeColor === -1 ? ' active' : '');
  eraser.style.background = 'rgba(180,165,145,0.5)';
  eraser.innerHTML = '\u2716';
  eraser.title = 'Eraser';
  eraser.addEventListener('click', function () { editor.activeColor = -1; editorRenderToolbar(); });
  colorRow.appendChild(eraser);

  for (var ci = 0; ci < NUM_COLORS; ci++) {
    var cb = document.createElement('button');
    cb.className = 'ed-tool' + (editor.activeColor === ci ? ' active' : '');
    cb.style.background = COLORS[ci].fill;
    cb.innerHTML = CLR_NAMES[ci][0].toUpperCase();
    cb.title = CLR_NAMES[ci];
    cb.setAttribute('data-ci', ci);
    cb.addEventListener('click', function () {
      editor.activeColor = parseInt(this.getAttribute('data-ci'));
      editorRenderToolbar();
    });
    colorRow.appendChild(cb);
  }

  el.appendChild(colorRow);
}

// ── Auto-generate stock from pixel art ──
function editorAutoGenStock() {
  var counts = [];
  for (var c = 0; c < NUM_COLORS; c++) counts.push(0);
  for (var i = 0; i < editor.pixelArt.length; i++) {
    var pa = editor.pixelArt[i];
    if (pa !== null && pa >= 0 && pa < NUM_COLORS) counts[pa]++;
  }

  var boxes = [];
  for (var c = 0; c < NUM_COLORS; c++) {
    var needed = Math.ceil(counts[c] / editor.mrbPerBox);
    for (var n = 0; n < needed; n++) boxes.push({ ci: c, type: 'default' });
  }
  shuffle(boxes);

  editor.grid = [];
  for (var i = 0; i < 49; i++) editor.grid.push(i < boxes.length ? boxes[i] : null);
}

// ── Stock preview ──
function editorRenderStockPreview() {
  var el = document.getElementById('ed-stock-grid');
  if (!el) return;
  el.innerHTML = '';

  for (var i = 0; i < 49; i++) {
    var cell = document.createElement('div');
    cell.className = 'ed-stock-cell';
    var v = editor.grid[i];
    if (v && v.ci >= 0) {
      cell.style.background = COLORS[v.ci].fill;
      cell.style.borderColor = COLORS[v.ci].dark;
    } else {
      cell.style.background = 'rgba(180,165,145,0.15)';
      cell.style.borderColor = 'rgba(160,140,120,0.15)';
    }
    el.appendChild(cell);
  }
}

// ── Stats ──
function editorUpdateStats() {
  var counts = [];
  for (var c = 0; c < NUM_COLORS; c++) counts.push(0);
  var totalPixels = 0;
  for (var i = 0; i < editor.pixelArt.length; i++) {
    var pa = editor.pixelArt[i];
    if (pa !== null && pa >= 0 && pa < NUM_COLORS) { counts[pa]++; totalPixels++; }
  }

  var totalBoxes = 0;
  for (var c = 0; c < NUM_COLORS; c++) totalBoxes += Math.ceil(counts[c] / editor.mrbPerBox);

  var el = document.getElementById('ed-stats');
  var html = '<span class="ed-stat-total">' + totalPixels + ' pixels \u2022 ' + totalBoxes + ' boxes</span>';
  for (var c = 0; c < NUM_COLORS; c++) {
    if (counts[c] > 0) {
      html += '<span class="ed-stat-chip" style="background:' + COLORS[c].fill + '">' + counts[c] + 'px</span>';
    }
  }

  var warn = '';
  if (totalPixels === 0) {
    warn = 'Paint some pixels or pick a preset to get started';
  } else if (totalBoxes > 49) {
    warn = 'Too many pixels! Need ' + totalBoxes + ' boxes but grid fits 49. Increase Marbles/Box or reduce pixels.';
  }
  if (warn) html += '<span class="ed-stat-warn">' + warn + '</span>';
  el.innerHTML = html;
}

// ── Settings ──
function editorRenderSettings() {
  var el = document.getElementById('ed-settings-body');
  el.innerHTML = '';

  var row = document.createElement('div');
  row.className = 'ed-setting-row';
  row.innerHTML = '<label>Marbles/Box</label>' +
    '<input type="range" id="ed-s-mrbPerBox" min="1" max="25" step="1" value="' + editor.mrbPerBox + '">' +
    '<span class="ed-s-val" id="ed-s-mrbPerBox-v">' + editor.mrbPerBox + '</span>';
  el.appendChild(row);

  var sl = document.getElementById('ed-s-mrbPerBox');
  var vl = document.getElementById('ed-s-mrbPerBox-v');
  sl.addEventListener('input', function () {
    editor.mrbPerBox = parseInt(sl.value);
    vl.textContent = sl.value;
    editorAutoGenStock();
    editorUpdateStats();
    editorRenderStockPreview();
  });
}

// ── Presets ──
function editorLoadPreset(name) {
  var preset = PIXEL_PRESETS[name];
  if (!preset) return;
  editor.pixelArt = preset.slice();
  editorRenderPixelGrid();
  editorAutoGenStock();
  editorUpdateStats();
  editorRenderStockPreview();
}

// ── Quick actions ──
function editorClearAll() {
  for (var i = 0; i < editor.pixelArt.length; i++) editor.pixelArt[i] = null;
  editorRenderPixelGrid();
  editorAutoGenStock();
  editorUpdateStats();
  editorRenderStockPreview();
}

function editorFillRandom() {
  var numClrs = 3 + Math.floor(Math.random() * 3);
  var palette = [];
  var indices = []; for (var i = 0; i < NUM_COLORS; i++) indices.push(i);
  shuffle(indices);
  for (var i = 0; i < numClrs; i++) palette.push(indices[i]);
  for (var i = 0; i < editor.pixelArt.length; i++) {
    if (Math.random() < 0.55) {
      editor.pixelArt[i] = palette[Math.floor(Math.random() * palette.length)];
    } else {
      editor.pixelArt[i] = null;
    }
  }
  editorRenderPixelGrid();
  editorAutoGenStock();
  editorUpdateStats();
  editorRenderStockPreview();
}

// ── Build level definition ──
function editorBuildLevel() {
  editorAutoGenStock();
  return {
    name: editor.name, desc: editor.desc,
    mrbPerBox: editor.mrbPerBox, sortCap: 1, lockButtons: 0,
    grid: editor.grid.slice(),
    pixelArt: editor.pixelArt.slice()
  };
}

// ── Test play ──
function editorTestPlay() {
  var total = 0;
  for (var i = 0; i < editor.pixelArt.length; i++) if (editor.pixelArt[i] !== null) total++;
  if (total === 0) { editorShowToast('Paint some pixels first!'); return; }
  hideEditor();
  var lvl = editorBuildLevel();
  var testIdx = LEVELS.length;
  LEVELS.push(lvl);
  levelStars.push(0);
  if (unlockedLevels <= testIdx) unlockedLevels = testIdx + 1;
  startLevel(testIdx);
  editor._testIdx = testIdx;
}

function editorCleanupTest() {
  if (editor._testIdx !== undefined && editor._testIdx === LEVELS.length - 1) {
    LEVELS.pop(); levelStars.pop(); editor._testIdx = undefined;
  }
}

// ── Export / Import ──
function editorExportJSON() {
  var json = JSON.stringify(editorBuildLevel(), null, 2);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(json).then(function () { editorShowToast('Copied to clipboard!'); })
      .catch(function () { editorShowExportFallback(json); });
  } else { editorShowExportFallback(json); }
}

function editorShowExportFallback(json) {
  var ta = document.getElementById('ed-export-area');
  ta.value = json; ta.style.display = 'block'; ta.select();
  editorShowToast('Select all and copy');
}

function editorImportJSON() {
  var ta = document.getElementById('ed-export-area');
  if (ta.style.display === 'block' && ta.value.trim()) {
    try {
      var lvl = JSON.parse(ta.value);
      if (lvl.pixelArt && lvl.pixelArt.length === PIXEL_ROWS * PIXEL_COLS) {
        for (var i = 0; i < lvl.pixelArt.length; i++) {
          editor.pixelArt[i] = (lvl.pixelArt[i] !== null && lvl.pixelArt[i] >= 0) ? lvl.pixelArt[i] : null;
        }
      }
      if (lvl.mrbPerBox) editor.mrbPerBox = lvl.mrbPerBox;
      if (lvl.name) editor.name = lvl.name;
      if (lvl.desc) editor.desc = lvl.desc;
      var nameEl = document.getElementById('ed-name');
      var descEl = document.getElementById('ed-desc');
      if (nameEl) nameEl.value = editor.name;
      if (descEl) descEl.value = editor.desc;
      ta.style.display = 'none';
      editorBuildUI();
      editorShowToast('Imported!');
    } catch (e) { editorShowToast('Invalid JSON'); }
  } else {
    ta.style.display = 'block'; ta.value = '';
    ta.placeholder = 'Paste level JSON here, then click Import again';
    ta.focus();
  }
}

function editorShowToast(msg) {
  var el = document.getElementById('ed-toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 2000);
}

// ── Save as Showcase ──
function editorSaveShowcase() {
  var total = 0;
  for (var i = 0; i < editor.pixelArt.length; i++) if (editor.pixelArt[i] !== null) total++;
  if (total === 0) { editorShowToast('Paint some pixels first!'); return; }

  var level = editorBuildLevel();
  var proto = {
    name: '', description: '', howToPlay: '', author: '',
    showcaseLevel: level
  };
  if (typeof prototypeInfo !== 'undefined' && prototypeInfo) {
    if (prototypeInfo.name) proto.name = prototypeInfo.name;
    if (prototypeInfo.description) proto.description = prototypeInfo.description;
    if (prototypeInfo.howToPlay) proto.howToPlay = prototypeInfo.howToPlay;
    if (prototypeInfo.author) proto.author = prototypeInfo.author;
  }
  var json = JSON.stringify(proto, null, 2);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(json).then(function () {
      editorShowToast('prototype.json copied to clipboard!');
    }).catch(function () {
      editorShowExportFallback(json);
      editorShowToast('Select all and copy the prototype.json');
    });
  } else {
    editorShowExportFallback(json);
    editorShowToast('Select all and copy the prototype.json');
  }
}

function editorSetName(val) { editor.name = val; }
function editorSetDesc(val) { editor.desc = val; }
