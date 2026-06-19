// ============================================================
// plate.js — Spinning Plate mechanic
// ------------------------------------------------------------
// A "plate" is a turntable holding 4 boxes in a 2x2 square.
// Every move (any box tap) spins all plates 90deg clockwise, so
// the four boxes swap seats: TL->TR->BR->BL->TL.
//
// Boxes are normal stock objects tagged with a plateId. The 4
// fixed grid cells a plate occupies are its "seats"; rotating
// moves the box OBJECTS between seats (so spawn closures, reveal
// path-finding, taps and physics all keep working unchanged).
// Only the visual slide + the turntable art are special-cased.
//
// Seat order in plate.cells is clockwise from top-left:
//   [TL, TR, BR, BL]
// ============================================================

var PLATE_SPIN_STEP = 0.06; // spin animation speed (~0.28s at 60fps)

// ── Build plates[] from the box objects currently in stock ──
// Called once from initGame() after stock is populated. Groups
// boxes by plateId and records each plate's 4 seat indices.
function buildPlates() {
  plates = [];
  if (!stock || !stock.length || !L || !L.cols) return;

  var groups = {};
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || b.isWall || b.isTunnel) continue;
    if (typeof b.plateId !== 'number' || b.plateId < 1) continue;
    if (!groups[b.plateId]) groups[b.plateId] = [];
    groups[b.plateId].push(i);
  }

  for (var key in groups) {
    var idxs = groups[key];
    if (idxs.length < 4) continue; // malformed plate — skip

    // Top-left anchor = smallest row, smallest col in the group.
    var minR = Infinity, minC = Infinity;
    for (var j = 0; j < idxs.length; j++) {
      var r = Math.floor(idxs[j] / L.cols), c = idxs[j] % L.cols;
      if (r < minR) minR = r;
      if (c < minC) minC = c;
    }
    var TL = minR * L.cols + minC;
    var TR = minR * L.cols + (minC + 1);
    var BR = (minR + 1) * L.cols + (minC + 1);
    var BL = (minR + 1) * L.cols + minC;

    plates.push({ cells: [TL, TR, BR, BL], cx: 0, cy: 0, rot: 0, spin: 0, displayAngle: 0 });
  }

  // Compute centers immediately so the first frame draws correctly.
  refreshPlateCenters();
}

// Recompute each plate's pixel center from its (fixed) seat cells.
// Kept layout-agnostic so window resizes are handled for free.
function refreshPlateCenters() {
  for (var pi = 0; pi < plates.length; pi++) {
    var p = plates[pi];
    var tl = p.cells[0];
    var r0 = Math.floor(tl / L.cols), c0 = tl % L.cols;
    p.cx = L.sx + c0 * (L.bw + L.bg) + L.bw + L.bg / 2;
    p.cy = L.sy + r0 * (L.bh + L.bg) + L.bh + L.bg / 2;
  }
}

// ── Spin every plate one step clockwise (one "move") ──
// Moves the box objects between seats and updates their grid
// positions, then kicks off the slide animation.
function rotatePlates() {
  if (!plates || plates.length === 0) return;

  for (var pi = 0; pi < plates.length; pi++) {
    var p = plates[pi];
    var c = p.cells;
    var b0 = stock[c[0]], b1 = stock[c[1]], b2 = stock[c[2]], b3 = stock[c[3]];

    // Clockwise: TL->TR, TR->BR, BR->BL, BL->TL
    stock[c[1]] = b0;
    stock[c[2]] = b1;
    stock[c[3]] = b2;
    stock[c[0]] = b3;

    // Snap each moved object to its new seat's grid position.
    for (var k = 0; k < 4; k++) {
      var idx = c[k];
      var r = Math.floor(idx / L.cols), col = idx % L.cols;
      var bx = stock[idx];
      bx.x = L.sx + col * (L.bw + L.bg);
      bx.y = L.sy + r * (L.bh + L.bg);
      bx.plateSpinning = true;
    }

    p.rot++;
    p.spin = 1; // animate from previous orientation to the new one
  }

  if (typeof sfx !== 'undefined' && sfx.spin) sfx.spin();

  // Little sparkle at each hub.
  for (var p2 = 0; p2 < plates.length; p2++) {
    spawnBurst(plates[p2].cx, plates[p2].cy, 'rgba(190,210,225,0.9)', 7);
  }
}

