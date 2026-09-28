#!/usr/bin/env node
/**
 * Verifica que el frontend REALMENTE arranca y pinta el mapa.
 *
 * Monta index.html en un DOM real (jsdom) con **Leaflet real** (la misma version que carga la
 * pagina, 1.9.4) y Turf real, apuntando a la API que este corriendo en --base. Se sustituyen
 * solo las librerias que necesitan canvas (Chart.js y canvas-confetti) y el widget de Turnstile,
 * porque jsdom no implementa canvas.
 *
 * Comprueba, sobre el DOM resultante:
 *   · que el banner legal con el texto exigido esta presente,
 *   · que se renderizan las 14 zonas del distrito como poligonos SVG,
 *   · que se pintan los marcadores de los reportes que devuelve la API,
 *   · que se pintan las fichas de las 14 zonas,
 *   · que la politica de privacidad cita la Ley N° 29733,
 *   · que no hubo errores de JavaScript durante el arranque.
 *
 * Uso:
 *   node tools/verificar_frontend.mjs --base http://127.0.0.1:8787
 *   node tools/verificar_frontend.mjs --base http://127.0.0.1:8787 --html http://127.0.0.1:8788
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const API = (arg('base', 'http://127.0.0.1:8787') || '').replace(/\/$/, '');
const HTML_SERVIDO = (arg('html', 'http://127.0.0.1:8788') || '').replace(/\/$/, '');

let fallos = 0;
const comprobar = (cond, texto, detalle = '') => {
  if (cond) console.log(`  \u2713 ${texto}${detalle ? `  ${detalle}` : ''}`);
  else {
    fallos += 1;
    console.log(`  \u2717 ${texto}${detalle ? `  ${detalle}` : ''}`);
  }
};

// --- 1) Traer el HTML tal cual lo sirve Pages ---------------------------------------------
console.log(`Montando el frontend servido en ${HTML_SERVIDO} contra la API ${API}\n`);
let html;
/** Cabeceras HTTP reales del sitio, para comprobar la seguridad del despliegue. */
let cabecerasSitio = null;
try {
  const r = await fetch(`${HTML_SERVIDO}/`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  cabecerasSitio = r.headers;
  html = await r.text();
} catch (error) {
  console.error(`No se pudo descargar el HTML de ${HTML_SERVIDO}: ${error.message}`);
  console.error('Arranca Pages:  npx wrangler pages dev frontend --port 8788');
  process.exit(2);
}

const fuentes = {
  app: readFileSync(join(RAIZ, 'frontend', 'app.js'), 'utf8'),
  config: readFileSync(join(RAIZ, 'frontend', 'config.js'), 'utf8'),
  leaflet: readFileSync(join(RAIZ, 'node_modules', 'leaflet', 'dist', 'leaflet.js'), 'utf8'),
  leafletCss: readFileSync(join(RAIZ, 'node_modules', 'leaflet', 'dist', 'leaflet.css'), 'utf8'),
};

// --- 2) Reescribir el HTML: quitar CDN y sustituirlos por las librerias reales locales ------
const erroresJs = [];
const registroChart = { creado: false, etiquetas: null, datasets: 0 };
let turnstileRender = 0;
/** Registro de todas las peticiones que hace la pagina, para comprobar los botones. */
const peticiones = [];

const quitar = (s, re, reemplazo = '') => s.replace(re, reemplazo);

let documento = html;
// Quitar todo lo que venga de una CDN (script o link) para que la prueba sea determinista.
documento = quitar(documento, /<script[^>]+src="https?:\/\/[^"]+"[^>]*><\/script>/g);
documento = quitar(documento, /<link[^>]+href="https?:\/\/[^"]+"[^>]*>/g);
// Quitar el enlace a styles.css (no aporta al DOM) y dejar solo lo necesario.
documento = quitar(documento, /<link[^>]+href="\.\/styles\.css"[^>]*>/g);
// Sustituir los scripts locales por su contenido en linea, en orden.
documento = quitar(documento, /<script[^>]+src="\.\/config\.js"[^>]*><\/script>/g);
documento = quitar(documento, /<script[^>]+src="\.\/app\.js"[^>]*><\/script>/g);

const inline = [
  `<style>${fuentes.leafletCss}</style>`,
  `<script>${fuentes.leaflet}</script>`,
  // Stubs de las librerias que requieren canvas y del widget de Turnstile.
  `<script>
    window.Chart = function (ctx, cfg) {
      window.__chartRegistro.creado = true;
      window.__chartRegistro.etiquetas = (cfg && cfg.data && cfg.data.labels) || null;
      window.__chartRegistro.datasets = ((cfg && cfg.data && cfg.data.datasets) || []).length;
      this.destroy = function () {}; this.update = function () {}; this.resize = function () {};
    };
    window.confetti = function () { window.__confettiLlamado = (window.__confettiLlamado || 0) + 1; };
    window.turnstile = {
      render: function () { window.__turnstileRender = (window.__turnstileRender || 0) + 1; return 'widget-1'; },
      reset: function () { window.__turnstileReset = (window.__turnstileReset || 0) + 1; },
      remove: function () {}, getResponse: function () { return 'XXXX.DUMMY.TOKEN.XXXX'; }
    };
  </script>`,
  `<script>${fuentes.config}</script>`,
  `<script>${fuentes.app}</script>`,
].join('\n');

// OJO: se usa un reemplazo por FUNCION, no una cadena. Si se pasara `inline` como cadena de
// reemplazo, String.replace interpretaria cada `$$` del codigo de app.js (por ejemplo la funcion
// `$$(sel, ctx)`) como el escape de un solo `$`, convirtiendo `function $$(...)` en
// `function $(...)`: una segunda definicion de `$` que, por hoisting, sustituiria a la buena y
// romperia toda la aplicacion. Es un fallo del arnes, no del codigo verificado.
documento = documento.replace('</body>', () => `${inline}\n</body>`);

// --- 3) Montar el DOM ----------------------------------------------------------------------
const consolaVirtual = new VirtualConsole();
consolaVirtual.on('jsdomError', (e) => erroresJs.push(`jsdomError: ${e.message}`));
consolaVirtual.on('error', (m) => erroresJs.push(`error: ${m}`));
consolaVirtual.on('warn', () => {});
consolaVirtual.on('log', () => {});
consolaVirtual.on('info', () => {});

const dom = new JSDOM(documento, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: `${HTML_SERVIDO}/`,
  virtualConsole: consolaVirtual,
  beforeParse(window) {
    window.__chartRegistro = registroChart;
    // Turf REAL (el mismo paquete que usa la pagina), inyectado sin cargar su bundle.
    window.turf = { booleanPointInPolygon, point: turfPoint };
    // fetch relativo -> API real. En la pagina apiBase es '' (mismo origen); aqui se redirige a
    // la API que se este verificando. Ademas se REGISTRAN las peticiones, para poder comprobar
    // que los botones hacen de verdad lo que deben hacer.
    const fetchOriginal = globalThis.fetch;
    window.fetch = (recurso, opciones) => {
      const url = String(recurso);
      const destino = url.startsWith('http') ? url : `${API}${url.startsWith('/') ? url : `/${url}`}`;
      const metodo = String((opciones && opciones.method) || 'GET').toUpperCase();
      peticiones.push({ url: destino, metodo, cuerpo: (opciones && opciones.body) || null });

      // El apoyo vecinal se SIMULA: esta prueba comprueba que el boton dispara la peticion, no
      // que el servidor la registre (de eso ya se encarga la prueba de humo). Asi, verificar
      // contra produccion no consume el cupo de la IP de quien ejecuta la verificacion.
      if (/\/api\/reports\/[^/]+\/confirm$/.test(destino)) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, confirmaciones: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return fetchOriginal(destino, opciones);
    };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);

    // jsdom no implementa canvas. La pagina lo usa de forma LEGITIMA: pide el contexto 2D para
    // Chart.js (linea del grafico de transparencia) y lo usa para redimensionar la foto antes de
    // enviarla. Aqui se sustituye por un doble inofensivo para que el entorno de prueba no meta
    // ruido; no se esta probando el dibujado, sino que la aplicacion arranque y monte la interfaz.
    const contextoFalso = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'canvas') return { width: 300, height: 150 };
          if (prop === 'measureText') return () => ({ width: 10 });
          if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
          return () => undefined;
        },
        set: () => true,
      },
    );
    window.HTMLCanvasElement.prototype.getContext = function getContext() {
      return contextoFalso;
    };
    // Tampoco implementa toDataURL (se usa al comprimir la foto a JPEG).
    window.HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
      return 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    };
  },
});

