/**
 * GitHub Pages non esegue Functions: reindirizza /tools/* al sito Cloudflare protetto.
 */
(function () {
  if (!/github\.io$/i.test(location.hostname)) return;
  var i = location.pathname.indexOf('/tools');
  if (i < 0) return;
  location.replace(
    'https://doctnasamrborg.cc' +
      location.pathname.slice(i) +
      location.search +
      location.hash
  );
})();
