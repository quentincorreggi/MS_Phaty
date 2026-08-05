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
var FAN_ACCEL = 1.1;   // lateral acceleration inside a gust (gravity is ~0.67)
var FAN_VMAX  = 4.5;   // cap on lateral speed the fan will add (in *S units)

// Active wind zones, rebuilt whenever the grid/layout changes.
var fanZones = [];

// Build wind zones from the current stock grid + layout.
function buildFanZones() {
  fanZones = [];
  if (!stock || !stock.length || !L || !L.bw) return;
  var cellStep = L.bw + L.bg;
  var reach = cellStep * 1.3;   // gust covers the adjacent column (+ a little)
  for (var i = 0; i < stock.length; i++) {
    var b = stock[i];
    if (!b || !b.isWall || !b.fanDir) continue;
    var y0 = b.y - L.bh * 0.25;
    var y1 = b.y + L.bh * 1.25;
    var x0, x1;
    if (b.fanDir === 'right') { x0 = b.x + L.bw; x1 = x0 + reach; }
    else                      { x1 = b.x;        x0 = x1 - reach; }
    fanZones.push({ key: i, dir: b.fanDir, x0: x0, x1: x1, y0: y0, y1: y1 });
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
    var vmax = FAN_VMAX * S;
    if ((dir > 0 && m.vx < vmax) || (dir < 0 && m.vx > -vmax)) {
      m.vx += FAN_ACCEL * S * dir / subSteps;
    }
    return; // one gust at a time
  }
}

// Little air puff trailing off the marble as it enters the gust.
function spawnFanPuff(m, dir) {
  var d = (dir === 'right') ? 1 : -1;
  for (var p = 0; p < 4; p++) {
    var sp = 1 + Math.random() * 2;
    particles.push({
      x: m.x, y: m.y,
      vx: d * sp * S + (Math.random() - 0.5) * S,
      vy: (Math.random() - 0.5) * 1.5 * S,
      r: (1.5 + Math.random() * 2) * S,
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

function drawFanUnit(x, y, w, h, S, dir, tick) {
  var d = (dir === 'right') ? 1 : -1;
  var cy = y + h / 2;
  var faceX = (dir === 'right') ? x + w : x;
  var cellStep = L.bw + L.bg;
  var reach = cellStep * 1.3;

  ctx.save();

  // ── Wind gust: cyan chevrons drifting in the blow direction ──
  var chevCount = 3;
  var period = 42;
  var phase = (tick % period) / period;           // 0..1 loop
  for (var k = 0; k < chevCount; k++) {
    var f = ((k + phase) / chevCount);             // 0..1 across the reach
    var gx = faceX + d * f * reach;
    var alpha = 0.4 * (1 - Math.abs(f - 0.5) * 1.4);
    if (alpha <= 0.01) continue;
    var chevH = h * 0.28 * (0.6 + f * 0.7);
    ctx.strokeStyle = 'rgba(150,220,255,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 2.5 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(gx - d * 5 * S, cy - chevH);
    ctx.lineTo(gx + d * 5 * S, cy);
    ctx.lineTo(gx - d * 5 * S, cy + chevH);
    ctx.stroke();
  }

  // ── Fan housing on the wall face ──
  var hubR = h * 0.30;
  var hubX = faceX + d * hubR * 0.55;

  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 5 * S;
  ctx.fillStyle = 'rgba(58,70,80,0.97)';
  ctx.strokeStyle = 'rgba(28,36,43,0.95)';
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  ctx.arc(hubX, cy, hubR + 3 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Rotating blades
  ctx.save();
  ctx.translate(hubX, cy);
  ctx.rotate(d * tick * 0.28);
  var blades = 4;
  ctx.fillStyle = 'rgba(196,212,222,0.97)';
  for (var bd = 0; bd < blades; bd++) {
    ctx.rotate(Math.PI * 2 / blades);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(hubR * 0.9, -hubR * 0.4, hubR, 0);
    ctx.quadraticCurveTo(hubR * 0.9, hubR * 0.15, 0, 0);
    ctx.fill();
  }
  ctx.restore();

  // Center cap
  ctx.fillStyle = 'rgba(240,250,255,0.98)';
  ctx.beginPath();
  ctx.arc(hubX, cy, hubR * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
