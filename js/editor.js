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
  selectedCrate: -1,    // index of selected crate for contents editing
  crateW: CRATE_SIZE,   // footprint for new crates
  crateH: CRATE_SIZE,
  wallMode: false,      // true when placing walls
  visible: false
};

// ── Crate helpers: a crate occupies a cw x ch block, stored in the grid as
//    a single entry at the top-left (anchor) cell. Its lock is a list of
//    colors, one per plank, and its contents one color per compartment ──

function editorCrateW(cell) { return cell.cw || CRATE_SIZE; }
function editorCrateH(cell) { return cell.ch || CRATE_SIZE; }

// The lock list of a crate grid entry, one color per plank.
function editorCrateLocks(cell) {
  if (cell.locks && cell.locks.length) return cell.locks;
  var out = [];
  for (var i = 0; i < CRATE_HP; i++) out.push(cell.ci);
  cell.locks = out;
  return out;
}

// Index of the crate covering this cell (its anchor), or -1 if none.
function editorCrateAnchorAt(idx) {
  var row = Math.floor(idx / 7), col = idx % 7;
  for (var dr = 0; dr < CRATE_MAX_SIZE; dr++) {
    for (var dc = 0; dc < CRATE_MAX_SIZE; dc++) {
      var r = row - dr, c = col - dc;
      if (r < 0 || c < 0) continue;
      var a = r * 7 + c;
      var v = editor.grid[a];
      if (!v || v.tunnel || v.wall || v.type !== 'crate') continue;
      if (dc < editorCrateW(v) && dr < editorCrateH(v)) return a;
    }
  }
  return -1;
}

// Can a crate of this size be anchored here? skipAnchor lets a crate be
// resized in place without tripping over its own cells.
function editorCrateFits(idx, gw, gh, skipAnchor) {
  var row = Math.floor(idx / 7), col = idx % 7;
  if (row + gh > 7 || col + gw > 7) return false;
  for (var dr = 0; dr < gh; dr++) {
    for (var dc = 0; dc < gw; dc++) {
      var c2 = (row + dr) * 7 + (col + dc);
      var anc = editorCrateAnchorAt(c2);
      if (anc >= 0 && anc === skipAnchor) continue;
      if (anc >= 0) return false;
      if (editor.grid[c2] && c2 !== skipAnchor) return false;
    }
  }
  return true;
}

// Clear whatever occupies this cell, removing a whole crate if one covers it.
// Returns true if a crate was removed.
function editorClearCell(idx) {
  var anchor = editorCrateAnchorAt(idx);
  if (anchor >= 0) {
    editor.grid[anchor] = null;
    if (editor.selectedTunnel === anchor) editor.selectedTunnel = -1;
    if (editor.selectedCrate === anchor) editor.selectedCrate = -1;
    return true;
  }
  editor.grid[idx] = null;
  return false;
}

// The color held in one compartment of a crate grid entry.
function editorCrateSlotCi(cell, slot) {
  if (cell.contents && cell.contents[slot] !== undefined && cell.contents[slot] !== null) {
    return cell.contents[slot];
  }
  return cell.ci;
}

// The compartment number a covered cell corresponds to, in reading order.
function editorCrateSlotOf(anchorIdx, idx) {
  var cell = editor.grid[anchorIdx];
  var ar = Math.floor(anchorIdx / 7), ac = anchorIdx % 7;
  var r = Math.floor(idx / 7), c = idx % 7;
  return (r - ar) * editorCrateW(cell) + (c - ac);
}

// Small dot showing what a crate cell holds
function editorCrateSlotDot(anchorIdx, idx) {
  var cell = editor.grid[anchorIdx];
  var inner = editorCrateSlotCi(cell, editorCrateSlotOf(anchorIdx, idx));
  return '<span class="ed-crate-dot" style="background:' + COLORS[inner].fill + '"></span>';
}

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
  editor.selectedCrate = -1;
  editor.crateW = CRATE_SIZE;
  editor.crateH = CRATE_SIZE;
  editor.wallMode = false;
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
  editorRenderCratePanel();
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
    } else if (editorCrateAnchorAt(i) >= 0) {
      // Any cell of a crate — the anchor shows the icon, the rest a dot
      var ancIdx = editorCrateAnchorAt(i);
      var anc = editor.grid[ancIdx];
      var cbt = getBoxType('crate');
      cell.style.background = cbt.editorCrateBg(editorCrateLocks(anc));
      cell.style.borderColor = '#7C5326';
      if (editor.selectedCrate === ancIdx) cell.style.boxShadow = '0 0 0 2px rgba(255,208,128,0.7)';
      cell.innerHTML = (ancIdx === i)
        ? '<span class="ed-cell-dot" style="font-size:12px">&#128230;</span>'
        : editorCrateSlotDot(ancIdx, i);
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

  // A cell covered by a crate belongs to that crate
  if (editorCrateAnchorAt(idx) >= 0) {
    if (!editor.tunnelMode && !editor.wallMode && editor.activeType === 'crate' && editor.activeColor !== -1) {
      // With the crate tool in hand, select it instead — edit its contents
      editor.selectedCrate = editorCrateAnchorAt(idx);
    } else {
      editorClearCell(idx);
    }
    editorRenderGrid();
    editorUpdateStats();
    editorRenderTunnelPanel();
    editorRenderCratePanel();
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
    editorRenderCratePanel();
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
      } else if (editor.activeType === 'crate') {
        // Crates need a free block of cells, anchored at the one tapped
        editor.grid[idx] = null;
        if (!editorCrateFits(idx, editor.crateW, editor.crateH)) {
          editorShowToast('Crate needs a free ' + editor.crateW + 'x' + editor.crateH + ' space');
          editorRenderGrid();
          return;
        }
        var startContents = [], startLocks = [];
        for (var sc = 0; sc < editor.crateW * editor.crateH; sc++) startContents.push(editor.activeColor);
        for (var sl3 = 0; sl3 < CRATE_HP; sl3++) startLocks.push(editor.activeColor);
        editor.grid[idx] = {
          ci: editor.activeColor, type: 'crate',
          cw: editor.crateW, ch: editor.crateH,
          locks: startLocks, contents: startContents
        };
        editor.selectedCrate = idx;
      } else {
        editor.grid[idx] = { ci: editor.activeColor, type: editor.activeType };
      }
      if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
    }
  }
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderCratePanel();
}

