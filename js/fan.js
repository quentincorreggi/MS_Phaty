// ============================================================
// fan.js — Fan mechanic (wall-mounted)
// A Fan is an attachment on a wall cell. It blows air out of one
// face of the wall (left or right) into the neighbouring column.
// Marbles falling through that column, at the fan's row, get pushed
// sideways — a visible swerve that delays the marble's arrival on
// the belt without changing its final sort column (every marble
// funnels to the same belt entry regardless of its fall path).
//
// Rules:
//   • Blow direction points AWAY from the wall body, so it always
//     aims at the open board (enforced at placement in the editor).
//   • The fan is always active; there is no trigger or charge.
//   • No chaining: a marble already deflected by one fan is never
//     deflected again by another.
// ============================================================

// Tuning
var FAN_ACCEL = 4.5;   // lateral acceleration right in front of the fan (gravity is ~0.67)
var FAN_VMAX  = 13.0;  // cap on lateral speed the fan will add (in *S units)
var FAN_RANGE_CELLS = 2.5; // how far above/below the fan its wind reaches, in cells

// Active wind zones, rebuilt whenever the grid/layout changes.
var fanZones = [];

// Build wind zones from the current stock grid + layout.
function buildFanZones() {
  fanZones = [];
  if (!stock || !stock.length || !L || !L.bw) return;
  var range = (L.bh + L.bg) * FAN_RANGE_CELLS;  // vertical reach of the wind
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || !b.isWall || !b.fanDir) continue;
    // Cover ONLY the single column immediately next to the fan — the
    // adjacent cell's x-span, so the column beyond it is never touched.
    var x0, x1;
    if (b.fanDir === 'right') { x0 = b.x + L.bw + L.bg;   x1 = x0 + L.bw; }
    else                      { x1 = b.x - L.bg;          x0 = x1 - L.bw; }
    // Influence is a band centred on the fan's row (fy). Outside this
    // band there is no wind, so marbles fall straight until they
    // approach the fan, then swerve as they pass it.
    var fy = b.y + L.bh / 2;
    fanZones.push({ key: i, dir: b.fanDir,
      x0: x0, x1: x1, y0: fy - range, y1: fy + range, fy: fy, range: range });
  }
}

// Apply fan wind to a single marble during a physics sub-step.
// Called from physicsStep() before the position integration.
function applyFanForces(m, subSteps) {
  if (!fanZones.length) return;
  for (var i = 0; i < fanZones.length; i++) {
    var z = fanZones[i];
    if (m.x < z.x0 || m.x > z.x1 || m.y < z.y0 || m.y > z.y1) continue;

    if (m.fanKey === undefined) {
      // First fan to grab this marble claims it.
      m.fanKey = z.key;
      if (typeof sfx !== 'undefined' && sfx.whoosh) sfx.whoosh();
      spawnFanPuff(m, z.dir);
    } else if (m.fanKey !== z.key) {
      // Already deflected by a different fan — no chaining.
      continue;
    }

    var dir = (z.dir === 'right') ? 1 : -1;

    // Smooth window (raised cosine): 0 at the band edges, ramping up to
    // full strength right in front of the fan. Marbles fall straight
    // outside the band and swerve most as they pass the fan's row.
    var norm = (m.y - z.fy) / z.range;       // -1..1 inside the band
    if (norm < -1 || norm > 1) return;
    var factor = 0.5 * (1 + Math.cos(Math.PI * norm));

    var vmax = FAN_VMAX * S * factor;
    if ((dir > 0 && m.vx < vmax) || (dir < 0 && m.vx > -vmax)) {
      m.vx += FAN_ACCEL * factor * S * dir / subSteps;
    }
    return; // one gust at a time
  }
}

