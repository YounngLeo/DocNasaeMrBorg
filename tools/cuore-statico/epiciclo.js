/* CUORE_STATICO · EPICICLO orbital sequencer */
'use strict';

window.CuoreEpiciclo = (function () {
  const NAME = '// EPICICLO';
  const PALETTE = ['#ffb000', '#c678ff', '#4af6ff', '#ff2b4a', '#7ec8f8', '#e0533d', '#8a5fe0', '#00ff41'];
  const COL_RING = 'rgba(0,255,65,0.55)';
  const COL_RING_SEL = '#c678ff';
  const COL_STRIKE = 'rgba(0,255,65,0.4)';
  const COL_STRIKE_HOT = '#00ff41';
  const COL_STRIKE_SEL = '#c678ff';
  const COL_PREVIEW = '#c678ff';
  const COL_CROSS = 'rgba(0,255,65,0.35)';

  let deps = null;
  let cv = null;
  let ctx = null;
  let uid = 1;
  let drag = null;
  let raf = 0;
  let last = performance.now();
  let persistTimer = null;
  let AC = null;
  let masterGain = null;

  const S = {
    tool: 'orbit',
    orbits: [],
    samples: [],
    activeSample: null,
    sel: null
  };

  const pulses = [];
  const reduced = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  function NID() { return uid++; }

  function getBpm() {
    return deps && deps.getBpm ? deps.getBpm() : 76;
  }

  function isPlaying() {
    return deps && deps.isPlaying ? deps.isPlaying() : false;
  }

  async function audioInit() {
    if (deps && deps.initAudio) await deps.initAudio();
    if (AC) return;
    AC = Tone.getContext().rawContext;
    masterGain = AC.createGain();
    masterGain.gain.value = 1;
    connectMaster();
  }

  function connectMaster() {
    if (!masterGain || !deps) return;
    try { masterGain.disconnect(); } catch (e) {}
    const inp = deps.getMasterInput && deps.getMasterInput();
    if (inp) masterGain.connect(inp);
  }

  function toneInput(node) {
    if (!node) return null;
    return node.input != null ? node.input : node;
  }

  function trigger(sample, orbit, x, y) {
    if (!sample || !sample.buffer || !AC) return;
    const t = AC.currentTime;
    const src = AC.createBufferSource();
    src.buffer = sample.buffer;
    src.playbackRate.value = Math.pow(2, (sample.pit || 0) / 12);
    const g = AC.createGain();
    const v = (sample.vol || 90) / 100;
    g.gain.value = v * v;
    const pan = AC.createStereoPanner ? AC.createStereoPanner() : null;

    let dest = masterGain;
    if (sample.sourceLayer && deps && deps.getLayerGain) {
      const layerIn = toneInput(deps.getLayerGain(sample.sourceLayer));
      if (layerIn) dest = layerIn;
    }

    if (pan) {
      pan.pan.value = (sample.pan || 0) / 100;
      src.connect(g);
      g.connect(pan);
      pan.connect(dest);
    } else {
      src.connect(g);
      g.connect(dest);
    }
    try { src.start(t); } catch (e) {}
    pulses.push({ x: x, y: y, color: sample.color, t0: performance.now() });
  }

  function planetPos(o, a) {
    return [o.x + o.r * Math.cos(a), o.y + o.r * Math.sin(a)];
  }

  function sampleOf(id) {
    return S.samples.find(function (s) { return s.id === id; }) || null;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function pointFromEvent(e) {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  let W = 0;
  let H = 0;

  function resize() {
    if (!cv || !ctx) return;
    const stage = cv.parentElement;
    const r = (stage && stage.getBoundingClientRect().height > 2)
      ? stage.getBoundingClientRect()
      : cv.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = r.width;
    H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const rv = (n >> 16) & 255;
    const gv = (n >> 8) & 255;
    const bv = n & 255;
    return 'rgba(' + rv + ',' + gv + ',' + bv + ',' + a + ')';
  }

  function draw() {
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const now = performance.now();

    S.orbits.forEach(function (o) {
      const selOrbit = S.sel && S.sel.orbit === o && S.sel.kind === 'orbit';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.lineWidth = selOrbit ? 1.6 : 1.15;
      ctx.strokeStyle = selOrbit ? COL_RING_SEL : COL_RING;
      ctx.stroke();
      ctx.strokeStyle = selOrbit ? 'rgba(198,120,255,0.5)' : COL_CROSS;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(o.x - 4, o.y);
      ctx.lineTo(o.x + 4, o.y);
      ctx.moveTo(o.x, o.y - 4);
      ctx.lineTo(o.x, o.y + 4);
      ctx.stroke();

      o.strikes.forEach(function (st) {
        const ca = Math.cos(st.angle);
        const sa = Math.sin(st.angle);
        const inR = o.r - 7;
        const outR = o.r + 7;
        const hot = st.hit && (now - st.hit) < 150;
        ctx.beginPath();
        ctx.moveTo(o.x + ca * inR, o.y + sa * inR);
        ctx.lineTo(o.x + ca * outR, o.y + sa * outR);
        ctx.lineWidth = hot ? 2.4 : 1.6;
        ctx.strokeStyle = hot ? COL_STRIKE_HOT : (S.sel && S.sel.kind === 'strike' && S.sel.id === st.id ? COL_STRIKE_SEL : COL_STRIKE);
        ctx.stroke();
      });

      o.planets.forEach(function (pl) {
        const pp = planetPos(o, pl.angle);
        const px = pp[0];
        const py = pp[1];
        const sm = sampleOf(pl.sampleId);
        const col = sm ? sm.color : '#3d5a40';
        const isSel = S.sel && S.sel.kind === 'planet' && S.sel.id === pl.id;
        if (isSel) {
          ctx.beginPath();
          ctx.arc(px, py, 11, 0, Math.PI * 2);
          ctx.strokeStyle = COL_RING_SEL;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(px, py, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = sm ? '#00ff41' : '#1a4d22';
        ctx.stroke();
        if (!sm) {
          ctx.beginPath();
          ctx.arc(px, py, 6.5, 0, Math.PI * 2);
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = '#3d5a40';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    });

    if (drag && drag.mode === 'create') {
      ctx.beginPath();
      ctx.arc(drag.cx, drag.cy, Math.max(drag.r, 1), 0, Math.PI * 2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = COL_PREVIEW;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(drag.cx, drag.cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = COL_PREVIEW;
      ctx.fill();
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const age = (now - p.t0) / 420;
      if (age >= 1) { pulses.splice(i, 1); continue; }
      if (reduced) continue;
      const rr = 6.5 + age * 22;
      const al = (1 - age) * 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = hexA(p.color, al);
      ctx.lineWidth = 2 * (1 - age) + 0.5;
      ctx.stroke();
    }
  }

  function crossed(prev, cur, s, dir) {
    const TAU = Math.PI * 2;
    if (dir > 0) {
      if (cur <= prev) return false;
      const k = Math.ceil((prev - s) / TAU);
      const c = s + k * TAU;
      return c > prev && c <= cur;
    }
    if (cur >= prev) return false;
    const k = Math.floor((prev - s) / TAU);
    const c = s + k * TAU;
    return c < prev && c >= cur;
  }

  function loop(t) {
    if (W < 2 || H < 2) resize();
    const dt = Math.min((t - last) / 1000, 0.05);
    last = t;
    const bpm = getBpm();
    if (isPlaying()) {
      S.orbits.forEach(function (o) {
        const period = o.beats * 60 / bpm;
        const omega = o.dir * 2 * Math.PI / period;
        o.planets.forEach(function (pl) {
          const prev = pl.angle;
          pl.angle += omega * dt;
          const cur = pl.angle;
          if (!o.strikes.length) return;
          const sm = sampleOf(pl.sampleId);
          o.strikes.forEach(function (st) {
            if (crossed(prev, cur, st.angle, o.dir)) {
              st.hit = performance.now();
              if (sm) {
                const pp = planetPos(o, st.angle);
                trigger(sm, o, pp[0], pp[1]);
              }
            }
          });
        });
      });
    }
    draw();
    updateEphem();
    updateSyncBadge();
    raf = requestAnimationFrame(loop);
  }

  function nearestOrbitRing(x, y, thr) {
    let best = null;
    let bd = thr || 24;
    S.orbits.forEach(function (o) {
      const d = Math.abs(dist(x, y, o.x, o.y) - o.r);
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }

  function hitPlanet(x, y) {
    for (let i = S.orbits.length - 1; i >= 0; i--) {
      const o = S.orbits[i];
      for (let j = o.planets.length - 1; j >= 0; j--) {
        const pl = o.planets[j];
        const pp = planetPos(o, pl.angle);
        if (dist(x, y, pp[0], pp[1]) < 11) return { orbit: o, el: pl };
      }
    }
    return null;
  }

  function hitStrike(x, y) {
    for (let i = S.orbits.length - 1; i >= 0; i--) {
      const o = S.orbits[i];
      for (let j = o.strikes.length - 1; j >= 0; j--) {
        const st = o.strikes[j];
        const pp = planetPos(o, st.angle);
        if (dist(x, y, pp[0], pp[1]) < 11) return { orbit: o, el: st };
      }
    }
    return null;
  }

  function bindCanvas() {
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      const xy = pointFromEvent(e);
      const x = xy[0];
      const y = xy[1];
      const tool = S.tool;

      if (tool === 'orbit') {
        drag = { mode: 'create', cx: x, cy: y, r: 0 };
        return;
      }
      if (tool === 'planet') {
        const o = nearestOrbitRing(x, y, 30);
        if (o) {
          const a = Math.atan2(y - o.y, x - o.x);
          o.planets.push({ id: NID(), angle: a, sampleId: S.activeSample });
          refresh();
        } else toast("Disegna prima un'orbita (○)");
        return;
      }
      if (tool === 'strike') {
        const o = nearestOrbitRing(x, y, 30);
        if (o) {
          const a = Math.atan2(y - o.y, x - o.x);
          o.strikes.push({ id: NID(), angle: a, hit: 0 });
          refresh();
        } else toast("Disegna prima un'orbita (○)");
        return;
      }
      if (tool === 'move') {
        for (let i = S.orbits.length - 1; i >= 0; i--) {
          const o = S.orbits[i];
          const d = dist(x, y, o.x, o.y);
          if (Math.abs(d - o.r) < 14) {
            drag = { mode: 'resize', orbit: o };
            select(o, 'orbit', o.id);
            return;
          }
        }
        for (let i = S.orbits.length - 1; i >= 0; i--) {
          const o = S.orbits[i];
          if (dist(x, y, o.x, o.y) < o.r) {
            drag = { mode: 'moveOrbit', orbit: o, ox: x - o.x, oy: y - o.y };
            select(o, 'orbit', o.id);
            return;
          }
        }
        return;
      }
      if (tool === 'select') {
        const hp = hitPlanet(x, y);
        if (hp) {
          select(hp.orbit, 'planet', hp.el.id);
          drag = { mode: 'dragAngle', orbit: hp.orbit, el: hp.el };
          return;
        }
        const hs = hitStrike(x, y);
        if (hs) {
          select(hs.orbit, 'strike', hs.el.id);
          drag = { mode: 'dragAngle', orbit: hs.orbit, el: hs.el };
          return;
        }
        const o = nearestOrbitRing(x, y, 14);
        if (o) { select(o, 'orbit', o.id); return; }
        clearSel();
        return;
      }
      if (tool === 'delete') {
        const hp = hitPlanet(x, y);
        if (hp) {
          hp.orbit.planets = hp.orbit.planets.filter(function (p) { return p !== hp.el; });
          clearSel();
          refresh();
          return;
        }
        const hs = hitStrike(x, y);
        if (hs) {
          hs.orbit.strikes = hs.orbit.strikes.filter(function (p) { return p !== hs.el; });
          clearSel();
          refresh();
          return;
        }
        const o = nearestOrbitRing(x, y, 14);
        if (o) {
          S.orbits = S.orbits.filter(function (k) { return k !== o; });
          clearSel();
          refresh();
        }
      }
    });

    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const xy = pointFromEvent(e);
      const x = xy[0];
      const y = xy[1];
      if (drag.mode === 'create') drag.r = dist(x, y, drag.cx, drag.cy);
      else if (drag.mode === 'resize') drag.orbit.r = Math.max(24, dist(x, y, drag.orbit.x, drag.orbit.y));
      else if (drag.mode === 'moveOrbit') {
        drag.orbit.x = x - drag.ox;
        drag.orbit.y = y - drag.oy;
      } else if (drag.mode === 'dragAngle') {
        drag.el.angle = Math.atan2(y - drag.orbit.y, x - drag.orbit.x);
      }
    });

    function endDrag() {
      if (drag && drag.mode === 'create' && drag.r >= 24) {
        S.orbits.push({
          id: NID(), x: drag.cx, y: drag.cy, r: drag.r,
          beats: 4, dir: 1, planets: [], strikes: []
        });
        refresh();
      }
      drag = null;
      persistDebounced();
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
  }

  const BEATS = [1, 2, 3, 4, 6, 8, 12, 16];
  let strip = null;

  function select(orbit, kind, id) {
    S.sel = { orbit: orbit, kind: kind, id: id };
    renderStrip();
  }

  function clearSel() {
    S.sel = null;
    renderStrip();
    document.querySelectorAll('.epic-card.bind').forEach(function (c) {
      c.classList.remove('bind');
    });
  }

  function renderStrip() {
    if (!strip) return;
    if (!S.sel) { strip.style.display = 'none'; return; }
    strip.style.display = 'flex';
    const o = S.sel.orbit;
    if (S.sel.kind === 'orbit') {
      strip.innerHTML =
        '<span class="epic-kind">ORBITA</span>' +
        '<span class="epic-grp"><span class="epic-lab">GIRO</span>' +
        '<button type="button" class="epic-mini" data-act="bdec">−</button>' +
        '<span class="epic-val">' + o.beats + '</span>' +
        '<button type="button" class="epic-mini" data-act="binc">+</button>' +
        '<span class="epic-lab">battiti</span></span>' +
        '<span class="epic-grp"><span class="epic-lab">VERSO</span>' +
        '<button type="button" class="epic-mini" data-act="dir">' + (o.dir > 0 ? '↻' : '↺') + '</button></span>' +
        '<span class="epic-grp"><span class="epic-lab">' + o.planets.length + 'p · ' + o.strikes.length + 'm</span></span>' +
        '<button type="button" class="epic-mini epic-seldel" data-act="del" title="Elimina orbita">✕</button>';
    } else if (S.sel.kind === 'planet') {
      const pl = o.planets.find(function (p) { return p.id === S.sel.id; });
      const sm = pl ? sampleOf(pl.sampleId) : null;
      strip.innerHTML =
        '<span class="epic-kind">PIANETA</span>' +
        '<span class="epic-grp"><span class="epic-lab">VOCE</span>' +
        '<span class="epic-val" style="min-width:70px;color:' + (sm ? sm.color : 'var(--dim)') + '">' + (sm ? esc(sm.name) : '—') + '</span></span>' +
        '<span class="epic-hint">' + (sm ? 'clicca un campione per riassegnarlo' : 'clicca un campione per dare voce') + '</span>' +
        '<button type="button" class="epic-mini epic-seldel" data-act="del" title="Elimina pianeta">✕</button>';
      document.querySelectorAll('.epic-card').forEach(function (c) { c.classList.add('bind'); });
    } else if (S.sel.kind === 'strike') {
      strip.innerHTML =
        '<span class="epic-kind">MARKER</span>' +
        '<span class="epic-hint">trascina sull\'orbita per spostarlo</span>' +
        '<button type="button" class="epic-mini epic-seldel" data-act="del" title="Elimina marker">✕</button>';
    }
  }

  function bindStrip() {
    if (!strip) return;
    strip.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (!b || !S.sel) return;
      const o = S.sel.orbit;
      const act = b.dataset.act;
      if (act === 'binc') {
        const i = BEATS.indexOf(o.beats);
        o.beats = BEATS[Math.min(BEATS.length - 1, i + 1)];
      } else if (act === 'bdec') {
        const i = BEATS.indexOf(o.beats);
        o.beats = BEATS[Math.max(0, i - 1)];
      } else if (act === 'dir') {
        o.dir *= -1;
      } else if (act === 'del') {
        if (S.sel.kind === 'orbit') S.orbits = S.orbits.filter(function (k) { return k !== o; });
        else if (S.sel.kind === 'planet') o.planets = o.planets.filter(function (p) { return p.id !== S.sel.id; });
        else if (S.sel.kind === 'strike') o.strikes = o.strikes.filter(function (p) { return p.id !== S.sel.id; });
        clearSel();
        refresh();
        persistDebounced();
        return;
      }
      renderStrip();
      refresh();
      persistDebounced();
    });
  }

  function setTool(t) {
    S.tool = t;
    document.querySelectorAll('[data-epic-tool]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.epicTool === t);
    });
  }

  function abToB64(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    const C = 0x8000;
    for (let i = 0; i < b.length; i += C) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + C));
    }
    return btoa(s);
  }

  function b64ToAb(b64) {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  async function addSampleFromFile(file) {
    await audioInit();
    try {
      const buf = await file.arrayBuffer();
      const b64 = abToB64(buf);
      const audio = await AC.decodeAudioData(buf.slice(0));
      const color = PALETTE[S.samples.length % PALETTE.length];
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 22);
      S.samples.push({
        id: NID(), name: name, color: color, vol: 90, pit: 0, pan: 0,
        buffer: audio, fileData: b64, mime: file.type || 'audio/mpeg', sourceLayer: null
      });
      if (!S.activeSample) S.activeSample = S.samples[S.samples.length - 1].id;
      persistDebounced();
    } catch (err) {
      toast('Non riesco a leggere ' + file.name);
    }
  }

  async function addSampleFromBuffer(name, buffer, sourceLayer) {
    await audioInit();
    if (!buffer) return;
    const color = PALETTE[S.samples.length % PALETTE.length];
    let fileData = null;
    try {
      const ch = buffer.getChannelData(0);
      const copy = new Float32Array(ch.length);
      copy.set(ch);
      const off = AC.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        off.copyToChannel(buffer.getChannelData(c), c);
      }
      const wav = bufferToWav(off);
      fileData = abToB64(wav);
    } catch (e) {}
    const existing = S.samples.findIndex(function (s) { return s.sourceLayer === sourceLayer; });
    const sample = {
      id: existing >= 0 ? S.samples[existing].id : NID(),
      name: name, color: color, vol: 90, pit: 0, pan: 0,
      buffer: buffer, fileData: fileData, mime: 'audio/wav', sourceLayer: sourceLayer || null
    };
    if (existing >= 0) S.samples[existing] = sample;
    else S.samples.push(sample);
    S.activeSample = sample.id;
    renderSamples();
    persistDebounced();
    toast('CAP: ' + name);
  }

  function bufferToWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const len = buffer.length;
    const sr = buffer.sampleRate;
    const bytes = 44 + len * numCh * 2;
    const ab = new ArrayBuffer(bytes);
    const v = new DataView(ab);
    let o = 0;
    function ws(s) { for (let i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); }
    function w32(x) { v.setUint32(o, x, true); o += 4; }
    function w16(x) { v.setUint16(o, x, true); o += 2; }
    ws('RIFF'); w32(bytes - 8); ws('WAVE'); ws('fmt '); w32(16); w16(1); w16(numCh);
    w32(sr); w32(sr * numCh * 2); w16(numCh * 2); w16(16);
    ws('data'); w32(len * numCh * 2);
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
        w16(s < 0 ? s * 0x8000 : s * 0x7fff);
      }
    }
    return ab;
  }

  function renderSamples() {
    const wrap = document.getElementById('epicSamples');
    if (!wrap) return;
    if (!S.samples.length) {
      wrap.innerHTML = '<div class="epic-empty">Nessun campione.<br><b>CARICA</b> file audio oppure <b>CAP</b> da SYNTH.<br><br>Ogni campione è la <b>voce</b> di un pianeta (◇).</div>';
      return;
    }
    wrap.innerHTML = '';
    S.samples.forEach(function (s) {
      const used = S.orbits.reduce(function (n, o) {
        return n + o.planets.filter(function (p) { return p.sampleId === s.id; }).length;
      }, 0);
      const card = document.createElement('div');
      card.className = 'epic-card' + (s.id === S.activeSample ? ' active' : '');
      card.dataset.id = s.id;
      card.innerHTML =
        '<div class="epic-card-top">' +
        '<span class="epic-swatch" style="background:' + s.color + '"></span>' +
        '<span class="epic-card-name" title="' + esc(s.name) + '">' + esc(s.name) + '</span>' +
        '<span class="epic-card-count">' + used + 'p</span>' +
        '<button type="button" class="epic-card-x" title="Rimuovi">✕</button></div>' +
        '<div class="epic-row"><span class="epic-lab">VOL</span><input type="range" min="0" max="100" value="' + s.vol + '" data-p="vol"><span class="epic-num">' + s.vol + '</span></div>' +
        '<div class="epic-row"><span class="epic-lab">PIT</span><input type="range" min="-24" max="24" step="0.1" value="' + s.pit + '" data-p="pit"><span class="epic-num">' + s.pit.toFixed(1) + '</span></div>' +
        '<div class="epic-row"><span class="epic-lab">PAN</span><input type="range" min="-100" max="100" value="' + s.pan + '" data-p="pan"><span class="epic-num">' + s.pan + '</span></div>';
      card.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('input') || ev.target.closest('.epic-card-x')) return;
        if (S.sel && S.sel.kind === 'planet') {
          const pl = S.sel.orbit.planets.find(function (p) { return p.id === S.sel.id; });
          if (pl) {
            pl.sampleId = s.id;
            toast('Voce: ' + s.name);
            renderStrip();
            refresh();
            persistDebounced();
            return;
          }
        }
        S.activeSample = s.id;
        renderSamples();
      });
      card.querySelector('.epic-card-x').addEventListener('click', function (ev) {
        ev.stopPropagation();
        removeSample(s.id);
      });
      card.querySelectorAll('input[type=range]').forEach(function (inp) {
        inp.addEventListener('input', function () {
          const p = inp.dataset.p;
          const v = parseFloat(inp.value);
          s[p] = v;
          inp.parentElement.querySelector('.epic-num').textContent = p === 'pit' ? v.toFixed(1) : v;
          persistDebounced();
        });
        inp.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      });
      wrap.appendChild(card);
    });
    if (S.sel && S.sel.kind === 'planet') {
      document.querySelectorAll('.epic-card').forEach(function (c) { c.classList.add('bind'); });
    }
  }

  function removeSample(id) {
    S.samples = S.samples.filter(function (s) { return s.id !== id; });
    S.orbits.forEach(function (o) {
      o.planets.forEach(function (p) { if (p.sampleId === id) p.sampleId = null; });
    });
    if (S.activeSample === id) S.activeSample = S.samples[0] ? S.samples[0].id : null;
    refresh();
    persistDebounced();
  }

  function refresh() {
    renderSamples();
    updateEphem();
    updateHint();
  }

  function updateEphem() {
    const el = document.getElementById('epicEphem');
    if (!el) return;
    const orb = S.orbits.length;
    const pl = S.orbits.reduce(function (n, o) { return n + o.planets.length; }, 0);
    const st = S.orbits.reduce(function (n, o) { return n + o.strikes.length; }, 0);
    el.innerHTML = '<b>' + getBpm() + '</b> bpm · ' + orb + ' orbite · ' + S.samples.length + ' campioni · ' + pl + ' pianeti · ' + st + ' marker';
  }

  function updateSyncBadge() {
    const el = document.getElementById('epicSyncBadge');
    if (!el) return;
    el.textContent = isPlaying() ? 'SYNC ▶ MAIN' : 'STBY';
    el.classList.toggle('on', isPlaying());
  }

  function updateHint() {
    const el = document.getElementById('epicStagehint');
    if (el) el.style.opacity = S.orbits.length ? '0' : '1';
  }

  let toastT = null;
  function toast(msg) {
    const el = document.getElementById('epicToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  function esc(s) {
    return (s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function dl(href, name) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
  }

  function stamp() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function serializePatch() {
    return {
      name: NAME, version: 1, bpm: getBpm(),
      samples: S.samples.map(function (s) {
        return {
          id: s.id, name: s.name, color: s.color, vol: s.vol, pit: s.pit, pan: s.pan,
          fileData: s.fileData, mime: s.mime, sourceLayer: s.sourceLayer || null
        };
      }),
      orbits: S.orbits.map(function (o) {
        return {
          id: o.id, x: o.x, y: o.y, r: o.r, beats: o.beats, dir: o.dir,
          planets: o.planets.map(function (p) { return { id: p.id, angle: p.angle, sampleId: p.sampleId }; }),
          strikes: o.strikes.map(function (st) { return { id: st.id, angle: st.angle }; })
        };
      }),
      activeSample: S.activeSample,
      uid: uid
    };
  }

  async function loadPatch(patch) {
    await audioInit();
    S.samples = [];
    const list = patch.samples || [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      let buffer = null;
      if (s.fileData) {
        try { buffer = await AC.decodeAudioData(b64ToAb(s.fileData)); } catch (e) {}
      }
      S.samples.push({
        id: s.id, name: s.name, color: s.color, vol: s.vol, pit: s.pit, pan: s.pan,
        buffer: buffer, fileData: s.fileData, mime: s.mime, sourceLayer: s.sourceLayer || null
      });
    }
    S.orbits = (patch.orbits || []).map(function (o) {
      return Object.assign({}, o, {
        planets: o.planets.map(function (p) { return Object.assign({}, p); }),
        strikes: o.strikes.map(function (st) { return Object.assign({ hit: 0 }, st); })
      });
    });
    S.activeSample = patch.activeSample || (S.samples[0] && S.samples[0].id) || null;
    const ids = S.samples.map(function (s) { return s.id + 1; });
    uid = Math.max(uid, patch.uid || 1, ids.length ? Math.max.apply(null, ids) : 1, 1);
    clearSel();
    refresh();
  }

  function persistDebounced() {
    if (!deps || !deps.saveState) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      deps.saveState(serializePatch());
    }, 200);
  }

  function resetEngine() {
    S.orbits.forEach(function (o) {
      o.planets.forEach(function (pl) { pl.angle = pl.angle; });
    });
  }

  function bindUI() {
    document.querySelectorAll('[data-epic-tool]').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.epicTool); });
    });
    setTool('orbit');

    const filein = document.getElementById('epicFilein');
    const addsample = document.getElementById('epicAddsample');
    if (addsample && filein) {
      addsample.addEventListener('click', function () { filein.click(); });
      filein.addEventListener('change', async function (e) {
        for (let i = 0; i < e.target.files.length; i++) {
          await addSampleFromFile(e.target.files[i]);
        }
        filein.value = '';
        renderSamples();
      });
    }

    document.querySelectorAll('[data-epic-cap]').forEach(function (btn) {
      const orig = btn.textContent;
      btn.addEventListener('click', async function () {
        const layer = btn.dataset.epicCap;
        btn.textContent = '…';
        if (deps && deps.captureLayer) await deps.captureLayer(layer);
        const buf = deps && deps.getGrainBuffer ? deps.getGrainBuffer(layer) : null;
        if (buf) await addSampleFromBuffer(layer.toUpperCase(), buf, layer);
        else toast('CAP fallita — verifica SYNTH');
        btn.textContent = orig;
      });
    });

    const saveBtn = document.getElementById('epicSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        const blob = new Blob([JSON.stringify(serializePatch())], { type: 'application/json' });
        dl(URL.createObjectURL(blob), 'epiciclo-' + stamp() + '.json');
        toast('Patch salvata');
      });
    }

    const patchfile = document.getElementById('epicPatchfile');
    const loadBtn = document.getElementById('epicLoad');
    if (loadBtn && patchfile) {
      loadBtn.addEventListener('click', function () { patchfile.click(); });
      patchfile.addEventListener('change', async function (e) {
        const f = e.target.files[0];
        if (!f) return;
        patchfile.value = '';
        try {
          await loadPatch(JSON.parse(await f.text()));
          persistDebounced();
          toast('Patch caricata');
        } catch (err) {
          toast('File patch non valido');
        }
      });
    }

    const pngBtn = document.getElementById('epicPng');
    if (pngBtn) {
      pngBtn.addEventListener('click', function () {
        const tmp = document.createElement('canvas');
        tmp.width = cv.width;
        tmp.height = cv.height;
        const tc = tmp.getContext('2d');
        tc.fillStyle = '#080808';
        tc.fillRect(0, 0, tmp.width, tmp.height);
        tc.drawImage(cv, 0, 0);
        dl(tmp.toDataURL('image/png'), 'epiciclo-' + stamp() + '.png');
      });
    }

    const panelToggle = document.getElementById('epicPaneltoggle');
    const panel = document.getElementById('epicPanel');
    if (panelToggle && panel) {
      panelToggle.addEventListener('click', function () { panel.classList.toggle('open'); });
    }

    window.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const tab = document.getElementById('tab-grain');
      if (!tab || !tab.classList.contains('active')) return;
      const map = { o: 'orbit', p: 'planet', s: 'strike', m: 'move', v: 'select', x: 'delete' };
      if (map[e.key]) setTool(map[e.key]);
      else if (e.code === 'Space' && deps && deps.togglePlay) {
        e.preventDefault();
        deps.togglePlay();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) {
        const del = strip && strip.querySelector('[data-act="del"]');
        if (del) del.click();
      }
    });
  }

  async function init(hooks) {
    deps = hooks;
    cv = document.getElementById('epicScope');
    strip = document.getElementById('epicSelstrip');
    if (!cv) return;
    ctx = cv.getContext('2d');

    const title = document.getElementById('epicTitle');
    if (title) title.textContent = NAME;

    bindCanvas();
    bindStrip();
    bindUI();
    resize();
    const stage = cv.parentElement;
    if (stage) new ResizeObserver(resize).observe(stage);
    new ResizeObserver(resize).observe(cv);

    const stored = hooks.storedState && hooks.storedState.epicicloState
      ? hooks.storedState.epicicloState
      : null;
    if (stored && (stored.samples || stored.orbits)) {
      await loadPatch(stored);
    } else {
      refresh();
    }

    await audioInit();
    connectMaster();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  return {
    init: init,
    resize: resize,
    resetEngine: resetEngine,
    refresh: refresh,
    addSampleFromBuffer: addSampleFromBuffer
  };
})();
