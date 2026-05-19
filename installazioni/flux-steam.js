/* Divisione flusso — vapore · cupola biomorfa · collisioni ai buchi */
(function () {
  var canvas = document.getElementById('fl-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var W = 480;
  var H = 360;
  var CX = W * 0.5;
  var CY = H * 0.52;
  var seed = Math.random() * 1000;

  var cfg = {
    shape: 'bulbo',
    holes: 5,
    holeSize: 0.08,
    pattern: 'anello',
    steam: 55,
    running: true
  };

  var particles = [];
  var segments = [];
  var cupolaPoints = [];
  var holes = [];
  var emitter = { x: CX, y: CY + 78, rx: 36, ry: 14 };
  var stats = { inside: 0, escaped: 0, bounce: 0 };
  var raf = null;

  var SHAPES = {
    bulbo:  { rx: 118, ry: 92, w1: 14, w2: 8 },
    alto:   { rx: 88, ry: 118, w1: 10, w2: 12 },
    largo:  { rx: 138, ry: 72, w1: 18, w2: 6 },
    spirale:{ rx: 108, ry: 98, w1: 22, w2: 16 }
  };

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function resize() {
    var stage = canvas.parentElement;
    var rect = stage.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    W = Math.max(320, Math.floor(rect.width)) || 480;
    H = Math.max(280, Math.floor(rect.height)) || 360;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CX = W * 0.5;
    CY = H * 0.52;
    emitter.x = CX;
    emitter.y = CY + H * 0.18;
    emitter.rx = W * 0.075;
    emitter.ry = H * 0.04;
    rebuildCupola();
  }

  function rebuildCupola() {
    var s = SHAPES[cfg.shape] || SHAPES.bulbo;
    var scale = Math.min(W / 480, H / 360);
    var rx = s.rx * scale;
    var ry = s.ry * scale;
    var N = 72;
    cupolaPoints = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var ang = Math.PI * t;
      var wob = s.w1 * scale * Math.sin(ang * 3 + seed * 0.01) +
                s.w2 * scale * Math.sin(ang * 5 + seed * 0.017);
      if (cfg.shape === 'spirale') {
        wob += 10 * scale * Math.sin(ang * 2 + t * 8 + seed * 0.02);
      }
      cupolaPoints.push({
        t: t,
        x: CX + Math.cos(ang) * (rx + wob),
        y: CY - Math.sin(ang) * (ry + wob * 0.55)
      });
    }
    holes = buildHoles();
    segments = buildSegments();
  }

  function buildHoles() {
    var list = [];
    var n = cfg.holes;
    var size = cfg.holeSize;
    if (n <= 0) return list;

    if (cfg.pattern === 'anello') {
      for (var i = 0; i < n; i++) {
        var c = (i + 0.5) / n;
        list.push({ t0: clamp(c - size, 0.02, 0.98), t1: clamp(c + size, 0.02, 0.98) });
      }
    } else if (cfg.pattern === 'cluster') {
      var base = 0.35 + (seed % 100) / 400;
      for (var j = 0; j < n; j++) {
        var c2 = base + j * (size * 1.4);
        list.push({ t0: clamp(c2 - size * 0.7, 0.02, 0.98), t1: clamp(c2 + size * 0.7, 0.02, 0.98) });
      }
    } else {
      for (var k = 0; k < n; k++) {
        var r = ((seed * 13 + k * 97) % 1000) / 1000;
        var c3 = 0.08 + r * 0.84;
        list.push({ t0: clamp(c3 - size, 0.02, 0.98), t1: clamp(c3 + size, 0.02, 0.98) });
      }
    }
    return list;
  }

  function inHole(t) {
    for (var i = 0; i < holes.length; i++) {
      if (t >= holes[i].t0 && t <= holes[i].t1) return true;
    }
    return false;
  }

  function buildSegments() {
    var segs = [];
    var baseY = CY + H * 0.2;
    for (var i = 0; i < cupolaPoints.length - 1; i++) {
      var tMid = (cupolaPoints[i].t + cupolaPoints[i + 1].t) * 0.5;
      if (inHole(tMid)) continue;
      segs.push({
        x1: cupolaPoints[i].x, y1: cupolaPoints[i].y,
        x2: cupolaPoints[i + 1].x, y2: cupolaPoints[i + 1].y
      });
    }
    var left = cupolaPoints[0];
    var right = cupolaPoints[cupolaPoints.length - 1];
    segs.push({ x1: left.x, y1: left.y, x2: left.x, y2: baseY });
    segs.push({ x1: right.x, y1: right.y, x2: right.x, y2: baseY });
    var gap = emitter.rx * 1.1;
    segs.push({ x1: left.x, y1: baseY, x2: CX - gap, y2: baseY, base: true });
    segs.push({ x1: CX + gap, y1: baseY, x2: right.x, y2: baseY, base: true });
    return segs;
  }

  function spawnParticle() {
    var a = Math.random() * Math.PI * 2;
    var r = Math.random();
    particles.push({
      x: emitter.x + Math.cos(a) * emitter.rx * r * 0.85,
      y: emitter.y + Math.sin(a) * emitter.ry * r * 0.5,
      vx: (Math.random() - 0.5) * 0.9,
      vy: -1.4 - Math.random() * 1.8,
      life: 1,
      r: 1.8 + Math.random() * 2.2,
      escaped: false
    });
  }

  function segClosest(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    if (len2 < 0.001) return { x: x1, y: y1, t: 0 };
    var t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    return { x: x1 + t * dx, y: y1 + t * dy, t: t };
  }

  function collideParticle(p) {
    for (var i = 0; i < segments.length; i++) {
      var s = segments[i];
      var c = segClosest(p.x, p.y, s.x1, s.y1, s.x2, s.y2);
      var dx = p.x - c.x;
      var dy = p.y - c.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= p.r + 1.2) continue;

      var nx = dx / (dist || 1);
      var ny = dy / (dist || 1);
      var dot = p.vx * nx + p.vy * ny;
      if (dot > 0) continue;

      p.x = c.x + nx * (p.r + 1.3);
      p.y = c.y + ny * (p.r + 1.3);
      p.vx -= 2 * dot * nx;
      p.vy -= 2 * dot * ny;
      p.vx *= 0.82;
      p.vy *= 0.82;
      stats.bounce++;
    }
  }

  function checkHoleEscape(p) {
    if (p.escaped) return;
    var t = clamp(cupolaTAt(p.x, p.y), 0, 1);
    if (!inHole(t)) return;
    var idx = Math.min(cupolaPoints.length - 1, Math.max(0, Math.round(t * (cupolaPoints.length - 1))));
    if (p.y <= cupolaPoints[idx].y + 6) {
      p.escaped = true;
      p.vx += (Math.random() - 0.5) * 1.4;
      p.vy += -0.6 - Math.random() * 0.8;
      stats.escaped++;
    }
  }

  function cupolaTAt(x, y) {
    var best = 0;
    var bestD = Infinity;
    for (var i = 0; i < cupolaPoints.length; i++) {
      var dx = cupolaPoints[i].x - x;
      var dy = cupolaPoints[i].y - y;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = cupolaPoints[i].t; }
    }
    return best;
  }

  function insideCupola(x, y) {
    if (y > CY + H * 0.2) return Math.abs(x - CX) < emitter.rx * 2.2;
    var t = cupolaTAt(x, y);
    var idx = Math.round(t * (cupolaPoints.length - 1));
    var pt = cupolaPoints[idx];
    return y >= pt.y - 4 && y <= CY + H * 0.21;
  }

  function step() {
    if (cfg.running) {
      var rate = Math.round(cfg.steam * 0.12);
      for (var s = 0; s < rate; s++) spawnParticle();
    }

    stats.inside = 0;
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vx += (Math.random() - 0.5) * 0.06;
      p.vy -= 0.018;
      p.x += p.vx;
      p.y += p.vy;
      collideParticle(p);
      checkHoleEscape(p);

      if (!p.escaped && insideCupola(p.x, p.y)) stats.inside++;

      p.life -= p.escaped ? 0.006 : 0.004;
      if (p.life <= 0 || p.y < -20 || p.x < -30 || p.x > W + 30) {
        particles.splice(i, 1);
      }
    }
    if (particles.length > 500) particles.splice(0, particles.length - 500);
  }

  function drawCupola() {
    ctx.beginPath();
    ctx.moveTo(cupolaPoints[0].x, cupolaPoints[0].y);
    for (var i = 1; i < cupolaPoints.length; i++) {
      if (inHole((cupolaPoints[i - 1].t + cupolaPoints[i].t) * 0.5)) {
        ctx.moveTo(cupolaPoints[i].x, cupolaPoints[i].y);
      } else {
        ctx.lineTo(cupolaPoints[i].x, cupolaPoints[i].y);
      }
    }
    var baseY = CY + H * 0.2;
    ctx.lineTo(cupolaPoints[cupolaPoints.length - 1].x, baseY);
    ctx.lineTo(cupolaPoints[0].x, baseY);
    ctx.closePath();
    var g = ctx.createRadialGradient(CX, CY, 10, CX, CY, H * 0.35);
    g.addColorStop(0, 'rgba(74, 246, 255, 0.07)');
    g.addColorStop(1, 'rgba(94, 255, 126, 0.02)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 246, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    for (var j = 0; j < cupolaPoints.length - 1; j++) {
      if (inHole((cupolaPoints[j].t + cupolaPoints[j + 1].t) * 0.5)) continue;
      if (j === 0 || inHole((cupolaPoints[j - 1].t + cupolaPoints[j].t) * 0.5)) {
        ctx.moveTo(cupolaPoints[j].x, cupolaPoints[j].y);
      }
      ctx.lineTo(cupolaPoints[j + 1].x, cupolaPoints[j + 1].y);
    }
    ctx.strokeStyle = '#4af6ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    holes.forEach(function (h) {
      var i0 = Math.floor(h.t0 * (cupolaPoints.length - 1));
      var i1 = Math.ceil(h.t1 * (cupolaPoints.length - 1));
      ctx.beginPath();
      ctx.moveTo(cupolaPoints[i0].x, cupolaPoints[i0].y);
      for (var k = i0; k <= i1; k++) ctx.lineTo(cupolaPoints[k].x, cupolaPoints[k].y);
      ctx.strokeStyle = 'rgba(94, 255, 126, 0.85)';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#5eff7e';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    ctx.beginPath();
    ctx.ellipse(emitter.x, emitter.y, emitter.rx, emitter.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 246, 255, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 246, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawParticles() {
    particles.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      var alpha = p.life * (p.escaped ? 0.55 : 0.75);
      ctx.fillStyle = p.escaped
        ? 'rgba(200, 230, 255, ' + alpha + ')'
        : 'rgba(180, 220, 240, ' + alpha + ')';
      ctx.shadowColor = '#4af6ff';
      ctx.shadowBlur = p.escaped ? 6 : 3;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function draw() {
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(74, 246, 255, 0.03)';
    ctx.fillRect(0, CY + H * 0.2, W, H);

    drawCupola();
    drawParticles();

    var readout = $('fl-readout');
    if (readout) {
      readout.textContent = 'FLUSSO · ' + cfg.holes + ' BUCHI · ' + stats.inside + ' int · ' + stats.escaped + ' out';
    }
    var st = $('fl-stats');
    if (st) {
      st.textContent = 'particelle ' + particles.length + ' · rimbalzi ' + stats.bounce;
    }
  }

  function loop() {
    step();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function bindSelect(id, key) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('change', function () {
      cfg[key] = el.value;
      if (key === 'shape' || key === 'pattern') rebuildCupola();
    });
  }

  $('fl-holes').addEventListener('input', function (e) {
    cfg.holes = parseInt(e.target.value, 10);
    $('fl-holes-val').textContent = String(cfg.holes);
    rebuildCupola();
  });
  $('fl-hole-size').addEventListener('input', function (e) {
    cfg.holeSize = parseInt(e.target.value, 10) / 100;
    $('fl-hole-size-val').textContent = e.target.value + '%';
    rebuildCupola();
  });
  $('fl-steam').addEventListener('input', function (e) {
    cfg.steam = parseInt(e.target.value, 10);
    $('fl-steam-val').textContent = String(cfg.steam);
  });

  bindSelect('fl-shape', 'shape');
  bindSelect('fl-pattern', 'pattern');

  $('fl-regen').addEventListener('click', function () {
    seed = Math.random() * 10000;
    rebuildCupola();
    particles = [];
    stats.bounce = stats.escaped = 0;
  });

  $('fl-pause').addEventListener('click', function () {
    cfg.running = !cfg.running;
    $('fl-pause').textContent = cfg.running ? 'SIM: ON' : 'SIM: OFF';
    $('fl-pause').classList.toggle('on', cfg.running);
  });

  $('fl-clear').addEventListener('click', function () {
    particles = [];
    stats.bounce = stats.escaped = 0;
  });

  window.addEventListener('resize', resize);
  resize();
  loop();
})();
