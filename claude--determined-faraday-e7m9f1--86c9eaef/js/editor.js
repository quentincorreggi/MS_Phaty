// ============================================================
// editor.js — Level Editor (reads box types from registry)
//             + Tunnel placement, orientation, contents editing
//             + Wall placement
// ============================================================

var editor = {
  grid: [],            // 7x7: null = empty, { ci, type }, { tunnel: true, ... },
                       //      { wall: true } or { elevator: true, ... }
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
  elevMode: false,      // true when authoring elevators
  elevTool: 'paint',    // paint | erase | move | tag | split | merge | classic
  activeElev: -1,       // shape id the paint/re-tag tools grow
  pendingCell: -1,      // first click of a two-click tool
  layer: 'surface',     // which floor the colour buttons paint: surface | deep
  undoStack: [],
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
  editor.elevMode = false;
  editor.elevTool = 'paint';
  editor.activeElev = -1;
  editor.pendingCell = -1;
  editor.layer = 'surface';
  editor.undoStack = [];
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
  editorRenderElevPanel();
  buildPresetButtons('ed-presets', loadPresetIntoEditor);
}

// Load one of the test layouts straight onto the editor grid.
function loadPresetIntoEditor(n) {
  var p = ELEV_PRESETS[n];
  if (!p) return;
  edPushUndo();
  var lvl = p.build();
  editor.grid = lvl.grid;
  editor.name = lvl.name;
  editor.desc = lvl.desc;
  editor.mrbPerBox = lvl.mrbPerBox;
  editor.sortCap = lvl.sortCap;
  editor.activeElev = -1;
  editor.selectedTunnel = -1;
  editor.pendingCell = -1;
  var nameEl = document.getElementById('ed-name');
  var descEl = document.getElementById('ed-desc');
  if (nameEl) nameEl.value = editor.name;
  if (descEl) descEl.value = editor.desc;
  editorBuildUI();
  editorShowToast('Loaded ' + p.name);
}

// Redraw everything that a grid change can affect.
function editorRefresh() {
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderElevPanel();
}

// ── Undo ──

function edPushUndo() {
  editor.undoStack.push(JSON.stringify(editor.grid));
  if (editor.undoStack.length > 60) editor.undoStack.shift();
}

function editorUndo() {
  if (!editor.undoStack.length) { editorShowToast('Nothing to undo'); return; }
  editor.grid = JSON.parse(editor.undoStack.pop());
  editor.pendingCell = -1;
  if (editor.activeElev >= 0 && !edElevCells(editor.activeElev).length) editor.activeElev = -1;
  editorRefresh();
  editorShowToast('Undone');
}

// ── Modular elevator helpers ──
//
// Shape membership is explicit: every elevator cell stores the id of
// the shape it belongs to. Two shapes that happen to touch are never
// merged behind the designer's back — only the Merge tool does that.

function edElevCells(eid) {
  var cells = [];
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (v && v.elevator && v.eid === eid) cells.push(i);
  }
  return cells;
}

function edElevIds() {
  var seen = {}, ids = [];
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (v && v.elevator && !seen[v.eid]) { seen[v.eid] = true; ids.push(v.eid); }
  }
  ids.sort(function (a, b) { return a - b; });
  return ids;
}

function edNewElevId() {
  var max = -1;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (v && v.elevator && v.eid > max) max = v.eid;
  }
  return max + 1;
}

function edElevIsClassic(eid) {
  var cells = edElevCells(eid);
  return cells.length > 0 && !!editor.grid[cells[0]].classic;
}

