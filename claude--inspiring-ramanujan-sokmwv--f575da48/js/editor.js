// ============================================================
// editor.js — Level Editor (reads box types from registry)
//             + Tunnel placement, orientation, contents editing
//             + Wall placement
// ============================================================

var editor = {
  grid: [],            // 7x7: null = empty, { ci, type } or { tunnel: true, ... } or { wall: true }
  pins: [],            // [{ cells:[idx,...], orient:'h'|'v', keyA: idx, keyB: idx }]
  name: 'Custom Level',
  desc: 'My custom level',
  mrbPerBox: 9,
  sortCap: 3,
  lockButtons: 0,
  activeColor: 0,      // -1=eraser, 0-7=color
  activeType: BoxTypeOrder[0],
  tunnelMode: false,    // true when placing tunnels
  tunnelDir: 'bottom',  // current tunnel direction for new tunnels
  selectedTunnel: -1,   // index of selected tunnel for content editing
  wallMode: false,      // true when placing walls
  pinMode: false,       // true when placing pins
  pinSize: 2,           // 2 or 3
  pinPickFirst: -1,     // first endpoint cell while placing
  selectedPin: -1,      // index in editor.pins for side panel
  visible: false
};

function editorInit() {
  editor.grid = [];
  for (var i = 0; i < 49; i++) editor.grid.push(null);
  editor.pins = [];
  editor.name = 'Custom Level';
  editor.desc = 'My custom level';
  editor.mrbPerBox = 9;
  editor.sortCap = 3;
  editor.lockButtons = 0;
  editor.activeColor = 0;
  editor.activeType = BoxTypeOrder[0];
  editor.tunnelMode = false;
  editor.tunnelDir = 'bottom';
  editor.selectedTunnel = -1;
  editor.wallMode = false;
  editor.pinMode = false;
  editor.pinSize = 2;
  editor.pinPickFirst = -1;
  editor.selectedPin = -1;
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
  editorRenderGrid();
  editorRenderToolbar();
  editorRenderSettings();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderPinPanel();
}

// ── Grid ──
function editorRenderGrid() {
  var el = document.getElementById('ed-grid');
  el.innerHTML = '';
  // Precompute pin maps for fast lookups
  var pinnedCells = {};   // cellIdx → array of pin indices
  var keyCells = {};      // cellIdx → array of { pinIdx, endLabel }
  for (var pi = 0; pi < editor.pins.length; pi++) {
    var p = editor.pins[pi];
    for (var cc = 0; cc < p.cells.length; cc++) {
      var ci = p.cells[cc];
      if (!pinnedCells[ci]) pinnedCells[ci] = [];
      pinnedCells[ci].push(pi);
    }
    if (p.keyA != null) {
      if (!keyCells[p.keyA]) keyCells[p.keyA] = [];
      keyCells[p.keyA].push({ pinIdx: pi, endLabel: 'A' });
    }
    if (p.keyB != null) {
      if (!keyCells[p.keyB]) keyCells[p.keyB] = [];
      keyCells[p.keyB].push({ pinIdx: pi, endLabel: 'B' });
    }
  }
  for (var i = 0; i < 49; i++) {
    var cell = document.createElement('div');
    cell.className = 'ed-cell';
    var v = editor.grid[i];
    if (v && v.wall) {
      // Wall cell
      cell.style.background = 'linear-gradient(135deg,#9A8D7B,#6F6355)';
      cell.style.borderColor = '#8A7D6B';
      cell.innerHTML = '<span class="ed-cell-dot" style="color:rgba(255,255,255,0.5);font-size:14px">&#9632;</span>';
    } else if (v && v.tunnel) {
      // Tunnel cell
      var isSelected = (editor.selectedTunnel === i);
      cell.style.background = 'linear-gradient(135deg,#3D3548,#252030)';
      cell.style.borderColor = isSelected ? '#FFD080' : '#6A6070';
      if (isSelected) cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.5)';
      var arrow = TUNNEL_DIR_ARROWS[v.dir] || '\u25BC';
      var count = v.contents ? v.contents.length : 0;
      cell.innerHTML = '<span class="ed-cell-dot" style="color:#FFD080;font-size:13px">' + arrow +
        '</span><span class="ed-tunnel-badge">' + count + '</span>';
    } else if (v && v.ci >= 0) {
      var bt = getBoxType(v.type);
      var st = bt.editorCellStyle(v.ci);
      cell.style.background = st.background;
      cell.style.borderColor = st.borderColor;
      cell.innerHTML = bt.editorCellHTML(v.ci);
    } else {
      cell.style.background = 'rgba(180,165,145,0.25)';
      cell.style.borderColor = 'rgba(160,140,120,0.3)';
    }
    // Pick-first ghost while placing a pin
    if (editor.pinMode && editor.pinPickFirst === i) {
      cell.style.boxShadow = '0 0 0 2px rgba(200,206,220,0.9)';
    }
    // Key marker overlay
    if (keyCells[i]) {
      var kb = document.createElement('span');
      kb.className = 'ed-key-badge';
      kb.textContent = '⚿'; // key glyph
      cell.appendChild(kb);
    }
    cell.setAttribute('data-idx', i);
    cell.addEventListener('click', editorCellClick);
    cell.addEventListener('contextmenu', editorCellErase);
    el.appendChild(cell);
  }
  // Pin bar overlays — append after cells so they layer above
  for (var pi2 = 0; pi2 < editor.pins.length; pi2++) {
    var pn = editor.pins[pi2];
    if (!pn.cells || pn.cells.length < 2) continue;
    var first = pn.cells[0], last = pn.cells[pn.cells.length - 1];
    var r1 = Math.floor(first / 7), c1 = first % 7;
    var r2 = Math.floor(last / 7), c2 = last % 7;
    var overlay = document.createElement('div');
    overlay.className = 'ed-pin-overlay' + (editor.selectedPin === pi2 ? ' selected' : '');
    overlay.setAttribute('data-pin', pi2);
    if (pn.orient === 'h') {
      overlay.style.gridRow = (r1 + 1) + '';
      overlay.style.gridColumn = (Math.min(c1, c2) + 1) + ' / span ' + (Math.abs(c2 - c1) + 1);
      overlay.classList.add('horiz');
    } else {
      overlay.style.gridColumn = (c1 + 1) + '';
      overlay.style.gridRow = (Math.min(r1, r2) + 1) + ' / span ' + (Math.abs(r2 - r1) + 1);
      overlay.classList.add('vert');
    }
    overlay.addEventListener('click', editorPinOverlayClick);
    el.appendChild(overlay);
  }
}

