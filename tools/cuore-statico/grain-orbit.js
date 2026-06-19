/* CUORE_STATICO · ORBIT grain engine (Orbitonic-style) */
'use strict';

window.CuoreOrbit = (function () {
  const LAYERS = ['pad', 'bass', 'lead', 'noise', 'sample'];
  const LAYER_LABEL = { pad: 'PAD', bass: 'BASS', lead: 'LEAD', noise: 'NSE', sample: 'SMP' };
  const LAYER_COLOR = { pad: '#00ff41', bass: '#ffb000', lead: '#c678ff', noise: '#4af6ff', sample: '#7ec8f8' };

  let deps = null;
  let canvas = null;
  let ctx = null;
  let samplesEl = null;
  let statusEl = null;

  let orbits = [];
  let sampleMeta = {};
  let tool = 'orbit';
  let selectedId = null;
  let selectedLayer = 'pad';
  let orbitPlaying = false;
  let syncMain = true;
  let grainSize = 0.1;
  let lastAngles = {};
  let drag = null;
  let nextId = 1;
  let raf = 0;

  function defaultMeta() {
    const m = {};
    LAYERS.forEach(function (l) {
      m[l] = { vol: 75, pit: 0, ready: false };
    });
    return m;
  }

  function loadState(stored) {
    sampleMeta = defaultMeta();
    if (stored && stored.sampleMeta) {
      LAYERS.forEach(function (l) {
        if (stored.sampleMeta[l]) Object.assign(sampleMeta[l], stored.sampleMeta[l]);
      });
    }
    orbits = Array.isArray(stored && stored.orbits) ? stored.orbits : [];
    orbits.forEach(function (o) { if (o.id >= nextId) nextId = o.id + 1; });
    if (stored && Number.isFinite(stored.grainSize)) grainSize = stored.grainSize;
    if (stored && typeof stored.syncMain === 'boolean') syncMain = stored.syncMain;
    lastAngles = {};
    orbits.forEach(function (o) { lastAngles[o.id] = getOrbitAngle(o); });
  }

  function persist() {
    if (deps && deps.saveState) {
      deps.saveState({ orbits, sampleMeta, grainSize, syncMain });
    }
  }

  function pickDefaultLayer() {
    const ready = LAYERS.find(function (l) {
      return deps && deps.getGrainBuffer && deps.getGrainBuffer(l);
    });
    if (ready) selectedLayer = ready;
  }

  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      px: (e.clientX - rect.left) * sx,
      py: (e.clientY - rect.top) * sy
    };
  }

  function normToPx(nx, ny) {
    const w = canvas.width;
    const h = canvas.height;
    const pad = 28;
    return {
      x: pad + nx * (w - pad * 2),
      y: pad + ny * (h - pad * 2)
    };
  }

  function pxToNorm(px, py) {
    const w = canvas.width;
    const h = canvas.height;
    const pad = 28;
    return {
      x: Math.max(0.05, Math.min(0.95, (px - pad) / (w - pad * 2))),
      y: Math.max(0.05, Math.min(0.95, (py - pad) / (h - pad * 2)))
    };
  }

  function orbitPoint(o, angle) {
    const c = normToPx(o.cx, o.cy);
    const rx = o.rx * (canvas.width - 56) * 0.5;
    const ry = o.ry * (canvas.height - 56) * 0.5;
    const ca = Math.cos(o.rot);
    const sa = Math.sin(o.rot);
    const lx = rx * Math.cos(angle);
    const ly = ry * Math.sin(angle);
    return { x: c.x + lx * ca - ly * sa, y: c.y + lx * sa + ly * ca };
  }

  function angleOnOrbit(o, px, py) {
    const c = normToPx(o.cx, o.cy);
    const dx = px - c.x;
    const dy = py - c.y;
    const ca = Math.cos(-o.rot);
    const sa = Math.sin(-o.rot);
    const lx = dx * ca - dy * sa;
    const ly = dx * sa + dy * ca;
    let a = Math.atan2(ly / (o.ry || 0.01), lx / (o.rx || 0.01));
    if (a < 0) a += Math.PI * 2;
    return a;
  }

  function distToOrbit(o, px, py) {
    const a = angleOnOrbit(o, px, py);
    const p = orbitPoint(o, a);
    return Math.hypot(px - p.x, py - p.y);
  }

  function hitOrbit(px, py) {
    let best = null;
    let bestD = 18;
    for (let i = orbits.length - 1; i >= 0; i--) {
      const d = distToOrbit(orbits[i], px, py);
      if (d < bestD) { bestD = d; best = orbits[i]; }
    }
    return best;
  }

  function getOrbitAngle(o) {
    const playing = syncMain ? (deps && deps.isPlaying()) : orbitPlaying;
    if (playing && deps) {
      const beat = deps.getBeat16 ? deps.getBeat16() : 0;
      const bpm = deps.getBpm ? deps.getBpm() : 76;
      const beatDur = 60 / bpm / 4;
      const t = beat * beatDur;
      return ((t * o.speed * Math.PI * 2) / (60 / bpm * 4) + o.phase) % (Math.PI * 2);
    }
    const t = performance.now() / 1000;
    return (t * o.speed * 0.55 + o.phase) % (Math.PI * 2);
  }

  function angleCrossed(prev, curr, target) {
    const T = Math.PI * 2;
    const norm = function (a) { return ((a % T) + T) % T; };
    prev = norm(prev);
    curr = norm(curr);
    target = norm(target);
    if (prev <= curr) return target >= prev && target < curr;
    return target >= prev || target < curr;
  }

  function fireStrike(o) {
    if (!deps || !deps.spawnGrain) return;
    if (!deps.getGrainBuffer || !deps.getGrainBuffer(o.layer)) return;
    const meta = sampleMeta[o.layer] || { vol: 75, pit: 0 };
    const pit = Math.pow(2, (meta.pit || 0) / 12);
    const vol = Math.max(0, Math.min(1, (meta.vol || 75) / 100));
    deps.spawnGrain(o.layer, Tone.now() + 0.002, pit, vol, grainSize);
    o._flash = performance.now();
  }

  function tickAudio() {
    orbits.forEach(function (o) {
      const cur = getOrbitAngle(o);
      const prev = lastAngles[o.id];
      if (prev == null) { lastAngles[o.id] = cur; return; }
      if (o.strikes && o.strikes.length) {
        o.strikes.forEach(function (s) {
          if (angleCrossed(prev, cur, s)) fireStrike(o);
        });
      }
      lastAngles[o.id] = cur;
    });
  }

  function draw() {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#0f2a16';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = (h / 8) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    orbits.forEach(function (o) {
      const col = LAYER_COLOR[o.layer] || '#00ff41';
      const c = normToPx(o.cx, o.cy);
      const rx = o.rx * (w - 56) * 0.5;
      const ry = o.ry * (h - 56) * 0.5;

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(o.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = o.id === selectedId ? col : 'rgba(0,255,65,0.45)';
      ctx.lineWidth = o.id === selectedId ? 1.8 : 1;
      ctx.stroke();

      if (o._flash && performance.now() - o._flash < 120) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      (o.strikes || []).forEach(function (s) {
        const p = { x: rx * Math.cos(s), y: ry * Math.sin(s) };
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x * 0.88, p.y * 0.88);
        ctx.lineTo(p.x * 1.12, p.y * 1.12);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      const ang = getOrbitAngle(o);
      const dot = orbitPoint(o, ang);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    if (drag && drag.type === 'new') {
      const c = normToPx(drag.cx, drag.cy);
      const rx = Math.abs(drag.px - c.x);
      const ry = Math.abs(drag.py - c.y);
      ctx.strokeStyle = 'rgba(0,255,65,0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, Math.max(8, rx), Math.max(8, ry), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    updateStatus();
  }

  function updateStatus() {
    if (!statusEl) return;
    const bpm = deps && deps.getBpm ? deps.getBpm() : 76;
    const ready = LAYERS.filter(function (l) {
      return deps && deps.getGrainBuffer && deps.getGrainBuffer(l);
    }).length;
    const strikes = orbits.reduce(function (n, o) { return n + (o.strikes ? o.strikes.length : 0); }, 0);
    statusEl.textContent = bpm + ' bpm · ' + orbits.length + ' orbits · ' + ready + '/' + LAYERS.length + ' samples · ' + strikes + ' strikes';
  }

  function renderSamples() {
    if (!samplesEl) return;
    samplesEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'orbit-samples-title';
    title.textContent = 'SAMPLES';
    samplesEl.appendChild(title);

    LAYERS.forEach(function (layer) {
      const meta = sampleMeta[layer];
      const ready = deps && deps.getGrainBuffer && !!deps.getGrainBuffer(layer);
      meta.ready = ready;
      const row = document.createElement('div');
      row.className = 'orbit-sample' + (ready ? ' ready' : '') + (layer === selectedLayer ? ' selected' : '');
      row.dataset.layer = layer;
      row.style.borderColor = LAYER_COLOR[layer];
      row.innerHTML =
        '<div class="os-head">' +
          '<span class="os-name" style="color:' + LAYER_COLOR[layer] + '">' + LAYER_LABEL[layer] + '</span>' +
          '<button type="button" class="os-cap" data-cap="' + layer + '">' + (ready ? '↻' : 'CAP') + '</button>' +
          '<button type="button" class="os-test" data-test="' + layer + '">▶</button>' +
        '</div>' +
        '<canvas class="os-wave" data-wave="' + layer + '" width="140" height="28"></canvas>' +
        '<div class="os-sliders">' +
          '<label>VOL <input type="range" min="0" max="100" step="1" data-vol="' + layer + '" value="' + meta.vol + '"><span data-volv="' + layer + '">' + meta.vol + '</span></label>' +
          '<label>PIT <input type="range" min="-24" max="24" step="0.1" data-pit="' + layer + '" value="' + meta.pit + '"><span data-pitv="' + layer + '">' + meta.pit.toFixed(1) + '</span></label>' +
        '</div>' +
        '<div class="os-hint">' + (ready ? 'pronto · assegna orbita' : 'synth → CAP') + '</div>';
      samplesEl.appendChild(row);

      row.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('input')) return;
        selectedLayer = layer;
        if (selectedId != null) {
          const o = orbits.find(function (x) { return x.id === selectedId; });
          if (o) { o.layer = layer; persist(); }
        }
        renderSamples();
      });

      const wc = row.querySelector('[data-wave="' + layer + '"]');
      drawMiniWave(wc, layer);
    });

    samplesEl.querySelectorAll('[data-cap]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const l = btn.dataset.cap;
        btn.textContent = '…';
        if (deps && deps.captureLayer) await deps.captureLayer(l);
        renderSamples();
        if (!orbits.some(function (o) { return o.layer === l; })) {
          addOrbit(l, 0.35 + Math.random() * 0.25, 0.35 + Math.random() * 0.2);
        }
      });
    });
    samplesEl.querySelectorAll('[data-test]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const l = btn.dataset.test;
        if (deps && deps.initAudio) await deps.initAudio();
        if (deps && deps.spawnGrain && deps.getGrainBuffer && deps.getGrainBuffer(l)) {
          const meta = sampleMeta[l];
          deps.spawnGrain(l, Tone.now() + 0.05, Math.pow(2, meta.pit / 12), meta.vol / 100, grainSize);
        }
      });
    });
    samplesEl.querySelectorAll('[data-vol]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const l = inp.dataset.vol;
        sampleMeta[l].vol = +inp.value;
        const sp = samplesEl.querySelector('[data-volv="' + l + '"]');
        if (sp) sp.textContent = inp.value;
        persist();
      });
    });
    samplesEl.querySelectorAll('[data-pit]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const l = inp.dataset.pit;
        sampleMeta[l].pit = +inp.value;
        const sp = samplesEl.querySelector('[data-pitv="' + l + '"]');
        if (sp) sp.textContent = (+inp.value).toFixed(1);
        persist();
      });
    });
  }

  function drawMiniWave(cv, layer) {
    if (!cv) return;
    const g = cv.getContext('2d');
    const w = cv.width;
    const h = cv.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const buf = deps && deps.getGrainBuffer ? deps.getGrainBuffer(layer) : null;
    if (!buf) {
      g.fillStyle = '#1a4d22';
      g.font = '9px Courier New';
      g.fillText('—', 6, h / 2 + 3);
      return;
    }
    const ch = buf.getChannelData(0);
    const col = LAYER_COLOR[layer];
    g.strokeStyle = col;
    g.globalAlpha = 0.85;
    g.beginPath();
    const step = Math.max(1, Math.floor(ch.length / w));
    for (let x = 0; x < w; x++) {
      const i = x * step;
      const y = (1 - (ch[i] + 1) / 2) * h;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  function addOrbit(layer, cx, cy) {
    const o = {
      id: nextId++,
      layer: layer || 'pad',
      cx: cx != null ? cx : 0.5,
      cy: cy != null ? cy : 0.5,
      rx: 0.18,
      ry: 0.11,
      rot: Math.random() * Math.PI,
      speed: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      strikes: [0, Math.PI]
    };
    orbits.push(o);
    lastAngles[o.id] = getOrbitAngle(o);
    selectedId = o.id;
    persist();
  }

  function resize() {
    if (!canvas) return;
    const stage = canvas.parentElement;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(200, Math.floor(r.width * dpr));
    canvas.height = Math.max(220, Math.floor(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    draw();
  }

  function loop() {
    tickAudio();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function bindCanvas() {
    canvas.addEventListener('pointerdown', function (e) {
      const c = canvasCoords(e);
      const px = c.px;
      const py = c.py;

      if (tool === 'orbit') {
        const n = pxToNorm(px, py);
        drag = { type: 'new', cx: n.x, cy: n.y, px: px, py: py, layer: selectedLayer };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (tool === 'strike') {
        const o = hitOrbit(px, py);
        if (o) {
          const a = angleOnOrbit(o, px, py);
          if (!o.strikes) o.strikes = [];
          o.strikes.push(a);
          o.strikes.sort(function (a, b) { return a - b; });
          selectedId = o.id;
          selectedLayer = o.layer;
          renderSamples();
          persist();
        }
        return;
      }
      if (tool === 'delete') {
        const o = hitOrbit(px, py);
        if (o) {
          orbits = orbits.filter(function (x) { return x.id !== o.id; });
          delete lastAngles[o.id];
          if (selectedId === o.id) selectedId = null;
          persist();
        }
        return;
      }
      if (tool === 'move') {
        const o = hitOrbit(px, py);
        if (o) {
          selectedId = o.id;
          selectedLayer = o.layer;
          drag = { type: 'move', id: o.id, ox: px, oy: py, ocx: o.cx, ocy: o.cy };
          canvas.setPointerCapture(e.pointerId);
        }
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const c = canvasCoords(e);
      const px = c.px;
      const py = c.py;
      if (drag.type === 'new') {
        drag.px = px;
        drag.py = py;
        return;
      }
      if (drag.type === 'move') {
        const o = orbits.find(function (x) { return x.id === drag.id; });
        if (!o) return;
        const n0 = pxToNorm(drag.ox, drag.oy);
        const n1 = pxToNorm(px, py);
        o.cx = drag.ocx + (n1.x - n0.x);
        o.cy = drag.ocy + (n1.y - n0.y);
        o.cx = Math.max(0.08, Math.min(0.92, o.cx));
        o.cy = Math.max(0.08, Math.min(0.92, o.cy));
      }
    });

    function endDrag(e) {
      if (!drag) return;
      const c = canvasCoords(e);
      const px = c.px;
      const py = c.py;
      if (drag.type === 'new') {
        const center = normToPx(drag.cx, drag.cy);
        const rx = Math.abs(px - center.x) / ((canvas.width - 56) * 0.5);
        const ry = Math.abs(py - center.y) / ((canvas.height - 56) * 0.5);
        if (rx > 0.06 && ry > 0.04) {
          const o = {
            id: nextId++,
            layer: drag.layer,
            cx: drag.cx,
            cy: drag.cy,
            rx: Math.min(0.42, rx),
            ry: Math.min(0.38, ry),
            rot: Math.random() * Math.PI,
            speed: 0.6 + Math.random(),
            phase: Math.random() * Math.PI * 2,
            strikes: [0, Math.PI * 0.5, Math.PI]
          };
          orbits.push(o);
          lastAngles[o.id] = getOrbitAngle(o);
          selectedId = o.id;
          persist();
        }
      }
      if (drag.type === 'move') persist();
      drag = null;
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  }

  function setTool(t) {
    tool = t;
    document.querySelectorAll('[data-orbit-tool]').forEach(function (btn) {
      btn.classList.toggle('on', btn.dataset.orbitTool === t);
    });
    if (canvas) {
      const cursors = { orbit: 'crosshair', strike: 'pointer', move: 'move', delete: 'not-allowed' };
      canvas.style.cursor = cursors[t] || 'default';
    }
  }

  function init(hooks) {
    deps = hooks;
    canvas = document.getElementById('orbitCanvas');
    samplesEl = document.getElementById('orbitSamples');
    statusEl = document.getElementById('orbitStatus');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    loadState(hooks.storedState && hooks.storedState.orbitState ? hooks.storedState.orbitState : hooks.storedState);
    pickDefaultLayer();

    document.querySelectorAll('[data-orbit-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () { setTool(btn.dataset.orbitTool); });
    });
    setTool('orbit');

    const playBtn = document.getElementById('orbitPlayBtn');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        orbitPlaying = !orbitPlaying;
        playBtn.textContent = orbitPlaying ? '◼ STOP ORBITS' : '▶ PLAY ORBITS';
        playBtn.classList.toggle('on', orbitPlaying);
        lastAngles = {};
        orbits.forEach(function (o) { lastAngles[o.id] = getOrbitAngle(o); });
      });
    }
    const syncBtn = document.getElementById('orbitSyncBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        syncMain = !syncMain;
        syncBtn.textContent = syncMain ? 'SYNC: MAIN ▶' : 'SYNC: OFF';
        syncBtn.classList.toggle('on', syncMain);
        persist();
      });
      syncBtn.textContent = syncMain ? 'SYNC: MAIN ▶' : 'SYNC: OFF';
      syncBtn.classList.toggle('on', syncMain);
    }
    const gs = document.getElementById('orbitGrainSize');
    const gsv = document.getElementById('orbitGrainSizeVal');
    if (gs) {
      gs.value = grainSize;
      if (gsv) gsv.textContent = grainSize.toFixed(2) + ' s';
      gs.addEventListener('input', function () {
        grainSize = +gs.value;
        if (gsv) gsv.textContent = grainSize.toFixed(2) + ' s';
        persist();
      });
    }

    bindCanvas();
    renderSamples();
    resize();
    window.addEventListener('resize', resize);
    if (!raf) loop();
  }

  function refreshSamples() {
    pickDefaultLayer();
    renderSamples();
    draw();
  }

  function resetAngles() {
    lastAngles = {};
    orbits.forEach(function (o) { lastAngles[o.id] = getOrbitAngle(o); });
  }

  return { init, refreshSamples, resetAngles, get grainSize() { return grainSize; } };
})();
