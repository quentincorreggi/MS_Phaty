// ============================================================
// editor.js — Level Editor (reads box types from registry)
//             + Tunnel placement, orientation, contents editing
//             + Wall placement
// ============================================================

var editor = {
  grid: [],            // 7x7: null = empty, { ci, type } or { tunnel: true, ... } or { wall: true }
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
  glassMode: false,     // true when placing glass panels
  glassStep: null,      // null | 'a2' | 'b' — placement state machine
  glassCorner1: -1,     // first corner cell index during placement
  _glassA: null,        // { r1, c1, rows, cols } during placement step 'b'
  glassPanels: [],      // array of { r1A, c1A, r1B, c1B, rows, cols, tapsToMove }
  selectedGlass: -1,    // index of selected glass panel
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
  editor.glassMode = false;
  editor.glassStep = null;
  editor.glassCorner1 = -1;
  editor._glassA = null;
  editor.glassPanels = [];
  editor.selectedGlass = -1;
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
  editorRenderGlassPanel();
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
  editorApplyGlassOverlays();
}

function editorCellClick(e) {
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));

  if (editor.glassMode) {
    editorGlassCellClick(idx);
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
  // Check if cell is part of a glass panel — right-click deletes the panel
  var row = Math.floor(idx / 7), col = idx % 7;
  for (var gi = editor.glassPanels.length - 1; gi >= 0; gi--) {
    var gp = editor.glassPanels[gi];
    var inA = (row >= gp.r1A && row < gp.r1A + gp.rows && col >= gp.c1A && col < gp.c1A + gp.cols);
    var inB = (row >= gp.r1B && row < gp.r1B + gp.rows && col >= gp.c1B && col < gp.c1B + gp.cols);
    if (inA || inB) {
      editor.glassPanels.splice(gi, 1);
      if (editor.selectedGlass >= editor.glassPanels.length) editor.selectedGlass = -1;
      editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderGlassPanel();
      return;
    }
  }
  editor.grid[idx] = null;
  if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
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
    tb.className = 'ed-type-btn' + (!editor.tunnelMode && !editor.wallMode && editor.activeType === id ? ' active' : '');
    tb.textContent = bt.label;
    tb.setAttribute('data-type', id);
    tb.addEventListener('click', function () {
      editor.activeType = this.getAttribute('data-type');
      editor.tunnelMode = false;
      editor.wallMode = false;
      editor.glassMode = false;
      editor.glassStep = null;
      editorRenderToolbar();
      editorRenderTunnelPanel();
      editorRenderGlassPanel();
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
    editor.glassMode = false;
    editor.glassStep = null;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderGlassPanel();
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
    editor.glassMode = false;
    editor.glassStep = null;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderGlassPanel();
  });
  typeRow.appendChild(tunnelBtn);

  // Glass panel mode button
  var glassBtn = document.createElement('button');
  glassBtn.className = 'ed-type-btn' + (editor.glassMode ? ' active' : '');
  glassBtn.textContent = '\u25A8 Glass';
  glassBtn.style.borderColor = editor.glassMode ? 'rgba(80,160,240,0.6)' : '';
  glassBtn.style.color = editor.glassMode ? '#4A90D0' : '';
  glassBtn.addEventListener('click', function () {
    editor.glassMode = true;
    editor.tunnelMode = false;
    editor.wallMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderGlassPanel();
  });
  typeRow.appendChild(glassBtn);

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
  } else if (editor.glassMode) {
    // Glass mode: show placement instructions
    var glassInfo = document.createElement('div');
    glassInfo.className = 'ed-color-row';
    var hint = 'Click cells to place glass panels \u00B7 right-click to delete';
    if (editor.glassStep === 'a2') hint = 'Click opposite corner of position A';
    else if (editor.glassStep === 'b') hint = 'Click top-left of position B (' + editor._glassA.rows + '\u00D7' + editor._glassA.cols + ')';
    glassInfo.innerHTML = '<span style="font-size:11px;color:#4A90D0">' + hint + '</span>';
    el.appendChild(glassInfo);
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
  editor.glassPanels = [];
  editor.selectedGlass = -1;
  editor.glassStep = null;
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderGlassPanel();
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
  if (editor.glassPanels.length > 0) {
    html += '<span class="ed-stat-chip" style="background:#4A90D0">' + editor.glassPanels.length + ' glass panel' + (editor.glassPanels.length > 1 ? 's' : '') + '</span>';
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
  var lvl = {
    name: editor.name, desc: editor.desc,
    mrbPerBox: editor.mrbPerBox, sortCap: editor.sortCap,
    lockButtons: editor.lockButtons,
    grid: editor.grid.slice()
  };
  if (editor.glassPanels.length > 0) {
    lvl.panels = [];
    for (var gi = 0; gi < editor.glassPanels.length; gi++) {
      var gp = editor.glassPanels[gi];
      lvl.panels.push({ r1A: gp.r1A, c1A: gp.c1A, r1B: gp.r1B, c1B: gp.c1B,
        rows: gp.rows, cols: gp.cols, tapsToMove: gp.tapsToMove });
    }
  }
  return lvl;
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
      if (lvl.panels && lvl.panels.length > 0) {
        editor.glassPanels = [];
        for (var pi = 0; pi < lvl.panels.length; pi++) {
          var pp = lvl.panels[pi];
          editor.glassPanels.push({ r1A: pp.r1A, c1A: pp.c1A, r1B: pp.r1B, c1B: pp.c1B,
            rows: pp.rows, cols: pp.cols, tapsToMove: pp.tapsToMove || 3 });
        }
      } else { editor.glassPanels = []; }
      editor.selectedGlass = -1;
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

// ── Glass panel editor functions ──

function editorGlassCellClick(idx) {
  if (editor.glassStep === null) {
    // First click: corner 1 of position A
    editor.glassCorner1 = idx;
    editor.glassStep = 'a2';
  } else if (editor.glassStep === 'a2') {
    // Second click: corner 2 of position A — compute rectangle
    var r1 = Math.floor(editor.glassCorner1 / 7), c1 = editor.glassCorner1 % 7;
    var r2 = Math.floor(idx / 7), c2 = idx % 7;
    editor._glassA = {
      r1: Math.min(r1, r2), c1: Math.min(c1, c2),
      rows: Math.abs(r2 - r1) + 1, cols: Math.abs(c2 - c1) + 1
    };
    editor.glassStep = 'b';
  } else if (editor.glassStep === 'b') {
    // Third click: top-left of position B
    var r = Math.floor(idx / 7), c = idx % 7;
    var a = editor._glassA;
    if (r + a.rows > 7 || c + a.cols > 7) {
      editorShowToast('Position B goes out of bounds!');
      return;
    }
    editor.glassPanels.push({
      r1A: a.r1, c1A: a.c1,
      r1B: r, c1B: c,
      rows: a.rows, cols: a.cols,
      tapsToMove: 3
    });
    editor.glassStep = null;
    editor.glassCorner1 = -1;
    editor._glassA = null;
    editor.selectedGlass = editor.glassPanels.length - 1;
  }
  editorRenderGrid();
  editorRenderToolbar();
  editorUpdateStats();
  editorRenderGlassPanel();
}

function editorApplyGlassOverlays() {
  if (!editor.glassPanels) return;
  var el = document.getElementById('ed-grid');
  if (!el || !el.children.length) return;

  for (var gi = 0; gi < editor.glassPanels.length; gi++) {
    var gp = editor.glassPanels[gi];
    var isSel = (editor.selectedGlass === gi);
    // Position A — solid blue inset
    for (var r = gp.r1A; r < gp.r1A + gp.rows; r++) {
      for (var c = gp.c1A; c < gp.c1A + gp.cols; c++) {
        if (r >= 0 && r < 7 && c >= 0 && c < 7) {
          el.children[r * 7 + c].classList.add(isSel ? 'ed-glass-a-sel' : 'ed-glass-a');
        }
      }
    }
    // Position B — dashed outline
    for (var r = gp.r1B; r < gp.r1B + gp.rows; r++) {
      for (var c = gp.c1B; c < gp.c1B + gp.cols; c++) {
        if (r >= 0 && r < 7 && c >= 0 && c < 7) {
          el.children[r * 7 + c].classList.add(isSel ? 'ed-glass-b-sel' : 'ed-glass-b');
        }
      }
    }
  }

  // Placement progress highlights
  if (editor.glassMode && editor.glassStep === 'a2' && editor.glassCorner1 >= 0) {
    var cc = el.children[editor.glassCorner1];
    if (cc) cc.classList.add('ed-glass-placing');
  }
  if (editor.glassMode && editor.glassStep === 'b' && editor._glassA) {
    var a = editor._glassA;
    for (var r = a.r1; r < a.r1 + a.rows; r++) {
      for (var c = a.c1; c < a.c1 + a.cols; c++) {
        if (r >= 0 && r < 7 && c >= 0 && c < 7) {
          var cc2 = el.children[r * 7 + c];
          if (cc2) cc2.classList.add('ed-glass-placing');
        }
      }
    }
  }
}

function editorRenderGlassPanel() {
  var container = document.getElementById('ed-glass-panel');
  if (!container) return;

  if (!editor.glassMode && editor.glassPanels.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  var html = '<div class="ed-section-title"><span class="icon">&#128999;</span> Glass Panels</div>';

  // Cancel button if mid-placement
  if (editor.glassMode && editor.glassStep !== null) {
    html += '<div style="text-align:center;margin-bottom:8px"><button class="ed-qbtn" id="ed-glass-cancel">\u2716 Cancel placement</button></div>';
  }

  // Panel list
  if (editor.glassPanels.length > 0) {
    for (var gi = 0; gi < editor.glassPanels.length; gi++) {
      var gp = editor.glassPanels[gi];
      var sel = (editor.selectedGlass === gi);
      html += '<div class="ed-glass-item' + (sel ? ' selected' : '') + '" data-gi="' + gi + '">';
      html += '<div style="font-size:11px;font-weight:600;color:#4A6A8A">Panel ' + (gi + 1) + ' <span style="font-weight:400;color:#9C8A70">(' + gp.rows + '\u00D7' + gp.cols + ')</span></div>';
      html += '<div style="font-size:10px;color:#9C8A70">A: row ' + gp.r1A + ' col ' + gp.c1A + '  \u2192  B: row ' + gp.r1B + ' col ' + gp.c1B + '</div>';
      html += '<div class="ed-setting-row"><label>Taps</label>';
      html += '<input type="range" class="ed-glass-taps" data-gi="' + gi + '" min="1" max="6" value="' + gp.tapsToMove + '">';
      html += '<span class="ed-s-val">' + gp.tapsToMove + '</span></div>';
      html += '<button class="ed-qbtn ed-glass-del" data-gi="' + gi + '" style="margin-top:4px;color:#C44">\u2716 Delete</button>';
      html += '</div>';
    }
  } else if (editor.glassMode && editor.glassStep === null) {
    html += '<div style="font-size:11px;color:#9C8A70;text-align:center;font-style:italic">No panels yet \u2014 click a grid cell to start placing</div>';
  }

  container.innerHTML = html;

  // Bind events
  var cancelBtn = document.getElementById('ed-glass-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      editor.glassStep = null;
      editor.glassCorner1 = -1;
      editor._glassA = null;
      editorRenderGrid(); editorRenderToolbar(); editorRenderGlassPanel();
    });
  }

  var tapsSliders = container.querySelectorAll('.ed-glass-taps');
  for (var ts = 0; ts < tapsSliders.length; ts++) {
    tapsSliders[ts].addEventListener('input', function () {
      var gi2 = parseInt(this.getAttribute('data-gi'));
      editor.glassPanels[gi2].tapsToMove = parseInt(this.value);
      this.nextElementSibling.textContent = this.value;
    });
  }

  var delBtns = container.querySelectorAll('.ed-glass-del');
  for (var db = 0; db < delBtns.length; db++) {
    delBtns[db].addEventListener('click', function () {
      var gi2 = parseInt(this.getAttribute('data-gi'));
      editor.glassPanels.splice(gi2, 1);
      if (editor.selectedGlass >= editor.glassPanels.length) editor.selectedGlass = -1;
      editorRenderGrid(); editorUpdateStats(); editorRenderGlassPanel();
    });
  }

  var items = container.querySelectorAll('.ed-glass-item');
  for (var it = 0; it < items.length; it++) {
    items[it].addEventListener('click', function (e) {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      var gi2 = parseInt(this.getAttribute('data-gi'));
      editor.selectedGlass = (editor.selectedGlass === gi2) ? -1 : gi2;
      editorRenderGrid(); editorRenderGlassPanel();
    });
  }
}
