// ============================================================
// color_panel.js — Color Panel mechanic
// A colored overlay covering a 3×3 area of boxes.
// Opens when X sort boxes of the required color are filled.
// ============================================================

// ── Init from level data ──
function initColorPanels() {
  colorPanels = [];
  var lvl = LEVELS[currentLevel];
  if (!lvl || !lvl.colorPanels) return;
  for (var i = 0; i < lvl.colorPanels.length; i++) {
    var pd = lvl.colorPanels[i];
    var tl = pd.topLeft;
    var row = Math.floor(tl / L.cols);
    var col = tl % L.cols;
    var cells = [];
    for (var dr = 0; dr < 3; dr++) {
      for (var dc = 0; dc < 3; dc++) {
        var r = row + dr;
        var c = col + dc;
        if (r < L.rows && c < L.cols) {
          cells.push(r * L.cols + c);
        }
      }
    }
    colorPanels.push({
      topLeft: tl,
      ci: pd.ci,
      counter: pd.counter,
      maxCounter: pd.counter,
      opened: false,
      openT: 0,
      pulseT: 0,
      shakeT: 0,
      cells: cells
    });
  }
}

// ── Query: is cell idx under a closed panel? ──
function isUnderClosedColorPanel(idx) {
  for (var i = 0; i < colorPanels.length; i++) {
    var p = colorPanels[i];
    if (p.opened) continue;
    for (var j = 0; j < p.cells.length; j++) {
      if (p.cells[j] === idx) return true;
    }
  }
  return false;
}

// ── Called when a sort box of color ci is completed ──
function onColorSortFilled(ci) {
  for (var i = 0; i < colorPanels.length; i++) {
    var p = colorPanels[i];
    if (p.opened || p.ci !== ci) continue;
    p.counter--;
    p.pulseT = 1.0;
    if (p.counter <= 0) {
      p.counter = 0;
      p.opened = true;
      p.openT = 1.0;
      sfx.complete();
      // Reveal boxes underneath
      for (var j = 0; j < p.cells.length; j++) {
        var b = stock[p.cells[j]];
        if (!b) continue;
        if (b.isTunnel || b.isWall || b.empty || b.used) continue;
        if (!b.revealed) {
          b.revealed = true;
          b.revealT = 1.0;
          var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;
          spawnBurst(bx, by, COLORS[b.ci].fill, 10);
        }
      }
      // Confetti at panel center
      var tlBox = stock[p.topLeft];
      if (tlBox) {
        var cx = tlBox.x + (L.bw * 3 + L.bg * 2) / 2;
        var cy = tlBox.y + (L.bh * 3 + L.bg * 2) / 2;
        spawnConfetti(cx, cy, 30);
        spawnBurst(cx, cy, COLORS[p.ci].fill, 25);
      }
      // Trigger adjacency reveals after panel opens
      (function(panel) {
        setTimeout(function() {
          _revealVisited = {};
          for (var k = 0; k < panel.cells.length; k++) {
            revealAroundEmptyCell(panel.cells[k]);
          }
        }, 100);
      })(p);
    } else {
      sfx.pop();
      var tlBox = stock[p.topLeft];
      if (tlBox) {
        var cx = tlBox.x + (L.bw * 3 + L.bg * 2) / 2;
        var cy = tlBox.y + (L.bh * 3 + L.bg * 2) / 2;
        spawnBurst(cx, cy, COLORS[p.ci].fill, 12);
      }
    }
  }
}

// ── Check if a tap hits a closed panel (for shake feedback) ──
function tapColorPanel(px, py) {
  for (var i = 0; i < colorPanels.length; i++) {
    var p = colorPanels[i];
    if (p.opened) continue;
    var tl = stock[p.topLeft];
    if (!tl) continue;
    var pw = L.bw * 3 + L.bg * 2;
    var ph = L.bh * 3 + L.bg * 2;
    if (px >= tl.x && px <= tl.x + pw && py >= tl.y && py <= tl.y + ph) {
      p.shakeT = 0.5;
      return true;
    }
  }
  return false;
}

