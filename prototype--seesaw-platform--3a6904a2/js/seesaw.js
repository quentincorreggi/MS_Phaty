// ============================================================
// seesaw.js — See-Saw pivot platform mechanic
// ============================================================
// A see-saw is a 2-cell-wide tilting plank balanced on a
// central fulcrum. It occupies two horizontally-adjacent grid
// cells (a 'left' arm cell and a 'right' arm cell). The boxes
// sitting DIRECTLY ABOVE the two arms feed marbles onto the
// plank when tapped.
//
// Physics: marbles poured onto an arm are real physics marbles.
// The plank tilts toward the heavier side, and marbles roll off
// the low end and fall down to the funnel / belt like any other.
//
// The catch: a loaded side can only tip DOWN if the opposite arm
// is free to rise. If a live (unopened) box sits in the cell
// above the rising arm, the plank is jammed — marbles pile up on
// the flat plank ("Balls Blocked") until the player opens that
// blocking box. Once it is cleared, the plank is free to tip.
//
// Interaction: none directly on the see-saw. The player taps the
// feeder boxes above it, exactly like normal boxes.
// ============================================================

var SEESAW_MAX_TILT = 0.52;     // ~30 degrees at full tip
var SEESAW_EASE = 0.14;         // how fast the plank eases toward its target angle
var SEESAW_TORQUE_THRESH = 0.3; // fraction of a marble radius of net torque needed to commit
var SEESAW_SETTLE_FRAMES = 60;  // force-commit a balanced-but-loaded plank after this many frames

// ── Construction ──

function makeSeesawStockEntry(r, c, arm) {
  return {
    isSeesaw: true, seesawArm: arm, seesawId: -1,
    isTunnel: false, isWall: false, isFirework: false,
    ci: 0, used: false, remaining: 0, spawning: false, spawnIdx: 0,
    revealed: false, empty: false, boxType: 'default',
    iceHP: 0, iceCrackT: 0, iceShatterT: 0, blockerCount: 0,
    x: L.sx + c * (L.bw + L.bg), y: L.sy + r * (L.bh + L.bg),
    shakeT: 0, hoverT: 0, popT: 0, revealT: 0, emptyT: 0, idlePhase: 0
  };
}

function makeSeesaw(leftIdx, rightIdx) {
  var ss = {
    leftIdx: leftIdx, rightIdx: rightIdx,
    aboveLeftIdx: (leftIdx - L.cols >= 0) ? leftIdx - L.cols : -1,
    aboveRightIdx: (rightIdx - L.cols >= 0) ? rightIdx - L.cols : -1,
    angle: 0, renderAngle: 0,
    tipping: false, tipDir: 0,
    blockedSide: 0, wobbleT: 0, dumpT: 0, settleT: 0,
    pivotX: 0, pivotY: 0, halfLen: 0, lipH: 0,
    leftEnd: { x: 0, y: 0 }, rightEnd: { x: 0, y: 0 },
    leftLipEnd: { x: 0, y: 0 }, rightLipEnd: { x: 0, y: 0 }
  };
  computeSeesawGeometry(ss);
  computeSeesawEndpoints(ss);
  return ss;
}

// Build the seesaws[] list from the current stock. Each 'left'
// arm cell that has a matching 'right' arm cell to its immediate
// right (same row) forms one see-saw.
function buildSeesaws() {
  seesaws = [];
  if (!stock || !stock.length || !L.cols) return;
  for (var i = 0; i < stock.length; i++) {
    var s = stock[i];
    if (!s || !s.isSeesaw || s.seesawArm !== 'left') continue;
    var col = i % L.cols;
    if (col >= L.cols - 1) continue;          // no room to the right
    var rightI = i + 1;
    var rs = stock[rightI];
    if (!rs || !rs.isSeesaw || rs.seesawArm !== 'right') continue;
    var id = seesaws.length;
    s.seesawId = id;
    rs.seesawId = id;
    seesaws.push(makeSeesaw(i, rightI));
  }
}

// ── Geometry ──

function computeSeesawGeometry(ss) {
  var lx = stock[ss.leftIdx].x, ly = stock[ss.leftIdx].y;
  var rx = stock[ss.rightIdx].x;
  ss.pivotX = (lx + rx) / 2 + L.bw / 2;
  ss.pivotY = ly + L.bh * 0.60;
  // Each arm reaches the outer edge of its cell, so a marble dropped
  // from anywhere in the feeder box above always lands on the plank.
  ss.halfLen = (rx - lx) / 2 + L.bw * 0.5;
  // Tall enough end lips that a full box's worth of marbles piles up
  // and is genuinely held while the plank is jammed (they only escape
  // once the plank is freed and tips, which drops the lips).
  ss.lipH = getMR() * Math.min(6, 2.6 + (MRB_PER_BOX || 6) * 0.35);
}

