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
  selectedCannonPrimary: -1, // primary index of selected cannon group
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
  editor.selectedCannonPrimary = -1;
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
  editorRenderCannonPanel();
}

// ── Cannon group helpers ──

function editorGetCannonGroup(idx) {
  var visited = {}; var queue = [idx]; visited[idx] = true; var group = [idx];
  while (queue.length > 0) {
    var curr = queue.shift();
    var row = Math.floor(curr / 7), col = curr % 7;
    var nbrs = [];
    if (row > 0) nbrs.push((row - 1) * 7 + col);
    if (row < 6) nbrs.push((row + 1) * 7 + col);
    if (col > 0) nbrs.push(row * 7 + (col - 1));
    if (col < 6) nbrs.push(row * 7 + (col + 1));
    for (var n = 0; n < nbrs.length; n++) {
      var ni = nbrs[n];
      if (!visited[ni] && editor.grid[ni] && typeof isCannonType === 'function' && isCannonType(editor.grid[ni].type)) {
        visited[ni] = true; queue.push(ni); group.push(ni);
      }
    }
  }
  group.sort(function (a, b) { return a - b; });
  return group;
}

function editorConsolidateCannonGroup(primaryIdx) {
  if (!editor.grid[primaryIdx]) return;
  var group = editorGetCannonGroup(primaryIdx);
  var combined = (editor.grid[primaryIdx].cannonContents || []).slice();
  for (var i = 0; i < group.length; i++) {
    if (group[i] === primaryIdx) continue;
    var cell = editor.grid[group[i]];
    if (cell && cell.cannonContents && cell.cannonContents.length > 0) {
      combined = combined.concat(cell.cannonContents);
      cell.cannonContents = [];
    }
  }
  editor.grid[primaryIdx].cannonContents = combined;
}

// ── Grid ──
function editorRenderGrid() {
  var el = document.getElementById('ed-grid');
  el.innerHTML = '';

  // Pre-compute cannon group info for badges and selection highlight
  var cannonBadgeCells = {};   // only the badge cell of each group -> pool count
  var cannonGroupPrimaryMap = {};
  var cannonGroupVisited2 = {};
  for (var k = 0; k < 49; k++) {
    if (!editor.grid[k] || !editor.grid[k].type || !(typeof isCannonType === 'function' && isCannonType(editor.grid[k].type)) || cannonGroupVisited2[k]) continue;
    var grp2 = editorGetCannonGroup(k);
    var prim2 = grp2[0];
    var poolCnt2 = (editor.grid[prim2] && editor.grid[prim2].cannonContents) ? editor.grid[prim2].cannonContents.length : 0;
    // Find top-right cell of this group
    var bdgCell = grp2[0];
    var bdgRow = Math.floor(bdgCell / 7), bdgCol = bdgCell % 7;
    for (var gi2 = 1; gi2 < grp2.length; gi2++) {
      var gcR2 = Math.floor(grp2[gi2] / 7), gcC2 = grp2[gi2] % 7;
      if (gcC2 > bdgCol || (gcC2 === bdgCol && gcR2 < bdgRow)) {
        bdgCell = grp2[gi2]; bdgRow = gcR2; bdgCol = gcC2;
      }
    }
    cannonBadgeCells[bdgCell] = poolCnt2;
    for (var gi2b = 0; gi2b < grp2.length; gi2b++) {
      cannonGroupPrimaryMap[grp2[gi2b]] = prim2;
      cannonGroupVisited2[grp2[gi2b]] = true;
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
      if (typeof isCannonType === 'function' && isCannonType(v.type)) {
        if (cannonBadgeCells.hasOwnProperty(i)) {
          cell.innerHTML += '<span class="ed-tunnel-badge">' + cannonBadgeCells[i] + '</span>';
        }
        if (editor.selectedCannonPrimary >= 0 && cannonGroupPrimaryMap[i] === editor.selectedCannonPrimary) {
          cell.style.borderColor = '#FFD080';
          cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.5)';
        }
      }
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
      editor.selectedCannonPrimary = -1;
    } else {
      var existing = editor.grid[idx];
      var placingCannon = typeof isCannonType === 'function' && isCannonType(editor.activeType);
      var clickingCannon = existing && !existing.tunnel && !existing.wall && typeof isCannonType === 'function' && isCannonType(existing.type);

      if (clickingCannon) {
        // Clicking an existing cannon cell → select its group for pool editing
        var primary = editorGetCannonGroup(idx)[0];
        editorConsolidateCannonGroup(primary);
        editor.selectedCannonPrimary = primary;
        editor.selectedTunnel = -1;
      } else if (placingCannon) {
        // Placing a new cannon cell (or toggling off)
        if (existing && !existing.tunnel && !existing.wall && existing.ci === editor.activeColor && existing.type === editor.activeType) {
          editor.grid[idx] = null;
          editor.selectedCannonPrimary = -1;
        } else {
          editor.grid[idx] = { ci: editor.activeColor, type: editor.activeType, cannonContents: [] };
          var primary2 = editorGetCannonGroup(idx)[0];
          editorConsolidateCannonGroup(primary2);
          editor.selectedCannonPrimary = primary2;
          editor.selectedTunnel = -1;
        }
      } else {
        // Regular non-cannon box placement
        editor.selectedCannonPrimary = -1;
        if (existing && !existing.tunnel && !existing.wall && existing.ci === editor.activeColor && existing.type === editor.activeType) {
          editor.grid[idx] = null;
        } else {
          editor.grid[idx] = { ci: editor.activeColor, type: editor.activeType };
        }
        if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
      }
    }
  }
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderCannonPanel();
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