// ── Animation update ──
function updateColorPanels() {
  for (var i = 0; i < colorPanels.length; i++) {
    var p = colorPanels[i];
    if (p.pulseT > 0) p.pulseT = Math.max(0, p.pulseT - 0.04);
    if (p.openT > 0) p.openT = Math.max(0, p.openT - 0.025);
    if (p.shakeT > 0) p.shakeT = Math.max(0, p.shakeT - 0.04);
  }
}

// ── Draw panels on top of stock grid ──
function drawColorPanels() {
  for (var i = 0; i < colorPanels.length; i++) {
    var p = colorPanels[i];
    if (p.opened && p.openT <= 0) continue;

    var tl = stock[p.topLeft];
    if (!tl) continue;

    var pw = L.bw * 3 + L.bg * 2;
    var ph = L.bh * 3 + L.bg * 2;
    var px = tl.x;
    var py = tl.y;
    var c = COLORS[p.ci];

    ctx.save();

    var cx = px + pw / 2;
    var cy = py + ph / 2;

    // Shake
    var ox = 0;
    if (p.shakeT > 0) ox = Math.sin(p.shakeT * 28) * 4 * S * p.shakeT;

    if (p.opened && p.openT > 0) {
      // Fade-out + scale-up animation
      ctx.globalAlpha = p.openT;
      var s = 1 + (1 - p.openT) * 0.08;
      ctx.translate(cx + ox, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    } else {
      ctx.translate(ox, 0);
    }

    // Pulse animation on counter change
    var pulse = p.pulseT > 0 ? Math.sin(p.pulseT * Math.PI) * 0.04 : 0;
    if (pulse > 0) {
      var s2 = 1 + pulse;
      ctx.translate(cx, cy);
      ctx.scale(s2, s2);
      ctx.translate(-cx, -cy);
    }

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10 * S;
    ctx.shadowOffsetY = 4 * S;

    // Main panel fill
    var grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, c.light);
    grad.addColorStop(0.4, c.fill);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    rRect(px, py, pw, ph, 10 * S);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Border
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 2.5 * S;
    rRect(px, py, pw, ph, 10 * S);
    ctx.stroke();

    // Inner highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5 * S;
    rRect(px + 3 * S, py + 3 * S, pw - 6 * S, ph - 6 * S, 8 * S);
    ctx.stroke();

    // Subtle diagonal pattern
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    rRect(px, py, pw, ph, 10 * S);
    ctx.clip();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 * S;
    var sg = 12 * S;
    for (var d = -pw; d < pw + ph; d += sg) {
      ctx.beginPath();
      ctx.moveTo(px + d, py);
      ctx.lineTo(px + d - ph, py + ph);
      ctx.stroke();
    }
    ctx.restore();

    // Counter + color indicator
    if (!p.opened) {
      var fontSize = Math.min(pw, ph) * 0.38;

      // Color indicator marble above counter
      var indicatorR = 10 * S;
      var indicatorY = cy - fontSize * 0.55;
      drawMarble(cx, indicatorY, indicatorR, p.ci);

      // Counter number below marble
      var textY = cy + fontSize * 0.45;
      ctx.font = 'bold ' + fontSize + 'px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Text shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillText(p.counter, cx + 2 * S, textY + 3 * S);

      // Main text
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(p.counter, cx, textY);
    }

    ctx.restore();
  }
}

// ── Editor helpers ──

function editorGetPanelAtCell(idx) {
  if (!editor.colorPanels) return -1;
  for (var i = 0; i < editor.colorPanels.length; i++) {
    var p = editor.colorPanels[i];
    var row = Math.floor(p.topLeft / 7);
    var col = p.topLeft % 7;
    var cellRow = Math.floor(idx / 7);
    var cellCol = idx % 7;
    if (cellRow >= row && cellRow < row + 3 && cellCol >= col && cellCol < col + 3) {
      return i;
    }
  }
  return -1;
}

