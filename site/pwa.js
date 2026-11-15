// Instalación como app (PWA): registra el service worker y muestra
// el botón "Instalar app" en Android/PC o las instrucciones en iPhone.
(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // Aviso cuando no hay conexión.
  const off = document.getElementById('offline');
  const marcar = () => { if (off) off.hidden = navigator.onLine; };
  window.addEventListener('online', marcar);
  window.addEventListener('offline', marcar);
  marcar();

  const box = document.getElementById('install');
  const btn = document.getElementById('install-btn');
  const help = document.getElementById('install-help');
  const close = document.getElementById('install-close');
  if (!box || !btn) return;

  const instalada =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (instalada) return;

  let descartado = false;
  try { descartado = localStorage.getItem('eventual-install-cerrado') === '1'; } catch (_) {}
  if (descartado) return;

  const ua = navigator.userAgent;
  const esIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let aviso = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    aviso = e;
    help.hidden = true;
    box.hidden = false;
  });

  if (esIOS) {
    // Safari en iPhone no tiene botón de instalar: se explica cómo hacerlo.
    btn.textContent = 'Cómo instalarla';
    box.hidden = false;
  }

  btn.addEventListener('click', async () => {
    if (aviso) {
      aviso.prompt();
      const { outcome } = await aviso.userChoice;
      aviso = null;
      if (outcome === 'accepted') box.hidden = true;
    } else if (esIOS) {
      help.hidden = !help.hidden;
    }
  });

  close.addEventListener('click', () => {
    box.hidden = true;
    try { localStorage.setItem('eventual-install-cerrado', '1'); } catch (_) {}
  });

  window.addEventListener('appinstalled', () => { box.hidden = true; });

})();
