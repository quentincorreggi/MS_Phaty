// ============================================================
// editor.js — Level Editor (reads box types from registry)
//             + Tunnel placement, orientation, contents editing
//             + Wall placement
// ============================================================

var editor = {
  grid: [],            // 7x7: null = empty, { ci, type } or { tunnel: true, ... } or { wall: true } or { safe: true, ... }
  name: 'Custom Level',
  desc: 'My custom level',
  mrbPerBox: 9,
  sortCap: 3,
  lockButtons: 0,
  frostCount: 0,       // # of sort boxes to frost at level start
  activeColor: 0,      // -1=eraser, 0-7=color
  activeType: BoxTypeOrder[0],
  tunnelMode: false,    // true when placing tunnels
  tunnelDir: 'bottom',  // current tunnel direction for new tunnels
  selectedTunnel: -1,   // index of selected tunnel for content editing
  wallMode: false,      // true when placing walls
  safeMode: false,      // true when placing/editing color safes
  selectedSafe: -1,     // anchor idx of selected safe for editing reqs
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
  editor.frostCount = 0;
  editor.activeColor = 0;
  editor.activeType = BoxTypeOrder[0];
  editor.tunnelMode = false;
  editor.tunnelDir = 'bottom';
  editor.selectedTunnel = -1;
  editor.wallMode = false;
  editor.safeMode = false;
  editor.selectedSafe = -1;
}

// ── Safe helpers (editor) ──
function safeAnchorCellsFor(anchorIdx) {
  var r = Math.floor(anchorIdx / 7), c = anchorIdx % 7;
  return [anchorIdx, r * 7 + (c + 1), (r + 1) * 7 + c, (r + 1) * 7 + (c + 1)];
}
function canPlaceSafeAt(anchorIdx) {
  var r = Math.floor(anchorIdx / 7), c = anchorIdx % 7;
  if (r > 5 || c > 5) return false;
  var cells = safeAnchorCellsFor(anchorIdx);
  for (var i = 0; i < cells.length; i++) {
    var v = editor.grid[cells[i]];
    if (v && v.safe) return false;
  }
  return true;
}
function placeSafeAt(anchorIdx) {
  var cells = safeAnchorCellsFor(anchorIdx);
  for (var i = 0; i < cells.length; i++) {
    var ci = cells[i];
    var inner = editor.grid[ci];
    if (ci === anchorIdx) {
      editor.grid[ci] = {
        safe: true, anchor: true, anchorIdx: anchorIdx,
        reqs: [{ ci: 0, target: 2 }, { ci: 1, target: 2 }],
        inner: inner || null
      };
    } else {
      editor.grid[ci] = { safe: true, anchor: false, anchorIdx: anchorIdx, inner: inner || null };
    }
  }
  editor.selectedSafe = anchorIdx;
}
function removeSafeAt(anyCellIdx) {
  var v = editor.grid[anyCellIdx];
  if (!v || !v.safe) return;
  var anchorIdx = v.anchorIdx;
  var cells = safeAnchorCellsFor(anchorIdx);
  for (var i = 0; i < cells.length; i++) {
    var cell = editor.grid[cells[i]];
    editor.grid[cells[i]] = cell && cell.inner ? cell.inner : null;
  }
  if (editor.selectedSafe === anchorIdx) editor.selectedSafe = -1;
}
function findSafeAnchorAt(idx) {
  var v = editor.grid[idx];
  if (v && v.safe) return v.anchorIdx;
  return -1;
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
  editorRenderSafePanel();
}

