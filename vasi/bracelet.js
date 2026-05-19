/* Configuratore catena verticale — moduli vaso creati dall'utente */
(function () {
  var STORAGE_KEY = 'vasi_catena_moduli_v1';

  var SHAPES = {
    cilindro: { label: 'cilindro', draw: drawCilindro },
    cono:     { label: 'cono',     draw: drawCono },
    bulbo:    { label: 'bulbo',    draw: drawBulbo },
    spirale:  { label: 'spirale',  draw: drawSpirale }
  };

  var MAT_COLORS = { argilla: '#c9a87c', pla: '#5eff7e', resina: '#4af6ff' };

  var svg = document.getElementById('br-svg');
  var chainLayer = document.getElementById('br-chain-layer');
  var moduleLayer = document.getElementById('br-module-layer');
  var slotLayer = document.getElementById('br-slot-layer');
  if (!svg || !chainLayer) return;

  var userModules = [];
  var chain = [];
  var selectedModuleId = null;
  var slotCount = 8;
  var moduleCounter = 1;

  var CX = 100;
  var TOP = 36;
  var STEP = 58;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (Array.isArray(data.modules)) userModules = data.modules;
      if (Array.isArray(data.chain)) chain = data.chain;
      if (data.slotCount) slotCount = data.slotCount;
      if (data.moduleCounter) moduleCounter = data.moduleCounter;
    } catch (e) {}
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        modules: userModules,
        chain: chain,
        slotCount: slotCount,
        moduleCounter: moduleCounter
      }));
    } catch (e) {}
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function slotY(i) { return TOP + i * STEP; }

  function drawCilindro(g, m, h) {
    g.appendChild(svgEl('rect', {
      x: -14, y: -h * 0.45, width: 28, height: h * 0.75, rx: 3,
      fill: m.color, stroke: '#888', 'stroke-width': '0.6', opacity: '0.92'
    }));
    g.appendChild(svgEl('ellipse', {
      cx: 0, cy: -h * 0.45, rx: 14, ry: 4,
      fill: 'none', stroke: m.color, 'stroke-width': '0.8'
    }));
  }

  function drawCono(g, m, h) {
    g.appendChild(svgEl('path', {
      d: 'M-16 ' + (h * 0.3) + ' L0 ' + (-h * 0.45) + ' L16 ' + (h * 0.3) + ' Z',
      fill: m.color, stroke: '#888', 'stroke-width': '0.6', opacity: '0.92'
    }));
  }

  function drawBulbo(g, m, h) {
    g.appendChild(svgEl('ellipse', {
      cx: 0, cy: 0, rx: 16, ry: h * 0.38,
      fill: m.color, stroke: '#888', 'stroke-width': '0.6', opacity: '0.92'
    }));
    g.appendChild(svgEl('rect', {
      x: -6, y: -h * 0.45, width: 12, height: h * 0.22, rx: 2,
      fill: m.color, stroke: '#666', 'stroke-width': '0.5', opacity: '0.85'
    }));
  }

  function drawSpirale(g, m, h) {
    g.appendChild(svgEl('path', {
      d: 'M0 ' + (-h * 0.4) + ' Q14 ' + (-h * 0.15) + ' 0 0.1 T0 ' + (h * 0.35),
      fill: 'none', stroke: m.color, 'stroke-width': '5', 'stroke-linecap': 'round', opacity: '0.9'
    }));
  }

  function drawModuleShape(g, mod) {
    var fn = SHAPES[mod.shape] ? SHAPES[mod.shape].draw : drawCilindro;
    fn(g, mod, mod.height || 40);
  }

  function drawChain() {
    chainLayer.innerHTML = '';
    var bottom = slotY(slotCount - 1) + 40;
    chainLayer.appendChild(svgEl('line', {
      x1: CX, y1: TOP - 20, x2: CX, y2: bottom,
      stroke: '#3a3a3a', 'stroke-width': '2'
    }));
    for (var i = 0; i < slotCount; i++) {
      var y = slotY(i);
      var link = svgEl('g', { transform: 'translate(' + CX + ',' + y + ')' });
      link.appendChild(svgEl('rect', {
        x: -10, y: -4, width: 20, height: 8, rx: 2,
        fill: '#141414', stroke: '#555', 'stroke-width': '0.8'
      }));
      link.appendChild(svgEl('circle', {
        cx: 0, cy: -14, r: 2.5, fill: 'none', stroke: '#666', 'stroke-width': '0.7'
      }));
      link.appendChild(svgEl('circle', {
        cx: 0, cy: 14, r: 2.5, fill: 'none', stroke: '#666', 'stroke-width': '0.7'
      }));
      if (i < slotCount - 1) {
        link.appendChild(svgEl('line', {
          x1: 0, y1: 8, x2: 0, y2: STEP - 8,
          stroke: '#444', 'stroke-width': '1.5'
        }));
      }
      chainLayer.appendChild(link);
    }
  }

  function getModuleById(id) {
    for (var i = 0; i < userModules.length; i++) {
      if (userModules[i].id === id) return userModules[i];
    }
    return null;
  }

  function drawModules() {
    moduleLayer.innerHTML = '';
    for (var i = 0; i < slotCount; i++) {
      if (!chain[i]) continue;
      var mod = getModuleById(chain[i]);
      if (!mod) continue;
      var y = slotY(i);
      var g = svgEl('g', {
        class: 'br-mod br-slot filled',
        transform: 'translate(' + (CX + 38) + ',' + y + ')',
        'data-slot': String(i)
      });
      drawModuleShape(g, mod);
      g.appendChild(svgEl('text', {
        x: 0, y: (mod.height || 40) * 0.55,
        'text-anchor': 'middle', fill: '#d0d0d0', 'font-size': '7',
        'font-family': 'Courier New, monospace'
      })).textContent = mod.name.slice(0, 8);
      moduleLayer.appendChild(g);
    }
  }

  function drawSlots() {
    slotLayer.innerHTML = '';
    for (var i = 0; i < slotCount; i++) {
      if (chain[i]) continue;
      var y = slotY(i);
      var g = svgEl('g', {
        class: 'br-slot',
        transform: 'translate(' + (CX + 38) + ',' + y + ')',
        'data-slot': String(i)
      });
      g.appendChild(svgEl('rect', {
        x: -18, y: -18, width: 36, height: 36, rx: 2,
        fill: 'rgba(94,255,126,0.04)', stroke: '#3aaa50', 'stroke-width': '0.8',
        'stroke-dasharray': '3 2', opacity: '0.7'
      }));
      g.appendChild(svgEl('text', {
        x: 0, y: 4, 'text-anchor': 'middle', fill: '#3aaa50',
        'font-size': '14', 'font-family': 'Courier New, monospace'
      })).textContent = '+';
      slotLayer.appendChild(g);
    }
  }

  function updateReadout() {
    var filled = chain.filter(function (c) { return c; }).length;
    var el = document.getElementById('br-readout');
    var recipe = document.getElementById('br-recipe');
    if (el) el.textContent = 'CATENA · ' + filled + '/' + slotCount + ' MODULI · ' + userModules.length + ' CREATI';
    if (recipe) {
      var parts = [];
      for (var i = 0; i < slotCount; i++) {
        if (!chain[i]) continue;
        var m = getModuleById(chain[i]);
        if (m) parts.push((i + 1) + ':' + m.name);
      }
      recipe.textContent = parts.length ? '// sequenza: ' + parts.join(' → ') : '// sequenza: —';
    }
  }

  function render() {
    while (chain.length < slotCount) chain.push(null);
    if (chain.length > slotCount) chain.length = slotCount;
    var h = TOP + slotCount * STEP + 40;
    svg.setAttribute('viewBox', '0 0 200 ' + h);
    drawChain();
    drawModules();
    drawSlots();
    updateReadout();
    renderModuleList();
  }

  function renderModuleList() {
    var list = document.getElementById('br-module-list');
    if (!list) return;
    list.innerHTML = '';
    if (!userModules.length) {
      list.innerHTML = '<div class="br-empty">nessun modulo — creane uno sotto</div>';
      return;
    }
    userModules.forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'br-mod-item' + (selectedModuleId === m.id ? ' selected' : '');
      btn.innerHTML =
        '<span class="br-mod-preview" style="background:' + m.color + '"></span>' +
        '<span class="br-mod-meta"><b>' + escapeHtml(m.name) + '</b>' +
        '<small>' + m.material + ' · ' + m.shape + '</small></span>' +
        '<span class="br-mod-del" data-del="' + m.id + '" title="elimina">×</span>';
      btn.addEventListener('click', function (e) {
        if (e.target.classList.contains('br-mod-del')) {
          var delId = e.target.getAttribute('data-del');
          userModules = userModules.filter(function (x) { return x.id !== delId; });
          chain = chain.map(function (cid) { return cid === delId ? null : cid; });
          if (selectedModuleId === delId) selectedModuleId = null;
          save(); render();
          return;
        }
        selectedModuleId = m.id;
        renderModuleList();
      });
      list.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function createModule() {
    var name = (document.getElementById('br-name').value || '').trim();
    if (!name) name = 'MOD_' + moduleCounter;
    var mod = {
      id: 'mod_' + Date.now(),
      name: name,
      material: document.getElementById('br-mat').value,
      shape: document.getElementById('br-shape').value,
      color: document.getElementById('br-color').value,
      height: parseInt(document.getElementById('br-height').value, 10) || 40
    };
    if (!mod.color || mod.color === '#000000') mod.color = MAT_COLORS[mod.material] || '#c9a87c';
    userModules.push(mod);
    selectedModuleId = mod.id;
    moduleCounter++;
    save();
    render();
  }

  function firstEmptySlot() {
    for (var i = 0; i < slotCount; i++) if (!chain[i]) return i;
    return -1;
  }

  function addToChain(slot) {
    if (!selectedModuleId) return false;
    var idx = slot != null ? slot : firstEmptySlot();
    if (idx < 0 || idx >= slotCount || chain[idx]) return false;
    chain[idx] = selectedModuleId;
    save(); render();
    return true;
  }

  function removeFromChain(slot) {
    if (slot != null) {
      chain[slot] = null;
    } else {
      for (var i = slotCount - 1; i >= 0; i--) {
        if (chain[i]) { chain[i] = null; break; }
      }
    }
    save(); render();
  }

  svg.addEventListener('click', function (e) {
    var g = e.target.closest('[data-slot]');
    if (!g) return;
    var slot = parseInt(g.getAttribute('data-slot'), 10);
    if (chain[slot]) removeFromChain(slot);
    else addToChain(slot);
  });

  document.getElementById('br-create').addEventListener('click', createModule);
  document.getElementById('br-add').addEventListener('click', function () { addToChain(); });
  document.getElementById('br-remove').addEventListener('click', function () { removeFromChain(); });
  document.getElementById('br-clear').addEventListener('click', function () {
    chain = []; save(); render();
  });
  document.getElementById('br-export').addEventListener('click', function () {
    var lines = ['CATENA VERTICALE — DoctNasa&MrBorg', ''];
    for (var i = 0; i < slotCount; i++) {
      if (!chain[i]) continue;
      var m = getModuleById(chain[i]);
      if (m) lines.push((i + 1) + '. ' + m.name + ' · ' + m.material + ' · ' + m.shape);
    }
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      window.prompt('Copia:', text);
    }
  });
  document.getElementById('br-slots').addEventListener('input', function (e) {
    slotCount = parseInt(e.target.value, 10);
    document.getElementById('brv-slots').textContent = String(slotCount);
    save(); render();
  });
  document.getElementById('br-mat').addEventListener('change', function (e) {
    var c = MAT_COLORS[e.target.value];
    if (c) document.getElementById('br-color').value = c;
  });
  document.getElementById('br-height').addEventListener('input', function (e) {
    document.getElementById('brv-height').textContent = e.target.value;
  });

  load();
  if (!userModules.length) {
    userModules.push({
      id: 'mod_seed', name: 'MOD_A', material: 'argilla', shape: 'cilindro',
      color: MAT_COLORS.argilla, height: 42
    });
    selectedModuleId = 'mod_seed';
  }
  render();
})();
