// ============================================================
//  config.js — Détection automatique local / production
//  Local  : localhost, 127.0.0.1, 192.168.x.x → serveur Node local
//  Prod   : tout autre domaine (Netlify) → Render
// ============================================================

(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host);

  window.PaganiConfig = {
    API_BASE_URL: isLocal
      ? 'http://' + host + ':3001/api'
      : 'https://pagani-digital.onrender.com/api',
  };
})();
