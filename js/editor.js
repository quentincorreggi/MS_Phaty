// ============================================================
// editor.js — Level Editor (reads box types from registry)
//             + Tunnel placement, orientation, contents editing
//             + Wall placement
// ============================================================

var editor = {
  grid: [],            // cols x rows: null = empty, { ci, type } or { tunnel: true, ... } or { wall: true }
  cols: 7,
  rows: 7,
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
  visible: false,
  scroller: null        // set by editorDefaultScroller()
};

function editorDefaultScroller() {
  return {
    enabled: false,
    viewRows: 7,
    mode: 'tap',
    release: 'single',
    rowsPerTap: 0.25,
    idleDrift: 0,
    autoSpeed: 0.13,
    gravity: 'column',
    settleFrames: 5,
    releaseStagger: 90,
    crumbleStagger: 120,
    loadCap: 85,
    tapBlockLoad: 60,
    beltSpeed: 2.5,
    sortWindow: 0.05,
    funnelWiden: 1.7,
    previewRows: 7,
    jamFuse: 90,
    startGap: 3,
    // generator settings (authoring only, not shipped in the level)
    colorCount: 4,
    cluster: 45,
    openingRows: 4,
    finaleRows: 4
  };
}

function editorCells() { return editor.cols * editor.rows; }

function editorInit() {
  editor.cols = 7;
  editor.rows = 7;
  editor.grid = [];
  for (var i = 0; i < editorCells(); i++) editor.grid.push(null);
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
  editor.scroller = editorDefaultScroller();
}

// Resize the board, keeping what fits. Rows are anchored at the BOTTOM
// because that end of the board is where play starts.
function editorSetBoardSize(cols, rows) {
  cols = Math.max(3, Math.min(9, cols));
  rows = Math.max(6, Math.min(120, rows));
  if (cols === editor.cols && rows === editor.rows) return;
  var old = editor.grid, oc = editor.cols, or = editor.rows;
  var next = [];
  for (var i = 0; i < cols * rows; i++) next.push(null);
  for (var r = 0; r < rows; r++) {
    var sr = or - rows + r;                 // bottom-anchored
    if (sr < 0 || sr >= or) continue;
    for (var c = 0; c < cols && c < oc; c++) next[r * cols + c] = old[sr * oc + c];
  }
  editor.grid = next;
  editor.cols = cols;
  editor.rows = rows;
  editor.selectedTunnel = -1;
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
  editorRenderScrollerPanel();
  editorUpdateStats();
  editorRenderTunnelPanel();
}

