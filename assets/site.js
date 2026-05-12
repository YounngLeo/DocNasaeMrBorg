/* Shared site behaviors: dropdown nav */
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var dd = document.querySelector('.nav-dd');
    if (!dd) return;
    var btn = dd.querySelector('.nav-dd-btn');
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      dd.classList.toggle('open');
    });
    document.addEventListener('click', function(e){
      if (!dd.contains(e.target)) dd.classList.remove('open');
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape') dd.classList.remove('open');
    });
  });
})();
