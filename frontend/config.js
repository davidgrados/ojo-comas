/* =============================================================================
 * Ojo Comas · config.js
 * Configuracion de tiempo de ejecucion. Se carga ANTES que app.js y este la aplica
 * con Object.assign, asi que se puede cambiar sin tocar el codigo de la aplicacion.
 *
 * Se puede sobrescribir puntualmente con un parametro en la URL:
 *   https://ojo-comas.pages.dev/?api=https://mi-worker.workers.dev
 * ============================================================================= */
(function () {
  /* URL del Worker desplegado. El frontend vive en Cloudflare Pages y la API en un Worker
   * aparte, asi que son origenes distintos y hace falta la URL absoluta. Ese origen esta
   * autorizado en la variable CORS_ORIGINS del Worker. */
  var WORKER_PRODUCCION = 'https://ojo-comas-api.dunkeljhonz.workers.dev';

  /* En local el frontend se sirve con `wrangler pages dev frontend --port 8788` y la API con
   * `wrangler dev --port 8787` (mismo origen a traves del proxy local). Se detecta por el
   * nombre de host para no apuntar nunca a produccion desde el entorno de desarrollo: seria
   * escribir datos reales sin querer. */
  var ES_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var API_POR_DEFECTO = ES_LOCAL ? '' : WORKER_PRODUCCION;

  var apiForzada = new URLSearchParams(location.search).get('api');

  window.OJO_COMAS_CONFIG = {
    /* URL base de la API. Cadena vacia = mismo origen. */
    apiBase: apiForzada !== null ? apiForzada : API_POR_DEFECTO,

    /* sitekey publica de Turnstile. La de abajo es la clave de PRUEBA oficial de Cloudflare
     * ("siempre pasa") y NO protege nada: sirve para que el prototipo funcione sin cuenta.
     * En produccion hay que sustituirla por la sitekey real del widget y registrar el dominio
     * en el panel de Cloudflare. Ver README, seccion Despliegue. */
    turnstileSitekey: '1x00000000000000000000AA',

    /* Aviso explicito del caracter ficticio del prototipo (no tocar). */
    prototipo: true,
  };
})();
