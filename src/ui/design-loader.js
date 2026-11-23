(() => {
  const connection = navigator.connection;
  if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType)
    || (navigator.deviceMemory && navigator.deviceMemory <= 2)) return;

  // Keep the base page usable if the optional stylesheet arrives late.
  const navigation = performance.getEntriesByType('navigation')[0];
  const deadline = (navigation?.responseStart || 0) + 1200;
  const url = document.currentScript?.dataset.stylesheet;
  if (!url || performance.now() >= deadline) return;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.media = 'not all';
  stylesheet.href = url;
  const cancel = () => finish(false);
  const timer = setTimeout(cancel, deadline - performance.now());

  function finish(ready) {
    clearTimeout(timer);
    document.removeEventListener('pointerdown', cancel, true);
    document.removeEventListener('keydown', cancel, true);
    stylesheet.onload = null;
    stylesheet.onerror = null;
    if (ready && performance.now() < deadline) stylesheet.media = 'screen';
    else stylesheet.remove();
  }

  stylesheet.onload = () => finish(true);
  stylesheet.onerror = cancel;
  document.addEventListener('pointerdown', cancel, true);
  document.addEventListener('keydown', cancel, true);
  document.head.append(stylesheet);
})();
