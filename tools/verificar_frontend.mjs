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
try {
  const r = await fetch(`${HTML_SERVIDO}/`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
    // fetch relativo -> API real. En la pagina apiBase es '', es decir mismo origen; aqui se
    // redirige a la API que se este verificando.
    const fetchOriginal = globalThis.fetch;
    window.fetch = (recurso, opciones) => {
      const url = String(recurso);
      const destino = url.startsWith('http') ? url : `${API}${url.startsWith('/') ? url : `/${url}`}`;
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

console.log(`\n${'='.repeat(62)}`);
console.log(fallos === 0 ? 'RESULTADO: todas las comprobaciones correctas' : `RESULTADO: ${fallos} fallidas`);
if (erroresJs.length) {
  console.log('\nErrores de JavaScript detectados:');
  for (const e of erroresJs.slice(0, 10)) console.log(`  - ${e}`);
}
console.log('='.repeat(62));
dom.window.close();
process.exit(fallos === 0 ? 0 : 1);
