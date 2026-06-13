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
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
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
  const rtcDataChannels = new Map();
  const remoteStreams = new Map();
  const remoteGains = new Map();
  const remoteAudioEls = new Map();
  const remoteVolumes = new Map();
  const activeCalls = new Set();
  const callAttemptAt = new Map();
  const missingSince = new Map();
  const mediaCalls = new Map();
  const peers = new Map();
  let canvas = null;
  let ctx = null;
  let animId = null;
  let trailTimer = null;
  let selfTrail = null;
  let trailRxCount = 0;
  let dataRxCount = 0;
  let syncPulseCount = 0;
  const peerReadyWaiters = [];
  const pendingData = [];
  let portalWs = null;
  let wsReady = false;
  let wsReconnectTimer = null;
  let wsClientId = '';
  let portalWsBaseUrl = '';
  let portalWsConfigPromise = null;
  let wsLastRx = 0;
  let wsKeepaliveTimer = null;
  let syncTxCount = 0;
  let audioHealthTimer = null;
  let hardReconnectTimer = null;

  function portalPeerId() {
    return myId || wsClientId || '';
  }

  function announcePortalIdentity() {
    if (!portalOpen) return;
    if (selfTrail) selfTrail.id = portalPeerId();
    if (wsReady) {
      sendHelloWs();
      sendData(buildSyncPayload());
      flushPendingData();
      requestBpmSync();
    }
    ensureLocalStream().then(function () {
      meshAllAudioPeers();
    });
    renderPeerList();
  }

  function startWsKeepalive() {
    stopWsKeepalive();
    wsLastRx = Date.now();
    wsKeepaliveTimer = setInterval(function () {
      if (!portalOpen) return;
      if (wsReady && portalWs && portalWs.readyState === WebSocket.OPEN) {
        if (Date.now() - wsLastRx > 12000) {
          setStatus('// WS STALE · riconnessione…');
          connectPortalWs(true);
          return;
        }
        wsSend({ type: 'ws-ping', id: portalPeerId(), t: Date.now() });
      }
    }, 4000);
  }

  function stopWsKeepalive() {
    if (wsKeepaliveTimer) { clearInterval(wsKeepaliveTimer); wsKeepaliveTimer = null; }
  }

  function $(id) { return document.getElementById(id); }

  function parseData(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object' && raw.type) return raw;
    if (typeof raw === 'string') {
      try {
        let v = JSON.parse(raw);
        if (typeof v === 'string') {
          try { v = JSON.parse(v); } catch (e2) { return null; }
        }
        return v && v.type ? v : null;
      } catch (e) { return null; }
    }
    if (raw instanceof ArrayBuffer) {
      try { return parseData(new TextDecoder().decode(raw)); } catch (e) { return null; }
    }
    if (raw instanceof Uint8Array) {
      try { return parseData(new TextDecoder().decode(raw)); } catch (e) { return null; }
    }
    try {
      const v = JSON.parse(JSON.stringify(raw));
      return v && v.type ? v : null;
    } catch (e) { return null; }
  }

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

  /** Mesh: id minore inizia; se manca audio da >5s, recovery ignora la regola. */
  function shouldInitiateCall(remoteId, forceRecover) {
    if (!myId || !remoteId || remoteId === myId) return false;
    if (hasLiveRemoteStream(remoteId)) return false;
    if (forceRecover) return true;
    const miss = missingSince.get(remoteId);
    if (miss && Date.now() - miss > 5000) return true;
    return myId < remoteId;
  }

  function noteMissingStream(remoteId) {
    if (hasLiveRemoteStream(remoteId)) {
      missingSince.delete(remoteId);
      return;
    }
    if (!missingSince.has(remoteId)) missingSince.set(remoteId, Date.now());
  }

  function noteRemoteStreamLive(remoteId) {
    missingSince.delete(remoteId);
  }

  function getRemoteVolume(peerId) {
    if (remoteVolumes.has(peerId)) return remoteVolumes.get(peerId);
    return 1;
  }

  function applyRemotePeerVolume(peerId) {
    const vol = getRemoteVolume(peerId);
    if (studio && studio.setPortalRemoteVolume) {
      studio.setPortalRemoteVolume(peerId, vol);
    }
    const g = remoteGains.get(peerId);
    if (g && g.gain) g.gain.value = vol * 1.25;
    const aud = remoteAudioEls.get(peerId);
    if (aud && aud.dataset.fallback === '1') aud.volume = Math.min(1, vol);
  }

  function setRemotePeerVolume(peerId, vol, doBroadcast) {
    if (!peerId) return;
    const v = Math.max(0, Math.min(1.5, vol));
    remoteVolumes.set(peerId, v);
    applyRemotePeerVolume(peerId);
    peers.forEach(function (p) {
      if (p.peerJsId === peerId || p.id === peerId) p.remoteVolume = v;
    });
    if (doBroadcast !== false && isHost) {
      broadcast({ type: 'peer-volume', peerJsId: peerId, volume: v });
    }
  }

  function meshTargets() {
    const out = [];
    const seen = new Set();
    peers.forEach(function (p) {
      const t = meshPeerJsTarget(p);
      if (t && t !== myId && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    });
    const hid = hostPeerId();
    if (hid && hid !== myId && !seen.has(hid)) out.push(hid);
    return out;
  }

  function encodeMsg(msg) {
    try { return JSON.stringify(msg); } catch (e) { return null; }
  }

  function loadPortalWsConfig() {
    if (portalWsConfigPromise) return portalWsConfigPromise;
    portalWsConfigPromise = fetch('/tools/cuore-statico/portal-ws.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.wsBase) portalWsBaseUrl = String(j.wsBase).trim().replace(/\/$/, '');
        return portalWsBaseUrl;
      })
      .catch(function () { return ''; });
    return portalWsConfigPromise;
  }

  function portalWsBase() {
    const meta = document.querySelector('meta[name="portal-ws"]');
    if (meta && meta.content && meta.content.trim()) return meta.content.trim().replace(/\/$/, '');
    if (portalWsBaseUrl) return portalWsBaseUrl;
    return '';
  }

  function buildWsUrl() {
    let base = portalWsBase();
    if (!base || !roomCode) return '';
    if (!/\/ws$/i.test(base)) base += '/ws';
    const peer = encodeURIComponent(portalPeerId() || 'pending');
    const name = encodeURIComponent(myName || 'OP');
    return base + '?room=' + encodeURIComponent(roomCode.toUpperCase()) +
      '&peer=' + peer + '&name=' + name + '&host=' + (isHost ? '1' : '0');
  }

  function scheduleWsReconnect() {
    if (wsReconnectTimer || !portalOpen) return;
    wsReconnectTimer = setTimeout(function () {
      wsReconnectTimer = null;
      if (portalOpen) connectPortalWs();
    }, 2200);
  }

  function disconnectPortalWs(clearTimer) {
    if (clearTimer !== false && wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    wsReady = false;
    if (portalWs) {
      try { portalWs.onopen = portalWs.onmessage = portalWs.onclose = portalWs.onerror = null; portalWs.close(); } catch (e) {}
      portalWs = null;
    }
  }

  function wsSend(msg) {
    if (!portalWs || portalWs.readyState !== WebSocket.OPEN) return false;
    const raw = encodeMsg(msg);
    if (!raw) return false;
    try {
      portalWs.send(raw);
      return true;
    } catch (e) {
      console.warn('portal ws send', e);
      return false;
    }
  }

  function onWsReady() {
    sendHelloWs();
    if (isHost) sendRoster();
    syncBpmOut();
    requestBpmSync();
    flushPendingData();
    renderPeerList();
  }

  function sendHelloWs() {
    wsSend({
      type: 'hello',
      id: portalPeerId(),
      peerJsId: myId || '',
      name: myName,
      hue: myHue,
      entryAngle: selfTrail ? selfTrail.entryAngle : 0,
      bpm: portalBpmNow()
    });
  }

  function connectPortalWs(force) {
    if (!portalOpen || !roomCode) return;
    if (!force && portalWs && wsReady && portalWs.readyState === WebSocket.OPEN) return;
    loadPortalWsConfig().then(function () {
      if (!portalOpen || !roomCode) return;
      if (!wsClientId) wsClientId = 'ws-' + randCode() + randCode();
      const url = buildWsUrl();
      if (!url) {
        console.warn('portal: configura portal-ws.json (wsBase)');
        setStatus('// WS · config mancante · portal-ws.json');
        return;
      }
      disconnectPortalWs(false);
      try {
        portalWs = new WebSocket(url);
      } catch (e) {
        console.warn('portal ws connect', e);
        scheduleWsReconnect();
        return;
      }
      portalWs.onopen = function () {
        wsReady = true;
        wsLastRx = Date.now();
        startWsKeepalive();
        setStatus('// WS · room ' + roomCode);
        onWsReady();
      };
      portalWs.onmessage = function (ev) {
        wsLastRx = Date.now();
        const msg = parseData(ev.data);
        if (!msg || msg.type === 'ws-join') return;
        handleData(msg, msg.from || msg.id || 'ws');
      };
      portalWs.onclose = function () {
        wsReady = false;
        stopWsKeepalive();
        renderPeerList();
        if (portalOpen) {
          setStatus('// WS OFF · riconnessione…');
          scheduleWsReconnect();
        }
      };
      portalWs.onerror = function () {
        console.warn('portal ws error — verifica relay cuore-portal-relay su Cloudflare Workers');
      };
    });
  }

  function connSend(conn, msg) {
    if (!conn || !conn.open) return false;
    try {
      conn.send(msg);
      return true;
    } catch (e) {
      console.warn('connSend', e);
      return false;
    }
  }

  function sendData(msg) {
    if (wsSend(msg)) return;
    if (isHost) {
      dataConns.forEach(function (conn) { connSend(conn, msg); });
      return;
    }
    const hid = hostPeerId();
    const conn = dataConns.get(hid);
    if (connSend(conn, msg)) return;
    if (pendingData.length < 80) pendingData.push(msg);
  }

  function flushPendingData() {
    while (pendingData.length) {
      if (wsSend(pendingData[0])) pendingData.shift();
      else if (!isHost) {
        const hid = hostPeerId();
        const conn = dataConns.get(hid);
        if (conn && conn.open && connSend(conn, pendingData[0])) pendingData.shift();
        else break;
      } else break;
    }
  }

  function connectDataTo(peerId) {
    if (isHost || !peer || !peerId || peerId === myId || peerId !== hostPeerId()) return;
    if (dataConns.has(peerId)) return;
    try {
      setupPeerDataConn(peer.connect(peerId, { reliable: true, serialization: 'json' }));
    } catch (e) {
      console.warn('connectDataTo', peerId, e);
    }
  }

  function peerJsTarget(msg) {
    if (!msg) return null;
    if (msg.peerJsId && msg.peerJsId !== myId) return msg.peerJsId;
    const id = msg.id;
    if (!id || id === myId) return null;
    if (String(id).indexOf('ws-') === 0) return null;
    return id;
  }

  function notePeerJsId(msg) {
    const t = peerJsTarget(msg);
    if (!t || !msg.id || msg.id === portalPeerId()) return;
    let u = peers.get(msg.id);
    if (!u && msg.name) {
      u = mkTrailUser(msg.id, msg.name, msg.hue != null ? msg.hue : hashHue(msg.id), msg.entryAngle || 0);
      peers.set(msg.id, u);
    }
    if (u) u.peerJsId = t;
  }

  function meshPeerJsTarget(p) {
    if (!p) return null;
    if (p.peerJsId && p.peerJsId !== myId) return p.peerJsId;
    if (p.id && String(p.id).indexOf('ws-') !== 0 && p.id !== myId) return p.id;
    return null;
  }

  function meshAllAudioPeers() {
    if (!peer || !myId) return;
    meshTargets().forEach(function (t) {
      noteMissingStream(t);
      meshCall(t);
    });
  }

  function meshAllKnownPeers() {
    if (!peer || !myId) return;
    ensureLocalStream().then(function (stream) {
      if (!stream || !peer) return;
      if (!isHost && roomCode) connectDataTo(hostPeerId());
      meshAllAudioPeers();
    });
  }

  let meshRetryTimer = null;
  let bpmSyncTimer = null;
  let lastBpmSeq = 0;
  let lastSentBpm = -1;
  let lastAppliedBpmSeq = 0;
  let bpmSendTimer = null;
  let bpmPendingVal = null;

  function hasLiveRemoteStream(peerId) {
    const s = remoteStreams.get(peerId);
    if (!s) return false;
    return s.getAudioTracks().some(function (t) { return t.readyState === 'live'; });
  }

  function startMeshRetry() {
    if (meshRetryTimer) clearInterval(meshRetryTimer);
    meshRetryTimer = setInterval(function () {
      if (!portalOpen) return;
      ensureLocalStream().then(function () {
        meshAllAudioPeers();
        meshTargets().forEach(function (t) {
          noteMissingStream(t);
          if (!hasLiveRemoteStream(t)) {
            const recover = missingSince.get(t) && Date.now() - missingSince.get(t) > 5000;
            if (shouldInitiateCall(t, recover)) forceMeshCall(t, recover);
          }
        });
      });
    }, 2000);
  }

  function stopMeshRetry() {
    if (meshRetryTimer) { clearInterval(meshRetryTimer); meshRetryTimer = null; }
  }

  function startBpmSync() {
    if (bpmSyncTimer) clearInterval(bpmSyncTimer);
    bpmSyncTimer = setInterval(function () {
      if (!portalOpen || !portalPeerId()) return;
      if (isHost) pushAuthoritativeBpm(portalBpmNow(), false);
    }, 5000);
  }

  function requestBpmSync() {
    if (isHost) {
      pushAuthoritativeBpm(portalBpmNow(), true);
      return;
    }
    sendData({ type: 'bpm-request' });
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
    if (!el) return;
    if (portalOpen && msg.indexOf('ws:') < 0) {
      msg += ' · ws:' + (wsReady ? 'on' : 'off') +
        ' · rx:' + trailRxCount + '/' + dataRxCount;
    }
    el.textContent = msg;
    const syncEl = $('portalSyncLine');
    if (syncEl) {
      syncEl.textContent = '// ws:' + (wsReady ? 'on' : 'off') +
        ' · rx:' + trailRxCount + '/' + dataRxCount +
        ' · portal.js v17';
    }
  }

  function fanout(msg, exceptId) {
    if (wsSend(msg)) return;
    dataConns.forEach(function (conn, id) {
      if (exceptId && id === exceptId) return;
      connSend(conn, msg);
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

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function renderPeerList() {
    const el = $('portalPeers');
    if (!el) return;
    const myPid = portalPeerId();
    const rows = [selfTrail].concat(Array.from(peers.values()).filter(function (p) {
      return p && p.id !== myId && p.id !== myPid;
    })).filter(Boolean);
    updateSelfAudioFlag();
    el.innerHTML = rows.map(function (p) {
      const isSelf = p.id === myId || p.id === myPid;
      const local = isSelf ? ' · tu' : '';
      const aud = p.hasAudio ? ' · audio' : '';
      const audioId = meshPeerJsTarget(p) || p.peerJsId || p.id;
      let volUi = '';
      if (isHost && !isSelf && audioId && String(audioId).indexOf('ws-') !== 0) {
        const v = Math.round(getRemoteVolume(audioId) * 100);
        volUi = '<input type="range" class="portal-vol" data-pid="' + escHtml(audioId) +
          '" min="0" max="150" step="1" value="' + v + '" title="Volume utente">' +
          '<span class="portal-vol-val">' + v + '%</span>';
      }
      return '<div class="portal-peer-row">' +
        '<i style="background:hsl(' + p.hue + ',70%,50%)"></i>' +
        '<span class="portal-peer-name">' + escHtml(p.name) + local + aud + '</span>' +
        volUi + '</div>';
    }).join('') +
      '<div class="portal-peer-row" style="opacity:0.55;margin-top:6px">' +
      '// stream: ' + sessionStreamCount() + ' · mesh: ' + remoteStreams.size +
      ' · operatori: ' + rows.length + ' · ws:' + (wsReady ? 'on' : 'off') +
      ' · rx:' + trailRxCount + '/' + dataRxCount +
      ' · tx:' + syncTxCount + '</div>';
  }

  function dataConnOpenCount() {
    let n = 0;
    dataConns.forEach(function (c) { if (c.open) n++; });
    return n;
  }

  function sendRoster() {
    if (!isHost) return;
    const list = [{ id: portalPeerId(), peerJsId: myId || '', name: myName, hue: myHue }];
    peers.forEach(function (p, id) {
      list.push({ id: id, peerJsId: p.peerJsId || meshPeerJsTarget(p) || '', name: p.name, hue: p.hue });
    });
    lastBpmSeq++;
    const volumes = {};
    remoteVolumes.forEach(function (v, k) { volumes[k] = v; });
    broadcast({ type: 'roster', peers: list, bpm: portalBpmNow(), seq: lastBpmSeq, volumes: volumes });
  }

  function applyTrailMessage(msg) {
    if (!msg || !msg.id || msg.id === portalPeerId()) return;
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
    if (msg.trailTail && msg.trailTail.length) {
      u.trail = msg.trailTail.slice(-TRAIL_MAX);
      if (msg.x != null) u.x = msg.x;
      if (msg.y != null) u.y = msg.y;
      if (msg.z != null) u.z = msg.z;
    } else if (msg.x != null && msg.y != null) {
      const bins = new Float32Array(msg.bins || []);
      advanceTrail(u, bins, msg.layers || [], { x: msg.x, y: msg.y, z: msg.z });
    }
    u.lastSeen = Date.now();
    trailRxCount++;
  }

  function applySyncMessage(msg) {
    applyTrailMessage(msg);
  }

  function handleData(msg, fromId) {
    if (!msg || !msg.type) return;
    dataRxCount++;

    if (msg.type === 'ping' || msg.type === 'ws-ping') {
      trailRxCount++;
      if (!isHost && msg.type === 'ping') sendData({ type: 'pong', from: portalPeerId(), t: Date.now() });
      else if (msg.type === 'ws-ping') wsSend({ type: 'ws-pong', id: portalPeerId(), t: Date.now() });
      return;
    }
    if (msg.type === 'pong' || msg.type === 'ws-pong') {
      trailRxCount++;
      return;
    }

    if (msg.type === 'hello') {
      if (msg.id === portalPeerId()) return;
      notePeerJsId(msg);
      if (!peers.has(msg.id)) {
        peers.set(msg.id, mkTrailUser(msg.id, msg.name, msg.hue, msg.entryAngle));
      }
      if (!isHost && msg.bpm != null) applyRemoteBpm(msg.bpm, msg.seq);
      if (isHost) {
        sendRoster();
        fanout({
          type: 'hello', id: portalPeerId(), peerJsId: myId || '',
          name: myName, hue: myHue,
          entryAngle: selfTrail ? selfTrail.entryAngle : 0,
          bpm: portalBpmNow()
        }, msg.id);
        meshAllAudioPeers();
      } else {
        meshAllAudioPeers();
      }
      renderPeerList();
      return;
    }

    if (msg.type === 'roster') {
      const validIds = [myId, portalPeerId()];
      (msg.peers || []).forEach(function (p, i) {
        if (p.id === myId || p.id === portalPeerId()) return;
        validIds.push(p.id);
        if (!peers.has(p.id)) {
          peers.set(p.id, mkTrailUser(p.id, p.name, p.hue, (i * 2.39996) % (Math.PI * 2)));
        }
        if (p.peerJsId) {
          const u = peers.get(p.id);
          if (u) u.peerJsId = p.peerJsId;
        }
      });
      pruneStaleRemotePeers(validIds);
      if (!isHost && msg.bpm != null) applyRemoteBpm(msg.bpm, msg.seq);
      if (msg.volumes) {
        Object.keys(msg.volumes).forEach(function (k) {
          setRemotePeerVolume(k, msg.volumes[k], false);
        });
      }
      meshAllAudioPeers();
      renderPeerList();
      return;
    }

    if (msg.type === 'trail' || msg.type === 'sync') {
      notePeerJsId(msg);
      if (msg.type === 'sync') applySyncMessage(msg);
      else applyTrailMessage(msg);
      meshAllAudioPeers();
      if (isHost && !wsReady) fanout(msg, fromId);
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

    if (msg.type === 'bpm-request') {
      if (isHost) pushAuthoritativeBpm(portalBpmNow(), true);
      return;
    }

    if (msg.type === 'bpm-relay') {
      if (isHost) {
        applyRemoteBpm(msg.bpm);
        pushAuthoritativeBpm(Math.round(msg.bpm), true);
      }
      return;
    }

    if (msg.type === 'peer-volume') {
      if (msg.peerJsId != null && msg.volume != null) {
        setRemotePeerVolume(msg.peerJsId, msg.volume, false);
        renderPeerList();
      }
      return;
    }
  }

  function sendHello(peerId) {
    sendHelloWs();
    const conn = dataConns.get(peerId);
    if (!conn || !conn.open) return;
    connSend(conn, {
      type: 'hello',
      id: myId,
      name: myName,
      hue: myHue,
      entryAngle: selfTrail ? selfTrail.entryAngle : 0,
      bpm: portalBpmNow()
    });
  }

  function onDataChannelReady(peerId) {
    sendHello(peerId);
    if (isHost) sendRoster();
    syncBpmOut();
    requestBpmSync();
    flushPendingData();
    renderPeerList();
  }

  function registerSyncChannel(peerId, channel) {
    if (!channel || channel.__cuoreBound) return;
    channel.__cuoreBound = true;
    const existing = dataConns.get(peerId);
    if (existing && existing._peerJsConn) {
      try { existing._peerJsConn.close(); } catch (e) {}
    }
    rtcDataChannels.set(peerId, channel);
    const wrapper = {
      peer: peerId,
      get open() {
        if (channel.readyState != null) return channel.readyState === 'open';
        return !!channel.open;
      },
      send: function (msg) {
        if (channel.readyState != null) {
          if (channel.readyState !== 'open') return;
          const raw = encodeMsg(msg);
          if (raw) channel.send(raw);
        }
      }
    };
    dataConns.set(peerId, wrapper);

    channel.addEventListener('open', function () { onDataChannelReady(peerId); });
    channel.addEventListener('message', function (e) {
      const msg = parseData(e.data);
      if (msg) handleData(msg, peerId);
    });
    channel.addEventListener('close', function () {
      if (rtcDataChannels.get(peerId) === channel) rtcDataChannels.delete(peerId);
      if (dataConns.get(peerId) === wrapper) dataConns.delete(peerId);
      renderPeerList();
    });
    if (wrapper.open) onDataChannelReady(peerId);
  }

  /** Canale dati già negoziato da PeerJS sulla stessa call dell'audio. */
  function wireCallSyncChannel(remoteId, call) {
    if (!call || call.__cuoreSyncWired) return;
    call.__cuoreSyncWired = true;

    function tryBind() {
      if (call.dataChannel) registerSyncChannel(remoteId, call.dataChannel);
    }

    if (call.on) call.on('willCloseOnRemote', tryBind);
    tryBind();
    const tick = setInterval(function () {
      tryBind();
      if (rtcDataChannels.has(remoteId)) clearInterval(tick);
    }, 40);
    setTimeout(function () { clearInterval(tick); }, 20000);
  }

  function setupPeerDataConn(conn) {
    if (!conn) return;
    const pid = conn.peer;
    if (rtcDataChannels.has(pid)) return;
    const existing = dataConns.get(pid);
    if (existing && existing._peerJsConn === conn) return;
    if (existing && existing._peerJsConn) {
      try { existing._peerJsConn.close(); } catch (e) {}
    }
    const wrapper = {
      peer: pid,
      _peerJsConn: conn,
      get open() { return conn.open; },
      send: function (msg) { conn.send(msg); }
    };
    dataConns.set(pid, wrapper);
    conn.on('data', function (data) {
      const msg = parseData(data);
      if (msg) handleData(msg, pid);
    });
    conn.on('close', function () {
      if (dataConns.get(pid) === wrapper) dataConns.delete(pid);
      renderPeerList();
    });
    conn.on('error', function (err) { console.warn('portal data err', err); });
    function onConnOpen() { onDataChannelReady(pid); }
    if (conn.open) onConnOpen();
    else conn.on('open', onConnOpen);
  }

  function syncBpmOut() {
    if (!portalOpen || !studio || !portalPeerId()) return;
    if (isHost) pushAuthoritativeBpm(portalBpmNow());
  }

  function onBpmChange(bpm) {
    if (!portalOpen) return;
    sendBpm(bpm);
  }

  function routeRemoteStream(stream, peerId) {
    if (studio && studio.attachPortalRemote) {
      return studio.attachPortalRemote(peerId, stream, getRemoteVolume(peerId));
    }
    return null;
  }

  function detachRemoteRoute(peerId) {
    if (studio && studio.detachPortalRemote) studio.detachPortalRemote(peerId);
    const g = remoteGains.get(peerId);
    if (g && g.dispose) {
      try { g.dispose(); } catch (e) {}
    }
    remoteGains.delete(peerId);
  }

  function wireMediaCall(remoteId, call, metaHint) {
    if (!call) return;
    mediaCalls.set(remoteId, call);
    activeCalls.add(remoteId);
    wireCallSyncChannel(remoteId, call);
    call.on('stream', function (remoteStream) {
      const meta = metaHint || call.metadata || {};
      addRemoteAudio(remoteId, remoteStream, meta);
    });
    call.on('close', function () {
      activeCalls.delete(remoteId);
      mediaCalls.delete(remoteId);
      removeRemotePeer(remoteId);
    });
    call.on('error', function () {
      activeCalls.delete(remoteId);
      mediaCalls.delete(remoteId);
    });
  }

  function replaceSendTracks() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track || track.readyState === 'ended') return;
    mediaCalls.forEach(function (call) {
      if (!call || !call.peerConnection) return;
      const pc = call.peerConnection;
      const audioSenders = pc.getSenders().filter(function (s) {
        return s.track && s.track.kind === 'audio';
      });
      if (!audioSenders.length) {
        try { pc.addTrack(track, localStream); } catch (e) {}
        return;
      }
      audioSenders.forEach(function (sender) {
        sender.replaceTrack(track).catch(function () {});
      });
    });
  }

  function onSendStreamUpdated(stream) {
    if (!stream) return;
    localStream = stream;
    stream.getAudioTracks().forEach(function (t) { t.enabled = true; });
    replaceSendTracks();
    updateSelfAudioFlag();
  }

  function forceMeshCall(remoteId, forceRecover) {
    if (!peer || !remoteId || remoteId === myId) return;
    if (!shouldInitiateCall(remoteId, forceRecover)) return;
    if (hasLiveRemoteStream(remoteId)) return;
    if (activeCalls.has(remoteId)) {
      const t0 = callAttemptAt.get(remoteId) || 0;
      const wait = forceRecover ? 2500 : 6000;
      if (Date.now() - t0 < wait) return;
      const prev = mediaCalls.get(remoteId);
      if (prev) { try { prev.close(); } catch (e) {} }
      activeCalls.delete(remoteId);
      mediaCalls.delete(remoteId);
    }
    ensureLocalStream().then(function (stream) {
      if (!stream || !peer || hasLiveRemoteStream(remoteId)) return;
      callAttemptAt.set(remoteId, Date.now());
      try {
        wireMediaCall(remoteId, peer.call(remoteId, localStream, {
          metadata: { id: myId, name: myName, hue: myHue }
        }));
      } catch (e) {
        console.warn('forceMeshCall', e);
      }
    });
  }

  function removeRemotePeer(peerId) {
    activeCalls.delete(peerId);
    mediaCalls.delete(peerId);
    rtcDataChannels.delete(peerId);
    dataConns.delete(peerId);
    remoteStreams.delete(peerId);
    noteMissingStream(peerId);
    detachRemoteRoute(peerId);
    const aud = remoteAudioEls.get(peerId);
    if (aud) { aud.srcObject = null; aud.remove(); }
    remoteAudioEls.delete(peerId);
    const p = peers.get(peerId);
    if (p) p.hasAudio = false;
  }

  function hardReconnectAllAudioNow() {
    ensureLocalStream({ refresh: true }).then(function () {
      replaceSendTracks();
      meshAllAudioPeers();
      meshTargets().forEach(function (t) {
        if (!hasLiveRemoteStream(t)) forceMeshCall(t, true);
      });
      unlockPlayback();
    });
  }

  function hardReconnectAllAudio() {
    if (hardReconnectTimer) clearTimeout(hardReconnectTimer);
    hardReconnectTimer = setTimeout(function () {
      hardReconnectTimer = null;
      hardReconnectAllAudioNow();
    }, 280);
  }

  function startAudioHealth() {
    if (audioHealthTimer) clearInterval(audioHealthTimer);
    audioHealthTimer = setInterval(function () {
      if (!portalOpen || !peer) return;
      if (studio && studio.Tone && studio.Tone.context.state !== 'running') {
        studio.Tone.context.resume().catch(function () {});
      }
      if (studio && studio.ensurePortalSend) {
        const s = studio.ensurePortalSend();
        if (s) {
          if (s !== localStream) {
            localStream = s;
            replaceSendTracks();
          }
          updateSelfAudioFlag();
        }
      }
      const missing = meshTargets().filter(function (t) {
        noteMissingStream(t);
        return !hasLiveRemoteStream(t);
      });
      if (missing.length) {
        meshAllAudioPeers();
        missing.forEach(function (t) {
          const recover = missingSince.get(t) && Date.now() - missingSince.get(t) > 5000;
          if (shouldInitiateCall(t, recover)) forceMeshCall(t, recover);
        });
      }
      remoteAudioEls.forEach(function (aud, pid) {
        if (aud.dataset.fallback === '1' && aud.paused && aud.srcObject) {
          aud.play().catch(function () {});
        }
      });
      if (studio && studio.isPlaying && studio.isPlaying()) {
        unlockPlayback();
      }
    }, 3500);
  }

  function stopAudioHealth() {
    if (audioHealthTimer) { clearInterval(audioHealthTimer); audioHealthTimer = null; }
    if (hardReconnectTimer) { clearTimeout(hardReconnectTimer); hardReconnectTimer = null; }
  }

  async function addRemoteAudio(peerId, stream, meta) {
    if (!studio || !stream || !peerId || peerId === myId) return;
    if (studio.unlockAudio) await studio.unlockAudio();
    if (studio.initAudio) await studio.initAudio();
    if (studio.Tone) {
      try { await studio.Tone.start(); } catch (e) {}
      if (studio.Tone.context.state !== 'running') {
        try { await studio.Tone.context.resume(); } catch (e) {}
      }
    }

    const prev = remoteStreams.get(peerId);
    if (prev && prev !== stream) removeRemotePeer(peerId);
    remoteStreams.set(peerId, stream);
    noteRemoteStreamLive(peerId);
    stream.getAudioTracks().forEach(function (t) {
      t.enabled = true;
      t.onended = function () {
        if (!portalOpen) return;
        noteMissingStream(peerId);
        detachRemoteRoute(peerId);
        const recover = true;
        if (shouldInitiateCall(peerId, recover)) forceMeshCall(peerId, recover);
      };
    });

    let routed = routeRemoteStream(stream, peerId);
    if (routed) remoteGains.set(peerId, routed);

    const vol = getRemoteVolume(peerId);
    let aud = remoteAudioEls.get(peerId);
    if (!aud) {
      aud = document.createElement('audio');
      aud.autoplay = true;
      aud.playsInline = true;
      aud.setAttribute('playsinline', '');
      aud.muted = false;
      aud.id = 'portal-aud-' + String(peerId).slice(-8);
      aud.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;opacity:0;pointer-events:none';
      document.body.appendChild(aud);
      remoteAudioEls.set(peerId, aud);
    }
    aud.srcObject = stream;
    if (routed && routed.toneOk !== false) {
      aud.volume = 0;
      aud.dataset.fallback = '0';
    } else {
      aud.volume = Math.min(1, vol * 1.25);
      aud.dataset.fallback = '1';
    }
    try { await aud.play(); } catch (e) {
      console.warn('portal aud play', e);
    }
    if (!routed || routed.toneOk === false) {
      routed = routeRemoteStream(stream, peerId);
      if (routed) {
        remoteGains.set(peerId, routed);
        if (routed.toneOk !== false) {
          aud.volume = 0;
          aud.dataset.fallback = '0';
        }
      }
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
    if (seq != null && seq <= lastAppliedBpmSeq) return;
    if (v === portalBpmNow()) {
      if (seq != null) lastAppliedBpmSeq = seq;
      return;
    }
    if (seq != null) lastAppliedBpmSeq = seq;
    lastSentBpm = v;
    studio.applyPortalBpm(v);
  }

  function pushAuthoritativeBpm(bpm, force) {
    const v = Math.round(bpm);
    if (!force && v === lastSentBpm) return;
    lastSentBpm = v;
    lastBpmSeq++;
    broadcast({ type: 'bpm-set', bpm: v, seq: lastBpmSeq, from: portalPeerId() });
  }

  function sendBpmNow(bpm) {
    const v = Math.round(bpm);
    if (isHost) pushAuthoritativeBpm(v, true);
    else sendData({ type: 'bpm-relay', bpm: v, from: portalPeerId() });
  }

  function sendBpm(bpm) {
    bpmPendingVal = Math.round(bpm);
    if (bpmSendTimer) return;
    bpmSendTimer = setTimeout(function () {
      bpmSendTimer = null;
      if (bpmPendingVal != null) sendBpmNow(bpmPendingVal);
      bpmPendingVal = null;
    }, 80);
  }

  function wireBpmSlider() {
    const el = $('bpm');
    if (!el || el.dataset.portalBpmWired) return;
    el.dataset.portalBpmWired = '1';
    el.addEventListener('input', function () {
      if (global.CUORE && CUORE.portalSyncLock) return;
      if (!portalOpen) return;
      sendBpm(parseInt(el.value, 10) || 76);
    });
    el.addEventListener('change', function () {
      if (global.CUORE && CUORE.portalSyncLock) return;
      if (!portalOpen) return;
      if (bpmSendTimer) { clearTimeout(bpmSendTimer); bpmSendTimer = null; }
      sendBpmNow(parseInt(el.value, 10) || 76);
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
    const recover = missingSince.get(remoteId) && Date.now() - missingSince.get(remoteId) > 5000;
    if (!shouldInitiateCall(remoteId, recover)) return;
    if (hasLiveRemoteStream(remoteId)) return;
    if (activeCalls.has(remoteId)) {
      const t0 = callAttemptAt.get(remoteId) || 0;
      if (Date.now() - t0 < 5000) return;
      const prev = mediaCalls.get(remoteId);
      if (prev) { try { prev.close(); } catch (e) {} }
      activeCalls.delete(remoteId);
      mediaCalls.delete(remoteId);
    }

    ensureLocalStream().then(function (stream) {
      if (!stream || !peer || hasLiveRemoteStream(remoteId)) return;
      callAttemptAt.set(remoteId, Date.now());
      try {
        const pm = peers.get(remoteId);
        wireMediaCall(remoteId, peer.call(remoteId, localStream, {
          metadata: { id: myId, name: myName, hue: myHue }
        }), pm ? { id: remoteId, name: pm.name, hue: pm.hue } : null);
      } catch (e) {
        console.warn('meshCall', e);
      }
    });
  }

  function refreshMeshAudio() {
    if (!portalOpen || !peer) return;
    hardReconnectAllAudio();
  }

  async function acceptIncomingCall(call) {
    const pid = call.peer;
    if (!call || !pid || pid === myId) return;
    callAttemptAt.set(pid, Date.now());

    const prev = mediaCalls.get(pid);
    if (prev && prev !== call) {
      try { prev.close(); } catch (e) {}
    }

    wireMediaCall(pid, call, call.metadata || {});

    try {
      await ensureLocalStream();
      if (localStream) call.answer(localStream);
      else throw new Error('no local stream');
    } catch (e) {
      console.warn('acceptIncomingCall ensure', e);
      try {
        await ensureLocalStream({ refresh: true });
        replaceSendTracks();
        if (localStream) call.answer(localStream);
        else call.close();
      } catch (e2) {
        console.warn('acceptIncomingCall retry', e2);
        try { call.close(); } catch (e3) {}
      }
    }

    if (!isHost) connectDataTo(hostPeerId());
  }

  function setupPeerHandlers() {
    peer.on('open', function (id) {
      myId = id;
      if (selfTrail) selfTrail.id = portalPeerId();
      flushPeerReady();
      setStatus('// ONLINE · ' + id.slice(-8));
      announcePortalIdentity();
      startTrailSync();
      syncBpmOut();
      meshAllKnownPeers();
      renderPeerList();
    });

    peer.on('connection', setupPeerDataConn);

    peer.on('call', function (call) {
      acceptIncomingCall(call);
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

  async function ensureLocalStream(opts) {
    const refresh = !!(opts && opts.refresh);
    if (studio.unlockAudio) await studio.unlockAudio();
    await studio.initAudio();
    if (refresh && studio.refreshPortalSendStream) {
      studio.refreshPortalSendStream();
    } else if (studio.ensurePortalSend) {
      studio.ensurePortalSend();
    }
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
    connectPortalWs();
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
        connectDataTo(hostPeerId());
        meshAllAudioPeers();
        setStatus('// JOIN · ' + code);
        setTimeout(function () { meshAllAudioPeers(); }, 800);
        setTimeout(function () { meshAllAudioPeers(); }, 3000);
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
    startAudioHealth();
    unlockPlayback();
  }

  function leavePortal() {
    portalOpen = false;
    leavePortalBoost();
    stopTrailSync();
    stopMeshRetry();
    stopBpmSync();
    stopAudioHealth();
    stopWsKeepalive();
    disconnectPortalWs(true);
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    Array.from(remoteStreams.keys()).forEach(removeRemotePeer);
    remoteAudioEls.forEach(function (_, id) { removeRemotePeer(id); });
    remoteVolumes.clear();
    mediaCalls.clear();
    rtcDataChannels.clear();
    dataConns.forEach(function (c) {
      if (c._peerJsConn) try { c._peerJsConn.close(); } catch (e) {}
    });
    dataConns.clear();
    peers.clear();
    activeCalls.clear();
    missingSince.clear();
    if (peer) { peer.destroy(); peer = null; }
    peerReady = false;
    myId = '';
    hostIdRetry = false;
    localStream = null;
    selfTrail = null;
    lastBpmSeq = 0;
    trailRxCount = 0;
    dataRxCount = 0;
    pendingData.length = 0;
    syncTxCount = 0;
    wsClientId = '';
    $('studioLayout').classList.remove('portal-open');
    $('portalRail').hidden = true;
    $('portalRoomWrap').hidden = true;
    setStatus('// OFFLINE');
    renderPeerList();
  }

  function buildSyncPayload() {
    const tail = selfTrail.trail.slice(-16).map(function (p) {
      return { x: p.x, y: p.y, z: p.z, e: p.e || 0 };
    });
    return {
      type: 'sync',
      id: portalPeerId(),
      peerJsId: myId || '',
      name: myName,
      hue: myHue,
      entryAngle: selfTrail.entryAngle,
      x: selfTrail.x,
      y: selfTrail.y,
      z: selfTrail.z,
      trailTail: tail,
      playing: studio.isPlaying ? studio.isPlaying() : false,
      hasAudio: !!selfTrail.hasAudio,
      bpm: portalBpmNow()
    };
  }

  function startTrailSync() {
    stopTrailSync();
    trailTimer = setInterval(function () {
      if (!portalOpen || !selfTrail || !portalPeerId() || !studio) return;
      const bins = binsFromStudio();
      const active = studio.getActiveLayers ? studio.getActiveLayers() : [];
      advanceTrail(selfTrail, bins, active);
      updateSelfAudioFlag();
      syncPulseCount++;
      syncTxCount++;
      sendData(buildSyncPayload());
      if (syncPulseCount % 10 === 0) renderPeerList();
    }, 150);
  }

  function stopTrailSync() {
    if (trailTimer) { clearInterval(trailTimer); trailTimer = null; }
  }

  function onTransportChange(state) {
    if (!portalOpen) return;
    refreshMeshAudio();
    if (isHost) broadcast(Object.assign({ type: 'transport' }, state));
    else sendData(Object.assign({ type: 'transport-relay' }, state));
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
    const syncEl = $('portalSyncLine');
    if (syncEl) syncEl.textContent = '// portal.js v17 · mesh recovery · bus unificato';

    const peersEl = $('portalPeers');
    if (peersEl && !peersEl.dataset.volBound) {
      peersEl.dataset.volBound = '1';
      peersEl.addEventListener('input', function (ev) {
        if (!isHost) return;
        const inp = ev.target;
        if (!inp.classList || !inp.classList.contains('portal-vol')) return;
        const pid = inp.dataset.pid;
        if (!pid) return;
        const vol = parseInt(inp.value, 10) / 100;
        setRemotePeerVolume(pid, vol);
        const row = inp.closest('.portal-peer-row');
        const valEl = row && row.querySelector('.portal-vol-val');
        if (valEl) valEl.textContent = inp.value + '%';
      });
    }
  }

  global.CuorePortal = {
    bind: bind,
    onTransportChange: onTransportChange,
    onBpmChange: onBpmChange,
    onSendStreamUpdated: onSendStreamUpdated,
    unlockPlayback: unlockPlayback,
    refreshMeshAudio: refreshMeshAudio,
    isOpen: function () { return portalOpen; },
    isHost: function () { return isHost; }
  };
})(window);