function editorPinOverlayClick(e) {
  e.stopPropagation();
  var pi = parseInt(e.currentTarget.getAttribute('data-pin'));
  editor.selectedPin = pi;
  editor.selectedTunnel = -1;
  editor.pinMode = true;
  editor.tunnelMode = false;
  editor.wallMode = false;
  editor.pinPickFirst = -1;
  editorRenderGrid();
  editorRenderToolbar();
  editorRenderPinPanel();
  editorRenderTunnelPanel();
}

function editorCellClick(e) {
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));

  if (editor.pinMode) {
    // Pin placement: pick two endpoint cells.
    // If clicked cell already belongs to a placed pin → select that pin.
    var hitPin = editorPinAtCell(idx);
    if (hitPin >= 0) {
      editor.selectedPin = hitPin;
      editor.pinPickFirst = -1;
      editorRenderGrid();
      editorRenderPinPanel();
      return;
    }
    if (editor.pinPickFirst < 0) {
      editor.pinPickFirst = idx;
      editorRenderGrid();
      editorShowToast('Pick the other endpoint');
      return;
    }
    var ok = editorTryPlacePin(editor.pinPickFirst, idx);
    if (!ok) {
      // Restart pick from this cell
      editor.pinPickFirst = idx;
      editorRenderGrid();
      editorShowToast('Pick a cell ' + (editor.pinSize - 1) + ' away in same row/col');
      return;
    }
    editor.pinPickFirst = -1;
    editorRenderGrid();
    editorRenderPinPanel();
    editorUpdateStats();
    return;
  }

  if (editor.wallMode) {
    // Wall placement mode
    var existing = editor.grid[idx];
    if (existing && existing.wall) {
      // Toggle off: clicking existing wall removes it
      editor.grid[idx] = null;
    } else {
      // Place wall
      editor.grid[idx] = { wall: true };
    }
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    editorRenderGrid();
    editorUpdateStats();
    editorRenderTunnelPanel();
    return;
  }

  if (editor.tunnelMode) {
    // In tunnel mode: place or select tunnel
    var existing = editor.grid[idx];
    if (existing && existing.tunnel) {
      editor.selectedTunnel = idx;
    } else if (editor.activeColor === -1) {
      editor.grid[idx] = null;
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    } else {
      editor.grid[idx] = { tunnel: true, dir: editor.tunnelDir, contents: [] };
      editor.selectedTunnel = idx;
    }
  } else {
    // Normal box painting mode
    if (editor.activeColor === -1) {
      editor.grid[idx] = null;
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    } else {
      var existing = editor.grid[idx];
      if (existing && !existing.tunnel && !existing.wall && existing.ci === editor.activeColor && existing.type === editor.activeType) {
        editor.grid[idx] = null;
      } else {
        editor.grid[idx] = { ci: editor.activeColor, type: editor.activeType };
      }
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    }
  }
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
}

function editorCellErase(e) {
  e.preventDefault();
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  editor.grid[idx] = null;
  if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  editorRemovePinsTouchingCell(idx);
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderPinPanel();
}

