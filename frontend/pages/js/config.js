// Auto-détection : local si on est sur localhost ou IP locale, sinon prod
(function() {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');
  window.PaganiConfig = {
    API_BASE_URL: isLocal
      ? 'http://' + host + ':3001/api'
      : 'https://pagani-digital.onrender.com/api'
  };
})();