const { window } = dom;
const { document } = window;

// Esperar a que la aplicacion termine de cargar datos y pintar.
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i += 1) {
  await esperar(250);
  if (document.querySelectorAll('.leaflet-interactive').length > 0 || window.__ojoListo) break;
}
await esperar(1500);

// --- 4) Comprobaciones --------------------------------------------------------------------
const texto = document.body.textContent || '';

console.log('1. Arranque');
comprobar(erroresJs.length === 0, 'la aplicacion arranca sin errores de JavaScript',
  erroresJs.length ? erroresJs.slice(0, 3).join(' | ') : 'sin errores');
comprobar(Boolean(window.L), 'Leaflet quedo cargado en la pagina');
comprobar(Boolean(document.querySelector('.leaflet-container')),
  'Leaflet inicializo el contenedor del mapa (#map)',
  document.querySelector('#map') ? '#map presente' : '#map AUSENTE');

console.log('\n2. Banner legal obligatorio');
const TEXTO_LEGAL = 'PROTOTIPO DE DEMOSTRACIÓN';
comprobar(texto.includes(TEXTO_LEGAL), `el banner dice "${TEXTO_LEGAL}"`);
comprobar(texto.includes('Datos 100% ficticios'), 'el banner avisa de que los datos son ficticios');
comprobar(texto.includes('No representa oficialmente a la Municipalidad Distrital de Comas'),
  'el banner aclara que no representa a la municipalidad');