function computeSeesawEndpoints(ss) {
  var a = ss.renderAngle;
  var dx = Math.cos(a), dy = Math.sin(a);
  ss.leftEnd.x = ss.pivotX - ss.halfLen * dx;
  ss.leftEnd.y = ss.pivotY - ss.halfLen * dy;
  ss.rightEnd.x = ss.pivotX + ss.halfLen * dx;
  ss.rightEnd.y = ss.pivotY + ss.halfLen * dy;
  // "Up" normal of the plank (points away from the ground).
  var nx = Math.sin(a), ny = -Math.cos(a);
  ss.leftLipEnd.x = ss.leftEnd.x + nx * ss.lipH;
  ss.leftLipEnd.y = ss.leftEnd.y + ny * ss.lipH;
  ss.rightLipEnd.x = ss.rightEnd.x + nx * ss.lipH;
  ss.rightLipEnd.y = ss.rightEnd.y + ny * ss.lipH;
}

// A rising arm is only free to lift if the cell above it is clear
// (off the top of the grid, empty, or a used-up box). A live box,
// wall, tunnel, firework or another seesaw all block the lift.
function seesawArmClear(aboveIdx) {
  if (aboveIdx < 0) return true;
  var s = stock[aboveIdx];
  if (!s) return true;
  if (s.isWall || s.isTunnel || s.isFirework || s.isSeesaw) return false;
  return !!(s.empty || s.used);
}

// ── Per-frame update ──

function updateSeesaws() {
  if (typeof seesaws === 'undefined' || !seesaws.length) return;
  var MR = getMR();
  var thresh = MR * SEESAW_TORQUE_THRESH;

  for (var s = 0; s < seesaws.length; s++) {
    var ss = seesaws[s];
    computeSeesawGeometry(ss);

    // Tally marbles resting on / piled above the plank, and the net
    // torque about the pivot (positive = right side heavier).
    var a = ss.angle;
    var dx = Math.cos(a), dy = Math.sin(a);
    var nx = Math.sin(a), ny = -Math.cos(a); // up-normal
    var load = 0, torque = 0;
    for (var i = 0; i < physMarbles.length; i++) {
      var m = physMarbles[i];
      var relx = m.x - ss.pivotX, rely = m.y - ss.pivotY;
      var along = relx * dx + rely * dy;         // signed distance along the plank
      var above = relx * nx + rely * ny;         // height above the plank surface
      if (Math.abs(along) > ss.halfLen + MR) continue;
      if (above < -MR || above > MR * 6) continue;
      load++;
      torque += along;
    }

    // Decide the plank's behaviour.
    if (ss.tipping) {
      if (load === 0) { ss.tipping = false; ss.tipDir = 0; ss.settleT = 0; }
    } else if (load > 0) {
      ss.settleT++;
      var wantCommit = (Math.abs(torque) > thresh) || (ss.settleT > SEESAW_SETTLE_FRAMES);
      if (wantCommit) {
        var downDir = (torque >= 0) ? 1 : -1;               // +1 = right end drops
        var risingAbove = (downDir > 0) ? ss.aboveLeftIdx : ss.aboveRightIdx;
        if (seesawArmClear(risingAbove)) {
          startSeesawTip(ss, downDir);
        } else {
          ss.blockedSide = (downDir > 0) ? -1 : 1;          // the jammed rising side
          if (ss.wobbleT <= 0) triggerSeesawBlocked(ss);
        }
      }
    } else {
      ss.blockedSide = 0;
      ss.settleT = 0;
    }

    // Ease the plank toward its target angle, with a small wobble
    // while it is jammed to signal "I want to move but can't".
    var target = ss.tipping ? ss.tipDir * SEESAW_MAX_TILT : 0;
    ss.angle += (target - ss.angle) * SEESAW_EASE;
    var wob = (ss.blockedSide !== 0 && !ss.tipping) ? Math.sin(tick * 0.5) * 0.028 : 0;
    ss.renderAngle = ss.angle + wob;
    computeSeesawEndpoints(ss);

    if (ss.wobbleT > 0) ss.wobbleT = Math.max(0, ss.wobbleT - 0.04);
    if (ss.dumpT > 0) ss.dumpT = Math.max(0, ss.dumpT - 0.03);
  }
}

function startSeesawTip(ss, dir) {
  ss.tipping = true;
  ss.tipDir = dir;
  ss.blockedSide = 0;
  ss.settleT = 0;
  ss.dumpT = 1.0;
  // Wooden clack on the fulcrum.
  if (typeof tone === 'function') tone(220, 0.09, 'triangle', 0.06, 140);
  // A little dust puff at the low end.
  var end = dir > 0 ? ss.rightEnd : ss.leftEnd;
  for (var p = 0; p < 8; p++) {
    var ang = Math.PI * (dir > 0 ? 0.15 : 0.85) + (Math.random() - 0.5) * 1.2;
    var sp = 1.5 + Math.random() * 2.5;
    particles.push({
      x: end.x, y: end.y,
      vx: Math.cos(ang) * sp * S, vy: -Math.abs(Math.sin(ang)) * sp * S,
      r: (1.5 + Math.random() * 2.5) * S, color: 'rgba(200,150,90,0.7)',
      life: 0.7, decay: 0.04, grav: true
    });
  }
}

