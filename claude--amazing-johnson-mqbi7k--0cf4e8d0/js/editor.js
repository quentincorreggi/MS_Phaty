// ============================================================
// editor.js — Level Editor (reads box types from registry)
//             + Tunnel placement, orientation, contents editing
//             + Multi Cell Tunnel (mushroom) placement + shared stock
//             + Wall placement
// ============================================================

var editor = {
  grid: [],            // 7x7: null = empty, { ci, type } or { tunnel: true, ... } or { wall: true } or { mtunnel: true, ... }
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
  mtMode: false,        // true when placing multi cell tunnels
  mtOrient: 'h',        // footprint orientation for new multi cell tunnels
  selectedMT: -1,       // head index of selected multi cell tunnel
  wallMode: false,      // true when placing walls
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
  editor.mtMode = false;
  editor.mtOrient = 'h';
  editor.selectedMT = -1;
  editor.wallMode = false;
}

// ── Multi Cell Tunnel grid helpers ──

// Clearing one cell of a mushroom clears the whole entity: half a
// mushroom is not a thing that can exist on the board.
function editorClearMT(idx) {
  var head = mtHeadIdxOfCell(editor.grid, idx);
  if (head < 0) {
    if (editor.grid[idx] && editor.grid[idx].mtunnel) editor.grid[idx] = null;
    return;
  }
  var tail = mtTailIdx(head, editor.grid[head].orient || 'h', 7);
  editor.grid[head] = null;
  if (tail >= 0) editor.grid[tail] = null;
  if (editor.selectedMT === head) editor.selectedMT = -1;
}

// Place a mushroom with its head at idx. Returns an error string or null.
function editorPlaceMT(idx, orient) {
  var tail = mtTailIdx(idx, orient, 7);
  if (tail < 0) {
    return orient === 'v'
      ? 'Not enough room below — a vertical mushroom needs 2 stacked cells'
      : 'Not enough room to the right — a horizontal mushroom needs 2 cells';
  }
  // Anything already sitting on either cell gives way
  editorClearMT(idx);
  editorClearMT(tail);
  editor.grid[idx] = { mtunnel: true, role: 'head', orient: orient, contents: [] };
  editor.grid[tail] = { mtunnel: true, role: 'tail', orient: orient };
  if (editor.selectedTunnel === idx || editor.selectedTunnel === tail) editor.selectedTunnel = -1;
  editor.selectedMT = idx;
  return null;
}

// Re-orient an existing mushroom around its head cell.
function editorReorientMT(head, orient) {
  var cur = editor.grid[head];
  if (!cur || !cur.mtunnel || cur.role !== 'head') return 'Mushroom not found';
  if ((cur.orient || 'h') === orient) return null;
  var tail = mtTailIdx(head, orient, 7);
  if (tail < 0) {
    return orient === 'v'
      ? 'No room below to stack the second cell'
      : 'No room to the right for the second cell';
  }
  var oldTail = mtTailIdx(head, cur.orient || 'h', 7);
  var contents = cur.contents || [];
  if (oldTail >= 0) editor.grid[oldTail] = null;
  editorClearMT(tail);
  editor.grid[head] = { mtunnel: true, role: 'head', orient: orient, contents: contents };
  editor.grid[tail] = { mtunnel: true, role: 'tail', orient: orient };
  editor.selectedMT = head;
  return null;
}

function editorSelectedMTCell() {
  if (editor.selectedMT < 0) return null;
  var c = editor.grid[editor.selectedMT];
  if (!c || !c.mtunnel || c.role !== 'head') return null;
  return c;
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
  editorRenderMTPanel();
}