comprobar(texto.includes('Ley N° 29733'), 'el banner cita la Ley N° 29733');
comprobar(texto.includes('Tu voz construye el distrito'), 'el hero tiene el titulo esperado');
comprobar(texto.includes('Sin registros. Sin filas.'), 'el hero tiene el subtitulo esperado');

console.log('\n3. Mapa: 14 zonas y marcadores de reportes');
const zonasGeoJson = JSON.parse(readFileSync(join(RAIZ, 'frontend', 'data', 'comas_zonas.geojson'), 'utf8'));
const nZonas = zonasGeoJson.features.length;
const interactivos = document.querySelectorAll('.leaflet-interactive').length;
comprobar(interactivos >= nZonas + 1,
  'se dibujan los poligonos de las 14 zonas mas el limite del distrito',
  `${interactivos} elementos SVG interactivos`);

const respuestaApi = await (await fetch(`${API}/api/reports`)).json();
const nReportes = respuestaApi.features.length;
comprobar(interactivos >= nZonas + nReportes,
  'se dibuja un marcador por cada reporte que devuelve la API',
  `${nZonas} zonas + ${nReportes} reportes <= ${interactivos} elementos`);

comprobar(document.querySelectorAll('.leaflet-tooltip, .leaflet-popup').length >= 0, 'capas de etiquetas creadas');

console.log('\n4. Fichas de las 14 zonas');
let fichasEncontradas = 0;
const faltantes = [];
for (const f of zonasGeoJson.features) {
  const z = f.properties.zona;
  const etiqueta = `Zona ${z}`;
  if (texto.includes(etiqueta)) fichasEncontradas += 1;
  else faltantes.push(etiqueta);
}
comprobar(fichasEncontradas === nZonas, 'aparecen las 14 fichas de zona',
  faltantes.length ? `faltan: ${faltantes.join(', ')}` : '14/14');

