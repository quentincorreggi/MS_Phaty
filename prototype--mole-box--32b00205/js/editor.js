// ============================================================
// editor.js — Level Editor (reads box types from registry)
//             + Tunnel placement, orientation, contents editing
//             + Wall placement
//             + Mole hole placement (holes, moles, custom hop order)
// ============================================================

var editor = {
  grid: [],            // 7x7: null = empty, { ci, type } or { tunnel: true, ... } or { wall: true }
                       //      or { hole: true, ord?, mole?: { ci, type } }
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
  holeMode: false,      // true when placing mole holes
  holeTool: -2,         // -3 = set order, -2 = plain hole, -1 = eraser, 0-7 = mole of that color
  moleType: 'default',  // 'default' or 'hidden' — flavour of placed moles
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
  editor.holeMode = false;
  editor.holeTool = -2;
  editor.moleType = 'default';
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
    } else if (v && v.hole) {
      // Mole hole — optionally with a mole standing on it. The badge is
      // the hole's place in the hop route; a filled badge means the
      // designer pinned it, a faded one means it fell in automatically.
      var isPinned = (typeof v.ord === 'number');
      var routePos = editorHoleOrdinal(i) + 1;
      var badge = '<span class="ed-hole-badge' + (isPinned ? ' pinned' : '') + '">' + routePos + '</span>';
      if (v.mole) {
        var mc = COLORS[v.mole.ci];
        var isHiddenMole = (v.mole.type === 'hidden');
        cell.style.background = isHiddenMole
          ? 'linear-gradient(135deg,#4A4450,#2A2530)'
          : 'linear-gradient(135deg,' + mc.light + ',' + mc.dark + ')';
        cell.style.borderColor = '#6B4A2E';
        cell.style.boxShadow = 'inset 0 0 0 2px rgba(60,40,24,0.55)';
        cell.innerHTML = '<span class="ed-cell-dot" style="color:#fff;font-size:13px">' +
          (isHiddenMole ? '?' : '\uD83D\uDC3E') + '</span>' + badge;
      } else {
        cell.style.background = 'radial-gradient(circle at 50% 50%,#1E1512 0%,#2C2018 45%,#7A5A3A 100%)';
        cell.style.borderColor = '#6B4A2E';
        cell.innerHTML = badge;
      }
      if (editor.holeMode && editor.holeTool === -3) {
        cell.style.borderColor = isPinned ? '#E8A84C' : '#C89A6A';
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

// ── Hop route ──
// Holes carry an optional `ord` (1-based) pinning their place in the
// route. Unpinned holes fall in behind the pinned ones, in reading
// order. This is the same rule initGame() uses to build holeCells.
function editorHoleRoute() {
  var route = [];
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (v && v.hole) route.push({ idx: i, ord: (typeof v.ord === 'number') ? v.ord : null });
  }
  route.sort(function (a, b) {
    var ao = (a.ord === null) ? Infinity : a.ord;
    var bo = (b.ord === null) ? Infinity : b.ord;
    if (ao !== bo) return ao - bo;
    return a.idx - b.idx;
  });
  return route;
}

// Route position of the hole at grid index idx (0-based), or -1
function editorHoleOrdinal(idx) {
  var route = editorHoleRoute();
  for (var i = 0; i < route.length; i++) if (route[i].idx === idx) return i;
  return -1;
}

// Keep pinned ords contiguous (1..n) after holes are added or removed,
// preserving the order the designer clicked them in.
function editorRenumberHoles() {
  var pinned = [];
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (v && v.hole && typeof v.ord === 'number') pinned.push({ idx: i, ord: v.ord });
  }
  pinned.sort(function (a, b) { return a.ord - b.ord; });
  for (var k = 0; k < pinned.length; k++) editor.grid[pinned[k].idx].ord = k + 1;
}

// How many holes are currently pinned
function editorPinnedHoleCount() {
  var n = 0;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (v && v.hole && typeof v.ord === 'number') n++;
  }
  return n;
}

