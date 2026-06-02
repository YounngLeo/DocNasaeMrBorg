/* Digital Energy — per-type motion, fluid box, chaos/entropy currents, technical trace (v1.6) */
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

  // --- Environment currents: procedural "wind" field (chaos / entropy) ---
  // Replaces manual attractors with a global divergence-free flow built from a
  // scalar potential (curl noise) plus drifting random mathematical vortices.
  var wind = { chaos: 0.4, current: 0.55, scale: 0.5, seed: Math.random() * 1000, centers: [] };

  function regenWind() {
    wind.seed = Math.random() * 1000;
    wind.centers = [];
    var n = 3 + Math.round(wind.chaos * 7);
    for (var i = 0; i < n; i++) {
      wind.centers.push({
        x: Math.random(),
        y: Math.random(),
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.9),
        r: 0.1 + Math.random() * 0.28,
        ph: Math.random() * 6.2832
      });
    }
  }
  regenWind();

  function configureWind(opts) {
    if (!opts) return;
    if (opts.chaos !== undefined) wind.chaos = clamp(opts.chaos, 0, 1);
    if (opts.current !== undefined) wind.current = Math.max(0, opts.current);
    if (opts.scale !== undefined) wind.scale = clamp(opts.scale, 0, 1);
    if (opts.regen) regenWind();
  }

  function windPotential(nx, ny, t) {
    var f = 1.4 + wind.scale * 4.2;
    var s = wind.seed;
    var p = Math.sin(nx * f + s + t * 0.2) * Math.cos(ny * f * 0.92 - s * 0.7 + t * 0.15);
    p += 0.5 * Math.sin(nx * f * 1.9 - t * 0.1 + s * 1.3) * Math.cos(ny * f * 1.7 + t * 0.12);
    if (wind.chaos > 0.01) {
      var hf = f * (2.6 + wind.chaos * 5.0);
      p += wind.chaos * 0.6 * Math.sin(nx * hf + t * 0.6 + s) * Math.cos(ny * hf * 1.1 - t * 0.5);
      p += wind.chaos * 0.32 * Math.sin((nx + ny) * hf * 1.7 + t * 0.9 + s * 0.5);
    }
    return p;
  }

  function sampleWind(x, y, t) {
    if (wind.current <= 0.001) return { vx: 0, vy: 0 };
    var W = sim ? sim.W : 1280;
    var H = sim ? sim.H : 720;
    var nx = x / W;
    var ny = y / H;
    var e = 0.0045;
    var vx = (windPotential(nx, ny + e, t) - windPotential(nx, ny - e, t)) / (2 * e) * 0.02;
    var vy = -(windPotential(nx + e, ny, t) - windPotential(nx - e, ny, t)) / (2 * e) * 0.02;
    var i, c, cx, cy, dx, dy, fall;
    for (i = 0; i < wind.centers.length; i++) {
      c = wind.centers[i];
      cx = c.x + Math.sin(t * 0.13 + c.ph) * 0.06;
      cy = c.y + Math.cos(t * 0.11 + c.ph * 1.3) * 0.06;
      dx = nx - cx;
      dy = ny - cy;
      fall = Math.exp(-(dx * dx + dy * dy) / (c.r * c.r));
      vx += -dy * c.spin * fall * 1.7;
      vy += dx * c.spin * fall * 1.7;
    }
    return { vx: vx * wind.current, vy: vy * wind.current };
  }

  function windAngle(px, py, ang, t) {
    if (wind.current <= 0.001) return ang;
    var w = sampleWind(px, py, t);
    var mag = Math.sqrt(w.vx * w.vx + w.vy * w.vy);
    if (mag < 0.03) return ang;
    var tang = Math.atan2(w.vy, w.vx);
    var mix = clamp(mag * 0.9, 0, 0.6);
    var d = tang - ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return ang + d * mix;
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

  function stepSimBox(agents, dt, speedMul) {
    if (!sim) return;
    var gw = sim.gw;
    var gh = sim.gh;
    var n = gw * gh;
    var sm = speedMul || 1;
    var wt = performance.now() * 0.001;
    var river = Math.sin(performance.now() * 0.00035 * sm) * 0.4 + 0.6;
    var windOn = wind.current > 0.001;
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
        // macro currents (sampled sparsely for performance)
        if (windOn && (i % 3 === 0) && (j % 3 === 0)) {
          var wf = sampleWind((i / gw) * sim.W, (j / gh) * sim.H, wt);
          sim.vx[k] += wf.vx * 0.6 * sm;
          sim.vy[k] += wf.vy * 0.6 * sm;
        }
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

  function buildBoltBranch(x0, y0, x1, y1, depth, jitter, out, gen) {
    gen = gen || 0;
    if (depth <= 0) {
      out.push({ x0: x0, y0: y0, x1: x1, y1: y1, gen: gen });
      return;
    }
    var mx = (x0 + x1) * 0.5 + (Math.random() - 0.5) * jitter;
    var my = (y0 + y1) * 0.5 + (Math.random() - 0.5) * jitter;
    buildBoltBranch(x0, y0, mx, my, depth - 1, jitter * 0.6, out, gen);
    buildBoltBranch(mx, my, x1, y1, depth - 1, jitter * 0.6, out, gen);
    // tapering side branches (electric flux fanning out, thinner each generation)
    if (depth >= 2 && Math.random() < 0.82) {
      var blen = 20 + Math.random() * 60;
      var bang = Math.atan2(y1 - y0, x1 - x0) + (Math.random() < 0.5 ? 1 : -1) * (0.35 + Math.random() * 1.1);
      buildBoltBranch(mx, my, mx + Math.cos(bang) * blen, my + Math.sin(bang) * blen, depth - 1, jitter * 0.45, out, gen + 1);
    }
    if (depth >= 2 && Math.random() < 0.6) {
      var bang2 = Math.atan2(y1 - y0, x1 - x0) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 1.5);
      var blen2 = 10 + Math.random() * 34;
      buildBoltBranch(mx, my, mx + Math.cos(bang2) * blen2, my + Math.sin(bang2) * blen2, depth - 1, jitter * 0.35, out, gen + 2);
    }
    if (depth >= 4 && Math.random() < 0.4) {
      var bang3 = Math.random() * Math.PI * 2;
      var blen3 = 8 + Math.random() * 20;
      buildBoltBranch(mx, my, mx + Math.cos(bang3) * blen3, my + Math.sin(bang3) * blen3, 1, jitter * 0.3, out, gen + 3);
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
    if (a.boltTX !== undefined && a.zig && a.zig.length) {
      a.boltX = a.boltTX;
      a.boltY = a.boltTY;
    } else {
      a.boltX = a.x;
      a.boltY = a.y;
    }
    a.boltDir = (a.boltDir === undefined)
      ? Math.random() * Math.PI * 2
      : a.boltDir + (Math.random() - 0.5) * 1.0;
    var travel = 180 + Math.random() * 220;
    var tx = a.boltX + Math.cos(a.boltDir) * travel;
    var ty = a.boltY + Math.sin(a.boltDir) * travel;
    if (tx < pad || tx > W - pad) { a.boltDir = Math.PI - a.boltDir; tx = clamp(tx, pad, W - pad); }
    if (ty < pad || ty > H - pad) { a.boltDir = -a.boltDir; ty = clamp(ty, pad, H - pad); }
    a.boltTX = tx;
    a.boltTY = ty;
    var jitter = 22 + a.turb * 20 + a.radius * 0.8;
    a.boltSegs = [];
    buildBoltBranch(a.boltX, a.boltY, a.boltTX, a.boltTY, 5, jitter, a.boltSegs, 0);
    a.zig = [];
    var n = 16 + Math.floor(Math.random() * 6);
    for (var s = 0; s <= n; s++) {
      var u = s / n;
      a.zig.push({
        x: a.boltX + (a.boltTX - a.boltX) * u + (Math.random() - 0.5) * jitter * 0.3,
        y: a.boltY + (a.boltTY - a.boltY) * u + (Math.random() - 0.5) * jitter * 0.3
      });
    }
    a.boltT = 0;
    a.boltHold = 0;
  }

  function pushSplat(splatBuf, o) {
    splatBuf.push(o);
  }

  function emitBoltTree(a, rad, pow, t, splatBuf, sparks) {
    if (!a.boltSegs) return;
    var front = a.boltT === undefined ? 1 : clamp(a.boltT + 0.06, 0, 1);
    var axx = (a.boltTX || 0) - (a.boltX || 0);
    var axy = (a.boltTY || 0) - (a.boltY || 0);
    var axLen2 = axx * axx + axy * axy || 1;
    var i, seg, dx, dy, d, steps, zs, zu, zx, zy, zang, segFrac;
    for (i = 0; i < a.boltSegs.length; i++) {
      seg = a.boltSegs[i];
      segFrac = (((seg.x0 + seg.x1) * 0.5 - a.boltX) * axx + ((seg.y0 + seg.y1) * 0.5 - a.boltY) * axy) / axLen2;
      if (segFrac > front) continue;
      var gen = seg.gen || 0;
      var genThin = 1 / (1 + gen * 0.85);
      dx = seg.x1 - seg.x0;
      dy = seg.y1 - seg.y0;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      steps = Math.max(3, Math.ceil(d / 3));
      for (zs = 0; zs <= steps; zs++) {
        zu = zs / steps;
        zx = seg.x0 + dx * zu + (Math.random() - 0.5) * 1.2;
        zy = seg.y0 + dy * zu + (Math.random() - 0.5) * 1.2;
        zang = Math.atan2(dy, dx);
        pushSplat(splatBuf, {
          x: zx, y: zy,
          size: rad * (0.42 + pow * 0.22) * genThin * (0.85 + Math.random() * 0.25),
          alpha: (0.26 + pow * 0.42) * (0.45 + genThin * 0.55) * (0.85 + Math.random() * 0.15),
          ang: zang + (Math.random() - 0.5) * 0.12,
          mode: 3,
          sharp: 0.99,
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

  function emitTrace(splatBuf, x, y, ang, rad, type) {
    var perpX = -Math.sin(ang);
    var perpY = Math.cos(ang);
    for (var k = -2; k <= 2; k++) {
      var off = k * rad * 0.26 + (Math.random() - 0.5) * rad * 0.12;
      var fall = 1 - Math.abs(k) * 0.22;
      pushSplat(splatBuf, {
        x: x + perpX * off,
        y: y + perpY * off,
        size: rad * 0.92,
        alpha: 0.4 * fall,
        ang: ang,
        mode: 8,
        sharp: 0.95,
        seed: type * 7 + (k + 2) * 11 + Math.random() * 3,
        kind: type
      });
    }
  }

  function emitTrail(a, t, pow, splatBuf, sparks, intensityPow) {
    var dx = a.x - a.px;
    var dy = a.y - a.py;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var steps = Math.max(1, dist > 0.2 ? Math.min(46, Math.ceil(dist / 0.8)) : 1);
    var rad = a.radius * (0.62 + pow * 0.42);
    var m = a.type;

    if (m === 3) {
      emitBoltTree(a, rad, pow, t, splatBuf, sparks);
      if (a.zig && a.zig.length > 1) {
        var zfront = a.boltT === undefined ? 1 : clamp(a.boltT + 0.06, 0, 1);
        var zi, z0, z1, zdx, zdy, zd, zsteps, zs, zu, zx, zy, zang;
        for (zi = 1; zi < a.zig.length; zi++) {
          if ((zi / (a.zig.length - 1)) > zfront) break;
          z0 = a.zig[zi - 1];
          z1 = a.zig[zi];
          zdx = z1.x - z0.x;
          zdy = z1.y - z0.y;
          zd = Math.sqrt(zdx * zdx + zdy * zdy) || 1;
          zsteps = Math.max(2, Math.ceil(zd / 5));
          zang = Math.atan2(zdy, zdx);
          for (zs = 0; zs < zsteps; zs++) {
            zu = zs / zsteps;
            zx = z0.x + zdx * zu;
            zy = z0.y + zdy * zu;
            pushSplat(splatBuf, {
              x: zx, y: zy,
              size: rad * (0.5 + pow * 0.28),
              alpha: (0.32 + pow * 0.44),
              ang: zang,
              mode: 3,
              sharp: 0.99,
              seed: Math.random() * 40 + t,
              kind: 1
            });
          }
          emitTrace(splatBuf, z1.x, z1.y, zang, rad, 3);
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
      ang = windAngle(px, py, ang, t);

      emitTrace(splatBuf, px, py, ang, rad, m);

      if (m === 1) {
        var curl = Math.sin(a.tendril + t * 1.5 + u * 5) * 0.35;
        if (Math.random() < 0.55) {
          pushSplat(splatBuf, {
            x: px + (Math.random() - 0.5) * rad,
            y: py + (Math.random() - 0.5) * rad,
            size: rad * (2.8 + pow * 0.9),
            alpha: (0.12 + pow * 0.16),
            ang: ang,
            mode: 1,
            sharp: 0.2,
            seed: Math.random() * 90,
            kind: 3
          });
        }
        var wk;
        for (wk = 0; wk < 2; wk++) {
          var wperp = (wk === 0 ? -1 : 1) * rad * (0.5 + Math.random() * 0.5);
          pushSplat(splatBuf, {
            x: px + wperp,
            y: py - (3 + Math.random() * 7),
            size: rad * (2.3 + pow * 0.7),
            alpha: (0.14 + pow * 0.22) * (0.8 + Math.random() * 0.2),
            ang: curl + (Math.random() - 0.5) * 0.3,
            mode: 1,
            sharp: 0.5 + Math.random() * 0.3,
            seed: Math.random() * 90,
            kind: 1
          });
        }
      } else if (m === 7) {
        fw = sampleFlow(px, py);
        ang = Math.atan2(vy + fw.vy * 2.5, vx + fw.vx * 2.5);
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.6 + spd * 0.1) * 1.2,
          alpha: (0.14 + pow * 0.22),
          ang: ang,
          mode: 7,
          sharp: 0.5,
          seed: Math.random() * 60,
          kind: 1
        });
        if (Math.random() < 0.4) {
          var wperp = ang + Math.PI * 0.5;
          var woff = (Math.random() - 0.5) * rad * 1.3;
          pushSplat(splatBuf, {
            x: px + Math.cos(wperp) * woff,
            y: py + Math.sin(wperp) * woff,
            size: rad * (1.1 + spd * 0.08),
            alpha: (0.09 + pow * 0.16),
            ang: ang,
            mode: 7,
            sharp: 0.6,
            seed: Math.random() * 60,
            kind: 5
          });
        }
      } else if (m === 4) {
        pushSplat(splatBuf, {
          x: px, y: py,
          size: rad * (1.5 + spd * 0.12) * 1.25,
          alpha: (0.16 + pow * 0.26),
          ang: ang,
          mode: 4,
          sharp: 0.86,
          seed: Math.random() * 40,
          kind: 1
        });
        if (Math.random() < 0.45) {
          var bperp = ang + Math.PI * 0.5;
          var boff = (Math.random() - 0.5) * rad * 1.6;
          pushSplat(splatBuf, {
            x: px + Math.cos(bperp) * boff,
            y: py + Math.sin(bperp) * boff,
            size: rad * (1.1 + spd * 0.08),
            alpha: (0.1 + pow * 0.18),
            ang: ang + (Math.random() - 0.5) * 0.5,
            mode: 4,
            sharp: 0.92,
            seed: Math.random() * 40,
            kind: 1
          });
        }
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
        var fcurl = Math.sin(t * 3 + a.phase + u * 5) * 0.6;
        pushSplat(splatBuf, {
          x: px, y: py - rad * 0.3,
          size: rad * (1.5 + a.heat * 0.25),
          alpha: (0.16 + pow * 0.26) * a.heat,
          ang: ang - 1.2 + fcurl,
          mode: 5,
          sharp: 0.5,
          seed: Math.random() * 50,
          kind: 1
        });
        if (Math.random() < 0.5) {
          pushSplat(splatBuf, {
            x: px + (Math.random() - 0.5) * rad * 1.2,
            y: py - rad * (0.5 + Math.random() * 0.6),
            size: rad * (1.0 + a.heat * 0.2),
            alpha: (0.1 + pow * 0.2) * a.heat,
            ang: ang - 1.4 + fcurl * 1.3,
            mode: 5,
            sharp: 0.6,
            seed: Math.random() * 50,
            kind: 1
          });
        }
        a.heat = clamp(a.heat * 0.998, 0.5, 1.2);
      } else {
        var sharp = m === 6 ? 0.5 : 0.64;
        pushSplat(splatBuf, {
          x: px + (Math.random() - 0.5) * a.turb * 2.0,
          y: py + (Math.random() - 0.5) * a.turb * 2.0,
          size: rad * (1.05 + spd * 0.1) * (m === 6 ? (1.9 + pow * 0.5) : (1.45 + pow * 0.3)),
          alpha: (0.12 + pow * 0.2) * (0.85 + a.decay * 0.15),
          ang: ang,
          mode: m,
          sharp: sharp,
          seed: Math.random() * 97 + t * 0.17,
          kind: m === 6 ? 1 : 0
        });
        if (m === 6 && Math.random() < 0.7) {
          var ra = Math.random() * Math.PI * 2;
          pushSplat(splatBuf, {
            x: px + Math.cos(ra) * rad * 0.8,
            y: py + Math.sin(ra) * rad * 0.8,
            size: rad * (1.1 + pow * 0.3),
            alpha: (0.08 + pow * 0.14),
            ang: ra,
            mode: 6,
            sharp: 0.85,
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

  function updateAgentMotion(a, t, dt, W, H, boundarySteer, typeMotion, pickRoamTarget, speedMul) {
    var sm = speedMul || 1;
    dt *= sm;
    if (a.visual === undefined) initAgentType(a);

    if (a.type === 3) {
      if (!a.zig || a.zig.length < 2) pickBoltTarget(a, W, H);
      if (a.boltT < 1) {
        a.boltT += dt * (4.5 + a.turb * 2.5) * sm;
        if (a.boltT >= 1) { a.boltT = 1; a.boltHold = 0.22 + Math.random() * 0.2; }
      } else {
        a.boltHold = (a.boltHold || 0) - dt;
        if (a.boltHold <= 0) pickBoltTarget(a, W, H);
      }
      if (a.zig.length > 1) {
        var prog = clamp(a.boltT, 0, 1);
        var seg = Math.floor(prog * (a.zig.length - 1));
        seg = clamp(seg, 0, a.zig.length - 2);
        var u = (prog * (a.zig.length - 1)) - seg;
        var p0 = a.zig[seg];
        var p1 = a.zig[seg + 1];
        a.px = a.x;
        a.py = a.y;
        a.x = p0.x + (p1.x - p0.x) * u;
        a.y = p0.y + (p1.y - p0.y) * u;
        a.vx = (p1.x - p0.x) * 14 * sm;
        a.vy = (p1.y - p0.y) * 14 * sm;
      }
      var wf3 = sampleWind(a.x, a.y, t);
      a.vx += wf3.vx * 0.9 * sm;
      a.vy += wf3.vy * 0.9 * sm;
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

    // macro environment currents (chaos/entropy field)
    var wnd = sampleWind(a.x, a.y, t);
    dirX += wnd.vx * 2.4;
    dirY += wnd.vy * 2.4;

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
    initAgentType: initAgentType,
    updateAgentMotion: updateAgentMotion,
    emitTrail: emitTrail,
    sampleFlow: sampleFlow,
    sampleWind: sampleWind,
    configureWind: configureWind,
    regenWind: regenWind,
    speedFromSlider: speedFromSlider
  };
})(typeof window !== 'undefined' ? window : globalThis);
