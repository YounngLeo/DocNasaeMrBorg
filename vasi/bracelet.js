/* Configuratore braccialetto — vasi modulari su catena */
(function () {
  var MODULES = [
    { id: 'CL·01', code: 'CLAY_001', mat: 'argilla', img: 'clay/photo_1_2026-05-13_11-12-42.jpg', accent: '#c9a87c' },
    { id: 'CL·02', code: 'CLAY_002', mat: 'argilla', img: 'clay/photo_2_2026-05-13_11-12-42.jpg', accent: '#b8926a' },
    { id: 'CL·03', code: 'CLAY_003', mat: 'argilla', img: 'clay/photo_3_2026-05-13_11-12-42.jpg', accent: '#a8845e' },
    { id: 'CL·04', code: 'CLAY_004', mat: 'argilla', img: 'clay/photo_4_2026-05-13_11-12-42.jpg', accent: '#d4b896' },
    { id: 'CL·05', code: 'CLAY_005', mat: 'argilla', img: 'clay/photo_5_2026-05-13_11-12-42.jpg', accent: '#bc9870' },
    { id: 'CL·06', code: 'CLAY_006', mat: 'argilla', img: 'clay/photo_6_2026-05-13_11-12-42.jpg', accent: '#c4a078' },
    { id: 'PL·01', code: 'PLA_001', mat: 'pla', img: 'pla/photo_1_2026-05-13_11-14-33.jpg', accent: '#5eff7e' },
    { id: 'PL·02', code: 'PLA_002', mat: 'pla', img: 'pla/photo_2_2026-05-13_11-14-33.jpg', accent: '#4af6ff' },
    { id: 'PL·03', code: 'PLA_003', mat: 'pla', img: 'pla/photo_3_2026-05-13_11-14-33.jpg', accent: '#c678ff' }
  ];

  var CX = 210;
  var CY = 210;
  var RX_BASE = 128;
  var RY_BASE = 96;

  var stage = document.getElementById('br-stage');
  var svg = document.getElementById('br-svg');
  if (!stage || !svg) return;

  var chainLayer = document.getElementById('br-chain-layer');
  var slotLayer = document.getElementById('br-slot-layer');
  var beadLayer = document.getElementById('br-bead-layer');
  var palette = document.getElementById('br-palette');
  var readout = document.getElementById('br-readout');
  var recipeEl = document.getElementById('br-recipe');

  var beads = [];
  var selectedIdx = 0;
  var slotCount = 10;
  var scale = 1;
  var rotation = -Math.PI / 2;
  var dragging = false;
  var lastAngle = 0;

  function mod(i) {
    return MODULES[i % MODULES.length];
  }

  function slotPosition(i) {
    var rx = RX_BASE * scale;
    var ry = RY_BASE * scale;
    var a = rotation + (i / slotCount) * Math.PI * 2;
    return {
      x: CX + Math.cos(a) * rx,
      y: CY + Math.sin(a) * ry,
      a: a + Math.PI / 2
    };
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs).forEach(function (k) {
      el.setAttribute(k, attrs[k]);
    });
    return el;
  }

  function drawChain() {
    chainLayer.innerHTML = '';
    var rx = RX_BASE * scale;
    var ry = RY_BASE * scale;

    chainLayer.appendChild(svgEl('ellipse', {
      cx: CX, cy: CY, rx: rx, ry: ry,
      fill: 'none', stroke: '#2a2a2a', 'stroke-width': '1',
      'stroke-dasharray': '3 5'
    }));

    for (var i = 0; i < slotCount; i++) {
      var p0 = slotPosition(i);
      var p1 = slotPosition((i + 1) % slotCount);
      var mx = (p0.x + p1.x) / 2;
      var my = (p0.y + p1.y) / 2;
      var ma = Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;

      var link = svgEl('g', { transform: 'translate(' + mx + ',' + my + ') rotate(' + ma + ')' });
      link.appendChild(svgEl('rect', {
        x: '-7', y: '-3', width: '14', height: '6', rx: '2',
        fill: '#141414', stroke: '#4a4a4a', 'stroke-width': '0.8'
      }));
      link.appendChild(svgEl('circle', {
        cx: '-9', cy: '0', r: '2.2', fill: 'none', stroke: '#5a5a5a', 'stroke-width': '0.7'
      }));
      link.appendChild(svgEl('circle', {
        cx: '9', cy: '0', r: '2.2', fill: 'none', stroke: '#5a5a5a', 'stroke-width': '0.7'
      }));
      chainLayer.appendChild(link);
    }
  }

  function drawSlots() {
    slotLayer.innerHTML = '';
    for (var i = 0; i < slotCount; i++) {
      if (beads[i]) continue;
      var p = slotPosition(i);
      var g = svgEl('g', {
        class: 'br-slot',
        transform: 'translate(' + p.x + ',' + p.y + ')',
        'data-slot': String(i)
      });
      g.appendChild(svgEl('circle', {
        cx: '0', cy: '0', r: '11',
        fill: 'rgba(94,255,126,0.06)', stroke: '#3aaa50', 'stroke-width': '0.8',
        opacity: '0.55', 'stroke-dasharray': '2 2'
      }));
      g.appendChild(svgEl('text', {
        x: '0', y: '3', 'text-anchor': 'middle',
        fill: '#3aaa50', 'font-size': '8', 'font-family': 'Courier New, monospace'
      })).textContent = '+';
      slotLayer.appendChild(g);
    }
  }

  function drawBead(i, typeIdx) {
    var m = mod(typeIdx);
    var p = slotPosition(i);
    var g = svgEl('g', {
      class: 'br-slot filled',
      transform: 'translate(' + p.x + ',' + p.y + ') rotate(' + (p.a * 180 / Math.PI) + ')',
      'data-slot': String(i)
    });

    g.appendChild(svgEl('ellipse', {
      cx: '0', cy: '10', rx: '16', ry: '7',
      fill: 'none', stroke: m.accent, 'stroke-width': '1.2', opacity: '0.85'
    }));

    g.appendChild(svgEl('rect', {
      x: '-14', y: '6', width: '28', height: '5', rx: '2',
      fill: '#1a1a1a', stroke: m.accent, 'stroke-width': '0.6', opacity: '0.9'
    }));

    var clipId = 'br-clip-' + i;
    var defs = svg.querySelector('defs') || svg.insertBefore(svgEl('defs', {}), svg.firstChild);
    var clip = svgEl('clipPath', { id: clipId });
    clip.appendChild(svgEl('path', {
      d: 'M-12 8 Q-14 -6 -8 -22 Q0 -30 8 -22 Q14 -6 12 8 Z'
    }));
    defs.appendChild(clip);

    var img = svgEl('image', {
      href: m.img,
      x: '-12', y: '-24', width: '24', height: '32',
      'clip-path': 'url(#' + clipId + ')',
      preserveAspectRatio: 'xMidYMid slice'
    });
    g.appendChild(img);

    g.appendChild(svgEl('text', {
      x: '0', y: '-28', 'text-anchor': 'middle',
      fill: m.accent, 'font-size': '6.5', 'font-family': 'Courier New, monospace',
      opacity: '0.9'
    })).textContent = m.id;

    beadLayer.appendChild(g);
  }

  function drawBeads() {
    beadLayer.innerHTML = '';
    var oldClips = svg.querySelectorAll('clipPath[id^="br-clip-"]');
    oldClips.forEach(function (c) { c.remove(); });

    for (var i = 0; i < slotCount; i++) {
      if (beads[i] != null) drawBead(i, beads[i]);
    }
  }

  function updateReadout() {
    var filled = beads.filter(function (b) { return b != null; }).length;
    var counts = {};
    beads.forEach(function (b) {
      if (b == null) return;
      var m = mod(b);
      counts[m.mat] = (counts[m.mat] || 0) + 1;
    });
    var parts = Object.keys(counts).map(function (k) {
      return k.toUpperCase() + '×' + counts[k];
    });
    var matStr = parts.length ? parts.join(' · ') : 'CATENA VUOTA';
    readout.textContent = 'BRACCIALETTO · ' + filled + '/' + slotCount + ' VASI · ' + matStr;

    var seq = [];
    for (var i = 0; i < slotCount; i++) {
      if (beads[i] != null) seq.push(mod(beads[i]).id);
    }
    recipeEl.textContent = seq.length
      ? '// ricetta: ' + seq.join(' → ')
      : '// ricetta: —';
  }

  function render() {
    while (beads.length < slotCount) beads.push(null);
    if (beads.length > slotCount) beads.length = slotCount;
    drawChain();
    drawBeads();
    drawSlots();
    updateReadout();
  }

  function firstEmptySlot() {
    for (var i = 0; i < slotCount; i++) {
      if (beads[i] == null) return i;
    }
    return -1;
  }

  function addBead(slot) {
    var idx = slot != null ? slot : firstEmptySlot();
    if (idx < 0 || idx >= slotCount || beads[idx] != null) return false;
    beads[idx] = selectedIdx;
    render();
    return true;
  }

  function removeBead(slot) {
    if (slot != null) {
      if (beads[slot] == null) return;
      beads[slot] = null;
      render();
      return;
    }
    for (var i = slotCount - 1; i >= 0; i--) {
      if (beads[i] != null) {
        beads[i] = null;
        render();
        return;
      }
    }
  }

  function buildPalette() {
    palette.innerHTML = '';
    MODULES.forEach(function (m, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'br-palette-item' + (i === selectedIdx ? ' selected' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', i === selectedIdx ? 'true' : 'false');
      btn.setAttribute('aria-label', m.code + ' · ' + m.mat);
      btn.innerHTML =
        '<img src="' + m.img + '" alt="" loading="lazy">' +
        '<span class="br-pi-id">' + m.id + '</span>';
      btn.addEventListener('click', function () {
        selectedIdx = i;
        palette.querySelectorAll('.br-palette-item').forEach(function (el, j) {
          el.classList.toggle('selected', j === i);
          el.setAttribute('aria-selected', j === i ? 'true' : 'false');
        });
      });
      palette.appendChild(btn);
    });
  }

  function pointerAngle(e) {
    var rect = svg.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 420;
    var y = ((e.clientY - rect.top) / rect.height) * 420;
    return Math.atan2(y - CY, x - CX);
  }

  function onSlotClick(e) {
    var g = e.target.closest('[data-slot]');
    if (!g) return;
    var slot = parseInt(g.getAttribute('data-slot'), 10);
    if (beads[slot] != null) removeBead(slot);
    else addBead(slot);
  }

  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.br-slot')) return;
    dragging = true;
    stage.classList.add('dragging');
    lastAngle = pointerAngle(e);
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var a = pointerAngle(e);
    rotation += a - lastAngle;
    lastAngle = a;
    render();
  });

  stage.addEventListener('pointerup', function () {
    dragging = false;
    stage.classList.remove('dragging');
  });

  stage.addEventListener('pointercancel', function () {
    dragging = false;
    stage.classList.remove('dragging');
  });

  svg.addEventListener('click', onSlotClick);

  svg.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.br-slot')) e.stopPropagation();
  });

  document.getElementById('br-add').addEventListener('click', function () {
    addBead();
  });
  document.getElementById('br-remove').addEventListener('click', function () {
    removeBead();
  });
  document.getElementById('br-clear').addEventListener('click', function () {
    beads = [];
    render();
  });
  document.getElementById('br-export').addEventListener('click', function () {
    var lines = ['BRACCIALETTO MODULARE — DoctNasa&MrBorg', ''];
    for (var i = 0; i < slotCount; i++) {
      if (beads[i] == null) continue;
      var m = mod(beads[i]);
      lines.push('slot ' + (i + 1) + ': ' + m.id + ' · ' + m.code + ' · ' + m.mat);
    }
    if (lines.length === 2) lines.push('(vuoto)');
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        readout.textContent = 'RICETTA COPIATA · ' + readout.textContent;
        setTimeout(updateReadout, 1800);
      }).catch(function () {
        window.prompt('Copia la ricetta:', text);
      });
    } else {
      window.prompt('Copia la ricetta:', text);
    }
  });

  document.getElementById('br-slots').addEventListener('input', function (e) {
    slotCount = parseInt(e.target.value, 10);
    document.getElementById('brv-slots').textContent = String(slotCount);
    render();
  });

  document.getElementById('br-scale').addEventListener('input', function (e) {
    scale = parseFloat(e.target.value);
    document.getElementById('brv-scale').textContent = scale.toFixed(2);
    render();
  });

  buildPalette();
  render();
})();
