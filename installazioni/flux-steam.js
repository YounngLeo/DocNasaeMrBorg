/* Divisione flusso — metaball scolpibile · testa drago · vapore WebGL (stile Zelda) */
(function () {
  var canvas = document.getElementById('fl-canvas');
  if (!canvas) return;

  var GRID_W = 128;
  var GRID_H = 96;
  var ISO = 0.44;
  var MAX_PART = 3200;

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
  var progSplat = null;
  var progFade = null;
  var progComposite = null;
  var progLine = null;
  var bufParticle = null;
  var bufLine = null;
  var bufQuad = null;
  var uSplat = {};
  var uFade = {};
  var uComposite = {};
  var smoke = { tex: [null, null], fb: [null, null], idx: 0, w: 0, h: 0 };
  var contourLines = [];
  var useWebGL = false;
  var smoke2d = null;
  var smoke2dCtx = null;

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

  /** 0.35 … 2.2 — mappa slider pressione vapore */
  function steamPower() {
    return 0.35 + (cfg.steam / 100) * 1.85;
  }

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
    var power = steamPower();
    var m = emitter.mouth[Math.floor(Math.random() * emitter.mouth.length)];
    var burst = 0.55 + Math.random() * 0.9;
    particles.push({
      x: m.x + (Math.random() - 0.5) * 16,
      y: m.y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 0.35 * power,
      vy: -(1.6 + Math.random() * 2.4) * power,
      life: 1.15 + Math.random() * 0.55,
      heat: 0.5 + Math.random() * 0.5,
      dens: power * burst,
      splat: (14 + Math.random() * 26) * power,
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
      var rate = Math.round(cfg.steam * 0.52 + 12 * steamPower());
      for (var s = 0; s < rate; s++) spawnParticle();
    }
    stats.inside = 0;
    var power = steamPower();
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vx += (Math.random() - 0.5) * 0.04 * power;
      p.vy -= (0.008 + (1 - p.heat) * 0.006) * power;
      p.x += p.vx;
      p.y += p.vy;
      collideParticle(p);
      if (!p.escaped && sampleField(p.x, p.y) > ISO * 0.85) stats.inside++;
      p.life -= (p.escaped ? 0.0011 : 0.00085) / power;
      p.heat *= 0.9992;
      p.dens *= 0.9995;
      p.splat = Math.min(72, p.splat * 1.0012);
      if (p.life <= 0 || p.y < 6 || p.x < -60 || p.x > W + 60) particles.splice(i, 1);
    }
    if (particles.length > MAX_PART) particles.splice(0, particles.length - MAX_PART);
    if (gridDirty) rebuildContours();
  }

  function clearSmoke() {
    if (useWebGL && gl) {
      var w = smoke.w;
      var h = smoke.h;
      for (var t = 0; t < 2; t++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, smoke.fb[t]);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    if (smoke2dCtx) smoke2dCtx.clearRect(0, 0, smoke2d.width, smoke2d.height);
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

  function initQuad() {
    bufQuad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
  }

  function bindQuad(prog) {
    var loc = gl.getAttribLocation(prog, 'aQuad');
    gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function resizeSmoke() {
    if (!gl) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var sw = Math.max(1, Math.floor(W * dpr));
    var sh = Math.max(1, Math.floor(H * dpr));
    if (smoke.w === sw && smoke.h === sh && smoke.tex[0]) return;
    smoke.w = sw;
    smoke.h = sh;
    for (var i = 0; i < 2; i++) {
      if (smoke.tex[i]) gl.deleteTexture(smoke.tex[i]);
      if (smoke.fb[i]) gl.deleteFramebuffer(smoke.fb[i]);
      smoke.tex[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, smoke.tex[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      smoke.fb[i] = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, smoke.fb[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, smoke.tex[i], 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    smoke.idx = 0;
    clearSmoke();
  }

  function initWebGL() {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: true, premultipliedAlpha: false });
    if (!gl) return false;

    var vsSplat = compileShader(gl.VERTEX_SHADER, [
      '#version 300 es',
      'in vec2 aPos;',
      'in float aSize;',
      'in float aDens;',
      'in float aHeat;',
      'uniform vec2 uRes;',
      'out float vDens;',
      'out float vHeat;',
      'void main(){',
      '  vec2 c = (aPos / uRes) * 2.0 - 1.0;',
      '  c.y = -c.y;',
      '  gl_Position = vec4(c, 0.0, 1.0);',
      '  gl_PointSize = max(4.0, aSize);',
      '  vDens = aDens;',
      '  vHeat = aHeat;',
      '}'
    ].join('\n'));

    var fsSplat = compileShader(gl.FRAGMENT_SHADER, [
      '#version 300 es',
      'precision mediump float;',
      'in float vDens;',
      'in float vHeat;',
      'out vec4 outColor;',
      'void main(){',
      '  vec2 p = (gl_PointCoord - 0.5) * 2.0;',
      '  float r2 = dot(p, p);',
      '  float d = exp(-r2 * 2.8);',
      '  float a = d * vDens * 0.055;',
      '  if (a < 0.002) discard;',
      '  float h = 0.35 + vHeat * 0.65;',
      '  outColor = vec4(h, h, h + 0.06, a);',
      '}'
    ].join('\n'));

    var vsQuad = compileShader(gl.VERTEX_SHADER, [
      '#version 300 es',
      'in vec2 aQuad;',
      'out vec2 vUv;',
      'void main(){',
      '  vUv = aQuad * 0.5 + 0.5;',
      '  gl_Position = vec4(aQuad, 0.0, 1.0);',
      '}'
    ].join('\n'));

    var fsFade = compileShader(gl.FRAGMENT_SHADER, [
      '#version 300 es',
      'precision mediump float;',
      'in vec2 vUv;',
      'uniform sampler2D uTex;',
      'uniform float uDecay;',
      'out vec4 outColor;',
      'void main(){',
      '  vec4 c = texture(uTex, vUv);',
      '  outColor = c * uDecay;',
      '}'
    ].join('\n'));

    var fsComposite = compileShader(gl.FRAGMENT_SHADER, [
      '#version 300 es',
      'precision mediump float;',
      'in vec2 vUv;',
      'uniform sampler2D uSmoke;',
      'uniform float uPower;',
      'out vec4 outColor;',
      'void main(){',
      '  float dens = texture(uSmoke, vUv).a;',
      '  dens = smoothstep(0.015, 0.72, dens * (0.85 + uPower * 0.35));',
      '  vec3 cool = vec3(0.32, 0.42, 0.50);',
      '  vec3 mid = vec3(0.58, 0.68, 0.76);',
      '  vec3 warm = vec3(0.88, 0.92, 0.96);',
      '  vec3 col = mix(cool, mid, clamp(dens * 1.4, 0.0, 1.0));',
      '  col = mix(col, warm, pow(dens, 1.6) * 0.55);',
      '  float a = dens * (0.55 + uPower * 0.25);',
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

    if (!vsSplat || !fsSplat || !vsQuad || !fsFade || !fsComposite || !vsL || !fsL) return false;

    progSplat = linkProgram(vsSplat, fsSplat);
    progFade = linkProgram(vsQuad, fsFade);
    progComposite = linkProgram(vsQuad, fsComposite);
    progLine = linkProgram(vsL, fsL);
    if (!progSplat || !progFade || !progComposite || !progLine) return false;

    bufParticle = gl.createBuffer();
    bufLine = gl.createBuffer();
    initQuad();
    uSplat = {
      res: gl.getUniformLocation(progSplat, 'uRes')
    };
    uFade = {
      tex: gl.getUniformLocation(progFade, 'uTex'),
      decay: gl.getUniformLocation(progFade, 'uDecay')
    };
    uComposite = {
      smoke: gl.getUniformLocation(progComposite, 'uSmoke'),
      power: gl.getUniformLocation(progComposite, 'uPower')
    };
    useWebGL = true;
    return true;
  }

  function drawSmokeSplats(targetW, targetH) {
    if (!particles.length) return;
    var stride = 5 * 4;
    var data = new Float32Array(particles.length * 5);
    var j = 0;
    var dpr = targetW / W;
    particles.forEach(function (p) {
      data[j++] = p.x * dpr;
      data[j++] = p.y * dpr;
      data[j++] = p.splat * dpr * (0.9 + p.life * 0.45);
      data[j++] = p.dens * p.life;
      data[j++] = p.heat;
    });

    gl.useProgram(progSplat);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufParticle);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    var locPos = gl.getAttribLocation(progSplat, 'aPos');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, stride, 0);
    var locSize = gl.getAttribLocation(progSplat, 'aSize');
    gl.enableVertexAttribArray(locSize);
    gl.vertexAttribPointer(locSize, 1, gl.FLOAT, false, stride, 8);
    var locDens = gl.getAttribLocation(progSplat, 'aDens');
    gl.enableVertexAttribArray(locDens);
    gl.vertexAttribPointer(locDens, 1, gl.FLOAT, false, stride, 12);
    var locHeat = gl.getAttribLocation(progSplat, 'aHeat');
    gl.enableVertexAttribArray(locHeat);
    gl.vertexAttribPointer(locHeat, 1, gl.FLOAT, false, stride, 16);

    gl.uniform2f(uSplat.res, targetW, targetH);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, particles.length);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
    if (!smoke.tex[0]) return;
    var sw = smoke.w;
    var sh = smoke.h;
    var read = smoke.idx;
    var write = 1 - read;

    gl.bindFramebuffer(gl.FRAMEBUFFER, smoke.fb[write]);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(progFade);
    bindQuad(progFade);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, smoke.tex[read]);
    gl.uniform1i(uFade.tex, 0);
    gl.uniform1f(uFade.decay, 0.972 - steamPower() * 0.008);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    drawSmokeSplats(sw, sh);
    smoke.idx = write;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.024, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.useProgram(progComposite);
    bindQuad(progComposite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, smoke.tex[write]);
    gl.uniform1i(uComposite.smoke, 0);
    gl.uniform1f(uComposite.power, steamPower());
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    drawLines(contourLines.inner, [0.28, 0.75, 0.68, 0.22], 1);
    drawLines(contourLines.outer, [0.42, 0.92, 0.88, 0.75], 1.8);

    var dPath = dragonEmitterLines();
    drawLines(dPath.glow, [0.35, 0.85, 0.95, 0.35], 1.2);
    drawLines(dPath.main, [0.55, 0.98, 0.88, 0.9], 2);
  }

  /* ── Canvas 2D fallback (accumulo vapore) ─────────────────── */
  var ctx2d = null;

  function ensureSmoke2d() {
    if (!smoke2d) {
      smoke2d = document.createElement('canvas');
      smoke2dCtx = smoke2d.getContext('2d');
    }
    if (smoke2d.width !== W || smoke2d.height !== H) {
      smoke2d.width = W;
      smoke2d.height = H;
      smoke2dCtx.clearRect(0, 0, W, H);
    }
  }

  function splatSmoke2d(p) {
    var g = smoke2dCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.splat);
    var a = p.dens * p.life * 0.14;
    g.addColorStop(0, 'rgba(235, 245, 255, ' + a + ')');
    g.addColorStop(0.25, 'rgba(190, 215, 235, ' + (a * 0.45) + ')');
    g.addColorStop(0.65, 'rgba(140, 170, 190, ' + (a * 0.12) + ')');
    g.addColorStop(1, 'rgba(100, 130, 150, 0)');
    smoke2dCtx.fillStyle = g;
    smoke2dCtx.beginPath();
    smoke2dCtx.arc(p.x, p.y, p.splat, 0, Math.PI * 2);
    smoke2dCtx.fill();
  }

  function draw2D() {
    ensureSmoke2d();
    smoke2dCtx.globalCompositeOperation = 'source-over';
    smoke2dCtx.globalAlpha = 0.965 - steamPower() * 0.012;
    smoke2dCtx.drawImage(smoke2d, 0, 0);
    smoke2dCtx.globalAlpha = 1;
    smoke2dCtx.globalCompositeOperation = 'lighter';
    particles.forEach(splatSmoke2d);
    smoke2dCtx.globalCompositeOperation = 'source-over';

    ctx2d.fillStyle = '#050608';
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.globalAlpha = 0.92;
    ctx2d.drawImage(smoke2d, 0, 0);
    ctx2d.globalAlpha = 1;

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
    if (useWebGL) {
      resizeSmoke();
      gl.viewport(0, 0, canvas.width, canvas.height);
    } else {
      ctx2d = canvas.getContext('2d');
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (smoke2d) {
        smoke2d.width = W;
        smoke2d.height = H;
        smoke2dCtx.clearRect(0, 0, W, H);
      }
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
        clearSmoke();
        stats.bounce = stats.escaped = 0;
      });
    }
    var clearSculpt = $('fl-clear-sculpt');
    if (clearSculpt) {
      clearSculpt.addEventListener('click', function () {
        clearField();
        particles = [];
        clearSmoke();
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
        clearSmoke();
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