// ── Grid ──
function editorRenderGrid() {
  var el = document.getElementById('ed-grid');
  el.innerHTML = '';
  for (var i = 0; i < 49; i++) {
    var cell = document.createElement('div');
    cell.className = 'ed-cell';
    var v = editor.grid[i];
    if (v && v.safe) {
      // Safe cell — show inner-box style as faded backdrop + red overlay
      var inner = v.inner;
      if (inner && inner.ci !== undefined) {
        var bt = getBoxType(inner.type);
        var st = bt.editorCellStyle(inner.ci);
        cell.style.background = st.background;
        cell.style.borderColor = st.borderColor;
        cell.innerHTML = bt.editorCellHTML(inner.ci);
      } else if (inner && inner.wall) {
        cell.style.background = 'linear-gradient(135deg,#9A8D7B,#6F6355)';
        cell.style.borderColor = '#8A7D6B';
      } else {
        cell.style.background = 'rgba(180,165,145,0.2)';
        cell.style.borderColor = 'rgba(160,140,120,0.3)';
      }
      var anchorSelected = (editor.selectedSafe === v.anchorIdx);
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;background:rgba(232,80,80,0.55);border:2px solid #B83030;border-radius:6px;pointer-events:none;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;text-shadow:0 1px 2px rgba(0,0,0,0.4)';
      if (v.anchor) {
        var rqStr = '';
        if (v.reqs) {
          for (var rq = 0; rq < v.reqs.length; rq++) rqStr += v.reqs[rq].target + ' ';
        }
        overlay.innerHTML = '<span style="font-size:9px;line-height:1.1;text-align:center">SAFE<br>' + (rqStr.trim() || '—') + '</span>';
      } else {
        overlay.innerHTML = '<span style="opacity:0.5;font-size:14px">▦</span>';
      }
      if (anchorSelected) overlay.style.boxShadow = '0 0 0 2px #FFD080';
      cell.appendChild(overlay);
    } else if (v && v.wall) {
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

  if (editor.safeMode) {
    var existing = editor.grid[idx];
    if (existing && existing.safe) {
      // Select existing safe for editing
      editor.selectedSafe = existing.anchorIdx;
    } else if (editor.activeColor === -1) {
      // No-op in safe mode with eraser
    } else {
      if (canPlaceSafeAt(idx)) {
        placeSafeAt(idx);
      } else {
        editorShowToast('Safe needs a 2×2 area — anchor must be in rows 1–6 and cols 1–6, no overlap');
      }
    }
    editorRenderGrid();
    editorUpdateStats();
    editorRenderSafePanel();
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
  var v = editor.grid[idx];
  if (v && v.safe) {
    removeSafeAt(idx);
  } else {
    editor.grid[idx] = null;
  }
  if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderSafePanel();
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
    tb.className = 'ed-type-btn' + (!editor.tunnelMode && !editor.wallMode && !editor.safeMode && editor.activeType === id ? ' active' : '');
    tb.textContent = bt.label;
    tb.setAttribute('data-type', id);
    tb.addEventListener('click', function () {
      editor.activeType = this.getAttribute('data-type');
      editor.tunnelMode = false;
      editor.wallMode = false;
      editor.safeMode = false;
      editorRenderToolbar();
      editorRenderTunnelPanel();
      editorRenderSafePanel();
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
    editor.safeMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderSafePanel();
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
    editor.safeMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderSafePanel();
  });
  typeRow.appendChild(tunnelBtn);

  // Color Safe mode button
  var safeBtn = document.createElement('button');
  safeBtn.className = 'ed-type-btn' + (editor.safeMode ? ' active' : '');
  safeBtn.textContent = '\uD83D\uDD12 Safe';
  safeBtn.style.borderColor = editor.safeMode ? 'rgba(232,80,80,0.6)' : '';
  safeBtn.style.color = editor.safeMode ? '#B83030' : '';
  safeBtn.addEventListener('click', function () {
    editor.safeMode = true;
    editor.tunnelMode = false;
    editor.wallMode = false;
    editor.activeColor = 0;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderSafePanel();
  });
  typeRow.appendChild(safeBtn);

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
  } else if (editor.safeMode) {
    // Safe mode: hint
    var safeInfo = document.createElement('div');
    safeInfo.className = 'ed-color-row';
    safeInfo.innerHTML = '<span style="font-size:11px;color:#9C8A70">Click a cell to place a 2×2 safe (anchor = top-left). Right-click to remove.</span>';
    el.appendChild(safeInfo);
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

// ── Color Safe panel ──
function editorRenderSafePanel() {
  var container = document.getElementById('ed-safe-panel');
  if (!container) return;

  var anchor = (editor.selectedSafe >= 0 ? editor.grid[editor.selectedSafe] : null);
  var hasSelected = !!(anchor && anchor.safe && anchor.anchor);

  if (!hasSelected) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  var reqs = anchor.reqs || [];
  var html = '';
  html += '<div class="ed-section-title"><span class="icon">🔒</span> Color Safe — Required Colors</div>';
  html += '<div style="font-size:11px;color:#9C8A70;margin-bottom:6px">Pick boxes of these colors elsewhere on the maze to unlock the safe. Add 2–4 colors.</div>';
  html += '<div style="text-align:center">';
  for (var r = 0; r < reqs.length; r++) {
    var rq = reqs[r];
    var c = COLORS[rq.ci];
    html += '<span class="ed-safe-req">';
    html += '<span class="swatch" style="background:' + c.fill + '"></span>';
    html += '<input type="number" min="1" max="20" value="' + rq.target + '" data-rqi="' + r + '" class="ed-safe-count">';
    html += '<button class="rm" data-rmi="' + r + '" title="Remove">✕</button>';
    html += '</span>';
  }
  if (reqs.length === 0) {
    html += '<span style="font-size:11px;color:#9C8A70;font-style:italic">No colors yet — add one below</span>';
  }
  html += '</div>';

  if (reqs.length < 4) {
    html += '<div class="ed-section-title" style="margin-top:10px"><span class="icon">➕</span> Add Color</div>';
    html += '<div class="ed-safe-addrow">';
    for (var ci = 0; ci < NUM_COLORS; ci++) {
      html += '<button class="ed-safe-add-clr" data-ci="' + ci + '" style="background:' + COLORS[ci].fill + '" title="Add ' + CLR_NAMES[ci] + '">' + CLR_NAMES[ci][0].toUpperCase() + '</button>';
    }
    html += '</div>';
  } else {
    html += '<div style="font-size:11px;color:#9C8A70;text-align:center;margin-top:6px">Max 4 colors.</div>';
  }

  container.innerHTML = html;

  // Wire events
  var inputs = container.querySelectorAll('.ed-safe-count');
  for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener('input', function () {
      var idx = parseInt(this.getAttribute('data-rqi'));
      var n = Math.max(1, Math.min(20, parseInt(this.value) || 1));
      if (editor.selectedSafe >= 0 && editor.grid[editor.selectedSafe] && editor.grid[editor.selectedSafe].reqs) {
        editor.grid[editor.selectedSafe].reqs[idx].target = n;
        editorRenderGrid();
      }
    });
  }
  var rms = container.querySelectorAll('.rm');
  for (var i = 0; i < rms.length; i++) {
    rms[i].addEventListener('click', function () {
      var idx = parseInt(this.getAttribute('data-rmi'));
      if (editor.selectedSafe >= 0 && editor.grid[editor.selectedSafe] && editor.grid[editor.selectedSafe].reqs) {
        editor.grid[editor.selectedSafe].reqs.splice(idx, 1);
        editorRenderGrid();
        editorRenderSafePanel();
      }
    });
  }
  var addBtns = container.querySelectorAll('.ed-safe-add-clr');
  for (var i = 0; i < addBtns.length; i++) {
    addBtns[i].addEventListener('click', function () {
      var ci = parseInt(this.getAttribute('data-ci'));
      if (editor.selectedSafe >= 0 && editor.grid[editor.selectedSafe] && editor.grid[editor.selectedSafe].reqs) {
        if (editor.grid[editor.selectedSafe].reqs.length >= 4) return;
        editor.grid[editor.selectedSafe].reqs.push({ ci: ci, target: 2 });
        editorRenderGrid();
        editorRenderSafePanel();
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
  editor.selectedSafe = -1;
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderSafePanel();
}

// ── Stats ──
function editorUpdateStats() {
  var counts = [];
  var regularMrb = [];
  for (var c = 0; c < NUM_COLORS; c++) { counts.push(0); regularMrb.push(0); }
  var total = 0, typeCounts = {}, totalBlockers = 0;
  var tunnelCount = 0, tunnelBoxCount = 0;
  var wallCount = 0;
  var safeAnchors = 0;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (!v) continue;
    if (v.safe) {
      if (v.anchor) safeAnchors++;
      v = v.inner;  // count the underlying box, if any
      if (!v) continue;
    }
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
  if (safeAnchors > 0) {
    html += '<span class="ed-stat-chip" style="background:#E85050;border:1px solid #B83030">' + safeAnchors + ' safe' + (safeAnchors > 1 ? 's' : '') + '</span>';
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
    { label: 'Lock Btns', key: 'lockButtons', min: 0, max: 5, step: 1 },
    { label: 'Frost', key: 'frostCount', min: 0, max: 20, step: 1 }
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
    frostCount: editor.frostCount,
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
          else if (cell.safe) editor.grid[i] = {
              safe: true,
              anchor: !!cell.anchor,
              anchorIdx: cell.anchorIdx !== undefined ? cell.anchorIdx : i,
              reqs: cell.reqs ? cell.reqs.slice() : undefined,
              inner: cell.inner || null
            };
          else if (cell.wall) editor.grid[i] = { wall: true };
          else if (cell.tunnel) editor.grid[i] = { tunnel: true, dir: cell.dir || 'bottom', contents: cell.contents || [] };
          else editor.grid[i] = cell;
        }
      }
      if (lvl.mrbPerBox) editor.mrbPerBox = lvl.mrbPerBox;
      if (lvl.sortCap) editor.sortCap = lvl.sortCap;
      if (lvl.lockButtons !== undefined) editor.lockButtons = lvl.lockButtons;
      if (lvl.frostCount !== undefined) editor.frostCount = lvl.frostCount;
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