// ── Toolbar: mode toggle + type selector + color/direction palette ──
function editorRenderToolbar() {
  var el = document.getElementById('ed-toolbar');
  el.innerHTML = '';

  // Mode row: Box types + Wall + Tunnel toggle
  var typeRow = document.createElement('div');
  typeRow.className = 'ed-type-row';

  // Box type buttons
  for (var t = 0; t < BoxTypeOrder.length; t++) {
    var id = BoxTypeOrder[t];
    var bt = BoxTypes[id];
    var tb = document.createElement('button');
    tb.className = 'ed-type-btn' + (!editor.tunnelMode && !editor.wallMode && !editor.pinMode && editor.activeType === id ? ' active' : '');
    tb.textContent = bt.label;
    tb.setAttribute('data-type', id);
    tb.addEventListener('click', function () {
      editor.activeType = this.getAttribute('data-type');
      editor.tunnelMode = false;
      editor.wallMode = false;
      editor.pinMode = false;
      editor.pinPickFirst = -1;
      editorRenderToolbar();
      editorRenderTunnelPanel();
      editorRenderPinPanel();
      editorRenderGrid();
    });
    typeRow.appendChild(tb);
  }

  // Wall mode button
  var wallBtn = document.createElement('button');
  wallBtn.className = 'ed-type-btn' + (editor.wallMode ? ' active' : '');
  wallBtn.textContent = '\u25A0 Wall';
  wallBtn.style.borderColor = editor.wallMode ? 'rgba(138,125,107,0.6)' : '';
  wallBtn.style.color = editor.wallMode ? '#6F6355' : '';
  wallBtn.addEventListener('click', function () {
    editor.wallMode = true;
    editor.tunnelMode = false;
    editor.pinMode = false;
    editor.pinPickFirst = -1;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderPinPanel();
    editorRenderGrid();
  });
  typeRow.appendChild(wallBtn);

  // Tunnel mode button
  var tunnelBtn = document.createElement('button');
  tunnelBtn.className = 'ed-type-btn' + (editor.tunnelMode ? ' active' : '');
  tunnelBtn.textContent = '\uD83D\uDD73 Tunnel';
  tunnelBtn.style.borderColor = editor.tunnelMode ? 'rgba(255,190,80,0.6)' : '';
  tunnelBtn.style.color = editor.tunnelMode ? '#E8A84C' : '';
  tunnelBtn.addEventListener('click', function () {
    editor.tunnelMode = true;
    editor.wallMode = false;
    editor.pinMode = false;
    editor.pinPickFirst = -1;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderPinPanel();
    editorRenderGrid();
  });
  typeRow.appendChild(tunnelBtn);

  // Pin 2 + Pin 3 mode buttons
  var pin2Btn = document.createElement('button');
  pin2Btn.className = 'ed-type-btn' + (editor.pinMode && editor.pinSize === 2 ? ' active' : '');
  pin2Btn.textContent = '\u2696 Pin 2\u00D7';
  pin2Btn.style.borderColor = (editor.pinMode && editor.pinSize === 2) ? 'rgba(110,118,130,0.6)' : '';
  pin2Btn.style.color = (editor.pinMode && editor.pinSize === 2) ? '#5E6672' : '';
  pin2Btn.addEventListener('click', function () {
    editor.pinMode = true; editor.pinSize = 2;
    editor.wallMode = false; editor.tunnelMode = false;
    editor.pinPickFirst = -1;
    editorRenderToolbar();
    editorRenderPinPanel();
    editorRenderTunnelPanel();
    editorRenderGrid();
  });
  typeRow.appendChild(pin2Btn);

  var pin3Btn = document.createElement('button');
  pin3Btn.className = 'ed-type-btn' + (editor.pinMode && editor.pinSize === 3 ? ' active' : '');
  pin3Btn.textContent = '\u2696 Pin 3\u00D7';
  pin3Btn.style.borderColor = (editor.pinMode && editor.pinSize === 3) ? 'rgba(110,118,130,0.6)' : '';
  pin3Btn.style.color = (editor.pinMode && editor.pinSize === 3) ? '#5E6672' : '';
  pin3Btn.addEventListener('click', function () {
    editor.pinMode = true; editor.pinSize = 3;
    editor.wallMode = false; editor.tunnelMode = false;
    editor.pinPickFirst = -1;
    editorRenderToolbar();
    editorRenderPinPanel();
    editorRenderTunnelPanel();
    editorRenderGrid();
  });
  typeRow.appendChild(pin3Btn);

  el.appendChild(typeRow);

  if (editor.tunnelMode) {
    // Direction selector row
    var dirRow = document.createElement('div');
    dirRow.className = 'ed-color-row';

    // Eraser
    var eraser = document.createElement('button');
    eraser.className = 'ed-tool' + (editor.activeColor === -1 ? ' active' : '');
    eraser.style.background = 'rgba(180,165,145,0.5)';
    eraser.innerHTML = '\u2716';
    eraser.title = 'Eraser';
    eraser.addEventListener('click', function () { editor.activeColor = -1; editorRenderToolbar(); });
    dirRow.appendChild(eraser);

    var dirs = ['top', 'left', 'bottom', 'right'];
    var dirLabels = ['\u25B2', '\u25C0', '\u25BC', '\u25B6'];
    for (var d = 0; d < dirs.length; d++) {
      var db = document.createElement('button');
      db.className = 'ed-tool' + (editor.tunnelDir === dirs[d] && editor.activeColor !== -1 ? ' active' : '');
      db.style.background = 'linear-gradient(135deg,#3D3548,#252030)';
      db.style.color = '#FFD080';
      db.style.fontSize = '16px';
      db.innerHTML = dirLabels[d];
      db.title = dirs[d];
      db.setAttribute('data-dir', dirs[d]);
      db.addEventListener('click', function () {
        editor.tunnelDir = this.getAttribute('data-dir');
        editor.activeColor = 0;
        editorRenderToolbar();
      });
      dirRow.appendChild(db);
    }
    el.appendChild(dirRow);
  } else if (editor.wallMode) {
    // Wall mode: just show info hint
    var wallInfo = document.createElement('div');
    wallInfo.className = 'ed-color-row';
    wallInfo.innerHTML = '<span style="font-size:11px;color:#9C8A70">Click cells to place/remove walls</span>';
    el.appendChild(wallInfo);
  } else if (editor.pinMode) {
    var pinInfo = document.createElement('div');
    pinInfo.className = 'ed-color-row';
    var hint = (editor.pinPickFirst < 0)
      ? 'Click the first endpoint cell'
      : 'Click the other endpoint (' + (editor.pinSize - 1) + ' away)';
    pinInfo.innerHTML = '<span style="font-size:11px;color:#9C8A70">' + hint + ' &middot; click existing bar to edit</span>';
    el.appendChild(pinInfo);
  } else {
    // Color palette: eraser + 8 colors
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
}

// ── Tunnel contents editor panel ──
function editorRenderTunnelPanel() {
  var container = document.getElementById('ed-tunnel-panel');
  if (!container) return;

  if (editor.selectedTunnel < 0 || !editor.grid[editor.selectedTunnel] || !editor.grid[editor.selectedTunnel].tunnel) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  var tunnel = editor.grid[editor.selectedTunnel];
  var html = '';

  // Direction selector
  html += '<div class="ed-section-title"><span class="icon">\uD83D\uDD73</span> Tunnel #' + (editor.selectedTunnel + 1) + ' — Direction</div>';
  html += '<div class="ed-tunnel-dir-row">';
  var dirs = ['top', 'left', 'bottom', 'right'];
  var dirLabels = ['\u25B2 Up', '\u25C0 Left', '\u25BC Down', '\u25B6 Right'];
  for (var d = 0; d < dirs.length; d++) {
    var active = tunnel.dir === dirs[d] ? ' active' : '';
    html += '<button class="ed-tunnel-dir-btn' + active + '" data-dir="' + dirs[d] + '">' + dirLabels[d] + '</button>';
  }
  html += '</div>';

  // Exit tile info
  var row = Math.floor(editor.selectedTunnel / 7);
  var col = editor.selectedTunnel % 7;
  var er = row, ec = col;
  if (tunnel.dir === 'top') er = row - 1;
  else if (tunnel.dir === 'bottom') er = row + 1;
  else if (tunnel.dir === 'left') ec = col - 1;
  else if (tunnel.dir === 'right') ec = col + 1;
  var exitValid = (er >= 0 && er < 7 && ec >= 0 && ec < 7);
  if (!exitValid) {
    html += '<div class="ed-stat-warn" style="margin:4px 0">Exit points outside the grid!</div>';
  } else {
    var exitIdx = er * 7 + ec;
    var exitCell = editor.grid[exitIdx];
    if (exitCell && !exitCell.tunnel) {
      html += '<div class="ed-stat-warn" style="margin:4px 0">Exit tile is occupied by a box</div>';
    } else if (exitCell && exitCell.tunnel) {
      html += '<div class="ed-stat-warn" style="margin:4px 0">Exit tile is another tunnel</div>';
    }
  }

  // Contents list
  html += '<div class="ed-section-title" style="margin-top:8px"><span class="icon">\uD83D\uDCE6</span> Stored Boxes (' + tunnel.contents.length + ')</div>';
  html += '<div class="ed-tunnel-contents">';
  if (tunnel.contents.length === 0) {
    html += '<span style="font-size:11px;color:#9C8A70;font-style:italic">Empty — add boxes below</span>';
  } else {
    for (var ci2 = 0; ci2 < tunnel.contents.length; ci2++) {
      var item = tunnel.contents[ci2];
      var c = COLORS[item.ci];
      var typeLabel = (BoxTypes[item.type] || BoxTypes[BoxTypeOrder[0]]).label;
      html += '<span class="ed-tunnel-item" data-cidx="' + ci2 + '" title="' + CLR_NAMES[item.ci] + ' ' + typeLabel + ' — click to remove" style="background:' + c.fill + '">';
      html += '<span style="font-size:8px;opacity:0.7">' + typeLabel[0] + '</span>';
      html += '</span>';
    }
  }
  html += '</div>';

  // Add box controls
  html += '<div class="ed-section-title" style="margin-top:8px"><span class="icon">&#10133;</span> Add Box to Tunnel</div>';
  html += '<div class="ed-tunnel-add-row">';
  html += '<select id="ed-tunnel-add-type" class="ed-tunnel-select">';
  for (var t = 0; t < BoxTypeOrder.length; t++) {
    html += '<option value="' + BoxTypeOrder[t] + '">' + BoxTypes[BoxTypeOrder[t]].label + '</option>';
  }
  html += '</select>';
  html += '</div>';
  html += '<div class="ed-tunnel-add-colors">';
  for (var ci3 = 0; ci3 < NUM_COLORS; ci3++) {
    html += '<button class="ed-tunnel-add-clr" data-ci="' + ci3 + '" style="background:' + COLORS[ci3].fill + '" title="Add ' + CLR_NAMES[ci3] + '">' + CLR_NAMES[ci3][0].toUpperCase() + '</button>';
  }
  html += '</div>';

  if (tunnel.contents.length > 0) {
    html += '<div style="text-align:center;margin-top:6px"><button class="ed-qbtn" id="ed-tunnel-clear">Clear All</button></div>';
  }

  container.innerHTML = html;

  // Bind events
  var dirBtns = container.querySelectorAll('.ed-tunnel-dir-btn');
  for (var d2 = 0; d2 < dirBtns.length; d2++) {
    dirBtns[d2].addEventListener('click', function () {
      if (editor.selectedTunnel >= 0 && editor.grid[editor.selectedTunnel]) {
        editor.grid[editor.selectedTunnel].dir = this.getAttribute('data-dir');
        editorRenderGrid();
        editorRenderTunnelPanel();
        editorUpdateStats();
      }
    });
  }

  var items = container.querySelectorAll('.ed-tunnel-item');
  for (var it = 0; it < items.length; it++) {
    items[it].addEventListener('click', function () {
      var cidx = parseInt(this.getAttribute('data-cidx'));
      if (editor.selectedTunnel >= 0 && editor.grid[editor.selectedTunnel]) {
        editor.grid[editor.selectedTunnel].contents.splice(cidx, 1);
        editorRenderGrid();
        editorRenderTunnelPanel();
        editorUpdateStats();
      }
    });
  }

  var addClrs = container.querySelectorAll('.ed-tunnel-add-clr');
  for (var ac = 0; ac < addClrs.length; ac++) {
    addClrs[ac].addEventListener('click', function () {
      var ci4 = parseInt(this.getAttribute('data-ci'));
      var typeEl = document.getElementById('ed-tunnel-add-type');
      var type = typeEl ? typeEl.value : 'default';
      if (editor.selectedTunnel >= 0 && editor.grid[editor.selectedTunnel]) {
        editor.grid[editor.selectedTunnel].contents.push({ ci: ci4, type: type });
        editorRenderGrid();
        editorRenderTunnelPanel();
        editorUpdateStats();
      }
    });
  }

  var clearBtn = document.getElementById('ed-tunnel-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (editor.selectedTunnel >= 0 && editor.grid[editor.selectedTunnel]) {
        editor.grid[editor.selectedTunnel].contents = [];
        editorRenderGrid();
        editorRenderTunnelPanel();
        editorUpdateStats();
      }
    });
  }
}

