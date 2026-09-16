#!/usr/bin/env node
/**
 * Verifica que la deteccion de zona del NAVEGADOR y la del SERVIDOR coincidan.
 *
 * Es la coherencia mas importante del prototipo: el formulario le muestra al vecino una zona
 * (calculada en el cliente con Turf.js, `booleanPointInPolygon`) y el Worker guarda otra
 * (calculada en el servidor con lanzamiento de rayo, para no fiarse del navegador). Si los dos
 * algoritmos discreparan en algun punto, el vecino veria una zona y el reporte quedaria en otra.
 *
 * Se comparan ambos algoritmos sobre una rejilla densa de puntos y sobre los hitos reales.
 *
 * Uso:  node tools/verificar_deteccion_zona.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const coleccion = JSON.parse(
  readFileSync(join(RAIZ, 'frontend', 'data', 'comas_zonas.geojson'), 'utf8'),
);

/** Algoritmo del NAVEGADOR: el mismo que usa app.js con Turf.js. */
function zonaConTurf(lat, lng) {
  const punto = { type: 'Point', coordinates: [lng, lat] };
  for (const feature of coleccion.features) {
    if (booleanPointInPolygon(punto, feature)) return feature.properties.zona;
  }
  return null;
}

/** Algoritmo del SERVIDOR: copia fiel del lanzamiento de rayo de worker/src/zonas.ts. */
function puntoEnAnillo(x, y, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}
function zonaConRayo(lat, lng) {
  for (const feature of coleccion.features) {
    if (puntoEnAnillo(lng, lat, feature.geometry.coordinates[0])) return feature.properties.zona;
  }
  return null;
}

/** Cuenta cuantas zonas contienen el punto (debe ser 0 o 1: las zonas no se solapan). */
function zonasQueContienen(lat, lng) {
  const punto = { type: 'Point', coordinates: [lng, lat] };
  return coleccion.features.filter((f) => booleanPointInPolygon(punto, f)).length;
}

let fallos = 0;
const comprobar = (cond, texto, detalle = '') => {
  if (cond) {
    console.log(`  \u2713 ${texto}${detalle ? `  ${detalle}` : ''}`);
  } else {
    fallos += 1;
    console.log(`  \u2717 ${texto}${detalle ? `  ${detalle}` : ''}`);
  }
};

console.log('Coherencia de la deteccion de zona: navegador (Turf.js) vs servidor (rayo)\n');

// --- 1) Rejilla densa sobre la envolvente de las zonas -------------------------------------
const todas = coleccion.features.flatMap((f) => f.geometry.coordinates[0]);
const minLng = Math.min(...todas.map((p) => p[0]));
const maxLng = Math.max(...todas.map((p) => p[0]));
const minLat = Math.min(...todas.map((p) => p[1]));
const maxLat = Math.max(...todas.map((p) => p[1]));

const PASOS = 130;
let dentro = 0;
let discrepancias = 0;
const ejemplos = [];
const reparto = {};
let multi = 0;

for (let i = 0; i <= PASOS; i += 1) {
  for (let j = 0; j <= PASOS; j += 1) {
    const lat = minLat + ((maxLat - minLat) * i) / PASOS;
    const lng = minLng + ((maxLng - minLng) * j) / PASOS;
    const a = zonaConTurf(lat, lng);
    const b = zonaConRayo(lat, lng);
    if (a !== null || b !== null) dentro += 1;
    if (a !== b) {
      discrepancias += 1;
      if (ejemplos.length < 8) ejemplos.push({ lat, lng, turf: a, rayo: b });
    }
    if (a) reparto[a] = (reparto[a] ?? 0) + 1;
    if (a !== null && zonasQueContienen(lat, lng) > 1) multi += 1;
  }
}

console.log(`1. Rejilla de ${(PASOS + 1) ** 2} puntos sobre la envolvente del distrito`);
comprobar(discrepancias === 0,
  'los dos algoritmos devuelven SIEMPRE la misma zona',
  `${dentro} puntos dentro del distrito, ${discrepancias} discrepancias`);
if (ejemplos.length) {
  for (const e of ejemplos) {
    console.log(`      lat=${e.lat.toFixed(6)} lng=${e.lng.toFixed(6)}  turf=${e.turf}  rayo=${e.rayo}`);
  }
}
comprobar(multi === 0, 'ningun punto cae en mas de una zona (las zonas no se solapan)',
  `puntos con mas de una zona=${multi}`);

console.log(`\n2. Cobertura: las 14 zonas reciben puntos de la rejilla`);
const sinPuntos = coleccion.features
  .map((f) => f.properties.zona)
  .filter((z) => !reparto[z]);
comprobar(sinPuntos.length === 0, 'todas las zonas contienen puntos de la rejilla',
  sinPuntos.length ? `sin puntos: ${sinPuntos.join(', ')}` : `14/14 zonas`);

// --- 3) Hitos reales: la zona que ve el vecino debe ser la que guarda el servidor ----------
const HITOS = [
  ['Parque Zonal Sinchi Roca', -11.9221263, -77.0490901],
  ['Hospital Marino Molina Scippa', -11.9431649, -77.0572333],
  ['Cementerio de Collique', -11.9090957, -77.0029445],
  ['Mercado de Comas', -11.9556219, -77.0481595],
  ['Mercado Central 1ra Zona Collique', -11.9153695, -77.0330272],
  ['Hospital Nacional Sergio E. Bernales', -11.9141196, -77.0376892],
  ['Comisaria PNP Universitaria', -11.9474565, -77.0599981],
  ['Mercado El Pinar', -11.9151274, -77.0559846],
  ['Huaca Sinchi Roca', -11.9303407, -77.0457236],
];
console.log('\n3. Hitos reales de Comas (la UI y la API deben coincidir en la zona)');
for (const [nombre, lat, lng] of HITOS) {
  const a = zonaConTurf(lat, lng);
  const b = zonaConRayo(lat, lng);
  comprobar(a === b && a !== null, `${nombre}: Zona ${a ?? 'FUERA'}`, a === b ? '' : `turfa=${a} rayo=${b}`);
}

// --- 4) Los reportes ficticios deben estar en la zona que declaran -------------------------
console.log('\n4. Los 28 reportes ficticios caen en la zona que declaran');
const demo = JSON.parse(readFileSync(join(RAIZ, 'frontend', 'data', 'reportes_demo.geojson'), 'utf8'));
const malUbicados = demo.features.filter((f) => {
  const [lng, lat] = f.geometry.coordinates;
  return zonaConRayo(lat, lng) !== f.properties.zona;
});
comprobar(malUbicados.length === 0, 'coinciden cliente, servidor y dato sembrado',
  `${demo.features.length - malUbicados.length}/${demo.features.length} reportes correctos`);

console.log(`\n${'='.repeat(62)}`);
console.log(fallos === 0 ? 'RESULTADO: todas las comprobaciones correctas' : `RESULTADO: ${fallos} fallidas`);
console.log('='.repeat(62));
process.exit(fallos === 0 ? 0 : 1);
