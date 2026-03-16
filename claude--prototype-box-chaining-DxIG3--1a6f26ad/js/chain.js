// ============================================================
// chain.js — Chain mechanic: link boxes for chain reactions
// ============================================================
// Chains connect pairs of boxes. When one is tapped, sparks
// travel the chain and auto-activate linked partners, cascading
// through the full chain graph. A box can have multiple chains.
// ============================================================

// --- Chain graph helpers ---

// Build adjacency list from chains array
function chainGetNeighbors(idx) {
  var neighbors = [];
  for (var i = 0; i < chains.length; i++) {
    if (chains[i].a === idx) neighbors.push({ partner: chains[i].b, chainIdx: i });
    if (chains[i].b === idx) neighbors.push({ partner: chains[i].a, chainIdx: i });
  }
  return neighbors;
}

// Check if a box index is part of any chain
function isChained(idx) {
  for (var i = 0; i < chains.length; i++) {
    if (chains[i].a === idx || chains[i].b === idx) return true;
  }
  return false;
}

// Check if all direct chain neighbors of idx are revealed (and not ice-locked)
function chainPartnersReady(idx) {
  var neighbors = chainGetNeighbors(idx);
  for (var i = 0; i < neighbors.length; i++) {
    var partner = stock[neighbors[i].partner];
    if (!partner) return false;
    if (partner.isTunnel || partner.isWall || partner.empty) continue;
    if (partner.used) continue;  // already used, no problem
    if (!partner.revealed || partner.iceHP > 0) return false;
  }
  return true;
}

// Trigger chain reaction starting from tapped box
function chainReact(startIdx) {
  var visited = {};
  visited[startIdx] = true;
  var queue = [{ idx: startIdx, delay: 0 }];
  var head = 0;

  while (head < queue.length) {
    var current = queue[head++];
    var neighbors = chainGetNeighbors(current.idx);

    for (var i = 0; i < neighbors.length; i++) {
      var partnerIdx = neighbors[i].partner;
      if (visited[partnerIdx]) continue;
      visited[partnerIdx] = true;

      var partnerBox = stock[partnerIdx];
      if (!partnerBox || partnerBox.isTunnel || partnerBox.isWall || partnerBox.empty || partnerBox.used) continue;

      var sparkDelay = current.delay + 40; // ~667ms at 60fps — slow enough to follow

      // Spawn spark VFX from current box to partner
      chainSparks.push({
        fromIdx: current.idx,
        toIdx: partnerIdx,
        chainIdx: neighbors[i].chainIdx,
        t: 0,
        duration: 40,
        delay: current.delay,
        started: false
      });

      // Check if partner can actually activate
      if (partnerBox.revealed && partnerBox.iceHP <= 0 && !partnerBox.spawning) {
        // Schedule activation
        (function(pIdx, d) {
          setTimeout(function() {
            var pb = stock[pIdx];
            if (!pb || pb.used || pb.spawning || pb.empty) return;
            if (pb.iceHP > 0) {
              // Damage ice instead
              pb.iceHP--;
              var bx = pb.x + L.bw / 2, by = pb.y + L.bh / 2;
              if (pb.iceHP === 1) {
                pb.iceCrackT = 1.0; pb.shakeT = 0.4; sfx.pop();
              } else if (pb.iceHP === 0) {
                pb.iceShatterT = 1.0; pb.popT = 0.8; pb.boxType = 'default'; sfx.complete();
              }
              return;
            }
            pb.popT = 1;
            sfx.pop();
            spawnBurst(pb.x + L.bw / 2, pb.y + L.bh / 2, COLORS[pb.ci].fill, 18);
            // Golden burst at chain arrival
            spawnBurst(pb.x + L.bw / 2, pb.y + L.bh / 2, '#FFD700', 10);
            spawnPhysMarbles(pb);
            damageAdjacentIce(pIdx);
          }, d * (1000 / 60));
        })(partnerIdx, sparkDelay);

        // Continue the cascade from this partner
        queue.push({ idx: partnerIdx, delay: sparkDelay });
      } else if (partnerBox.iceHP > 0) {
        // Partner has ice — damage it via chain
        (function(pIdx, d) {
          setTimeout(function() {
            var pb = stock[pIdx];
            if (!pb || pb.used || pb.empty) return;
            if (pb.iceHP <= 0) return;
            pb.iceHP--;
            var bx = pb.x + L.bw / 2, by = pb.y + L.bh / 2;
            if (pb.iceHP === 1) {
              pb.iceCrackT = 1.0; pb.shakeT = 0.4; sfx.pop();
              for (var p = 0; p < 10; p++) {
                var a = Math.PI * 2 * p / 10 + Math.random() * 0.4, sp = 2 + Math.random() * 3;
                particles.push({ x: bx, y: by, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
                  r: (1.5 + Math.random() * 3) * S, color: 'rgba(180,225,255,0.8)',
                  life: 0.8, decay: 0.03 + Math.random() * 0.02, grav: false });
              }
            } else if (pb.iceHP === 0) {
              pb.iceShatterT = 1.0; pb.popT = 0.8; pb.boxType = 'default'; sfx.complete();
              for (var p = 0; p < 20; p++) {
                var a = Math.PI * 2 * p / 20 + Math.random() * 0.3, sp = 3 + Math.random() * 5;
                particles.push({ x: bx, y: by, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 2 * S,
                  r: (2 + Math.random() * 4) * S,
                  color: Math.random() > 0.5 ? 'rgba(180,225,255,0.9)' : 'rgba(220,240,255,0.9)',
                  life: 1, decay: 0.015 + Math.random() * 0.015, grav: true });
              }
            }
          }, d * (1000 / 60));
        })(partnerIdx, sparkDelay);
        // Don't continue chain past ice — fizzle
      } else {
        // Partner not revealed — fizzle with red flash
        (function(pIdx, cIdx, d) {
          setTimeout(function() {
            chainFlashes.push({ chainIdx: cIdx, t: 1.0 });
          }, d * (1000 / 60));
        })(partnerIdx, neighbors[i].chainIdx, sparkDelay);
      }
    }
  }
}

