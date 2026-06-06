/**
 * CUORE_STATICO · PORTAL — sessione LAN/rete condivisa
 * WebRTC (PeerJS) · mix audio sommato · tracce spettro nello spazio colore
 */
(function (global) {
  'use strict';

  const PEER_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PEER_OPTS = {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  };
  const TRAIL_MAX = 220;
  const SUB_TRAIL_MAX = 120;
  const TRAIL_BX = 118;
  const TRAIL_BY = 92;
  let bpmMaxSaved = 140;
  const LAYER_KEYS = ['pad', 'bass', 'lead', 'drums', 'noise', 'sample'];
  const LAYER_BRANCH = { pad: 0, bass: 1, lead: 2, drums: 3, noise: 4, sample: 5 };

  let studio = null;
  let peer = null;
  let myId = '';
  let myName = '';
  let myHue = 0;
  let roomCode = '';
  let isHost = false;
  let portalOpen = false;
  let localStream = null;
  let peerReady = false;
  let hostIdRetry = false;
  const dataConns = new Map();
  const remoteStreams = new Map();
  const remoteGains = new Map();
  const remoteAudioEls = new Map();
  const activeCalls = new Set();
  const callAttemptAt = new Map();
  const peers = new Map();
  let canvas = null;
  let ctx = null;
  let animId = null;
  let trailTimer = null;
  let selfTrail = null;
  const peerReadyWaiters = [];

  function $(id) { return document.getElementById(id); }

  function loadPeerJS() {
    if (global.Peer) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = PEER_CDN;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function randCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[(Math.random() * chars.length) | 0];
    return s;
  }

  function hashHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
  }

  function hsl(h, s, l, a) {
    return 'hsla(' + h + ',' + s + '%,' + l + '%,' + (a == null ? 1 : a) + ')';
  }

  function whenPeerReady(fn) {
    if (peerReady && myId) { fn(); return; }
    peerReadyWaiters.push(fn);
  }

  function flushPeerReady() {
    peerReady = true;
    while (peerReadyWaiters.length) peerReadyWaiters.shift()();
  }

  function hostPeerId() {
    return roomCode ? 'cuore-host-' + roomCode.toLowerCase() : '';
  }

  /** Guest → host only (1 call bidirezionale per coppia; l'host risponde). */
  function shouldInitiateCall(remoteId) {
    if (!myId || !remoteId || remoteId === myId) return false;
    if (isHost) return false;
    return remoteId === hostPeerId();
  }

  function connectDataTo(peerId) {
    if (!peer || !peerId || peerId === myId || dataConns.has(peerId)) return;
    try {
      setupDataConn(peer.connect(peerId, { reliable: true }));
    } catch (e) {
      console.warn('connectDataTo', peerId, e);
    }
  }

  function meshAllKnownPeers() {
    if (!peer || !myId) return;
    ensureLocalStream().then(function (stream) {
      if (!stream || !peer) return;
      peers.forEach(function (_, id) {
        connectDataTo(id);
      });
      if (!isHost && roomCode) {
        const hid = hostPeerId();
        connectDataTo(hid);
        meshCall(hid);
      }
    });
  }

  let meshRetryTimer = null;
  let bpmSyncTimer = null;
  let lastBpmSeq = 0;
  let lastSentBpm = -1;

  function hasLiveRemoteStream(peerId) {
    const s = remoteStreams.get(peerId);
    if (!s) return false;
    return s.getAudioTracks().some(function (t) { return t.readyState === 'live'; });
  }

  function startMeshRetry() {
    if (meshRetryTimer) clearInterval(meshRetryTimer);
    meshRetryTimer = setInterval(function () {
      if (!portalOpen) return;
      ensureLocalStream().then(function () { meshAllKnownPeers(); });
    }, 2500);
  }

  function stopMeshRetry() {
    if (meshRetryTimer) { clearInterval(meshRetryTimer); meshRetryTimer = null; }
  }

  function startBpmSync() {
    if (bpmSyncTimer) clearInterval(bpmSyncTimer);
    if (!isHost) return;
    bpmSyncTimer = setInterval(function () {
      if (!portalOpen || !myId) return;
      pushAuthoritativeBpm(portalBpmNow(), true);
    }, 800);
  }

  function stopBpmSync() {
    if (bpmSyncTimer) { clearInterval(bpmSyncTimer); bpmSyncTimer = null; }
  }


  function mkTrailUser(id, name, hue, entryAngle) {
    const sub = {};
    LAYER_KEYS.forEach(function (k) { sub[k] = []; });
    return {
      id, name, hue,
      x: 0, y: 0, z: 0,
      entryAngle: entryAngle || 0,
      trail: [{ x: 0, y: 0, z: 0, e: 0.05 }],
      subTrails: sub,
      lastSeen: Date.now(),
      playing: false,
      hasAudio: false
    };
  }

  function binsFromStudio() {
    if (!studio || !studio.getSpectrum) return new Float32Array(16);
    const raw = studio.getSpectrum();
    const out = new Float32Array(16);
    const n = raw.length || 1;
    let peak = 0;
    for (let i = 0; i < 16; i++) {
      const i0 = Math.floor(i / 16 * n);
      const i1 = Math.max(i0 + 1, Math.floor((i + 1) / 16 * n));
      let s = 0;
      for (let j = i0; j < i1; j++) s += Math.max(0, (raw[j] + 100) / 100);
      out[i] = s / (i1 - i0);
      peak = Math.max(peak, out[i]);
    }
    if (peak < 0.02 && studio.getMeterLevel) {
      const m = studio.getMeterLevel();
      out[0] = m; out[4] = m * 0.8; out[8] = m * 0.5;
    }
    return out;
  }

  function clampTrailPoint(x, y) {
    return [
      Math.max(-TRAIL_BX, Math.min(TRAIL_BX, x)),
      Math.max(-TRAIL_BY, Math.min(TRAIL_BY, y))
    ];
  }

  function trailScale(w, h) {
    return {
      sx: (w * 0.4) / TRAIL_BX,
      sy: (h * 0.4) / TRAIL_BY
    };
  }

  function toScreen(x, y, z, cx, cy, sc) {
    return [cx + x * sc.sx, cy + y * sc.sy - z * 6];
  }

  function advanceTrail(user, bins, activeLayers, pos) {
    const energy = bins.length
      ? bins.reduce(function (a, b) { return a + b; }, 0) / bins.length
      : 0.05;
    if (pos && pos.x != null && pos.y != null) {
      user.x = pos.x;
      user.y = pos.y;
      user.z = pos.z != null ? pos.z : user.z;
    } else {
      const spread = ((bins[2] - bins[0]) * 9 + Math.cos(user.entryAngle) * (1.2 + energy * 3.5)) * 0.65;
      const lift = ((bins[6] - bins[4]) * 7 + Math.sin(user.entryAngle) * (1.2 + energy * 3)) * 0.65;
      user.x += spread;
      user.y += lift;
      user.x *= 0.985;
      user.y *= 0.985;
      const c = clampTrailPoint(user.x, user.y);
      user.x = c[0];
      user.y = c[1];
      user.z = user.z * 0.92 + bins[7] * 0.08;
    }
    user.trail.push({ x: user.x, y: user.y, z: user.z, e: energy });
    if (user.trail.length > TRAIL_MAX) user.trail.shift();

    (activeLayers || []).forEach(function (layer) {
      const branch = user.subTrails[layer];
      if (!branch) return;
      const li = LAYER_BRANCH[layer] || 0;
      const ang = user.entryAngle + li * 1.05 + user.trail.length * 0.018;
      const rad = 6 + bins[li % 16] * 18 + li * 2;
      let bx = user.x + Math.cos(ang) * rad;
      let by = user.y + Math.sin(ang) * rad;
      const bc = clampTrailPoint(bx, by);
      branch.push({
        x: bc[0], y: bc[1],
        z: user.z + bins[(li + 3) % 16] * 0.5
      });
      if (branch.length > SUB_TRAIL_MAX) branch.shift();
    });
    user.lastSeen = Date.now();
  }

  function drawPortal() {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.52;
    const sc = trailScale(w, h);

    ctx.fillStyle = 'rgba(10,5,8,0.45)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(198,120,255,0.07)';
    ctx.lineWidth = 1;
    for (let gy = 0; gy < h; gy += 28) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
    for (let gx = 0; gx < w; gx += 28) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,43,74,0.2)';
    ctx.setLineDash([4, 4]);
    const bx = TRAIL_BX * sc.sx;
    const by = TRAIL_BY * sc.sy;
    ctx.strokeRect(cx - bx, cy - by, bx * 2, by * 2);
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,43,74,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(198,120,255,0.08)';
    ctx.fill();
    ctx.font = '9px Courier New';
    ctx.fillStyle = 'rgba(198,120,255,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText('PORTAL', 0, 4);
    ctx.restore();

    const all = [selfTrail].concat(Array.from(peers.values()).filter(function (u) {
      return u && u.id !== myId;
    })).filter(Boolean);
    all.sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    all.forEach(function (user) { if (user) drawUserStreets(user, cx, cy, sc); });

    animId = requestAnimationFrame(drawPortal);
  }

  function drawUserStreets(user, cx, cy, sc) {
    const hue = user.hue;

    LAYER_KEYS.forEach(function (layer) {
      const branch = user.subTrails && user.subTrails[layer];
      if (!branch || branch.length < 2) return;
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = hsl(hue, 55, 42 + LAYER_BRANCH[layer] * 4, 0.35);
      ctx.beginPath();
      branch.forEach(function (p, i) {
        const pt = toScreen(p.x, p.y, p.z, cx, cy, sc);
        if (i === 0) ctx.moveTo(pt[0], pt[1]);
        else ctx.lineTo(pt[0], pt[1]);
      });
      ctx.stroke();
    });

    const trail = user.trail;
    if (trail.length >= 1) {
      const head = trail[trail.length - 1];
      const ht = toScreen(head.x, head.y, head.z, cx, cy, sc);
      ctx.fillStyle = hsl(hue, 85, 62, 0.95);
      ctx.beginPath();
      ctx.arc(ht[0], ht[1], 3 + (head.e || 0) * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '8px Courier New';
      ctx.fillStyle = hsl(hue, 60, 70, 0.85);
      ctx.textAlign = 'left';
      ctx.fillText(user.name.slice(0, 12) + (user.hasAudio ? ' ♪' : ''), ht[0] + 8, ht[1] - 6);
    }
    if (trail.length < 2) return;

    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1];
      const p1 = trail[i];
      const t = i / trail.length;
      const a = toScreen(p0.x, p0.y, p0.z, cx, cy, sc);
      const b = toScreen(p1.x, p1.y, p1.z, cx, cy, sc);
      ctx.lineWidth = 1.2 + p1.e * 2.5;
      ctx.strokeStyle = hsl(hue, 72, 38 + t * 28, 0.25 + t * 0.65);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }

  function setStatus(msg) {
    const el = $('portalStatus');
    if (el) el.textContent = msg;
  }

  function fanout(msg, exceptId) {
    dataConns.forEach(function (conn, id) {
      if (exceptId && id === exceptId) return;
      if (conn.open) try { conn.send(msg); } catch (e) {}
    });
  }

  function broadcast(msg, exceptId) {
    fanout(msg, exceptId);
  }

  function sessionStreamCount() {
    let n = 0;
    if (localStream && localStream.getAudioTracks().some(function (t) { return t.readyState === 'live'; })) n++;
    remoteStreams.forEach(function (stream, id) {
      if (id === myId) return;
      if (stream.getAudioTracks().some(function (t) { return t.readyState === 'live'; })) n++;
    });
    return n;
  }

  function updateSelfAudioFlag() {
    if (!selfTrail) return;
    selfTrail.hasAudio = !!(localStream && localStream.getAudioTracks().some(function (t) {
      return t.enabled && t.readyState === 'live';
    }));
  }

  function pruneStaleRemotePeers(validIds) {
    remoteStreams.forEach(function (_, id) {
      if (id !== myId && validIds.indexOf(id) < 0) removeRemotePeer(id);
    });
  }

  function renderPeerList() {
    const el = $('portalPeers');
    if (!el) return;
    const rows = [selfTrail].concat(Array.from(peers.values()).filter(function (p) {
      return p && p.id !== myId;
    })).filter(Boolean);
    updateSelfAudioFlag();
    el.innerHTML = rows.map(function (p) {
      const local = p.id === myId ? ' · tu' : '';
      const aud = p.hasAudio ? ' · audio' : '';
      return '<div class="portal-peer"><i style="background:hsl(' + p.hue + ',70%,50%)"></i>' +
        p.name + local + aud + '</div>';
    }).join('') +
      '<div class="portal-peer" style="opacity:0.55;margin-top:6px">// stream attivi: ' +
      sessionStreamCount() + ' · operatori: ' + rows.length + ' · data: ' + dataConns.size + '</div>';
  }

  function sendRoster() {
    if (!isHost) return;
    const list = [{ id: myId, name: myName, hue: myHue }];
    peers.forEach(function (p, id) {
      list.push({ id: id, name: p.name, hue: p.hue });
    });
    lastBpmSeq++;
    broadcast({ type: 'roster', peers: list, bpm: portalBpmNow(), seq: lastBpmSeq });
  }

  function applyTrailMessage(msg) {
    if (!msg || msg.id === myId) return;
    let u = peers.get(msg.id);
    if (!u) {
      u = mkTrailUser(msg.id, msg.name || msg.id.slice(0, 6), msg.hue != null ? msg.hue : hashHue(msg.id), msg.entryAngle || 0);
      peers.set(msg.id, u);
    }
    u.name = msg.name || u.name;
    u.hue = msg.hue != null ? msg.hue : u.hue;
    u.playing = !!msg.playing;
    if (msg.entryAngle != null) u.entryAngle = msg.entryAngle;
    if (msg.hasAudio != null) u.hasAudio = !!msg.hasAudio;
    const bins = new Float32Array(msg.bins || []);
    const pos = (msg.x != null && msg.y != null)
      ? { x: msg.x, y: msg.y, z: msg.z }
      : null;
    advanceTrail(u, bins, msg.layers || [], pos);
    u.lastSeen = Date.now();
  }

  function handleData(msg, fromId) {
    if (!msg || !msg.type) return;

    if (msg.type === 'hello') {
      if (msg.id === myId) return;
      if (!peers.has(msg.id)) {
        peers.set(msg.id, mkTrailUser(msg.id, msg.name, msg.hue, msg.entryAngle));
      }
      connectDataTo(msg.id);
      if (!isHost) meshCall(msg.id);
      if (msg.bpm != null && !isHost) applyRemoteBpm(msg.bpm, msg.seq || 0);
      if (isHost) {
        sendRoster();
        connectDataTo(msg.id);
        broadcast({
          type: 'hello', id: myId, name: myName, hue: myHue,
          entryAngle: selfTrail ? selfTrail.entryAngle : 0,
          bpm: portalBpmNow()
        }, msg.id);
      }
      renderPeerList();
      meshAllKnownPeers();
      return;
    }

    if (msg.type === 'roster') {
      const validIds = [myId];
      (msg.peers || []).forEach(function (p, i) {
        if (p.id === myId) return;
        validIds.push(p.id);
        if (!peers.has(p.id)) {
          peers.set(p.id, mkTrailUser(p.id, p.name, p.hue, (i * 2.39996) % (Math.PI * 2)));
        }
        connectDataTo(p.id);
        if (!isHost) meshCall(p.id);
      });
      pruneStaleRemotePeers(validIds);
      if (msg.bpm != null && !isHost) applyRemoteBpm(msg.bpm, msg.seq || 0);
      renderPeerList();
      meshAllKnownPeers();
      return;
    }

    if (msg.type === 'trail') {
      applyTrailMessage(msg);
      fanout(msg, fromId);
      renderPeerList();
      return;
    }

    if (msg.type === 'transport') {
      if (isHost) return;
      if (studio && studio.applyTransport) studio.applyTransport(msg);
      return;
    }

    if (msg.type === 'transport-relay' && isHost) {
      broadcast({
        type: 'transport',
        playing: msg.playing,
        beat16: msg.beat16,
        bpm: msg.bpm
      });
      return;
    }

    if (msg.type === 'bpm-set') {
      applyRemoteBpm(msg.bpm, msg.seq);
      return;
    }

    if (msg.type === 'bpm-relay' && isHost) {
      pushAuthoritativeBpm(Math.round(msg.bpm), true);
      return;
    }
  }

  function sendHello(conn) {
    if (!conn.open) return;
    conn.send({
      type: 'hello',
      id: myId,
      name: myName,
      hue: myHue,
      entryAngle: selfTrail ? selfTrail.entryAngle : 0,
      bpm: portalBpmNow()
    });
  }

  function syncBpmOut() {
    if (!portalOpen || !studio || !myId) return;
    if (isHost) pushAuthoritativeBpm(portalBpmNow());
  }

  function onBpmChange(bpm) {
    if (!portalOpen) return;
    sendBpm(bpm);
  }

  function setupDataConn(conn) {
    if (!conn) return;
    const pid = conn.peer;
    const existing = dataConns.get(pid);
    if (existing && existing !== conn) {
      try { existing.close(); } catch (e) {}
    }
    dataConns.set(pid, conn);
    conn.on('data', function (data) { handleData(data, pid); });
    conn.on('close', function () {
      if (dataConns.get(pid) === conn) dataConns.delete(pid);
    });
    conn.on('error', function (err) { console.warn('portal data err', err); });
    if (conn.open) {
      sendHello(conn);
      if (isHost) sendRoster();
      syncBpmOut();
    } else {
      conn.on('open', function () {
        sendHello(conn);
        if (isHost) sendRoster();
        syncBpmOut();
      });
    }
  }

  function routeRemoteStream(stream) {
    const Tone = studio.Tone;
    const ctx = Tone.context.rawContext;
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 1.5;
    source.connect(gain);

    const remoteIn = studio.portalRemoteIn;
    if (remoteIn) {
      const dest = remoteIn.input || remoteIn;
      try {
        gain.connect(dest);
      } catch (e) {
        Tone.connect(gain, remoteIn);
      }
    } else {
      gain.connect(ctx.destination);
    }

    return {
      source: source,
      gain: gain,
      dispose: function () {
        try { source.disconnect(); gain.disconnect(); } catch (e) {}
      }
    };
  }

  function removeRemotePeer(peerId) {
    activeCalls.delete(peerId);
    remoteStreams.delete(peerId);
    const g = remoteGains.get(peerId);
    if (g) {
      try {
        if (g.dispose) g.dispose();
        else if (g.disconnect) g.disconnect();
      } catch (e) {}
    }
    remoteGains.delete(peerId);
    const aud = remoteAudioEls.get(peerId);
    if (aud) { aud.srcObject = null; aud.remove(); }
    remoteAudioEls.delete(peerId);
    const p = peers.get(peerId);
    if (p) p.hasAudio = false;
  }

  async function addRemoteAudio(peerId, stream, meta) {
    if (!studio || !stream || !peerId || peerId === myId) return;
    if (studio.unlockAudio) await studio.unlockAudio();
    if (studio.initAudio) await studio.initAudio();

    removeRemotePeer(peerId);
    remoteStreams.set(peerId, stream);
    stream.getAudioTracks().forEach(function (t) { t.enabled = true; });

    const aud = document.createElement('audio');
    aud.autoplay = true;
    aud.playsInline = true;
    aud.setAttribute('playsinline', '');
    aud.volume = 1;
    aud.muted = false;
    aud.srcObject = stream;
    aud.id = 'portal-aud-' + String(peerId).slice(-8);
    aud.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;opacity:0;pointer-events:none';
    document.body.appendChild(aud);
    remoteAudioEls.set(peerId, aud);

    try {
      await aud.play();
    } catch (e) {
      console.warn('portal aud play', e);
    }

    if (meta && meta.name) {
      if (!peers.has(peerId)) {
        peers.set(peerId, mkTrailUser(peerId, meta.name, meta.hue || hashHue(peerId), 0));
      }
    } else if (!peers.has(peerId)) {
      peers.set(peerId, mkTrailUser(peerId, peerId.slice(-6), hashHue(peerId), 0));
    }
    const pu = peers.get(peerId);
    if (pu) pu.hasAudio = true;
    renderPeerList();
    setStatus('// AUDIO · ' + sessionStreamCount() + ' stream · ' + peerId.slice(-6));
    updateSelfAudioFlag();
    unlockPlayback();
  }

  function unlockPlayback() {
    if (studio && studio.unlockAudio) studio.unlockAudio();
    remoteAudioEls.forEach(function (aud) {
      if (aud.srcObject) aud.play().catch(function () {});
    });
  }

  function portalBpmNow() {
    if (!studio || !studio.getBpm) return 76;
    return Math.round(studio.getBpm());
  }

  function applyRemoteBpm(bpm, seq) {
    if (!studio || !studio.applyPortalBpm) return;
    const v = Math.round(bpm);
    if (seq && seq <= lastBpmSeq && v === lastSentBpm) return;
    if (seq) lastBpmSeq = seq;
    lastSentBpm = v;
    studio.applyPortalBpm(v);
    const st = $('portalStatus');
    if (st && portalOpen) st.textContent = '// BPM SYNC · ' + v;
  }

  function pushAuthoritativeBpm(bpm, force) {
    const v = Math.round(bpm);
    if (!force && v === lastSentBpm) return;
    lastSentBpm = v;
    lastBpmSeq++;
    broadcast({ type: 'bpm-set', bpm: v, seq: lastBpmSeq, from: 'host' });
    applyRemoteBpm(v, lastBpmSeq);
  }

  function sendBpm(bpm) {
    const v = Math.round(bpm);
    if (isHost) pushAuthoritativeBpm(v, true);
    else dataConns.forEach(function (conn) {
      if (conn.open) try { conn.send({ type: 'bpm-relay', bpm: v, from: myId }); } catch (e) {}
    });
  }

  function wireBpmSlider() {
    const el = $('bpm');
    if (!el || el.dataset.portalBpmWired) return;
    el.dataset.portalBpmWired = '1';
    el.addEventListener('input', function () {
      if (global.CUORE && CUORE.portalSyncLock) return;
      if (!portalOpen) return;
      onBpmChange(parseInt(el.value, 10) || 76);
    });
  }


  function enterPortalBoost() {
    document.body.classList.add('portal-boost');
    const bpmEl = $('bpm');
    if (bpmEl) {
      bpmMaxSaved = parseFloat(bpmEl.max) || 140;
      bpmEl.max = 170;
    }
    const tag = $('bpmPortalTag');
    if (tag) tag.textContent = ' · SYNC · MAX170';
    syncBpmOut();
  }

  function leavePortalBoost() {
    document.body.classList.remove('portal-boost');
    const bpmEl = $('bpm');
    if (bpmEl) bpmEl.max = bpmMaxSaved || 140;
    const tag = $('bpmPortalTag');
    if (tag) tag.textContent = '';
  }

  function meshCall(remoteId) {
    if (!peer || !remoteId || remoteId === myId) return;
    if (!shouldInitiateCall(remoteId)) return;
    if (hasLiveRemoteStream(remoteId)) return;
    if (activeCalls.has(remoteId)) {
      const t0 = callAttemptAt.get(remoteId) || 0;
      if (Date.now() - t0 < 5000) return;
      activeCalls.delete(remoteId);
    }

    ensureLocalStream().then(function (stream) {
      if (!stream || !peer || hasLiveRemoteStream(remoteId)) return;
      activeCalls.add(remoteId);
      callAttemptAt.set(remoteId, Date.now());
      try {
        const call = peer.call(remoteId, localStream, {
          metadata: { id: myId, name: myName, hue: myHue }
        });
        if (!call) { activeCalls.delete(remoteId); return; }
        call.on('stream', function (remoteStream) {
          activeCalls.delete(remoteId);
          const pm = peers.get(remoteId);
          addRemoteAudio(remoteId, remoteStream, pm
            ? { id: remoteId, name: pm.name, hue: pm.hue }
            : (call.metadata || {}));
        });
        call.on('close', function () {
          activeCalls.delete(remoteId);
        });
        call.on('error', function () {
          activeCalls.delete(remoteId);
        });
      } catch (e) {
        activeCalls.delete(remoteId);
        console.warn('meshCall', e);
      }
    });
  }

  function refreshMeshAudio() {
    if (!portalOpen || !peer) return;
    ensureLocalStream().then(function (s) {
      if (!s) return;
      if (!isHost) {
        const hid = hostPeerId();
        activeCalls.delete(hid);
        meshCall(hid);
      }
      unlockPlayback();
    });
  }

  function setupPeerHandlers() {
    peer.on('open', function (id) {
      myId = id;
      if (selfTrail) selfTrail.id = id;
      flushPeerReady();
      setStatus('// ONLINE · ' + id.slice(-8));
      startTrailSync();
      syncBpmOut();
      meshAllKnownPeers();
      renderPeerList();
    });

    peer.on('connection', setupDataConn);

    peer.on('call', function (call) {
      const pid = call.peer;
      ensureLocalStream().then(function () {
        if (!localStream) { call.close(); return; }
        call.answer(localStream);
        call.on('stream', function (stream) {
          addRemoteAudio(pid, stream, call.metadata || {});
        });
        activeCalls.add(pid);
        call.on('close', function () {
          activeCalls.delete(pid);
          removeRemotePeer(pid);
        });
        call.on('error', function () {
          activeCalls.delete(pid);
          removeRemotePeer(pid);
        });
        if (!dataConns.has(pid)) connectDataTo(pid);
      });
    });

    peer.on('error', function (err) {
      const typ = err.type || err.message || 'peer';
      setStatus('// ERR · ' + typ);
      console.warn('portal peer err', err);
      if (isHost && typ === 'unavailable-id' && !hostIdRetry) {
        hostIdRetry = true;
        roomCode = randCode();
        if ($('portalRoomCode')) $('portalRoomCode').textContent = roomCode;
        setStatus('// CODICE OCCUPATO · nuovo ' + roomCode);
        createHostPeer('cuore-host-' + roomCode.toLowerCase());
      }
    });

    peer.on('disconnected', function () {
      setStatus('// RECONNECT…');
      if (peer && !peer.destroyed) peer.reconnect();
    });
  }

  async function ensureLocalStream() {
    if (studio.unlockAudio) await studio.unlockAudio();
    await studio.initAudio();
    const s = studio.getSendStream && studio.getSendStream();
    if (!s) return null;
    localStream = s;
    s.getAudioTracks().forEach(function (t) { t.enabled = true; });
    updateSelfAudioFlag();
    return localStream;
  }

  function beginSessionUI() {
    if ($('portalRoomCode')) $('portalRoomCode').textContent = roomCode;
    if ($('portalRoomWrap')) $('portalRoomWrap').hidden = false;
    if (!selfTrail) selfTrail = mkTrailUser(myId || ('local-' + roomCode), myName, myHue, 0);
    else { selfTrail.id = myId || selfTrail.id; selfTrail.name = myName; selfTrail.hue = myHue; }
    if (!portalOpen) openPortalUI();
  }

  function createHostPeer(hostId) {
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    peerReady = false;
    peer = new Peer(hostId, PEER_OPTS);
    setupPeerHandlers();
  }