function triggerSeesawBlocked(ss) {
  ss.wobbleT = 1.0;
  // Dull thunk.
  if (typeof tone === 'function') tone(120, 0.12, 'sine', 0.05, 70);
  // Flash + jiggle the box that is doing the blocking.
  var blkIdx = ss.blockedSide < 0 ? ss.aboveLeftIdx : ss.aboveRightIdx;
  if (blkIdx >= 0 && stock[blkIdx]) {
    var bb = stock[blkIdx];
    bb.shakeT = 0.5;
    var bx = bb.x + L.bw / 2, by = bb.y + L.bh / 2;
    for (var p = 0; p < 8; p++) {
      var ang = Math.PI * 2 * p / 8 + Math.random() * 0.4;
      var sp = 1.5 + Math.random() * 2;
      particles.push({
        x: bx, y: by,
        vx: Math.cos(ang) * sp * S, vy: Math.sin(ang) * sp * S,
        r: (1.5 + Math.random() * 2) * S, color: 'rgba(255,80,80,0.75)',
        life: 0.6, decay: 0.045, grav: false
      });
    }
  }
}

// ── Rendering ──

function drawSeesaws() {
  if (typeof seesaws === 'undefined' || !seesaws.length) return;

  for (var s = 0; s < seesaws.length; s++) {
    var ss = seesaws[s];
    var a = ss.renderAngle;

    ctx.save();

    // Fulcrum — slate triangle sitting under the pivot.
    var fw = L.bw * 0.36, fh = L.bh * 0.44;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 4 * S;
    ctx.shadowOffsetY = 2 * S;
    var fgrad = ctx.createLinearGradient(ss.pivotX, ss.pivotY, ss.pivotX, ss.pivotY + fh);
    fgrad.addColorStop(0, '#6B7484');
    fgrad.addColorStop(1, '#454C5A');
    ctx.fillStyle = fgrad;
    ctx.beginPath();
    ctx.moveTo(ss.pivotX, ss.pivotY - 3 * S);
    ctx.lineTo(ss.pivotX - fw / 2, ss.pivotY + fh);
    ctx.lineTo(ss.pivotX + fw / 2, ss.pivotY + fh);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#333844'; ctx.lineWidth = 1.5 * S;
    ctx.stroke();

    // Plank — rotated wooden bar.
    ctx.translate(ss.pivotX, ss.pivotY);
    ctx.rotate(a);
    var plankH = Math.max(7 * S, L.bh * 0.17);
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4 * S;
    ctx.shadowOffsetY = 2 * S;
    var pgrad = ctx.createLinearGradient(0, -plankH / 2, 0, plankH / 2);
    pgrad.addColorStop(0, '#D19A5E');
    pgrad.addColorStop(0.5, '#B07A34');
    pgrad.addColorStop(1, '#8A5C24');
    ctx.fillStyle = pgrad;
    rRect(-ss.halfLen, -plankH / 2, ss.halfLen * 2, plankH, plankH / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#6E4718'; ctx.lineWidth = 1.5 * S;
    rRect(-ss.halfLen, -plankH / 2, ss.halfLen * 2, plankH, plankH / 2);
    ctx.stroke();

    // Raised end lips — present whenever the plank is holding
    // marbles (i.e. not actively tipping them off).
    if (!ss.tipping) {
      ctx.fillStyle = '#8A5C24';
      ctx.strokeStyle = '#6E4718';
      var lw = plankH * 0.72;
      var lh = ss.lipH * 0.62;
      rRect(-ss.halfLen, -plankH / 2 - lh, lw, lh + plankH * 0.5, 2 * S); ctx.fill(); ctx.stroke();
      rRect(ss.halfLen - lw, -plankH / 2 - lh, lw, lh + plankH * 0.5, 2 * S); ctx.fill(); ctx.stroke();
    }

    // Wood grain.
    ctx.strokeStyle = 'rgba(90,55,22,0.28)'; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(-ss.halfLen * 0.82, -plankH * 0.12); ctx.lineTo(ss.halfLen * 0.82, -plankH * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-ss.halfLen * 0.82, plankH * 0.18); ctx.lineTo(ss.halfLen * 0.82, plankH * 0.18); ctx.stroke();

    // Pivot bolt.
    ctx.fillStyle = '#333844';
    ctx.beginPath(); ctx.arc(0, 0, plankH * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9AA3B3';
    ctx.beginPath(); ctx.arc(0, 0, plankH * 0.18, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // Blocked feedback — pulse a red frame around the jamming box.
    if (ss.blockedSide !== 0 && !ss.tipping) {
      var blkIdx = ss.blockedSide < 0 ? ss.aboveLeftIdx : ss.aboveRightIdx;
      if (blkIdx >= 0 && stock[blkIdx]) {
        var bb = stock[blkIdx];
        var pulse = 0.35 + Math.sin(tick * 0.28) * 0.22;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,70,70,' + pulse + ')';
        ctx.lineWidth = 3 * S;
        rRect(bb.x - 2 * S, bb.y - 2 * S, L.bw + 4 * S, L.bh + 4 * S, 8 * S);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
