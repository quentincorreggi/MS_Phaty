// ============================================================
// editor.js — Level Editor (reads box types from registry)
//             + Tunnel placement, orientation, contents editing
//             + Wall placement
// ============================================================

var editor = {
  grid: [],            // 7x7: null = empty, { ci, type } or { tunnel: true, ... } or { wall: true } or { replacer: true, ci, count, covered }
  name: 'Custom Level',
  desc: 'My custom level',
  mrbPerBox: 9,
  sortCap: 3,
  lockButtons: 0,
  activeColor: 0,      // -1=eraser, 0-7=color
  activeType: BoxTypeOrder[0],
  tunnelMode: false,
  tunnelDir: 'bottom',
  selectedTunnel: -1,
  wallMode: false,
  replacerMode: false,
  selectedReplacer: -1,
  visible: false
};

function editorInit() {
  editor.grid = [];
  for (var i = 0; i < 49; i++) editor.grid.push(null);
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
  editor.replacerMode = false;
  editor.selectedReplacer = -1;
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
  editorRenderReplacerPanel();
}

// ── Grid ──
function editorRenderGrid() {
  var el = document.getElementById('ed-grid');
  el.innerHTML = '';
  for (var i = 0; i < 49; i++) {
    var cell = document.createElement('div');
    cell.className = 'ed-cell';
    var v = editor.grid[i];
    if (v && v.wall) {
      // Wall cell
      cell.style.background = 'linear-gradient(135deg,#9A8D7B,#6F6355)';
      cell.style.borderColor = '#8A7D6B';
      cell.innerHTML = '<span class="ed-cell-dot" style="color:rgba(255,255,255,0.5);font-size:14px">&#9632;</span>';
    } else if (v && v.replacer) {
      var isSelectedR = (editor.selectedReplacer === i);
      var rc = COLORS[v.ci || 0];
      cell.style.background = 'linear-gradient(135deg,#52525E,#2C2C36)';
      cell.style.borderColor = isSelectedR ? '#FFD080' : '#3F3F4A';
      if (isSelectedR) cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.55)';
      cell.innerHTML = '<span class="ed-cell-dot" style="color:#fff;font-size:14px;font-weight:700">' + (v.count || 0) + '</span>' +
        '<span class="ed-tunnel-badge" style="background:' + rc.fill + ';color:#fff">●</span>';
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
    cell.setAttribute('data-idx', i);
    cell.addEventListener('click', editorCellClick);
    cell.addEventListener('contextmenu', editorCellErase);
    el.appendChild(cell);
  }
}

function editorCellClick(e) {
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));

  if (editor.replacerMode) {
    var existing = editor.grid[idx];
    if (existing && existing.replacer) {
      // Select for editing
      editor.selectedReplacer = idx;
      editorRenderGrid();
      editorRenderReplacerPanel();
      editorUpdateStats();
      return;
    }
    // Eraser
    if (editor.activeColor === -1) {
      editor.grid[idx] = null;
      if (editor.selectedReplacer === idx) editor.selectedReplacer = -1;
      editorRenderGrid();
      editorRenderReplacerPanel();
      editorUpdateStats();
      return;
    }
    if (editor.grid[idx]) { editorShowToast('This cell is occupied — clear it first.'); return; }
    editor.grid[idx] = {
      replacer: true,
      ci: (editor.activeColor >= 0 ? editor.activeColor : 0),
      count: 3,
      covered: null
    };
    editor.selectedReplacer = idx;
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    editorRenderGrid();
    editorRenderReplacerPanel();
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
      // Place wall — clean up replacer pair if overwriting
      editorEraseAt(idx);
      editor.grid[idx] = { wall: true };
    }
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    editorRenderGrid();
    editorUpdateStats();
    editorRenderTunnelPanel();
    editorRenderReplacerPanel();
    return;
  }

  if (editor.tunnelMode) {
    // In tunnel mode: place or select tunnel
    var existing = editor.grid[idx];
    if (existing && existing.tunnel) {
      editor.selectedTunnel = idx;
    } else if (editor.activeColor === -1) {
      editorEraseAt(idx);
    } else {
      editorEraseAt(idx);
      editor.grid[idx] = { tunnel: true, dir: editor.tunnelDir, contents: [] };
      editor.selectedTunnel = idx;
    }
  } else {
    // Normal box painting mode
    if (editor.activeColor === -1) {
      editorEraseAt(idx);
    } else {
      var existing = editor.grid[idx];
      if (existing && !existing.tunnel && !existing.wall && !existing.replacer && existing.ci === editor.activeColor && existing.type === editor.activeType) {
        editor.grid[idx] = null;
      } else {
        editorEraseAt(idx);
        editor.grid[idx] = { ci: editor.activeColor, type: editor.activeType };
      }
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    }
  }
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderReplacerPanel();
}