function editorCanPlacePanel(topLeft) {
  var row = Math.floor(topLeft / 7);
  var col = topLeft % 7;
  if (row + 2 >= 7 || col + 2 >= 7) return false;
  for (var dr = 0; dr < 3; dr++) {
    for (var dc = 0; dc < 3; dc++) {
      var idx = (row + dr) * 7 + (col + dc);
      if (editorGetPanelAtCell(idx) >= 0) return false;
    }
  }
  return true;
}

function editorRenderColorPanelPanel() {
  var container = document.getElementById('ed-colorpanel-panel');
  if (!container) return;

  if (editor.selectedColorPanel < 0 || !editor.colorPanels || editor.selectedColorPanel >= editor.colorPanels.length) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  var panel = editor.colorPanels[editor.selectedColorPanel];
  var row = Math.floor(panel.topLeft / 7);
  var col = panel.topLeft % 7;

  var html = '';
  html += '<div class="ed-section-title"><span class="icon">&#127912;</span> Color Panel at row ' + row + ', col ' + col + '</div>';

  // Color selector
  html += '<div style="margin:6px 0 4px;font-size:11px;color:#5A4A38;font-weight:600">Required Color:</div>';
  html += '<div class="ed-tunnel-add-colors">';
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    var sel = panel.ci === ci ? 'border-color:rgba(90,60,30,0.7);box-shadow:0 0 0 2px rgba(139,105,20,0.3)' : '';
    html += '<button class="ed-tunnel-add-clr ed-cp-color" data-ci="' + ci + '" style="background:' + COLORS[ci].fill + ';' + sel + '" title="' + CLR_NAMES[ci] + '">' + CLR_NAMES[ci][0].toUpperCase() + '</button>';
  }
  html += '</div>';

  // Counter slider
  html += '<div class="ed-setting-row" style="margin-top:8px">';
  html += '<label>Counter</label>';
  html += '<input type="range" id="ed-cp-counter" min="1" max="9" step="1" value="' + panel.counter + '">';
  html += '<span class="ed-s-val" id="ed-cp-counter-v">' + panel.counter + '</span>';
  html += '</div>';

  // Remove button
  html += '<div style="text-align:center;margin-top:8px"><button class="ed-qbtn" id="ed-cp-remove">Remove Panel</button></div>';

  container.innerHTML = html;

  // Bind color buttons
  var colorBtns = container.querySelectorAll('.ed-cp-color');
  for (var cb = 0; cb < colorBtns.length; cb++) {
    colorBtns[cb].addEventListener('click', function() {
      var ci2 = parseInt(this.getAttribute('data-ci'));
      if (editor.selectedColorPanel >= 0) {
        editor.colorPanels[editor.selectedColorPanel].ci = ci2;
        editorRenderGrid();
        editorRenderColorPanelPanel();
      }
    });
  }

  // Bind counter slider
  var counterSlider = document.getElementById('ed-cp-counter');
  var counterVal = document.getElementById('ed-cp-counter-v');
  if (counterSlider) {
    counterSlider.addEventListener('input', function() {
      if (editor.selectedColorPanel >= 0) {
        editor.colorPanels[editor.selectedColorPanel].counter = parseInt(this.value);
        counterVal.textContent = this.value;
        editorRenderGrid();
      }
    });
  }

  // Bind remove button
  var removeBtn = document.getElementById('ed-cp-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', function() {
      if (editor.selectedColorPanel >= 0) {
        editor.colorPanels.splice(editor.selectedColorPanel, 1);
        editor.selectedColorPanel = -1;
        editorRenderGrid();
        editorRenderColorPanelPanel();
        editorUpdateStats();
      }
    });
  }
}