async function hostPortal(code) {
  roomCode = (code || randCode()).trim().toUpperCase();
  isHost = true;
  hostIdRetry = false;
  myName = ($('portalName') && $('portalName').value.trim()) || myName;
  myHue = hashHue(myName);
  selfTrail = mkTrailUser('local-' + roomCode, myName, myHue, 0);
  beginSessionUI();
  setStatus('// AVVIO PORTAL…');
  try {
    await loadPeerJS();
    await ensureLocalStream();

    const hostId = 'cuore-host-' + roomCode.toLowerCase();
    createHostPeer(hostId);

    whenPeerReady(function () {
      if (selfTrail) selfTrail.id = myId;
      setStatus('// HOST · room ' + roomCode);
    });

    setTimeout(function () {
      if (!peerReady && portalOpen) {
        setStatus('// ATTERRAGGIO LENTO · verifica rete');
      }
    }, 10000);
  } catch (e) {
    console.error('hostPortal', e);
    setStatus('// ERR · ' + (e.message || 'avvio portal'));
  }
}

async function joinPortal(code) {
  code = (code || '').trim().toUpperCase();
  if (!code) { setStatus('// INSERISCI CODICE'); return; }
  roomCode = code;
  isHost = false;
  myName = ($('portalName') && $('portalName').value.trim()) || myName;
  myHue = hashHue(myName);
  selfTrail = mkTrailUser('local-' + code, myName, myHue, Math.random() * Math.PI * 2);
  beginSessionUI();
  setStatus('// AVVIO PORTAL…');
  try {
    await loadPeerJS();
    await ensureLocalStream();

    peerReady = false;
    peer = new Peer(undefined, PEER_OPTS);
    setupPeerHandlers();

    setStatus('// CONNESSIONE PEER…');

      whenPeerReady(function () {
        if (selfTrail) selfTrail.id = myId;
        const hid = hostPeerId();
        setupDataConn(peer.connect(hid));
        meshCall(hid);
        setStatus('// JOIN · ' + code);
        setTimeout(function () { meshCall(hid); }, 800);
        setTimeout(function () { meshCall(hid); }, 3000);
      });
    } catch (e) {
      console.error('joinPortal', e);
      setStatus('// ERR · ' + (e.message || 'join portal'));
    }
  }

  function openPortalUI() {
    portalOpen = true;
    const layout = $('studioLayout');
    const rail = $('portalRail');
    if (layout) layout.classList.add('portal-open');
    if (rail) rail.hidden = false;
    enterPortalBoost();
    if (!animId && canvas && ctx) drawPortal();
    startTrailSync();
    startMeshRetry();
    startBpmSync();
    unlockPlayback();
  }

  function leavePortal() {
    portalOpen = false;
    leavePortalBoost();
    stopTrailSync();
    stopMeshRetry();
    stopBpmSync();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    Array.from(remoteGains.keys()).forEach(removeRemotePeer);
    dataConns.forEach(function (c) { try { c.close(); } catch (e) {} });
    dataConns.clear();
    peers.clear();
    activeCalls.clear();
    if (peer) { peer.destroy(); peer = null; }
    peerReady = false;
    myId = '';
    hostIdRetry = false;
    localStream = null;
    selfTrail = null;
    lastBpmSeq = 0;
    $('studioLayout').classList.remove('portal-open');
    $('portalRail').hidden = true;
    $('portalRoomWrap').hidden = true;
    setStatus('// OFFLINE');
    renderPeerList();
  }

  function startTrailSync() {
    stopTrailSync();
    trailTimer = setInterval(function () {
      if (!portalOpen || !selfTrail || !myId) return;
      const bins = binsFromStudio();
      const active = studio.getActiveLayers ? studio.getActiveLayers() : [];
      advanceTrail(selfTrail, bins, active);
      updateSelfAudioFlag();
      const payload = {
        type: 'trail',
        id: myId,
        name: myName,
        hue: myHue,
        entryAngle: selfTrail.entryAngle,
        x: selfTrail.x,
        y: selfTrail.y,
        z: selfTrail.z,
        bins: Array.from(bins),
        layers: active,
        playing: studio.isPlaying ? studio.isPlaying() : false,
        hasAudio: !!selfTrail.hasAudio
      };
      fanout(payload);
    }, 66);
  }

  function stopTrailSync() {
    if (trailTimer) { clearInterval(trailTimer); trailTimer = null; }
  }

  function onTransportChange(state) {
    if (!portalOpen) return;
    refreshMeshAudio();
    if (isHost) broadcast(Object.assign({ type: 'transport' }, state));
    else dataConns.forEach(function (conn) {
      if (conn.open) try { conn.send(Object.assign({ type: 'transport-relay' }, state)); } catch (e) {}
    });
  }

  function bind(api) {
    studio = api;
    canvas = $('portalCanvas');
    if (canvas) ctx = canvas.getContext('2d');

    const nameInput = $('portalName');
    myName = (nameInput && nameInput.value.trim()) || ('OP_' + randCode());
    myHue = hashHue(myName);
    if (nameInput && !nameInput.value) nameInput.value = myName;

    const hostBtn = $('portalHostBtn');
    const joinBtn = $('portalJoinBtn');
    const leaveBtn = $('portalLeaveBtn');

    if (hostBtn) {
      hostBtn.addEventListener('click', function () {
        myName = ($('portalName') && $('portalName').value.trim()) || myName;
        myHue = hashHue(myName);
        const code = $('portalJoinCode') ? $('portalJoinCode').value.trim().toUpperCase() : '';
        hostPortal(code || null).catch(function (e) {
          console.error(e);
          setStatus('// ERR · ' + (e.message || 'crea portal'));
        });
      });
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', function () {
        myName = ($('portalName') && $('portalName').value.trim()) || myName;
        myHue = hashHue(myName);
        joinPortal($('portalJoinCode') ? $('portalJoinCode').value.trim() : '').catch(function (e) {
          console.error(e);
          setStatus('// ERR · ' + (e.message || 'entra portal'));
        });
      });
    }

    if (leaveBtn) leaveBtn.addEventListener('click', leavePortal);

    window.addEventListener('resize', function () {
      if (!canvas) return;
      const rail = $('portalRail');
      if (!rail) return;
      canvas.height = Math.max(420, rail.clientHeight - 120);
    });
    window.dispatchEvent(new Event('resize'));
    wireBpmSlider();
  }

  global.CuorePortal = {
    bind: bind,
    onTransportChange: onTransportChange,
    onBpmChange: onBpmChange,
    unlockPlayback: unlockPlayback,
    refreshMeshAudio: refreshMeshAudio,
    isOpen: function () { return portalOpen; },
    isHost: function () { return isHost; }
  };
})(window);