function editorCellErase(e) {
  e.preventDefault();
  var idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  editorClearCell(idx);
  if (editor.selectedTunnel === idx) editor.selectedTunnel = -1;
  editorRenderGrid();
  editorUpdateStats();
  editorRenderTunnelPanel();
  editorRenderCratePanel();
}

// ── Crate panel: footprint, lock list (one plank per hit), contents ──
function editorRenderCratePanel() {
  var container = document.getElementById('ed-crate-panel');
  if (!container) return;

  var sel = editor.selectedCrate;
  var cell = (sel >= 0) ? editor.grid[sel] : null;
  if (!cell || cell.tunnel || cell.wall || cell.type !== 'crate') {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  var gw = editorCrateW(cell), gh = editorCrateH(cell);
  var locks = editorCrateLocks(cell);
  var html = '';

  // ── Size ──
  html += '<div class="ed-section-title"><span class="icon">&#128230;</span> Crate' +
    '<span class="ed-crate-lock" style="background:#8A5B2C">' + gw + '\u00D7' + gh +
    ' \u00B7 ' + locks.length + ' hp</span></div>';
  html += '<div class="ed-crate-row">';
  var sizes = [[2, 2], [2, 3], [3, 2], [3, 3]];
  for (var z = 0; z < sizes.length; z++) {
    var on = (sizes[z][0] === gw && sizes[z][1] === gh) ? ' active' : '';
    html += '<button class="ed-crate-size' + on + '" data-cw="' + sizes[z][0] +
      '" data-ch="' + sizes[z][1] + '">' + sizes[z][0] + '\u00D7' + sizes[z][1] + '</button>';
  }
  html += '</div>';

  // ── Lock list: one plank per hit, top plank first ──
  html += '<div class="ed-section-title" style="margin-top:10px"><span class="icon">&#128274;</span> Planks' +
    ' <span style="font-weight:400;font-size:10px;color:#9C8A70;margin-left:auto;text-transform:none;letter-spacing:0">' +
    'top to bottom &middot; tap to remove</span></div>';
  html += '<div class="ed-crate-planks">';
  for (var lk = 0; lk < locks.length; lk++) {
    var lc = COLORS[locks[lk]] || COLORS[0];
    html += '<div class="ed-crate-plank" data-lock="' + lk + '" title="' + CLR_NAMES[locks[lk]] +
      ' — tap to remove" style="background:linear-gradient(180deg,' + lc.light + ',' + lc.dark + ')"></div>';
  }
  html += '</div>';
  html += '<div class="ed-crate-actions">' +
    '<button class="ed-qbtn" data-crate-act="addlock">&#10133; Add plank in selected color</button>' +
    '</div>';

  // ── Contents ──
  html += '<div class="ed-section-title" style="margin-top:10px"><span class="icon">&#9899;</span> Boxes inside</div>';
  html += '<div class="ed-crate-hint">Pick a color above, then tap a compartment.</div>';
  html += '<div class="ed-crate-slots" style="grid-template-columns:repeat(' + gw + ',1fr);max-width:' +
    (gw * 34 + 14) + 'px">';
  for (var sl = 0; sl < gw * gh; sl++) {
    var inner = editorCrateSlotCi(cell, sl);
    html += '<div class="ed-crate-slot" data-slot="' + sl + '" title="' + CLR_NAMES[inner] +
      ' — tap to repaint" style="background:' + COLORS[inner].fill + '"></div>';
  }
  html += '</div>';
  html += '<div class="ed-crate-actions">' +
    '<button class="ed-qbtn" data-crate-act="all">Fill all with selected</button>' +
    '</div>';

  container.innerHTML = html;

  // ── Wiring ──
  var sizeBtns = container.querySelectorAll('.ed-crate-size');
  for (var i = 0; i < sizeBtns.length; i++) {
    sizeBtns[i].addEventListener('click', function () {
      editorSetCrateSize(parseInt(this.getAttribute('data-cw')), parseInt(this.getAttribute('data-ch')));
    });
  }
  var plankEls = container.querySelectorAll('.ed-crate-plank');
  for (var q = 0; q < plankEls.length; q++) {
    plankEls[q].addEventListener('click', function () {
      editorRemoveCratePlank(parseInt(this.getAttribute('data-lock')));
    });
  }
  var slots = container.querySelectorAll('.ed-crate-slot');
  for (var j = 0; j < slots.length; j++) {
    slots[j].addEventListener('click', function () {
      if (editor.activeColor === -1) { editorShowToast('Pick a color first'); return; }
      editorSetCrateSlot(parseInt(this.getAttribute('data-slot')), editor.activeColor);
    });
  }
  var acts = container.querySelectorAll('[data-crate-act]');
  for (var a = 0; a < acts.length; a++) {
    acts[a].addEventListener('click', function () {
      var which = this.getAttribute('data-crate-act');
      var c = editor.grid[editor.selectedCrate];
      if (!c) return;
      if (editor.activeColor === -1) { editorShowToast('Pick a color first'); return; }
      if (which === 'addlock') {
        editorCrateLocks(c).push(editor.activeColor);
      } else if (which === 'all') {
        var n = editorCrateW(c) * editorCrateH(c);
        for (var sl2 = 0; sl2 < n; sl2++) editorSetCrateSlot(sl2, editor.activeColor, true);
      }
      editorRenderGrid(); editorUpdateStats(); editorRenderCratePanel();
    });
  }
}

// Resize a placed crate, keeping the compartments that still exist.
function editorSetCrateSize(gw, gh) {
  var idx = editor.selectedCrate;
  var cell = editor.grid[idx];
  if (!cell) return;
  var oldW = editorCrateW(cell), oldH = editorCrateH(cell);
  if (gw === oldW && gh === oldH) return;
  if (!editorCrateFits(idx, gw, gh, idx)) {
    editorShowToast('No room for a ' + gw + 'x' + gh + ' crate here');
    return;
  }
  var next = [];
  for (var r = 0; r < gh; r++) {
    for (var c = 0; c < gw; c++) {
      next.push((r < oldH && c < oldW) ? editorCrateSlotCi(cell, r * oldW + c) : cell.ci);
    }
  }
  cell.cw = gw; cell.ch = gh; cell.contents = next;
  editor.crateW = gw; editor.crateH = gh;   // remember it for the next crate
  editorRenderGrid(); editorUpdateStats(); editorRenderCratePanel();
}

// Remove one plank from the lock list — a crate always keeps at least one.
function editorRemoveCratePlank(lockIdx) {
  var cell = editor.grid[editor.selectedCrate];
  if (!cell) return;
  var locks = editorCrateLocks(cell);
  if (locks.length <= 1) { editorShowToast('A crate needs at least one plank'); return; }
  locks.splice(lockIdx, 1);
  editorRenderGrid(); editorUpdateStats(); editorRenderCratePanel();
}

function editorSetCrateSlot(slot, ci, quiet) {
  var cell = editor.grid[editor.selectedCrate];
  if (!cell) return;
  var n = editorCrateW(cell) * editorCrateH(cell);
  if (!cell.contents || cell.contents.length !== n) {
    var fresh = [];
    for (var i = 0; i < n; i++) fresh.push(editorCrateSlotCi(cell, i));
    cell.contents = fresh;
  }
  cell.contents[slot] = ci;
  if (!quiet) { editorRenderGrid(); editorUpdateStats(); editorRenderCratePanel(); }
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
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderCratePanel();
}

function editorClearAll() {
  for (var i = 0; i < 49; i++) editor.grid[i] = null;
  editor.selectedTunnel = -1;
  editorRenderGrid(); editorUpdateStats(); editorRenderTunnelPanel(); editorRenderCratePanel();
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
      typeCounts[v.type] = (typeCounts[v.type] || 0) + 1;
      if (v.type === 'crate') {
        // A crate seals a block of boxes, each with its own color
        var slots = editorCrateW(v) * editorCrateH(v);
        total += slots;
        for (var cs = 0; cs < slots; cs++) {
          var inner = editorCrateSlotCi(v, cs);
          counts[inner]++;
          regularMrb[inner] += editor.mrbPerBox;
        }
      } else if (v.type === 'blocker') {
        counts[v.ci]++;
        total++;
        regularMrb[v.ci] += Math.max(0, editor.mrbPerBox - BLOCKER_PER_BOX);
        totalBlockers += BLOCKER_PER_BOX;
      } else {
        counts[v.ci]++;
        total++;
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
