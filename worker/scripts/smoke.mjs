#!/usr/bin/env node
/**
 * Prueba de humo end-to-end de la API de Ojo Comas.
 *
 * Ejercita el Worker REAL por HTTP contra `wrangler dev`, incluyendo D1, R2 y el siteverify
 * REAL de Cloudflare Turnstile. No simula nada: cada comprobacion hace una peticion de verdad
 * y verifica el codigo de estado y el cuerpo.
 *
 * Uso:
 *   node scripts/smoke.mjs --base http://127.0.0.1:8787 --admin-token <token>
 *   node scripts/smoke.mjs --base http://127.0.0.1:8790 --modo bloqueo
 *   node scripts/smoke.mjs --base http://127.0.0.1:8791 --modo limite
 *
 * Modos:
 *   completo (por defecto)  suite positiva y negativa
 *   bloqueo                 solo comprueba que Turnstile rechaza (secreto "siempre bloquea")
 *   limite                  solo comprueba el limitador de abuso
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');

// PNG 1x1 valido (bytes magicos 89 50 4E 47). Sirve para probar la subida a R2 de verdad.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

// Token de prueba de Turnstile: con el secreto de prueba "siempre pasa", siteverify lo acepta.
const TOKEN_TURNSTILE = 'XXXX.DUMMY.TOKEN.XXXX';

function arg(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}
const tieneFlag = (nombre) => process.argv.includes(`--${nombre}`);

const BASE = (arg('base', 'http://127.0.0.1:8787') || '').replace(/\/$/, '');
const ADMIN_TOKEN = arg('admin-token', '');
const MODO = arg('modo', 'completo');

/**
 * Contra produccion no se pueden simular IPs: Cloudflare bloquea en el borde la cabecera
 * CF-Connecting-IP enviada por el cliente. Varias comprobaciones cambian de forma segun el caso.
 */
const ES_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE);

let pasadas = 0;
let falladas = 0;
const fallos = [];

