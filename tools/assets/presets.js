(function(global){
'use strict';

const STORAGE_PREFIX = 'dnmb_preset_';

function key(slug) { return STORAGE_PREFIX + slug; }

function list(slug) {
  try {
    const raw = localStorage.getItem(key(slug));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(slug, name, state) {
  const presets = list(slug);
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: name || ('preset_' + (presets.length + 1)),
    created: new Date().toISOString(),
    state
  };
  presets.unshift(entry);
  if (presets.length > 100) presets.length = 100;
  localStorage.setItem(key(slug), JSON.stringify(presets));
  return entry;
}

function remove(slug, id) {
  const presets = list(slug).filter(p => p.id !== id);
  localStorage.setItem(key(slug), JSON.stringify(presets));
}

function find(slug, id) {
  return list(slug).find(p => p.id === id) || null;
}

function clear(slug) {
  localStorage.removeItem(key(slug));
}

function exportAll(slug) {
  const presets = list(slug);
  return JSON.stringify({
    studio: 'DoctNasa&MrBorg',
    tool: slug,
    exported: new Date().toISOString(),
    presets
  }, null, 2);
}

function importAll(slug, json) {
  try {
    const data = JSON.parse(json);
    if (data.tool !== slug) throw new Error('preset bundle is for tool "' + data.tool + '", not "' + slug + '"');
    if (!Array.isArray(data.presets)) throw new Error('invalid preset bundle');
    const existing = list(slug);
    const ids = new Set(existing.map(p => p.id));
    const merged = existing.concat(data.presets.filter(p => !ids.has(p.id)));
    localStorage.setItem(key(slug), JSON.stringify(merged.slice(0, 100)));
    return data.presets.length;
  } catch (e) {
    throw e;
  }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch { return iso; }
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], {type: mime || 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function pickFile(accept) {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept || '.json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return reject(new Error('no file'));
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(f);
    };
    inp.click();
  });
}

global.DNMB_Presets = {
  list, save, remove, find, clear,
  exportAll, importAll, formatDate, downloadFile, pickFile
};

})(window);
