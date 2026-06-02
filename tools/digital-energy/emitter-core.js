/* Digital Energy — per-type motion, fluid box, vortex attractors (v0.8) */
(function (global) {
  'use strict';

  var sim = null;

  // per-type glide profiles: speed (px/frame), wander amplitude/freq, target seek, steer easing
  var MOTION = {
    0: { speed: 3.0, wander: 0.70, wfreq: 1.0, seek: 0.50, steer: 0.10 },
    1: { speed: 1.5, wander: 0.95, wfreq: 0.55, seek: 0.32, steer: 0.045 },
    2: { speed: 1.7, wander: 0.32, wfreq: 0.5, seek: 0.42, steer: 0.040 },
    3: { speed: 3.0, wander: 0.70, wfreq: 1.0, seek: 0.50, steer: 0.10 },
    4: { speed: 2.1, wander: 0.48, wfreq: 0.85, seek: 0.42, steer: 0.065 },
    5: { speed: 2.4, wander: 0.82, wfreq: 1.35, seek: 0.38, steer: 0.085 },
    6: { speed: 3.0, wander: 0.74, wfreq: 1.05, seek: 0.50, steer: 0.10 },
    7: { speed: 2.5, wander: 0.40, wfreq: 0.7, seek: 0.40, steer: 0.075 }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smoothNoise1(t, ph) {
    return Math.sin(t * 0.9 + ph) * 0.4 + Math.sin(t * 1.7 + ph * 1.3) * 0.25 + Math.sin(t * 2.9 + ph * 0.7) * 0.15;
  }

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
    var n = Math.sin(x * 0.04 + y * 0.03) * 0.15;
    arr[k] += dens;
    sim.vx[k] += fx + n;
    sim.vy[k] += fy + n * 0.5;
    for (var dj = -1; dj <= 1; dj++) {
      for (var di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue;
        var kk = idx(g.i + di, g.j + dj);
        arr[kk] += dens * 0.18;
        sim.vx[kk] += fx * 0.3 + (Math.random() - 0.5) * 0.08;
        sim.vy[kk] += fy * 0.3 + (Math.random() - 0.5) * 0.08;
      }
    }
  }

  function advect(arr, velX, velY, out, decay) {
    var gw = sim.gw;
    var gh = sim.gh;
    for (var j = 1; j < gh - 1; j++) {
      for (var i = 1; i < gw - 1; i++) {
        var k = idx(i, j);
        var px = i - velX[k] * 0.9;
        var py = j - velY[k] * 0.9;
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

  function vortexPowFromSlider(v) {
    return 0.25 + ((v - 1) / 14) * 2.35;
  }

  function sampleVortex(x, y, attractors, strengthMul) {
    var ax = 0;
    var ay = 0;
    var swirl = 0;
    var pow = strengthMul || 1;
    var i, at, dx, dy, r2, R, r, fall, spin, pull;
    for (i = 0; i < attractors.length; i++) {
      at = attractors[i];
      dx = x - at.x;
      dy = y - at.y;
      r2 = dx * dx + dy * dy;
      R = at.radius || 80;
      r = Math.sqrt(r2) || 0.001;
      fall = Math.exp(-r2 / (R * R * 0.42));
      spin = (at.spinSign || 1) * (at.strength || 1) * pow * fall;
      pull = pow * fall * 0.42;
      ax += (-dy / r) * spin * 2.4;
      ay += (dx / r) * spin * 2.4;
      ax -= (dx / r) * pull;
      ay -= (dy / r) * pull;
      if (fall > swirl) swirl = fall;
    }
    return { ax: ax, ay: ay, swirl: swirl };
  }

  function applyAttractorsToSim(attractors, vortexPow, speedMul) {
    if (!sim || !attractors || !attractors.length) return;
    var gw = sim.gw;
    var gh = sim.gh;
    var sm = speedMul || 1;
    var pow = vortexPow || 1;
    var ai, at, g, cellR, dj, di, i, j, wx, wy, vf, k, str;
    for (ai = 0; ai < attractors.length; ai++) {
      at = attractors[ai];
      g = worldToGrid(at.x, at.y);
      cellR = Math.max(4, Math.floor((at.radius / sim.W) * gw * 0.55));
      for (dj = -cellR; dj <= cellR; dj++) {
        for (di = -cellR; di <= cellR; di++) {
          i = g.i + di;
          j = g.j + dj;
          if (i < 1 || i >= gw - 1 || j < 1 || j >= gh - 1) continue;
          wx = ((i + 0.5) / gw) * sim.W;
          wy = ((j + 0.5) / gh) * sim.H;
          vf = sampleVortex(wx, wy, [at], pow);
          k = idx(i, j);
          str = vf.swirl;
          sim.vx[k] += vf.ax * 0.11 * sm;
          sim.vy[k] += vf.ay * 0.11 * sm;
          if (str > 0.12) sim.vd[k] += str * 0.018 * sm;
        }
      }
    }
  }

  function emitAttractorSwirl(splatBuf, attractors, t, pow, maxN) {
    if (!attractors || !attractors.length) return;
    var ai, at, arms, R, k, ang, ripple, r, px, py, tang;
    for (ai = 0; ai < attractors.length; ai++) {
      at = attractors[ai];
      at.phase = (at.phase || 0) + 0.028 * (at.spinSign || 1);
      arms = 12;
      R = at.radius || 80;
      for (k = 0; k < arms; k++) {
        if (splatBuf.length >= maxN) return;
        ang = at.phase + (k / arms) * Math.PI * 2;
        ripple = 0.5 + 0.5 * Math.sin(t * 1.6 + k * 0.65);
        r = R * ripple * (0.38 + 0.12 * Math.sin(t * 2.2 + k * 0.4));
        px = at.x + Math.cos(ang) * r;
        py = at.y + Math.sin(ang) * r;
        tang = ang + Math.PI * 0.5 * (at.spinSign || 1);
        pushSplat(splatBuf, {
          x: px, y: py,
          size: 7 + pow * 5,
          alpha: 0.055 + pow * 0.075,
          ang: tang,
          mode: 6,
          sharp: 0.48,
          seed: t * 12 + k + ai * 17,
          kind: 2
        });
      }
    }
  }

  function stepSimBox(agents, dt, speedMul, attractors, vortexPow) {
    if (!sim) return;
    var gw = sim.gw;
    var gh = sim.gh;
    var n = gw * gh;
    var sm = speedMul || 1;
    var river = Math.sin(performance.now() * 0.00035 * sm) * 0.4 + 0.6;
    for (var j = 1; j < gh - 1; j++) {
      for (var i = 1; i < gw - 1; i++) {
        var k = idx(i, j);
        sim.vx[k] *= 0.965;
        sim.vy[k] *= 0.965;
        sim.vd[k] *= 0.988;
        sim.sd[k] *= 0.98;
        var curl = Math.sin(i * 0.31 + j * 0.27) * 0.012;
        sim.vy[k] += 0.022 * river * sm;
        sim.vx[k] += curl + (i / gw - 0.5) * 0.01 * sm;
        sim.sd[k] += 0.003 * sm;
        sim.vy[k] -= 0.03 * sm;
      }
    }
    agents.forEach(function (a) {
      if (a.type === 7) {
        injectFluid(a.x, a.y, a.vx * 0.22 * sm, a.vy * 0.22 * sm, 0.5 + a.intensity * 0.03, false);
      } else if (a.type === 1) {
        injectFluid(a.x, a.y, (Math.random() - 0.5) * 0.3 + a.vx * 0.05, -0.75 * sm, 0.55, true);
      } else if (a.type === 4) {
        injectFluid(a.x, a.y, a.vx * 0.06, 0.12 * sm + 0.08, 0.2, false);
      }
    });
    applyAttractorsToSim(attractors, vortexPow, sm);
    advect(sim.vd, sim.vx, sim.vy, sim.tvd, 0.993);
    advect(sim.vx, sim.vx, sim.vy, sim.tvx, 0.975);
    advect(sim.vy, sim.vx, sim.vy, sim.tvy, 0.975);
    advect(sim.sd, sim.vx, sim.vy * 0.55 - 0.12, sim.tsd, 0.968);
    swapField();
    for (var e = 0; e < n; e++) {
      if (sim.vd[e] > 0.02) sim.vx[e] += sim.vd[e] * 0.045;
      if (sim.sd[e] > 0.02) sim.vy[e] -= sim.sd[e] * 0.065;
    }
  }

  function emitFromField(splatBuf, mode, pow, maxN) {
    if (!sim || splatBuf.length >= maxN) return;
    var gw = sim.gw;
    var gh = sim.gh;
    var arr = mode === 1 ? sim.sd : sim.vd;
    var step = mode === 1 ? 2 : 2;
    for (var j = 2; j < gh - 2; j += step) {
      for (var i = 2; i < gw - 2; i += step) {
        var k = idx(i, j);
        if (arr[k] < 0.1) continue;
        var vx = sim.vx[k];
        var vy = sim.vy[k];
        var spd = Math.sqrt(vx * vx + vy * vy) || 0.001;
        var px = -vy / spd;
        var py = vx / spd;
        var jag = Math.sin(i * 1.7 + j * 2.3) * 14 + Math.cos(i * 0.9 - j * 1.1) * 10;
        var x = (i / gw) * sim.W + px * jag + (Math.random() - 0.5) * 6;
        var y = (j / gh) * sim.H + py * jag * 0.6 + (Math.random() - 0.5) * 6;
        splatBuf.push({
          x: x, y: y,
          size: 5 + arr[k] * 16 + pow * 1.8,
          alpha: arr[k] * (0.1 + pow * 0.14),
          ang: Math.atan2(vy, vx),
          mode: mode,
          sharp: mode === 1 ? 0.42 : 0.34,
          seed: Math.random() * 80,
          kind: 5
        });
        if (arr[k] > 0.2 && Math.random() < 0.4 && splatBuf.length < maxN) {
          splatBuf.push({
            x: x + px * (8 + Math.random() * 12),
            y: y + py * (8 + Math.random() * 12),
            size: 5 + arr[k] * 14,
            alpha: arr[k] * 0.08,
            ang: Math.atan2(vy, vx) + (Math.random() - 0.5) * 0.8,
            mode: mode,
            sharp: 0.25,
            seed: Math.random() * 40,
            kind: 6
          });
        }
        if (splatBuf.length >= maxN) return;
      }
    }
  }

  function buildBoltBranch(x0, y0, x1, y1, depth, jitter, out) {
    if (depth <= 0) {
      out.push({ x0: x0, y0: y0, x1: x1, y1: y1 });
      return;
    }
    var mx = (x0 + x1) * 0.5 + (Math.random() - 0.5) * jitter;
    var my = (y0 + y1) * 0.5 + (Math.random() - 0.5) * jitter;
    buildBoltBranch(x0, y0, mx, my, depth - 1, jitter * 0.62, out);
    buildBoltBranch(mx, my, x1, y1, depth - 1, jitter * 0.62, out);
    if (depth >= 2 && Math.random() < 0.62) {
      var blen = 25 + Math.random() * 70;
      var bang = Math.atan2(y1 - y0, x1 - x0) + (Math.random() - 0.5) * 1.8;
      buildBoltBranch(
        mx, my,
        mx + Math.cos(bang) * blen,
        my + Math.sin(bang) * blen,
        depth - 2,
        jitter * 0.5,
        out
      );
    }
    if (depth >= 3 && Math.random() < 0.35) {
      var bang2 = Math.random() * Math.PI * 2;
      var blen2 = 15 + Math.random() * 40;
      buildBoltBranch(
        mx, my,
        mx + Math.cos(bang2) * blen2,
        my + Math.sin(bang2) * blen2,
        1,
        jitter * 0.4,
        out
      );
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
      a.boltSegs = [];
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
    a.boltX = a.x;
    a.boltY = a.y;
    a.boltTX = pad + Math.random() * (W - pad * 2);
    a.boltTY = pad + Math.random() * (H - pad * 2);
    var jitter = 42 + a.turb * 35 + a.radius * 1.5;
    a.boltSegs = [];
    buildBoltBranch(a.boltX, a.boltY, a.boltTX, a.boltTY, 4, jitter, a.boltSegs);
    a.zig = [];
    var n = 14 + Math.floor(Math.random() * 6);
    for (var s = 0; s <= n; s++) {
      var u = s / n;
      a.zig.push({
        x: a.boltX + (a.boltTX - a.boltX) * u + (Math.random() - 0.5) * jitter * 0.35,
        y: a.boltY + (a.boltTY - a.boltY) * u + (Math.random() - 0.5) * jitter * 0.35
      });
    }
    a.boltT = 0;
    a.boltWait = 0.06 + Math.random() * 0.1;
  }

  function pushSplat(splatBuf, o) {
    splatBuf.push(o);
  }

  function emitBoltTree(a, rad, pow, t, splatBuf, sparks) {
    if (!a.boltSegs) return;
    var i, seg, dx, dy, d, steps, zs, zu, zx, zy, zang;
    for (i = 0; i < a.boltSegs.length; i++) {
      seg = a.boltSegs[i];
      dx = seg.x1 - seg.x0;
      dy = seg.y1 - seg.y0;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      steps = Math.max(3, Math.ceil(d / 4));
      for (zs = 0; zs <= steps; zs++) {
        zu = zs / steps;
        zx = seg.x0 + dx * zu + (Math.random() - 0.5) * 3;
        zy = seg.y0 + dy * zu + (Math.random() - 0.5) * 3;
        zang = Math.atan2(dy, dx);
        pushSplat(splatBuf, {
          x: zx, y: zy,
          size: rad * (1.2 + pow * 0.5) * (0.85 + Math.random() * 0.35),
          alpha: (0.22 + pow * 0.38) * (0.85 + Math.random() * 0.15),
          ang: zang + (Math.random() - 0.5) * 0.15,
          mode: 3,
          sharp: 0.98,
          seed: Math.random() * 50 + t + i,
          kind: 1
        });
        if (Math.random() < 0.22) {
          pushSplat(splatBuf, {
            x: zx, y: zy,
            size: rad * 0.55,
            alpha: (0.15 + pow * 0.25),
            ang: zang + 1.57,
            mode: 3,
            sharp: 0.85,
            seed: Math.random() * 30,
            kind: 7
          });
        }
      }
      if (Math.random() < 0.5) {
        var sAng = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
        var sSpd = 2 + Math.random() * 5;
        sparks.push({
          x: seg.x1, y: seg.y1,
          vx: Math.cos(sAng) * sSpd,
          vy: Math.sin(sAng) * sSpd,
          life: 0.2 + Math.random() * 0.2,
          size: 3.5 + Math.random() * 4,
          mode: 3,
          kind: 4
        });
      }
      // thin forked sparks branching off the bolt (diramazioni)
      var forks = Math.random() < 0.4 ? 2 : 1;
      for (var fk = 0; fk < forks; fk++) {
        if (Math.random() > 0.5) continue;
        var fAng = Math.atan2(dy, dx) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.9);
        var fSpd = 3 + Math.random() * 6;
        sparks.push({
          x: seg.x1, y: seg.y1,
          vx: Math.cos(fAng) * fSpd,
          vy: Math.sin(fAng) * fSpd,
          life: 0.14 + Math.random() * 0.16,
          size: 2 + Math.random() * 2.5,
          mode: 3,
          kind: 4
        });
      }
    }
    sparks.push({
      x: a.x, y: a.y,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      life: 0.3,
      size: 5 + pow * 1.5,
      mode: 3,
      kind: 4
    });
  }

  function emitFluidJagged(px, py, ang, rad, pow, mode, splatBuf, fw) {
    var perpX = -Math.sin(ang);
    var perpY = Math.cos(ang);
    var i, off, jag, fx, fy;
    for (i = -3; i <= 3; i++) {
      off = i * (2.5 + Math.random() * 4);
      jag = (Math.random() - 0.5) * 18;
      fx = px + perpX * off + Math.cos(ang) * jag;
      fy = py + perpY * off + Math.sin(ang) * jag;
      pushSplat(splatBuf, {
        x: fx, y: fy,
        size: rad * (1.15 + Math.abs(i) * 0.12) * (1.25 + pow * 0.25),
        alpha: (0.13 + pow * 0.2) * (1 - Math.abs(i) * 0.08),
        ang: ang + (Math.random() - 0.5) * 0.35,
        mode: mode,
        sharp: mode === 7 ? 0.24 : 0.34,
        seed: Math.random() * 60,
        kind: mode === 7 ? 5 : 6
      });
    }
    if (fw) {
      pushSplat(splatBuf, {
        x: px + fw.vx * 3, y: py + fw.vy * 3,
        size: rad * 2,
        alpha: 0.1 + pow * 0.15,
        ang: Math.atan2(fw.vy, fw.vx),
        mode: mode,
        sharp: 0.18,
        seed: Math.random() * 20,
        kind: 1
      });
    }
  }

  function swirlAngle(px, py, ang, attractors, vortexPow) {
    if (!attractors || !attractors.length) return ang;
    var vf = sampleVortex(px, py, attractors, vortexPow);
    if (vf.swirl < 0.04) return ang;
    var tang = Math.atan2(vf.ay, vf.ax);
    var mix = clamp(vf.swirl * 0.72, 0, 0.65);
    var d = tang - ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return ang + d * mix;
  }

  function emitTrail(a, t, pow, splatBuf, sparks, intensityPow, attractors, vortexPow) {
    var dx = a.x - a.px;
    var dy = a.y - a.py;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var steps = Math.max(1, dist > 0.2 ? Math.min(46, Math.ceil(dist / 0.8)) : 1);
    var rad = a.radius * (0.62 + pow * 0.42);
    var m = a.type;

    if (m === 3) {
      emitBoltTree(a, rad, pow, t, splatBuf, sparks);
      if (a.zig && a.zig.length > 1) {
        var zi, z0, z1, zdx, zdy, zd, zsteps, zs, zu, zx, zy, zang;
        for (zi = 1; zi < a.zig.length; zi++) {
          z0 = a.zig[zi - 1];
          z1 = a.zig[zi];
          zdx = z1.x - z0.x;
          zdy = z1.y - z0.y;
          zd = Math.sqrt(zdx * zdx + zdy * zdy) || 1;
          zsteps = Math.max(2, Math.ceil(zd / 5));
          for (zs = 0; zs < zsteps; zs++) {
            zu = zs / zsteps;
            zx = z0.x + zdx * zu;
            zy = z0.y + zdy * zu;
            zang = Math.atan2(zdy, zdx);
            pushSplat(splatBuf, {
              x: zx, y: zy,
              size: rad * (1.8 + pow * 0.7),
              alpha: (0.28 + pow * 0.42),
              ang: zang,
              mode: 3,
              sharp: 0.99,
              seed: Math.random() * 40 + t,
              kind: 1
            });
          }
        }
      }
      return;
    }

    var i, u, px, py, vx, vy, ang, spd, tend, fw;
    for (i = 0; i < steps; i++) {
      u = (i + 1) / (steps + 1);
      px = a.px + dx * u;
      py = a.py + dy * u;
      vx = dx / dist + a.vx;
      vy = dy / dist + a.vy;
      ang = Math.atan2(vy, vx);
      spd = Math.sqrt(vx * vx + vy * vy);
      ang = swirlAngle(px, py, ang, attractors, vortexPow);

      if (m === 1) {
        tend = Math.sin(a.tendril + t * 2.5 + u * 8) * 14;
        px += tend;
        py -= 4 + Math.random() * 6;
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.8 + pow * 0.55) * (0.6 + Math.random() * 0.5),
          alpha: (0.16 + pow * 0.24) * (0.75 + Math.random() * 0.25),
          ang: ang + Math.PI * 0.5,
          mode: 1,
          sharp: 0.35 + Math.random() * 0.25,
          seed: Math.random() * 90,
          kind: 1
        });
        if (Math.random() < 0.4) {
          pushSplat(splatBuf, {
            x: px + (Math.random() - 0.5) * 22,
            y: py - 10 - Math.random() * 28,
            size: rad * 2.4,
            alpha: (0.1 + pow * 0.14),
            ang: -Math.PI * 0.5 + (Math.random() - 0.5) * 0.5,
            mode: 1,
            sharp: 0.2,
            seed: Math.random() * 50,
            kind: 3
          });
        }
      } else if (m === 7) {
        fw = sampleFlow(px, py);
        ang = Math.atan2(vy + fw.vy * 2.5, vx + fw.vx * 2.5);
        emitFluidJagged(px, py, ang, rad, pow, 7, splatBuf, fw);
      } else if (m === 4) {
        emitFluidJagged(px, py, ang + (Math.random() - 0.5) * 0.2, rad * 0.9, pow, 4, splatBuf, null);
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.5 + spd * 0.12),
          alpha: (0.18 + pow * 0.28),
          ang: ang,
          mode: 4,
          sharp: 0.28,
          seed: Math.random() * 40,
          kind: 1
        });
      } else if (m === 2) {
        a.grow += 0.02;
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.3 + a.grow * 0.3),
          alpha: (0.17 + pow * 0.26),
          ang: ang - 0.3,
          mode: 2,
          sharp: 0.95,
          seed: Math.random() * 70,
          kind: 1
        });
      } else if (m === 5) {
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.4 + a.heat * 0.2),
          alpha: (0.17 + pow * 0.28) * a.heat,
          ang: ang - 0.5,
          mode: 5,
          sharp: 0.5,
          seed: Math.random() * 50,
          kind: 1
        });
        a.heat = clamp(a.heat * 0.998, 0.5, 1.2);
      } else {
        var sharp = m === 6 ? 0.72 : 0.64;
        pushSplat(splatBuf, {
          x: px + (Math.random() - 0.5) * a.turb * 2.2,
          y: py + (Math.random() - 0.5) * a.turb * 2.2,
          size: rad * (1.05 + spd * 0.1) * (1.45 + pow * 0.3),
          alpha: (0.13 + pow * 0.22) * (0.85 + a.decay * 0.15),
          ang: ang,
          mode: m,
          sharp: sharp,
          seed: Math.random() * 97 + t * 0.17,
          kind: m === 6 ? 1 : 0
        });
        if (m === 6 && Math.random() < 0.5) {
          pushSplat(splatBuf, {
            x: px + (Math.random() - 0.5) * rad * 1.4,
            y: py + (Math.random() - 0.5) * rad * 1.4,
            size: rad * 0.5,
            alpha: (0.1 + pow * 0.16),
            ang: ang + (Math.random() - 0.5),
            mode: 6,
            sharp: 0.9,
            seed: Math.random() * 60,
            kind: 1
          });
        }
      }
    }
    if (m === 4 && Math.random() < pow * 0.3) {
      sparks.push({
        x: a.x, y: a.y,
        vx: (Math.random() - 0.5) * 3,
        vy: 1.5 + Math.random() * 2,
        life: 0.6, size: 5, mode: 4, kind: 1
      });
    }
    if (m === 6 && Math.random() < pow * 0.42) {
      var ba = Math.atan2(a.vy, a.vx) + (Math.random() - 0.5) * 1.4;
      var bs = 2.5 + Math.random() * 3;
      sparks.push({
        x: a.x, y: a.y,
        vx: Math.cos(ba) * bs, vy: Math.sin(ba) * bs,
        life: 0.55, size: 7, mode: 6, kind: 3
      });
    }
    if (m === 2 && Math.random() < pow * 0.4) {
      var ia = Math.random() * Math.PI * 2;
      var is = 1.5 + Math.random() * 3.5;
      sparks.push({
        x: a.x, y: a.y,
        vx: Math.cos(ia) * is, vy: Math.sin(ia) * is,
        life: 0.5 + Math.random() * 0.3, size: 6, mode: 2, kind: 0
      });
    }
    if (m === 7 && Math.random() < pow * 0.35) {
      var wa = Math.atan2(a.vy, a.vx) + (Math.random() - 0.5) * 1.2;
      var ws = 1.5 + Math.random() * 2.5;
      sparks.push({
        x: a.x, y: a.y,
        vx: Math.cos(wa) * ws, vy: Math.sin(wa) * ws + 0.5,
        life: 0.5, size: 5, mode: 7, kind: 2
      });
    }
    if (m === 5 && Math.random() < pow * 0.45) {
      sparks.push({
        x: a.x + (Math.random() - 0.5) * rad,
        y: a.y, vx: (Math.random() - 0.5) * 1.5,
        vy: -1.2 - Math.random() * 1.8,
        life: 0.55, size: 5.5, mode: 5, kind: 0
      });
    }
  }

  function updateAgentMotion(a, t, dt, W, H, boundarySteer, typeMotion, pickRoamTarget, speedMul, attractors, vortexPow) {
    var sm = speedMul || 1;
    dt *= sm;
    if (a.visual === undefined) initAgentType(a);

    if (a.type === 3) {
      if (!a.zig || a.zig.length < 2) pickBoltTarget(a, W, H);
      a.boltWait = (a.boltWait || 0) - dt;
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
        a.vx = (p1.x - p0.x) * 14 * sm;
        a.vy = (p1.y - p0.y) * 14 * sm;
        a.boltT += dt * (5.5 + a.turb * 5) * sm;
      }
      if (attractors && attractors.length) {
        var vf3 = sampleVortex(a.x, a.y, attractors, vortexPow);
        a.vx += vf3.ax * 0.22 * sm;
        a.vy += vf3.ay * 0.22 * sm;
      }
      var pad = 24;
      a.x = clamp(a.x, pad, W - pad);
      a.y = clamp(a.y, pad, H - pad);
      return;
    }

    // --- Natural steering motion (anime-glide): continuous wander + arrive ---
    var prof = MOTION[a.type] || MOTION[6];
    var dxT = a.targetX - a.x;
    var dyT = a.targetY - a.y;
    var dT = Math.sqrt(dxT * dxT + dyT * dyT) || 1;
    if (dT < 110) pickRoamTarget(a);

    var spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    var heading = spd > 0.06 ? Math.atan2(a.vy, a.vx) : a.phase;

    // smooth, continuous wander (no random teleporting dashes)
    a.wanderT = (a.wanderT || 0) + dt;
    var wob = smoothNoise1(a.wanderT * prof.wfreq + a.noisePhase, a.phase * 1.3);
    var steerAng = heading + wob * prof.wander;

    var dirX = Math.cos(steerAng);
    var dirY = Math.sin(steerAng);

    // gentle large-scale roam toward drifting target
    dirX += (dxT / dT) * prof.seek;
    dirY += (dyT / dT) * prof.seek;

    var bnd = boundarySteer(a);
    dirX += bnd.ax * 2.0;
    dirY += bnd.ay * 2.0;

    // per-type bias + slow internal phases (no positional noise)
    if (a.type === 1) {
      a.tendril += dt * 1.4;
      dirY -= 0.55;
      dirX += Math.sin(a.tendril) * 0.32;
      a.slaveT += dt;
      if (a.slaveT > 2.5) { a.slaveT = 0; a.rise = 0.7 + Math.random() * 0.6; }
    } else if (a.type === 7) {
      var fl = sampleFlow(a.x, a.y);
      dirX += fl.vx * 3.2;
      dirY += fl.vy * 3.2 + 0.18;
      a.streamAng += dt * 0.4 * sm;
      a.wet = clamp(a.wet + dt, 0, 1);
    } else if (a.type === 5) {
      dirY -= 0.7;
      a.heat = Math.min(1.3, a.heat + dt * 0.15);
    } else if (a.type === 2) {
      dirY += 0.18;
    } else if (a.type === 4) {
      dirY += 0.32;
    }

    if (attractors && attractors.length) {
      var vf = sampleVortex(a.x, a.y, attractors, vortexPow);
      var vMix = clamp(vf.swirl * 1.15, 0, 1);
      dirX += vf.ax * vMix * 0.5;
      dirY += vf.ay * vMix * 0.5;
    }

    // desired velocity from steering direction, eased into current velocity
    var dl = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    var baseSpeed = prof.speed * (0.85 + a.turb * 0.5) * sm;
    var dvx = (dirX / dl) * baseSpeed;
    var dvy = (dirY / dl) * baseSpeed;
    var steerRate = prof.steer * sm;
    if (steerRate > 0.6) steerRate = 0.6;
    a.vx += (dvx - a.vx) * steerRate;
    a.vy += (dvy - a.vy) * steerRate;

    var spdCap = baseSpeed * 1.35;
    var spd2 = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    if (spd2 > spdCap) {
      a.vx = (a.vx / spd2) * spdCap;
      a.vy = (a.vy / spd2) * spdCap;
    }

    a.px = a.x;
    a.py = a.y;
    a.pulse += dt * 2.2;
    a.x += a.vx;
    a.y += a.vy;

    var pad2 = 24;
    if (a.x < pad2) { a.x = pad2; a.vx = Math.abs(a.vx) * 0.6 + 0.15; }
    if (a.x > W - pad2) { a.x = W - pad2; a.vx = -Math.abs(a.vx) * 0.6 - 0.15; }
    if (a.y < pad2) { a.y = pad2; a.vy = Math.abs(a.vy) * 0.6 + 0.15; }
    if (a.y > H - pad2) { a.y = H - pad2; a.vy = -Math.abs(a.vy) * 0.6 - 0.15; }
  }

  function speedFromSlider(v) {
    return 0.35 + ((v - 1) / 14) * 1.85;
  }

  global.DEEmitters = {
    initSim: initSim,
    stepSimBox: stepSimBox,
    emitFromField: emitFromField,
    emitAttractorSwirl: emitAttractorSwirl,
    initAgentType: initAgentType,
    updateAgentMotion: updateAgentMotion,
    emitTrail: emitTrail,
    sampleFlow: sampleFlow,
    sampleVortex: sampleVortex,
    speedFromSlider: speedFromSlider,
    vortexPowFromSlider: vortexPowFromSlider
  };
})(typeof window !== 'undefined' ? window : globalThis);