// ── Pin helpers ──
function editorPinAtCell(idx) {
  for (var i = 0; i < editor.pins.length; i++) {
    var p = editor.pins[i];
    if (p.cells.indexOf(idx) >= 0) return i;
  }
  return -1;
}

function editorRemovePinsTouchingCell(idx) {
  var kept = [];
  var droppedAny = false;
  for (var i = 0; i < editor.pins.length; i++) {
    var p = editor.pins[i];
    if (p.cells.indexOf(idx) >= 0 || p.keyA === idx || p.keyB === idx) {
      droppedAny = true;
      continue;
    }
    kept.push(p);
  }
  editor.pins = kept;
  if (droppedAny) editor.selectedPin = -1;
}

function editorPinKeyCandidates(cells) {
  // For each endpoint, return candidate cell indices (cardinal neighbors
  // not inside the bar's cells). Order: outward-along-axis first.
  var first = cells[0], last = cells[cells.length - 1];
  var r1 = Math.floor(first / 7), c1 = first % 7;
  var r2 = Math.floor(last / 7), c2 = last % 7;
  var orient = (r1 === r2) ? 'h' : 'v';
  function cardinalsExcluding(idx, excludeSet) {
    var row = Math.floor(idx / 7), col = idx % 7;
    var out = [];
    var raw = [];
    if (row > 0)        raw.push((row - 1) * 7 + col);
    if (row < 6)        raw.push((row + 1) * 7 + col);
    if (col > 0)        raw.push(row * 7 + (col - 1));
    if (col < 6)        raw.push(row * 7 + (col + 1));
    for (var i = 0; i < raw.length; i++) if (excludeSet.indexOf(raw[i]) < 0) out.push(raw[i]);
    return out;
  }
  function outwardFirst(idx, isFirst) {
    var row = Math.floor(idx / 7), col = idx % 7;
    var outward;
    if (orient === 'h') outward = isFirst ? (col > 0 ? row * 7 + (col - 1) : -1) : (col < 6 ? row * 7 + (col + 1) : -1);
    else outward = isFirst ? (row > 0 ? (row - 1) * 7 + col : -1) : (row < 6 ? (row + 1) * 7 + col : -1);
    var all = cardinalsExcluding(idx, cells);
    if (outward >= 0) {
      var i = all.indexOf(outward);
      if (i > 0) { all.splice(i, 1); all.unshift(outward); }
    }
    return all;
  }
  return {
    A: outwardFirst(first, true),
    B: outwardFirst(last, false)
  };
}