function edAreNeighbours(a, b) {
  var ar = Math.floor(a / 7), ac = a % 7, br = Math.floor(b / 7), bc = b % 7;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

// Edge-adjacent only. A cell touching a shape at a corner is NOT
// connected to it, and starts a shape of its own instead.
function edElevAdjacent(idx, cells) {
  for (var i = 0; i < cells.length; i++) if (edAreNeighbours(idx, cells[i])) return true;
  return false;
}

function edElevFree(idx) {
  var v = editor.grid[idx];
  return !v || (!v.elevator && !v.wall && !v.tunnel);
}

// After an edit, a shape may no longer be in one piece. Split it.
function edElevRegroup(eid) {
  var cells = edElevCells(eid);
  if (cells.length <= 1) return 1;
  var comps = elevComponents(cells, 7, 7);
  if (comps.length <= 1) return 1;
  for (var i = 1; i < comps.length; i++) {
    var nid = edNewElevId();
    for (var k = 0; k < comps[i].length; k++) editor.grid[comps[i][k]].eid = nid;
  }
  return comps.length;
}

function edElevMakeCell(eid, classic, surface, deep) {
  return { elevator: true, eid: eid, classic: !!classic, surface: surface || null, deep: deep || null };
}

// Paint: extend the active shape, or start a new one.
function edElevPaint(idx) {
  var v = editor.grid[idx];
  if (v && v.elevator) { editor.activeElev = v.eid; return; }
  if (v && (v.wall || v.tunnel)) { editorShowToast('That cell is a wall or a tunnel'); return; }

  edPushUndo();
  var active = editor.activeElev;
  var cells = active >= 0 ? edElevCells(active) : [];
  var startNew = false;
  if (!cells.length) startNew = true;
  else if (editor.grid[cells[0]].classic) startNew = true;
  else if (!edElevAdjacent(idx, cells)) startNew = true;

  if (startNew) {
    active = edNewElevId();
    editor.activeElev = active;
    if (cells.length) editorShowToast('Not edge-connected — started shape ' + (active + 1));
  }
  // A box already painted here becomes this cell's surface box.
  var surface = (v && v.ci >= 0) ? { ci: v.ci, type: v.type || 'default' } : null;
  editor.grid[idx] = edElevMakeCell(active, false, surface, null);
}

function edElevErase(idx) {
  var v = editor.grid[idx];
  if (!v || !v.elevator) return;
  edPushUndo();
  var eid = v.eid;
  if (v.classic) {
    var all = edElevCells(eid);
    for (var i = 0; i < all.length; i++) editor.grid[all[i]] = null;
    editorShowToast('Classic elevator removed');
  } else {
    editor.grid[idx] = null;
    var parts = edElevRegroup(eid);
    if (parts > 1) editorShowToast('Shape fell apart into ' + parts + ' shapes');
  }
  if (!edElevCells(editor.activeElev).length) editor.activeElev = -1;
}

// Move a whole shape, boxes and all.
function edElevMove(fromIdx, toIdx) {
  var v = editor.grid[fromIdx];
  if (!v || !v.elevator) return;
  var eid = v.eid;
  var cells = edElevCells(eid);
  var dr = Math.floor(toIdx / 7) - Math.floor(fromIdx / 7);
  var dc = (toIdx % 7) - (fromIdx % 7);
  if (!dr && !dc) return;

  var inShape = {}, targets = [];
  for (var i = 0; i < cells.length; i++) inShape[cells[i]] = true;
  for (var k = 0; k < cells.length; k++) {
    var r = Math.floor(cells[k] / 7) + dr, c = (cells[k] % 7) + dc;
    if (r < 0 || r > 6 || c < 0 || c > 6) { editorShowToast('That would run off the grid'); return; }
    var t = r * 7 + c;
    if (!inShape[t] && !edElevFree(t)) { editorShowToast('Something is already there'); return; }
    targets.push(t);
  }

  edPushUndo();
  var specs = [];
  for (var s = 0; s < cells.length; s++) specs.push(editor.grid[cells[s]]);
  for (var d = 0; d < cells.length; d++) editor.grid[cells[d]] = null;
  for (var n = 0; n < targets.length; n++) editor.grid[targets[n]] = specs[n];
  editor.activeElev = eid;
}

// Re-tag one cell from its shape to the active shape.
function edElevTag(idx) {
  var v = editor.grid[idx];
  if (!v || !v.elevator) { editorShowToast('Pick an elevator cell'); return; }
  var target = editor.activeElev;
  if (target < 0) { editorShowToast('Select a shape first'); return; }
  if (target === v.eid) { editorShowToast('Already in shape ' + (target + 1)); return; }
  if (v.classic || edElevIsClassic(target)) { editorShowToast("The classic 2x2 can't be re-tagged"); return; }
  var tCells = edElevCells(target);
  if (tCells.length && !edElevAdjacent(idx, tCells)) {
    editorShowToast('That cell must touch shape ' + (target + 1));
    return;
  }
  edPushUndo();
  var donor = v.eid;
  v.eid = target;
  edElevRegroup(donor);
}

// Cut the link between two side-by-side cells of one shape.
function edElevSplit(a, b) {
  var va = editor.grid[a], vb = editor.grid[b];
  if (!va || !vb || !va.elevator || !vb.elevator) { editorShowToast('Pick two elevator cells'); return; }
  if (va.eid !== vb.eid) { editorShowToast('Those are already separate shapes'); return; }
  if (va.classic) { editorShowToast("The classic 2x2 can't be split"); return; }
  if (!edAreNeighbours(a, b)) { editorShowToast('Pick two cells side by side'); return; }
  var cells = edElevCells(va.eid);
  var comps = elevComponents(cells, 7, 7, a, b);
  if (comps.length < 2) {
    editorShowToast("That cut doesn't separate the shape — there's a way round");
    return;
  }
  edPushUndo();
  for (var i = 1; i < comps.length; i++) {
    var nid = edNewElevId();
    for (var k = 0; k < comps[i].length; k++) editor.grid[comps[i][k]].eid = nid;
  }
  editorShowToast('Split into ' + comps.length + ' shapes');
}

// Fold shape B into shape A. They must be edge-connected.
function edElevMerge(a, b) {
  var va = editor.grid[a], vb = editor.grid[b];
  if (!va || !vb || !va.elevator || !vb.elevator) { editorShowToast('Pick two elevator cells'); return; }
  if (va.eid === vb.eid) { editorShowToast('Those are already one shape'); return; }
  if (va.classic || vb.classic) { editorShowToast("The classic 2x2 can't be merged"); return; }
  var cellsA = edElevCells(va.eid), cellsB = edElevCells(vb.eid);
  var touch = false;
  for (var i = 0; i < cellsB.length && !touch; i++) touch = edElevAdjacent(cellsB[i], cellsA);
  if (!touch) { editorShowToast('Those shapes do not touch edge to edge'); return; }
  edPushUndo();
  for (var k = 0; k < cellsB.length; k++) editor.grid[cellsB[k]].eid = va.eid;
  editor.activeElev = va.eid;
  editorShowToast('Merged into shape ' + (va.eid + 1));
}

function edElevPlaceClassic(anchor) {
  var r = Math.floor(anchor / 7), c = anchor % 7;
  if (r > 5 || c > 5) { editorShowToast('A 2x2 does not fit there'); return; }
  var cells = [anchor, anchor + 1, anchor + 7, anchor + 8];
  for (var i = 0; i < cells.length; i++) {
    if (!edElevFree(cells[i])) { editorShowToast('Something is already there'); return; }
  }
  edPushUndo();
  var eid = edNewElevId();
  for (var k = 0; k < cells.length; k++) {
    var old = editor.grid[cells[k]];
    var surface = (old && old.ci >= 0) ? { ci: old.ci, type: old.type || 'default' } : null;
    editor.grid[cells[k]] = edElevMakeCell(eid, true, surface, null);
  }
  editor.activeElev = eid;
}

// Edit-mode overlay colour, so grouping is visible even where two
// shapes touch. Play mode uses the runtime colourways.
var ED_SHAPE_COLORS = ['#5FD4E8', '#B98CF5', '#9BE45E', '#FF8FB1', '#FFA24C', '#6FA8FF'];

function edElevShapeColor(eid) {
  if (edElevIsClassic(eid)) return '#FFC048';
  var ids = edElevIds(), n = 0;
  for (var i = 0; i < ids.length; i++) if (ids[i] === eid) { n = i; break; }
  return ED_SHAPE_COLORS[n % ED_SHAPE_COLORS.length];
}

// How many boxes on this board can never be opened, however it is
// played? Walls (and the grid's top/left/right edges) are the only
// permanent blockers, so this catches authoring mistakes before the
// level is ever played.
function edCountEnclosed() {
  var everPassable = [], isBox = [];
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    var box = !!(v && (v.elevator ? v.surface : (!v.wall && !v.tunnel && v.ci >= 0)));
    var blocked = !!(v && (v.wall || v.tunnel));
    isBox[i] = box;
    everPassable[i] = !box && !blocked;
  }
  var changed = true;
  while (changed) {
    changed = false;
    var reach = edFloodBottom(everPassable);
    for (var k = 0; k < 49; k++) {
      if (!isBox[k] || everPassable[k]) continue;
      var r = Math.floor(k / 7), c = k % 7;
      var ok = (r === 6);
      if (!ok && r > 0 && reach[k - 7]) ok = true;
      if (!ok && r < 6 && reach[k + 7]) ok = true;
      if (!ok && c > 0 && reach[k - 1]) ok = true;
      if (!ok && c < 6 && reach[k + 1]) ok = true;
      if (ok) { everPassable[k] = true; changed = true; }
    }
  }
  var n = 0;
  for (var m = 0; m < 49; m++) if (isBox[m] && !everPassable[m]) n++;
  return n;
}