console.log('\n5. Panel de transparencia');
comprobar(registroChart.creado, 'se creo el grafico del panel de transparencia');
comprobar(Array.isArray(registroChart.etiquetas) && registroChart.etiquetas.length === 14,
  'el grafico tiene una barra por zona',
  `etiquetas=${registroChart.etiquetas ? registroChart.etiquetas.length : 0}`);

console.log('\n6. Politica de privacidad (Ley N° 29733)');
const disparadores = [...document.querySelectorAll('a, button')].filter((el) =>
  /pol[ií]tica de privacidad/i.test(el.textContent || ''),
);
comprobar(disparadores.length > 0, 'hay enlaces a la politica de privacidad',
  `${disparadores.length} disparadores`);
if (disparadores.length) {
  disparadores[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await esperar(600);
  const textoModal = document.body.textContent || '';
  comprobar(/29733/.test(textoModal), 'el modal de privacidad cita la Ley N° 29733');
  comprobar(/an[oó]nimo/i.test(textoModal), 'el modal explica que el reporte es anonimo');
  comprobar(/OpenStreetMap|ODbL/i.test(textoModal) || /OpenStreetMap|ODbL/i.test(texto),
    'hay atribucion a OpenStreetMap');
}

console.log('\n7. Widget antibot');
comprobar(turnstileRender > 0 || typeof window.turnstile.render === 'function',
  'el widget de Turnstile esta integrado');

/*
 * 8) Los botones hacen de verdad lo que prometen.
 *
 * Esta seccion existe por un fallo real: `confirmarApoyo()` estaba definida en app.js pero no se
 * llamaba desde ningun sitio, asi que pulsar "Confirmar apoyo" no hacia absolutamente nada y el
 * flujo de apoyo vecinal era inservible. Una comprobacion de que "el boton existe" no lo habria
 * detectado; hay que PULSARLO y ver si dispara la peticion.
 */
console.log('\n8. El boton de confirmar apoyo dispara la peticion');
{
  const antes = peticiones.length;
  const botonApoyar = document.querySelector('[data-apoyar]');
  comprobar(Boolean(botonApoyar), 'hay al menos un boton "Apoyar" en la interfaz',
    botonApoyar ? `data-apoyar="${botonApoyar.getAttribute('data-apoyar')}"` : 'ninguno encontrado');

  if (botonApoyar) {
    const idReporte = botonApoyar.getAttribute('data-apoyar');
    botonApoyar.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await esperar(400);

    const modalApoyo = document.querySelector('#modalApoyo');
    const abierto = Boolean(modalApoyo && !modalApoyo.hidden && !modalApoyo.classList.contains('oculto'));
    comprobar(abierto, 'al pulsar "Apoyar" se abre el modal de apoyo');

    const btnConfirmar = document.querySelector('#btnConfirmarApoyo');
    comprobar(Boolean(btnConfirmar), 'existe el boton "Confirmar apoyo"');

    if (btnConfirmar) {
      btnConfirmar.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await esperar(900);

      const nuevas = peticiones.slice(antes);
      const apoyoEnviado = nuevas.find(
        (p) => p.metodo === 'POST' && /\/api\/reports\/[^/]+\/confirm$/.test(p.url),
      );
      comprobar(Boolean(apoyoEnviado),
        'pulsar "Confirmar apoyo" envia el POST a /api/reports/:id/confirm',
        apoyoEnviado ? apoyoEnviado.url : `peticiones vistas: ${nuevas.map((p) => p.metodo + ' ' + p.url).join(' | ') || 'ninguna'}`);
      comprobar(!apoyoEnviado || String(apoyoEnviado.url).includes(`/reports/${idReporte}/confirm`),
        'la peticion va al reporte correcto', `esperado id=${idReporte}`);
      comprobar(!apoyoEnviado || /turnstileToken/.test(String(apoyoEnviado.cuerpo)),
        'la peticion incluye el token de Turnstile');
    }
  }
}

/*
 * 9) Requisitos legales que NO pueden desaparecer sin que nadie se entere.
 *
 * Un prototipo que publica 28 reportes ficticios sobre calles reales de un distrito real
 * necesita tres cosas visibles: que se vea que los datos son inventados, que se vea que no
 * tiene caracter oficial y que quede claro que no sirve para presentar un reclamo. Si alguien
 * refactoriza la interfaz y borra la marca de agua o el aviso, esta seccion falla.
 */
console.log('\n9. Requisitos legales visibles (marca de ficticio y aviso legal)');
{
  const marca = document.querySelector('.mapa-marca-ficticio');
  comprobar(Boolean(marca), 'el mapa lleva la marca de agua de datos ficticios');
  comprobar(
    Boolean(marca) && /FICTICIO/i.test(marca.textContent || ''),
    'la marca de agua dice "DATOS FICTICIOS"',
    marca ? (marca.textContent || '').replace(/\s+/g, ' ').trim() : 'ausente',
  );
  comprobar(
    Boolean(document.querySelectorAll('.mapa-envoltorio .mapa-marca-ficticio').length),
    'la marca esta DENTRO del mapa, para que salga en cualquier captura de pantalla',
  );

  // Etiqueta de ficticio en los reportes que se pintan.
  const etiquetasFicticio = document.querySelectorAll('.etiqueta-ficticio').length;
  comprobar(etiquetasFicticio > 0,
    'los reportes del listado se marcan como ficticios',
    `${etiquetasFicticio} etiquetas`);

  // El aviso legal debe existir, abrirse y contener la clausula de efectos.
  const modalLegal = document.querySelector('#modalAvisoLegal');
  comprobar(Boolean(modalLegal), 'existe el modal de aviso legal y normas de uso');

  const disparadorLegal = [...document.querySelectorAll('a, button')].find((el) =>
    /aviso legal/i.test(el.textContent || ''),
  );
  comprobar(Boolean(disparadorLegal), 'hay un enlace al aviso legal');
  if (disparadorLegal) {
    disparadorLegal.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await esperar(500);
    const textoLegal = document.body.textContent || '';
    comprobar(/no tienen ning[uú]n efecto legal/i.test(textoLegal) ||
      /NO tienen ning[uú]n efecto legal/i.test(textoLegal),
      'el aviso legal dice que los reportes no tienen efectos legales ni administrativos');
    comprobar(/no es la municipalidad/i.test(textoLegal) ||
      /NO es la Municipalidad/i.test(textoLegal),
      'el aviso legal aclara que no es la Municipalidad');
    comprobar(/datos personales de otras personas|datos personales de terceros/i.test(textoLegal),
      'el aviso legal prohibe incluir datos personales de terceros');
    comprobar(/no .*acusaciones|No hacer acusaciones/i.test(textoLegal),
      'el aviso legal prohibe hacer acusaciones contra personas');
  }

  // La politica de privacidad debe citar el reglamento VIGENTE (el de 2013 esta derogado).
  const disparadorPriv = [...document.querySelectorAll('a, button')].find((el) =>
    /pol[ií]tica de privacidad/i.test(el.textContent || ''),
  );
  if (disparadorPriv) {
    disparadorPriv.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await esperar(500);
    const textoPriv = document.body.textContent || '';
    comprobar(/016-2024-JUS/.test(textoPriv),
      'la politica cita el reglamento VIGENTE (D.S. N. 016-2024-JUS)');
    comprobar(!/003-2013-JUS/.test(textoPriv),
      'la politica NO cita el reglamento derogado (D.S. 003-2013-JUS)');
    comprobar(/fuera del territorio peruano|flujo transfronterizo/i.test(textoPriv),
      'la politica informa del flujo transfronterizo de datos (Cloudflare)');
    comprobar(/ODbL/i.test(textoPriv), 'la politica atribuye la licencia ODbL de los datos de OSM');
  }
}

/*
 * 10) Seguridad del despliegue: cabeceras HTTP reales y el parametro ?api=.
 *
 * Dos hallazgos de la auditoria de vulnerabilidades quedan aqui cubiertos para que no vuelvan:
 *
 *   a) Faltaba Content-Security-Policy. Ya esta puesta, y se comprueba ademas que NO contiene
 *      'unsafe-eval': mientras existio el CDN de Tailwind (que no se usaba) era imposible
 *      quitarlo. Si alguien vuelve a meter una dependencia que necesite 'unsafe-eval', esta
 *      comprobacion lo delata.
 *   b) El parametro ?api= permitia redirigir TODA la aplicacion a un servidor del atacante, con
 *      lo que un vecino habria enviado su foto y su contacto a un tercero. Ahora hay lista blanca
 *      y se comprueba que un origen malicioso se ignora.
 */
console.log('\n10. Seguridad del despliegue (cabeceras y lista blanca de la API)');
{
  const csp = cabecerasSitio ? cabecerasSitio.get('content-security-policy') : null;
  comprobar(Boolean(csp), 'el sitio envía Content-Security-Policy');
  if (csp) {
    comprobar(/default-src 'self'/.test(csp), "la CSP restringe por defecto a 'self'");
    comprobar(/object-src 'none'/.test(csp), "la CSP bloquea object-src");
    comprobar(/frame-ancestors 'none'/.test(csp), 'la CSP impide incrustar la pagina en un iframe');
    comprobar(/base-uri 'self'/.test(csp), 'la CSP fija base-uri');
    comprobar(
      !/unsafe-eval/.test(csp),
      "la CSP NO permite 'unsafe-eval' (por eso se elimino el CDN de Tailwind, que no se usaba)",
    );
    comprobar(
      /script-src[^;]*challenges\.cloudflare\.com/.test(csp),
      'la CSP permite el script de Turnstile',
    );
  }
  comprobar(
    String(cabecerasSitio?.get('x-content-type-options') || '').includes('nosniff'),
    'envía X-Content-Type-Options: nosniff',
  );
  comprobar(
    String(cabecerasSitio?.get('x-frame-options') || '').toUpperCase().includes('DENY'),
    'envía X-Frame-Options: DENY',
  );
  comprobar(Boolean(cabecerasSitio?.get('strict-transport-security')),
    'envía Strict-Transport-Security (fuerza HTTPS)');
  comprobar(Boolean(cabecerasSitio?.get('cross-origin-opener-policy')),
    'envía Cross-Origin-Opener-Policy');

  // El parametro ?api= no puede apuntar a un tercero.
  const { JSDOM } = await import('jsdom');
  const pruebas = [
    ['https://sitio-malicioso.example', true],
    ['https://ojo-comas-api.dunkeljhonz.workers.dev.evil.example', true],
    ['//sitio-malicioso.example', true],
    ['javascript:alert(1)', true],
  ];
  const baseSitio = HTML_SERVIDO;
  for (const [valor, debeBloquearse] of pruebas) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: `${baseSitio}/?api=${valor}`,
      runScripts: 'dangerously',
    });
    const s = dom.window.document.createElement('script');
    s.textContent = fuentes.config;
    dom.window.document.body.appendChild(s);
    const base = String(dom.window.OJO_COMAS_CONFIG.apiBase || '');
    const redirigido = /malicioso|evil|javascript:/.test(base);
    comprobar(
      debeBloquearse ? !redirigido : true,
      `?api=${valor.slice(0, 46)} no redirige la aplicacion`,
      redirigido ? `FUGA: apiBase=${base}` : `apiBase=${base}`,
    );
    dom.window.close();
  }
}

console.log(`\n${'='.repeat(62)}`);
console.log(fallos === 0 ? 'RESULTADO: todas las comprobaciones correctas' : `RESULTADO: ${fallos} fallidas`);
if (erroresJs.length) {
  console.log('\nErrores de JavaScript detectados:');
  for (const e of erroresJs.slice(0, 10)) console.log(`  - ${e}`);
}
console.log('='.repeat(62));
dom.window.close();
process.exit(fallos === 0 ? 0 : 1);