function editorTryPlacePin(firstIdx, secondIdx) {
  if (firstIdx === secondIdx) return false;
  var r1 = Math.floor(firstIdx / 7), c1 = firstIdx % 7;
  var r2 = Math.floor(secondIdx / 7), c2 = secondIdx % 7;
  var size = editor.pinSize;
  if (r1 === r2) {
    if (Math.abs(c2 - c1) !== size - 1) return false;
    var lo = Math.min(c1, c2), hi = Math.max(c1, c2);
    var cells = [];
    for (var c = lo; c <= hi; c++) cells.push(r1 * 7 + c);
    var cands = editorPinKeyCandidates(cells);
    if (!cands.A.length || !cands.B.length) {
      editorShowToast('Pin endpoints need adjacent cells in the grid');
      return false;
    }
    editor.pins.push({
      cells: cells, orient: 'h',
      keyA: cands.A[0], keyB: cands.B[0] === cands.A[0] ? (cands.B[1] != null ? cands.B[1] : cands.B[0]) : cands.B[0]
    });
  } else if (c1 === c2) {
    if (Math.abs(r2 - r1) !== size - 1) return false;
    var loR = Math.min(r1, r2), hiR = Math.max(r1, r2);
    var cellsV = [];
    for (var rr = loR; rr <= hiR; rr++) cellsV.push(rr * 7 + c1);
    var candsV = editorPinKeyCandidates(cellsV);
    if (!candsV.A.length || !candsV.B.length) {
      editorShowToast('Pin endpoints need adjacent cells in the grid');
      return false;
    }
    editor.pins.push({
      cells: cellsV, orient: 'v',
      keyA: candsV.A[0], keyB: candsV.B[0] === candsV.A[0] ? (candsV.B[1] != null ? candsV.B[1] : candsV.B[0]) : candsV.B[0]
    });
  } else {
    return false;
  }
  editor.selectedPin = editor.pins.length - 1;
  return true;
}