// Drop every pin, so the whole route falls back to reading order
function editorClearHoleOrder() {
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (v && v.hole && typeof v.ord === 'number') delete v.ord;
  }
  if (editor.visible) { editorRenderGrid(); editorRenderToolbar(); editorUpdateStats(); }
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
    editorRenumberHoles();
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    editorRenderGrid();
    editorRenderToolbar();
    editorUpdateStats();
    editorRenderTunnelPanel();
    return;
  }

  if (editor.holeMode) {
    // Hole placement mode
    var existing = editor.grid[idx];
    if (editor.holeTool === -3) {
      // Set order: click holes in the order you want them visited.
      // Clicking an already-numbered hole restarts the sequence there.
      if (!existing || !existing.hole) {
        editorShowToast('Set order only works on holes');
        return;
      }
      if (typeof existing.ord === 'number') {
        for (var ci5 = 0; ci5 < 49; ci5++) {
          var cv = editor.grid[ci5];
          if (cv && cv.hole && typeof cv.ord === 'number') delete cv.ord;
        }
        existing.ord = 1;
      } else {
        existing.ord = editorPinnedHoleCount() + 1;
      }
      editorRenumberHoles();
      editorRenderGrid();
      editorRenderToolbar();
      editorUpdateStats();
      return;
    }
    if (editor.holeTool === -1) {
      editor.grid[idx] = null;
    } else if (editor.holeTool === -2) {
      // Plain hole — clicking an existing plain hole removes it,
      // clicking a hole with a mole takes the mole off it.
      if (existing && existing.hole && existing.mole) delete existing.mole;
      else if (existing && existing.hole) editor.grid[idx] = null;
      else editor.grid[idx] = { hole: true };
    } else {
      // Place a mole — the hole underneath is created automatically,
      // and an existing hole keeps its place in the route.
      if (existing && existing.hole) {
        if (existing.mole && existing.mole.ci === editor.holeTool && existing.mole.type === editor.moleType) {
          delete existing.mole;
        } else {
          existing.mole = { ci: editor.holeTool, type: editor.moleType };
        }
      } else {
        editor.grid[idx] = { hole: true, mole: { ci: editor.holeTool, type: editor.moleType } };
      }
    }
    editorRenumberHoles();
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    editorRenderGrid();
    editorRenderToolbar();
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
      if (existing && !existing.tunnel && !existing.wall && !existing.hole && existing.ci === editor.activeColor && existing.type === editor.activeType) {
        editor.grid[idx] = null;
      } else {
        editor.grid[idx] = { ci: editor.activeColor, type: editor.activeType };
      }
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    }
  }
  editorRenumberHoles();
  editorRenderGrid();
  editorRenderToolbar();
  editorUpdateStats();
  editorRenderTunnelPanel();
}