function ok(nombre, detalle = '') {
  pasadas += 1;
  console.log(`  \u2713 ${nombre}${detalle ? `  ${detalle}` : ''}`);
}
function mal(nombre, detalle = '') {
  falladas += 1;
  fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(`  \u2717 ${nombre}${detalle ? `  ${detalle}` : ''}`);
}
function comprobar(condicion, nombre, detalle = '') {
  if (condicion) ok(nombre, detalle);
  else mal(nombre, detalle);
}
function seccion(titulo) {
  console.log(`\n${titulo}`);
}

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${BASE}${ruta}`, opciones);
  const tipo = respuesta.headers.get('content-type') ?? '';
  let cuerpo = null;
  if (tipo.includes('json')) {
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
  } else {
    cuerpo = await respuesta.arrayBuffer();
  }
  return { status: respuesta.status, tipo, cuerpo, cabeceras: respuesta.headers };
}

const json = (metodo, datos, cabeceras = {}) => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json', ...cabeceras },
  body: JSON.stringify(datos),
});

/** Punto real dentro de una zona, tomado de los datos de demostracion. */
function puntoDeDemostracion() {
  const ruta = join(RAIZ, 'frontend', 'data', 'reportes_demo.geojson');
  const fc = JSON.parse(readFileSync(ruta, 'utf8'));
  const conZona01 = fc.features.find((f) => f.properties.zona === '01') ?? fc.features[0];
  const [lng, lat] = conZona01.geometry.coordinates;
  return { lat, lng, zona: conZona01.properties.zona };
}

// ---------------------------------------------------------------------------
async function modoCompleto() {
  const punto = puntoDeDemostracion();

  seccion('1. Salud y disponibilidad');
  {
    const r = await pedir('/api/health');
    comprobar(r.status === 200 && r.cuerpo?.ok === true, 'GET /api/health responde 200 y ok:true',
      `status=${r.status}`);
    comprobar(r.cuerpo?.base_de_datos === 'ok', 'D1 responde', `base_de_datos=${r.cuerpo?.base_de_datos}`);
    comprobar(r.cuerpo?.almacenamiento_fotos === 'ok', 'R2 enlazado',
      `almacenamiento_fotos=${r.cuerpo?.almacenamiento_fotos}`);
    comprobar(r.cuerpo?.zonas === 14, 'la API conoce las 14 zonas', `zonas=${r.cuerpo?.zonas}`);
  }

  seccion('2. Zonas');
  {
    const r = await pedir('/api/zonas');
    comprobar(r.status === 200 && r.cuerpo?.zonas?.length === 14, 'GET /api/zonas devuelve 14 zonas',
      `status=${r.status} n=${r.cuerpo?.zonas?.length}`);
    const z1 = r.cuerpo?.zonas?.find((z) => z.zona === '01');
    comprobar(Boolean(z1?.geometry?.coordinates?.length), 'cada zona trae su poligono');
    comprobar(typeof z1?.area_ha_oficial === 'number', 'cada zona trae sus hectareas oficiales',
      `Z01=${z1?.area_ha_oficial} ha`);
    comprobar(Array.isArray(z1?.barrios_reales) && z1.barrios_reales.length > 0,
      'cada zona trae barrios reales de OSM', `Z01: ${z1?.barrios_reales?.slice(0, 3).join(', ')}`);
  }

  seccion('3. Listado de reportes (GeoJSON)');
  let totalInicial = 0;
  {
    const r = await pedir('/api/reports');
    comprobar(r.status === 200 && r.cuerpo?.type === 'FeatureCollection',
      'GET /api/reports devuelve un FeatureCollection', `status=${r.status}`);
    totalInicial = r.cuerpo?.features?.length ?? 0;
    comprobar(totalInicial >= 14, 'hay al menos un reporte por zona sembrado', `total=${totalInicial}`);
    const props = r.cuerpo?.features?.[0]?.properties ?? {};
    comprobar('contacto' in props === false && 'ip_hash' in props === false,
      'la API NO expone contacto ni ip_hash (Ley N° 29733)',
      `claves=${Object.keys(props).join(',')}`);
    comprobar('telefono' in props === false && 'dni' in props === false, 'la API NO expone DNI ni telefono');

    const zonas = new Set(r.cuerpo?.features?.map((f) => f.properties.zona));
    comprobar(zonas.size === 14, 'los reportes cubren las 14 zonas', `zonas distintas=${zonas.size}`);
  }

  seccion('4. Filtros');
  {
    const r = await pedir('/api/reports?zona=01');
    const solo01 = r.cuerpo?.features?.every((f) => f.properties.zona === '01');
    comprobar(r.status === 200 && r.cuerpo.features.length > 0 && solo01,
      'GET /api/reports?zona=01 filtra por zona', `n=${r.cuerpo?.features?.length}`);

    const r2 = await pedir('/api/reports?zona=99');
    comprobar(r2.status === 400, 'zona fuera de rango devuelve 400', `status=${r2.status}`);

    const r3 = await pedir('/api/reports?estado=resuelto');
    const soloResueltos = r3.cuerpo?.features?.every((f) => f.properties.estado === 'resuelto');
    comprobar(r3.status === 200 && soloResueltos, 'filtra por estado',
      `n=${r3.cuerpo?.features?.length}`);

    const r4 = await pedir('/api/reports?categoria=bache');
    const soloBaches = r4.cuerpo?.features?.every((f) => f.properties.categoria === 'bache');
    comprobar(r4.status === 200 && soloBaches, 'filtra por categoria',
      `n=${r4.cuerpo?.features?.length}`);

    const r5 = await pedir('/api/reports?estado=inventado');
    comprobar(r5.status === 400, 'estado invalido devuelve 400', `status=${r5.status}`);
  }

  seccion('5. Un reporte concreto y su historial');
  {
    const r = await pedir('/api/reports/1');
    comprobar(r.status === 200 && r.cuerpo?.reporte?.properties?.id === 1,
      'GET /api/reports/1 devuelve el reporte', `status=${r.status}`);
    comprobar(Array.isArray(r.cuerpo?.historial) && r.cuerpo.historial.length >= 1,
      'trae el historial de estados', `entradas=${r.cuerpo?.historial?.length}`);

    const r2 = await pedir('/api/reports/999999');
    comprobar(r2.status === 404, 'reporte inexistente devuelve 404', `status=${r2.status}`);
  }

  seccion('6. Estadisticas');
  {
    const r = await pedir('/api/stats');
    comprobar(r.status === 200 && r.cuerpo?.ok === true, 'GET /api/stats responde 200',
      `status=${r.status}`);
    comprobar(r.cuerpo?.total === totalInicial, 'el total de stats coincide con el listado',
      `stats=${r.cuerpo?.total} listado=${totalInicial}`);
    comprobar(r.cuerpo?.por_zona?.length === 14, 'las stats cubren las 14 zonas',
      `n=${r.cuerpo?.por_zona?.length}`);
    const sumaEstados =
      (r.cuerpo?.por_estado?.pendiente ?? 0) +
      (r.cuerpo?.por_estado?.en_proceso ?? 0) +
      (r.cuerpo?.por_estado?.resuelto ?? 0);
    comprobar(sumaEstados === r.cuerpo?.total, 'los estados suman el total', `${sumaEstados}/${r.cuerpo?.total}`);
    const sumaZonas = (r.cuerpo?.por_zona ?? []).reduce((a, z) => a + z.total, 0);
    comprobar(sumaZonas === r.cuerpo?.total, 'las zonas suman el total', `${sumaZonas}/${r.cuerpo?.total}`);
  }

  seccion('7. Fotos servidas desde R2');
  let claveFotoSembrada = null;
  {
    const listado = await pedir('/api/reports');
    claveFotoSembrada = listado.cuerpo?.features?.find((f) => f.properties.foto_url)?.properties?.foto_url ?? null;
    comprobar(Boolean(claveFotoSembrada), 'hay reportes sembrados con foto en R2',
      `foto_url=${claveFotoSembrada}`);
    if (claveFotoSembrada) {
      const r = await pedir(claveFotoSembrada);
      comprobar(r.status === 200, 'la foto se sirve desde R2', `status=${r.status}`);
      comprobar(r.tipo.includes('image/'), 'la foto llega con content-type de imagen', r.tipo);
      comprobar(r.cuerpo?.byteLength > 0, 'la foto tiene contenido', `${r.cuerpo?.byteLength} bytes`);
      comprobar(r.cabeceras.get('cache-control')?.includes('max-age'), 'la foto se cachea',
        r.cabeceras.get('cache-control'));
    }
    const r404 = await pedir('/api/photos/reportes/2026/01/noexiste.png');
    comprobar(r404.status === 404, 'foto inexistente devuelve 404', `status=${r404.status}`);
  }

  seccion('8. Crear reporte (camino feliz) — Turnstile REAL + R2 REAL');
  let idCreado = null;
  {
    const r = await pedir('/api/report', json('POST', {
      categoria: 'bache',
      descripcion: 'Prueba automatica de humo: hueco en la pista junto al mercado.',
      lat: punto.lat,
      lng: punto.lng,
      zona: punto.zona,
      direccion: 'Punto de prueba del script de humo',
      fotoBase64: `data:image/png;base64,${PNG_1X1}`,
      turnstileToken: TOKEN_TURNSTILE,
      consentimiento: false,
    }));
    idCreado = r.cuerpo?.id ?? null;
    comprobar(r.status === 201 && r.cuerpo?.ok === true, 'POST /api/report crea el reporte',
      `status=${r.status} id=${idCreado}`);
    comprobar(r.cuerpo?.zona === punto.zona, 'la zona asignada coincide con la del punto',
      `zona=${r.cuerpo?.zona} esperada=${punto.zona}`);
    comprobar(r.cuerpo?.estado === 'pendiente', 'el reporte nace en estado pendiente');
    comprobar(Boolean(r.cuerpo?.foto_url), 'la foto se subio a R2', `foto_url=${r.cuerpo?.foto_url}`);

    if (r.cuerpo?.foto_url) {
      const foto = await pedir(r.cuerpo.foto_url);
      comprobar(foto.status === 200 && foto.cuerpo?.byteLength > 0,
        'la foto recien subida se puede leer desde R2', `${foto.cuerpo?.byteLength} bytes`);
    }

    const listado = await pedir('/api/reports');
    comprobar(listado.cuerpo?.features?.length === totalInicial + 1,
      'el reporte nuevo aparece en el listado', `${totalInicial} -> ${listado.cuerpo?.features?.length}`);

    const detalle = await pedir(`/api/reports/${idCreado}`);
    comprobar(detalle.cuerpo?.historial?.length >= 1, 'el reporte nuevo tiene historial inicial',
      `entradas=${detalle.cuerpo?.historial?.length}`);
  }

  seccion('9. La zona la decide el SERVIDOR, no el navegador');
  {
    const zonaFalsa = punto.zona === '14' ? '13' : '14';
    const r = await pedir('/api/report', json('POST', {
      categoria: 'basura',
      descripcion: 'Prueba: el navegador miente sobre la zona.',
      lat: punto.lat,
      lng: punto.lng,
      zona: zonaFalsa,
      turnstileToken: TOKEN_TURNSTILE,
      consentimiento: false,
    }));
    comprobar(r.status === 201, 'el reporte se acepta igualmente', `status=${r.status}`);
    comprobar(r.cuerpo?.zona === punto.zona,
      'el servidor IGNORA la zona declarada y calcula la correcta',
      `enviada=${zonaFalsa} asignada=${r.cuerpo?.zona} real=${punto.zona}`);
  }

  seccion('10. Seguridad: Turnstile y validacion');
  {
    const sinToken = await pedir('/api/report', json('POST', {
      categoria: 'bache', lat: punto.lat, lng: punto.lng, zona: punto.zona,
    }));
    comprobar(sinToken.status === 403, 'sin token de Turnstile devuelve 403', `status=${sinToken.status}`);

    const tokenVacio = await pedir('/api/report', json('POST', {
      categoria: 'bache', lat: punto.lat, lng: punto.lng, zona: punto.zona, turnstileToken: '',
    }));
    comprobar(tokenVacio.status === 403, 'token vacio devuelve 403', `status=${tokenVacio.status}`);

    const malaCat = await pedir('/api/report', json('POST', {
      categoria: 'hackeo', lat: punto.lat, lng: punto.lng, zona: punto.zona,
      turnstileToken: TOKEN_TURNSTILE,
    }));
    comprobar(malaCat.status === 400, 'categoria invalida devuelve 400', `status=${malaCat.status}`);

    const fuera = await pedir('/api/report', json('POST', {
      categoria: 'bache', lat: -12.5, lng: -77.05, zona: '01', turnstileToken: TOKEN_TURNSTILE,
    }));
    comprobar(fuera.status === 400, 'coordenadas fuera del distrito devuelven 400', `status=${fuera.status}`);

    const descripcionLarga = await pedir('/api/report', json('POST', {
      categoria: 'bache', lat: punto.lat, lng: punto.lng, zona: punto.zona,
      descripcion: 'x'.repeat(200), turnstileToken: TOKEN_TURNSTILE,
    }));
    comprobar(descripcionLarga.status === 400, 'descripcion de mas de 140 caracteres devuelve 400',
      `status=${descripcionLarga.status}`);

    const fotoGigante = await pedir('/api/report', json('POST', {
      categoria: 'bache', lat: punto.lat, lng: punto.lng, zona: punto.zona,
      fotoBase64: `data:image/png;base64,${PNG_1X1}${'A'.repeat(4_000_000)}`,
      turnstileToken: TOKEN_TURNSTILE,
    }));
    comprobar(fotoGigante.status === 413, 'foto demasiado grande devuelve 413', `status=${fotoGigante.status}`);

    const mimeMentiroso = await pedir('/api/report', json('POST', {
      categoria: 'bache', lat: punto.lat, lng: punto.lng, zona: punto.zona,
      fotoBase64: `data:image/png;base64,${Buffer.from('esto no es una imagen').toString('base64')}`,
      turnstileToken: TOKEN_TURNSTILE,
    }));
    comprobar(mimeMentiroso.status === 400, 'archivo que no es imagen real devuelve 400',
      `status=${mimeMentiroso.status}`);

    const rutaMala = await pedir('/api/no-existe');
    comprobar(rutaMala.status === 404, 'ruta desconocida devuelve 404', `status=${rutaMala.status}`);
  }

  seccion('11. Privacidad (Ley N° 29733)');
  {
    const sinConsentimiento = await pedir('/api/report', json('POST', {
      categoria: 'alumbrado',
      descripcion: 'Prueba: contacto enviado SIN marcar el consentimiento.',
      lat: punto.lat,
      lng: punto.lng,
      zona: punto.zona,
      contacto: 'vecino@example.com',
      consentimiento: false,
      turnstileToken: TOKEN_TURNSTILE,
    }));
    comprobar(sinConsentimiento.status === 201, 'el reporte se guarda igualmente',
      `status=${sinConsentimiento.status} id=${sinConsentimiento.cuerpo?.id}`);
    const detalle = await pedir(`/api/reports/${sinConsentimiento.cuerpo?.id}`);
    const props = detalle.cuerpo?.reporte?.properties ?? {};
    comprobar(!('contacto' in props) && !('contact' in props),
      'el contacto NO se devuelve nunca por la API', `claves=${Object.keys(props).join(',')}`);
    comprobar(JSON.stringify(detalle.cuerpo).includes('vecino@example.com') === false,
      'el correo enviado sin consentimiento NO aparece en la respuesta');
  }

  seccion('12. Apoyo vecinal (Ley N° 27972, Art. 53)');
  {
    // En local se usa una IP sintetica propia de cada ejecucion para que el primer apoyo sea
    // siempre nuevo y la prueba sea repetible.
    //
    // CONTRA PRODUCCION NO SE PUEDE: Cloudflare bloquea en el borde cualquier cabecera
    // CF-Connecting-IP enviada por el cliente (devuelve un 403 vacio con `server: cloudflare`
    // antes de que la peticion llegue al Worker). Es precisamente la garantia en la que se apoya
    // el limitador de abuso, asi que se acepta que la primera confirmacion pueda responder 409
    // si esa IP real ya habia apoyado el reporte en una ejecucion anterior.
    const ipApoyo = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const cab = ES_LOCAL ? { 'CF-Connecting-IP': ipApoyo } : {};
    const r1 = await pedir(`/api/reports/1/confirm`,
      json('POST', { turnstileToken: TOKEN_TURNSTILE }, cab));
    if (ES_LOCAL) {
      comprobar(r1.status === 200 && r1.cuerpo?.ok === true,
        'POST /api/reports/1/confirm registra el apoyo',
        `status=${r1.status} confirmaciones=${r1.cuerpo?.confirmaciones}`);
    } else {
      comprobar(r1.status === 200 || r1.status === 409,
        'el apoyo se registra (200) o esa IP ya habia apoyado (409)',
        `status=${r1.status} confirmaciones=${r1.cuerpo?.confirmaciones ?? 'n/d'}`);
    }
    const r2 = await pedir(`/api/reports/1/confirm`,
      json('POST', { turnstileToken: TOKEN_TURNSTILE }, cab));
    comprobar(r2.status === 409, 'el mismo origen no puede apoyar dos veces (409)', `status=${r2.status}`);

    const sinToken = await pedir(`/api/reports/2/confirm`, json('POST', {}));
    comprobar(sinToken.status === 403, 'apoyar sin Turnstile devuelve 403', `status=${sinToken.status}`);
  }

  seccion('13. Cambio de estado (administrativo, con token)');
  if (!ADMIN_TOKEN) {
    mal('sin --admin-token no se puede probar el panel administrativo');
  } else {
    const sinAuth = await pedir(`/api/reports/${idCreado}/status`, json('PATCH', { estado: 'en_proceso' }));
    comprobar(sinAuth.status === 401, 'PATCH sin token devuelve 401', `status=${sinAuth.status}`);

    const malAuth = await pedir(`/api/reports/${idCreado}/status`,
      json('PATCH', { estado: 'en_proceso' }, { Authorization: 'Bearer token-falso' }));
    comprobar(malAuth.status === 401, 'PATCH con token falso devuelve 401', `status=${malAuth.status}`);

    const okAuth = await pedir(`/api/reports/${idCreado}/status`,
      json('PATCH', { estado: 'en_proceso', nota: 'Prueba automatica' },
        { Authorization: `Bearer ${ADMIN_TOKEN}` }));
    comprobar(okAuth.status === 200 && okAuth.cuerpo?.reporte?.properties?.estado === 'en_proceso',
      'PATCH con token valido cambia el estado', `status=${okAuth.status}`);

    const detalle = await pedir(`/api/reports/${idCreado}`);
    comprobar(detalle.cuerpo?.historial?.length >= 2, 'el cambio queda en el historial (trazabilidad)',
      `entradas=${detalle.cuerpo?.historial?.length}`);

    const estadoMalo = await pedir(`/api/reports/${idCreado}/status`,
      json('PATCH', { estado: 'inventado' }, { Authorization: `Bearer ${ADMIN_TOKEN}` }));
    comprobar(estadoMalo.status === 400, 'estado invalido devuelve 400', `status=${estadoMalo.status}`);

    const noExiste = await pedir('/api/reports/999999/status',
      json('PATCH', { estado: 'resuelto' }, { Authorization: `Bearer ${ADMIN_TOKEN}` }));
    comprobar(noExiste.status === 404, 'cambiar estado de un reporte inexistente da 404',
      `status=${noExiste.status}`);
  }
}

async function modoBloqueo() {
  const punto = puntoDeDemostracion();
  seccion('Turnstile con el secreto "siempre bloquea": todo reporte debe rechazarse');
  {
    const r = await pedir('/api/report', json('POST', {
      categoria: 'bache',
      descripcion: 'Este reporte NO debe entrar: Turnstile debe rechazarlo.',
      lat: punto.lat, lng: punto.lng, zona: punto.zona,
      turnstileToken: TOKEN_TURNSTILE,
      consentimiento: false,
    }));
    comprobar(r.status === 403, 'POST /api/report devuelve 403 con secreto que bloquea',
      `status=${r.status} error=${r.cuerpo?.error}`);
    comprobar(r.cuerpo?.ok === false, 'la respuesta trae ok:false');

    const confirmar = await pedir('/api/reports/1/confirm', json('POST', { turnstileToken: TOKEN_TURNSTILE }));
    comprobar(confirmar.status === 403, 'el apoyo vecinal tambien queda bloqueado',
      `status=${confirmar.status}`);

    const lectura = await pedir('/api/reports');
    comprobar(lectura.status === 200, 'las lecturas siguen funcionando (solo se protege la escritura)',
      `status=${lectura.status}`);
  }
}

async function modoLimite() {
  const punto = puntoDeDemostracion();
  seccion('Limitador de abuso (servidor arrancado con MAX_REPORTES_POR_HORA=1)');
  {
    // Se usa una IP sintetica distinta en cada ejecucion para partir de un cupo limpio. Esto SOLO
    // funciona en local: en produccion Cloudflare rechaza en el borde cualquier CF-Connecting-IP
    // enviada por el cliente, asi que este modo no tiene sentido contra un Worker desplegado.
    if (!ES_LOCAL) {
      mal('el modo limite necesita un servidor local (Cloudflare bloquea la IP simulada)',
        `base=${BASE}`);
      return;
    }
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const cabeceras = { 'CF-Connecting-IP': ip };
    const estados = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await pedir('/api/report', json('POST', {
        categoria: 'otro',
        descripcion: `Prueba del limitador, intento ${i + 1}.`,
        lat: punto.lat, lng: punto.lng, zona: punto.zona,
        turnstileToken: TOKEN_TURNSTILE,
        consentimiento: false,
      }, cabeceras));
      estados.push(r.status);
    }
    comprobar(estados[0] === 201,
      'el primer reporte de una IP nueva entra (201)', `status=${estados[0]}`);
    comprobar(estados[1] === 429 && estados[2] === 429,
      'los siguientes superan el cupo y reciben 429', `statuses: ${estados.join(' ')}`);

    const lectura = await pedir('/api/reports', { headers: cabeceras });
    comprobar(lectura.status === 200, 'las lecturas no estan limitadas', `status=${lectura.status}`);

    // Sin cabecera de IP el limitador tambien debe responder de forma controlada (nunca 500).
    const sinCabecera = await pedir('/api/report', json('POST', {
      categoria: 'otro', descripcion: 'Prueba sin cabecera de IP.',
      lat: punto.lat, lng: punto.lng, zona: punto.zona,
      turnstileToken: TOKEN_TURNSTILE, consentimiento: false,
    }));
    comprobar(sinCabecera.status === 201 || sinCabecera.status === 429,
      'sin cabecera de IP responde de forma controlada (nunca 500)', `status=${sinCabecera.status}`);
  }
}

// ---------------------------------------------------------------------------
console.log(`Prueba de humo de Ojo Comas contra ${BASE} (modo: ${MODO})`);
try {
  const salud = await fetch(`${BASE}/api/health`);
  if (!salud.ok) throw new Error(`/api/health devolvio ${salud.status}`);
} catch (error) {
  console.error(`\nNo se pudo contactar con ${BASE}/api/health.`);
  console.error(`Detalle: ${error instanceof Error ? error.message : error}`);
  console.error('Arranca el Worker antes de la prueba:  npx wrangler dev --port 8787');
  process.exit(2);
}

if (MODO === 'bloqueo') await modoBloqueo();
else if (MODO === 'limite') await modoLimite();
else await modoCompleto();

console.log(`\n${'='.repeat(62)}`);
console.log(`RESULTADO: ${pasadas} comprobaciones correctas, ${falladas} fallidas`);
if (fallos.length) {
  console.log('\nFallos:');
  for (const f of fallos) console.log(`  - ${f}`);
}
console.log('='.repeat(62));
process.exit(falladas === 0 ? 0 : 1);
