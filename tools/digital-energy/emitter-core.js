/* Digital Energy — per-type motion, fluid box, emission (v0.6) */
(function (global) {
  'use strict';

  var sim = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function initSim(W, H) {
    var gw = Math.max(48, Math.min(200, Math.floor(W * 0.22)));
    var gh = Math.max(32, Math.min(120, Math.floor(H * 0.22)));
    var n = gw * gh;
    sim = {
      gw: gw, gh: gh, W: W, H: H,
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      vd: new Float32Array(n),
      sd: new Float32Array(n),
      tvx: new Float32Array(n),
      tvy: new Float32Array(n),
      tvd: new Float32Array(n),
      tsd: new Float32Array(n)
    };
  }

  function idx(i, j) { return i + j * sim.gw; }

  function worldToGrid(x, y) {
    var i = Math.floor((x / sim.W) * (sim.gw - 2)) + 1;
    var j = Math.floor((y / sim.H) * (sim.gh - 2)) + 1;
    return {
      i: clamp(i, 1, sim.gw - 2),
      j: clamp(j, 1, sim.gh - 2)
    };
  }

  function sampleFlow(x, y) {
    if (!sim) return { vx: 0, vy: 0 };
    var g = worldToGrid(x, y);
    var k = idx(g.i, g.j);
    return { vx: sim.vx[k], vy: sim.vy[k] };
  }

  function injectFluid(x, y, fx, fy, dens, isShadow) {
    if (!sim) return;
    var g = worldToGrid(x, y);
    var k = idx(g.i, g.j);
    var arr = isShadow ? sim.sd : sim.vd;
    var vx = isShadow ? sim.vx : sim.vx;
    var vy = isShadow ? sim.vy : sim.vy;
    arr[k] += dens;
    vx[k] += fx;
    vy[k] += fy;
    for (var dj = -1; dj <= 1; dj++) {
      for (var di = -1; di <= 1; di++) {
        var kk = idx(g.i + di, g.j + dj);
        arr[kk] += dens * 0.22;
        vx[kk] += fx * 0.35;
        vy[kk] += fy * 0.35;
      }
    }
  }

  function advect(arr, velX, velY, out, decay) {
    var gw = sim.gw;
    var gh = sim.gh;
    for (var j = 1; j < gh - 1; j++) {
      for (var i = 1; i < gw - 1; i++) {
        var k = idx(i, j);
        var px = i - velX[k] * 0.85;
        var py = j - velY[k] * 0.85;
        var i0 = clamp(Math.floor(px), 0, gw - 1);
        var j0 = clamp(Math.floor(py), 0, gh - 1);
        var i1 = Math.min(i0 + 1, gw - 1);
        var j1 = Math.min(j0 + 1, gh - 1);
        var fx = px - i0;
        var fy = py - j0;
        var v00 = arr[idx(i0, j0)];
        var v10 = arr[idx(i1, j0)];
        var v01 = arr[idx(i0, j1)];
        var v11 = arr[idx(i1, j1)];
        out[k] = (v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy) * decay;
      }
    }
  }

  function swapField() {
    var t;
    t = sim.vx; sim.vx = sim.tvx; sim.tvx = t;
    t = sim.vy; sim.vy = sim.tvy; sim.tvy = t;
    t = sim.vd; sim.vd = sim.tvd; sim.tvd = t;
    t = sim.sd; sim.sd = sim.tsd; sim.tsd = t;
  }

  function stepSimBox(agents, dt) {
    if (!sim) return;
    var gw = sim.gw;
    var gh = sim.gh;
    var n = gw * gh;
    var river = Math.sin(performance.now() * 0.00035) * 0.4 + 0.6;
    for (var j = 1; j < gh - 1; j++) {
      for (var i = 1; i < gw - 1; i++) {
        var k = idx(i, j);
        sim.vx[k] *= 0.96;
        sim.vy[k] *= 0.96;
        sim.vd[k] *= 0.985;
        sim.sd[k] *= 0.978;
        sim.vy[k] += 0.02 * river;
        sim.vx[k] += (i / gw - 0.5) * 0.008;
        sim.sd[k] += 0.004;
        sim.vy[k] -= 0.035;
      }
    }
    agents.forEach(function (a) {
      if (a.type === 7) {
        injectFluid(a.x, a.y, a.vx * 0.12, a.vy * 0.12, 0.35 + a.intensity * 0.02, false);
      } else if (a.type === 1) {
        injectFluid(a.x, a.y, (Math.random() - 0.5) * 0.2, -0.55 - a.intensity * 0.02, 0.4, true);
        injectFluid(a.x, a.y - 8, 0, -0.7, 0.25, true);
      }
    });
    advect(sim.vd, sim.vx, sim.vy, sim.tvd, 0.992);
    advect(sim.vx, sim.vx, sim.vy, sim.tvx, 0.97);
    advect(sim.vy, sim.vx, sim.vy, sim.tvy, 0.97);
    advect(sim.sd, sim.vx, sim.vy * 0.6 - 0.15, sim.tsd, 0.965);
    swapField();
    for (var e = 0; e < n; e++) {
      if (sim.vd[e] > 0.02) {
        sim.vx[e] += sim.vd[e] * 0.04;
      }
      if (sim.sd[e] > 0.02) {
        sim.vy[e] -= sim.sd[e] * 0.06;
      }
    }
  }

  function emitFromField(splatBuf, mode, pow, maxN) {
    if (!sim || splatBuf.length >= maxN) return;
    var gw = sim.gw;
    var gh = sim.gh;
    var arr = mode === 1 ? sim.sd : sim.vd;
    var step = mode === 1 ? 2 : 3;
    for (var j = 2; j < gh - 2; j += step) {
      for (var i = 2; i < gw - 2; i += step) {
        var k = idx(i, j);
        if (arr[k] < 0.12) continue;
        var x = (i / gw) * sim.W;
        var y = (j / gh) * sim.H;
        splatBuf.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 8,
          size: 6 + arr[k] * 22 + pow * 2,
          alpha: arr[k] * (0.08 + pow * 0.12),
          ang: Math.atan2(sim.vy[k], sim.vx[k] + 0.001),
          mode: mode,
          sharp: mode === 1 ? 0.5 : 0.35,
          seed: Math.random() * 80,
          kind: 2
        });
        if (splatBuf.length >= maxN) return;
      }
    }
  }

  function initAgentType(a) {
    a.visual = a.type;
    a.pulse = Math.random();
    if (a.type === 1) {
      a.slaveT = 0;
      a.rise = 0.85 + Math.random() * 0.4;
      a.tendril = Math.random() * Math.PI * 2;
    } else if (a.type === 3) {
      a.boltX = a.x;
      a.boltY = a.y;
      a.boltTX = a.x;
      a.boltTY = a.y;
      a.boltT = 0;
      a.boltWait = 0;
      a.zig = [];
      for (var z = 0; z < 6; z++) a.zig.push({ x: a.x, y: a.y });
    } else if (a.type === 7) {
      a.streamAng = Math.random() * Math.PI * 2;
      a.wet = 0;
    } else if (a.type === 2) {
      a.grow = 0;
    } else if (a.type === 5) {
      a.heat = 1;
    }
  }

  function pickBoltTarget(a, W, H) {
    var pad = 60;
    a.boltTX = pad + Math.random() * (W - pad * 2);
    a.boltTY = pad + Math.random() * (H - pad * 2);
    var segs = 5 + Math.floor(Math.random() * 4);
    a.zig.length = 0;
    for (var s = 0; s <= segs; s++) {
      var u = s / segs;
      a.zig.push({
        x: a.boltX + (a.boltTX - a.boltX) * u + (Math.random() - 0.5) * 40,
        y: a.boltY + (a.boltTY - a.boltY) * u + (Math.random() - 0.5) * 40
      });
    }
    a.boltT = 0;
    a.boltWait = 0.08 + Math.random() * 0.12;
  }

  function pushSplat(splatBuf, o) {
    splatBuf.push(o);
  }

  function emitTrail(a, t, pow, splatBuf, sparks, intensityPow) {
    var dx = a.x - a.px;
    var dy = a.y - a.py;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var steps = Math.max(1, dist > 0.2 ? Math.min(28, Math.ceil(dist / 1.4)) : 1);
    var rad = a.radius * (1.05 + pow * 0.65);
    var m = a.type;

    if (m === 3 && a.zig && a.zig.length > 1) {
      for (var zi = 1; zi < a.zig.length; zi++) {
        var z0 = a.zig[zi - 1];
        var z1 = a.zig[zi];
        var zdx = z1.x - z0.x;
        var zdy = z1.y - z0.y;
        var zd = Math.sqrt(zdx * zdx + zdy * zdy) || 1;
        var zsteps = Math.max(2, Math.ceil(zd / 6));
        for (var zs = 0; zs < zsteps; zs++) {
          var zu = zs / zsteps;
          var zx = z0.x + zdx * zu;
          var zy = z0.y + zdy * zu;
          var zang = Math.atan2(zdy, zdx);
          pushSplat(splatBuf, {
            x: zx, y: zy,
            size: rad * (1.5 + pow * 0.6),
            alpha: (0.2 + pow * 0.35) * 0.9,
            ang: zang,
            mode: 3,
            sharp: 0.98,
            seed: Math.random() * 40 + t,
            kind: 1
          });
        }
      }
      return;
    }

    for (var i = 0; i < steps; i++) {
      var u = (i + 1) / (steps + 1);
      var px = a.px + dx * u;
      var py = a.py + dy * u;
      var vx = dx / dist + a.vx;
      var vy = dy / dist + a.vy;
      var ang = Math.atan2(vy, vx);
      var spd = Math.sqrt(vx * vx + vy * vy);

      if (m === 1) {
        var tend = Math.sin(a.tendril + t * 2.5 + u * 8) * 12;
        px += tend;
        py -= 4 + Math.random() * 6;
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.8 + pow * 0.5) * (0.6 + Math.random() * 0.5),
          alpha: (0.12 + pow * 0.2) * (0.7 + Math.random() * 0.3),
          ang: ang + Math.PI * 0.5,
          mode: 1,
          sharp: 0.35 + Math.random() * 0.25,
          seed: Math.random() * 90,
          kind: 1
        });
        if (Math.random() < 0.35) {
          pushSplat(splatBuf, {
            x: px + (Math.random() - 0.5) * 20,
            y: py - 10 - Math.random() * 25,
            size: rad * 2.2,
            alpha: (0.06 + pow * 0.1) * 0.8,
            ang: -Math.PI * 0.5 + (Math.random() - 0.5) * 0.4,
            mode: 1,
            sharp: 0.2,
            seed: Math.random() * 50,
            kind: 3
          });
        }
      } else if (m === 7) {
        var fw = sampleFlow(px, py);
        ang = Math.atan2(vy + fw.vy * 2, vx + fw.vx * 2);
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (2.2 + spd * 0.25) * (2.5 + pow * 0.4),
          alpha: (0.1 + pow * 0.18) * 0.95,
          ang: ang,
          mode: 7,
          sharp: 0.22,
          seed: Math.random() * 60,
          kind: 1
        });
        if (Math.random() < 0.4) {
          pushSplat(splatBuf, {
            x: px, y: py,
            size: rad * 1.4,
            alpha: (0.05 + pow * 0.08),
            ang: ang,
            mode: 7,
            sharp: 0.15,
            seed: Math.random() * 30,
            kind: 2
          });
        }
      } else if (m === 2) {
        a.grow += 0.02;
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.3 + a.grow * 0.3),
          alpha: (0.14 + pow * 0.22),
          ang: ang - 0.3,
          mode: 2,
          sharp: 0.95,
          seed: Math.random() * 70,
          kind: 1
        });
      } else if (m === 4) {
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.5 + spd * 0.1),
          alpha: (0.15 + pow * 0.25),
          ang: ang,
          mode: 4,
          sharp: 0.28,
          seed: Math.random() * 40,
          kind: 1
        });
      } else if (m === 5) {
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.4 + a.heat * 0.2),
          alpha: (0.14 + pow * 0.24) * a.heat,
          ang: ang - 0.5,
          mode: 5,
          sharp: 0.5,
          seed: Math.random() * 50,
          kind: 1
        });
        a.heat = clamp(a.heat * 0.998, 0.5, 1.2);
      } else {
        var sharp = m === 3 ? 0.95 : (m === 6 ? 0.7 : 0.62);
        pushSplat(splatBuf, {
          x: px + (Math.random() - 0.5) * a.turb * 3,
          y: py + (Math.random() - 0.5) * a.turb * 3,
          size: rad * (1.2 + spd * 0.15) * (2.6 + pow * 0.4),
          alpha: (0.1 + pow * 0.2) * (0.8 + a.decay * 0.2),
          ang: ang,
          mode: m,
          sharp: sharp,
          seed: Math.random() * 97 + t * 0.17,
          kind: m === 6 ? 1 : 0
        });
      }
    }
    if (m === 4 && Math.random() < pow * 0.28) {
      sparks.push({
        x: a.x, y: a.y,
        vx: (Math.random() - 0.5) * 3,
        vy: 1.5 + Math.random() * 2,
        life: 0.7, size: 3, mode: 4, kind: 1
      });
    }
    if (m === 6 && Math.random() < pow * 0.32) {
      var ba = Math.random() * Math.PI * 2;
      sparks.push({
        x: a.x, y: a.y,
        vx: Math.cos(ba) * 2.5, vy: Math.sin(ba) * 2.5,
        life: 0.75, size: 5, mode: 6, kind: 3
      });
    }
  }

  function updateAgentMotion(a, t, dt, W, H, boundarySteer, typeMotion, pickRoamTarget) {
    if (a.visual === undefined) initAgentType(a);

    if (a.type === 3) {
      if (!a.zig || a.zig.length < 2) pickBoltTarget(a, W, H);
      a.boltWait -= dt;
      if (a.boltT >= 1 || a.boltWait <= 0) pickBoltTarget(a, W, H);
      if (a.zig.length > 1) {
        var seg = Math.floor(a.boltT * (a.zig.length - 1));
        seg = clamp(seg, 0, a.zig.length - 2);
        var u = (a.boltT * (a.zig.length - 1)) - seg;
        var p0 = a.zig[seg];
        var p1 = a.zig[seg + 1];
        a.px = a.x;
        a.py = a.y;
        a.x = p0.x + (p1.x - p0.x) * u;
        a.y = p0.y + (p1.y - p0.y) * u;
        a.vx = (p1.x - p0.x) * 12;
        a.vy = (p1.y - p0.y) * 12;
        a.boltT += dt * (4.5 + a.turb * 4);
      }
      var pad = 24;
      a.x = clamp(a.x, pad, W - pad);
      a.y = clamp(a.y, pad, H - pad);
      return;
    }

    var dxT = a.targetX - a.x;
    var dyT = a.targetY - a.y;
    var dT = Math.sqrt(dxT * dxT + dyT * dyT) || 1;
    if (dT < 130) pickRoamTarget(a);

    var mot = typeMotion(a, t + a.phase);
    var bnd = boundarySteer(a);
    var roam = 0.34;
    var ax = mot.ax + bnd.ax + (dxT / dT) * roam;
    var ay = mot.ay + bnd.ay + (dyT / dT) * roam;

    if (a.type === 1) {
      a.tendril += dt * 2.2;
      ay -= a.rise * 1.1;
      ax += Math.sin(a.tendril) * 0.6;
      a.slaveT += dt;
      if (a.slaveT > 2.5) {
        a.slaveT = 0;
        a.rise = 0.7 + Math.random() * 0.6;
      }
    } else if (a.type === 7) {
      var fl = sampleFlow(a.x, a.y);
      ax += fl.vx * 1.8 + Math.cos(a.streamAng) * 0.5;
      ay += fl.vy * 1.8 + Math.sin(a.streamAng) * 0.35 + 0.25;
      a.streamAng += dt * 0.4;
      a.wet = clamp(a.wet + dt, 0, 1);
    } else if (a.type === 5) {
      ay -= 0.65;
      a.heat = Math.min(1.3, a.heat + dt * 0.15);
    } else if (a.type === 2) {
      ay += 0.12;
      ax *= 0.85;
    }

    a.dashT = (a.dashT || 0) - dt;
    if (a.dashT <= 0 && a.type !== 1) {
      a.dashT = 0.5 + Math.random() * 1.2;
      var dashA = Math.random() * Math.PI * 2;
      var dashF = 2.5 + a.turb * 3;
      a.vx += Math.cos(dashA) * dashF;
      a.vy += Math.sin(dashA) * dashF;
    }

    a.vx = a.vx * 0.76 + ax * 0.24;
    a.vy = a.vy * 0.76 + ay * 0.24;
    var spdCap = a.type === 3 ? 14 : (5.5 + a.turb * 3.5);
    var spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    if (spd > spdCap) {
      a.vx = (a.vx / spd) * spdCap;
      a.vy = (a.vy / spd) * spdCap;
    }

    a.px = a.x;
    a.py = a.y;
    a.pulse += dt * 3;
    var pulse = 1 + Math.sin(a.pulse) * 0.12;
    a.x += a.vx * pulse + Math.sin(t * 2.8 + a.phase) * a.turb * 0.45;
    a.y += a.vy * pulse + Math.cos(t * 2 + a.phase) * a.turb * 0.4;

    var pad2 = 24;
    if (a.x < pad2) { a.x = pad2; a.vx = Math.abs(a.vx) * 0.5 + 0.2; }
    if (a.x > W - pad2) { a.x = W - pad2; a.vx = -Math.abs(a.vx) * 0.5 - 0.2; }
    if (a.y < pad2) { a.y = pad2; a.vy = Math.abs(a.vy) * 0.5 + 0.2; }
    if (a.y > H - pad2) { a.y = H - pad2; a.vy = -Math.abs(a.vy) * 0.5 - 0.2; }
  }

  global.DEEmitters = {
    initSim: initSim,
    stepSimBox: stepSimBox,
    emitFromField: emitFromField,
    initAgentType: initAgentType,
    updateAgentMotion: updateAgentMotion,
    emitTrail: emitTrail,
    sampleFlow: sampleFlow
  };
})(typeof window !== 'undefined' ? window : globalThis);
