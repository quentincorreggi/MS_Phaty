// ============================================================
// tilt.js — Accelerometer / device orientation gravity tilt
//           Adds a horizontal gravity component driven by phone tilt
//           (or arrow keys on desktop). Opt-in per level.
// ============================================================

// Tuning
var TILT_MAX_DEG = 30;              // degrees of tilt that produce full effect
var TILT_DEADBAND_DEG = 4;          // ignore tiny tilts near neutral
var TILT_MAX_HORIZONTAL = 0.7;      // fraction of gravity pulled sideways at full tilt
var TILT_VERT_VARIATION = 0.15;     // forward/back tilt modulates vertical gravity +/- this
var TILT_SMOOTH = 0.18;             // input smoothing (higher = snappier)

// State
var tiltEnabled = false;            // per-level flag (set in initGame)
var tiltSensorAvailable = false;    // browser supports DeviceOrientationEvent
var tiltSensorFiring = false;       // we've received at least one orientation event
var tiltNeedsPrompt = false;        // iOS requires a user-gesture permission prompt
var tiltPermGranted = false;        // iOS permission was granted
var tiltPermRequested = false;      // permission has been asked this session
var tiltX = 0, tiltY = 0;           // smoothed -1..1 (right+, down+)
var tiltRawGamma = 0, tiltRawBeta = 0;
var tiltBetaRest = null;            // calibrated neutral front/back pose
var tiltKey = { left: false, right: false, up: false, down: false };
var _tiltInit = false;

function initTiltControls() {
  if (_tiltInit) return;
  _tiltInit = true;
  if (typeof DeviceOrientationEvent !== 'undefined') {
    tiltSensorAvailable = true;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      tiltNeedsPrompt = true; // iOS 13+ needs explicit user-gesture opt-in
    } else {
      attachTiltListener();
    }
  }
  window.addEventListener('keydown', _tiltKeyHandler);
  window.addEventListener('keyup', _tiltKeyHandler);
}

