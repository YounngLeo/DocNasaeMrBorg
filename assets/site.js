/* Shared site behaviors: dropdown nav + lightbox */
(function(){
  document.addEventListener('DOMContentLoaded', function(){

    /* — NAV DROPDOWN — */
    var dd = document.querySelector('.nav-dd');
    if (dd) {
      var btn = dd.querySelector('.nav-dd-btn');
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        dd.classList.toggle('open');
      });
      document.addEventListener('click', function(e){
        if (!dd.contains(e.target)) dd.classList.remove('open');
      });
    }

    /* — LIGHTBOX — */
    var imgs = Array.from(document.querySelectorAll('img[data-lb]'));
    if (imgs.length) {
    var overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.innerHTML =
      '<button class="lb-nav lb-prev">&#8592;</button>' +
      '<div class="lb-stage">' +
        '<div class="lb-img-wrap"><img src="" alt=""></div>' +
        '<aside class="lb-plate" aria-hidden="true"></aside>' +
      '</div>' +
      '<button class="lb-nav lb-next">&#8594;</button>' +
      '<button class="lb-close">[ ESC / CHIUDI ]</button>' +
      '<div class="lb-badge"></div>';
    document.body.appendChild(overlay);

    var lbImg   = overlay.querySelector('.lb-img-wrap img');
    var lbBadge = overlay.querySelector('.lb-badge');
    var lbPlate = overlay.querySelector('.lb-plate');
    var current = 0;

    function open(idx) {
      current = idx;
      var el = imgs[idx];
      lbImg.src = el.src;
      lbImg.alt = el.alt;
      lbBadge.textContent = el.dataset.lb;

      /* Tavola botanica laterale (se presente nella card erbario) */
      var card = el.closest ? el.closest('.herb-card') : null;
      var plateSrc = card ? card.querySelector('.herb-plate') : null;
      if (plateSrc) {
        lbPlate.innerHTML = plateSrc.innerHTML;
        overlay.classList.add('has-plate');
      } else {
        lbPlate.innerHTML = '';
        overlay.classList.remove('has-plate');
      }

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
    function prev() { open((current - 1 + imgs.length) % imgs.length); }
    function next() { open((current + 1) % imgs.length); }

    imgs.forEach(function(img, i){
      img.parentElement.addEventListener('click', function(){ open(i); });
    });

    overlay.querySelector('.lb-close').addEventListener('click', close);
    overlay.querySelector('.lb-prev').addEventListener('click', function(e){ e.stopPropagation(); prev(); });
    overlay.querySelector('.lb-next').addEventListener('click', function(e){ e.stopPropagation(); next(); });
    overlay.addEventListener('click', function(e){
      if (e.target === overlay || e.target === overlay.querySelector('.lb-stage')) close();
    });
    overlay.querySelector('.lb-img-wrap').addEventListener('click', function(e){ e.stopPropagation(); });
    overlay.querySelector('.lb-plate').addEventListener('click', function(e){ e.stopPropagation(); });

    document.addEventListener('keydown', function(e){
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape')      close();
      if (e.key === 'ArrowLeft')   prev();
      if (e.key === 'ArrowRight')  next();
    });

    }

    /* — HOME: servizi stampa 3D / stoccaggio (modali + mailto) — */
    var modalRoot = document.getElementById('home-service-modals');
    var panelPrint = document.getElementById('modal-print3d');
    var panelStor  = document.getElementById('modal-storage');
    var btnPrint = document.getElementById('open-modal-print3d');
    var btnStor  = document.getElementById('open-modal-storage');
    var mailTo = 'fornasaleonardo@gmail.com';

    function closeHomeModals() {
      if (!modalRoot) return;
      modalRoot.classList.remove('open');
      modalRoot.setAttribute('aria-hidden', 'true');
      if (panelPrint) panelPrint.hidden = true;
      if (panelStor)  panelStor.hidden = true;
      document.body.style.overflow = '';
    }

    function openHomeModal(panel) {
      if (!modalRoot || !panel) return;
      if (panelPrint) panelPrint.hidden = panel !== panelPrint;
      if (panelStor)  panelStor.hidden = panel !== panelStor;
      modalRoot.classList.add('open');
      modalRoot.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    if (modalRoot && panelPrint && panelStor) {
      if (btnPrint) btnPrint.addEventListener('click', function(){ openHomeModal(panelPrint); });
      if (btnStor)  btnStor.addEventListener('click', function(){ openHomeModal(panelStor); });

      modalRoot.querySelectorAll('[data-home-modal-close]').forEach(function(el){
        el.addEventListener('click', function(e){
          if (e.target === el) closeHomeModals();
        });
      });

      document.addEventListener('keydown', function(e){
        if (e.key === 'Escape' && modalRoot.classList.contains('open')) closeHomeModals();
      });
    }

    var formPrint = document.getElementById('form-print3d');
    if (formPrint) {
      formPrint.addEventListener('submit', function(ev){
        ev.preventDefault();
        var mat = document.getElementById('print3d-material');
        var notes = document.getElementById('print3d-notes');
        var filesIn = document.getElementById('print3d-files');
        if (!mat || !mat.value) {
          mat && mat.focus();
          return;
        }

        var names = [];
        if (filesIn && filesIn.files && filesIn.files.length) {
          for (var i = 0; i < filesIn.files.length; i++) names.push(filesIn.files[i].name);
        } else {
          names.push('(nessun file selezionato — conferma in mail e allega gli STL)');
        }

        var body =
          'Richiesta preventivo stampa 3D\r\n\r\n' +
          'MATERIALE: ' + mat.value + '\r\n\r\n' +
          'FILE (nomi): ' + names.join(', ') + '\r\n\r\n' +
          'NOTE:\r\n' + (notes && notes.value ? notes.value : '—') + '\r\n\r\n' +
          '— Allegare gli STL (o altri file) rispondendo a questa mail.';

        var href = 'mailto:' + mailTo +
          '?subject=' + encodeURIComponent('Richiesta preventivo stampa 3D — DoctNasa&MrBorg') +
          '&body=' + encodeURIComponent(body);
        window.location.href = href;
        closeHomeModals();
      });
    }

    var formStor = document.getElementById('form-storage');
    if (formStor) {
      formStor.addEventListener('submit', function(ev){
        ev.preventDefault();
        var d = document.getElementById('storage-dims');
        var du = document.getElementById('storage-duration');
        var p = document.getElementById('storage-check');
        var n = document.getElementById('storage-notes');
        if (!d || !d.value.trim()) { d && d.focus(); return; }
        if (!du || !du.value.trim()) { du && du.focus(); return; }
        if (!p || !p.value) { p && p.focus(); return; }

        var body =
          'Richiesta servizio stoccaggio\r\n\r\n' +
          'INGOMBRO: ' + d.value.trim() + '\r\n' +
          'DURATA: ' + du.value.trim() + '\r\n' +
          'CONTROLLO / PRESENZA: ' + p.value + '\r\n\r\n' +
          'NOTE:\r\n' + (n && n.value ? n.value : '—');

        var href = 'mailto:' + mailTo +
          '?subject=' + encodeURIComponent('Richiesta stoccaggio — DoctNasa&MrBorg') +
          '&body=' + encodeURIComponent(body);
        window.location.href = href;
        closeHomeModals();
      });
    }

    /* — DISEGNI: GET A TATTOO / DRAWING (modale + mailto autore) — */
    var dcOverlay = document.getElementById('disegni-commission-overlay');
    var dcPanel = document.getElementById('disegni-commission-panel');
    var dcOpenBtn = document.getElementById('open-disegni-commission');
    var studioMail = 'fornasaleonardo@gmail.com';

    function closeDisegniCommission() {
      if (!dcOverlay) return;
      dcOverlay.classList.remove('open');
      dcOverlay.setAttribute('aria-hidden', 'true');
      if (dcPanel) dcPanel.hidden = true;
      document.body.style.overflow = '';
    }

    function openDisegniCommission() {
      if (!dcOverlay || !dcPanel) return;
      dcPanel.hidden = false;
      dcOverlay.classList.add('open');
      dcOverlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    if (dcOverlay && dcPanel) {
      if (dcOpenBtn) dcOpenBtn.addEventListener('click', openDisegniCommission);
      dcOverlay.querySelectorAll('[data-disegni-commission-close]').forEach(function(el){
        el.addEventListener('click', function(e){
          if (e.target === el) closeDisegniCommission();
        });
      });
      document.addEventListener('keydown', function(e){
        if (e.key === 'Escape' && dcOverlay.classList.contains('open')) closeDisegniCommission();
      });
    }

    var formDc = document.getElementById('form-disegni-commission');
    if (formDc) {
      formDc.addEventListener('submit', function(ev){
        ev.preventDefault();
        var kind = document.getElementById('dc-kind');
        var artistSel = document.getElementById('dc-artist');
        var budget = document.getElementById('dc-budget');
        var notes = document.getElementById('dc-notes');
        if (!kind || !kind.value) { kind && kind.focus(); return; }
        if (!artistSel || artistSel.selectedIndex < 1) { artistSel && artistSel.focus(); return; }
        if (!budget || !budget.value) { budget && budget.focus(); return; }

        var opt = artistSel.options[artistSel.selectedIndex];
        var artistLabel = opt.textContent.replace(/\s+/g, ' ').trim();
        var email = (opt.getAttribute('data-email') || '').trim();
        var extra = (opt.getAttribute('data-note') || '').trim();
        var bridge = '';
        if (!email) {
          email = studioMail;
          bridge =
            '\r\n[INVIO A STUDIO] L\'opzione artista non ha ancora data-email: inoltra al destinatario reale quando configurato su disegni/index.html.\r\n';
        }

        var body =
          'Richiesta da sito DoctNasa&MrBorg — GET A TATTOO / DRAWING\r\n\r\n' +
          'TIPO: ' + kind.value + '\r\n' +
          'ARTISTA SCELTO: ' + artistLabel + '\r\n' +
          'BUDGET: ' + budget.value + '\r\n' +
          (extra ? 'NOTA: ' + extra + '\r\n' : '') +
          bridge + '\r\n' +
          'NOTE:\r\n' + (notes && notes.value ? notes.value : '—') + '\r\n';

        var subj = 'Richiesta ' + kind.value + ' — contatto per ' + artistLabel;
        window.location.href = 'mailto:' + email +
          '?subject=' + encodeURIComponent(subj) +
          '&body=' + encodeURIComponent(body);
        closeDisegniCommission();
      });
    }

  });
})();