function editorCellErase(e) {
  e.preventDefault();
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  editorEraseAt(idx);
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderReplacerPanel();
}

function editorEraseAt(idx) {
  if (editor.selectedReplacer === idx) editor.selectedReplacer = -1;
  if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  editor.grid[idx] = null;
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
    tb.className = 'ed-type-btn' + (!editor.tunnelMode && !editor.wallMode && !editor.replacerMode && editor.activeType === id ? ' active' : '');
    tb.textContent = bt.label;
    tb.setAttribute('data-type', id);
    tb.addEventListener('click', function () {
      editor.activeType = this.getAttribute('data-type');
      editor.tunnelMode = false;
      editor.wallMode = false;
      editor.replacerMode = false;
      editor.selectedReplacer = -1;
      editorRenderToolbar();
      editorRenderTunnelPanel();
      editorRenderReplacerPanel();
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
    editor.replacerMode = false;
    editor.selectedReplacer = -1;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderReplacerPanel();
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
    editor.replacerMode = false;
    editor.selectedReplacer = -1;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderReplacerPanel();
  });
  typeRow.appendChild(tunnelBtn);

  // Replacer mode button
  var replBtn = document.createElement('button');
  replBtn.className = 'ed-type-btn' + (editor.replacerMode ? ' active' : '');
  replBtn.textContent = '\u21BB Replacer';
  replBtn.style.borderColor = editor.replacerMode ? 'rgba(82,82,94,0.7)' : '';
  replBtn.style.color = editor.replacerMode ? '#3F3F4A' : '';
  replBtn.addEventListener('click', function () {
    editor.replacerMode = true;
    editor.tunnelMode = false;
    editor.wallMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderReplacerPanel();
  });
  typeRow.appendChild(replBtn);

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
  } else if (editor.replacerMode) {
    // Color palette (eraser + 8 colors) — sets the cover color for new placements
    var colorRowR = document.createElement('div');
    colorRowR.className = 'ed-color-row';
    var eraserR = document.createElement('button');
    eraserR.className = 'ed-tool' + (editor.activeColor === -1 ? ' active' : '');
    eraserR.style.background = 'rgba(180,165,145,0.5)';
    eraserR.innerHTML = '✖';
    eraserR.title = 'Eraser';
    eraserR.addEventListener('click', function () { editor.activeColor = -1; editorRenderToolbar(); });
    colorRowR.appendChild(eraserR);
    for (var ciR = 0; ciR < NUM_COLORS; ciR++) {
      var cbR = document.createElement('button');
      cbR.className = 'ed-tool' + (editor.activeColor === ciR ? ' active' : '');
      cbR.style.background = COLORS[ciR].fill;
      cbR.innerHTML = CLR_NAMES[ciR][0].toUpperCase();
      cbR.title = CLR_NAMES[ciR];
      cbR.setAttribute('data-ci', ciR);
      cbR.addEventListener('click', function () {
        editor.activeColor = parseInt(this.getAttribute('data-ci'));
        editorRenderToolbar();
      });
      colorRowR.appendChild(cbR);
    }
    el.appendChild(colorRowR);

    var rInfo = document.createElement('div');
    rInfo.className = 'ed-color-row';
    rInfo.innerHTML = '<span style="font-size:11px;color:#9C8A70">Click an empty cell to place a cover. Click an existing cover to edit it.</span>';
    el.appendChild(rInfo);
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

// ── Replacer contents editor panel ──
function editorRenderReplacerPanel() {
  var container = document.getElementById('ed-replacer-panel');
  if (!container) return;

  var idx = editor.selectedReplacer;
  if (idx < 0 || !editor.grid[idx] || !editor.grid[idx].replacer) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  var r = editor.grid[idx];
  var html = '';

  html += '<div class="ed-section-title"><span class="icon">↻</span> Replacer #' + (idx + 1) + ' — ' + CLR_NAMES[r.ci] + ' · count ' + r.count + '</div>';

  // Color buttons
  html += '<div class="ed-section-title" style="margin-top:4px"><span class="icon">🎨</span> Cover Color</div>';
  html += '<div class="ed-tunnel-add-colors">';
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    var sel = (ci === r.ci) ? ' style="background:' + COLORS[ci].fill + ';border-color:rgba(0,0,0,0.5);outline:2px solid #FFD080"' : ' style="background:' + COLORS[ci].fill + '"';
    html += '<button class="ed-tunnel-add-clr" data-r-ci="' + ci + '"' + sel + '>' + CLR_NAMES[ci][0].toUpperCase() + '</button>';
  }
  html += '</div>';

  // Counter slider
  html += '<div class="ed-section-title" style="margin-top:8px"><span class="icon">#</span> Counter (matching plays to clear)</div>';
  html += '<div class="ed-setting-row" style="margin:0">';
  html += '<input type="range" id="ed-r-count" min="1" max="9" step="1" value="' + r.count + '" style="flex:1">';
  html += '<span class="ed-s-val" id="ed-r-count-v">' + r.count + '</span>';
  html += '</div>';

  // Covered slot (single)
  html += '<div class="ed-section-title" style="margin-top:8px"><span class="icon">📦</span> Box Hidden Underneath</div>';
  var co = r.covered || null;
  html += '<div style="margin:4px 0;padding:6px 8px;background:rgba(0,0,0,0.04);border-radius:8px">';
  html += '<div style="font-size:11px;color:#5A4A38;margin-bottom:4px;font-weight:600">';
  if (co) {
    var coCol = COLORS[co.ci];
    var coLab = (BoxTypes[co.type] || BoxTypes['default']).label;
    html += '<span style="color:' + coCol.fill + ';font-weight:700">' + CLR_NAMES[co.ci] + '</span> ';
    html += '<span style="opacity:0.6">' + coLab + '</span> ';
    html += '<button class="ed-qbtn" id="ed-r-clear" style="padding:1px 6px;font-size:10px;margin-left:4px">clear</button>';
  } else {
    html += '<span style="opacity:0.55">(empty when revealed)</span>';
  }
  html += '</div>';
  html += '<div class="ed-tunnel-add-row" style="margin-bottom:4px"><select class="ed-tunnel-select" id="ed-r-slot-type">';
  for (var t = 0; t < BoxTypeOrder.length; t++) {
    var sel2 = (co && co.type === BoxTypeOrder[t]) ? ' selected' : '';
    html += '<option value="' + BoxTypeOrder[t] + '"' + sel2 + '>' + BoxTypes[BoxTypeOrder[t]].label + '</option>';
  }
  html += '</select></div>';
  html += '<div class="ed-tunnel-add-colors">';
  for (var ci2 = 0; ci2 < NUM_COLORS; ci2++) {
    html += '<button class="ed-tunnel-add-clr" data-r-set="' + ci2 + '" style="background:' + COLORS[ci2].fill + '">' + CLR_NAMES[ci2][0].toUpperCase() + '</button>';
  }
  html += '</div>';
  html += '</div>';

  html += '<div style="text-align:center;margin-top:6px"><button class="ed-qbtn" id="ed-r-remove">Remove Replacer</button></div>';

  container.innerHTML = html;

  // Bind: color
  var cBtns = container.querySelectorAll('[data-r-ci]');
  for (var i = 0; i < cBtns.length; i++) {
    cBtns[i].addEventListener('click', function () {
      var p = editor.selectedReplacer;
      var rr = editor.grid[p];
      if (!rr) return;
      rr.ci = parseInt(this.getAttribute('data-r-ci'));
      editorRenderGrid();
      editorRenderReplacerPanel();
      editorUpdateStats();
    });
  }
  // Count slider
  var slEl = document.getElementById('ed-r-count');
  if (slEl) {
    slEl.addEventListener('input', function () {
      var p = editor.selectedReplacer;
      var rr = editor.grid[p];
      if (!rr) return;
      rr.count = parseInt(slEl.value);
      document.getElementById('ed-r-count-v').textContent = slEl.value;
      editorRenderGrid();
      editorUpdateStats();
    });
  }
  // Covered slot set
  var setBtns = container.querySelectorAll('[data-r-set]');
  for (var i = 0; i < setBtns.length; i++) {
    setBtns[i].addEventListener('click', function () {
      var p = editor.selectedReplacer;
      var rr = editor.grid[p];
      if (!rr) return;
      var ciSet = parseInt(this.getAttribute('data-r-set'));
      var typeEl = document.getElementById('ed-r-slot-type');
      var type = typeEl ? typeEl.value : 'default';
      rr.covered = { ci: ciSet, type: type };
      editorRenderReplacerPanel();
      editorUpdateStats();
    });
  }
  var clrBtn = document.getElementById('ed-r-clear');
  if (clrBtn) {
    clrBtn.addEventListener('click', function () {
      var p = editor.selectedReplacer;
      var rr = editor.grid[p];
      if (!rr) return;
      rr.covered = null;
      editorRenderReplacerPanel();
      editorUpdateStats();
    });
  }
  var remBtn = document.getElementById('ed-r-remove');
  if (remBtn) {
    remBtn.addEventListener('click', function () {
      var p = editor.selectedReplacer;
      if (p < 0) return;
      editorEraseAt(p);
      editorRenderGrid();
      editorRenderReplacerPanel();
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
  var replacerCount = 0, replacerCoveredCount = 0;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (!v) continue;
    if (v.wall) {
      wallCount++;
      continue;
    }
    if (v.replacer) {
      replacerCount++;
      var rci = v.ci;
      // Replacer-spawned marbles: count * MRB_PER_BOX of color rci
      regularMrb[rci] += (v.count || 0) * editor.mrbPerBox;
      // Single covered box (if any)
      var co = v.covered;
      // Accept legacy array form for safety
      if (Array.isArray(co)) co = co[0] || null;
      if (co) {
        replacerCoveredCount++;
        if (co.type === 'blocker') {
          regularMrb[co.ci] += Math.max(0, editor.mrbPerBox - BLOCKER_PER_BOX);
          totalBlockers += BLOCKER_PER_BOX;
        } else {
          regularMrb[co.ci] += editor.mrbPerBox;
        }
        counts[co.ci]++;
      }
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
  if (replacerCount > 0) {
    html += '<span class="ed-stat-chip" style="background:#3F3F4A">' + replacerCount + ' replacer' + (replacerCount > 1 ? 's' : '') + ' (' + replacerCoveredCount + ' covered)</span>';
  }
  if (totalBlockers > 0) {
    html += '<span class="ed-stat-chip" style="background:' + COLORS[BLOCKER_CI].fill + '">' + totalBlockers + ' blocker mrb</span>';
  }
  for (var c = 0; c < NUM_COLORS; c++) {
    if (counts[c] > 0) html += '<span class="ed-stat-chip" style="background:' + COLORS[c].fill + '">' + counts[c] + '</span>';
  }
  var warn = '';
  var totalAll = total + tunnelBoxCount + replacerCount;
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
  return {
    name: editor.name, desc: editor.desc,
    mrbPerBox: editor.mrbPerBox, sortCap: editor.sortCap,
    lockButtons: editor.lockButtons,
    grid: editor.grid.slice()
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
          else if (cell.replacer) {
            var coIn = cell.covered;
            if (Array.isArray(coIn)) coIn = coIn[0] || null;
            editor.grid[i] = { replacer: true, ci: cell.ci || 0, count: cell.count || 3, covered: coIn || null };
          }
          else if (cell.replacerRef !== undefined) editor.grid[i] = null; // legacy pair cells are now just empty
          else if (cell.tunnel) editor.grid[i] = { tunnel: true, dir: cell.dir || 'bottom', contents: cell.contents || [] };
          else editor.grid[i] = cell;
        }
      }
      if (lvl.mrbPerBox) editor.mrbPerBox = lvl.mrbPerBox;
      if (lvl.sortCap) editor.sortCap = lvl.sortCap;
      if (lvl.lockButtons !== undefined) editor.lockButtons = lvl.lockButtons;
      if (lvl.name) editor.name = lvl.name;
      if (lvl.desc) editor.desc = lvl.desc;
      var nameEl = document.getElementById('ed-name');
      var descEl = document.getElementById('ed-desc');
      if (nameEl) nameEl.value = editor.name;
      if (descEl) descEl.value = editor.desc;
      editor.selectedTunnel = -1;
      editor.selectedReplacer = -1;
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
