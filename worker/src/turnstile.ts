/**
 * Verificacion de Cloudflare Turnstile en el servidor.
 *
 * Regla de oro: siteverify se llama SIEMPRE desde el backend, nunca desde el navegador.
 * Se falla CERRADO: cualquier error de red, respuesta no-2xx o cuerpo no-JSON de siteverify
 * se traduce en un rechazo, no en un permiso.
 *
 * Documentacion: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Los tokens de Turnstile son de un solo uso y caducan a los ~300 s. */
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 10_000;

/**
 * Claves de PRUEBA documentadas por Cloudflare. Se comportan de forma distinta a las reales:
 * siteverify devuelve `success: true` para cualquier token no vacio, pero con `action` VACIO y
 * `hostname: "example.com"`. Comprobado empiricamente contra el endpoint real:
 *
 *   1x0000000000000000000000000000000AA -> success=true,  action="",  hostname="example.com"
 *   2x0000000000000000000000000000000AA -> success=false, invalid-input-response
 *   3x0000000000000000000000000000000AA -> success=false, timeout-or-duplicate
 *
 * Por eso, cuando el secreto es de prueba NO se exige `action` (seria imposible de cumplir con
 * el widget de prueba). Con un secreto real, la exigencia de accion y hostname se aplica siempre.
 */
const SECRETOS_DE_PRUEBA = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

export function esSecretoDePrueba(secret: string): boolean {
  return SECRETOS_DE_PRUEBA.has(secret);
}

export interface ResultadoTurnstile {
  ok: boolean;
  motivo?: string;
  codigos?: string[];
  hostname?: string;
  action?: string;
  clave_de_prueba?: boolean;
}

export interface OpcionesTurnstile {
  /**
   * Secreto de siteverify. Se declara `string | undefined` a proposito: en un despliegue mal
   * configurado el secreto puede faltar, y en ese caso la verificacion debe FALLAR CERRADO con
   * un mensaje claro, en vez de reventar con un TypeError o dejar pasar la peticion.
   */
  secret: string | undefined;
  token: unknown;
  remoteIp?: string | null;
  /** Acciones permitidas; vacio o `*` desactiva la comprobacion (solo demo). */
  accionesPermitidas: string[];
  /** Hostnames permitidos; vacio o `*` desactiva la comprobacion (solo demo). */
  hostnamesPermitidos: string[];
}

export async function verificarTurnstile(opciones: OpcionesTurnstile): Promise<ResultadoTurnstile> {
  const { secret, token, remoteIp, accionesPermitidas, hostnamesPermitidos } = opciones;

  if (typeof secret !== 'string' || secret.length === 0) {
    return { ok: false, motivo: 'Falta el secreto de Turnstile en el servidor.' };
  }
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, motivo: 'Falta el token de Turnstile.' };
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, motivo: 'El token de Turnstile es demasiado largo.' };
  }

  const cuerpo = new URLSearchParams({ secret, response: token });
  if (remoteIp) {
    cuerpo.set('remoteip', remoteIp);
  }

  let resultado: Record<string, unknown>;
  try {
    const respuesta = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) {
      return { ok: false, motivo: `siteverify respondio ${respuesta.status}.` };
    }
    resultado = (await respuesta.json()) as Record<string, unknown>;
  } catch (error) {
    // Red caida, timeout o cuerpo no-JSON: se rechaza (fail closed).
    return {
      ok: false,
      motivo: `No se pudo verificar Turnstile: ${error instanceof Error ? error.name : 'error desconocido'}.`,
    };
  }

  const codigos = Array.isArray(resultado['error-codes'])
    ? (resultado['error-codes'] as string[])
    : [];

  if (resultado['success'] !== true) {
    return { ok: false, motivo: 'Turnstile rechazo la verificacion.', codigos };
  }

  const hostname = typeof resultado['hostname'] === 'string' ? resultado['hostname'] : undefined;
  const action = typeof resultado['action'] === 'string' ? resultado['action'] : undefined;
  const prueba = esSecretoDePrueba(secret);

  // Con claves de prueba `action` siempre viene vacio: exigirla haria fallar la demo entera.
  // Se avisa en los logs para que nadie confunda "pasa en local" con "protegido en produccion".
  if (!prueba && accionesPermitidas.length > 0 && !accionesPermitidas.includes('*')) {
    if (!action || !accionesPermitidas.includes(action)) {
      return {
        ok: false,
        motivo: `Accion de Turnstile no permitida (${action ?? 'ausente'}).`,
        hostname,
        action,
      };
    }
  }

  if (hostnamesPermitidos.length > 0 && !hostnamesPermitidos.includes('*')) {
    if (!hostname || !hostnamesPermitidos.includes(hostname)) {
      return {
        ok: false,
        motivo: `Hostname no permitido (${hostname ?? 'ausente'}).`,
        hostname,
        action,
      };
    }
  }

  return { ok: true, hostname, action, clave_de_prueba: prueba };
}

export function listaSeparada(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean);
}
