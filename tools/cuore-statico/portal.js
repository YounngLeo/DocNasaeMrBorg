/**
 * CUORE_STATICO · PORTAL — sessione LAN/rete condivisa
 * WebRTC (PeerJS) · mix audio sommato · tracce spettro nello spazio colore
 */
(function (global) {
  'use strict';

  const PEER_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const TRAIL_MAX = 220;
  const SUB_TRAIL_MAX = 120;
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
  const dataConns = new Map();
  const remoteStreams = new Map();
  const remoteGains = new Map();
  const peers = new Map();
  let canvas = null;
  let ctx = null;
  let animId = null;
  let trailTimer = null;
  let selfTrail = null;

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

  function mkTrailUser(id, name, hue, entryAngle) {
    const sub = {};
    LAYER_KEYS.forEach(function (k) { sub[k] = []; });
    return {
      id, name, hue,
      x: 0, y: 0, z: 0,
      entryAngle: entryAngle || 0,
      trail: [],
      subTrails: sub,
      lastSeen: Date.now(),
      playing: false
    };
  }

  function binsFromStudio() {
    if (!studio || !studio.getSpectrum) return new Float32Array(16);
    const raw = studio.getSpectrum();
    const out = new Float32Array(16);
    const n = raw.length;
    for (let i = 0; i < 16; i++) {
      const i0 = Math.floor(i / 16 * n);
      const i1 = Math.max(i0 + 1, Math.floor((i + 1) / 16 * n));
      let s = 0;
      for (let j = i0; j < i1; j++) s += Math.max(-100, raw[j] + 100) / 100;
      out[i] = s / (i1 - i0);
    }
    return out;
  }

  function advanceTrail(user, bins, activeLayers) {
    const energy = bins.reduce(function (a, b) { return a + b; }, 0) / bins.length;
    const spread = (bins[2] - bins[0]) * 14 + Math.cos(user.entryAngle) * (2 + energy * 6);
    const lift = (bins[6] - bins[4]) * 12 + Math.sin(user.entryAngle) * (2 + energy * 5);
    user.x += spread;
    user.y += lift;
    user.z = user.z * 0.92 + bins[7] * 0.08;
    user.trail.push({ x: user.x, y: user.y, z: user.z, e: energy });
    if (user.trail.length > TRAIL_MAX) user.trail.shift();

    activeLayers.forEach(function (layer) {
      const branch = user.subTrails[layer];
      if (!branch) return;
      const li = LAYER_BRANCH[layer] || 0;
      const ang = user.entryAngle + li * 1.05 + user.trail.length * 0.018;
      const rad = 16 + bins[li % 16] * 42 + li * 4;
      branch.push({
        x: user.x + Math.cos(ang) * rad,
        y: user.y + Math.sin(ang) * rad,
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

    ctx.fillStyle = 'rgba(5,8,5,0.28)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0,255,65,0.08)';
    ctx.lineWidth = 1;
    for (let gy = 0; gy < h; gy += 28) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
    for (let gx = 0; gx < w; gx += 28) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(0,255,65,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,255,65,0.06)';
    ctx.fill();
    ctx.font = '9px Courier New';
    ctx.fillStyle = 'rgba(0,255,65,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('PORTAL', 0, 4);
    ctx.restore();

    const all = [selfTrail].concat(Array.from(peers.values())).filter(Boolean);
    all.sort(function (a, b) { return (a.z || 0) - (b.z || 0); });

    all.forEach(function (user) {
      if (!user) return;
      drawUserStreets(user, cx, cy);
    });

    animId = requestAnimationFrame(drawPortal);
  }

  function drawUserStreets(user, cx, cy) {
    const hue = user.hue;

    LAYER_KEYS.forEach(function (layer) {
      const branch = user.subTrails && user.subTrails[layer];
      if (!branch || branch.length < 2) return;
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = hsl(hue, 55, 42 + LAYER_BRANCH[layer] * 4, 0.35);
      ctx.beginPath();
      branch.forEach(function (p, i) {
        const px = cx + p.x * 0.85;
        const py = cy + p.y * 0.85 - p.z * 18;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    const trail = user.trail;
    if (trail.length < 2) return;

    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1];
      const p1 = trail[i];
      const t = i / trail.length;
      const x0 = cx + p0.x * 0.85;
      const y0 = cy + p0.y * 0.85 - p0.z * 18;
      const x1 = cx + p1.x * 0.85;
      const y1 = cy + p1.y * 0.85 - p1.z * 18;
      ctx.lineWidth = 1.2 + p1.e * 2.5;
      ctx.strokeStyle = hsl(hue, 72, 38 + t * 28, 0.25 + t * 0.65);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    const head = trail[trail.length - 1];
    const hx = cx + head.x * 0.85;
    const hy = cy + head.y * 0.85 - head.z * 18;
    ctx.fillStyle = hsl(hue, 85, 62, 0.95);
    ctx.beginPath();
    ctx.arc(hx, hy, 3 + head.e * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '8px Courier New';
    ctx.fillStyle = hsl(hue, 60, 70, 0.85);
    ctx.textAlign = 'left';
    ctx.fillText(user.name.slice(0, 12), hx + 8, hy - 6);
  }

  function setStatus(msg) {
    const el = $('portalStatus');
    if (el) el.textContent = msg;
  }

  function renderPeerList() {
    const el = $('portalPeers');
    if (!el) return;
    const rows = [selfTrail].concat(Array.from(peers.values())).filter(Boolean);
    el.innerHTML = rows.map(function (p) {
      const local = p.id === myId ? ' · tu' : '';
      return '<div class="portal-peer"><i style="background:hsl(' + p.hue + ',70%,50%)"></i>' +
        p.name + local + '</div>';
    }).join('');
  }

  function broadcast(msg, exceptId) {
    dataConns.forEach(function (conn, id) {
      if (exceptId && id === exceptId) return;
      try { conn.send(msg); } catch (e) {}
    });
  }

  function sendRoster() {
    if (!isHost) return;
    const list = [{ id: myId, name: myName, hue: myHue }];
    peers.forEach(function (p, id) {
      list.push({ id: id, name: p.name, hue: p.hue });
    });
    broadcast({ type: 'roster', peers: list });
  }

  function handleData(msg, fromId) {
    if (!msg || !msg.type) return;

    if (msg.type === 'hello') {
      const u = mkTrailUser(msg.id, msg.name, msg.hue, msg.entryAngle);
      peers.set(msg.id, u);
      meshCall(msg.id);
      if (isHost) {
        sendRoster();
        broadcast({ type: 'hello', id: myId, name: myName, hue: myHue, entryAngle: selfTrail.entryAngle }, msg.id);
      }
      renderPeerList();
      return;
    }

    if (msg.type === 'roster') {
      (msg.peers || []).forEach(function (p, i) {
        if (p.id === myId) return;
        if (!peers.has(p.id)) {
          peers.set(p.id, mkTrailUser(p.id, p.name, p.hue, (i * 2.39996) % (Math.PI * 2)));
        }
        meshCall(p.id);
      });
      renderPeerList();
      return;
    }

    if (msg.type === 'trail') {
      let u = peers.get(msg.id);
      if (!u) {
        u = mkTrailUser(msg.id, msg.name || msg.id.slice(0, 6), msg.hue || 0, 0);
        peers.set(msg.id, u);
      }
      advanceTrail(u, new Float32Array(msg.bins), msg.layers || []);
      u.playing = !!msg.playing;
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
      if (studio && studio.applyTransport) {
        studio.applyTransport({
          playing: msg.playing,
          beat16: msg.beat16,
          bpm: msg.bpm
        });
      }
      return;
    }
  }

  function setupDataConn(conn) {
    if (dataConns.has(conn.peer)) return;
    dataConns.set(conn.peer, conn);
    conn.on('data', function (data) { handleData(data, conn.peer); });
    conn.on('close', function () {
      dataConns.delete(conn.peer);
      remoteStreams.delete(conn.peer);
      const g = remoteGains.get(conn.peer);
      if (g) { g.dispose && g.dispose(); remoteGains.delete(conn.peer); }
    });
    conn.on('open', function () {
      conn.send({
        type: 'hello',
        id: myId,
        name: myName,
        hue: myHue,
        entryAngle: selfTrail ? selfTrail.entryAngle : 0
      });
      if (isHost) sendRoster();
    });
  }

  function addRemoteAudio(stream, peerId, meta) {
    if (!studio || !studio.Tone || remoteStreams.has(peerId)) return;
    remoteStreams.set(peerId, stream);
    const src = studio.Tone.context.createMediaStreamSource(stream);
    const vol = new studio.Tone.Volume(-5);
    studio.Tone.connect(src, vol);
    vol.connect(studio.master);
    remoteGains.set(peerId, vol);
    if (meta && meta.name && !peers.has(peerId)) {
      peers.set(peerId, mkTrailUser(peerId, meta.name, meta.hue || hashHue(peerId), 0));
      renderPeerList();
    }
    if (isHost) meshCall(peerId);
  }

  function meshCall(remoteId) {
    if (!peer || remoteId === myId || remoteStreams.has(remoteId)) return;
    try {
      const call = peer.call(remoteId, localStream, {
        metadata: { id: myId, name: myName, hue: myHue }
      });
      if (call) {
        call.on('stream', function (stream) {
          addRemoteAudio(stream, remoteId, call.metadata);
        });
      }
      if (!dataConns.has(remoteId)) {
        const conn = peer.connect(remoteId);
        setupDataConn(conn);
      }
    } catch (e) { console.warn('meshCall', e); }
  }

  function setupPeerHandlers() {
    peer.on('open', function (id) {
      myId = id;
      setStatus('// ONLINE · ' + id.slice(-8));
    });

    peer.on('connection', setupDataConn);

    peer.on('call', function (call) {
      call.answer(localStream);
      call.on('stream', function (stream) {
        addRemoteAudio(stream, call.peer, call.metadata);
      });
      setupDataConn(peer.connect(call.peer));
    });

    peer.on('error', function (err) {
      setStatus('// ERR · ' + (err.type || err.message || 'peer'));
      console.warn(err);
    });

    peer.on('disconnected', function () {
      setStatus('// RECONNECT…');
      if (!peer.destroyed) peer.reconnect();
    });
  }

  async function ensureLocalStream() {
    if (localStream) return localStream;
    if (!studio || !studio.getSendStream) return null;
    localStream = studio.getSendStream();
    return localStream;
  }

  async function hostPortal(code) {
    await loadPeerJS();
    await studio.initAudio();
    await ensureLocalStream();
    roomCode = code || randCode();
    isHost = true;
    const hostId = 'cuore-host-' + roomCode.toLowerCase();
    peer = new Peer(hostId);
    setupPeerHandlers();
    selfTrail = mkTrailUser(hostId, myName, myHue, 0);
    $('portalRoomCode').textContent = roomCode;
    $('portalRoomWrap').hidden = false;
    setStatus('// HOST · room ' + roomCode);
    openPortalUI();
  }

  async function joinPortal(code) {
    code = (code || '').trim().toUpperCase();
    if (!code) { setStatus('// INSERISCI CODICE'); return; }
    await loadPeerJS();
    await studio.initAudio();
    await ensureLocalStream();
    roomCode = code;
    isHost = false;
    peer = new Peer();
    setupPeerHandlers();
    peer.on('open', function () {
      const hostId = 'cuore-host-' + code.toLowerCase();
      const conn = peer.connect(hostId);
      setupDataConn(conn);
      meshCall(hostId);
      selfTrail = mkTrailUser(myId, myName, myHue, Math.random() * Math.PI * 2);
      $('portalRoomCode').textContent = code;
      $('portalRoomWrap').hidden = false;
      setStatus('// JOIN · ' + code);
      openPortalUI();
    });
  }

  function openPortalUI() {
    portalOpen = true;
    $('studioLayout').classList.add('portal-open');
    $('portalRail').hidden = false;
    if (!animId) drawPortal();
    startTrailSync();
  }

  function leavePortal() {
    portalOpen = false;
    stopTrailSync();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    remoteGains.forEach(function (g) { try { g.dispose(); } catch (e) {} });
    remoteGains.clear();
    remoteStreams.clear();
    dataConns.clear();
    peers.clear();
    if (peer) { peer.destroy(); peer = null; }
    $('studioLayout').classList.remove('portal-open');
    $('portalRail').hidden = true;
    $('portalRoomWrap').hidden = true;
    setStatus('// OFFLINE');
    renderPeerList();
  }

  function startTrailSync() {
    stopTrailSync();
    trailTimer = setInterval(function () {
      if (!portalOpen || !selfTrail) return;
      const bins = binsFromStudio();
      const active = studio.getActiveLayers ? studio.getActiveLayers() : [];
      advanceTrail(selfTrail, bins, active);
      const payload = {
        type: 'trail',
        id: myId,
        name: myName,
        hue: myHue,
        bins: Array.from(bins),
        layers: active,
        playing: studio.isPlaying ? studio.isPlaying() : false
      };
      if (isHost) broadcast(payload);
      else {
        dataConns.forEach(function (conn) {
          try { conn.send(payload); } catch (e) {}
        });
      }
    }, 80);
  }

  function stopTrailSync() {
    if (trailTimer) { clearInterval(trailTimer); trailTimer = null; }
  }

  function onTransportChange(state) {
    if (!portalOpen) return;
    if (isHost) {
      broadcast(Object.assign({ type: 'transport' }, state));
      return;
    }
    dataConns.forEach(function (conn) {
      try { conn.send(Object.assign({ type: 'transport-relay' }, state)); } catch (e) {}
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

    $('portalHostBtn').addEventListener('click', function () {
      myName = ($('portalName').value.trim() || myName);
      myHue = hashHue(myName);
      hostPortal($('portalJoinCode').value.trim().toUpperCase() || null);
    });

    $('portalJoinBtn').addEventListener('click', function () {
      myName = ($('portalName').value.trim() || myName);
      myHue = hashHue(myName);
      joinPortal($('portalJoinCode').value.trim());
    });

    $('portalLeaveBtn').addEventListener('click', leavePortal);

    window.addEventListener('resize', function () {
      if (!canvas) return;
      const rail = $('portalRail');
      if (!rail) return;
      canvas.height = Math.max(420, rail.clientHeight - 120);
    });
    window.dispatchEvent(new Event('resize'));
  }

  global.CuorePortal = {
    bind: bind,
    onTransportChange: onTransportChange,
    isOpen: function () { return portalOpen; },
    isHost: function () { return isHost; }
  };
})(window);