function edFloodBottom(passable) {
  var reach = [], queue = [];
  for (var i = 0; i < 49; i++) reach.push(false);
  for (var c = 0; c < 7; c++) if (passable[42 + c]) { reach[42 + c] = true; queue.push(42 + c); }
  var head = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    var r = Math.floor(cur / 7), cc = cur % 7;
    var nb = [];
    if (r > 0) nb.push(cur - 7);
    if (r < 6) nb.push(cur + 7);
    if (cc > 0) nb.push(cur - 1);
    if (cc < 6) nb.push(cur + 1);
    for (var n = 0; n < nb.length; n++) if (!reach[nb[n]] && passable[nb[n]]) { reach[nb[n]] = true; queue.push(nb[n]); }
  }
  return reach;
}

// ── Grid ──
function editorRenderGrid() {
  var el = document.getElementById('ed-grid');
  el.innerHTML = '';
  var deepLayer = (editor.layer === 'deep');
  for (var i = 0; i < 49; i++) {
    var cell = document.createElement('div');
    cell.className = 'ed-cell';
    var v = editor.grid[i];
    if (v && v.elevator) {
      // Elevator cell — the shape's colour and number make grouping
      // explicit, even where two shapes are flush against each other.
      var shapeCol = edElevShapeColor(v.eid);
      var box = deepLayer ? v.deep : v.surface;
      if (box) {
        var bt2 = getBoxType(box.type);
        cell.style.background = bt2.editorCellStyle(box.ci).background;
      } else {
        cell.style.background = 'linear-gradient(135deg,#4B5866,#2B3340)';
      }
      cell.style.borderColor = shapeCol;
      if (v.eid === editor.activeElev) cell.style.boxShadow = '0 0 0 2px ' + shapeCol;
      var other = deepLayer ? v.surface : v.deep;
      var otherDot = other
        ? '<span class="ed-elev-deep" style="background:' + COLORS[other.ci].fill + '"></span>'
        : '<span class="ed-elev-deep ed-elev-deep-empty"></span>';
      cell.innerHTML = '<span class="ed-elev-tag" style="color:' + shapeCol + '">'
        + (v.classic ? 'C' : (v.eid + 1)) + '</span>' + otherDot;
      if (editor.pendingCell === i) cell.classList.add('ed-cell-pending');
    } else if (deepLayer) {
      // Only elevator cells have a deep floor
      cell.style.background = 'rgba(150,140,125,0.18)';
      cell.style.borderColor = 'rgba(160,140,120,0.2)';
      cell.style.opacity = '0.45';
    } else if (v && v.wall) {
      cell.style.background = 'linear-gradient(135deg,#9A8D7B,#6F6355)';
      cell.style.borderColor = '#8A7D6B';
      cell.innerHTML = '<span class="ed-cell-dot" style="color:rgba(255,255,255,0.5);font-size:14px">&#9632;</span>';
    } else if (v && v.tunnel) {
      var isSelected = (editor.selectedTunnel === i);
      cell.style.background = 'linear-gradient(135deg,#3D3548,#252030)';
      cell.style.borderColor = isSelected ? '#FFD080' : '#6A6070';
      if (isSelected) cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.5)';
      var arrow = TUNNEL_DIR_ARROWS[v.dir] || '▼';
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
  var v = editor.grid[idx];

  // ── Elevator authoring ──
  if (editor.elevMode) {
    var tool = editor.elevTool;
    if (tool === 'paint')        edElevPaint(idx);
    else if (tool === 'erase')   edElevErase(idx);
    else if (tool === 'tag')     edElevTag(idx);
    else if (tool === 'classic') edElevPlaceClassic(idx);
    else if (tool === 'move' || tool === 'split' || tool === 'merge') {
      if (editor.pendingCell < 0) {
        if (!v || !v.elevator) { editorShowToast('Start on an elevator cell'); return; }
        editor.pendingCell = idx;
        editor.activeElev = v.eid;
      } else {
        var first = editor.pendingCell;
        editor.pendingCell = -1;
        if (tool === 'move')       edElevMove(first, idx);
        else if (tool === 'split') edElevSplit(first, idx);
        else                       edElevMerge(first, idx);
      }
    }
    editorRefresh();
    return;
  }

  // ── Painting boxes ──
  // On an elevator cell the active layer decides which floor is set.
  if (v && v.elevator) {
    if (editor.wallMode || editor.tunnelMode) {
      editorShowToast('That cell belongs to an elevator');
      return;
    }
    var deepLayer = (editor.layer === 'deep');
    if (deepLayer && editor.activeColor >= 0 && ELEV_DEEP_TYPES.indexOf(editor.activeType) < 0) {
      editorShowToast('The lifted floor takes normal or blocker boxes only');
      return;
    }
    edPushUndo();
    var cur = deepLayer ? v.deep : v.surface;
    var next;
    if (editor.activeColor === -1) next = null;
    else if (cur && cur.ci === editor.activeColor && cur.type === editor.activeType) next = null;
    else next = { ci: editor.activeColor, type: editor.activeType };
    if (deepLayer) v.deep = next; else v.surface = next;
    editor.activeElev = v.eid;
    editorRefresh();
    return;
  }

  if (editor.layer === 'deep') {
    editorShowToast('Only elevator cells have a lifted floor');
    return;
  }

  if (editor.wallMode) {
    edPushUndo();
    if (v && v.wall) editor.grid[idx] = null;
    else editor.grid[idx] = { wall: true };
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    editorRefresh();
    return;
  }

  if (editor.tunnelMode) {
    edPushUndo();
    if (v && v.tunnel) {
      editor.selectedTunnel = idx;
    } else if (editor.activeColor === -1) {
      editor.grid[idx] = null;
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    } else {
      editor.grid[idx] = { tunnel: true, dir: editor.tunnelDir, contents: [] };
      editor.selectedTunnel = idx;
    }
    editorRefresh();
    return;
  }

  // Normal box painting
  edPushUndo();
  if (editor.activeColor === -1) {
    editor.grid[idx] = null;
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  } else {
    if (v && !v.tunnel && !v.wall && v.ci === editor.activeColor && v.type === editor.activeType) {
      editor.grid[idx] = null;
    } else {
      editor.grid[idx] = { ci: editor.activeColor, type: editor.activeType };
    }
    if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  }
  editorRefresh();
}

function editorCellErase(e) {
  e.preventDefault();
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  var v = editor.grid[idx];
  if (v && v.elevator) { edElevErase(idx); editorRefresh(); return; }
  edPushUndo();
  editor.grid[idx] = null;
  if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  editorRefresh();
}
// ── Toolbar: layer toggle + mode selector + per-mode second row ──
function editorRenderToolbar() {
  var el = document.getElementById('ed-toolbar');
  el.innerHTML = '';

  // Layer toggle — which floor the colour buttons paint onto
  var layerRow = document.createElement('div');
  layerRow.className = 'ed-layer-row';
  var layers = [
    { id: 'surface', label: 'Surface' },
    { id: 'deep', label: 'Lifted floor' }
  ];
  for (var li = 0; li < layers.length; li++) {
    var lb = document.createElement('button');
    lb.className = 'ed-layer-btn' + (editor.layer === layers[li].id ? ' active' : '');
    lb.textContent = layers[li].label;
    lb.setAttribute('data-layer', layers[li].id);
    lb.addEventListener('click', function () {
      editor.layer = this.getAttribute('data-layer');
      if (editor.layer === 'deep' && ELEV_DEEP_TYPES.indexOf(editor.activeType) < 0) {
        editor.activeType = ELEV_DEEP_TYPES[0];
      }
      editorRefresh();
    });
    layerRow.appendChild(lb);
  }
  el.appendChild(layerRow);

  // Mode row: box types + Wall + Tunnel + Elevator
  var typeRow = document.createElement('div');
  typeRow.className = 'ed-type-row';

  var plainMode = (!editor.tunnelMode && !editor.wallMode && !editor.elevMode);
  for (var t = 0; t < BoxTypeOrder.length; t++) {
    var id = BoxTypeOrder[t];
    var bt = BoxTypes[id];
    var deepOnly = (editor.layer === 'deep' && ELEV_DEEP_TYPES.indexOf(id) < 0);
    var tb = document.createElement('button');
    tb.className = 'ed-type-btn' + (plainMode && editor.activeType === id ? ' active' : '');
    tb.textContent = bt.label;
    tb.disabled = deepOnly;
    if (deepOnly) tb.title = 'The lifted floor takes normal or blocker boxes only';
    tb.setAttribute('data-type', id);
    tb.addEventListener('click', function () {
      editor.activeType = this.getAttribute('data-type');
      editor.tunnelMode = false;
      editor.wallMode = false;
      editor.elevMode = false;
      editor.pendingCell = -1;
      editorRefresh();
    });
    typeRow.appendChild(tb);
  }

  var wallBtn = document.createElement('button');
  wallBtn.className = 'ed-type-btn' + (editor.wallMode ? ' active' : '');
  wallBtn.textContent = '■ Wall';
  wallBtn.addEventListener('click', function () {
    editor.wallMode = true; editor.tunnelMode = false; editor.elevMode = false;
    editor.layer = 'surface'; editor.pendingCell = -1;
    editorRefresh();
  });
  typeRow.appendChild(wallBtn);

  var tunnelBtn = document.createElement('button');
  tunnelBtn.className = 'ed-type-btn' + (editor.tunnelMode ? ' active' : '');
  tunnelBtn.textContent = '🕳 Tunnel';
  tunnelBtn.addEventListener('click', function () {
    editor.tunnelMode = true; editor.wallMode = false; editor.elevMode = false;
    editor.layer = 'surface'; editor.pendingCell = -1;
    editorRefresh();
  });
  typeRow.appendChild(tunnelBtn);

  var elevBtn = document.createElement('button');
  elevBtn.className = 'ed-type-btn' + (editor.elevMode ? ' active' : '');
  elevBtn.textContent = '⬆ Elevator';
  elevBtn.style.borderColor = editor.elevMode ? 'rgba(95,212,232,0.7)' : '';
  elevBtn.style.color = editor.elevMode ? '#2E8FA3' : '';
  elevBtn.addEventListener('click', function () {
    editor.elevMode = true; editor.tunnelMode = false; editor.wallMode = false;
    editor.layer = 'surface'; editor.pendingCell = -1;
    editorRefresh();
  });
  typeRow.appendChild(elevBtn);

  el.appendChild(typeRow);

  if (editor.elevMode) {
    // Elevator tools — free-form painting, no footprints
    var toolRow = document.createElement('div');
    toolRow.className = 'ed-type-row';
    var tools = [
      { id: 'paint',   label: '✎ Paint',  hint: 'Click cells to grow the active shape. A cell that does not touch it starts a new shape.' },
      { id: 'erase',   label: '✖ Erase',  hint: 'Remove one cell. If the shape falls apart it becomes two shapes.' },
      { id: 'move',    label: '✥ Move',   hint: 'Click a cell of a shape, then where it should land.' },
      { id: 'tag',     label: '⚇ Re-tag', hint: 'Click a cell to move it into the active shape.' },
      { id: 'split',   label: '✂ Split',  hint: 'Click two cells side by side to cut the link between them.' },
      { id: 'merge',   label: '⧉ Merge',  hint: 'Click a cell of each shape to fold the second into the first.' },
      { id: 'classic', label: '▣ Classic 2x2', hint: 'Stamp a classic 2x2 Elevator.' }
    ];
    for (var k = 0; k < tools.length; k++) {
      var kb = document.createElement('button');
      kb.className = 'ed-type-btn ed-elev-tool' + (editor.elevTool === tools[k].id ? ' active' : '');
      kb.textContent = tools[k].label;
      kb.title = tools[k].hint;
      kb.setAttribute('data-tool', tools[k].id);
      kb.addEventListener('click', function () {
        editor.elevTool = this.getAttribute('data-tool');
        editor.pendingCell = -1;
        editorRefresh();
      });
      toolRow.appendChild(kb);
    }
    el.appendChild(toolRow);

    var infoRow = document.createElement('div');
    infoRow.className = 'ed-color-row ed-elev-info';
    var hint = '';
    for (var h = 0; h < tools.length; h++) if (tools[h].id === editor.elevTool) hint = tools[h].hint;
    var activeTxt = (editor.activeElev >= 0 && edElevCells(editor.activeElev).length)
      ? 'Shape ' + (editor.activeElev + 1)
      : 'none';
    infoRow.innerHTML = '<span style="font-size:11px;color:#9C8A70">Active: <b style="color:'
      + (editor.activeElev >= 0 ? edElevShapeColor(editor.activeElev) : '#9C8A70') + '">'
      + activeTxt + '</b> &middot; ' + hint + '</span>';
    el.appendChild(infoRow);

    var newRow = document.createElement('div');
    newRow.className = 'ed-quick';
    var nb = document.createElement('button');
    nb.className = 'ed-qbtn';
    nb.textContent = '➕ New shape';
    nb.title = 'The next cell you paint starts a shape of its own';
    nb.addEventListener('click', function () {
      editor.activeElev = -1;
      editor.elevTool = 'paint';
      editorRefresh();
    });
    newRow.appendChild(nb);
    el.appendChild(newRow);
    return;
  }

  if (editor.tunnelMode) {
    var dirRow = document.createElement('div');
    dirRow.className = 'ed-color-row';
    var eraser0 = document.createElement('button');
    eraser0.className = 'ed-tool' + (editor.activeColor === -1 ? ' active' : '');
    eraser0.style.background = 'rgba(180,165,145,0.5)';
    eraser0.innerHTML = '✖';
    eraser0.title = 'Eraser';
    eraser0.addEventListener('click', function () { editor.activeColor = -1; editorRenderToolbar(); });
    dirRow.appendChild(eraser0);
    var dirs = ['top', 'left', 'bottom', 'right'];
    var dirLabels = ['▲', '◀', '▼', '▶'];
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
    return;
  }

  if (editor.wallMode) {
    var wallInfo = document.createElement('div');
    wallInfo.className = 'ed-color-row';
    wallInfo.innerHTML = '<span style="font-size:11px;color:#9C8A70">Click cells to place/remove walls</span>';
    el.appendChild(wallInfo);
    return;
  }

  // Colour palette
  var colorRow = document.createElement('div');
  colorRow.className = 'ed-color-row';
  var eraser = document.createElement('button');
  eraser.className = 'ed-tool' + (editor.activeColor === -1 ? ' active' : '');
  eraser.style.background = 'rgba(180,165,145,0.5)';
  eraser.innerHTML = '✖';
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

  if (editor.layer === 'deep') {
    var dl = document.createElement('div');
    dl.className = 'ed-color-row';
    dl.innerHTML = '<span style="font-size:11px;color:#9C8A70">Painting the lifted floor — elevator cells only</span>';
    el.appendChild(dl);
  }
}
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

// ── Modular elevator panel: author the floor that gets lifted ──
// ── Elevator shape panel: what is on the board and what is missing ──
function editorRenderElevPanel() {
  var container = document.getElementById('ed-elev-panel');
  if (!container) return;

  var ids = edElevIds();
  if (!ids.length) { container.style.display = 'none'; return; }
  container.style.display = 'block';

  var html = '<div class="ed-section-title"><span class="icon">⬆</span> Elevators on this board</div>';
  html += '<div class="ed-shape-list">';

  for (var i = 0; i < ids.length; i++) {
    var eid = ids[i];
    var cells = edElevCells(eid);
    var classic = edElevIsClassic(eid);
    var col = edElevShapeColor(eid);
    var noTop = 0, noDeep = 0;
    for (var k = 0; k < cells.length; k++) {
      if (!editor.grid[cells[k]].surface) noTop++;
      if (!editor.grid[cells[k]].deep) noDeep++;
    }
    var comps = elevComponents(cells, 7, 7).length;
    var active = (editor.activeElev === eid);

    html += '<div class="ed-shape' + (active ? ' active' : '') + '" data-eid="' + eid + '" style="border-color:' + col + '">';
    html += '<div class="ed-shape-head"><span class="ed-shape-swatch" style="background:' + col + '"></span>';
    html += '<b>' + (classic ? 'Classic 2x2' : 'Shape ' + (eid + 1)) + '</b>';
    html += '<span class="ed-shape-count">' + cells.length + ' cells</span>';
    html += '<button class="ed-shape-del" data-del="' + eid + '" title="Remove this elevator">✖</button>';
    html += '</div>';

    var notes = [];
    if (comps > 1) notes.push('<span class="ed-shape-bad">not in one piece (' + comps + ' parts)</span>');
    if (noTop) notes.push(noTop + ' cell' + (noTop > 1 ? 's' : '') + ' with no top box');
    if (noDeep) notes.push(noDeep + ' cell' + (noDeep > 1 ? 's' : '') + ' with no lifted floor');
    if (!notes.length) notes.push('<span class="ed-shape-ok">complete — ' + (cells.length * 2) + ' boxes</span>');
    html += '<div class="ed-shape-notes">' + notes.join(' &middot; ') + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Bulk fill, because authoring 12 cells one at a time is tedious
  html += '<div class="ed-quick" style="margin-top:6px">';
  html += '<button class="ed-qbtn" id="ed-elev-fill-top">Fill missing top boxes</button>';
  html += '<button class="ed-qbtn" id="ed-elev-fill-deep">Fill missing floor boxes</button>';
  html += '</div>';

  var enclosed = edCountEnclosed();
  if (enclosed > 0) {
    html += '<div class="ed-stat-warn" style="margin-top:6px">' + enclosed + ' box'
      + (enclosed > 1 ? 'es are' : ' is') + ' walled in and can never be opened</div>';
  }

  container.innerHTML = html;

  var rows = container.querySelectorAll('.ed-shape');
  for (var r = 0; r < rows.length; r++) {
    rows[r].addEventListener('click', function (ev) {
      if (ev.target && ev.target.getAttribute('data-del') !== null) return;
      editor.activeElev = parseInt(this.getAttribute('data-eid'));
      editorRefresh();
    });
  }
  var dels = container.querySelectorAll('.ed-shape-del');
  for (var d = 0; d < dels.length; d++) {
    dels[d].addEventListener('click', function (ev) {
      ev.stopPropagation();
      var eid = parseInt(this.getAttribute('data-del'));
      edPushUndo();
      var cells = edElevCells(eid);
      for (var n = 0; n < cells.length; n++) editor.grid[cells[n]] = null;
      if (editor.activeElev === eid) editor.activeElev = -1;
      editorRefresh();
    });
  }

  var fillTop = document.getElementById('ed-elev-fill-top');
  if (fillTop) fillTop.addEventListener('click', function () { edElevFillLayer('surface'); });
  var fillDeep = document.getElementById('ed-elev-fill-deep');
  if (fillDeep) fillDeep.addEventListener('click', function () { edElevFillLayer('deep'); });
}

// Give every empty cell on every shape a box, cycling the palette so
// a large shape does not become one slab of one colour.
function edElevFillLayer(layer) {
  edPushUndo();
  var n = 0, filled = 0;
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (!v || !v.elevator) continue;
    if (v[layer]) { n++; continue; }
    v[layer] = { ci: n % NUM_COLORS, type: 'default' };
    n++; filled++;
  }
  editorRefresh();
  editorShowToast(filled ? ('Filled ' + filled + ' cells') : 'Nothing to fill');
}
// ── Quick actions ──
function editorFillRandom() {
  for (var i = 0; i < 49; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  editor.activeElev = -1;
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
  editor.activeElev = -1;
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
  var elevCount = 0, elevClassic = 0, elevMissingTop = 0, elevMissingDeep = 0, elevSeen = {};
  for (var i = 0; i < 49; i++) {
    var v = editor.grid[i];
    if (!v) continue;
    if (v.wall) {
      wallCount++;
      continue;
    }
    if (v.elevator) {
      if (!elevSeen[v.eid]) { elevSeen[v.eid] = true; elevCount++; if (v.classic) elevClassic++; }
      if (!v.surface) elevMissingTop++;
      if (!v.deep) elevMissingDeep++;
      var eBoxes = [v.surface, v.deep];
      for (var eb = 0; eb < eBoxes.length; eb++) {
        var eBox = eBoxes[eb];
        if (!eBox) continue;
        counts[eBox.ci]++;
        total++;
        typeCounts[eBox.type] = (typeCounts[eBox.type] || 0) + 1;
        if (eBox.type === 'blocker') {
          regularMrb[eBox.ci] += Math.max(0, editor.mrbPerBox - BLOCKER_PER_BOX);
          totalBlockers += BLOCKER_PER_BOX;
        } else {
          regularMrb[eBox.ci] += editor.mrbPerBox;
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
  if (elevCount > 0) {
    html += '<span class="ed-stat-chip" style="background:#2B3340;border:1px solid #5FD4E8">' + elevCount + ' elevator' + (elevCount > 1 ? 's' : '')
      + (elevClassic ? ' (' + elevClassic + ' classic)' : '') + '</span>';
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
    if (!warn && elevMissingTop > 0) {
      warn = elevMissingTop + ' elevator tile' + (elevMissingTop > 1 ? 's have' : ' has') + ' no top box';
    }
    if (!warn && elevMissingDeep > 0) {
      warn = elevMissingDeep + ' elevator tile' + (elevMissingDeep > 1 ? 's have' : ' has') + ' no lifted floor box';
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
          else if (cell.elevator) editor.grid[i] = {
            elevator: true, eid: cell.eid || 0, classic: !!cell.classic,
            surface: cell.surface || null, deep: cell.deep || null
          };
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
      editor.activeElev = -1;
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