// Every editor mutation refreshes the same set of panels.
function editorRefresh() {
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderMTPanel();
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
    } else if (v && v.mtunnel) {
      // Multi Cell Tunnel cell — both halves share one look so the
      // entity reads as continuous, with the counter on the head.
      var mtHead = mtHeadIdxOfCell(editor.grid, i);
      var mtOrient = v.orient || 'h';
      var mtSel = (mtHead >= 0 && editor.selectedMT === mtHead);
      var isHead = (v.role === 'head');
      cell.style.background = 'linear-gradient(135deg,#E4674C,#A72E1E)';
      cell.style.borderColor = mtSel ? '#FFD080' : '#8E2A1C';
      if (mtSel) cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.55)';
      // Flatten the border on the shared seam so the two cells read as one
      if (mtOrient === 'h') {
        if (isHead) { cell.style.borderRightColor = 'transparent'; }
        else { cell.style.borderLeftColor = 'transparent'; }
      } else {
        if (isHead) { cell.style.borderBottomColor = 'transparent'; }
        else { cell.style.borderTopColor = 'transparent'; }
      }
      var mtArrow = MT_MOUTH_ARROW[mtOrient][isHead ? 0 : 1];
      var mtInner = '<span class="ed-cell-dot" style="font-size:12px">' + mtArrow + '</span>';
      if (isHead) {
        var mtCount = v.contents ? v.contents.length : 0;
        mtInner = '<span class="ed-cell-dot" style="font-size:13px">🍄</span>' +
          '<span class="ed-mt-badge">' + mtCount + '</span>' +
          '<span class="ed-mt-arrow ed-mt-arrow-' + (mtOrient === 'h' ? 'l' : 'u') + '">' + mtArrow + '</span>';
      } else {
        mtInner = '<span class="ed-cell-dot" style="font-size:13px;opacity:0.5">🍄</span>' +
          '<span class="ed-mt-arrow ed-mt-arrow-' + (mtOrient === 'h' ? 'r' : 'd') + '">' + mtArrow + '</span>';
      }
      cell.innerHTML = mtInner;
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

  if (editor.mtMode) {
    // In mushroom mode: select an existing entity, or place a new one
    var mtAt = mtHeadIdxOfCell(editor.grid, idx);
    if (mtAt >= 0) {
      if (editor.activeColor === -1) editorClearMT(idx);
      else {
        editor.selectedMT = mtAt;
        editor.mtOrient = editor.grid[mtAt].orient || 'h';
      }
    } else if (editor.activeColor === -1) {
      editor.grid[idx] = null;
    } else {
      var err = editorPlaceMT(idx, editor.mtOrient);
      if (err) { editorShowToast(err); return; }
    }
    editorRefresh();
    return;
  }

  if (editor.wallMode) {
    // Wall placement mode
    var existing = editor.grid[idx];
    if (existing && existing.mtunnel) editorClearMT(idx);
    if (existing && existing.wall) {
      // Toggle off: clicking existing wall removes it
      editor.grid[idx] = null;
    } else {
      // Place wall
      editor.grid[idx] = { wall: true };
    }
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    editorRefresh();
    return;
  }

  if (editor.tunnelMode) {
    // In tunnel mode: place or select tunnel
    var existing = editor.grid[idx];
    if (existing && existing.mtunnel) editorClearMT(idx);
    existing = editor.grid[idx];
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
      if (editor.grid[idx] && editor.grid[idx].mtunnel) editorClearMT(idx);
      else editor.grid[idx] = null;
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    } else {
      var existing = editor.grid[idx];
      if (existing && existing.mtunnel) { editorClearMT(idx); existing = null; }
      if (existing && !existing.tunnel && !existing.wall && existing.ci === editor.activeColor && existing.type === editor.activeType) {
        editor.grid[idx] = null;
      } else {
        editor.grid[idx] = { ci: editor.activeColor, type: editor.activeType };
      }
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    }
  }
  editorRefresh();
}