// Flash all chains connected to idx (blocked tap feedback)
function chainFlashBlocked(idx) {
  for (var i = 0; i < chains.length; i++) {
    if (chains[i].a === idx || chains[i].b === idx) {
      chainFlashes.push({ chainIdx: i, t: 1.0 });
    }
  }
}

// Update chain spark and flash animations
function updateChains() {
  // Update sparks
  for (var i = chainSparks.length - 1; i >= 0; i--) {
    var spark = chainSparks[i];
    if (spark.delay > 0) {
      spark.delay--;
      continue;
    }
    if (!spark.started) {
      spark.started = true;
      sfx.pop(); // metallic clink
    }
    spark.t += 1 / spark.duration;
    if (spark.t >= 1) {
      chainSparks.splice(i, 1);
    }
  }

  // Update flashes
  for (var i = chainFlashes.length - 1; i >= 0; i--) {
    chainFlashes[i].t -= 0.04;
    if (chainFlashes[i].t <= 0) {
      chainFlashes.splice(i, 1);
    }
  }

  // Remove chains where both boxes are used/empty
  for (var i = chains.length - 1; i >= 0; i--) {
    var boxA = stock[chains[i].a];
    var boxB = stock[chains[i].b];
    if (!boxA || !boxB) { chains.splice(i, 1); continue; }
    var aGone = boxA.used || boxA.empty || boxA.isTunnel || boxA.isWall;
    var bGone = boxB.used || boxB.empty || boxB.isTunnel || boxB.isWall;
    if (aGone && bGone) {
      // Fade-out burst along the chain before removing
      var ax = boxA.x + L.bw / 2, ay = boxA.y + L.bh / 2;
      var bx = boxB.x + L.bw / 2, by = boxB.y + L.bh / 2;
      var mx = (ax + bx) / 2, my = (ay + by) / 2;
      for (var p = 0; p < 6; p++) {
        var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
        particles.push({ x: mx, y: my, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S,
          r: (2 + Math.random() * 2) * S, color: '#CDB064', life: 0.5, decay: 0.03, grav: false });
      }
      chains.splice(i, 1);
    }
  }
}

// Initialize chains from level data
function initChains(lvl) {
  chains = [];
  chainSparks = [];
  chainFlashes = [];
  if (lvl && lvl.chains) {
    for (var i = 0; i < lvl.chains.length; i++) {
      chains.push({ a: lvl.chains[i].a, b: lvl.chains[i].b });
    }
  }
}

// --- Drawing ---

