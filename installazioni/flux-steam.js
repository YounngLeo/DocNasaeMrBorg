/* Divisione flusso — metaball scolpibile · testa drago · vapore WebGL (stile Zelda) */
(function () {
  var canvas = document.getElementById('fl-canvas');
  if (!canvas) return;

  var GRID_W = 128;
  var GRID_H = 96;
  var ISO = 0.44;
  var MAX_PART = 720;

  var cfg = {
    steam: 55,
    running: true,
    brush: 'remove',
    brushR: 14,
    brushStr: 0.22
  };

  var W = 480;
  var H = 360;
  var CX = 240;
  var CY = 187;
  var field = new Float32Array(GRID_W * GRID_H);
  var gridDirty = true;
  var particles = [];
  var stats = { bounce: 0, escaped: 0, inside: 0 };
  var emitter = { x: 0, y: 0, mouth: [] };
  var raf = null;
  var sculpting = false;

  var gl = null;
  var progParticle = null;
  var progLine = null;
  var bufParticle = null;
  var bufLine = null;
  var uParticle = {};
  var contourLines = [];
  var useWebGL = false;

  var DRAGON_BLOBS = [
    { x: 0.50, y: 0.36, rx: 0.13, ry: 0.12, a: 1.0 },
    { x: 0.50, y: 0.48, rx: 0.11, ry: 0.09, a: 0.92 },
    { x: 0.50, y: 0.58, rx: 0.13, ry: 0.07, a: 0.88 },
    { x: 0.42, y: 0.30, rx: 0.05, ry: 0.11, a: 0.75 },
    { x: 0.58, y: 0.30, rx: 0.05, ry: 0.11, a: 0.75 },
    { x: 0.36, y: 0.40, rx: 0.06, ry: 0.06, a: 0.55 },
    { x: 0.64, y: 0.40, rx: 0.06, ry: 0.06, a: 0.55 },
    { x: 0.50, y: 0.68, rx: 0.16, ry: 0.08, a: 0.65 }
  ];

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function gridIdx(gx, gy) {
    return gy * GRID_W + gx;
  }

  function clearField() {
    field.fill(0);
    gridDirty = true;
  }

  function addBlob(nx, ny, nrx, nry, amount) {
    var cx = nx * GRID_W;
    var cy = ny * GRID_H;
    var rx = nrx * GRID_W * 1.15;
    var ry = nry * GRID_H * 1.15;
    var x0 = Math.max(0, Math.floor(cx - rx * 2));
    var x1 = Math.min(GRID_W - 1, Math.ceil(cx + rx * 2));
    var y0 = Math.max(0, Math.floor(cy - ry * 2));
    var y1 = Math.min(GRID_H - 1, Math.ceil(cy + ry * 2));
    for (var gy = y0; gy <= y1; gy++) {
      for (var gx = x0; gx <= x1; gx++) {
        var dx = (gx - cx) / rx;
        var dy = (gy - cy) / ry;
        var d2 = dx * dx + dy * dy;
        if (d2 > 4) continue;
        var v = amount * Math.exp(-d2 * 1.35);
        var i = gridIdx(gx, gy);
        field[i] = Math.min(1.35, field[i] + v);
      }
    }
    gridDirty = true;
  }

  function seedDragonDivider() {
    clearField();
    DRAGON_BLOBS.forEach(function (b) {
      addBlob(b.x, b.y, b.rx, b.ry, b.a);
    });
  }

  function pixelToGrid(px, py) {
    return {
      gx: clamp(px / W * GRID_W, 0, GRID_W - 1),
      gy: clamp(py / H * GRID_H, 0, GRID_H - 1)
    };
  }

  function sampleField(px, py) {
    var g = pixelToGrid(px, py);
    var x = g.gx;
    var y = g.gy;
    var x0 = Math.floor(x);
    var y0 = Math.floor(y);
    var x1 = Math.min(GRID_W - 1, x0 + 1);
    var y1 = Math.min(GRID_H - 1, y0 + 1);
    var tx = x - x0;
    var ty = y - y0;
    var a = field[gridIdx(x0, y0)];
    var b = field[gridIdx(x1, y0)];
    var c = field[gridIdx(x0, y1)];
    var d = field[gridIdx(x1, y1)];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  function fieldGradient(px, py) {
    var e = 2.2;
    var f = sampleField(px, py);
    var gx = sampleField(px + e, py) - sampleField(px - e, py);
    var gy = sampleField(px, py + e) - sampleField(px, py - e);
    var len = Math.sqrt(gx * gx + gy * gy) || 1;
    return { gx: gx / len, gy: gy / len, f: f };
  }

  function sculptAt(px, py) {
    var g = pixelToGrid(px, py);
    var cx = g.gx;
    var cy = g.gy;
    var r = cfg.brushR * (GRID_W / W);
    var x0 = Math.max(0, Math.floor(cx - r));
    var x1 = Math.min(GRID_W - 1, Math.ceil(cx + r));
    var y0 = Math.max(0, Math.floor(cy - r));
    var y1 = Math.min(GRID_H - 1, Math.ceil(cy + r));
    var add = cfg.brush === 'add';
    for (var gy = y0; gy <= y1; gy++) {
      for (var gx = x0; gx <= x1; gx++) {
        var dx = gx - cx;
        var dy = gy - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        var t = 1 - d / r;
        var w = t * t * cfg.brushStr;
        var i = gridIdx(gx, gy);
        if (add) field[i] = Math.min(1.4, field[i] + w);
        else field[i] = Math.max(0, field[i] - w * 1.15);
      }
    }
    gridDirty = true;
  }

  /* ── Marching squares (contorno metaball) ─────────────────── */
  function lerpIso(x1, y1, v1, x2, y2, v2, iso) {
    var t = (iso - v1) / (v2 - v1 + 1e-6);
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  }

  function buildContours(iso) {
    var segs = [];
    var cellW = W / (GRID_W - 1);
    var cellH = H / (GRID_H - 1);
    function vert(gx, gy) {
      return { x: gx * cellW, y: gy * cellH };
    }
    for (var gy = 0; gy < GRID_H - 1; gy++) {
      for (var gx = 0; gx < GRID_W - 1; gx++) {
        var v0 = field[gridIdx(gx, gy)];
        var v1 = field[gridIdx(gx + 1, gy)];
        var v2 = field[gridIdx(gx + 1, gy + 1)];
        var v3 = field[gridIdx(gx, gy + 1)];
        var idx = 0;
        if (v0 >= iso) idx |= 1;
        if (v1 >= iso) idx |= 2;
        if (v2 >= iso) idx |= 4;
        if (v3 >= iso) idx |= 8;
        if (idx === 0 || idx === 15) continue;
        var p0 = vert(gx, gy);
        var p1 = vert(gx + 1, gy);
        var p2 = vert(gx + 1, gy + 1);
        var p3 = vert(gx, gy + 1);
        var pts = [];
        if ((idx & 1) !== (idx & 2)) pts.push(lerpIso(p0.x, p0.y, v0, p1.x, p1.y, v1, iso));
        if ((idx & 2) !== (idx & 4)) pts.push(lerpIso(p1.x, p1.y, v1, p2.x, p2.y, v2, iso));
        if ((idx & 4) !== (idx & 8)) pts.push(lerpIso(p2.x, p2.y, v2, p3.x, p3.y, v3, iso));
        if ((idx & 8) !== (idx & 1)) pts.push(lerpIso(p3.x, p3.y, v3, p0.x, p0.y, v0, iso));
        for (var i = 0; i + 1 < pts.length; i += 2) {
          segs.push(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        }
      }
    }
    return segs;
  }

  function rebuildContours() {
    var a = buildContours(ISO);
    var b = buildContours(ISO + 0.12);
    contourLines = { outer: a, inner: b };
    gridDirty = false;
  }

  function layoutEmitter() {
    emitter.x = CX;
    emitter.y = H * 0.82;
    emitter.mouth = [
      { x: CX - 14, y: emitter.y - 6 },
      { x: CX, y: emitter.y - 12 },
      { x: CX + 14, y: emitter.y - 6 }
    ];
  }

  function spawnParticle() {
    var m = emitter.mouth[Math.floor(Math.random() * emitter.mouth.length)];
    particles.push({
      x: m.x + (Math.random() - 0.5) * 10,
      y: m.y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 0.55,
      vy: -1.1 - Math.random() * 1.6,
      life: 1,
      heat: 0.85 + Math.random() * 0.15,
      r: 2.2 + Math.random() * 3.5,
      escaped: false
    });
  }

  function collideParticle(p) {
    var g = fieldGradient(p.x, p.y);
    if (g.f < ISO) return;
    var pen = (g.f - ISO) * 28 + 1.5;
    p.x -= g.gx * pen;
    p.y -= g.gy * pen;
    var dot = p.vx * g.gx + p.vy * g.gy;
    if (dot < 0) {
      p.vx -= 1.85 * dot * g.gx;
      p.vy -= 1.85 * dot * g.gy;
      p.vx *= 0.78;
      p.vy *= 0.78;
      stats.bounce++;
    }
    if (g.f < ISO + 0.06 && !p.escaped) {
      p.escaped = true;
      p.vx += (Math.random() - 0.5) * 1.1;
      p.vy += -0.4 - Math.random() * 0.6;
      stats.escaped++;
    }
  }

  function step() {
    if (cfg.running) {
      var rate = Math.round(cfg.steam * 0.14);
      for (var s = 0; s < rate; s++) spawnParticle();
    }
    stats.inside = 0;
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vx += (Math.random() - 0.5) * 0.05;
      p.vy -= 0.012 + (1 - p.heat) * 0.008;
      p.x += p.vx;
      p.y += p.vy;
      collideParticle(p);
      if (!p.escaped && sampleField(p.x, p.y) > ISO * 0.85) stats.inside++;
      p.life -= p.escaped ? 0.005 : 0.0038;
      p.heat *= 0.998;
      if (p.life <= 0 || p.y < -30 || p.x < -40 || p.x > W + 40) particles.splice(i, 1);
    }
    if (particles.length > MAX_PART) particles.splice(0, particles.length - MAX_PART);
    if (gridDirty) rebuildContours();
  }

  /* ── WebGL2 ─────────────────────────────────────────────── */
  function compileShader(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('shader', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  function linkProgram(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('program', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function initWebGL() {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: true, premultipliedAlpha: false });
    if (!gl) return false;

    var vsP = compileShader(gl.VERTEX_SHADER, [
      '#version 300 es',
      'in vec2 aPos;',
      'in float aSize;',
      'in float aAlpha;',
      'in float aHeat;',
      'uniform vec2 uRes;',
      'out float vAlpha;',
      'out float vHeat;',
      'void main(){',
      '  vec2 c = (aPos / uRes) * 2.0 - 1.0;',
      '  c.y = -c.y;',
      '  gl_Position = vec4(c, 0.0, 1.0);',
      '  gl_PointSize = aSize;',
      '  vAlpha = aAlpha;',
      '  vHeat = aHeat;',
      '}'
    ].join('\n'));

    var fsP = compileShader(gl.FRAGMENT_SHADER, [
      '#version 300 es',
      'precision mediump float;',
      'in float vAlpha;',
      'in float vHeat;',
      'out vec4 outColor;',
      'void main(){',
      '  vec2 p = gl_PointCoord - 0.5;',
      '  float r = length(p);',
      '  float core = smoothstep(0.48, 0.0, r);',
      '  float wisp = smoothstep(0.5, 0.08, r);',
      '  float puff = 0.65 + 0.35 * sin(r * 18.0);',
      '  vec3 cool = vec3(0.45, 0.68, 0.82);',
      '  vec3 warm = vec3(0.88, 0.94, 1.0);',
      '  vec3 col = mix(cool, warm, vHeat * core);',
      '  col += vec3(0.12, 0.18, 0.14) * (1.0 - vHeat) * wisp;',
      '  float a = wisp * vAlpha * (0.18 + 0.82 * core) * puff;',
      '  if (a < 0.01) discard;',
      '  outColor = vec4(col, a);',
      '}'
    ].join('\n'));

    var vsL = compileShader(gl.VERTEX_SHADER, [
      '#version 300 es',
      'in vec2 aPos;',
      'uniform vec2 uRes;',
      'void main(){',
      '  vec2 c = (aPos / uRes) * 2.0 - 1.0;',
      '  c.y = -c.y;',
      '  gl_Position = vec4(c, 0.0, 1.0);',
      '}'
    ].join('\n'));

    var fsL = compileShader(gl.FRAGMENT_SHADER, [
      '#version 300 es',
      'precision mediump float;',
      'uniform vec4 uColor;',
      'out vec4 outColor;',
      'void main(){ outColor = uColor; }'
    ].join('\n'));

    if (!vsP || !fsP || !vsL || !fsL) return false;

    progParticle = linkProgram(vsP, fsP);
    progLine = linkProgram(vsL, fsL);
    if (!progParticle || !progLine) return false;

    bufParticle = gl.createBuffer();
    bufLine = gl.createBuffer();
    uParticle = {
      res: gl.getUniformLocation(progParticle, 'uRes')
    };
    useWebGL = true;
    return true;
  }

  function drawLines(segs, rgba, width) {
    if (!segs || segs.length < 4) return;
    gl.useProgram(progLine);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLine);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(segs), gl.DYNAMIC_DRAW);
    var loc = gl.getAttribLocation(progLine, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(progLine, 'uRes'), W, H);
    gl.uniform4f(gl.getUniformLocation(progLine, 'uColor'), rgba[0], rgba[1], rgba[2], rgba[3]);
    gl.lineWidth(width);
    gl.drawArrays(gl.LINES, 0, segs.length / 2);
  }

  function drawWebGL() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.024, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    drawLines(contourLines.inner, [0.28, 0.75, 0.68, 0.22], 1);
    drawLines(contourLines.outer, [0.42, 0.92, 0.88, 0.75], 1.8);

    var dPath = dragonEmitterLines();
    drawLines(dPath.glow, [0.35, 0.85, 0.95, 0.35], 1.2);
    drawLines(dPath.main, [0.55, 0.98, 0.88, 0.9], 2);

    if (!particles.length) return;

    var stride = 5 * 4;
    var data = new Float32Array(particles.length * 5);
    var j = 0;
    particles.forEach(function (p) {
      data[j++] = p.x;
      data[j++] = p.y;
      data[j++] = p.r * (1.4 + p.life * 2.2);
      data[j++] = p.life * (p.escaped ? 0.65 : 0.9);
      data[j++] = p.heat;
    });

    gl.useProgram(progParticle);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufParticle);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    var locPos = gl.getAttribLocation(progParticle, 'aPos');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, stride, 0);
    var locSize = gl.getAttribLocation(progParticle, 'aSize');
    gl.enableVertexAttribArray(locSize);
    gl.vertexAttribPointer(locSize, 1, gl.FLOAT, false, stride, 8);
    var locAlpha = gl.getAttribLocation(progParticle, 'aAlpha');
    gl.enableVertexAttribArray(locAlpha);
    gl.vertexAttribPointer(locAlpha, 1, gl.FLOAT, false, stride, 12);
    var locHeat = gl.getAttribLocation(progParticle, 'aHeat');
    gl.enableVertexAttribArray(locHeat);
    gl.vertexAttribPointer(locHeat, 1, gl.FLOAT, false, stride, 16);

    gl.uniform2f(uParticle.res, W, H);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, particles.length);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /* ── Canvas 2D fallback ───────────────────────────────────── */
  var ctx2d = null;

  function draw2D() {
    ctx2d.fillStyle = '#050608';
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.strokeStyle = 'rgba(74,246,255,0.25)';
    ctx2d.lineWidth = 1;
    var segs = contourLines.outer;
    for (var i = 0; i < segs.length; i += 4) {
      ctx2d.beginPath();
      ctx2d.moveTo(segs[i], segs[i + 1]);
      ctx2d.lineTo(segs[i + 2], segs[i + 3]);
      ctx2d.stroke();
    }
    var d = dragonEmitterLines();
    ctx2d.strokeStyle = 'rgba(94,255,126,0.85)';
    ctx2d.lineWidth = 2;
    strokeSegs2d(d.main);
    particles.forEach(function (p) {
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r * 1.8, 0, Math.PI * 2);
      var a = p.life * 0.5;
      ctx2d.fillStyle = 'rgba(200, 230, 255, ' + a + ')';
      ctx2d.fill();
    });
  }

  function strokeSegs2d(arr) {
    for (var i = 0; i < arr.length; i += 4) {
      ctx2d.beginPath();
      ctx2d.moveTo(arr[i], arr[i + 1]);
      ctx2d.lineTo(arr[i + 2], arr[i + 3]);
      ctx2d.stroke();
    }
  }

  function dragonEmitterLines() {
    var ex = emitter.x;
    var ey = emitter.y;
    var s = Math.min(W, H) / 480;
    var main = [];
    var glow = [];
    function seg(x1, y1, x2, y2, g) {
      var arr = g ? glow : main;
      arr.push(x1, y1, x2, y2);
    }
    seg(ex, ey + 20 * s, ex - 42 * s, ey - 8 * s, false);
    seg(ex - 42 * s, ey - 8 * s, ex - 28 * s, ey - 38 * s, false);
    seg(ex - 28 * s, ey - 38 * s, ex, ey - 52 * s, false);
    seg(ex, ey - 52 * s, ex + 28 * s, ey - 38 * s, false);
    seg(ex + 28 * s, ey - 38 * s, ex + 42 * s, ey - 8 * s, false);
    seg(ex + 42 * s, ey - 8 * s, ex, ey + 20 * s, false);
    seg(ex - 18 * s, ey - 44 * s, ex - 8 * s, ey - 68 * s, true);
    seg(ex + 18 * s, ey - 44 * s, ex + 8 * s, ey - 68 * s, true);
    seg(ex - 10 * s, ey - 4 * s, ex - 22 * s, ey + 8 * s, false);
    seg(ex + 10 * s, ey - 4 * s, ex + 22 * s, ey + 8 * s, false);
    seg(ex - 6 * s, ey + 2 * s, ex, ey - 14 * s, false);
    seg(ex + 6 * s, ey + 2 * s, ex, ey - 14 * s, false);
    seg(ex, ey - 14 * s, ex, ey - 28 * s, true);
    return { main: main, glow: glow };
  }

  function draw() {
    if (useWebGL) drawWebGL();
    else draw2D();
    var readout = $('fl-readout');
    if (readout) {
      readout.textContent = 'FLUSSO · DRAGO · ' + stats.escaped + ' out · ' + stats.inside + ' int';
    }
    var st = $('fl-stats');
    if (st) {
      st.textContent = 'particelle ' + particles.length + ' · rimbalzi ' + stats.bounce +
        (useWebGL ? ' · WebGL' : ' · 2D');
    }
  }

  function loop() {
    step();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function resize() {
    var stage = canvas.parentElement;
    var rect = stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, Math.floor(rect.width)) || 480;
    H = Math.max(280, Math.floor(rect.height)) || 360;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    CX = W * 0.5;
    CY = H * 0.48;
    if (useWebGL) gl.viewport(0, 0, canvas.width, canvas.height);
    else {
      ctx2d = canvas.getContext('2d');
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    layoutEmitter();
    gridDirty = true;
  }

  function pointerPos(e) {
    var r = canvas.getBoundingClientRect();
    var sx = (e.clientX - r.left) * (W / r.width);
    var sy = (e.clientY - r.top) * (H / r.height);
    return { x: sx, y: sy };
  }

  function bindUI() {
    var brushAdd = $('fl-brush-add');
    var brushRem = $('fl-brush-remove');
    function setBrush(mode) {
      cfg.brush = mode;
      if (brushAdd) brushAdd.classList.toggle('on', mode === 'add');
      if (brushRem) brushRem.classList.toggle('on', mode === 'remove');
    }
    if (brushAdd) brushAdd.addEventListener('click', function () { setBrush('add'); });
    if (brushRem) brushRem.addEventListener('click', function () { setBrush('remove'); });
    setBrush('remove');

    var brushR = $('fl-brush');
    if (brushR) {
      brushR.addEventListener('input', function (e) {
        cfg.brushR = parseInt(e.target.value, 10);
        var v = $('fl-brush-val');
        if (v) v.textContent = String(cfg.brushR);
      });
    }
    var brushPow = $('fl-brush-pow');
    if (brushPow) {
      brushPow.addEventListener('input', function (e) {
        cfg.brushStr = parseInt(e.target.value, 10) / 100;
        var v = $('fl-brush-pow-val');
        if (v) v.textContent = e.target.value + '%';
      });
    }

    var steam = $('fl-steam');
    if (steam) {
      steam.addEventListener('input', function (e) {
        cfg.steam = parseInt(e.target.value, 10);
        var v = $('fl-steam-val');
        if (v) v.textContent = String(cfg.steam);
      });
    }

    var resetDragon = $('fl-reset-dragon');
    if (resetDragon) {
      resetDragon.addEventListener('click', function () {
        seedDragonDivider();
        particles = [];
        stats.bounce = stats.escaped = 0;
      });
    }
    var clearSculpt = $('fl-clear-sculpt');
    if (clearSculpt) {
      clearSculpt.addEventListener('click', function () {
        clearField();
        particles = [];
      });
    }
    var pause = $('fl-pause');
    if (pause) {
      pause.addEventListener('click', function () {
        cfg.running = !cfg.running;
        pause.textContent = cfg.running ? 'SIM: ON' : 'SIM: OFF';
        pause.classList.toggle('on', cfg.running);
      });
    }
    var clearP = $('fl-clear');
    if (clearP) {
      clearP.addEventListener('click', function () {
        particles = [];
        stats.bounce = stats.escaped = 0;
      });
    }

    canvas.addEventListener('mousedown', function (e) {
      sculpting = true;
      var p = pointerPos(e);
      sculptAt(p.x, p.y);
    });
    window.addEventListener('mousemove', function (e) {
      if (!sculpting) return;
      var p = pointerPos(e);
      sculptAt(p.x, p.y);
    });
    window.addEventListener('mouseup', function () { sculpting = false; });
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      sculpting = true;
      var t = e.touches[0];
      var p = pointerPos(t);
      sculptAt(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!sculpting) return;
      var t = e.touches[0];
      sculptAt(pointerPos(t).x, pointerPos(t).y);
    }, { passive: false });
    canvas.addEventListener('touchend', function () { sculpting = false; });
  }

  if (!initWebGL()) {
    ctx2d = canvas.getContext('2d');
  }
  seedDragonDivider();
  bindUI();
  window.addEventListener('resize', resize);
  resize();
  loop();
})();