function editorCellErase(e) {
  e.preventDefault();
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  if (editor.grid[idx] && editor.grid[idx].mtunnel) editorClearMT(idx);
  else editor.grid[idx] = null;
  if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  editorRefresh();
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
    tb.className = 'ed-type-btn' + (!editor.tunnelMode && !editor.wallMode && !editor.mtMode && editor.activeType === id ? ' active' : '');
    tb.textContent = bt.label;
    tb.setAttribute('data-type', id);
    tb.addEventListener('click', function () {
      editor.activeType = this.getAttribute('data-type');
      editor.tunnelMode = false;
      editor.wallMode = false;
      editor.mtMode = false;
      editorRenderToolbar();
      editorRenderTunnelPanel();
      editorRenderMTPanel();
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
    editor.mtMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderMTPanel();
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
    editor.mtMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderMTPanel();
  });
  typeRow.appendChild(tunnelBtn);

  // Multi Cell Tunnel (mushroom) mode button
  var mtBtn = document.createElement('button');
  mtBtn.className = 'ed-type-btn' + (editor.mtMode ? ' active' : '');
  mtBtn.textContent = '\uD83C\uDF44 Mushroom';
  mtBtn.title = 'Multi Cell Tunnel \u2014 two cells, two mouths, one shared stock';
  mtBtn.style.borderColor = editor.mtMode ? 'rgba(214,71,46,0.6)' : '';
  mtBtn.style.color = editor.mtMode ? '#C0432C' : '';
  mtBtn.addEventListener('click', function () {
    editor.mtMode = true;
    editor.tunnelMode = false;
    editor.wallMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderMTPanel();
  });
  typeRow.appendChild(mtBtn);

  el.appendChild(typeRow);

  if (editor.mtMode) {
    // Footprint selector row
    var mtRow = document.createElement('div');
    mtRow.className = 'ed-color-row';

    var mtEraser = document.createElement('button');
    mtEraser.className = 'ed-tool' + (editor.activeColor === -1 ? ' active' : '');
    mtEraser.style.background = 'rgba(180,165,145,0.5)';
    mtEraser.innerHTML = '\u2716';
    mtEraser.title = 'Eraser';
    mtEraser.addEventListener('click', function () { editor.activeColor = -1; editorRenderToolbar(); });
    mtRow.appendChild(mtEraser);

    var shapes = [
      { o: 'h', glyph: '\u25AC\u25AC', title: 'Horizontal \u2014 2 cells side by side, mouths left + right' },
      { o: 'v', glyph: '\u2759\u2759', title: 'Vertical \u2014 2 cells stacked, mouths up + down' }
    ];
    for (var sh = 0; sh < shapes.length; sh++) {
      var sb = document.createElement('button');
      sb.className = 'ed-tool' + (editor.mtOrient === shapes[sh].o && editor.activeColor !== -1 ? ' active' : '');
      sb.style.background = 'linear-gradient(135deg,#E4674C,#A72E1E)';
      sb.style.fontSize = '13px';
      sb.style.width = '48px';
      sb.innerHTML = shapes[sh].glyph;
      sb.title = shapes[sh].title;
      sb.setAttribute('data-o', shapes[sh].o);
      sb.addEventListener('click', function () {
        editor.mtOrient = this.getAttribute('data-o');
        editor.activeColor = 0;
        var sel = editorSelectedMTCell();
        if (sel) {
          var rerr = editorReorientMT(editor.selectedMT, editor.mtOrient);
          if (rerr) editorShowToast(rerr);
        }
        editorRenderToolbar();
        editorRefresh();
      });
      mtRow.appendChild(sb);
    }
    el.appendChild(mtRow);

    var mtHint = document.createElement('div');
    mtHint.className = 'ed-color-row';
    mtHint.innerHTML = '<span style="font-size:11px;color:#9C8A70">Click a cell to grow a mushroom (it takes that cell + the next one ' +
      (editor.mtOrient === 'h' ? 'to the right' : 'below') + ')</span>';
    el.appendChild(mtHint);
  } else if (editor.tunnelMode) {
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
    if (exitCell && exitCell.tunnel) {
      html += '<div class="ed-stat-warn" style="margin:4px 0">Exit tile is another tunnel</div>';
    } else if (exitCell && exitCell.mtunnel) {
      html += '<div class="ed-stat-warn" style="margin:4px 0">Exit tile is a mushroom</div>';
    } else if (exitCell) {
      html += '<div class="ed-stat-warn" style="margin:4px 0">Exit tile is occupied by a box</div>';
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

// ── Multi Cell Tunnel panel: shape, mouth validation, shared stock ──
function editorRenderMTPanel() {
  var container = document.getElementById('ed-mt-panel');
  if (!container) return;

  var mt = editorSelectedMTCell();
  if (!mt) { container.style.display = 'none'; return; }

  container.style.display = 'block';
  var head = editor.selectedMT;
  var orient = mt.orient || 'h';
  var mtStockList = mt.contents || [];
  var v = mtValidate(editor.grid, head, orient);
  var html = '';

  // Shape
  html += '<div class="ed-section-title"><span class="icon">🍄</span> Mushroom #' + (head + 1) +
    ' — Shape</div>';
  html += '<div class="ed-tunnel-dir-row">';
  html += '<button class="ed-tunnel-dir-btn' + (orient === 'h' ? ' active' : '') + '" data-o="h">▬ ' + MT_ORIENT_LABEL.h + '</button>';
  html += '<button class="ed-tunnel-dir-btn' + (orient === 'v' ? ' active' : '') + '" data-o="v">❙ ' + MT_ORIENT_LABEL.v + '</button>';
  html += '</div>';

  // Mouths — the information the whole decision rests on
  html += '<div class="ed-mt-mouths">' +
    '<span class="ed-mt-mouth">' + MT_MOUTH_ARROW[orient][0] + ' ' + MT_MOUTH_LABEL[orient][0] + ' mouth</span>' +
    '<span class="ed-mt-mouth-sep">one shared stock</span>' +
    '<span class="ed-mt-mouth">' + MT_MOUTH_LABEL[orient][1] + ' mouth ' + MT_MOUTH_ARROW[orient][1] + '</span>' +
    '</div>';

  for (var e = 0; e < v.errors.length; e++) {
    html += '<div class="ed-stat-warn" style="margin:4px 0">' + v.errors[e] + '</div>';
  }
  for (var h2 = 0; h2 < v.hints.length; h2++) {
    html += '<div class="ed-mt-hint">' + v.hints[h2] + ' — the mushroom will fill it on the first frame</div>';
  }

  // Shared stock
  html += '<div class="ed-section-title" style="margin-top:8px"><span class="icon">📦</span> Shared Stock (' +
    mtStockList.length + '/' + MTUNNEL_MAX_STOCK + ')</div>';
  html += '<div class="ed-tunnel-contents">';
  if (mtStockList.length === 0) {
    html += '<span style="font-size:11px;color:#9C8A70;font-style:italic">Empty — add boxes below</span>';
  } else {
    for (var i = 0; i < mtStockList.length; i++) {
      var item = mtStockList[i];
      var c = COLORS[item.ci];
      var typeLabel = (BoxTypes[item.type] || BoxTypes[BoxTypeOrder[0]]).label;
      html += '<span class="ed-tunnel-item" data-midx="' + i + '" title="#' + (i + 1) + ' — ' +
        CLR_NAMES[item.ci] + ' ' + typeLabel + ' — click to remove" style="background:' + c.fill + '">';
      html += '<span style="font-size:8px;opacity:0.7">' + typeLabel[0] + '</span>';
      html += '</span>';
    }
  }
  html += '</div>';

  // Pacing guidance — the player can drain the whole stock through one mouth
  if (mtStockList.length === 1) {
    html += '<div class="ed-stat-warn">A stock of 1 makes the side choice meaningless — use at least 2</div>';
  } else if (mtStockList.length > 5) {
    html += '<div class="ed-mt-hint">' + mtStockList.length + ' boxes is the top of the range — keep 6 for easy levels only</div>';
  } else if (mtStockList.length > 0 && mtStockList.length < MTUNNEL_SOFT_STOCK) {
    html += '<div class="ed-mt-hint">' + MTUNNEL_SOFT_STOCK + ' boxes is the recommended stock</div>';
  }

  // Add box controls
  html += '<div class="ed-section-title" style="margin-top:8px"><span class="icon">&#10133;</span> Add Box to Stock</div>';
  html += '<div class="ed-tunnel-add-row">';
  html += '<select id="ed-mt-add-type" class="ed-tunnel-select">';
  for (var t = 0; t < BoxTypeOrder.length; t++) {
    html += '<option value="' + BoxTypeOrder[t] + '">' + BoxTypes[BoxTypeOrder[t]].label + '</option>';
  }
  html += '</select>';
  html += '</div>';
  html += '<div class="ed-tunnel-add-colors">';
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    html += '<button class="ed-mt-add-clr" data-ci="' + ci + '" style="background:' + COLORS[ci].fill +
      '" title="Add ' + CLR_NAMES[ci] + '">' + CLR_NAMES[ci][0].toUpperCase() + '</button>';
  }
  html += '</div>';

  html += '<div style="text-align:center;margin-top:6px">';
  if (mtStockList.length > 0) html += '<button class="ed-qbtn" id="ed-mt-clear">Clear Stock</button> ';
  html += '<button class="ed-qbtn" id="ed-mt-remove">Remove Mushroom</button>';
  html += '</div>';

  container.innerHTML = html;

  // ── Bind ──
  var shapeBtns = container.querySelectorAll('.ed-tunnel-dir-btn');
  for (var sb = 0; sb < shapeBtns.length; sb++) {
    shapeBtns[sb].addEventListener('click', function () {
      var o = this.getAttribute('data-o');
      var err = editorReorientMT(editor.selectedMT, o);
      if (err) { editorShowToast(err); return; }
      editor.mtOrient = o;
      editorRefresh();
      editorRenderToolbar();
    });
  }

  var items = container.querySelectorAll('.ed-tunnel-item');
  for (var it = 0; it < items.length; it++) {
    items[it].addEventListener('click', function () {
      var midx = parseInt(this.getAttribute('data-midx'));
      var cell = editorSelectedMTCell();
      if (!cell) return;
      cell.contents.splice(midx, 1);
      editorRefresh();
    });
  }

  var addClrs = container.querySelectorAll('.ed-mt-add-clr');
  for (var ac = 0; ac < addClrs.length; ac++) {
    addClrs[ac].addEventListener('click', function () {
      var cell = editorSelectedMTCell();
      if (!cell) return;
      if (cell.contents.length >= MTUNNEL_MAX_STOCK) {
        editorShowToast(MTUNNEL_MAX_STOCK + ' boxes is the hard limit for a Tunnel-family stock');
        return;
      }
      var typeEl = document.getElementById('ed-mt-add-type');
      cell.contents.push({
        ci: parseInt(this.getAttribute('data-ci')),
        type: typeEl ? typeEl.value : 'default'
      });
      editorRefresh();
    });
  }

  var clearBtn = document.getElementById('ed-mt-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      var cell = editorSelectedMTCell();
      if (!cell) return;
      cell.contents = [];
      editorRefresh();
    });
  }

  var removeBtn = document.getElementById('ed-mt-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', function () {
      if (editor.selectedMT < 0) return;
      editorClearMT(editor.selectedMT);
      editorRefresh();
    });
  }
}

