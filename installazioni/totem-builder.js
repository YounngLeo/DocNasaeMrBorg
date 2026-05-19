/* Death Nature Totem — lavagnetta magnetica · icone erbario */
(function () {
  var STORAGE_KEY = 'totem_lavagnetta_v1';
  var CATALOG_URL = '../assets/erbario-catalog.json';

  var CATEGORIES = [
    { key: 'foglie', label: 'FOGLIE', color: '#5eff7e', icon: '🍃' },
    { key: 'fiori',  label: 'FIORI',  color: '#c678ff', icon: '✿' },
    { key: 'frutti', label: 'FRUTTI', color: '#ffb000', icon: '◆' },
    { key: 'busti',  label: 'BUSTI',  color: '#c9a87c', icon: '▮' }
  ];

  var board = document.getElementById('tm-board');
  var catalogEl = document.getElementById('tm-catalog');
  var tabsEl = document.getElementById('tm-tabs');
  if (!board || !catalogEl) return;

  var catalog = [];
  var catalogMap = {};
  var magnets = [];
  var selectedId = null;
  var activeCategory = 'foglie';
  var dragState = null;
  var magnetCounter = 0;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (Array.isArray(data.magnets)) magnets = data.magnets;
      if (data.magnetCounter) magnetCounter = data.magnetCounter;
    } catch (e) {}
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ magnets: magnets, magnetCounter: magnetCounter }));
    } catch (e) {}
  }

  function catColor(key) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key) return CATEGORIES[i].color;
    }
    return '#5eff7e';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function boardRect() {
    return board.getBoundingClientRect();
  }

  function renderTabs() {
    if (!tabsEl) return;
    tabsEl.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      var count = catalog.filter(function (i) { return i.category === cat.key; }).length;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tm-tab' + (activeCategory === cat.key ? ' on' : '');
      btn.style.setProperty('--tm-c', cat.color);
      btn.innerHTML = '<span class="tm-tab-icon">' + cat.icon + '</span><span>' + cat.label + '</span><span class="tm-tab-n">' + count + '</span>';
      btn.addEventListener('click', function () {
        activeCategory = cat.key;
        renderTabs();
        renderCatalog();
      });
      tabsEl.appendChild(btn);
    });
  }

  function renderCatalog() {
    catalogEl.innerHTML = '';
    var items = catalog.filter(function (i) { return i.category === activeCategory; });
    if (!items.length) {
      catalogEl.innerHTML = '<div class="tm-empty">nessuna icona in questa sezione</div>';
      return;
    }
    items.forEach(function (item) {
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tm-tile';
      tile.style.setProperty('--tm-c', catColor(item.category));
      tile.draggable = true;
      tile.title = item.plant + ' · ' + item.label;
      tile.innerHTML =
        '<span class="tm-tile-id">' + escapeHtml(item.id) + '</span>' +
        '<span class="tm-tile-svg">' + item.svg + '</span>' +
        '<span class="tm-tile-name">' + escapeHtml(item.plant.slice(0, 14)) + '</span>';
      tile.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      tile.addEventListener('click', function () {
        addMagnet(item.id, board.clientWidth / 2, board.clientHeight / 2);
      });
      catalogEl.appendChild(tile);
    });
  }

  function addMagnet(catalogId, x, y) {
    var item = catalogMap[catalogId];
    if (!item) return;
    var id = 'mag_' + (++magnetCounter);
    magnets.push({
      id: id,
      catalogId: catalogId,
      x: x,
      y: y,
      rot: Math.round(Math.random() * 8) * 45 - 180,
      scale: 1
    });
    selectedId = id;
    saveState();
    renderBoard();
    updateReadout();
  }

  function removeMagnet(id) {
    magnets = magnets.filter(function (m) { return m.id !== id; });
    if (selectedId === id) selectedId = null;
    saveState();
    renderBoard();
    updateReadout();
  }

  function renderBoard() {
    board.querySelectorAll('.tm-magnet').forEach(function (el) { el.remove(); });
    magnets.forEach(function (mag) {
      var item = catalogMap[mag.catalogId];
      if (!item) return;
      var el = document.createElement('div');
      el.className = 'tm-magnet' + (selectedId === mag.id ? ' selected' : '');
      el.dataset.id = mag.id;
      el.style.setProperty('--tm-c', catColor(item.category));
      el.style.left = mag.x + 'px';
      el.style.top = mag.y + 'px';
      el.style.transform = 'translate(-50%, -50%) rotate(' + mag.rot + 'deg) scale(' + mag.scale + ')';
      el.innerHTML =
        '<div class="tm-magnet-inner">' + item.svg + '</div>' +
        '<button type="button" class="tm-rot-handle" title="ruota">↻</button>';
      el.addEventListener('pointerdown', onMagnetDown);
      el.querySelector('.tm-rot-handle').addEventListener('pointerdown', onRotDown);
      el.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        removeMagnet(mag.id);
      });
      board.appendChild(el);
    });
  }

  function getMagnet(id) {
    for (var i = 0; i < magnets.length; i++) {
      if (magnets[i].id === id) return magnets[i];
    }
    return null;
  }

  function onMagnetDown(e) {
    if (e.target.classList.contains('tm-rot-handle')) return;
    e.preventDefault();
    var el = e.currentTarget;
    var id = el.dataset.id;
    var mag = getMagnet(id);
    if (!mag) return;
    selectedId = id;
    renderBoard();
    syncPanel();
    var rect = boardRect();
    dragState = {
      mode: 'move',
      id: id,
      offX: e.clientX - rect.left - mag.x,
      offY: e.clientY - rect.top - mag.y
    };
    el.setPointerCapture(e.pointerId);
  }

  function onRotDown(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.currentTarget.closest('.tm-magnet');
    var id = el.dataset.id;
    var mag = getMagnet(id);
    if (!mag) return;
    selectedId = id;
    var rect = boardRect();
    var cx = rect.left + mag.x;
    var cy = rect.top + mag.y;
    dragState = {
      mode: 'rotate',
      id: id,
      cx: cx,
      cy: cy
    };
    e.target.setPointerCapture(e.pointerId);
  }

  function onBoardPointerMove(e) {
    if (!dragState) return;
    var mag = getMagnet(dragState.id);
    if (!mag) return;
    var rect = boardRect();
    if (dragState.mode === 'move') {
      mag.x = Math.max(20, Math.min(rect.width - 20, e.clientX - rect.left - dragState.offX));
      mag.y = Math.max(20, Math.min(rect.height - 20, e.clientY - rect.top - dragState.offY));
      var el = board.querySelector('[data-id="' + mag.id + '"]');
      if (el) {
        el.style.left = mag.x + 'px';
        el.style.top = mag.y + 'px';
      }
    } else if (dragState.mode === 'rotate') {
      var ang = Math.atan2(e.clientY - dragState.cy, e.clientX - dragState.cx) * 180 / Math.PI + 90;
      mag.rot = Math.round(ang / 15) * 15;
      var el2 = board.querySelector('[data-id="' + mag.id + '"]');
      if (el2) {
        el2.style.transform = 'translate(-50%, -50%) rotate(' + mag.rot + 'deg) scale(' + mag.scale + ')';
      }
      var rotEl = document.getElementById('tmv-rot');
      if (rotEl) rotEl.textContent = String(mag.rot);
      var rotRange = document.getElementById('tm-rot');
      if (rotRange) rotRange.value = String(mag.rot);
    }
  }

  function onBoardPointerUp() {
    if (dragState) {
      saveState();
      updateReadout();
      dragState = null;
    }
  }

  board.addEventListener('pointermove', onBoardPointerMove);
  board.addEventListener('pointerup', onBoardPointerUp);
  board.addEventListener('pointercancel', onBoardPointerUp);

  board.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  board.addEventListener('drop', function (e) {
    e.preventDefault();
    var catalogId = e.dataTransfer.getData('text/plain');
    if (!catalogId) return;
    var rect = boardRect();
    addMagnet(catalogId, e.clientX - rect.left, e.clientY - rect.top);
  });
  board.addEventListener('click', function (e) {
    if (e.target === board || e.target.classList.contains('tm-grid-bg')) {
      selectedId = null;
      renderBoard();
      syncPanel();
    }
  });

  function syncPanel() {
    var mag = selectedId ? getMagnet(selectedId) : null;
    var rotRange = document.getElementById('tm-rot');
    var scaleRange = document.getElementById('tm-scale');
    var selLabel = document.getElementById('tm-sel-label');
    if (selLabel) {
      if (mag && catalogMap[mag.catalogId]) {
        var it = catalogMap[mag.catalogId];
        selLabel.textContent = it.id + ' · ' + it.label;
      } else selLabel.textContent = '—';
    }
    if (rotRange) {
      rotRange.disabled = !mag;
      if (mag) rotRange.value = String(mag.rot);
    }
    if (scaleRange) {
      scaleRange.disabled = !mag;
      if (mag) scaleRange.value = String(mag.scale);
    }
    var rotVal = document.getElementById('tmv-rot');
    var scaleVal = document.getElementById('tmv-scale');
    if (rotVal) rotVal.textContent = mag ? String(mag.rot) : '0';
    if (scaleVal) scaleVal.textContent = mag ? mag.scale.toFixed(2) : '1.00';
  }

  function updateReadout() {
    var el = document.getElementById('tm-readout');
    var recipe = document.getElementById('tm-recipe');
    if (el) el.textContent = 'TOTEM · ' + magnets.length + ' MAGNETI · ERBARIO ×92';
    if (recipe) {
      if (!magnets.length) {
        recipe.textContent = '// composizione: —';
        return;
      }
      var parts = magnets.map(function (m, i) {
        var it = catalogMap[m.catalogId];
        return (i + 1) + ':' + (it ? it.id : '?');
      });
      recipe.textContent = '// composizione: ' + parts.join(' · ');
    }
  }

  function generateTotem() {
    if (!catalog.length) return;
    magnets = [];
    var h = board.clientHeight || 480;
    var w = board.clientWidth || 600;
    var layers = 5 + Math.floor(Math.random() * 4);
    var yStep = (h - 80) / layers;
    var midCats = ['foglie', 'fiori', 'busti'];
    for (var i = 0; i < layers; i++) {
      var cat = i === 0 ? 'busti' : (i === layers - 1 ? 'frutti' : midCats[Math.floor(Math.random() * midCats.length)]);
      var pool = catalog.filter(function (c) { return c.category === cat; });
      if (!pool.length) pool = catalog;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      magnets.push({
        id: 'mag_' + (++magnetCounter),
        catalogId: pick.id,
        x: w / 2 + (Math.random() - 0.5) * 60,
        y: 40 + i * yStep,
        rot: Math.round(Math.random() * 12) * 30 - 180,
        scale: 0.85 + Math.random() * 0.35
      });
    }
    selectedId = null;
    saveState();
    renderBoard();
    updateReadout();
    syncPanel();
  }

  function exportList() {
    var lines = ['DEATH NATURE TOTEM — composizione erbario', ''];
    magnets.forEach(function (m, i) {
      var it = catalogMap[m.catalogId];
      if (!it) return;
      lines.push((i + 1) + '. ' + it.id + ' · ' + it.plant + ' · ' + it.label + ' · rot ' + m.rot + '°');
    });
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      window.prompt('Copia:', text);
    }
  }

  document.getElementById('tm-gen').addEventListener('click', generateTotem);
  document.getElementById('tm-clear').addEventListener('click', function () {
    magnets = [];
    selectedId = null;
    saveState();
    renderBoard();
    updateReadout();
    syncPanel();
  });
  document.getElementById('tm-export').addEventListener('click', exportList);
  document.getElementById('tm-del').addEventListener('click', function () {
    if (selectedId) removeMagnet(selectedId);
    syncPanel();
  });

  document.getElementById('tm-rot').addEventListener('input', function (e) {
    if (!selectedId) return;
    var mag = getMagnet(selectedId);
    if (!mag) return;
    mag.rot = parseInt(e.target.value, 10);
    document.getElementById('tmv-rot').textContent = String(mag.rot);
    saveState();
    renderBoard();
  });
  document.getElementById('tm-scale').addEventListener('input', function (e) {
    if (!selectedId) return;
    var mag = getMagnet(selectedId);
    if (!mag) return;
    mag.scale = parseFloat(e.target.value);
    document.getElementById('tmv-scale').textContent = mag.scale.toFixed(2);
    saveState();
    renderBoard();
  });

  fetch(CATALOG_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      catalog = data;
      catalog.forEach(function (item) { catalogMap[item.id] = item; });
      renderTabs();
      renderCatalog();
      loadState();
      renderBoard();
      updateReadout();
      syncPanel();
    })
    .catch(function () {
      catalogEl.innerHTML = '<div class="tm-empty">errore caricamento catalogo erbario</div>';
    });
})();
