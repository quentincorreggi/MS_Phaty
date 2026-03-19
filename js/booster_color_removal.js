// ============================================================
// booster_color_removal.js — Colour Wipe Booster
// A button outside the canvas that lets the player eliminate
// every marble of one chosen colour from the entire game:
// funnel, belt, jumpers, stock boxes, and sort columns.
// Unlimited uses. Activated via a UI button + colour picker.
// ============================================================

// Called by initGame() each time a level starts
function boosterInit() {
  var container = document.getElementById('booster-container');
  var picker    = document.getElementById('booster-picker');
  if (container) container.style.display = 'flex';
  if (picker)    picker.style.display    = 'none';
}

// Called by showLevelSelect() when leaving the game
function boosterHide() {
  var container = document.getElementById('booster-container');
  var picker    = document.getElementById('booster-picker');
  if (container) container.style.display = 'none';
  if (picker)    picker.style.display    = 'none';
}

// Open the colour-picker popup
function boosterShowPicker() {
  if (won || !gameActive) return;
  var picker = document.getElementById('booster-picker');
  if (!picker) return;

  // ── Find every colour currently anywhere in the game ──
  var inPlay = {};

  for (var i = 0; i < physMarbles.length; i++)
    if (physMarbles[i].ci >= 0 && physMarbles[i].ci < NUM_COLORS) inPlay[physMarbles[i].ci] = true;

  for (var i = 0; i < beltSlots.length; i++)
    if (beltSlots[i].marble >= 0 && beltSlots[i].marble < NUM_COLORS) inPlay[beltSlots[i].marble] = true;

  for (var i = 0; i < jumpers.length; i++)
    if (jumpers[i].ci >= 0 && jumpers[i].ci < NUM_COLORS) inPlay[jumpers[i].ci] = true;

  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b.isTunnel && !b.isWall && !b.empty && !b.used && b.ci >= 0 && b.ci < NUM_COLORS)
      inPlay[b.ci] = true;
  }

  // Also check tunnel queues
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.isTunnel && b.tunnelContents) {
      for (var t = 0; t < b.tunnelContents.length; t++)
        if (b.tunnelContents[t].ci >= 0 && b.tunnelContents[t].ci < NUM_COLORS)
          inPlay[b.tunnelContents[t].ci] = true;
    }
  }

  for (var c = 0; c < sortCols.length; c++)
    for (var r = 0; r < sortCols[c].length; r++) {
      var sc = sortCols[c][r];
      if (sc.ci >= 0 && sc.ci < NUM_COLORS && sc.vis && sc.filled < SORT_CAP)
        inPlay[sc.ci] = true;
    }

  // ── Build swatch HTML ──
  var swatches = '';
  var any = false;
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    if (!inPlay[ci]) continue;
    any = true;
    var cl = COLORS[ci];
    swatches += '<button class="booster-swatch" '
      + 'onclick="boosterRemoveColor(' + ci + ')" '
      + 'title="Wipe ' + CLR_NAMES[ci] + '" '
      + 'style="background:' + cl.fill + ';border-color:' + cl.dark + ';box-shadow:0 2px 8px ' + cl.glow + '">'
      + '</button>';
  }
  if (!any) swatches = '<span style="color:#9C8A70;font-size:12px;padding:4px">Nothing in play</span>';

  picker.innerHTML =
    '<div class="booster-picker-label">Pick a colour to wipe:</div>'
    + '<div class="booster-swatches">' + swatches + '</div>'
    + '<button class="booster-cancel" onclick="boosterClosePicker()">Cancel</button>';

  picker.style.display = 'block';
}

function boosterClosePicker() {
  var picker = document.getElementById('booster-picker');
  if (picker) picker.style.display = 'none';
}

// ── The actual wipe ──
function boosterRemoveColor(ci) {
  if (won || !gameActive) return;
  boosterClosePicker();

  var fill = COLORS[ci].fill;

  // Remove from funnel
  for (var i = physMarbles.length - 1; i >= 0; i--) {
    if (physMarbles[i].ci === ci) {
      spawnBurst(physMarbles[i].x, physMarbles[i].y, fill, 8);
      physMarbles.splice(i, 1);
    }
  }

  // Remove from belt
  for (var i = 0; i < beltSlots.length; i++) {
    if (beltSlots[i].marble === ci) {
      var p = getSlotPos(i);
      spawnBurst(p.x, p.y, fill, 8);
      beltSlots[i].marble = -1;
    }
  }

  // Remove from jumpers (mid-flight)
  for (var i = jumpers.length - 1; i >= 0; i--) {
    if (jumpers[i].ci === ci) {
      spawnBurst(jumpers[i].startX, jumpers[i].startY, fill, 8);
      jumpers.splice(i, 1);
    }
  }

  // Wipe matching stock boxes (incl. currently spawning)
  var wipedIndices = [];
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (b.isTunnel || b.isWall || b.empty || b.used) continue;
    if (b.ci !== ci) continue;
    spawnBurst(b.x + L.bw / 2, b.y + L.bh / 2, fill, 14);
    b.used      = true;
    b.remaining = 0;
    b.spawning  = false;
    b.emptyT    = 1.0;
    wipedIndices.push(i);
  }

  // Reveal boxes adjacent to every wiped cell
  for (var wi = 0; wi < wipedIndices.length; wi++)
    revealAroundEmptyCell(wipedIndices[wi]);

  // Wipe matching items from tunnel queues
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b.isTunnel || !b.tunnelContents) continue;
    for (var t = b.tunnelContents.length - 1; t >= 0; t--)
      if (b.tunnelContents[t].ci === ci) b.tunnelContents.splice(t, 1);
  }

  // Remove matching sort-column targets (leave lock entries alone)
  for (var c = 0; c < sortCols.length; c++)
    for (var r = sortCols[c].length - 1; r >= 0; r--)
      if (sortCols[c][r].ci === ci) sortCols[c].splice(r, 1);

  // Sound + big flash particle burst at screen centre for drama
  if (typeof sfx !== 'undefined') sfx.complete();
  spawnBurst(W / 2, H / 2, fill, 30);
}