// Hard validation across every mushroom on the grid.
function editorMTIssues() {
  var out = [];
  for (var i = 0; i < 49; i++) {
    var c = editor.grid[i];
    if (!c || !c.mtunnel) continue;
    if (c.role !== 'head') {
      if (mtHeadIdxOfCell(editor.grid, i) < 0) out.push('Mushroom cell ' + (i + 1) + ' has lost its other half');
      continue;
    }
    if (mtHeadIdxOfCell(editor.grid, i) < 0) {
      out.push('Mushroom #' + (i + 1) + ' has lost its other half');
      continue;
    }
    var v = mtValidate(editor.grid, i, c.orient || 'h');
    for (var e = 0; e < v.errors.length; e++) {
      out.push('Mushroom #' + (i + 1) + ': ' + v.errors[e]);
    }
  }
  return out;
}

// ── Quick actions ──
function editorFillRandom() {
  for (var i = 0; i < 49; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  editor.selectedMT = -1;
  var cl = [];
  for (var c = 0; c < 4; c++) for (var n = 0; n < 6; n++) cl.push(c);
  shuffle(cl);
  var indices = []; for (var i = 0; i < 49; i++) indices.push(i);
  shuffle(indices);
  for (var i = 0; i < cl.length; i++) editor.grid[indices[i]] = { ci: cl[i], type: 'default' };
  editorRefresh();
}

function editorClearAll() {
  for (var i = 0; i < 49; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  editor.selectedMT = -1;
  editorRefresh();
}

// ── Stats ──
function editorUpdateStats() {
  var counts = [];
  var regularMrb = [];
  for (var c = 0; c < NUM_COLORS; c++) { counts.push(0); regularMrb.push(0); }
  var total = 0, typeCounts = {}, totalBlockers = 0;
  var tunnelCount = 0, tunnelBoxCount = 0;
  var wallCount = 0;
  var mtCount = 0, mtBoxCount = 0;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (!v) continue;
    if (v.wall) {
      wallCount++;
      continue;
    }
    if (v.mtunnel) {
      // Only the head carries the shared stock
      if (v.role === 'head') {
        mtCount++;
        if (v.contents) {
          mtBoxCount += v.contents.length;
          for (var mc = 0; mc < v.contents.length; mc++) {
            var mItem = v.contents[mc];
            counts[mItem.ci]++;
            if (mItem.type === 'blocker') {
              regularMrb[mItem.ci] += Math.max(0, editor.mrbPerBox - BLOCKER_PER_BOX);
              totalBlockers += BLOCKER_PER_BOX;
            } else {
              regularMrb[mItem.ci] += editor.mrbPerBox;
            }
          }
        }
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
  if (mtCount > 0) {
    html += '<span class="ed-stat-chip" style="background:#C0432C;border:1px solid #8E2A1C">' + mtCount + ' mushroom' + (mtCount > 1 ? 's' : '') + ' (' + mtBoxCount + ' stored)</span>';
  }
  if (totalBlockers > 0) {
    html += '<span class="ed-stat-chip" style="background:' + COLORS[BLOCKER_CI].fill + '">' + totalBlockers + ' blocker mrb</span>';
  }
  for (var c = 0; c < NUM_COLORS; c++) {
    if (counts[c] > 0) html += '<span class="ed-stat-chip" style="background:' + COLORS[c].fill + '">' + counts[c] + '</span>';
  }
  var warn = '';
  var totalAll = total + tunnelBoxCount + mtBoxCount;
  var mtIssues = editorMTIssues();
  if (mtIssues.length > 0) {
    warn = mtIssues[0];
  } else if (totalAll === 0) {
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
  // A mushroom mouth facing nothing would strand its shared stock, so
  // the level cannot be played until every mouth has a cell in front.
  var mtIssues = editorMTIssues();
  if (mtIssues.length > 0) { editorShowToast(mtIssues[0]); return; }
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
          else if (cell.mtunnel) {
            editor.grid[i] = (cell.role === 'tail')
              ? { mtunnel: true, role: 'tail', orient: cell.orient || 'h' }
              : { mtunnel: true, role: 'head', orient: cell.orient || 'h', contents: cell.contents || [] };
          }
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
      editor.selectedMT = -1;
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