// ── Cannon pool editor panel ──
function editorRenderCannonPanel() {
  var container = document.getElementById('ed-cannon-panel');
  if (!container) return;

  var primary = editor.selectedCannonPrimary;
  if (primary < 0 || !editor.grid[primary] || !(typeof isCannonType === 'function' && isCannonType(editor.grid[primary].type))) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  var group = editorGetCannonGroup(primary);
  var pool = editor.grid[primary].cannonContents || [];
  var html = '';

  html += '<div class="ed-section-title"><span class="icon">&#9883;</span> Cannonade — ' + group.length + ' cell' + (group.length > 1 ? 's' : '') + ' — Shared Pool</div>';

  // Pool contents list
  html += '<div class="ed-section-title" style="margin-top:4px"><span class="icon">&#128230;</span> Stored Boxes (' + pool.length + ')</div>';
  html += '<div class="ed-tunnel-contents">';
  if (pool.length === 0) {
    html += '<span style="font-size:11px;color:#9C8A70;font-style:italic">Empty — add boxes below</span>';
  } else {
    for (var pi = 0; pi < pool.length; pi++) {
      var item = pool[pi];
      var c = COLORS[item.ci];
      var typeLabel = (BoxTypes[item.type] || BoxTypes[BoxTypeOrder[0]]).label;
      html += '<span class="ed-tunnel-item" data-pidx="' + pi + '" title="' + CLR_NAMES[item.ci] + ' ' + typeLabel + ' — click to remove" style="background:' + c.fill + '">';
      html += '<span style="font-size:8px;opacity:0.7">' + typeLabel[0] + '</span>';
      html += '</span>';
    }
  }
  html += '</div>';

  // Add box controls
  html += '<div class="ed-section-title" style="margin-top:8px"><span class="icon">&#10133;</span> Add Box to Pool</div>';
  html += '<div class="ed-tunnel-add-row">';
  html += '<select id="ed-cannon-add-type" class="ed-tunnel-select">';
  for (var t = 0; t < BoxTypeOrder.length; t++) {
    var tid = BoxTypeOrder[t];
    if (typeof isCannonType === 'function' && isCannonType(tid)) continue;
    html += '<option value="' + tid + '">' + BoxTypes[tid].label + '</option>';
  }
  html += '</select>';
  html += '</div>';
  html += '<div class="ed-tunnel-add-colors">';
  for (var ci3 = 0; ci3 < NUM_COLORS; ci3++) {
    html += '<button class="ed-tunnel-add-clr" data-ci="' + ci3 + '" style="background:' + COLORS[ci3].fill + '" title="Add ' + CLR_NAMES[ci3] + '">' + CLR_NAMES[ci3][0].toUpperCase() + '</button>';
  }
  html += '</div>';

  if (pool.length > 0) {
    html += '<div style="text-align:center;margin-top:6px"><button class="ed-qbtn" id="ed-cannon-clear">Clear All</button></div>';
  }

  container.innerHTML = html;

  // Bind remove-item events
  var items = container.querySelectorAll('.ed-tunnel-item');
  for (var it = 0; it < items.length; it++) {
    items[it].addEventListener('click', function () {
      var pidx = parseInt(this.getAttribute('data-pidx'));
      var p2 = editor.selectedCannonPrimary;
      if (p2 >= 0 && editor.grid[p2] && editor.grid[p2].cannonContents) {
        editor.grid[p2].cannonContents.splice(pidx, 1);
        editorRenderGrid(); editorRenderCannonPanel(); editorUpdateStats();
      }
    });
  }

  // Bind add-color events
  var addClrs = container.querySelectorAll('.ed-tunnel-add-clr');
  for (var ac = 0; ac < addClrs.length; ac++) {
    addClrs[ac].addEventListener('click', function () {
      var ci4 = parseInt(this.getAttribute('data-ci'));
      var typeEl = document.getElementById('ed-cannon-add-type');
      var type = typeEl ? typeEl.value : 'default';
      var p2 = editor.selectedCannonPrimary;
      if (p2 >= 0 && editor.grid[p2]) {
        if (!editor.grid[p2].cannonContents) editor.grid[p2].cannonContents = [];
        editor.grid[p2].cannonContents.push({ ci: ci4, type: type });
        editorRenderGrid(); editorRenderCannonPanel(); editorUpdateStats();
      }
    });
  }

  var clearBtn = document.getElementById('ed-cannon-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      var p2 = editor.selectedCannonPrimary;
      if (p2 >= 0 && editor.grid[p2]) {
        editor.grid[p2].cannonContents = [];
        editorRenderGrid(); editorRenderCannonPanel(); editorUpdateStats();
      }
    });
  }
}

