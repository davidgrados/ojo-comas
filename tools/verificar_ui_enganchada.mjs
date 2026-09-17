#!/usr/bin/env node
/**
 * Auditoria de "interfaz enganchada".
 *
 * Nace de un fallo real: `confirmarApoyo()` estaba definida en frontend/app.js pero NO se llamaba
 * desde ningun sitio, asi que pulsar «Confirmar apoyo» no hacia absolutamente nada y el flujo de
 * apoyo vecinal era inservible. Ninguna prueba de "el boton existe" lo habria detectado.
 *
 * Analiza el codigo con un PARSER REAL (acorn) y no con expresiones regulares. Los dos intentos
 * anteriores con regex fallaron, y conviene no repetirlos:
 *
 *   1. Contar con `indexOf` daba por usada la funcion huerfana, porque `confirmarApoyo` es
 *      substring de `btnConfirmarApoyo`.
 *   2. Un analizador de estados casero se desincroniza con literales de expresion regular que
 *      contienen comillas, como los `.replace(/"/g, ...)` de la propia funcion `esc()`. A partir
 *      de ahi todo el archivo queda "dentro de una cadena" y la auditoria llegaba a reportar 24
 *      falsos huerfanos. Con el AST esos casos simplemente no existen.
 *
 * Comprueba tres cosas que ni el navegador ni la prueba de humo delatan:
 *
 *   1. Funciones declaradas que nunca se referencian (codigo muerto = cableado que falta).
 *   2. Nodos interactivos cacheados en `cachearNodos()` que luego no se leen en ningun sitio.
 *   3. Botones del HTML con `id` que el JavaScript no menciona.
 *
 * Uso:  node tools/verificar_ui_enganchada.mjs
 * Salida: 0 si todo esta enganchado, 1 si hay algun huerfano.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = readFileSync(join(RAIZ, 'frontend', 'app.js'), 'utf8');
const html = readFileSync(join(RAIZ, 'frontend', 'index.html'), 'utf8');

const ast = parse(js, { ecmaVersion: 2022, sourceType: 'script', locations: true });

/**
 * Excepciones justificadas. Cada entrada debe explicar POR QUE el huerfano es intencionado.
 * Ahora mismo no hay ninguna.
 */
const EXCEPCIONES_FUNCIONES = new Set([]);
const EXCEPCIONES_NODOS = new Set([]);

let fallos = 0;
const comprobar = (cond, texto, detalle = '') => {
  if (cond) {
    console.log(`  \u2713 ${texto}${detalle ? `  ${detalle}` : ''}`);
  } else {
    fallos += 1;
    console.log(`  \u2717 ${texto}${detalle ? `  ${detalle}` : ''}`);
  }
};

// --- Recoleccion de declaraciones y de referencias -----------------------------------------
const declaraciones = [];
walk.simple(ast, {
  FunctionDeclaration(nodo) {
    if (nodo.id && nodo.id.name) declaraciones.push(nodo);
  },
});

/** nombre -> numero de usos reales (referencias que no son la propia declaracion). */
const usos = new Map();
walk.ancestor(ast, {
  Identifier(nodo, _estado, ancestros) {
    const padre = ancestros[ancestros.length - 2];
    if (!padre) return;
    // `a.b`: `b` es una propiedad, no una referencia a variable.
    if (padre.type === 'MemberExpression' && padre.property === nodo && !padre.computed) return;
    // Nombre de la propia funcion, variable declarada o clave de objeto: no son usos.
    if (
      (padre.type === 'FunctionDeclaration' ||
        padre.type === 'FunctionExpression' ||
        padre.type === 'ArrowFunctionExpression') &&
      padre.id === nodo
    ) {
      return;
    }
    if (padre.type === 'VariableDeclarator' && padre.id === nodo) return;
    if (padre.type === 'Property' && padre.key === nodo && !padre.computed) return;
    usos.set(nodo.name, (usos.get(nodo.name) ?? 0) + 1);
  },
});

console.log('Auditoria de la interfaz enganchada');
console.log(`Analisis con AST real (acorn): ${declaraciones.length} funciones declaradas\n`);

// ---------------------------------------------------------------------------
// 1. Funciones declaradas que nunca se referencian
// ---------------------------------------------------------------------------
console.log('1. Funciones declaradas que nunca se llaman');
{
  const huerfanas = declaraciones
    .map((n) => n.id.name)
    .filter((nombre) => !EXCEPCIONES_FUNCIONES.has(nombre) && (usos.get(nombre) ?? 0) === 0);

  comprobar(
    huerfanas.length === 0,
    'toda funcion declarada se usa en algun sitio',
    huerfanas.length
      ? `sin usar: ${huerfanas.join(', ')}  (¿falta engancharla a un evento?)`
      : `${declaraciones.length} funciones revisadas`,
  );
}