function drawChains() {
  if (chains.length === 0) return;
  ctx.save();

  for (var i = 0; i < chains.length; i++) {
    var chain = chains[i];
    var boxA = stock[chain.a];
    var boxB = stock[chain.b];
    if (!boxA || !boxB) continue;

    var ax = boxA.x + L.bw / 2;
    var ay = boxA.y + L.bh / 2;
    var bx = boxB.x + L.bw / 2;
    var by = boxB.y + L.bh / 2;

    // Check if this chain is flashing red
    var flashAlpha = 0;
    for (var f = 0; f < chainFlashes.length; f++) {
      if (chainFlashes[f].chainIdx === i) {
        flashAlpha = Math.max(flashAlpha, chainFlashes[f].t);
      }
    }

    // Chain link color — bold and visible
    var shimmer = Math.sin(tick * 0.06 + i * 1.7) * 0.1 + 0.9;
    var isFlashing = flashAlpha > 0;

    // Outer glow (shadow layer)
    ctx.save();
    if (isFlashing) {
      ctx.shadowColor = 'rgba(255,50,50,0.6)';
      ctx.shadowBlur = 10 * S;
    } else {
      ctx.shadowColor = 'rgba(205,175,100,0.5)';
      ctx.shadowBlur = 8 * S;
    }

    if (isFlashing) {
      var r = 255;
      var g = Math.floor(60 * (1 - flashAlpha));
      var b2 = Math.floor(60 * (1 - flashAlpha));
      ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b2 + ',' + (0.85 + flashAlpha * 0.15) + ')';
      ctx.lineWidth = 5 * S;
    } else {
      ctx.strokeStyle = 'rgba(220,190,80,' + shimmer + ')';
      ctx.lineWidth = 4 * S;
    }

    // Draw chain as dashed line (chain links)
    ctx.lineCap = 'round';
    ctx.setLineDash([6 * S, 4 * S]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner bright highlight line
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.strokeStyle = isFlashing
      ? 'rgba(255,150,150,' + (0.4 + flashAlpha * 0.4) + ')'
      : 'rgba(255,240,180,' + (shimmer * 0.5) + ')';
    ctx.lineWidth = 2 * S;
    ctx.setLineDash([6 * S, 4 * S]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Draw link circles at each end
    var linkR = 5 * S;
    var linkColor = isFlashing ? 'rgba(255,80,80,' + (0.7 + flashAlpha * 0.3) + ')' : 'rgba(220,190,80,' + shimmer + ')';
    ctx.fillStyle = linkColor;
    ctx.beginPath(); ctx.arc(ax, ay, linkR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, linkR, 0, Math.PI * 2); ctx.fill();
    // Bright center dot
    ctx.fillStyle = isFlashing ? 'rgba(255,200,200,0.8)' : 'rgba(255,245,200,0.7)';
    ctx.beginPath(); ctx.arc(ax, ay, linkR * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, linkR * 0.5, 0, Math.PI * 2); ctx.fill();

    // Glow effect for active flash
    if (isFlashing) {
      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.4;
      ctx.strokeStyle = 'rgba(255,50,50,0.9)';
      ctx.lineWidth = 8 * S;
      ctx.setLineDash([6 * S, 4 * S]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Draw sparks traveling along chains
  for (var i = 0; i < chainSparks.length; i++) {
    var spark = chainSparks[i];
    if (!spark.started) continue;

    var chain = chains[spark.chainIdx];
    if (!chain) continue;
    var fromBox = stock[spark.fromIdx];
    var toBox = stock[spark.toIdx];
    if (!fromBox || !toBox) continue;

    var fx = fromBox.x + L.bw / 2;
    var fy = fromBox.y + L.bh / 2;
    var tx = toBox.x + L.bw / 2;
    var ty = toBox.y + L.bh / 2;

    var t = spark.t;
    var sx = fx + (tx - fx) * t;
    var sy = fy + (ty - fy) * t;

    // Spark glow — large and bright
    ctx.save();
    var sparkR = 14 * S;
    var grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sparkR);
    grad.addColorStop(0, 'rgba(255,240,150,1)');
    grad.addColorStop(0.3, 'rgba(255,210,60,0.7)');
    grad.addColorStop(0.6, 'rgba(255,180,30,0.3)');
    grad.addColorStop(1, 'rgba(255,160,20,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, sparkR, 0, Math.PI * 2); ctx.fill();

    // Spark core
    ctx.fillStyle = '#FFFDE8';
    ctx.beginPath(); ctx.arc(sx, sy, 4.5 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(sx, sy, 2.5 * S, 0, Math.PI * 2); ctx.fill();

    // Trail particles
    if (tick % 2 === 0) {
      particles.push({
        x: sx, y: sy,
        vx: (Math.random() - 0.5) * 2 * S,
        vy: (Math.random() - 0.5) * 2 * S,
        r: (2 + Math.random() * 2) * S,
        color: '#FFD700',
        life: 0.6,
        decay: 0.04,
        grav: false
      });
    }

    ctx.restore();
  }

  ctx.restore();
}
