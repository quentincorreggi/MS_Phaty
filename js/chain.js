// ============================================================
// chain.js — Chain mechanic: links pairs of boxes together.
//            Both must be revealed for either to be tappable.
//            Tapping one automatically activates the other.
// ============================================================

// ── Drawing ──

function drawChains() {
  if (!chains || chains.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (var i = 0; i < chains.length; i++) {
    var ch = chains[i];
    var a = stock[ch.a], b = stock[ch.b];
    if (!a || !b) continue;
    if (a.used && b.used) continue;

    var ax = a.x + L.bw / 2, ay = a.y + L.bh / 2;
    var bx = b.x + L.bw / 2, by = b.y + L.bh / 2;

    if (ch.errorT > 0) {
      var alpha = 0.4 + ch.errorT * 0.6;
      ctx.strokeStyle = 'rgba(210,35,35,' + alpha + ')';
      ctx.lineWidth = (2.5 + ch.errorT * 1.5) * S;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2.5 * S;
    }
    ctx.setLineDash([5 * S, 4 * S]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Helpers ──

function getChainForBox(idx) {
  for (var i = 0; i < chains.length; i++) {
    if (chains[i].a === idx || chains[i].b === idx) return chains[i];
  }
  return null;
}

function getChainPartnerIdx(idx) {
  var ch = getChainForBox(idx);
  if (!ch) return -1;
  return ch.a === idx ? ch.b : ch.a;
}

function isChainReady(idx) {
  var ch = getChainForBox(idx);
  if (!ch) return true; // not chained — always ready
  var pi = ch.a === idx ? ch.b : ch.a;
  var p = stock[pi];
  if (p.used) return true; // partner already used, chain spent
  if (!p.revealed) return false;
  if (p.iceHP > 0) return false;
  if (p.spawning || p.revealT > 0) return false;
  return true;
}

// ── Update ──

function updateChains() {
  for (var i = 0; i < chains.length; i++) {
    if (chains[i].errorT > 0) {
      chains[i].errorT = Math.max(0, chains[i].errorT - 0.03);
    }
  }
}