// ---------------------------------------------------------------------------
// 2. Nodos del DOM cacheados que luego no se leen
// ---------------------------------------------------------------------------
console.log('\n2. Nodos del DOM cacheados que nunca se leen');
{
  const cacheos = [];
  walk.ancestor(ast, {
    AssignmentExpression(nodo, _estado, ancestros) {
      const { left: izq, right: der } = nodo;
      if (izq.type !== 'MemberExpression' || izq.object.type !== 'Identifier' || izq.object.name !== 'N') return;
      if (izq.computed || izq.property.type !== 'Identifier') return;
      if (der.type !== 'CallExpression' || der.callee.type !== 'Identifier' || der.callee.name !== '$') return;
      const arg = der.arguments[0];
      if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string' || !arg.value.startsWith('#')) return;

      const contenedora = [...ancestros]
        .reverse()
        .find(
          (a) =>
            a.type === 'FunctionDeclaration' ||
            a.type === 'FunctionExpression' ||
            a.type === 'ArrowFunctionExpression',
        );

      cacheos.push({
        clave: izq.property.name,
        id: arg.value.slice(1),
        linea: nodo.loc.start.line,
        enCachearNodos: Boolean(contenedora && contenedora.id && contenedora.id.name === 'cachearNodos'),
      });
    },
  });

  // Lecturas de N.<clave>, indexadas por clave y linea.
  const lecturas = new Map();
  walk.simple(ast, {
    MemberExpression(n) {
      if (n.object.type !== 'Identifier' || n.object.name !== 'N') return;
      if (n.computed || n.property.type !== 'Identifier') return;
      const clave = `${n.property.name}@${n.loc.start.line}`;
      lecturas.set(clave, (lecturas.get(clave) ?? 0) + 1);
    },
  });

  const esInteractivo = (id) =>
    new RegExp(
      `<(?:button|a|input|select|textarea)[^>]*\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
    ).test(html);

  const soloEnCachear = cacheos.filter((c) => c.enCachearNodos);
  const huerfanos = soloEnCachear.filter((c) => {
    if (!esInteractivo(c.id)) return false; // los contenedores no necesitan leerse
    if (EXCEPCIONES_NODOS.has(c.clave)) return false;
    let n = 0;
    for (const [clave, veces] of lecturas) {
      if (clave === `${c.clave}@${c.linea}`) continue; // la propia asignacion del cacheo
      if (clave.startsWith(`${c.clave}@`)) n += veces;
    }
    return n === 0;
  });

  comprobar(
    huerfanos.length === 0,
    'todo control interactivo cacheado se usa despues',
    huerfanos.length
      ? `huerfanos: ${huerfanos.map((n) => `N.${n.clave} (#${n.id}, linea ${n.linea})`).join(', ')}`
      : `${soloEnCachear.length} nodos cacheados revisados`,
  );
}

// ---------------------------------------------------------------------------
// 3. Botones del HTML que el JavaScript no menciona
// ---------------------------------------------------------------------------
console.log('\n3. Botones del HTML que el JavaScript nunca menciona');
{
  const botones = [
    ...new Set([...html.matchAll(/<button[^>]*\bid="([A-Za-z0-9_-]+)"/g)].map((m) => m[1])),
  ];
  const comoIdentificador = new Set(usos.keys());
  const comoCadena = new Set(
    [...js.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => (m[1] ?? m[2] ?? '').replace(/^#/, '')),
  );
  const desconocidos = botones.filter(
    (id) => !comoIdentificador.has(id) && !comoCadena.has(id) && !js.includes(`#${id}`),
  );

  comprobar(
    desconocidos.length === 0,
    'todos los botones con id estan contemplados en app.js',
    desconocidos.length ? `sin mencionar: ${desconocidos.join(', ')}` : `${botones.length} botones revisados`,
  );
}

console.log(`\n${'='.repeat(62)}`);
console.log(
  fallos === 0
    ? 'RESULTADO: la interfaz esta completamente enganchada'
    : `RESULTADO: ${fallos} comprobaciones fallidas`,
);
console.log('='.repeat(62));
process.exit(fallos === 0 ? 0 : 1);
