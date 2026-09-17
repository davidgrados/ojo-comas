# Licencias de Ojo Comas

Este repositorio mezcla **código** con **datos de terceros**, y cada parte tiene su propia
licencia. La distinción importa: no todo el repositorio es MIT.

## Código fuente — MIT

Se distribuye bajo licencia **MIT** todo el código:

- `frontend/` (HTML, CSS, JavaScript)
- `worker/` (el Worker en TypeScript y sus migraciones)
- `tools/` (los scripts de Python y Node)
- `.github/workflows/`

## Datos geográficos derivados de OpenStreetMap — ODbL

Bajo licencia **Open Database License (ODbL) 1.0**, porque son bases de datos derivadas de
OpenStreetMap:

- `data/comas_distrito.geojson` — derivado directo del límite distrital de OSM.
- `data/comas_zonas.geojson` (y su copia en `frontend/data/`) — derivado: usa el límite de OSM
  como base y los barrios e hitos de OSM como anclas y contenido.
- `data/raw/comas_osm_overpass.json`, `osm_places.json`, `osm_landmarks.json`, `osm_vias.json`,
  `osm_subdivisiones.json`, `osm_vecinos.json` — respuestas crudas de la API Overpass.
- `data/zonas_resumen.json` (y su copia) y `worker/src/zonas.json`, en la medida en que derivan
  de los anteriores.

**Atribución exigida:** © OpenStreetMap contributors — https://www.openstreetmap.org/copyright

Si redistribuyes estos archivos, o una versión modificada de ellos, debes mantener la atribución
y publicar la base de datos derivada bajo ODbL.

## Metadatos de las zonales — documentos oficiales

Los datos de hectáreas, ubicación cardinal, colindancias y equipamientos de las 14 zonales
provienen de la sección de Geografía de la Municipalidad Distrital de Comas
(https://www.municomas.gob.pe/distrito/geografia).

Se citan como **fuente documental**. Los textos oficiales de carácter legislativo, administrativo
o judicial no son objeto de protección por derecho de autor según el **artículo 9 del Decreto
Legislativo N.° 822** (Ley sobre el Derecho de Autor). En `data/raw/geografia_municomas.txt` se
conserva únicamente el **extracto de los datos factuales** de las 14 zonales, no la página web ni
su diseño.

## Mapas base y servicios de terceros

- **Teselas del mapa:** © OpenStreetMap contributors, servidas por la infraestructura de
  OpenStreetmap. Sujeto a la política de uso de la OSM Foundation.
- **Nominatim** (geocodificación inversa): OpenStreetMap Foundation, con su propia política de uso.
- **Cloudflare** (Workers, D1, R2, Pages, Turnstile): servicios sujetos a los términos de
  Cloudflare.
- **Librerías del frontend** (Leaflet, Turf.js, Chart.js, canvas-confetti, Tailwind CSS):
  cargadas por CDN, cada una con su licencia.

## Marcas y nombres

No se usa el escudo, logotipo, nombre oficial ni ninguna marca de la Municipalidad Distrital de
Comas. El nombre «Ojo Comas» identifica a este prototipo ciudadano, que **no tiene relación,
autorización ni respaldo** de la municipalidad ni de ninguna entidad del Estado, ni de
OpenStreetMap Foundation.
