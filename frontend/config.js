/* =============================================================================
 * Ojo Comas · config.js
 * Configuracion de tiempo de ejecucion. Se carga ANTES que app.js y este la aplica
 * con Object.assign, asi que se puede cambiar sin tocar el codigo de la aplicacion.
 *
 * Valores por defecto (desarrollo local):
 *   apiBase: ''  -> mismo origen. Funciona si el Worker se sirve bajo /api en el mismo
 *                   dominio (Pages + ruta del Worker) o mediante un proxy.
 *
 * En produccion, si el frontend vive en Cloudflare Pages y la API en un Worker aparte
 * (otro dominio), sustituye apiBase por la URL del Worker, por ejemplo:
 *   apiBase: 'https://ojo-comas-api.tu-subdominio.workers.dev'
 * y anade el dominio de Pages a la variable CORS_ORIGINS del Worker.
 * El flujo de despliegue (.github/workflows/deploy.yml) puede reescribir este archivo.
 * ============================================================================= */
window.OJO_COMAS_CONFIG = {
  /* URL base de la API. Cadena vacia = mismo origen. */
  apiBase: '',

  /* sitekey publica de Turnstile. La de abajo es la clave de PRUEBA oficial de Cloudflare
   * ("siempre pasa") y NO protege nada: sirve para que el prototipo funcione sin cuenta.
   * En produccion, sustituirla por la sitekey real del widget y registrar el dominio. */
  turnstileSitekey: '1x00000000000000000000AA',

  /* Aviso explicito del caracter ficticio del prototipo (no tocar). */
  prototipo: true,
};