function editorCellLabel(idx) {
  var v = editor.grid[idx];
  var rr = Math.floor(idx / 7) + 1, cc = (idx % 7) + 1;
  var coord = '(' + rr + ',' + cc + ')';
  if (!v) return coord + ' empty';
  if (v.wall) return coord + ' wall';
  if (v.tunnel) return coord + ' tunnel';
  var bt = (BoxTypes[v.type] || BoxTypes[BoxTypeOrder[0]]);
  return coord + ' ' + (CLR_NAMES[v.ci] || 'color' + v.ci) + ' ' + bt.label.toLowerCase();
}

function editorCellIsValidKey(idx) {
  var v = editor.grid[idx];
  if (!v) return false;
  if (v.wall) return false;
  if (v.tunnel) return false;
  return true;
}

function editorRenderPinPanel() {
  var container = document.getElementById('ed-pin-panel');
  if (!container) return;

  if (!editor.pinMode || editor.selectedPin < 0 || !editor.pins[editor.selectedPin]) {
    container.style.display = 'none';
    return;
  }

  var p = editor.pins[editor.selectedPin];
  container.style.display = 'block';

  var html = '';
  html += '<div class="ed-section-title"><span class="icon">⚖</span> Pin ' + p.cells.length + '× ' +
          (p.orient === 'h' ? '(horizontal)' : '(vertical)') + '</div>';

  // Cells covered
  var coveredLabels = [];
  for (var k = 0; k < p.cells.length; k++) coveredLabels.push(editorCellLabel(p.cells[k]));
  html += '<div style="font-size:11px;color:#5A4A38;margin:2px 0 8px"><strong>Covers:</strong> ' + coveredLabels.join(' &middot; ') + '</div>';

  // Key dropdowns
  var cands = editorPinKeyCandidates(p.cells);
  var ends = [
    { lbl: 'Key for end A', value: p.keyA, opts: cands.A, attr: 'A' },
    { lbl: 'Key for end B', value: p.keyB, opts: cands.B, attr: 'B' }
  ];
  for (var e = 0; e < ends.length; e++) {
    var end = ends[e];
    html += '<div class="ed-pin-key-row"><label>' + end.lbl + '</label>';
    html += '<select class="ed-tunnel-select ed-pin-key-select" data-end="' + end.attr + '">';
    for (var oi = 0; oi < end.opts.length; oi++) {
      var optIdx = end.opts[oi];
      var sel = (optIdx === end.value) ? ' selected' : '';
      html += '<option value="' + optIdx + '"' + sel + '>' + editorCellLabel(optIdx) + '</option>';
    }
    html += '</select></div>';
  }

  // Warnings
  var warn = '';
  if (p.keyA === p.keyB) warn = 'Both ends point at the same cell';
  if (!warn && !editorCellIsValidKey(p.keyA)) warn = 'End A key is not a tappable box';
  if (!warn && !editorCellIsValidKey(p.keyB)) warn = 'End B key is not a tappable box';
  if (!warn) {
    for (var ck = 0; ck < p.cells.length; ck++) {
      var v = editor.grid[p.cells[ck]];
      if (!v || v.wall || v.tunnel) { warn = 'Covered cell ' + editorCellLabel(p.cells[ck]) + ' has no box'; break; }
    }
  }
  if (warn) html += '<div class="ed-stat-warn" style="margin:6px 0">' + warn + '</div>';

  // Delete button
  html += '<div style="text-align:center;margin-top:6px"><button class="ed-qbtn" id="ed-pin-delete">Delete pin</button></div>';

  container.innerHTML = html;

  // Bind events
  var sels = container.querySelectorAll('.ed-pin-key-select');
  for (var s2 = 0; s2 < sels.length; s2++) {
    sels[s2].addEventListener('change', function () {
      var endAttr = this.getAttribute('data-end');
      var val = parseInt(this.value);
      if (editor.selectedPin < 0 || !editor.pins[editor.selectedPin]) return;
      if (endAttr === 'A') editor.pins[editor.selectedPin].keyA = val;
      else editor.pins[editor.selectedPin].keyB = val;
      editorRenderGrid();
      editorRenderPinPanel();
    });
  }
  var delBtn = document.getElementById('ed-pin-delete');
  if (delBtn) {
    delBtn.addEventListener('click', function () {
      editor.pins.splice(editor.selectedPin, 1);
      editor.selectedPin = -1;
      editorRenderGrid();
      editorRenderPinPanel();
      editorUpdateStats();
    });
  }
}