// ── Quick actions ──
function editorFillRandom() {
  for (var i = 0; i < 49; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  editor.selectedCannonPrimary = -1;
  var cl = [];
  for (var c = 0; c < 4; c++) for (var n = 0; n < 6; n++) cl.push(c);
  shuffle(cl);
  var indices = []; for (var i = 0; i < 49; i++) indices.push(i);
  shuffle(indices);
  for (var i = 0; i < cl.length; i++) editor.grid[indices[i]] = { ci: cl[i], type: 'default' };
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderCannonPanel();
}

function editorClearAll() {
  for (var i = 0; i < 49; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  editor.selectedCannonPrimary = -1;
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderCannonPanel();
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
      var vIsCannon = typeof isCannonType === 'function' && isCannonType(v.type);
      counts[v.ci]++;
      total++;
      typeCounts[v.type] = (typeCounts[v.type] || 0) + 1;
      if (vIsCannon) {
        // Underlying box marbles (per cell)
        var vUType = v.type === 'cannon_hidden' ? 'hidden' : (v.type === 'cannon_ice' ? 'ice' : (v.type === 'cannon_blocker' ? 'blocker' : 'default'));
        if (vUType === 'blocker') {
          regularMrb[v.ci] += Math.max(0, editor.mrbPerBox - BLOCKER_PER_BOX);
          totalBlockers += BLOCKER_PER_BOX;
        } else {
          regularMrb[v.ci] += editor.mrbPerBox;
        }
        // Pool marbles — only count on primary cell (to avoid double-counting groups)
        var vGroup = editorGetCannonGroup(i);
        if (vGroup[0] === i && v.cannonContents) {
          for (var pc2 = 0; pc2 < v.cannonContents.length; pc2++) {
            var pItem2 = v.cannonContents[pc2];
            if (pItem2.type === 'blocker') {
              regularMrb[pItem2.ci] += Math.max(0, editor.mrbPerBox - BLOCKER_PER_BOX);
              totalBlockers += BLOCKER_PER_BOX;
            } else {
              regularMrb[pItem2.ci] += editor.mrbPerBox;
            }
          }
        }
      } else if (v.type === 'blocker') {
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
      editor.selectedCannonPrimary = -1;
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
