/* Parola d'ordine tools — sessione browser (sessionStorage) */
(function () {
  var AUTH_KEY = 'dnmb_tools_auth';
  var PASSWORD = 'capanno';

  function normalize(s) {
    return String(s || '').trim().toLowerCase();
  }

  function unlock() {
    try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (e) {}
    document.documentElement.classList.remove('tools-locked');
    var gate = document.getElementById('tools-gate');
    if (gate) gate.remove();
  }

  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    document.documentElement.classList.remove('tools-locked');
    return;
  }

  var script = document.currentScript;
  var exitUrl = (script && script.getAttribute('data-exit')) || '../';

  function buildGate() {
    var gate = document.createElement('div');
    gate.id = 'tools-gate';
    gate.className = 'tools-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.innerHTML =
      '<div class="tg-scene" id="tg-scene">' +
        '<div class="tg-box">' +
          '<div class="tg-inner">' +
            '<p class="tg-line">Questa area è riservata.</p>' +
            '<p class="tg-line tg-prompt">Inserisci la parola d\'ordine:</p>' +
            '<div class="tg-input-row">' +
              '<span class="tg-prefix" aria-hidden="true">▶</span>' +
              '<input type="password" id="tg-input" class="tg-input" autocomplete="off" spellcheck="false" maxlength="64">' +
            '</div>' +
            '<p class="tg-error" id="tg-error" hidden>…No! Non è la parola giusta.</p>' +
          '</div>' +
        '</div>' +
        '<div class="tg-actions">' +
          '<button type="button" class="tg-btn tg-btn-ok" id="tg-ok">SÌ</button>' +
          '<button type="button" class="tg-btn tg-btn-no" id="tg-back">ESCI</button>' +
        '</div>' +
        '<p class="tg-hint">INVIO · conferma · ESC · esci</p>' +
      '</div>';

    document.body.appendChild(gate);

    var scene = document.getElementById('tg-scene');
    var input = document.getElementById('tg-input');
    var err = document.getElementById('tg-error');
    var btnOk = document.getElementById('tg-ok');
    var btnBack = document.getElementById('tg-back');

    function fail() {
      err.hidden = false;
      scene.classList.remove('shake');
      void scene.offsetWidth;
      scene.classList.add('shake');
      input.value = '';
      input.focus();
    }

    function submit() {
      if (normalize(input.value) === PASSWORD) {
        unlock();
        return;
      }
      fail();
    }

    btnOk.addEventListener('click', submit);
    btnBack.addEventListener('click', function () {
      window.location.href = exitUrl;
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        window.location.href = exitUrl;
      }
    });

    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape' && document.getElementById('tools-gate')) {
        window.location.href = exitUrl;
      }
    });

    input.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildGate);
  } else {
    buildGate();
  }
})();