function _tiltKeyHandler(e) {
  if (!tiltEnabled) return;
  var down = e.type === 'keydown';
  if (e.key === 'ArrowLeft')       { tiltKey.left = down; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { tiltKey.right = down; e.preventDefault(); }
  else if (e.key === 'ArrowUp')    { tiltKey.up = down; e.preventDefault(); }
  else if (e.key === 'ArrowDown')  { tiltKey.down = down; e.preventDefault(); }
}

function attachTiltListener() {
  window.addEventListener('deviceorientation', _handleOrientation);
}

function _handleOrientation(e) {
  if (e.gamma === null || e.beta === null) return;
  tiltSensorFiring = true;
  tiltRawGamma = e.gamma;
  tiltRawBeta = e.beta;
  if (tiltBetaRest === null) tiltBetaRest = e.beta; // zero out initial hold pose
}

function requestTiltPermission() {
  if (tiltPermRequested || !tiltNeedsPrompt) return;
  tiltPermRequested = true;
  try {
    DeviceOrientationEvent.requestPermission().then(function (state) {
      if (state === 'granted') {
        tiltPermGranted = true;
        tiltNeedsPrompt = false;
        tiltBetaRest = null;
        attachTiltListener();
      } else {
        tiltPermRequested = false; // allow retry
      }
    }).catch(function () { tiltPermRequested = false; });
  } catch (err) {
    tiltPermRequested = false;
  }
}

function updateTiltInput() {
  if (!tiltEnabled) { tiltX = 0; tiltY = 0; return; }
  var targetX = 0, targetY = 0;
  if (tiltSensorFiring) {
    var g = tiltRawGamma;
    var absG = Math.abs(g);
    if (absG > TILT_DEADBAND_DEG) {
      targetX = (g > 0 ? 1 : -1) * Math.min(1, (absG - TILT_DEADBAND_DEG) / (TILT_MAX_DEG - TILT_DEADBAND_DEG));
    }
    var b = tiltRawBeta - (tiltBetaRest === null ? 0 : tiltBetaRest);
    var absB = Math.abs(b);
    if (absB > TILT_DEADBAND_DEG) {
      targetY = (b > 0 ? 1 : -1) * Math.min(1, (absB - TILT_DEADBAND_DEG) / (TILT_MAX_DEG - TILT_DEADBAND_DEG));
    }
  }
  // Keyboard fallback overrides when pressed
  if (tiltKey.left)  targetX = -1;
  if (tiltKey.right) targetX = 1;
  if (tiltKey.up)    targetY = -1;
  if (tiltKey.down)  targetY = 1;

  tiltX += (targetX - tiltX) * TILT_SMOOTH;
  tiltY += (targetY - tiltY) * TILT_SMOOTH;
}

function getTiltGravityX() {
  if (!tiltEnabled) return 0;
  return PHYS_GRAVITY * tiltX * TILT_MAX_HORIZONTAL;
}

function getTiltGravityYMul() {
  if (!tiltEnabled) return 1;
  return 1 + tiltY * TILT_VERT_VARIATION;
}

function drawTiltIndicator() {
  if (!tiltEnabled) return;
  var size = 44 * S;
  // Sit below the back button (which is ~40px tall at top-left with 10px pad)
  var cx = (L && L.bkX !== undefined ? L.bkX : 12 * S) + size / 2;
  var cy = (L && L.bkY !== undefined ? L.bkY + L.bkSize + 12 * S : 70 * S) + size / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  ctx.lineWidth = 1.5 * S;
  ctx.strokeStyle = 'rgba(139,105,20,0.65)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(139,105,20,0.22)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(cx - size / 2 + 3 * S, cy); ctx.lineTo(cx + size / 2 - 3 * S, cy);
  ctx.moveTo(cx, cy - size / 2 + 3 * S); ctx.lineTo(cx, cy + size / 2 - 3 * S);
  ctx.stroke();
  var ballR = size * 0.17;
  var travel = size / 2 - ballR - 3 * S;
  var bx = cx + tiltX * travel;
  var by = cy + tiltY * travel;
  var mag = Math.min(1, Math.sqrt(tiltX * tiltX + tiltY * tiltY));
  ctx.beginPath(); ctx.arc(bx, by, ballR, 0, Math.PI * 2);
  ctx.fillStyle = mag > 0.75 ? '#FF7F50' : '#8B6914';
  ctx.fill();
  ctx.font = '700 ' + Math.round(9 * S) + 'px Fredoka, sans-serif';
  ctx.fillStyle = '#5A4A38';
  ctx.textAlign = 'center';
  ctx.fillText('TILT', cx, cy + size / 2 + 11 * S);
  // Hint text next to indicator when no input yet
  if (!tiltSensorFiring && !tiltKey.left && !tiltKey.right && !tiltKey.up && !tiltKey.down) {
    ctx.textAlign = 'left';
    ctx.font = Math.round(11 * S) + 'px Fredoka, sans-serif';
    ctx.fillStyle = '#8B6914';
    var hint;
    if (tiltNeedsPrompt && !tiltPermGranted) hint = 'Tap Enable Tilt';
    else if (tiltSensorAvailable)            hint = 'Tilt your phone';
    else                                     hint = 'Arrow keys';
    ctx.fillText(hint, cx + size / 2 + 8 * S, cy + 4 * S);
  }
  ctx.restore();
}

function drawTiltFunnelGlow() {
  if (!tiltEnabled) return;
  if (!funnelWalls || funnelWalls.length < 4) return;
  var mag = Math.abs(tiltX);
  if (mag < 0.15) return;
  // Glow the two wall segments on the side gravity is pulling toward.
  // Walls: 0 = left vertical, 1 = right vertical, 2 = left slant, 3 = right slant.
  var idxs = tiltX < 0 ? [0, 2] : [1, 3];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = (3 + 5 * mag) * S;
  ctx.strokeStyle = 'rgba(255,180,80,' + (0.25 + 0.4 * mag) + ')';
  ctx.shadowColor = 'rgba(255,180,80,0.7)';
  ctx.shadowBlur = 10 * S * mag;
  for (var k = 0; k < idxs.length; k++) {
    var w = funnelWalls[idxs[k]];
    if (!w) continue;
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.stroke();
  }
  ctx.restore();
}

function ensureEnableTiltButton() {
  var btn = document.getElementById('enable-tilt-btn');
  var needed = tiltEnabled && gameActive && tiltNeedsPrompt && !tiltPermGranted;
  if (!btn && needed) {
    btn = document.createElement('button');
    btn.id = 'enable-tilt-btn';
    btn.textContent = 'Enable Tilt';
    // Center-top placement so it doesn't fight the back button or cal button
    btn.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:40;' +
      'padding:10px 22px;border:none;border-radius:14px;' +
      'background:linear-gradient(135deg,#C89CF2,#9060C4);color:white;' +
      'font-family:Fredoka,sans-serif;font-weight:700;font-size:14px;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(144,96,196,0.45);' +
      'animation:tilt-pulse 1.2s ease-in-out infinite alternate';
    btn.onclick = function () { requestTiltPermission(); };
    document.body.appendChild(btn);
    if (!document.getElementById('tilt-style')) {
      var sty = document.createElement('style');
      sty.id = 'tilt-style';
      sty.textContent = '@keyframes tilt-pulse{from{transform:translateX(-50%) scale(1)}to{transform:translateX(-50%) scale(1.07)}}';
      document.head.appendChild(sty);
    }
  }
  if (btn) btn.style.display = needed ? '' : 'none';
}

function resetTiltForLevel() {
  tiltX = 0; tiltY = 0;
  tiltBetaRest = null; // re-calibrate neutral pose on level start
  tiltKey.left = tiltKey.right = tiltKey.up = tiltKey.down = false;
}
