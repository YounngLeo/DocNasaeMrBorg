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
    var imgs = Array.from(document.querySelectorAll('.inv-img img[data-lb]'));
    if (!imgs.length) return;

    var overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.innerHTML =
      '<button class="lb-nav lb-prev">&#8592;</button>' +
      '<div class="lb-img-wrap"><img src="" alt=""></div>' +
      '<button class="lb-nav lb-next">&#8594;</button>' +
      '<button class="lb-close">[ ESC / CHIUDI ]</button>' +
      '<div class="lb-badge"></div>';
    document.body.appendChild(overlay);

    var lbImg   = overlay.querySelector('.lb-img-wrap img');
    var lbBadge = overlay.querySelector('.lb-badge');
    var current = 0;

    function open(idx) {
      current = idx;
      var el = imgs[idx];
      lbImg.src = el.src;
      lbImg.alt = el.alt;
      lbBadge.textContent = el.dataset.lb;
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
      if (e.target === overlay || e.target === overlay.querySelector('.lb-img-wrap')) close();
    });
    overlay.querySelector('.lb-img-wrap').addEventListener('click', function(e){ e.stopPropagation(); });

    document.addEventListener('keydown', function(e){
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape')      close();
      if (e.key === 'ArrowLeft')   prev();
      if (e.key === 'ArrowRight')  next();
    });

  });
})();
