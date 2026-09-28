/* =============================================================================
 * Ojo Comas · config.js
 * Configuracion de tiempo de ejecucion. Se carga ANTES que app.js y este la aplica
 * con Object.assign, asi que se puede cambiar sin tocar el codigo de la aplicacion.
 * ============================================================================= */
(function () {
  /* URL del Worker desplegado. El frontend vive en Cloudflare Pages y la API en un Worker
   * aparte, asi que son origenes distintos y hace falta la URL absoluta. Ese origen esta
   * autorizado en la variable CORS_ORIGINS del Worker. */
  var WORKER_PRODUCCION = 'https://ojo-comas-api.dunkeljhonz.workers.dev';

  /* En local el frontend se sirve con `wrangler pages dev frontend --port 8788` y la API con
   * `wrangler dev --port 8787`. Se detecta por el nombre de host para no apuntar nunca a
   * produccion desde el entorno de desarrollo: seria escribir datos reales sin querer. */
  var ES_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var API_POR_DEFECTO = ES_LOCAL ? '' : WORKER_PRODUCCION;

  /* ---------------------------------------------------------------------------------------
   * El parametro ?api= SOLO puede apuntar a origenes de esta lista.
   *
   * POR QUE: antes bastaba con abrir
   *     https://ojo-comas.pages.dev/?api=https://sitio-malicioso.example
   * para que TODA la aplicacion apuntara al servidor del atacante. Un vecino que abriera ese
   * enlace enviaria su fotografia, sus coordenadas y, si marcaba el consentimiento, su dato de
   * contacto DIRECTAMENTE al atacante. Ademas el atacante controlaria los reportes que se
   * pintan en el mapa, pudiendo mostrar contenido falso bajo el dominio real del proyecto.
   *
   * Se comprobo con una prueba de concepto antes de corregirlo (ver el historial del repositorio).
   * Ahora la sobrescritura se valida contra una lista blanca y, si no esta permitida, se IGNORA
   * y se usa el origen por defecto.
   * ------------------------------------------------------------------------------------- */
  var ORIGENES_PERMITIDOS = [WORKER_PRODUCCION];
  if (ES_LOCAL) {
    /* Los origenes locales solo se aceptan cuando la propia pagina se sirve en local: asi no
     * sirven para redirigir nada desde el sitio publicado. */
    ORIGENES_PERMITIDOS.push('http://127.0.0.1:8787', 'http://localhost:8787');
  }

  function origenPermitido(valor) {
    if (valor === null || valor === undefined) { return null; }
    var limpio = String(valor).trim().replace(/\/+$/, '');
    /* Cadena vacia = mismo origen. Solo tiene sentido en local, donde la pagina y la API se
     * sirven en el mismo host. En produccion se ignora: Pages no sirve /api, asi que un
     * ?api= vacio degradaria la aplicacion al respaldo de demostracion sin motivo. */
    if (limpio === '') { return ES_LOCAL ? '' : null; }
    try {
      var u = new URL(limpio, location.href);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') { return null; }
      if (u.origin === location.origin) { return u.origin; }
      if (ORIGENES_PERMITIDOS.indexOf(u.origin) !== -1) { return u.origin; }
      return null;
    } catch (e) {
      return null;
    }
  }

  var apiForzada = origenPermitido(new URLSearchParams(location.search).get('api'));
  if (apiForzada === null && new URLSearchParams(location.search).get('api') !== null) {
    if (window.console) {
      console.warn('[Ojo Comas] El parametro ?api= apunta a un origen no permitido. Se ignora.');
    }
  }

  window.OJO_COMAS_CONFIG = {
    /* URL base de la API. Cadena vacia = mismo origen. */
    apiBase: apiForzada === null ? API_POR_DEFECTO : apiForzada,

    /* sitekey publica de Turnstile. La de abajo es la clave de PRUEBA oficial de Cloudflare
     * ("siempre pasa") y NO protege nada: sirve para que el prototipo funcione sin cuenta.
     * En produccion hay que sustituirla por la sitekey real del widget y registrar el dominio
     * en el panel de Cloudflare. Ver README, seccion Despliegue. */
    turnstileSitekey: '1x00000000000000000000AA',

    /* Aviso explicito del caracter ficticio del prototipo (no tocar). */
    prototipo: true,
  };
})();
