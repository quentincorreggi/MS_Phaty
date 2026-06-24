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
  editor.carouselMode = false;
  editor.selectedCarousel = -1;
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
  editorRenderCarouselPanel();
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
    } else if (v && (v.carouselAnchor || v.carouselCell)) {
      // Carousel cell
      var anchorI = v.carouselAnchor ? i : v.anchorIdx;
      var anchorCell = v.carouselAnchor ? v : editor.grid[anchorI];
      var isSelected = (editor.selectedCarousel === anchorI);
      var isMachinePx = !v.carouselAnchor && v.anchorIdx !== undefined &&
        (i === anchorI + 8);  // center cell = anchor + 8
      if (isMachinePx) {
        cell.style.background = 'linear-gradient(135deg,#3A3530,#1E1C18)';
        cell.style.borderColor = isSelected ? '#FFD080' : '#2A2820';
        if (isSelected) cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.5)';
        cell.innerHTML = '<span class="ed-cell-dot" style="color:rgba(200,180,140,0.7);font-size:13px">&#9881;</span>';
      } else {
        // Ring cell — find which ring index
        var offset = i - anchorI;
        var ringIdx3 = -1;
        for (var ri3 = 0; ri3 < CAROUSEL_RING_OFFSETS.length; ri3++) {
          if (CAROUSEL_RING_OFFSETS[ri3] === offset) { ringIdx3 = ri3; break; }
        }
        var boxData3 = anchorCell && anchorCell.boxes ? anchorCell.boxes[ringIdx3] : null;
        if (boxData3) {
          var bt3 = getBoxType(boxData3.type);
          var st3 = bt3.editorCellStyle(boxData3.ci);
          cell.style.background = st3.background;
          cell.style.borderColor = isSelected ? '#FFD080' : st3.borderColor;
          if (isSelected) cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.5)';
          cell.innerHTML = bt3.editorCellHTML(boxData3.ci);
        } else {
          cell.style.background = 'rgba(60,55,45,0.4)';
          cell.style.borderColor = isSelected ? '#FFD080' : 'rgba(80,70,50,0.5)';
          if (isSelected) cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.5)';
          cell.innerHTML = '';
        }
      }
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

  if (editor.carouselMode) {
    var existing = editor.grid[idx];
    // Click existing carousel cell → select it
    if (existing && (existing.carouselAnchor || existing.carouselCell)) {
      editor.selectedCarousel = existing.carouselAnchor ? idx : existing.anchorIdx;
      editor.selectedTunnel = -1;
      editorRenderGrid();
      editorRenderCarouselPanel();
      return;
    }
    // Place new 3×3 carousel anchored at this cell
    var row3 = Math.floor(idx / 7), col3 = idx % 7;
    if (row3 + 2 > 6 || col3 + 2 > 6) { return; }  // out of bounds
    // Check all 9 cells are empty
    var canPlace = true;
    for (var oi = 0; oi < CAROUSEL_ALL_OFFSETS.length; oi++) {
      var gI = idx + CAROUSEL_ALL_OFFSETS[oi];
      if (editor.grid[gI]) { canPlace = false; break; }
    }
    if (!canPlace) { return; }
    // Build default boxes array (8 boxes, cycling through colors)
    var defaultBoxes = [];
    for (var ri4 = 0; ri4 < 8; ri4++) {
      defaultBoxes.push({ ci: ri4 % NUM_COLORS, type: 'default' });
    }
    // Place anchor cell LAST so the ring loop (which includes offset 0) can't overwrite it
    for (var ri4 = 1; ri4 < 8; ri4++) {
      editor.grid[idx + CAROUSEL_RING_OFFSETS[ri4]] = { carouselCell: true, anchorIdx: idx };
    }
    // Place machine cell
    editor.grid[idx + CAROUSEL_MACHINE_OFFSET] = { carouselCell: true, anchorIdx: idx };
    // Anchor goes last (offset 0, also ring 0)
    editor.grid[idx] = { carouselAnchor: true, boxes: defaultBoxes };
    editor.selectedCarousel = idx;
    editor.selectedTunnel = -1;
    editorRenderGrid();
    editorUpdateStats();
    editorRenderCarouselPanel();
    return;
  }

  if (editor.wallMode) {
    // Wall placement mode
    var existing = editor.grid[idx];
    if (existing && existing.wall) {
      editor.grid[idx] = null;
    } else {
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
  var cell = editor.grid[idx];
  // Remove entire carousel if right-clicking any carousel cell
  if (cell && (cell.carouselAnchor || cell.carouselCell)) {
    var anchorI = cell.carouselAnchor ? idx : cell.anchorIdx;
    for (var oi = 0; oi < CAROUSEL_ALL_OFFSETS.length; oi++) {
      editor.grid[anchorI + CAROUSEL_ALL_OFFSETS[oi]] = null;
    }
    if (editor.selectedCarousel === anchorI) editor.selectedCarousel = -1;
    editorRenderGrid();
    editorUpdateStats();
    editorRenderCarouselPanel();
    return;
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
      editor.carouselMode = false;
      editorRenderToolbar();
      editorRenderTunnelPanel();
      editorRenderCarouselPanel();
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
    editor.carouselMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderCarouselPanel();
  });
  typeRow.appendChild(wallBtn);

  // Carousel mode button
  var carouselBtn = document.createElement('button');
  carouselBtn.className = 'ed-type-btn' + (editor.carouselMode ? ' active' : '');
  carouselBtn.textContent = '\uD83C\uDFA1 Carousel';
  carouselBtn.style.borderColor = editor.carouselMode ? 'rgba(255,165,0,0.6)' : '';
  carouselBtn.style.color = editor.carouselMode ? '#D4903A' : '';
  carouselBtn.addEventListener('click', function () {
    editor.carouselMode = true;
    editor.tunnelMode = false;
    editor.wallMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderCarouselPanel();
  });
  typeRow.appendChild(carouselBtn);

  // Tunnel mode button
  var tunnelBtn = document.createElement('button');
  tunnelBtn.className = 'ed-type-btn' + (editor.tunnelMode ? ' active' : '');
  tunnelBtn.textContent = '\uD83D\uDD73 Tunnel';
  tunnelBtn.style.borderColor = editor.tunnelMode ? 'rgba(255,190,80,0.6)' : '';
  tunnelBtn.style.color = editor.tunnelMode ? '#E8A84C' : '';
  tunnelBtn.addEventListener('click', function () {
    editor.tunnelMode = true;
    editor.wallMode = false;
    editor.carouselMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
    editorRenderCarouselPanel();
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
  } else if (editor.carouselMode) {
    var carInfo = document.createElement('div');
    carInfo.className = 'ed-color-row';
    carInfo.innerHTML = '<span style="font-size:11px;color:#9C8A70">Click a 3×3 area to place a carousel · right-click to remove</span>';
    el.appendChild(carInfo);
  } else if (editor.wallMode) {
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

  // Let carousel panel take priority
  if (editor.selectedCarousel >= 0 && editor.grid[editor.selectedCarousel] && editor.grid[editor.selectedCarousel].carouselAnchor) return;
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

// ── Carousel panel ──
function editorRenderCarouselPanel() {
  var container = document.getElementById('ed-tunnel-panel');
  if (!container) return;

  var anchorI = editor.selectedCarousel;
  if (anchorI < 0 || !editor.grid[anchorI] || !editor.grid[anchorI].carouselAnchor) {
    // Hide only if tunnel panel also not active
    if (editor.selectedTunnel < 0 || !editor.grid[editor.selectedTunnel] || !editor.grid[editor.selectedTunnel].tunnel) {
      container.style.display = 'none';
    }
    return;
  }

  // Hide tunnel panel and show carousel panel
  container.style.display = 'block';
  var carCell = editor.grid[anchorI];

  var html = '<div class="ed-section-title"><span class="icon">🎡</span> Carousel — Configure Boxes</div>';
  html += '<div style="font-size:11px;color:#9C8A70;margin-bottom:8px">Click a color below each ring position to change it</div>';

  // 3×3 grid visual for the carousel
  // Layout: ring positions 0-7 in CW order, center = machine
  // Display as 3×3 with ring positions labeled
  var ringLabels = ['TL', 'T', 'TR', 'R', 'BR', 'B', 'BL', 'L'];
  // Map local 3×3 positions to display
  // 0=TL, 1=T, 2=TR, 3=L, 4=M, 5=R, 6=BL, 7=B, 8=BR
  // Ring CW order: local[0,1,2,5,8,7,6,3] = ring[0,1,2,3,4,5,6,7]
  // localPos → ringIdx:
  var localToRing = { 0: 0, 1: 1, 2: 2, 5: 3, 8: 4, 7: 5, 6: 6, 3: 7 };

  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;max-width:160px;margin:0 auto 10px">';
  for (var lp = 0; lp < 9; lp++) {
    if (lp === 4) {
      html += '<div style="aspect-ratio:1;background:linear-gradient(135deg,#3A3530,#1E1C18);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px">⚙️</div>';
    } else {
      var ri5 = localToRing[lp];
      var bd5 = (carCell.boxes || [])[ri5];
      var bg5 = bd5 ? COLORS[bd5.ci].fill : 'rgba(80,70,50,0.4)';
      var label5 = bd5 ? CLR_NAMES[bd5.ci][0].toUpperCase() : '–';
      html += '<div data-ring="' + ri5 + '" class="ed-carousel-slot" style="aspect-ratio:1;background:' + bg5 + ';border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px;cursor:pointer;border:2px solid rgba(255,255,255,0.2)">' + label5 + '</div>';
    }
  }
  html += '</div>';

  // Color picker row for each ring slot
  html += '<div id="ed-carousel-color-row" style="display:none;flex-wrap:wrap;gap:3px;justify-content:center;margin-bottom:8px"></div>';
  html += '<div style="font-size:10px;color:#9C8A70;text-align:center;margin-bottom:4px">Click a box above to change its color</div>';

  // Quick: randomize all
  html += '<div style="text-align:center"><button class="ed-qbtn" id="ed-carousel-randomize">🎲 Randomize Colors</button></div>';

  container.innerHTML = html;

  // Bind slot clicks
  var slots = container.querySelectorAll('.ed-carousel-slot');
  for (var sl = 0; sl < slots.length; sl++) {
    slots[sl].addEventListener('click', function () {
      var ri6 = parseInt(this.getAttribute('data-ring'));
      var colorRow = document.getElementById('ed-carousel-color-row');
      colorRow.style.display = 'flex';
      colorRow.innerHTML = '';
      for (var ci7 = 0; ci7 < NUM_COLORS; ci7++) {
        var cb7 = document.createElement('button');
        cb7.className = 'ed-tool';
        cb7.style.background = COLORS[ci7].fill;
        cb7.innerHTML = CLR_NAMES[ci7][0].toUpperCase();
        cb7.setAttribute('data-ring', ri6);
        cb7.setAttribute('data-ci', ci7);
        cb7.addEventListener('click', function () {
          var ri7 = parseInt(this.getAttribute('data-ring'));
          var ci8 = parseInt(this.getAttribute('data-ci'));
          if (editor.grid[anchorI]) {
            if (!editor.grid[anchorI].boxes) editor.grid[anchorI].boxes = [];
            editor.grid[anchorI].boxes[ri7] = { ci: ci8, type: 'default' };
            editorRenderGrid();
            editorUpdateStats();
            editorRenderCarouselPanel();
          }
        });
        colorRow.appendChild(cb7);
      }
    });
  }

  var randBtn = document.getElementById('ed-carousel-randomize');
  if (randBtn) {
    randBtn.addEventListener('click', function () {
      if (editor.grid[anchorI]) {
        var cis = [0,1,2,3,4,5,6,7]; shuffle(cis);
        editor.grid[anchorI].boxes = [];
        for (var ri8 = 0; ri8 < 8; ri8++) {
          editor.grid[anchorI].boxes.push({ ci: cis[ri8 % cis.length], type: 'default' });
        }
        editorRenderGrid();
        editorUpdateStats();
        editorRenderCarouselPanel();
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
  editor.selectedCarousel = -1;
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderCarouselPanel();
}

// ── Stats ──
function editorUpdateStats() {
  var counts = [];
  var regularMrb = [];
  for (var c = 0; c < NUM_COLORS; c++) { counts.push(0); regularMrb.push(0); }
  var total = 0, typeCounts = {}, totalBlockers = 0;
  var tunnelCount = 0, tunnelBoxCount = 0;
  var wallCount = 0, carouselBoxCount = 0;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (!v) continue;
    if (v.wall) {
      wallCount++;
      continue;
    }
    if (v.carouselCell) continue;  // counted via anchor
    if (v.carouselAnchor) {
      var cboxes = v.boxes || [];
      for (var ri9 = 0; ri9 < cboxes.length; ri9++) {
        var cb9 = cboxes[ri9];
        if (!cb9) continue;
        carouselBoxCount++;
        counts[cb9.ci]++;
        total++;
        regularMrb[cb9.ci] += editor.mrbPerBox;
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
  if (carouselBoxCount > 0) {
    html += '<span class="ed-stat-chip" style="background:#D4903A">' + carouselBoxCount + ' carousel</span>';
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

// ── Export / Import / Share ──
function editorCopyShareLink() {
  var lvl = editorBuildLevel();
  var encoded = btoa(JSON.stringify(lvl));
  var url = window.location.origin + window.location.pathname + '?level=' + encoded;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function () { editorShowToast('Share link copied!'); })
      .catch(function () { editorShowShareFallback(url); });
  } else { editorShowShareFallback(url); }
}

function editorShowShareFallback(url) {
  var ta = document.getElementById('ed-export-area');
  ta.value = url; ta.style.display = 'block'; ta.select();
  editorShowToast('Copy the link above');
}

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
