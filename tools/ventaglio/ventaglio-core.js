/* VENTAGLIO · modulo singolo → mesh STL */
'use strict';

window.VENTAGLIO = (function () {
  /* earcut 2.2.4 — triangolazione poligoni con fori (MIT) */
  var earcut = (function () {
    return function r(x, i, u) {
      function f(n, e) {
        if (!i[n]) {
          if (!x[n]) {
            var t = 'function' == typeof require && require;
            if (!e && t) return t(n, !0);
            if (o) return o(n, !0);
            throw ((e = new Error("Cannot find module '" + n + "'")).code = 'MODULE_NOT_FOUND', e);
          }
          t = i[n] = { exports: {} };
          x[n][0].call(t.exports, function (e) { return f(x[n][1][e] || e); }, t, t.exports, r, x, i, u);
        }
        return i[n].exports;
      }
      for (var o = 'function' == typeof require && require, e = 0; e < u.length; e++) f(u[e]);
      return f;
    }({
      1: [function (e, n) {
        'use strict';
        function r(e, n, t) {
          t = t || 2;
          var r, x, i, u, f, o = n && n.length, v = o ? n[0] * t : e.length, p = s(e, 0, v, t, !0), y = [];
          if (p && p.next !== p.prev) {
            if (o && (p = function (e, n, t, r) {
              var x, i, u, f, o = [];
              for (x = 0, i = n.length; x < i; x++) {
                f = n[x] * r;
                u = x < i - 1 ? n[x + 1] * r : e.length;
                (f = s(e, f, u, r, !1)) === f.next && (f.steiner = !0);
                o.push(function (e) {
                  var n = e, t = e;
                  for (; (n.x < t.x || n.x === t.x && n.y < t.y) && (t = n), n = n.next, n !== e;);
                  return t;
                }(f));
              }
              for (o.sort(c), x = 0; x < o.length; x++) t = function (e, n) {
                var t = function (e, n) {
                  var t, r = n, x = e.x, i = e.y, u = -1 / 0;
                  do {
                    if (i <= r.y && i >= r.next.y && r.next.y !== r.y) {
                      var f = r.x + (i - r.y) * (r.next.x - r.x) / (r.next.y - r.y);
                      if (f <= x && u < f && (u = f, t = r.x < r.next.x ? r : r.next, f === x)) return t;
                    }
                  } while (r = r.next, r !== n);
                  if (!t) return null;
                  var o, v = t, p = t.x, y = t.y, a = 1 / 0;
                  r = t;
                  for (; x >= r.x && r.x >= p && x !== r.x && D(i < y ? x : u, i, p, y, i < y ? u : x, i, r.x, r.y) && (o = Math.abs(i - r.y) / (x - r.x), _(r, e) && (o < a || o === a && (r.x > t.x || r.x === t.x && function (e, n) {
                    return E(e.prev, e, n.prev) < 0 && E(n.next, e, e.next) < 0;
                  }(t, r))) && (t = r, a = o)), r = r.next, r !== v;);
                  return t;
                }(e, n);
                if (!t) return n;
                n = j(t, e);
                return q(n, n.next), q(t, t.next);
              }(o[x], t);
              return t;
            }(e, n, p, t)), e.length > 80 * t) {
              for (var a = r = e[0], l = x = e[1], h = t; h < v; h += t) {
                (i = e[h]) < a && (a = i);
                (u = e[h + 1]) < l && (l = u);
                r < i && (r = i);
                x < u && (x = u);
              }
              f = 0 !== (f = Math.max(r - a, x - l)) ? 32767 / f : 0;
            }
            O(p, y, t, a, l, f, 0);
          }
          return y;
        }
        function s(e, n, t, r, x) {
          var i, u;
          if (x === 0 < d(e, n, t, r)) for (i = n; i < t; i += r) u = f(i, e[i], e[i + 1], u);
          else for (i = t - r; n <= i; i -= r) u = f(i, e[i], e[i + 1], u);
          return u && N(u, u.next) && (C(u), u = u.next), u;
        }
        function q(e, n) {
          if (!e) return e;
          n = n || e;
          var t, r = e;
          do {
            if (t = !1, r.steiner || !N(r, r.next) && 0 !== E(r.prev, r, r.next)) r = r.next;
            else {
              if (C(r), (r = n = r.prev) === r.next) break;
              t = !0;
            }
          } while (t || r !== n);
          return n;
        }
        function O(e, n, t, r, x, i, u) {
          if (e) {
            if (!u && i) {
              for (var f = e, o = r, v = x, p = i, y = f; 0 === y.z && (y.z = k(y.x, y.y, o, v, p)), y.prevZ = y.prev, y.nextZ = y.next, (y = y.next) !== f;);
              y.prevZ.nextZ = null;
              y.prevZ = null;
              var a, l, h, s, c, d, Z, g, w = y, M = 1;
              do {
                for (l = w, c = w = null, d = 0; l;) {
                  for (d++, h = l, a = Z = 0; a < M && (Z++, h = h.nextZ); a++);
                  for (g = M; 0 < Z || 0 < g && h;) {
                    0 !== Z && (0 === g || !h || l.z <= h.z) ? (l = (s = l).nextZ, Z--) : (h = (s = h).nextZ, g--);
                    c ? c.nextZ = s : w = s;
                    s.prevZ = c;
                    c = s;
                  }
                  l = h;
                }
              } while (c.nextZ = null, M *= 2, 1 < d);
            }
            for (var b, m, z = e; e.prev !== e.next;) {
              if (b = e.prev, m = e.next, i ? function (e, n, t, r) {
                var x = e.prev, i = e, u = e.next;
                if (0 <= E(x, i, u)) return;
                var f = x.x, o = i.x, v = u.x, p = x.y, y = i.y, a = u.y, l = f < o ? f < v ? f : v : o < v ? o : v, h = p < y ? p < a ? p : a : y < a ? y : a, s = o < f ? v < f ? f : v : v < o ? o : v, c = y < p ? a < p ? p : a : a < y ? y : a, d = k(l, h, n, t, r), Z = k(s, c, n, t, r), g = e.prevZ, w = e.nextZ;
                for (; g && g.z >= d && w && w.z <= Z;) {
                  if (g.x >= l && g.x <= s && g.y >= h && g.y <= c && g !== x && g !== u && D(f, p, o, y, v, a, g.x, g.y) && 0 <= E(g.prev, g, g.next)) return;
                  g = g.prevZ;
                  if (w.x >= l && w.x <= s && w.y >= h && w.y <= c && w !== x && w !== u && D(f, p, o, y, v, a, w.x, w.y) && 0 <= E(w.prev, w, w.next)) return;
                  w = w.nextZ;
                }
                for (; g && g.z >= d;) {
                  if (g.x >= l && g.x <= s && g.y >= h && g.y <= c && g !== x && g !== u && D(f, p, o, y, v, a, g.x, g.y) && 0 <= E(g.prev, g, g.next)) return;
                  g = g.prevZ;
                }
                for (; w && w.z <= Z;) {
                  if (w.x >= l && w.x <= s && w.y >= h && w.y <= c && w !== x && w !== u && D(f, p, o, y, v, a, w.x, w.y) && 0 <= E(w.prev, w, w.next)) return;
                  w = w.nextZ;
                }
                return 1;
              }(e, r, x, i) : function (e) {
                var n = e.prev, t = e, e = e.next;
                if (0 <= E(n, t, e)) return;
                var r = n.x, x = t.x, i = e.x, u = n.y, f = t.y, o = e.y, v = r < x ? r < i ? r : i : x < i ? x : i, p = u < f ? u < o ? u : o : f < o ? f : o, y = x < r ? i < r ? r : i : i < x ? x : i, a = f < u ? o < u ? u : o : o < f ? f : o, l = e.next;
                for (; l !== n;) {
                  if (l.x >= v && l.x <= y && l.y >= p && l.y <= a && D(r, u, x, f, i, o, l.x, l.y) && 0 <= E(l.prev, l, l.next)) return;
                  l = l.next;
                }
                return 1;
              }(e)) {
                n.push(b.i / t | 0);
                n.push(e.i / t | 0);
                n.push(m.i / t | 0);
                C(e);
                e = m.next;
                z = m.next;
              } else if ((e = m) === z) {
                u ? 1 === u ? O(e = function (e, n, t) {
                  var r = e;
                  do {
                    var x = r.prev, i = r.next.next;
                  } while (!N(x, i) && U(x, r, r.next, i) && _(x, i) && _(i, x) && (n.push(x.i / t | 0), n.push(r.i / t | 0), n.push(i.i / t | 0), C(r), C(r.next), r = e = i), r = r.next, r !== e);
                  return q(r);
                }(q(e), n, t), n, t, r, x, i, 2) : 2 === u && function (e, n, t, r, x, i) {
                  var u = e;
                  do {
                    for (var f, o = u.next.next; o !== u.prev;) {
                      if (u.i !== o.i && function (e, n) {
                        return e.next.i !== n.i && e.prev.i !== n.i && !function (e, n) {
                          var t = e;
                          do {
                            if (t.i !== e.i && t.next.i !== e.i && t.i !== n.i && t.next.i !== n.i && U(t, t.next, e, n)) return 1;
                          } while (t = t.next, t !== e);
                          return 0;
                        }(e, n) && (_(e, n) && _(n, e) && function (e, n) {
                          var t = e, r = !1, x = (e.x + n.x) / 2, i = (e.y + n.y) / 2;
                          for (; t.y > i != t.next.y > i && t.next.y !== t.y && x < (t.next.x - t.x) * (i - t.y) / (t.next.y - t.y) + t.x && (r = !r), t = t.next, t !== e;);
                          return r;
                        }(e, n) && (E(e.prev, e, n.prev) || E(e, n.prev, n)) || N(e, n) && 0 < E(e.prev, e, e.next) && 0 < E(n.prev, n, n.next));
                      }(u, o)) return f = j(u, o), u = q(u, u.next), f = q(f, f.next), O(u, n, t, r, x, i, 0), void O(f, n, t, r, x, i, 0);
                      o = o.next;
                    }
                  } while (u = u.next, u !== e);
                }(e, n, t, r, x, i) : O(q(e), n, t, r, x, i, 1);
                break;
              }
            }
          }
        }
        function c(e, n) { return e.x - n.x; }
        function k(e, n, t, r, x) {
          return (e = 1431655765 & ((e = 858993459 & ((e = 252645135 & ((e = 16711935 & ((e = (e - t) * x | 0) | e << 8)) | e << 4)) | e << 2)) | e << 1)) | (n = 1431655765 & ((n = 858993459 & ((n = 252645135 & ((n = 16711935 & ((n = (n - r) * x | 0) | n << 8)) | n << 4)) | n << 2)) | n << 1)) << 1;
        }
        function D(e, n, t, r, x, i, u, f) {
          return (e - u) * (i - f) <= (x - u) * (n - f) && (t - u) * (n - f) <= (e - u) * (r - f) && (x - u) * (r - f) <= (t - u) * (i - f);
        }
        function E(e, n, t) { return (n.y - e.y) * (t.x - n.x) - (n.x - e.x) * (t.y - n.y); }
        function N(e, n) { return e.x === n.x && e.y === n.y; }
        function U(e, n, t, r) {
          var x = v(E(e, n, t)), i = v(E(e, n, r)), u = v(E(t, r, e)), f = v(E(t, r, n));
          return x !== i && u !== f || !(0 !== x || !o(e, t, n)) && (!(0 !== i || !o(e, r, n)) && (!(0 !== u || !o(t, e, r)) && (0 === f ? o(t, n, r) : void 0)));
        }
        function o(e, n, t) {
          return n.x <= Math.max(e.x, t.x) && n.x >= Math.min(e.x, t.x) && n.y <= Math.max(e.y, t.y) && n.y >= Math.min(e.y, t.y);
        }
        function v(e) { return 0 < e ? 1 : e < 0 ? -1 : 0; }
        function _(e, n) {
          return E(e.prev, e, e.next) < 0 ? 0 <= E(e, n, e.next) && 0 <= E(e, e.prev, n) : E(e, n, e.prev) < 0 || E(e, e.next, n) < 0;
        }
        function j(e, n) {
          var t = new u(e.i, e.x, e.y), r = new u(n.i, n.x, n.y), x = e.next, i = n.prev;
          return (e.next = n).prev = e, (t.next = x).prev = t, (r.next = t).prev = r, (i.next = r).prev = i, r;
        }
        function f(e, n, t, r) {
          e = new u(e, n, t);
          return r ? (e.next = r.next, (e.prev = r).next.prev = e, r.next = e) : (e.prev = e).next = e, e;
        }
        function C(e) {
          e.next.prev = e.prev;
          e.prev.next = e.next;
          e.prevZ && (e.prevZ.nextZ = e.nextZ);
          e.nextZ && (e.nextZ.prevZ = e.prevZ);
        }
        function u(e, n, t) {
          this.i = e; this.x = n; this.y = t;
          this.prev = null; this.next = null; this.z = 0;
          this.prevZ = null; this.nextZ = null; this.steiner = !1;
        }
        function d(e, n, t, r) {
          for (var x = 0, i = n, u = t - r; i < t; i += r) x += (e[u] - e[i]) * (e[i + 1] + e[u + 1]), u = i;
          return x;
        }
        n.exports = r;
      }, {}]
    }, {}, [1])(1);
  })();

  function signedArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a * 0.5;
  }

  function ensureCCW(pts) {
    if (signedArea(pts) < 0) return pts.slice().reverse();
    return pts;
  }

  function ensureCW(pts) {
    if (signedArea(pts) > 0) return pts.slice().reverse();
    return pts;
  }

  function circlePts(cx, cy, r, segs, cw) {
    const out = [];
    const n = Math.max(8, segs || 24);
    for (let i = 0; i < n; i++) {
      const t = (cw ? -1 : 1) * (i / n) * Math.PI * 2;
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

  function defaultCord(half) {
    const tipY = half ? half[half.length - 1].y : 148;
    return { x: 13, y: tipY - 6, r: 1.4 };
  }

  function halfToOutline(half) {
    const left = [];
    for (let i = half.length - 1; i >= 0; i--) {
      left.push({ x: -half[i].x, y: half[i].y });
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

  function flattenForEarcut(outer, holeLoops) {
    const coords = [];
    const holeIdx = [];
    const outerCCW = ensureCCW(outer);
    outerCCW.forEach(function (p) { coords.push(p.x, p.y); });
    const holesCW = holeLoops.map(function (loop) {
      const cw = ensureCW(loop);
      holeIdx.push(coords.length / 2);
      cw.forEach(function (p) { coords.push(p.x, p.y); });
      return cw;
    });
    return { coords: coords, holeIdx: holeIdx, outer: outerCCW, holes: holesCW };
  }

  function extrudeShape(outer, holes, z0, z1, meshSegs) {
    const segs = meshSegs != null ? meshSegs : 32;
    const holeLoops = holes.map(function (h) {
      return circlePts(h.x, h.y, h.r, h.segs || segs, true);
    });
    const flat = flattenForEarcut(outer, holeLoops);
    const indices = earcut(flat.coords, flat.holeIdx, 2);
    if (!indices.length) return new Float32Array(0);

    const pos = [];
    const coords = flat.coords;
    function vx(i) { return { x: coords[i * 2], y: coords[i * 2 + 1] }; }
    function pushTri(i0, i1, i2, z) {
      const a = vx(i0), b = vx(i1), c = vx(i2);
      pos.push(a.x, a.y, z, b.x, b.y, z, c.x, c.y, z);
    }
    function wallQuad(a, b, zA, zB) {
      pos.push(a.x, a.y, zA, b.x, b.y, zA, b.x, b.y, zB);
      pos.push(a.x, a.y, zA, b.x, b.y, zB, a.x, a.y, zB);
    }

    for (let i = 0; i < indices.length; i += 3) {
      pushTri(indices[i], indices[i + 1], indices[i + 2], z1);
    }
    for (let i = 0; i < indices.length; i += 3) {
      pushTri(indices[i], indices[i + 2], indices[i + 1], z0);
    }

    const outerLoop = flat.outer;
    for (let i = 0; i < outerLoop.length; i++) {
      const A = outerLoop[i], B = outerLoop[(i + 1) % outerLoop.length];
      wallQuad(A, B, z0, z1);
    }

    flat.holes.forEach(function (loop) {
      for (let i = 0; i < loop.length; i++) {
        const A = loop[i], B = loop[(i + 1) % loop.length];
        wallQuad(B, A, z0, z1);
      }
    });

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

  function collectHoles(opts, half) {
    const holes = (opts.holes || defaultHoles()).slice();
    const pivotR = opts.pivotR != null ? opts.pivotR : 5.5;
    const meshSegs = opts.meshSegs != null ? opts.meshSegs : 32;
    const cord = opts.cord || defaultCord(half);
    const tipY = half[half.length - 1].y;
    const pivotSegs = Math.max(meshSegs + 12, 40);
    holes.push({ x: 0, y: Math.max(6, half[1].y * 0.5), r: pivotR, segs: pivotSegs });
    if (cord && opts.cordRight !== false) {
      holes.push({ x: cord.x, y: cord.y != null ? cord.y : tipY - 6, r: cord.r, segs: meshSegs });
    }
    if (cord && opts.cordLeft) {
      holes.push({ x: -cord.x, y: cord.y != null ? cord.y : tipY - 6, r: cord.r, segs: meshSegs });
    }
    return { holes: holes, pivotR: pivotR, meshSegs: meshSegs };
  }

  function buildModuleParts(opts) {
    const half = opts.half || defaultHalfProfile();
    const thick = opts.thick != null ? opts.thick : 1.2;
    const spineW = opts.spineW != null ? opts.spineW : 4.2;
    const withSpine = opts.withSpine !== false;
    const outer = halfToOutline(half);
    const holeData = collectHoles(opts, half);
    const segs = holeData.meshSegs;
    const blade = extrudeShape(outer, holeData.holes, 0, thick, segs);
    const parts = { blade: blade, spine: null };

    if (withSpine && spineW > 0.5) {
      const sp = spineOutline(half, spineW);
      const spHoles = [{
        x: 0,
        y: Math.max(6, half[1].y * 0.5),
        r: holeData.pivotR * 0.55,
        segs: Math.max(segs - 4, 20)
      }];
      parts.spine = extrudeShape(sp, spHoles, 0, thick + 0.12, segs);
    }
    return parts;
  }

  function buildModuleMesh(opts) {
    const parts = buildModuleParts(opts);
    const arrays = [parts.blade];
    if (parts.spine) arrays.push(parts.spine);
    return mergePositions(arrays);
  }

  function transformParts(parts, fn) {
    return {
      blade: fn(parts.blade),
      spine: parts.spine ? fn(parts.spine) : null
    };
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

  function buildFanParts(opts) {
    const count = Math.max(2, opts.count || 12);
    const spread = (opts.spreadDeg != null ? opts.spreadDeg : 140) * Math.PI / 180;
    const open = Math.max(0, Math.min(1, opts.open != null ? opts.open : 0.65));
    const stackGap = opts.stackGap != null ? opts.stackGap : 0.32;
    const module = buildModuleParts(opts);
    const staves = [];
    const pivotX = 0, pivotY = 0;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const ang = (-spread * 0.5 + spread * t) * open;
      const zOff = (1 - open) * i * stackGap;
      staves.push(transformParts(module, function (pos) {
        let m = rotateZ(pos, ang, pivotX, pivotY);
        return translate(m, 0, 0, zOff);
      }));
    }
    return staves;
  }

  return {
    defaultHalfProfile: defaultHalfProfile,
    defaultHoles: defaultHoles,
    defaultCord: defaultCord,
    halfToOutline: halfToOutline,
    buildModuleMesh: buildModuleMesh,
    buildModuleParts: buildModuleParts,
    buildFanMeshes: buildFanMeshes,
    buildFanParts: buildFanParts,
    mergePositions: mergePositions,
    stlBinary: stlBinary,
    circlePts: circlePts
  };
})();