// ── Grid ──
function editorRenderGrid() {
  var el = document.getElementById('ed-grid');
  var wrap = document.getElementById('ed-grid-wrap');
  var noteTop = document.getElementById('ed-grid-note-top');
  var noteBot = document.getElementById('ed-grid-note-bot');
  var scrolling = editor.scroller && editor.scroller.enabled;

  var cellPx = editor.rows > 12 ? 26 : (editor.rows > 9 ? 32 : 42);
  var gridW = Math.min(320, editor.cols * (cellPx + 4));
  el.style.gridTemplateColumns = 'repeat(' + editor.cols + ',1fr)';
  el.style.maxWidth = gridW + 'px';
  if (wrap) {
    wrap.className = editor.rows > 9 ? 'tall' : '';
    wrap.style.maxWidth = (gridW + 16) + 'px';
  }
  if (noteTop) {
    noteTop.textContent = scrolling ? '▲ END of board — arrives last' : '';
    noteTop.style.display = scrolling ? '' : 'none';
  }
  if (noteBot) {
    noteBot.textContent = scrolling ? '▼ START — this row sits at the pressure line' : '';
    noteBot.style.display = scrolling ? '' : 'none';
  }

  el.innerHTML = '';
  for (var i = 0; i < editorCells(); i++) {
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
}

function editorCellClick(e) {
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));

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
      editorRenderToolbar();
      editorRenderTunnelPanel();
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
    editorRenderToolbar();
    editorRenderTunnelPanel();
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
    editorRenderToolbar();
    editorRenderTunnelPanel();
  });
  typeRow.appendChild(tunnelBtn);

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
  var row = Math.floor(editor.selectedTunnel / editor.cols);
  var col = editor.selectedTunnel % editor.cols;
  var er = row, ec = col;
  if (tunnel.dir === 'top') er = row - 1;
  else if (tunnel.dir === 'bottom') er = row + 1;
  else if (tunnel.dir === 'left') ec = col - 1;
  else if (tunnel.dir === 'right') ec = col + 1;
  var exitValid = (er >= 0 && er < editor.rows && ec >= 0 && ec < editor.cols);
  if (!exitValid) {
    html += '<div class="ed-stat-warn" style="margin:4px 0">Exit points outside the grid!</div>';
  } else {
    var exitIdx = er * editor.cols + ec;
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
  var cells = editorCells();
  for (var i = 0; i < cells; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  var perColor = Math.max(1, Math.round(cells * 0.49 / 4));
  var cl = [];
  for (var c = 0; c < 4; c++) for (var n = 0; n < perColor; n++) cl.push(c);
  shuffle(cl);
  var indices = []; for (var i = 0; i < cells; i++) indices.push(i);
  shuffle(indices);
  for (var i = 0; i < cl.length && i < cells; i++) editor.grid[indices[i]] = { ci: cl[i], type: 'default' };
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel();
}

function editorClearAll() {
  for (var i = 0; i < editorCells(); i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel();
}

// ── Board generator ──
// Fills a row range solid. Holes are deliberately NOT generated: under
// per-column gravity-up every gap collapses at load, so an authored hole
// doesn't make a hole, it just makes that column shorter — and columns of
// unequal length leave the stack's bottom edge ragged and floating above
// the pressure line. What actually shapes play is the colour sequence,
// so that is all the generator varies.
//
// `cluster` is the chance a cell copies a neighbour's colour, which is
// what produces readable groups (and therefore chains) instead of
// confetti. Higher cluster = bigger groups = more marbles per tap.
function editorGenerateRows(rowFrom, rowTo) {
  var sc = editor.scroller || editorDefaultScroller();
  var nColors = Math.max(2, Math.min(NUM_COLORS, sc.colorCount));
  var cluster = Math.max(0, Math.min(100, sc.cluster)) / 100;
  rowFrom = Math.max(0, rowFrom);
  rowTo = Math.min(editor.rows, rowTo);
  for (var r = rowFrom; r < rowTo; r++) {
    for (var c = 0; c < editor.cols; c++) {
      var idx = r * editor.cols + c;
      var ci = Math.floor(Math.random() * nColors);
      if (Math.random() < cluster) {
        var opts = [];
        if (c > 0 && editor.grid[idx - 1] && editor.grid[idx - 1].ci >= 0) opts.push(editor.grid[idx - 1].ci);
        if (r > rowFrom && editor.grid[idx - editor.cols] && editor.grid[idx - editor.cols].ci >= 0) {
          opts.push(editor.grid[idx - editor.cols].ci);
        }
        if (opts.length) ci = opts[Math.floor(Math.random() * opts.length)];
      }
      editor.grid[idx] = { ci: ci, type: 'default' };
    }
  }
  editor.selectedTunnel = -1;
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderScrollerPanel();
}

function editorGenerateMiddle() {
  var sc = editor.scroller || editorDefaultScroller();
  editorGenerateRows(sc.finaleRows, editor.rows - sc.openingRows);
  editorShowToast('Middle generated — opening and finale untouched');
}

function editorGenerateAll() {
  editorGenerateRows(0, editor.rows);
  editorShowToast('Whole board generated');
}

// ── Stats ──
function editorUpdateStats() {
  var counts = [];
  var regularMrb = [];
  for (var c = 0; c < NUM_COLORS; c++) { counts.push(0); regularMrb.push(0); }
  var total = 0, typeCounts = {}, totalBlockers = 0;
  var tunnelCount = 0, tunnelBoxCount = 0;
  var wallCount = 0;
  for (var i = 0; i < editorCells(); i++) {
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
  if (totalBlockers > 0) {
    html += '<span class="ed-stat-chip" style="background:' + COLORS[BLOCKER_CI].fill + '">' + totalBlockers + ' blocker mrb</span>';
  }
  for (var c = 0; c < NUM_COLORS; c++) {
    if (counts[c] > 0) html += '<span class="ed-stat-chip" style="background:' + COLORS[c].fill + '">' + counts[c] + '</span>';
  }
  var warn = '';
  var totalAll = total + tunnelBoxCount;
  var scrolling = editor.scroller && editor.scroller.enabled;
  if (totalAll === 0) {
    warn = 'Place some boxes to create a level';
  } else if (scrolling) {
    // Scrolling boards don't need marbles to divide evenly — a customer
    // that can no longer be completed is retired automatically at runtime.
    // What does matter is column height: gaps collapse upward, so a short
    // column starts floating above the pressure line.
    var tallest = 0, shortest = Infinity;
    for (var c2 = 0; c2 < editor.cols; c2++) {
      var h = 0;
      for (var r2 = 0; r2 < editor.rows; r2++) { var g2 = editor.grid[r2 * editor.cols + c2]; if (g2 && g2.ci >= 0) h++; }
      if (h > tallest) tallest = h;
      if (h < shortest) shortest = h;
    }
    if (shortest === Infinity) shortest = 0;
    html += '<span class="ed-stat-chip" style="background:#4ECDC4">columns ' + shortest + '–' + tallest + ' tall</span>';
    if (tallest < editor.scroller.viewRows) {
      warn = 'Board is shorter than the window — it will be over fast';
    } else if (editor.scroller.gravity === 'column' && tallest - shortest > 2) {
      warn = 'Columns differ by ' + (tallest - shortest) + ' — the stack will start ragged. Even them up.';
    }
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
    { label: 'Marbles/Box', key: 'mrbPerBox', min: 1, max: 9, step: 1 },
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

// ── Scrolling board panel ──
function editorRenderScrollerPanel() {
  var el = document.getElementById('ed-scroller-body');
  if (!el) return;
  if (!editor.scroller) editor.scroller = editorDefaultScroller();
  var sc = editor.scroller;

  var html = '';
  html += '<div class="ed-toggle-row">' +
    '<input type="checkbox" id="ed-sc-on"' + (sc.enabled ? ' checked' : '') + '>' +
    '<label for="ed-sc-on">Make this a scrolling board</label></div>';

  if (!sc.enabled) {
    html += '<div class="ed-hint">A tall board that slides down toward a pressure line. ' +
      'Tap a box to release its whole same-colour group; cleared cells let the boxes below ' +
      'rise into them. Anything that sinks past the line crumbles onto the conveyor.</div>';
    el.innerHTML = html;
    document.getElementById('ed-sc-on').addEventListener('change', editorToggleScroller);
    return;
  }

  html += editorSlider('sc-rows', 'Board rows', editor.rows, 8, 120, 1);
  html += editorSlider('sc-cols', 'Columns', editor.cols, 3, 9, 1);
  html += editorSlider('sc-view', 'Window rows', sc.viewRows, 4, 10, 1);
  html += editorSlider('sc-gap', 'Start gap', sc.startGap, 0, 6, 1);

  html += '<div class="ed-sub-label">Scroll variant</div>';
  html += '<div class="ed-seg-row">' +
    '<button class="ed-seg' + (sc.mode === 'tap' ? ' active' : '') + '" data-k="mode" data-v="tap">☝ Per tap</button>' +
    '<button class="ed-seg' + (sc.mode === 'auto' ? ' active' : '') + '" data-k="mode" data-v="auto">⏱ Auto</button>' +
    '</div>';
  html += editorSlider('sc-tap', 'Rows / tap', Math.round(sc.rowsPerTap * 100), 5, 200, 5, 0.01);
  html += editorSlider('sc-drift', 'Idle drift', Math.round(sc.idleDrift * 1000), 0, 300, 5, 0.001);
  html += editorSlider('sc-auto', 'Auto rows/s', Math.round(sc.autoSpeed * 1000), 10, 800, 5, 0.001);
  html += '<div class="ed-hint">Both variants run off the same board — swap between them ' +
    'mid-run with the pill in the top-left of the play screen. Idle drift 0 means the ' +
    'tap variant never moves on its own; the board only advances when the player taps, so ' +
    'they can also stop it dead by not tapping.</div>';

  html += '<div class="ed-sub-label">What a tap releases</div>';
  html += '<div class="ed-seg-row">' +
    '<button class="ed-seg' + (sc.release === 'single' ? ' active' : '') + '" data-k="release" data-v="single">Just that box</button>' +
    '<button class="ed-seg' + (sc.release === 'adjacent' ? ' active' : '') + '" data-k="release" data-v="adjacent">+ neighbours</button>' +
    '<button class="ed-seg' + (sc.release === 'group' ? ' active' : '') + '" data-k="release" data-v="group">Whole blob</button>' +
    '</div>';

  html += '<div class="ed-sub-label">Gravity-up</div>';
  html += '<div class="ed-seg-row">' +
    '<button class="ed-seg' + (sc.gravity === 'column' ? ' active' : '') + '" data-k="gravity" data-v="column">Per column</button>' +
    '<button class="ed-seg' + (sc.gravity === 'group' ? ' active' : '') + '" data-k="gravity" data-v="group">Per group</button>' +
    '</div>';
  html += editorSlider('sc-settle', 'Settle frames', sc.settleFrames, 1, 20, 1);

  html += '<div class="ed-sub-label">Pressure</div>';
  html += editorSlider('sc-release', 'Release ms', sc.releaseStagger, 0, 300, 5);
  html += editorSlider('sc-crumble', 'Crumble ms', sc.crumbleStagger, 0, 300, 5);
  html += editorSlider('sc-load', 'Load cap', sc.loadCap, 20, 160, 1);
  html += editorSlider('sc-block', 'Refuse past', sc.tapBlockLoad, 10, 160, 1);
  html += editorSlider('sc-fuse', 'Jam fuse (f)', sc.jamFuse, 1, 240, 1);
  html += editorSlider('sc-bspeed', 'Belt speed x', Math.round(sc.beltSpeed * 100), 50, 400, 5, 0.01);
  html += editorSlider('sc-window', 'Hand-off', Math.round(sc.sortWindow * 1000), 10, 120, 1, 0.001);
  html += editorSlider('sc-funnel', 'Funnel mouth', Math.round(sc.funnelWiden * 100), 100, 300, 5, 0.01);
  html += editorSlider('sc-preview', 'Customers shown', sc.previewRows, 1, 10, 1);
  html += '<div class="ed-hint">Load cap counts the belt plus the marbles backed up in the ' +
    'funnel — that total is the overflow you lose to. Above "refuse above" the line stops ' +
    'accepting new boxes and a tap just rattles the box, so the player cannot bury themselves ' +
    'faster than the conveyor can dig out; crumbling rows are what actually kill. The conveyor has to swallow far more ' +
    'marbles than a normal level, so it runs faster and hands off to customers more ' +
    'generously; drop those back toward 1.00 / 0.015 to feel base-game throughput. ' +
    'It sorts roughly 5-6 marbles a second, so a board of 7x16 boxes at 9 marbles each is ' +
    'about three minutes of work no matter how it is played — board length is capped by ' +
    'marble count, not by taste.</div>';

  html += '<div class="ed-sub-label">Generate</div>';
  html += editorSlider('sc-colors', 'Colours', sc.colorCount, 2, NUM_COLORS, 1);
  html += editorSlider('sc-cluster', 'Cluster %', sc.cluster, 0, 90, 5);
  html += editorSlider('sc-open', 'Opening rows', sc.openingRows, 0, 12, 1);
  html += editorSlider('sc-finale', 'Finale rows', sc.finaleRows, 0, 12, 1);
  html += '<div class="ed-quick">' +
    '<button class="ed-qbtn" id="ed-sc-gen-mid">🎲 Generate middle</button>' +
    '<button class="ed-qbtn" id="ed-sc-gen-all">🎲 Generate all</button>' +
    '</div>';
  html += '<div class="ed-hint">Hand-author the opening (bottom rows) and the finale (top rows), ' +
    'generate everything between. Colours are what shape play: fewer colours and a higher ' +
    'cluster make bigger groups, which means more marbles per tap. Under per-column ' +
    'gravity every gap collapses upward at load, so an empty cell does not make a hole — it ' +
    'just makes that column one shorter. Keep columns the same height or the stack starts ' +
    'ragged and floating above the line.</div>';

  el.innerHTML = html;

  document.getElementById('ed-sc-on').addEventListener('change', editorToggleScroller);

  var segs = el.querySelectorAll('.ed-seg');
  for (var s = 0; s < segs.length; s++) {
    segs[s].addEventListener('click', function () {
      editor.scroller[this.getAttribute('data-k')] = this.getAttribute('data-v');
      editorRenderScrollerPanel();
    });
  }

  editorBindSlider('sc-rows', function (v) { editorSetBoardSize(editor.cols, v); editorRenderGrid(); editorUpdateStats(); });
  editorBindSlider('sc-cols', function (v) { editorSetBoardSize(v, editor.rows); editorRenderGrid(); editorUpdateStats(); });
  editorBindSlider('sc-view', function (v) { sc.viewRows = v; editorUpdateStats(); });
  editorBindSlider('sc-gap', function (v) { sc.startGap = v; });
  editorBindSlider('sc-tap', function (v) { sc.rowsPerTap = v / 100; });
  editorBindSlider('sc-drift', function (v) { sc.idleDrift = v / 1000; });
  editorBindSlider('sc-auto', function (v) { sc.autoSpeed = v / 1000; });
  editorBindSlider('sc-settle', function (v) { sc.settleFrames = v; });
  editorBindSlider('sc-crumble', function (v) { sc.crumbleStagger = v; });
  editorBindSlider('sc-release', function (v) { sc.releaseStagger = v; });
  editorBindSlider('sc-load', function (v) { sc.loadCap = v; });
  editorBindSlider('sc-block', function (v) { sc.tapBlockLoad = v; });
  editorBindSlider('sc-fuse', function (v) { sc.jamFuse = v; });
  editorBindSlider('sc-bspeed', function (v) { sc.beltSpeed = v / 100; });
  editorBindSlider('sc-window', function (v) { sc.sortWindow = v / 1000; });
  editorBindSlider('sc-funnel', function (v) { sc.funnelWiden = v / 100; });
  editorBindSlider('sc-preview', function (v) { sc.previewRows = v; });
  editorBindSlider('sc-colors', function (v) { sc.colorCount = v; });
  editorBindSlider('sc-cluster', function (v) { sc.cluster = v; });
  editorBindSlider('sc-open', function (v) { sc.openingRows = v; });
  editorBindSlider('sc-finale', function (v) { sc.finaleRows = v; });

  document.getElementById('ed-sc-gen-mid').addEventListener('click', editorGenerateMiddle);
  document.getElementById('ed-sc-gen-all').addEventListener('click', editorGenerateAll);
}

function editorSlider(id, label, value, min, max, step, scale) {
  var shown = scale ? (value * scale).toFixed(2) : value;
  return '<div class="ed-setting-row"><label>' + label + '</label>' +
    '<input type="range" id="ed-' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"' +
    (scale ? ' data-scale="' + scale + '"' : '') + '>' +
    '<span class="ed-s-val" id="ed-' + id + '-v">' + shown + '</span></div>';
}

function editorBindSlider(id, onChange) {
  var sl = document.getElementById('ed-' + id);
  var vl = document.getElementById('ed-' + id + '-v');
  if (!sl) return;
  sl.addEventListener('input', function () {
    var v = parseInt(sl.value, 10);
    var scale = parseFloat(sl.getAttribute('data-scale'));
    vl.textContent = scale ? (v * scale).toFixed(2) : v;
    onChange(v);
  });
}

function editorToggleScroller(e) {
  var on = e.currentTarget.checked;
  if (!editor.scroller) editor.scroller = editorDefaultScroller();
  editor.scroller.enabled = on;
  if (on) {
    // Boards are short because every box still holds a full 9 marbles:
    // 7 columns x 16 rows is already ~1000 marbles, which is about all
    // the conveyor can sort inside three minutes.
    if (editor.rows <= 9) editorSetBoardSize(editor.cols, 16);
    // One tap is one box of a single colour, so a customer that wants
    // exactly one box's worth is what makes the queue readable: tap the
    // colour a customer is asking for and that customer is served. With a
    // smaller cap those nine marbles need three separate customers of the
    // same colour, and while they wait the belt fills with colours nobody
    // is asking for.
    editor.sortCap = editor.mrbPerBox;
    editorRenderSettings();
  } else {
    editorSetBoardSize(7, 7);
  }
  editorBuildUI();
}

// ── Build level definition ──
function editorBuildLevel() {
  var lvl = {
    name: editor.name, desc: editor.desc,
    mrbPerBox: editor.mrbPerBox, sortCap: editor.sortCap,
    lockButtons: editor.lockButtons,
    cols: editor.cols, rows: editor.rows,
    grid: editor.grid.slice()
  };
  if (editor.scroller && editor.scroller.enabled) {
    var sc = editor.scroller;
    lvl.scroller = {
      enabled: true,
      viewRows: sc.viewRows,
      mode: sc.mode,
      release: sc.release,
      rowsPerTap: sc.rowsPerTap,
      idleDrift: sc.idleDrift,
      autoSpeed: sc.autoSpeed,
      gravity: sc.gravity,
      settleFrames: sc.settleFrames,
      releaseStagger: sc.releaseStagger,
      crumbleStagger: sc.crumbleStagger,
      loadCap: sc.loadCap,
      tapBlockLoad: sc.tapBlockLoad,
      beltSpeed: sc.beltSpeed,
      sortWindow: sc.sortWindow,
      funnelWiden: sc.funnelWiden,
      previewRows: sc.previewRows,
      jamFuse: sc.jamFuse,
      startGap: sc.startGap,
      colorCount: sc.colorCount,
      cluster: sc.cluster,
      openingRows: sc.openingRows,
      finaleRows: sc.finaleRows
    };
  }
  return lvl;
}

// ── Test play ──
function editorTestPlay() {
  var total = 0;
  for (var i = 0; i < editorCells(); i++) if (editor.grid[i]) total++;
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
      if (lvl.grid && lvl.grid.length > 0) {
        var cols = lvl.cols || 7;
        var rows = lvl.rows || Math.max(1, Math.round(lvl.grid.length / cols));
        editor.cols = Math.max(3, Math.min(9, cols));
        editor.rows = Math.max(1, Math.min(120, rows));
        editor.grid = [];
        for (var gi = 0; gi < editorCells(); gi++) editor.grid.push(null);
        for (var i = 0; i < editorCells() && i < lvl.grid.length; i++) {
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
      editor.scroller = editorDefaultScroller();
      if (lvl.scroller) {
        for (var sk in lvl.scroller) {
          if (lvl.scroller[sk] !== undefined) editor.scroller[sk] = lvl.scroller[sk];
        }
        editor.scroller.enabled = lvl.scroller.enabled !== false;
      }
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
  for (var i = 0; i < editorCells(); i++) if (editor.grid[i]) total++;
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
