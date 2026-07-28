/* VENTOLINO · wind spinner laser geometry */
'use strict';

window.VENTOLINO = (function () {
  var TAU = Math.PI * 2;
  var EPS = 1e-6;

  function clonePts(pts) {
    return pts.map(function (p) { return { x: p.x, y: p.y }; });
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function centroid(pts) {
    var sx = 0, sy = 0, n = pts.length;
    if (!n) return { x: 0, y: 0 };
    for (var i = 0; i < n; i++) { sx += pts[i].x; sy += pts[i].y; }
    return { x: sx / n, y: sy / n };
  }

  function bbox(pts) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  function perimeter(pts) {
    var L = 0;
    for (var i = 0; i < pts.length; i++) {
      L += dist(pts[i], pts[(i + 1) % pts.length]);
    }
    return L;
  }

  function area(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a * 0.5;
  }

  function ensureCCW(pts) {
    if (area(pts) < 0) return pts.slice().reverse();
    return pts;
  }

  function closePath(pts) {
    if (pts.length < 2) return pts;
    var a = pts[0], b = pts[pts.length - 1];
    if (dist(a, b) > 0.01) pts = pts.concat([{ x: a.x, y: a.y }]);
    return pts;
  }

  function makeCircle(cx, cy, r, segs) {
    segs = Math.max(16, segs | 0);
    var pts = [];
    for (var i = 0; i < segs; i++) {
      var a = (i / segs) * TAU;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return ensureCCW(pts);
  }

  function makeRect(cx, cy, w, h, cornerR, segs) {
    segs = Math.max(4, segs | 0);
    cornerR = Math.max(0, Math.min(cornerR || 0, Math.min(w, h) * 0.49));
    var hw = w / 2, hh = h / 2;
    if (cornerR < 0.2) {
      return ensureCCW([
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh }
      ]);
    }
    var pts = [];
    var corners = [
      { x: cx + hw - cornerR, y: cy - hh + cornerR, a0: -Math.PI / 2, a1: 0 },
      { x: cx + hw - cornerR, y: cy + hh - cornerR, a0: 0, a1: Math.PI / 2 },
      { x: cx - hw + cornerR, y: cy + hh - cornerR, a0: Math.PI / 2, a1: Math.PI },
      { x: cx - hw + cornerR, y: cy - hh + cornerR, a0: Math.PI, a1: Math.PI * 1.5 }
    ];
    for (var c = 0; c < 4; c++) {
      var co = corners[c];
      for (var i = 0; i <= segs; i++) {
        var t = i / segs;
        var a = co.a0 + (co.a1 - co.a0) * t;
        pts.push({ x: co.x + cornerR * Math.cos(a), y: co.y + cornerR * Math.sin(a) });
      }
    }
    return ensureCCW(pts);
  }

  /** Scalloped flower circle like the reference (lobes around a circle). */
  function makeScallop(cx, cy, r, lobes, depth, segs) {
    lobes = Math.max(3, lobes | 0);
    depth = Math.max(0, Math.min(0.45, depth == null ? 0.12 : depth));
    segs = Math.max(lobes * 8, segs | 0);
    var pts = [];
    for (var i = 0; i < segs; i++) {
      var a = (i / segs) * TAU;
      var wave = Math.cos(a * lobes);
      var rr = r * (1 - depth * 0.5 + depth * depth * 0.5);
      pts.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
    }
    return ensureCCW(pts);
  }

  function subdivide(pts, steps) {
    steps = Math.max(0, steps | 0);
    var out = clonePts(pts);
    for (var s = 0; s < steps; s++) {
      var next = [];
      for (var i = 0; i < out.length; i++) {
        var a = out[i], b = out[(i + 1) % out.length];
        next.push({ x: a.x, y: a.y });
        next.push(lerp(a, b, 0.5));
      }
      // Chaikin-ish smooth
      var smooth = [];
      for (var j = 0; j < next.length; j++) {
        var p0 = next[(j - 1 + next.length) % next.length];
        var p1 = next[j];
        var p2 = next[(j + 1) % next.length];
        smooth.push({
          x: p0.x * 0.25 + p1.x * 0.5 + p2.x * 0.25,
          y: p0.y * 0.25 + p1.y * 0.5 + p2.y * 0.25
        });
      }
      out = smooth;
    }
    return ensureCCW(out);
  }

  /** Ramer–Douglas–Peucker simplify for closed paths. */
  function simplify(pts, tol) {
    if (pts.length < 4) return clonePts(pts);
    tol = tol == null ? 0.35 : tol;
    var open = pts.slice();
    if (dist(open[0], open[open.length - 1]) < tol) open.pop();

    function rdp(points, eps) {
      if (points.length < 3) return points;
      var dmax = 0, idx = 0;
      var first = points[0], last = points[points.length - 1];
      for (var i = 1; i < points.length - 1; i++) {
        var d = pointLineDist(points[i], first, last);
        if (d > dmax) { dmax = d; idx = i; }
      }
      if (dmax > eps) {
        var left = rdp(points.slice(0, idx + 1), eps);
        var right = rdp(points.slice(idx), eps);
        return left.slice(0, -1).concat(right);
      }
      return [first, last];
    }

    var simplified = rdp(open, tol);
    if (simplified.length < 3) return clonePts(pts);
    return ensureCCW(simplified);
  }

  function pointLineDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    if (len2 < EPS) return dist(p, a);
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function normals(pts) {
    var n = pts.length;
    var out = [];
    for (var i = 0; i < n; i++) {
      var prev = pts[(i - 1 + n) % n];
      var next = pts[(i + 1) % n];
      var tx = next.x - prev.x, ty = next.y - prev.y;
      var L = Math.hypot(tx, ty) || 1;
      // inward normal for CCW: rotate tangent +90 → left = inward for CCW? 
      // CCW boundary: left of travel is interior → normal (-ty, tx) points inward? 
      // Travel along edge: for CCW, interior is to the left → (-ty, tx) / L
      out.push({ x: -ty / L, y: tx / L });
    }
    return out;
  }

  /**
   * Inward offset by delta (mm). Positive delta = shrink.
   * Uses averaged normals; best for near-convex / scalloped shapes.
   */
  function offsetInward(pts, delta) {
    if (!pts || pts.length < 3 || delta <= 0) return clonePts(pts || []);
    pts = ensureCCW(pts);
    var ns = normals(pts);
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      out.push({
        x: pts[i].x + ns[i].x * delta,
        y: pts[i].y + ns[i].y * delta
      });
    }
    // Reject if area collapsed or reversed
    if (Math.abs(area(out)) < Math.abs(area(pts)) * 0.02) return null;
    if (area(out) <= 0) return null;
    return ensureCCW(out);
  }

  function angleOf(p, c) {
    return Math.atan2(p.y - c.y, p.x - c.x);
  }

  function normAngle(a) {
    while (a <= -Math.PI) a += TAU;
    while (a > Math.PI) a -= TAU;
    return a;
  }

  function angDist(a, b) {
    return Math.abs(normAngle(a - b));
  }

  /**
   * Split a closed ring into open arcs leaving bridges at axis and axis+PI.
   * bridgeMm is arc length along the path (approx via radius).
   * Returns array of open polylines (cut paths).
   */
  function cutWithBridges(pts, axisDeg, bridgeMm) {
    if (!pts || pts.length < 4) return [];
    var c = centroid(pts);
    var bb = bbox(pts);
    var rApprox = Math.max(bb.w, bb.h) * 0.5;
    var halfBridgeAng = bridgeMm / Math.max(rApprox, 1);
    halfBridgeAng = Math.max(0.02, Math.min(0.45, halfBridgeAng));
    var axis = (axisDeg * Math.PI) / 180;

    var tagged = pts.map(function (p, i) {
      return { p: p, i: i, a: angleOf(p, c) };
    });

    function inBridge(a) {
      return angDist(a, axis) < halfBridgeAng || angDist(a, axis + Math.PI) < halfBridgeAng;
    }

    var arcs = [];
    var cur = [];
    for (var i = 0; i < tagged.length; i++) {
      var t = tagged[i];
      if (inBridge(t.a)) {
        if (cur.length >= 2) arcs.push(cur);
        cur = [];
      } else {
        cur.push({ x: t.p.x, y: t.p.y });
      }
    }
    if (cur.length >= 2) arcs.push(cur);

    // Merge first/last if both open and path wraps (not across bridge)
    if (arcs.length >= 2) {
      var first = arcs[0], last = arcs[arcs.length - 1];
      var a0 = angleOf(first[0], c);
      var a1 = angleOf(last[last.length - 1], c);
      if (!inBridge(a0) && !inBridge(a1) && angDist(a0, a1) < 0.35) {
        arcs[0] = last.concat(first);
        arcs.pop();
      }
    }
    return arcs.filter(function (a) { return a.length >= 2; });
  }

  /**
   * Build full spinner cut model.
   * params: {
   *   outer, sizeMm, ringHeight, kerf, ringCount OR ringStep,
   *   axisDeg, bridgeMm, hangHoleMm, centerPaths, centerInset
   * }
   */
  function buildModel(params) {
    var warnings = [];
    var errors = [];
    var outer = ensureCCW(clonePts(params.outer || []));
    if (outer.length < 3) {
      return { ok: false, errors: ['Forma esterna non valida'], warnings: [], rings: [], cuts: [], outer: [], hang: null };
    }

    var ringH = Math.max(0.8, params.ringHeight || 4);
    var kerf = Math.max(0, params.kerf == null ? 0.15 : params.kerf);
    var step = ringH + kerf;
    var axisDeg = params.axisDeg == null ? 90 : params.axisDeg;
    var bridgeMm = Math.max(1.2, params.bridgeMm || 3);
    var hangHoleMm = Math.max(0, params.hangHoleMm == null ? 3 : params.hangHoleMm);
    var maxRings = params.ringCount != null ? Math.max(1, params.ringCount | 0) : 12;

    // Scale outer to sizeMm (bounding box max dimension)
    var bb0 = bbox(outer);
    var span = Math.max(bb0.w, bb0.h) || 1;
    var sizeMm = params.sizeMm || 200;
    var scale = sizeMm / span;
    var c0 = centroid(outer);
    outer = outer.map(function (p) {
      return { x: (p.x - c0.x) * scale, y: (p.y - c0.y) * scale };
    });

    if (ringH < 1.5) warnings.push('Altezza riga < 1.5 mm: fragile su alluminio sottile');
    if (bridgeMm < 1.5) errors.push('Ponticello troppo stretto (< 1.5 mm)');
    if (bridgeMm > ringH * 8) warnings.push('Ponticello molto largo rispetto alla riga');

    var rings = [clonePts(outer)];
    var cuts = []; // each: { kind, paths: [[pt]] }

    // Outer silhouette is always a full closed cut
    cuts.push({ kind: 'outer', closed: true, paths: [clonePts(outer)] });

    var prev = outer;
    for (var i = 1; i <= maxRings; i++) {
      var inset = offsetInward(prev, step);
      if (!inset || inset.length < 3) {
        warnings.push('Offset collassato dopo ' + (i - 1) + ' anelli');
        break;
      }
      var ar = Math.abs(area(inset));
      var apr = Math.abs(area(prev));
      if (ar < 80) {
        warnings.push('Anello interno troppo piccolo — stop a ' + (i - 1));
        break;
      }
      if (ar / apr < 0.15) {
        warnings.push('Anello degenera — stop');
        break;
      }
      // Self-intersection heuristic: perimeter vs area
      var per = perimeter(inset);
      var rEq = Math.sqrt(ar / Math.PI);
      if (per > rEq * TAU * 2.8) {
        errors.push('Possibile auto-intersezione all\'anello ' + i);
        break;
      }
      rings.push(inset);
      var arcs = cutWithBridges(inset, axisDeg, bridgeMm);
      if (!arcs.length) {
        errors.push('Ponticelli eliminano tutto il taglio all\'anello ' + i + ' — riduci larghezza ponticello');
        break;
      }
      cuts.push({ kind: 'ring', closed: false, index: i, paths: arcs });
      prev = inset;
    }

    if (rings.length < 2) errors.push('Serve almeno 1 anello concentrico valido');

    // Hang hole on outer ring at axis (top)
    var hang = null;
    if (hangHoleMm > 0) {
      var axis = (axisDeg * Math.PI) / 180;
      var bb = bbox(outer);
      var R = Math.max(bb.w, bb.h) * 0.5;
      var hr = hangHoleMm / 2;
      var hx = Math.cos(axis) * (R - ringH * 0.55);
      var hy = Math.sin(axis) * (R - ringH * 0.55);
      hang = makeCircle(hx, hy, hr, 24);
      cuts.push({ kind: 'hang', closed: true, paths: [hang] });
    }

    // Center artwork
    var centerCuts = [];
    var centerPaths = params.centerPaths || [];
    var innermost = rings[rings.length - 1];
    var ib = bbox(innermost);
    var iC = centroid(innermost);
    var iR = Math.min(ib.w, ib.h) * 0.5 * 0.88;
    if (centerPaths.length) {
      var fitted = fitPathsInCircle(centerPaths, iC, iR * (params.centerScale || 0.92));
      // Support stems to inner ring if floating
      var stems = connectToRing(fitted, innermost, iC, 3);
      fitted = fitted.concat(stems);
      centerCuts = fitted;
      cuts.push({ kind: 'center', closed: false, paths: fitted });
    }

    var ok = errors.length === 0 && rings.length >= 2;
    return {
      ok: ok,
      errors: errors,
      warnings: warnings,
      outer: outer,
      rings: rings,
      cuts: cuts,
      hang: hang,
      centerCuts: centerCuts,
      params: {
        ringHeight: ringH,
        kerf: kerf,
        step: step,
        axisDeg: axisDeg,
        bridgeMm: bridgeMm,
        sizeMm: sizeMm,
        ringCount: rings.length - 1
      }
    };
  }

  function fitPathsInCircle(paths, center, radius) {
    var all = [];
    paths.forEach(function (path) { all = all.concat(path); });
    if (!all.length) return [];
    var b = bbox(all);
    var span = Math.max(b.w, b.h) || 1;
    var sc = (radius * 2) / span;
    var cx = (b.minX + b.maxX) / 2;
    var cy = (b.minY + b.maxY) / 2;
    return paths.map(function (path) {
      return path.map(function (p) {
        return {
          x: center.x + (p.x - cx) * sc,
          y: center.y + (p.y - cy) * sc
        };
      });
    });
  }

  function connectToRing(paths, ring, center, nStems) {
    if (!paths.length || !ring.length) return [];
    var pts = [];
    paths.forEach(function (path) { pts = pts.concat(path); });
    if (!pts.length) return [];
    nStems = Math.max(2, nStems | 0);
    var stems = [];
    for (var i = 0; i < nStems; i++) {
      var a = (i / nStems) * TAU + Math.PI / 2;
      // farthest artwork point near this angle
      var best = pts[0], bestScore = -Infinity;
      for (var j = 0; j < pts.length; j++) {
        var ang = angleOf(pts[j], center);
        var score = -angDist(ang, a) * 10 + dist(pts[j], center);
        if (score > bestScore) { bestScore = score; best = pts[j]; }
      }
      // nearest ring point
      var rBest = ring[0], rd = Infinity;
      for (var k = 0; k < ring.length; k++) {
        var d = dist(ring[k], best);
        if (d < rd) { rd = d; rBest = ring[k]; }
      }
      if (rd > 0.5) stems.push([best, rBest]);
    }
    return stems;
  }

  /** Trace thresholded bitmap (ImageData) → open/closed polylines in pixel coords. */
  function traceBitmap(imageData, opts) {
    opts = opts || {};
    var thr = opts.threshold == null ? 128 : opts.threshold;
    var invert = !!opts.invert;
    var w = imageData.width, h = imageData.height;
    var data = imageData.data;
    var grid = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        var on = invert ? g > thr : g < thr;
        grid[y * w + x] = on ? 1 : 0;
      }
    }
    // Edge pixels: on with off neighbor
    var edges = [];
    for (var yy = 1; yy < h - 1; yy++) {
      for (var xx = 1; xx < w - 1; xx++) {
        if (!grid[yy * w + xx]) continue;
        if (!grid[yy * w + xx - 1] || !grid[yy * w + xx + 1] ||
            !grid[(yy - 1) * w + xx] || !grid[(yy + 1) * w + xx]) {
          edges.push({ x: xx, y: yy });
        }
      }
    }
    // Greedy chain
    var used = new Uint8Array(w * h);
    var paths = [];
    var dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

    function key(x, y) { return y * w + x; }

    edges.forEach(function (seed) {
      if (used[key(seed.x, seed.y)]) return;
      var path = [];
      var cx = seed.x, cy = seed.y;
      for (var step = 0; step < 20000; step++) {
        var k = key(cx, cy);
        if (used[k]) break;
        used[k] = 1;
        path.push({ x: cx, y: cy });
        var found = false;
        for (var d = 0; d < 8; d++) {
          var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (!grid[ny * w + nx]) continue;
          // must be edge-ish
          var edge = !grid[ny * w + nx - 1] || !grid[ny * w + nx + 1] ||
            !grid[(ny - 1) * w + nx] || !grid[(ny + 1) * w + nx];
          if (!edge) continue;
          if (used[key(nx, ny)]) continue;
          cx = nx; cy = ny; found = true; break;
        }
        if (!found) break;
      }
      if (path.length >= 8) {
        paths.push(simplify(path, opts.simplify == null ? 1.2 : opts.simplify));
      }
    });
    // Keep largest paths
    paths.sort(function (a, b) { return b.length - a.length; });
    return paths.slice(0, opts.maxPaths || 24);
  }

  /** Convert freehand stroke polylines to slightly thickened centerlines (for laser). */
  function strokesToPaths(strokes, simplifyTol) {
    return (strokes || []).map(function (s) {
      return simplify(s, simplifyTol == null ? 0.8 : simplifyTol);
    }).filter(function (s) { return s.length >= 2; });
  }

  function pathToSvgD(pts, closed) {
    if (!pts || !pts.length) return '';
    var d = 'M ' + pts[0].x.toFixed(3) + ' ' + pts[0].y.toFixed(3);
    for (var i = 1; i < pts.length; i++) {
      d += ' L ' + pts[i].x.toFixed(3) + ' ' + pts[i].y.toFixed(3);
    }
    if (closed) d += ' Z';
    return d;
  }

  function modelToSVG(model, meta) {
    meta = meta || {};
    if (!model || !model.outer) return '';
    var bb = bbox(model.outer);
    var pad = 5;
    var minX = bb.minX - pad, minY = bb.minY - pad;
    var w = bb.w + pad * 2, h = bb.h + pad * 2;
    // Shift to positive viewBox
    function sh(pts) {
      return pts.map(function (p) { return { x: p.x - minX, y: p.y - minY }; });
    }
    var parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w.toFixed(2) + 'mm" height="' + h.toFixed(2) + 'mm" viewBox="0 0 ' + w.toFixed(3) + ' ' + h.toFixed(3) + '">');
    parts.push('<title>VENTOLINO · ' + (meta.title || 'laser') + '</title>');
    parts.push('<desc>kerf=' + (model.params && model.params.kerf) + ' ringH=' + (model.params && model.params.ringHeight) + ' bridges=' + (model.params && model.params.bridgeMm) + 'mm</desc>');
    parts.push('<g fill="none" stroke="#000000" stroke-width="0.1" stroke-linecap="round" stroke-linejoin="round">');
    (model.cuts || []).forEach(function (cut) {
      (cut.paths || []).forEach(function (path) {
        var closed = !!cut.closed && cut.kind !== 'center';
        // hang and outer are closed
        if (cut.kind === 'hang' || cut.kind === 'outer') closed = true;
        if (cut.kind === 'ring' || cut.kind === 'center') closed = false;
        parts.push('<path d="' + pathToSvgD(sh(path), closed) + '"/>');
      });
    });
    parts.push('</g></svg>');
    return parts.join('\n');
  }

  /**
   * Minimal PDF 1.4 with vector paths (mm → points). No external deps.
   * Coordinate: PDF y-up; we flip.
   */
  function modelToPDF(model, meta) {
    meta = meta || {};
    if (!model || !model.outer) return null;
    var bb = bbox(model.outer);
    var pad = 8;
    var wMm = bb.w + pad * 2;
    var hMm = bb.h + pad * 2;
    var minX = bb.minX - pad;
    var minY = bb.minY - pad;
    // 1 mm = 72/25.4 pt
    var k = 72 / 25.4;
    var W = wMm * k;
    var H = hMm * k;

    function tx(x, y) {
      return {
        x: (x - minX) * k,
        y: H - (y - minY) * k
      };
    }

    var ops = [];
    ops.push('0.3 w');
    ops.push('0 0 0 RG');
    (model.cuts || []).forEach(function (cut) {
      (cut.paths || []).forEach(function (path) {
        if (!path.length) return;
        var closed = cut.kind === 'outer' || cut.kind === 'hang';
        var p0 = tx(path[0].x, path[0].y);
        ops.push(p0.x.toFixed(2) + ' ' + p0.y.toFixed(2) + ' m');
        for (var i = 1; i < path.length; i++) {
          var p = tx(path[i].x, path[i].y);
          ops.push(p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ' l');
        }
        if (closed) ops.push('h');
        ops.push('S');
      });
    });
    // Label
    ops.push('BT /F1 7 Tf 12 ' + (H - 14).toFixed(1) + ' Td (VENTOLINO laser · ' + (meta.title || '') + ') Tj ET');

    var stream = ops.join('\n');
    var objs = [];
    function add(s) { objs.push(s); return objs.length; }

    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2) + '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

    var pdf = '%PDF-1.4\n';
    var xref = [0];
    for (var i = 0; i < objs.length; i++) {
      xref.push(pdf.length);
      pdf += (i + 1) + ' 0 obj\n' + objs[i] + '\nendobj\n';
    }
    var xrefPos = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n';
    pdf += '0000000000 65535 f \n';
    for (var j = 1; j < xref.length; j++) {
      pdf += ('0000000000' + xref[j]).slice(-10) + ' 00000 n \n';
    }
    pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\n';
    pdf += 'startxref\n' + xrefPos + '\n%%EOF';
    return pdf;
  }

  /** Build ribbon bands for 3D preview: { rings, axisDeg, open01, thickness } */
  function buildBands(model, open01, thickness) {
    if (!model || !model.rings || model.rings.length < 2) return [];
    open01 = Math.max(0, Math.min(1, open01 == null ? 0.55 : open01));
    thickness = thickness || 0.6;
    var axis = ((model.params && model.params.axisDeg) || 90) * Math.PI / 180;
    var ax = Math.cos(axis), ay = Math.sin(axis);
    // Rotation axis through origin along (ax,ay) in 2D → 3D axis (-ay, ax, 0)? 
    // Twist around vertical in spinner terms = around vector through bridges.
    // Bridges at ±axis direction from center → twist axis is perpendicular in plane... 
    // Actually for wind spinner, you twist rings around the diameter through the bridges.
    // Bridge axis direction from center is `axis`; the rotation axis is that diameter:
    // 3D axis = (ax, ay, 0).
    var bands = [];
    for (var i = 0; i < model.rings.length - 1; i++) {
      var outerR = model.rings[i];
      var innerR = model.rings[i + 1];
      var rot = (i + 1) * open01 * (Math.PI / 2.2);
      bands.push({
        outer: outerR,
        inner: innerR,
        rot: rot,
        axis: { x: ax, y: ay, z: 0 },
        thickness: thickness
      });
    }
    return bands;
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function downloadPdf(filename, pdfString) {
    var arr = new Uint8Array(pdfString.length);
    for (var i = 0; i < pdfString.length; i++) arr[i] = pdfString.charCodeAt(i) & 0xff;
    var blob = new Blob([arr], { type: 'application/pdf' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  return {
    makeCircle: makeCircle,
    makeRect: makeRect,
    makeScallop: makeScallop,
    subdivide: subdivide,
    simplify: simplify,
    offsetInward: offsetInward,
    cutWithBridges: cutWithBridges,
    buildModel: buildModel,
    traceBitmap: traceBitmap,
    strokesToPaths: strokesToPaths,
    modelToSVG: modelToSVG,
    modelToPDF: modelToPDF,
    buildBands: buildBands,
    bbox: bbox,
    centroid: centroid,
    clonePts: clonePts,
    downloadText: downloadText,
    downloadPdf: downloadPdf,
    pathToSvgD: pathToSvgD
  };
})();
