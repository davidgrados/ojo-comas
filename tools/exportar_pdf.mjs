#!/usr/bin/env node
/**
 * Exporta un documento Markdown del proyecto a PDF.
 *
 * Estrategia: Markdown -> HTML con hoja de estilo de impresion -> PDF con un navegador en modo
 * headless. Se eligio asi (y no con reportlab o fpdf) por una razon concreta: el guion esta lleno
 * de emojis (🎬 🔊 🎥 📝 ⚠️ 🇵🇪) y de tablas. Un generador de PDF puro necesita empaquetar una
 * fuente de emojis y montar el maquetado a mano; el navegador ya trae todo eso y ademas respeta los
 * colores y los saltos de pagina.
 *
 * Uso:
 *   node tools/exportar_pdf.mjs docs/GUION-TIKTOK.md
 *   node tools/exportar_pdf.mjs docs/GUION-TIKTOK.md --salida docs/guion-ojo-comas.pdf
 *   node tools/exportar_pdf.mjs --todos          (exporta los cuatro documentos)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { marked } from 'marked';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Rutas habituales de Chrome y Edge en Windows, en orden de preferencia. */
const NAVEGADORES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};

/** Subtitulo de portada de cada documento. */
const SUBTITULOS = {
  'GUION-TIKTOK.md': 'Biblia de producción del video · 58 segundos · guion plano a plano, SFX, motion graphics y movimientos de cámara',
  'CUMPLIMIENTO-LEGAL.md': 'Análisis de riesgo ante autoridades peruanas y acciones obligatorias antes de usarlo con datos reales',
  'SEGURIDAD.md': 'Auditoría de vulnerabilidades del frontend, la API y el despliegue',
  'VERIFICACION.md': 'Bitácora de las comprobaciones ejecutadas sobre el prototipo',
};

function buscarNavegador() {
  for (const ruta of NAVEGADORES) {
    if (existsSync(ruta)) return ruta;
  }
  throw new Error(
    'No se encontro Chrome ni Edge. Instala uno, o abre el HTML generado y usa "Imprimir > Guardar como PDF".',
  );
}

/** Hoja de estilo de impresion: colores del proyecto y control de saltos de pagina. */
const CSS = `
  @page { size: A4; margin: 16mm 14mm 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", "Inter", -apple-system, Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.5; color: #1F2937; margin: 0;
  }
  .portada {
    border: 3px solid #C8102E; border-radius: 14px; padding: 18px 20px; margin-bottom: 22px;
    background: #FFF7F8;
  }
  .portada h1 { font-size: 21pt; margin: 0 0 6px; color: #8A0B20; line-height: 1.15; }
  .portada p { margin: 4px 0; font-size: 9.5pt; color: #4B5563; }
  .portada .aviso {
    margin-top: 10px; background: #C8102E; color: #fff; font-weight: 700;
    padding: 8px 12px; border-radius: 9px; font-size: 9pt;
  }
  h1 { font-size: 17pt; color: #8A0B20; margin: 22px 0 8px; border-bottom: 2px solid #F3B9C3; padding-bottom: 4px; }
  h2 {
    font-size: 13.5pt; color: #111827; margin: 20px 0 8px; padding: 7px 10px;
    background: #F3F4F6; border-left: 5px solid #C8102E; border-radius: 0 8px 8px 0;
    break-after: avoid; page-break-after: avoid;
  }
  h3 { font-size: 11.5pt; color: #8A0B20; margin: 14px 0 6px; break-after: avoid; page-break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 12px 0 4px; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { margin: 6px 0 10px; padding-left: 20px; }
  li { margin: 3px 0; }
  table {
    width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 9pt;
    break-inside: avoid; page-break-inside: avoid;
  }
  th { background: #1F2937; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; }
  td { border-bottom: 1px solid #E5E7EB; padding: 5px 8px; vertical-align: top; }
  tr:nth-child(even) td { background: #FAFAFA; }
  blockquote {
    margin: 10px 0; padding: 9px 13px; background: #FFFBEB;
    border-left: 5px solid #E8A33D; border-radius: 0 8px 8px 0;
    break-inside: avoid; page-break-inside: avoid;
  }
  blockquote p { margin: 3px 0; }
  code {
    background: #F3F4F6; padding: 1px 5px; border-radius: 4px;
    font-family: Consolas, "Cascadia Mono", monospace; font-size: 9pt; color: #8A0B20;
  }
  pre {
    background: #1F2937; color: #E5E7EB; padding: 11px 13px; border-radius: 9px;
    font-size: 8.5pt; overflow-x: auto; break-inside: avoid; page-break-inside: avoid;
  }
  pre code { background: none; color: inherit; padding: 0; }
  hr { border: none; border-top: 1px dashed #D1D5DB; margin: 16px 0; }
  a { color: #1D4E89; text-decoration: none; word-break: break-word; }
  strong { color: #111827; }
  .pie {
    margin-top: 26px; padding-top: 10px; border-top: 2px solid #C8102E;
    font-size: 8.5pt; color: #6B7280;
  }
`;