// ── Quick actions ──
function editorFillRandom() {
  for (var i = 0; i < 49; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  var cl = [];
  for (var c = 0; c < 4; c++) for (var n = 0; n < 6; n++) cl.push(c);
  shuffle(cl);
  var indices = []; for (var i = 0; i < 49; i++) indices.push(i);
  shuffle(indices);
  for (var i = 0; i < cl.length; i++) editor.grid[indices[i]] = { ci: cl[i], type: 'default' };
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel();
}

function editorClearAll() {
  for (var i = 0; i < 49; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel();
}

// ── Stats ──
function editorUpdateStats() {
  var counts = [];
  var regularMrb = [];
  for (var c = 0; c < NUM_COLORS; c++) { counts.push(0); regularMrb.push(0); }
  var total = 0, typeCounts = {}, totalBlockers = 0;
  var tunnelCount = 0, tunnelBoxCount = 0;
  var wallCount = 0;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (!v) continue;
    if (v.wall) {
      wallCount++;
      continue;
    }
    if (v.tunnel) {
      tunnelCount++;
      if (v.contents) {
        tunnelBoxCount += v.contents.length;
        for (var tc = 0; tc < v.contents.length; tc++) {
          var tItem = v.contents[tc];
          counts[tItem.ci]++;
          if (tItem.type === 'blocker') {
            regularMrb[tItem.ci] += Math.max(0, editor.mrbPerBox - BLOCKER_PER_BOX);
            totalBlockers += BLOCKER_PER_BOX;
          } else {
            regularMrb[tItem.ci] += editor.mrbPerBox;
          }
        }
      }
      continue;
    }
    if (v.ci >= 0) {
      counts[v.ci]++;
      total++;
      typeCounts[v.type] = (typeCounts[v.type] || 0) + 1;
      if (v.type === 'blocker') {
        regularMrb[v.ci] += Math.max(0, editor.mrbPerBox - BLOCKER_PER_BOX);
        totalBlockers += BLOCKER_PER_BOX;
      } else {
        regularMrb[v.ci] += editor.mrbPerBox;
      }
    }
  }
  var el = document.getElementById('ed-stats');
  var html = '<span class="ed-stat-total">' + total + ' boxes</span>';
  for (var t = 0; t < BoxTypeOrder.length; t++) {
    var tid = BoxTypeOrder[t];
    if (typeCounts[tid]) {
      html += '<span class="ed-stat-chip" style="background:' + BoxTypes[tid].editorColor + '">' + typeCounts[tid] + ' ' + BoxTypes[tid].label.toLowerCase() + '</span>';
    }
  }
  if (wallCount > 0) {
    html += '<span class="ed-stat-chip" style="background:#8A7D6B">' + wallCount + ' wall' + (wallCount > 1 ? 's' : '') + '</span>';
  }
  if (tunnelCount > 0) {
    html += '<span class="ed-stat-chip" style="background:#3D3548;border:1px solid #6A6070">' + tunnelCount + ' tunnel' + (tunnelCount > 1 ? 's' : '') + ' (' + tunnelBoxCount + ' stored)</span>';
  }
  if (editor.pins && editor.pins.length > 0) {
    html += '<span class="ed-stat-chip" style="background:#8A92A0;border:1px solid #6E7682">' + editor.pins.length + ' pin' + (editor.pins.length > 1 ? 's' : '') + '</span>';
  }
  if (totalBlockers > 0) {
    html += '<span class="ed-stat-chip" style="background:' + COLORS[BLOCKER_CI].fill + '">' + totalBlockers + ' blocker mrb</span>';
  }
  for (var c = 0; c < NUM_COLORS; c++) {
    if (counts[c] > 0) html += '<span class="ed-stat-chip" style="background:' + COLORS[c].fill + '">' + counts[c] + '</span>';
  }
  var warn = '';
  var totalAll = total + tunnelBoxCount;
  if (totalAll === 0) {
    warn = 'Place some boxes to create a level';
  } else {
    for (var c = 0; c < NUM_COLORS; c++) {
      if (regularMrb[c] > 0) {
        if (regularMrb[c] % editor.sortCap !== 0) {
          warn = CLR_NAMES[c] + ' regular marbles (' + regularMrb[c] + ') not divisible by sort cap (' + editor.sortCap + ')';
          break;
        }
      }
    }
    if (!warn && totalBlockers > 0 && totalBlockers % 3 !== 0) {
      warn = 'Total blocker marbles (' + totalBlockers + ') must be a multiple of 3';
    }
  }
  if (warn) html += '<span class="ed-stat-warn">' + warn + '</span>';
  el.innerHTML = html;
}

// ── Settings ──
function editorRenderSettings() {
  var el = document.getElementById('ed-settings-body');
  el.innerHTML = '';
  var fields = [
    { label: 'Marbles/Box', key: 'mrbPerBox', min: 1, max: 25, step: 1 },
    { label: 'Sort Cap', key: 'sortCap', min: 1, max: 9, step: 1 },
    { label: 'Lock Btns', key: 'lockButtons', min: 0, max: 5, step: 1 }
  ];
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var row = document.createElement('div');
    row.className = 'ed-setting-row';
    row.innerHTML = '<label>' + f.label + '</label>' +
      '<input type="range" id="ed-s-' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + editor[f.key] + '">' +
      '<span class="ed-s-val" id="ed-s-' + f.key + '-v">' + editor[f.key] + '</span>';
    el.appendChild(row);
  }
  for (var i = 0; i < fields.length; i++) {
    (function (f) {
      var sl = document.getElementById('ed-s-' + f.key);
      var vl = document.getElementById('ed-s-' + f.key + '-v');
      sl.addEventListener('input', function () {
        editor[f.key] = parseInt(sl.value);
        vl.textContent = sl.value;
        editorUpdateStats();
      });
    })(fields[i]);
  }
}

