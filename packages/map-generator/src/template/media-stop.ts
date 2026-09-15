/**
 * Pauses and rewinds any audio or video that ends up hidden — a dialog
 * closing, a tab switch, an element being hidden by script.
 *
 * Embedded as a module rather than read from disk at publish time. A
 * bundled server has no `src/` directory to read from, and a path that
 * resolves in development and not in production is a deployment failure
 * that only appears once everything else already works.
 *
 * Verbatim from the page the PowerShell pipeline published. It is verified
 * byte for byte by the render golden test, so don't reformat it.
 */
export const MEDIA_STOP_SCRIPT = `<script id="control-cierre-multimedia">
(function () {
  function estaOculto(el) {
    if (!el || !el.isConnected) return true;
    for (let nodo = el; nodo && nodo.nodeType === 1; nodo = nodo.parentElement) {
      if (nodo.hidden || nodo.getAttribute('aria-hidden') === 'true') return true;
      const estilo = window.getComputedStyle(nodo);
      if (estilo.display === 'none' || estilo.visibility === 'hidden' || estilo.visibility === 'collapse') return true;
    }
    return false;
  }

  function detener(el) {
    if (!el || typeof el.pause !== 'function') return;
    try { el.pause(); } catch (_) {}
    try { el.currentTime = 0; } catch (_) {}
  }

  function detenerOcultos() {
    document.querySelectorAll('audio, video').forEach(function (el) {
      if (estaOculto(el)) detener(el);
    });
  }

  document.addEventListener('close', function (ev) {
    if (ev.target && ev.target.matches && ev.target.matches('dialog')) {
      ev.target.querySelectorAll('audio, video').forEach(detener);
    }
  }, true);

  document.addEventListener('cancel', function (ev) {
    if (ev.target && ev.target.matches && ev.target.matches('dialog')) {
      ev.target.querySelectorAll('audio, video').forEach(detener);
    }
  }, true);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) document.querySelectorAll('audio, video').forEach(detener);
  });

  const observar = function () {
    if (!document.body) return;
    const observer = new MutationObserver(function () {
      window.requestAnimationFrame(detenerOcultos);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observar, {once:true});
  else observar();
})();
</script>`;