// Little air puff trailing off the marble as it enters the gust.
function spawnFanPuff(m, dir) {
  var d = (dir === 'right') ? 1 : -1;
  for (var p = 0; p < 6; p++) {
    var sp = 1.5 + Math.random() * 3;
    particles.push({
      x: m.x, y: m.y,
      vx: d * sp * S + (Math.random() - 0.5) * S,
      vy: (Math.random() - 0.5) * 1.8 * S,
      r: (1.5 + Math.random() * 2.2) * S,
      color: 'rgba(200,235,255,0.85)',
      life: 0.7, decay: 0.04 + Math.random() * 0.02, grav: false
    });
  }
}

// Draw every fan's blades + wind streaks. Called from frame() right
// after drawStock() so marbles render on top of the airflow.
function drawFans() {
  if (!stock || !stock.length || !L || !L.bw) return;
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || !b.isWall || !b.fanDir) continue;
    drawFanUnit(b.x, b.y, L.bw, L.bh, S, b.fanDir, tick);
  }
}

// Side-profile blower, mounted flush on the wall's blow face. Everything
// is drawn INSIDE the wall cell's footprint so it never covers the
// neighbouring cell.
function drawFanUnit(x, y, w, h, S, dir, tick) {
  var d = (dir === 'right') ? 1 : -1;
  var faceX = (dir === 'right') ? x + w : x;             // blow face of the wall
  var backX = (dir === 'right') ? x + w * 0.40 : x + w * 0.60; // inner edge of housing

  ctx.save();

  // ── Housing shell (side view) on the wall face ──
  var houseTop = y + h * 0.10;
  var houseBot = y + h * 0.90;
  var houseH = houseBot - houseTop;
  var hx0 = Math.min(backX, faceX);
  var hx1 = Math.max(backX, faceX);
  var hw = hx1 - hx0;

  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 5 * S;
  ctx.shadowOffsetX = d * 1.5 * S;
  ctx.fillStyle = 'rgba(52,63,72,0.97)';
  ctx.beginPath(); rRect(hx0, houseTop, hw, houseH, 5 * S); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;
  ctx.strokeStyle = 'rgba(22,28,34,0.9)';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); rRect(hx0, houseTop, hw, houseH, 5 * S); ctx.stroke();

  // ── Spinning rotor seen edge-on: tilted blades scrolling vertically ──
  ctx.save();
  ctx.beginPath(); rRect(hx0, houseTop, hw, houseH, 5 * S); ctx.clip();

  var rootX = (dir === 'right') ? hx0 + hw * 0.34 : hx1 - hw * 0.34; // near motor
  var tipX  = (dir === 'right') ? hx1 - hw * 0.06 : hx0 + hw * 0.06; // near blow face
  var blades = 4;
  var spacing = houseH / blades;
  var scroll = (tick * 0.35 * d) % spacing;   // slower spin
  if (scroll < 0) scroll += spacing;

  ctx.fillStyle = 'rgba(196,212,222,0.96)';
  for (var b = -1; b <= blades; b++) {
    var by = houseTop + b * spacing + scroll;
    ctx.beginPath();
    ctx.moveTo(rootX, by);
    ctx.quadraticCurveTo(tipX, by - spacing * 0.5, tipX, by - spacing * 0.12);
    ctx.quadraticCurveTo(tipX, by + spacing * 0.14, rootX, by);
    ctx.fill();
  }
  ctx.restore(); // drop clip

  // ── Motor spindle at the back edge, outlet lip at the blow face ──
  ctx.fillStyle = 'rgba(28,35,42,0.95)';
  var motorX = (dir === 'right') ? hx0 : hx1 - 4 * S;
  ctx.beginPath(); rRect(motorX, houseTop, 4 * S, houseH, 2 * S); ctx.fill();

  ctx.strokeStyle = 'rgba(190,235,255,0.7)';
  ctx.lineWidth = 2 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(faceX, houseTop + 3 * S);
  ctx.lineTo(faceX, houseBot - 3 * S);
  ctx.stroke();

  ctx.restore();
}