function editorCellErase(e) {
  e.preventDefault();
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  editor.grid[idx] = null;
  editorRenumberHoles();
  if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  editorRenderGrid();
  editorRenderToolbar();
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
    tb.className = 'ed-type-btn' + (!editor.tunnelMode && !editor.wallMode && !editor.holeMode && editor.activeType === id ? ' active' : '');
    tb.textContent = bt.label;
    tb.setAttribute('data-type', id);
    tb.addEventListener('click', function () {
      editor.activeType = this.getAttribute('data-type');
      editor.tunnelMode = false;
      editor.wallMode = false;
      editor.holeMode = false;
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
    editor.holeMode = false;
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
    editor.holeMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
  });
  typeRow.appendChild(tunnelBtn);

  // Mole hole mode button
  var holeBtn = document.createElement('button');
  holeBtn.className = 'ed-type-btn' + (editor.holeMode ? ' active' : '');
  holeBtn.textContent = '\uD83D\uDC3E Hole';
  holeBtn.style.borderColor = editor.holeMode ? 'rgba(160,110,60,0.6)' : '';
  holeBtn.style.color = editor.holeMode ? '#8A5A2E' : '';
  holeBtn.addEventListener('click', function () {
    editor.holeMode = true;
    editor.wallMode = false;
    editor.tunnelMode = false;
    editorRenderToolbar();
    editorRenderTunnelPanel();
  });
  typeRow.appendChild(holeBtn);

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
  } else if (editor.holeMode) {
    // Hole tools: eraser, plain hole, then a mole in each color
    var holeRow = document.createElement('div');
    holeRow.className = 'ed-color-row';

    var hOrder = document.createElement('button');
    hOrder.className = 'ed-tool' + (editor.holeTool === -3 ? ' active' : '');
    hOrder.style.background = 'linear-gradient(135deg,#E8A84C,#B5741F)';
    hOrder.style.color = '#fff';
    hOrder.style.fontSize = '10px';
    hOrder.innerHTML = '1\u20092\u20093';
    hOrder.title = 'Set order — click holes in the order you want them visited';
    hOrder.addEventListener('click', function () { editor.holeTool = -3; editorRenderToolbar(); editorRenderGrid(); });
    holeRow.appendChild(hOrder);

    var hEraser = document.createElement('button');
    hEraser.className = 'ed-tool' + (editor.holeTool === -1 ? ' active' : '');
    hEraser.style.background = 'rgba(180,165,145,0.5)';
    hEraser.innerHTML = '\u2716';
    hEraser.title = 'Eraser';
    hEraser.addEventListener('click', function () { editor.holeTool = -1; editorRenderToolbar(); editorRenderGrid(); });
    holeRow.appendChild(hEraser);

    var hPlain = document.createElement('button');
    hPlain.className = 'ed-tool' + (editor.holeTool === -2 ? ' active' : '');
    hPlain.style.background = 'radial-gradient(circle at 50% 50%,#1E1512 0%,#2C2018 45%,#7A5A3A 100%)';
    hPlain.style.color = '#E8D8C0';
    hPlain.innerHTML = '\u25CF';
    hPlain.title = 'Empty hole';
    hPlain.addEventListener('click', function () { editor.holeTool = -2; editorRenderToolbar(); editorRenderGrid(); });
    holeRow.appendChild(hPlain);

    for (var hc = 0; hc < NUM_COLORS; hc++) {
      var hb = document.createElement('button');
      hb.className = 'ed-tool' + (editor.holeTool === hc ? ' active' : '');
      hb.style.background = COLORS[hc].fill;
      hb.style.boxShadow = 'inset 0 0 0 2px rgba(60,40,24,0.6)';
      hb.innerHTML = '\uD83D\uDC3E';
      hb.style.fontSize = '11px';
      hb.title = 'Mole — ' + CLR_NAMES[hc];
      hb.setAttribute('data-ci', hc);
      hb.addEventListener('click', function () {
        editor.holeTool = parseInt(this.getAttribute('data-ci'));
        editorRenderToolbar();
        editorRenderGrid();
      });
      holeRow.appendChild(hb);
    }
    el.appendChild(holeRow);

    // Mole flavour toggle + hint
    var moleRow = document.createElement('div');
    moleRow.className = 'ed-color-row';
    var flavours = [['default', 'Default'], ['hidden', 'Hidden']];
    for (var mf = 0; mf < flavours.length; mf++) {
      var mb = document.createElement('button');
      mb.className = 'ed-type-btn' + (editor.moleType === flavours[mf][0] ? ' active' : '');
      mb.textContent = 'Mole: ' + flavours[mf][1];
      mb.setAttribute('data-mt', flavours[mf][0]);
      mb.addEventListener('click', function () {
        editor.moleType = this.getAttribute('data-mt');
        editorRenderToolbar();
      });
      moleRow.appendChild(mb);
    }
    el.appendChild(moleRow);

    // Live route readout
    var route = editorHoleRoute();
    var pinnedN = editorPinnedHoleCount();
    var holeInfo = document.createElement('div');
    holeInfo.className = 'ed-color-row';
    var infoHtml = '';
    if (editor.holeTool === -3) {
      infoHtml += '<span style="font-size:11px;color:#B5741F;font-weight:600">Click holes in the order you want them visited. ' +
        'Click a numbered hole to restart the sequence there.</span>';
    } else {
      infoHtml += '<span style="font-size:11px;color:#9C8A70">Each mole hops to the next number on every tap, ' +
        'then wraps back to 1. Unpinned holes follow in reading order.</span>';
    }
    holeInfo.innerHTML = infoHtml;
    el.appendChild(holeInfo);

    if (route.length > 0) {
      var routeRow = document.createElement('div');
      routeRow.className = 'ed-color-row';
      var chips = [];
      for (var rp = 0; rp < route.length; rp++) {
        var rcell = editor.grid[route[rp].idx];
        var rPinned = (typeof rcell.ord === 'number');
        var rr = Math.floor(route[rp].idx / 7) + 1, rc = (route[rp].idx % 7) + 1;
        chips.push('<span style="font-size:10px;padding:1px 5px;border-radius:6px;' +
          (rPinned ? 'background:rgba(196,122,44,0.9);color:#fff' : 'background:rgba(120,100,80,0.28);color:#6A5A46') +
          '">' + (rp + 1) + ': r' + rr + 'c' + rc + (rcell.mole ? ' \uD83D\uDC3E' : '') + '</span>');
      }
      routeRow.innerHTML = '<span style="font-size:11px;color:#9C8A70;margin-right:2px">Route:</span>' +
        chips.join('<span style="font-size:10px;color:#A89880">\u2192</span>');
      el.appendChild(routeRow);

      if (pinnedN > 0) {
        var resetRow = document.createElement('div');
        resetRow.className = 'ed-color-row';
        var resetBtn = document.createElement('button');
        resetBtn.className = 'ed-type-btn';
        resetBtn.textContent = 'Reset to reading order';
        resetBtn.addEventListener('click', function () { editorClearHoleOrder(); });
        resetRow.appendChild(resetBtn);
        el.appendChild(resetRow);
      }
    }
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
  var holeCount = 0, moleCount = 0;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (!v) continue;
    if (v.wall) {
      wallCount++;
      continue;
    }
    if (v.hole) {
      holeCount++;
      if (v.mole) {
        moleCount++;
        counts[v.mole.ci]++;
        regularMrb[v.mole.ci] += editor.mrbPerBox;
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
  if (holeCount > 0) {
    html += '<span class="ed-stat-chip" style="background:#6B4A2E">' + holeCount + ' hole' + (holeCount > 1 ? 's' : '') +
      (moleCount > 0 ? ' (' + moleCount + ' mole' + (moleCount > 1 ? 's' : '') + ')' : '') + '</span>';
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
  var totalAll = total + tunnelBoxCount + moleCount;
  if (totalAll === 0) {
    warn = 'Place some boxes to create a level';
  } else if (moleCount > 0 && holeCount < 2) {
    warn = 'A mole needs at least 2 holes to hop between';
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
          else if (cell.hole) {
            var hc = { hole: true };
            if (typeof cell.ord === 'number') hc.ord = cell.ord;
            if (cell.mole) hc.mole = { ci: cell.mole.ci, type: cell.mole.type || 'default' };
            editor.grid[i] = hc;
          }
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