const PORTADA = (titulo, subtitulo) => `
  <div class="portada">
    <h1>${titulo}</h1>
    <p><strong>${subtitulo}</strong></p>
    <p>Comas, Lima Norte · Perú</p>
    <p>Documento de trabajo del prototipo «Ojo Comas» · Versión de setiembre de 2026</p>
    <p class="aviso">⚠️ Ojo Comas es un PROTOTIPO DE DEMOSTRACIÓN con datos 100 % ficticios.
    No representa oficialmente a la Municipalidad Distrital de Comas ni a ninguna entidad del Estado.</p>
  </div>
`;

const PIE = `
  <div class="pie">
    <p><strong>Recuerda antes de publicar:</strong> el bloque del aviso dentro del video es obligatorio.
    No uses el escudo, los logos ni el nombre oficial de la Municipalidad de Comas. No muestres rostros,
    placas ni documentos de terceros. Habla del problema, no de culpables.</p>
    <p>Para reclamos reales: mesa de partes o Libro de Reclamaciones de la Municipalidad Distrital de Comas.
    Emergencias: 105 (Policía Nacional) y 106 (SAMU).</p>
    <p>Repositorio: github.com/davidgrados/ojo-comas · Demo: ojo-comas.pages.dev</p>
  </div>
`;

function exportar(rutaMd, rutaPdf) {
  const md = readFileSync(rutaMd, 'utf8');
  const navegador = buscarNavegador();

  // El primer H1 del documento se usa como titulo de portada y se quita del cuerpo.
  const lineas = md.split('\n');
  const idxH1 = lineas.findIndex((l) => l.startsWith('# '));
  const titulo = idxH1 >= 0 ? lineas[idxH1].replace(/^#\s*/, '') : basename(rutaMd, '.md');
  if (idxH1 >= 0) lineas.splice(idxH1, 1);

  /* Subtitulo FIJO por documento.
   *
   * Se intento deducirlo automaticamente del primer parrafo, y no funciona: segun el documento
   * acababa cogiendo los metadatos tecnicos, un separador "---" o el titulo de la primera seccion.
   * Un subtitulo escrito a mano es predecible y ademas describe mejor de que va el documento. */
  const subtitulo = SUBTITULOS[basename(rutaMd)] || 'Documento de trabajo del prototipo Ojo Comas';

  const cuerpo = marked.parse(lineas.join('\n'), { gfm: true, breaks: false });
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${titulo}</title>
<style>${CSS}</style></head>
<body>
${PORTADA(titulo, subtitulo.replace(/\*\*/g, ''))}
${cuerpo}
${PIE}
</body></html>`;

  const tmpHtml = join(RAIZ, '.tmp-export', `${basename(rutaMd, '.md')}.html`);
  mkdirSync(dirname(tmpHtml), { recursive: true });
  writeFileSync(tmpHtml, html, 'utf8');

  mkdirSync(dirname(rutaPdf), { recursive: true });
  execFileSync(
    navegador,
    [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--no-sandbox',
      `--print-to-pdf=${resolve(rutaPdf)}`,
      `file:///${tmpHtml.replace(/\\/g, '/')}`,
    ],
    { stdio: 'pipe', timeout: 120_000 },
  );

  rmSync(tmpHtml, { force: true });
  const kb = Math.round(readFileSync(rutaPdf).length / 1024);
  console.log(`  OK  ${rutaMd}  ->  ${rutaPdf}  (${kb} KB)`);
}

const TODOS = [
  ['docs/GUION-TIKTOK.md', 'docs/Ojo-Comas-guion-video.pdf'],
  ['docs/CUMPLIMIENTO-LEGAL.md', 'docs/Ojo-Comas-cumplimiento-legal.pdf'],
  ['docs/SEGURIDAD.md', 'docs/Ojo-Comas-seguridad.pdf'],
  ['docs/VERIFICACION.md', 'docs/Ojo-Comas-verificacion.pdf'],
];

console.log('Exportando a PDF...\n');
if (process.argv.includes('--todos')) {
  for (const [md, pdf] of TODOS) exportar(join(RAIZ, md), join(RAIZ, pdf));
} else {
  const entrada = arg('entrada', 'docs/GUION-TIKTOK.md');
  const salida = arg('salida', arg('entrada') ? entrada.replace(/\.md$/, '.pdf') : 'docs/Ojo-Comas-guion-video.pdf');
  exportar(join(RAIZ, entrada), join(RAIZ, salida));
}
console.log('\nListo.');
