/**
 * Geometria de las 14 zonas del distrito de Comas.
 *
 * `zonas.json` es una copia de data/comas_zonas.geojson que genera tools/build_zonas.py.
 * Se usa para validar EN EL SERVIDOR la zona que declara el navegador: la API no se fia de un
 * campo que el cliente puede inventar, lo deduce de las coordenadas.
 *
 * Recordatorio: los poligonos de las zonas son una reconstruccion ilustrativa (la Municipalidad
 * de Comas no publica la geometria de sus zonales); el limite distrital si es real (OSM).
 */
import coleccion from './zonas.json';

export type ZonaId = string;

interface GeoJsonFeature {
  type: 'Feature';
  properties: {
    zona: string;
    nombre: string;
    color: string;
    area_ha_oficial: number;
    ubicacion_oficial: string;
    colinda: Record<string, string[]>;
    referencia: string;
    barrios_reales: string[];
    hitos_reales: { tipo: string; nombre: string; lat: number; lng: number }[];
    centro: [number, number];
    precision: string;
  };
  geometry: { type: 'Polygon'; coordinates: number[][][] };
}

interface GeoJsonCollection {
  type: 'FeatureCollection';
  name: string;
  metadata: Record<string, unknown>;
  features: GeoJsonFeature[];
}

export const COLECCION_ZONAS = coleccion as unknown as GeoJsonCollection;

/** Anillo exterior [lng, lat] por zona, precalculado una vez por isolate. */
const ANILLOS: { zona: string; anillo: number[][] }[] = COLECCION_ZONAS.features.map((f) => ({
  zona: f.properties.zona,
  anillo: f.geometry.coordinates[0] ?? [],
}));

export const ZONAS_VALIDAS: string[] = COLECCION_ZONAS.features.map((f) => f.properties.zona);

/** Caja envolvente del distrito, derivada de los propios poligonos. */
export const BBOX_DISTRITO = (() => {
  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;
  for (const { anillo } of ANILLOS) {
    for (const punto of anillo) {
      const lng = punto[0] ?? 0;
      const lat = punto[1] ?? 0;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLng, minLat, maxLng, maxLat };
})();

/**
 * Point-in-polygon por lanzamiento de rayo (ray casting), sobre el anillo exterior.
 * Devuelve la zona que contiene el punto, o `null` si cae fuera del distrito.
 */
export function zonaDe(lat: number, lng: number, anillos = ANILLOS): string | null {
  for (const { zona, anillo } of anillos) {
    if (puntoEnAnillo(lng, lat, anillo)) return zona;
  }
  return null;
}

function puntoEnAnillo(x: number, y: number, anillo: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const xi = anillo[i]?.[0] ?? 0;
    const yi = anillo[i]?.[1] ?? 0;
    const xj = anillo[j]?.[0] ?? 0;
    const yj = anillo[j]?.[1] ?? 0;
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

export function dentroDelDistrito(lat: number, lng: number): boolean {
  return (
    lat >= BBOX_DISTRITO.minLat &&
    lat <= BBOX_DISTRITO.maxLat &&
    lng >= BBOX_DISTRITO.minLng &&
    lng <= BBOX_DISTRITO.maxLng
  );
}

export function metadatosZonas(): Record<string, unknown> {
  return COLECCION_ZONAS.metadata;
}