// ── Per-frame animation (called from update()) ──
function updatePlates() {
  if (!plates || plates.length === 0) return;
  refreshPlateCenters();

  var anySettled = false;
  for (var pi = 0; pi < plates.length; pi++) {
    var p = plates[pi];

    if (p.spin > 0) {
      p.spin -= PLATE_SPIN_STEP;
      if (p.spin <= 0) {
        p.spin = 0;
        anySettled = true;
        for (var k = 0; k < 4; k++) {
          var bs = stock[p.cells[k]];
          if (bs) { bs.drawDx = 0; bs.drawDy = 0; bs.plateSpinning = false; }
        }
      }
    }

    // easeOutCubic on progress (0 at spin start, 1 when settled)
    var progress = 1 - p.spin;
    var eased = 1 - Math.pow(1 - progress, 3);
    var ang = (eased - 1) * (Math.PI / 2); // -90deg .. 0
    p.displayAngle = p.rot * (Math.PI / 2) + ang;

    if (p.spin > 0) {
      var cosA = Math.cos(ang), sinA = Math.sin(ang);
      for (var k2 = 0; k2 < 4; k2++) {
        var b = stock[p.cells[k2]];
        if (!b) continue;
        var ccx = b.x + L.bw / 2, ccy = b.y + L.bh / 2;
        var dx = ccx - p.cx, dy = ccy - p.cy;
        var rx = dx * cosA - dy * sinA;
        var ry = dx * sinA + dy * cosA;
        b.drawDx = (p.cx + rx) - ccx;
        b.drawDy = (p.cy + ry) - ccy;
        b.plateSpinning = true;
      }
    }
  }

  // Re-evaluate which boxes can be reached once a spin settles.
  if (anySettled && typeof updateBoxReveals === 'function') updateBoxReveals(true);
}

// ── Turntable art, drawn UNDER the boxes (before drawStock) ──
function drawPlateBases() {
  if (!plates || plates.length === 0) return;

  for (var pi = 0; pi < plates.length; pi++) {
    var p = plates[pi];

    // Dim the platter once all four seats are spent.
    var allEmpty = true;
    for (var k = 0; k < 4; k++) {
      var b = stock[p.cells[k]];
      if (b && !(b.empty || b.used)) { allEmpty = false; break; }
    }

    var R = (L.bw + L.bg / 2) * 1.12; // disc radius — peeks out around the 2x2
    var spinning = p.spin > 0;

    ctx.save();
    ctx.globalAlpha = allEmpty ? 0.35 : 1;
    ctx.translate(p.cx, p.cy);

    // Soft drop shadow.
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 8 * S;
    ctx.shadowOffsetY = 3 * S;

    // Base disc.
    var grad = ctx.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.1, 0, 0, R);
    grad.addColorStop(0, '#5A6472');
    grad.addColorStop(0.55, '#444C58');
    grad.addColorStop(1, '#2C323C');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Outer rim.
    ctx.strokeStyle = 'rgba(150,165,180,0.55)';
    ctx.lineWidth = 2.5 * S;
    ctx.beginPath(); ctx.arc(0, 0, R - 1.5 * S, 0, Math.PI * 2); ctx.stroke();
    // Inner rim groove.
    ctx.strokeStyle = 'rgba(20,24,30,0.5)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2); ctx.stroke();

    // Rotating bits: 4 bolts + clockwise motion arc. Bolts sit at the
    // 45deg diagonals so they show through the gaps between the boxes.
    ctx.save();
    ctx.rotate(p.displayAngle);

    for (var d = 0; d < 4; d++) {
      var a = Math.PI / 4 + d * (Math.PI / 2);
      var bxp = Math.cos(a) * R * 0.9, byp = Math.sin(a) * R * 0.9;
      var boltR = R * 0.07;
      ctx.fillStyle = 'rgba(180,195,210,0.85)';
      ctx.beginPath(); ctx.arc(bxp, byp, boltR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(30,34,40,0.7)';
      ctx.beginPath(); ctx.arc(bxp, byp, boltR * 0.45, 0, Math.PI * 2); ctx.fill();
    }

    // Direction arcs (brighten briefly while spinning).
    ctx.strokeStyle = spinning ? 'rgba(120,220,255,0.85)' : 'rgba(150,165,180,0.3)';
    ctx.lineWidth = (spinning ? 3 : 2) * S;
    ctx.lineCap = 'round';
    for (var ai = 0; ai < 2; ai++) {
      var base = ai * Math.PI;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.6, base + 0.35, base + 1.2);
      ctx.stroke();
      // arrowhead at the leading (clockwise) end
      var ha = base + 1.2;
      var hx = Math.cos(ha) * R * 0.6, hy = Math.sin(ha) * R * 0.6;
      var tang = ha + Math.PI / 2; // clockwise tangent
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(tang - 0.5) * R * 0.12, hy - Math.sin(tang - 0.5) * R * 0.12);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(tang + 0.5) * R * 0.12, hy - Math.sin(tang + 0.5) * R * 0.12);
      ctx.stroke();
    }
    ctx.restore();

    // Center hub.
    var hubGrad = ctx.createRadialGradient(-R * 0.05, -R * 0.05, 0, 0, 0, R * 0.2);
    hubGrad.addColorStop(0, '#8893A2');
    hubGrad.addColorStop(1, '#3A414C');
    ctx.fillStyle = hubGrad;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,24,30,0.6)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();
  }
}