// ── Build level definition ──
function editorBuildLevel() {
  var pinsOut = [];
  for (var i = 0; i < editor.pins.length; i++) {
    var p = editor.pins[i];
    pinsOut.push({
      cells: p.cells.slice(),
      orient: p.orient,
      keyA: p.keyA, keyB: p.keyB
    });
  }
  return {
    name: editor.name, desc: editor.desc,
    mrbPerBox: editor.mrbPerBox, sortCap: editor.sortCap,
    lockButtons: editor.lockButtons,
    grid: editor.grid.slice(),
    pins: pinsOut
  };
}

// ── Test play ──
function editorTestPlay() {
  var total = 0;
  for (var i = 0; i < 49; i++) if (editor.grid[i]) total++;
  if (total === 0) { editorShowToast('Place some boxes first!'); return; }
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
      if (lvl.grid && lvl.grid.length === 49) {
        for (var i = 0; i < 49; i++) {
          var cell = lvl.grid[i];
          if (cell === null || cell === undefined || cell === -1) editor.grid[i] = null;
          else if (typeof cell === 'number') editor.grid[i] = cell >= 0 ? { ci: cell, type: 'default' } : null;
          else if (cell.wall) editor.grid[i] = { wall: true };
          else if (cell.tunnel) editor.grid[i] = { tunnel: true, dir: cell.dir || 'bottom', contents: cell.contents || [] };
          else editor.grid[i] = cell;
        }
      }
      if (lvl.mrbPerBox) editor.mrbPerBox = lvl.mrbPerBox;
      if (lvl.sortCap) editor.sortCap = lvl.sortCap;
      if (lvl.lockButtons !== undefined) editor.lockButtons = lvl.lockButtons;
      editor.pins = [];
      if (lvl.pins && lvl.pins.length) {
        for (var pi = 0; pi < lvl.pins.length; pi++) {
          var lp = lvl.pins[pi];
          if (!lp.cells || lp.cells.length < 2) continue;
          var orient = lp.orient ||
            ((Math.abs(lp.cells[1] - lp.cells[0]) === 1) ? 'h' : 'v');
          editor.pins.push({
            cells: lp.cells.slice(), orient: orient,
            keyA: lp.keyA, keyB: lp.keyB
          });
        }
      }
      editor.selectedPin = -1;
      if (lvl.name) editor.name = lvl.name;
      if (lvl.desc) editor.desc = lvl.desc;
      var nameEl = document.getElementById('ed-name');
      var descEl = document.getElementById('ed-desc');
      if (nameEl) nameEl.value = editor.name;
      if (descEl) descEl.value = editor.desc;
      editor.selectedTunnel = -1;
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

// ── Save as Showcase (generates prototype.json content) ──
function editorSaveShowcase() {
  var total = 0;
  for (var i = 0; i < 49; i++) if (editor.grid[i]) total++;
  if (total === 0) { editorShowToast('Place some boxes first!'); return; }

  var level = editorBuildLevel();
  var proto = {
    name: '',
    description: '',
    howToPlay: '',
    author: '',
    showcaseLevel: level
  };

  // Pre-fill from existing prototype.json if loaded
  if (typeof prototypeInfo !== 'undefined' && prototypeInfo) {
    if (prototypeInfo.name) proto.name = prototypeInfo.name;
    if (prototypeInfo.description) proto.description = prototypeInfo.description;
    if (prototypeInfo.howToPlay) proto.howToPlay = prototypeInfo.howToPlay;
    if (prototypeInfo.author) proto.author = prototypeInfo.author;
  }

  var json = JSON.stringify(proto, null, 2);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(json).then(function() {
      editorShowToast('prototype.json copied to clipboard!');
    }).catch(function() {
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
