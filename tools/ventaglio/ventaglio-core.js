/* VENTAGLIO · modulo singolo → mesh STL */
'use strict';

window.VENTAGLIO = (function () {
  function polyArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a * 0.5;
  }

  function circlePts(cx, cy, r, segs, cw) {
    const out = [];
    for (let i = 0; i < segs; i++) {
      const t = (cw ? -1 : 1) * (i / segs) * Math.PI * 2;
      out.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
    }
    return out;
  }

  function defaultHalfProfile() {
    return [
      { x: 0, y: 0, lock: true },
      { x: 5, y: 22 },
      { x: 14, y: 58 },
      { x: 17, y: 95 },
      { x: 11, y: 132 },
      { x: 0, y: 148, lock: true }
    ];
  }

  function defaultHoles() {
    return [
      { x: 0, y: 28, r: 3.2 },
      { x: 0, y: 58, r: 5.0 },
      { x: 0, y: 88, r: 6.8 },
      { x: 0, y: 118, r: 8.5 }
    ];
  }

  function halfToOutline(half) {
    const left = [];
    for (let i = half.length - 1; i >= 0; i--) {
      if (i === 0) left.push({ x: -half[i].x, y: half[i].y });
      else left.push({ x: -half[i].x, y: half[i].y });
    }
    const right = half.map(function (p) { return { x: p.x, y: p.y }; });
    return left.concat(right.slice(1));
  }

  function spineOutline(half, width) {
    const hw = width * 0.5;
    const top = half[half.length - 1].y;
    const bot = Math.max(8, half[1] ? half[1].y : 10);
    return [
      { x: -hw, y: bot }, { x: hw, y: bot },
      { x: hw, y: top }, { x: -hw, y: top }
    ];
  }

  function pointInTri(p, a, b, c) {
    const v0x = c.x - a.x, v0y = c.y - a.y;
    const v1x = b.x - a.x, v1y = b.y - a.y;
    const v2x = p.x - a.x, v2y = p.y - a.y;
    const d00 = v0x * v0x + v0y * v0y;
    const d01 = v0x * v1x + v0y * v1y;
    const d11 = v1x * v1x + v1y * v1y;
    const d20 = v2x * v0x + v2y * v0y;
    const d21 = v2x * v1x + v2y * v1y;
    const den = d00 * d11 - d01 * d01;
    if (Math.abs(den) < 1e-12) return false;
    const v = (d11 * d20 - d01 * d21) / den;
    const w = (d00 * d21 - d01 * d20) / den;
    const u = 1 - v - w;
    return u >= -1e-6 && v >= -1e-6 && w >= -1e-6;
  }

  function earClip(poly) {
    const n = poly.length;
    if (n < 3) return [];
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    const tris = [];
    let guard = 0;
    while (idx.length > 3 && guard++ < n * n) {
      let ear = -1;
      for (let i = 0; i < idx.length; i++) {
        const i0 = idx[(i + idx.length - 1) % idx.length];
        const i1 = idx[i];
        const i2 = idx[(i + 1) % idx.length];
        const a = poly[i0], b = poly[i1], c = poly[i2];
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (cross <= 1e-8) continue;
        let ok = true;
        for (let j = 0; j < idx.length; j++) {
          const pj = poly[idx[j]];
          if (idx[j] === i0 || idx[j] === i1 || idx[j] === i2) continue;
          if (pointInTri(pj, a, b, c)) { ok = false; break; }
        }
        if (ok) { ear = i; break; }
      }
      if (ear < 0) break;
      const i0 = idx[(ear + idx.length - 1) % idx.length];
      const i1 = idx[ear];
      const i2 = idx[(ear + 1) % idx.length];
      tris.push([i0, i1, i2]);
      idx.splice(ear, 1);
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return tris;
  }

  function bridgeHoles(outer, holes) {
    const verts = outer.slice();
    const tris = earClip(outer);
    const holeStart = [];
    holes.forEach(function (h) {
      holeStart.push(verts.length);
      const loop = circlePts(h.x, h.y, h.r, h.segs || 20, true);
      verts.push.apply(verts, loop);
      const local = [];
      for (let i = 0; i < loop.length; i++) local.push(verts.length - loop.length + i);
      tris.push.apply(tris, earClip(loop).map(function (t) {
        return [local[t[2]], local[t[1]], local[t[0]]];
      }));
    });
    holes.forEach(function (h, hi) {
      const loop = circlePts(h.x, h.y, h.r, h.segs || 20, true);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < outer.length; i++) {
        const d = Math.hypot(outer[i].x - loop[0].x, outer[i].y - loop[0].y);
        if (d < bestD) { bestD = d; best = i; }
      }
      const hs = holeStart[hi];
      for (let i = 0; i < loop.length; i++) {
        const o0 = best + i % outer.length;
        const o1 = best + (i + 1) % outer.length;
        const h0 = hs + i;
        const h1 = hs + (i + 1) % loop.length;
        tris.push([o0 % outer.length, h0, o1 % outer.length]);
        tris.push([h0, h1, o1 % outer.length]);
      }
    });
    return { verts: verts, tris: tris };
  }

  function extrude(bridged, t) {
    const pos = [];
    const V = bridged.verts;
    const push = function (v, z) { pos.push(v.x, v.y, z); };
    bridged.tris.forEach(function (tr) {
      push(V[tr[0]], t); push(V[tr[1]], t); push(V[tr[2]], t);
    });
    bridged.tris.forEach(function (tr) {
      push(V[tr[0]], 0); push(V[tr[2]], 0); push(V[tr[1]], 0);
    });
    const wall = function (n) {
      for (let i = 0; i < n; i++) {
        const A = V[i], B = V[(i + 1) % n];
        push(A, 0); push(B, 0); push(B, t);
        push(A, 0); push(B, t); push(A, t);
      }
    };
    wall(V.length);
    return new Float32Array(pos);
  }

  function mergePositions(arrays) {
    let len = 0;
    arrays.forEach(function (a) { len += a.length; });
    const out = new Float32Array(len);
    let o = 0;
    arrays.forEach(function (a) {
      out.set(a, o);
      o += a.length;
    });
    return out;
  }

  function transformPositions(pos, fn) {
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const p = fn(pos[i], pos[i + 1], pos[i + 2]);
      out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2];
    }
    return out;
  }

  function rotateZ(pos, ang, pivotX, pivotY) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return transformPositions(pos, function (x, y, z) {
      const dx = x - pivotX, dy = y - pivotY;
      return [pivotX + dx * c - dy * s, pivotY + dx * s + dy * c, z];
    });
  }

  function translate(pos, dx, dy, dz) {
    return transformPositions(pos, function (x, y, z) {
      return [x + dx, y + dy, z + dz];
    });
  }

  function stlBinary(positions, name) {
    const nTri = positions.length / 9;
    const buf = new ArrayBuffer(84 + nTri * 50);
    const dv = new DataView(buf);
    const hdr = (name || 'VENTAGLIO').slice(0, 79);
    for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i));
    dv.setUint32(80, nTri, true);
    let off = 84;
    for (let i = 0; i < nTri; i++) {
      const b = i * 9;
      const ax = positions[b], ay = positions[b + 1], az = positions[b + 2];
      const bx = positions[b + 3], by = positions[b + 4], bz = positions[b + 5];
      const cx = positions[b + 6], cy = positions[b + 7], cz = positions[b + 8];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true);
      dv.setFloat32(off + 12, ax, true); dv.setFloat32(off + 16, ay, true); dv.setFloat32(off + 20, az, true);
      dv.setFloat32(off + 24, bx, true); dv.setFloat32(off + 28, by, true); dv.setFloat32(off + 32, bz, true);
      dv.setFloat32(off + 36, cx, true); dv.setFloat32(off + 40, cy, true); dv.setFloat32(off + 44, cz, true);
      dv.setUint16(off + 48, 0, true);
      off += 50;
    }
    return buf;
  }

  function buildModuleMesh(opts) {
    const half = opts.half || defaultHalfProfile();
    const holes = (opts.holes || defaultHoles()).slice();
    const pivotR = opts.pivotR != null ? opts.pivotR : 5.5;
    const cord = opts.cord || { x: 13, y: 142, r: 1.4 };
    const thick = opts.thick != null ? opts.thick : 1.2;
    const spineW = opts.spineW != null ? opts.spineW : 4.2;
    const withSpine = opts.withSpine !== false;

    holes.push({ x: 0, y: Math.max(6, half[1].y * 0.5), r: pivotR, segs: 24 });
    if (cord) holes.push({ x: cord.x, y: cord.y, r: cord.r, segs: 12 });
    if (opts.cordLeft) holes.push({ x: -cord.x, y: cord.y, r: cord.r, segs: 12 });

    const outer = halfToOutline(half);
    const bridged = bridgeHoles(outer, holes);
    const blade = extrude(bridged, thick);
    const parts = [blade];

    if (withSpine && spineW > 0.5) {
      const sp = spineOutline(half, spineW);
      const spBridged = bridgeHoles(sp, [{ x: 0, y: Math.max(6, half[1].y * 0.5), r: pivotR * 0.55, segs: 16 }]);
      const spine = extrude(spBridged, thick + 0.15);
      parts.push(spine);
    }
    return mergePositions(parts);
  }

  function buildFanMeshes(opts) {
    const count = Math.max(2, opts.count || 12);
    const spread = (opts.spreadDeg != null ? opts.spreadDeg : 140) * Math.PI / 180;
    const open = Math.max(0, Math.min(1, opts.open != null ? opts.open : 0.65));
    const stackGap = opts.stackGap != null ? opts.stackGap : 0.32;
    const module = buildModuleMesh(opts);
    const meshes = [];
    const pivotX = 0, pivotY = 0;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const ang = (-spread * 0.5 + spread * t) * open;
      const zOff = (1 - open) * i * stackGap;
      let m = rotateZ(module, ang, pivotX, pivotY);
      m = translate(m, 0, 0, zOff);
      meshes.push(m);
    }
    return meshes;
  }

  return {
    defaultHalfProfile: defaultHalfProfile,
    defaultHoles: defaultHoles,
    halfToOutline: halfToOutline,
    buildModuleMesh: buildModuleMesh,
    buildFanMeshes: buildFanMeshes,
    mergePositions: mergePositions,
    stlBinary: stlBinary,
    circlePts: circlePts
  };
})();
